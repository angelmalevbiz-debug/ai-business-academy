"""Inspect every ZIP path before copying a narrow, reviewed source selection.

Never runs archive scripts. The supplied original archive is opened read-only.
"""
import hashlib
import json
import stat
from pathlib import Path, PurePosixPath, PureWindowsPath
from zipfile import ZipFile

WORKSPACE = Path(__file__).resolve().parents[1]
ARCHIVE = Path(r"C:\Users\Chavd\Downloads\OptimalEngine-main.zip")
DESTINATION = WORKSPACE / ".reference/optimal-engine"
VENDOR = WORKSPACE / "lib/vendor/optimal-engine"
PREFIX = "OptimalEngine-main/"
CORE = {"http.ts", "error.ts", "types.ts", "retrieval.ts"}
SELECTION = {
    "LICENSE", "NOTICE", "README.md", "AGENTS.md", "OPINIONS.md", "engine-contract.json", "mix.exs",
    "sdks/typescript/README.md", "sdks/typescript/package.json",
    "lib/optimal_engine/memory_core/context_package.ex", "lib/optimal_engine/memory_core/source_package.ex",
    "lib/optimal_engine/memory_core/source_package_service.ex", "lib/optimal_engine/memory_core/scope_envelope.ex",
    "lib/optimal_engine/memory_core/retrieval_coordinator.ex", "lib/optimal_engine/memory_core/scoring_policy.ex",
    "lib/optimal_engine/memory_core/security_labels.ex", "lib/optimal_engine/operating/protocol.ex",
    "lib/optimal_engine/api/operating_api.ex", "lib/optimal_engine/review_queue.ex",
    "desktop/package.json", "desktop/src/lib/components/memory/MemoryGraph.svelte",
    "desktop/src/lib/api/workspace.ts", "desktop/src/lib/stores/workspace.ts",
    "docs/guides/interfaces-and-publishing.md", "docs/guides/versioning-and-releases.md",
}
SELECTION |= {"sdks/typescript/src/" + name for name in CORE}


def checked_path(root, relative):
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("Archive entry escaped the intended extraction directory")
    return target


def main():
    entries = []
    skipped_links = []
    with ZipFile(ARCHIVE) as archive:
        all_info = archive.infolist()
        if len(all_info) > 4000 or sum(item.file_size for item in all_info) > 100_000_000:
            raise ValueError("Archive exceeds reviewed size bounds")
        for item in all_info:
            name = item.filename.replace("\\", "/")
            parts = PurePosixPath(name).parts
            if (PurePosixPath(name).is_absolute() or PureWindowsPath(name).drive or ".." in parts
                    or any(":" in part or part.rstrip(". ") != part for part in parts)
                    or not name.startswith(PREFIX)):
                raise ValueError("Unsafe archive entry; extraction cancelled")
            relative = name.removeprefix(PREFIX)
            checked_path(DESTINATION, relative)
            if stat.S_ISLNK(item.external_attr >> 16):
                if relative in SELECTION:
                    raise ValueError("A selected source is a symlink; extraction cancelled")
                skipped_links.append(relative)
                continue
            if relative not in SELECTION or item.is_dir():
                continue
            if item.file_size > 2_000_000 or item.flag_bits & 1:
                raise ValueError("Selected source entry exceeds reviewed bounds")
            entries.append((relative, archive.read(item)))

    # All entry names have been checked before the first filesystem write.
    manifest = {"sourceArchive": str(ARCHIVE), "archiveSha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
                "archiveEntriesValidated": len(all_info), "license": "Apache-2.0",
                "sourceRepositoryDeclared": "https://github.com/Miosa-osa/OptimalEngine",
                "execution": "No archive scripts, installers, tests or services were executed.", "excludedSymlinks": skipped_links, "files": {}}
    for relative, data in entries:
        target = checked_path(DESTINATION, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != data:
            raise ValueError("Refusing to overwrite a changed reference source")
        target.write_bytes(data)
        manifest["files"][relative] = hashlib.sha256(data).hexdigest()
        if relative in {"LICENSE", "NOTICE"} or relative.startswith("sdks/typescript/src/"):
            vendored = checked_path(VENDOR, Path(relative).name)
            vendored.parent.mkdir(parents=True, exist_ok=True)
            if vendored.exists() and vendored.read_bytes() != data:
                raise ValueError("Refusing to overwrite modified vendored source")
            vendored.write_bytes(data)
    (DESTINATION / "EXTRACTION_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"validatedEntries": len(all_info), "extractedReferenceFiles": len(entries), "vendoredRuntimeFiles": len(CORE), "archiveSha256": manifest["archiveSha256"]}))


if __name__ == "__main__":
    main()
