"""Read-only local Academy draft bridge. Never constructs or starts Cutroom workers.

The existing publisher remains authoritative for its media and delivery state.
This process only reads its Academy SQLite database with mode=ro/query_only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

IDENTIFIER = re.compile(r"^[a-f0-9]{32}$")


def clean(value, limit):
    return value[:limit] if isinstance(value, str) else ""


def public_draft(value):
    if not isinstance(value, dict) or not IDENTIFIER.fullmatch(str(value.get("id", ""))):
        return None
    slides = []
    raw_slides = value.get("slides")
    for raw in raw_slides[:20] if isinstance(raw_slides, list) else []:
        if isinstance(raw, dict):
            slides.append({"headline": clean(raw.get("headline") or raw.get("title"), 300),
                           "body": clean(raw.get("body") or raw.get("text"), 1400),
                           "bullets": [clean(item, 300) for item in raw.get("bullets", [])[:8] if isinstance(item, str)]
                           if isinstance(raw.get("bullets"), list) else []})
    return {"id": value["id"], "title": clean(value.get("title"), 180),
            "caption": clean(value.get("caption"), 5000), "slides": slides,
            "updated_at": clean(value.get("updated_at"), 50), "status": clean(value.get("status"), 30)}


class DraftReader:
    def __init__(self, publisher_root: Path):
        self.root = publisher_root.resolve(strict=True)
        self.database = self.root / "data/studio/academy/academy.sqlite3"
        if not (self.root / "tiktok_clip_factory/studio/academy.py").is_file() or not self.database.is_file():
            raise ValueError("The existing publisher project and Academy database are required")
        self.fingerprint = hashlib.sha256(str(self.root).casefold().encode()).hexdigest()

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database.as_uri() + "?mode=ro", uri=True, timeout=3)
        connection.execute("PRAGMA query_only=ON")
        try:
            yield connection
        finally:
            connection.close()

    def drafts(self):
        with self.connect() as connection:
            rows = connection.execute("SELECT data FROM drafts ORDER BY created_at DESC LIMIT 40").fetchall()
        return [copy for row in rows if (copy := public_draft(json.loads(row[0]))) is not None]

    def draft(self, identifier):
        with self.connect() as connection:
            row = connection.execute("SELECT data FROM drafts WHERE id=?", (identifier,)).fetchone()
        return public_draft(json.loads(row[0])) if row else None

    def providers(self):
        with self.connect() as connection:
            row = connection.execute("SELECT data FROM settings WHERE id=1").fetchone()
        settings = json.loads(row[0]) if row else {}
        text_model = clean(settings.get("text_model"), 100)
        # Configuration only. Actual model generation is owned by the Academy
        # workflow runner, and no provider call is made by this read-only bridge.
        return {"text": {"status": "configured_unverified" if text_model else "missing_model"},
                "image": {"status": "manual" if settings.get("provider", "manual") == "manual" else "configured_unverified"}}


def handler_for(reader: DraftReader):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AcademyReadOnlyBridge/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def respond(self, value, status=200):
            data = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def boundary(self):
            expected = f"http://127.0.0.1:{self.server.server_port}"
            return (self.client_address[0] == "127.0.0.1"
                    and self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"
                    and self.headers.get("Origin", expected).rstrip("/") == expected
                    and self.headers.get("Sec-Fetch-Site") != "cross-site")

        def do_GET(self):
            if not self.boundary():
                self.respond({"error": "Only same-origin loopback access is available"}, 403)
                return
            path = urlsplit(self.path)
            if path.query or path.fragment:
                self.respond({"error": "Unsupported request"}, 400)
                return
            try:
                if path.path in {"/", "/api/bootstrap"}:
                    self.respond({"name": "Cutroom", "version": "3.1.0", "worker_mode": "academy",
                                  "bridge_mode": "read_only", "bridge_version": 1,
                                  "source_fingerprint": reader.fingerprint,
                                  "notice": "Read-only draft bridge. All editing, generation and publication workers are stopped.",
                                  "posting_workers_started": False})
                elif path.path == "/api/academy":
                    self.respond({"drafts": reader.drafts(), "providers": reader.providers(),
                                  "worker": {"running": False}, "bridge_mode": "read_only"})
                elif path.path.startswith("/api/academy/drafts/"):
                    identifier = path.path.removeprefix("/api/academy/drafts/")
                    value = reader.draft(identifier) if IDENTIFIER.fullmatch(identifier) else None
                    self.respond(value or {"error": "Unknown draft"}, 200 if value else 404)
                else:
                    self.respond({"error": "Only draft reads are available"}, 404)
            except (OSError, sqlite3.Error, ValueError, TypeError):
                self.respond({"error": "Existing Academy draft data is unavailable"}, 503)

        def deny_write(self):
            self.respond({"error": "Read-only bridge. No jobs, approvals or publications can be started here."}, 405)
            self.close_connection = True

        do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = deny_write

        def log_message(self, format, *args):
            # No headers, content, account information or filesystem paths.
            print(f"bridge request status={args[1] if len(args) > 1 else 'unknown'}", flush=True)

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publisher-root", required=True, type=Path)
    parser.add_argument("--port", type=int, choices=[8881], default=8881)
    options = parser.parse_args()
    reader = DraftReader(options.publisher_root)
    server = ThreadingHTTPServer(("127.0.0.1", options.port), handler_for(reader))
    print("Read-only Academy draft bridge ready; no publisher workers started.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
