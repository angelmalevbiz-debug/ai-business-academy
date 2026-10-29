"""Temporary-database tests. Never starts the user's original publisher."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("academy_read_bridge", Path(__file__).resolve().parents[1] / "scripts/workflow-publisher-bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class ReadOnlyBridgeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="academy-bridge-test-")
        root = Path(self.temp.name)
        marker = root / "tiktok_clip_factory/studio/academy.py"
        marker.parent.mkdir(parents=True)
        marker.write_text("# source marker only", encoding="utf-8")
        self.database = root / "data/studio/academy/academy.sqlite3"
        self.database.parent.mkdir(parents=True)
        self.identifier = "a" * 32
        value = {"id": self.identifier, "title": "Our draft", "caption": "Copy to import", "slides": [{"headline": "Input", "body": "One request", "path": "private-file"}], "status": "NEEDS_REVIEW", "token": "PRIVATE_TOKEN", "path": "C:/private"}
        with closing(sqlite3.connect(self.database)) as db:
            db.execute("CREATE TABLE drafts(id TEXT,created_at TEXT,data TEXT)")
            db.execute("CREATE TABLE settings(id INTEGER,data TEXT)")
            db.execute("INSERT INTO drafts VALUES(?,?,?)", (self.identifier, "2026-10-27", json.dumps(value)))
            db.execute("INSERT INTO settings VALUES(1,?)", (json.dumps({"text_model": "qwen3:8b", "account_id": "PRIVATE_ACCOUNT", "api_key": "PRIVATE_KEY"}),))
            db.commit()
        self.reader = bridge.DraftReader(root)

    def tearDown(self):
        self.temp.cleanup()

    def test_reader_enforces_query_only_and_does_not_construct_workers(self):
        with self.reader.connect() as db:
            self.assertEqual(db.execute("PRAGMA query_only").fetchone()[0], 1)
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("DELETE FROM drafts")
        self.assertEqual(len(self.reader.drafts()), 1)

    def test_only_public_copy_fields_leave_the_database(self):
        result = self.reader.draft(self.identifier)
        text = json.dumps(result)
        for private in ["PRIVATE_TOKEN", "C:/private", "private-file", "PRIVATE_ACCOUNT"]:
            self.assertNotIn(private, text)
        self.assertNotIn("PRIVATE_KEY", json.dumps(self.reader.providers()))

    def test_http_surface_blocks_all_mutations_cross_origin_and_unlisted_paths(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.handler_for(self.reader))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(origin + "/api/bootstrap", timeout=3) as response:
                value = json.load(response)
            self.assertEqual(value["bridge_mode"], "read_only")
            self.assertFalse(value["posting_workers_started"])
            for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]:
                with self.assertRaises(HTTPError) as failure:
                    urlopen(Request(origin + "/api/academy/drafts/" + self.identifier + "/publish", data=b"{}", method=method), timeout=3)
                self.assertEqual(failure.exception.code, 405)
                failure.exception.close()
            with self.assertRaises(HTTPError) as failure:
                urlopen(Request(origin + "/api/academy", headers={"Origin": "https://another-site.example"}), timeout=3)
            self.assertEqual(failure.exception.code, 403)
            failure.exception.close()
            for path in ["/api/publishing/accounts", "/api/academy/drafts/../settings", "/api/bootstrap?path=private"]:
                with self.assertRaises(HTTPError) as failure:
                    urlopen(origin + path, timeout=3)
                self.assertIn(failure.exception.code, [400, 404])
                failure.exception.close()
            self.assertEqual(len(self.reader.drafts()), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
