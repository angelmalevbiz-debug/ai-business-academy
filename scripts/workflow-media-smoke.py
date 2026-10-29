"""Actual existing renderer smoke on synthetic fixture; never user media/posts."""
import hashlib
import json
import subprocess
import sys
import threading
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
PUBLISHER = Path(r"C:\Users\Chavd\Desktop\tiktok_publisher\tiktok_publisher")
sys.path.insert(0, str(PUBLISHER))
from tiktok_clip_factory.studio.rendering import render_clip, ENGINE_VERSION
from tiktok_clip_factory.studio.schemas import EditOptions
from tiktok_clip_factory.studio.media import fingerprint
from tiktok_clip_factory.transcribe import Transcript, Word

root = WORKSPACE / ".data/workflow-services/render-smoke"
root.mkdir(parents=True, exist_ok=True)
source = root / "synthetic-source.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=2",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
                "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(source)], check=True, timeout=30)
options = EditOptions(layout="fit", aspect="9:16", caption_style="clean", caption_color="#FFFFFF",
                      motion=False, remove_pauses=False, auto_music=False, broll=False, sound_effects=False, show_hook=False)
words = (Word("Това", .15, .50), Word("е", .55, .72), Word("тест.", .8, 1.5))
clip = {"start": 0, "end": 2, "mode": "custom", "revision": 1, "hook": "", "options": options.model_dump()}
result = render_clip(source, clip, Transcript("bg", 2, words), root / "output", "preview", fingerprint(source),
                     lambda key: None, threading.Event(), lambda *args: None)
video = Path(result["path"]).resolve()
if not video.is_relative_to(root.resolve()):
    raise ValueError("Renderer output escaped synthetic smoke workspace")
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)]))
picture = next(row for row in probe["streams"] if row["codec_type"] == "video")
audio = next(row for row in probe["streams"] if row["codec_type"] == "audio")
subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(video), "-f", "null", "-"], check=True, timeout=30, capture_output=True)
assert picture["width"] == 540 and picture["height"] == 960
assert picture["r_frame_rate"] == "30/1"
assert abs(float(picture["duration"]) - 2) < .05
evidence = {"fixture": "Locally synthesized 2-second test-pattern/sine fixture; captions are authored test timings, not speech recognition.",
            "renderer": "tiktok_clip_factory.studio.rendering.render_clip", "engineVersion": ENGINE_VERSION,
            "publisherWorkersStarted": False, "originalPublisherDataChanged": False, "externalNetwork": False,
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "outputSha256": hashlib.sha256(video.read_bytes()).hexdigest(),
            "outputRelativePath": str(video.relative_to(WORKSPACE)), "width": picture["width"], "height": picture["height"],
            "fps": picture["r_frame_rate"], "duration": float(picture["duration"]), "videoCodec": picture["codec_name"], "audioCodec": audio["codec_name"],
            "decodedWithoutError": True, "captionFiles": [item.name for item in video.parent.glob("*") if item.suffix in {".srt", ".ass"}],
            "notVerified": ["Whisper transcription", "real uploaded footage", "identity/visual quality", "Academy media API and ownership", "provider publishing"]}
target = WORKSPACE / "docs/workflow/media-render-smoke.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
print(json.dumps(evidence))
