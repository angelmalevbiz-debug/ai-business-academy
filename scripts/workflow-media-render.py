"""Private Academy render adapter. No Studio service, accounts or publisher worker."""
from __future__ import annotations
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)

def main():
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    root = Path(config["root"]).resolve(strict=True)
    source = Path(config["source"]).resolve(strict=True)
    directory = Path(config["directory"]).resolve(strict=True)
    scratch = Path(config["scratch"]).resolve(strict=True)
    scratch_root = Path(__file__).resolve().parents[1] / ".data" / "media-render-scratch"
    if not scratch.is_relative_to(scratch_root.resolve()) or scratch == scratch_root.resolve():
        raise ValueError("Invalid render scratch path")
    cancel_path = Path(config["cancelFile"]).resolve()
    if not all(path.is_relative_to(root) for path in (source, directory, cancel_path)):
        raise ValueError("Private media scope failed")
    publisher = Path(config["publisher"]).resolve(strict=True)
    sys.path.insert(0, str(publisher))
    # Restrict every original subprocess ffmpeg/probe invocation to private local
    # files and pipes. Never accept arbitrary network URLs or playlists from UI.
    original_popen = subprocess.Popen
    def private_popen(args, *extra, **kwargs):
        if isinstance(args, (list, tuple)) and Path(str(args[0])).stem.lower() in ("ffmpeg", "ffprobe"):
            args = list(args)
            executable = Path(str(args[0])).stem.upper()
            args[0] = os.environ.get(f"WORKFLOW_{executable}", str(args[0]))
            if "-i" in args:
                offset = args.index("-i")
                args[offset:offset] = ["-protocol_whitelist", "file,pipe"]
            else:
                args[1:1] = ["-protocol_whitelist", "file,pipe"]
        return original_popen(args, *extra, **kwargs)
    subprocess.Popen = private_popen
    from tiktok_clip_factory.studio.rendering import render_clip
    from tiktok_clip_factory.studio.schemas import EditOptions
    from tiktok_clip_factory.studio.media import fingerprint
    from tiktok_clip_factory.transcribe import Transcript, Word
    parameters = config["parameters"]
    duration = float(config["duration"])
    start, end = float(parameters["start"]), float(parameters["end"])
    if not 0 <= start < end <= duration + .02 or end - start > 180:
        raise ValueError("Invalid trim")
    aspect = parameters["aspect"]
    if aspect not in ("9:16", "1:1", "16:9"):
        raise ValueError("Invalid aspect")
    caption = str(parameters.get("captionText", ""))[:180]
    # An explicit authored overlay is displayed over the selected interval. This
    # is not generated speech recognition or fabricated transcript timings.
    words = (Word(caption, start + .05, end - .05),) if caption else ()
    options = EditOptions(layout="fit" if parameters["layout"] == "fit" else "center",
        aspect=aspect, caption_style="clean" if caption else "none", caption_color="#FFFFFF",
        motion=False, remove_pauses=False, auto_music=False, broll=False,
        sound_effects=False, show_hook=False)
    clip = {"start": start, "end": end, "mode": "custom", "revision": 1,
            "hook": "", "options": options.model_dump()}
    cancel = threading.Event()
    finished = threading.Event()
    def watch():
        while not finished.wait(.2):
            if cancel_path.exists():
                cancel.set()
    threading.Thread(target=watch, daemon=True).start()
    try:
        # Original libass uses relative subtitle paths. Keep its processing path
        # short on Windows; private owner/attempt paths can exceed MAX_PATH.
        local_source = scratch / "input.mp4"
        shutil.copyfile(source, local_source)
        result = render_clip(local_source, clip, Transcript("bg", duration, words), scratch,
            "export", fingerprint(source), lambda key: None, cancel,
            lambda percent, *_: emit({"progress": max(0, min(99, int(percent)))}))
        output = Path(result["path"]).resolve(strict=True)
        if not output.is_relative_to(scratch) or output.suffix != ".mp4":
            raise ValueError("Invalid renderer output")
        if cancel.is_set():
            raise ValueError("Cancelled")
        final_output = directory / "ready.mp4"
        shutil.copyfile(output, final_output)
        emit({"result": str(final_output.relative_to(root)).replace("\\", "/")})
    finally:
        finished.set()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        emit({"error": "Local video render failed"})
        sys.exit(1)
