"""Synthesize voiceover lines with Microsoft neural voices (edge-tts).

Usage: python3 make_vo.py <lang> <out_dir> [voice] [rate]
Writes one trimmed 48 kHz mono WAV per line, plus vo.json with durations and
word timings (relative to the trimmed audio) for karaoke captions.
"""
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import edge_tts
import numpy as np

HERE = Path(__file__).resolve().parent
SCRIPT = json.loads((HERE.parent / "vo" / os.environ.get("VO_SCRIPT", "script.json")).read_text(encoding="utf-8"))
SR = 48000


async def synth(text, voice, rate, pitch):
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary",
                               proxy=os.environ.get("HTTPS_PROXY"))
    audio, words = bytearray(), []
    async for ch in com.stream():
        if ch["type"] == "audio":
            audio.extend(ch["data"])
        elif ch["type"] == "WordBoundary":
            words.append({"w": ch["text"], "t0": ch["offset"] / 1e7, "t1": (ch["offset"] + ch["duration"]) / 1e7})
    if not audio:
        raise edge_tts.exceptions.NoAudioReceived("empty")
    return bytes(audio), words


def decode(mp3_bytes):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         input=mp3_bytes, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def trim(x, thr_db=-50, pre=0.02, post=0.08):
    thr = 10 ** (thr_db / 20)
    idx = np.nonzero(np.abs(x) > thr)[0]
    a = max(0, idx[0] - int(pre * SR))
    b = min(len(x), idx[-1] + int(post * SR))
    y = x[a:b].copy()
    fade = int(0.006 * SR)
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y, a / SR


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", str(path)],
                   input=pcm, check=True)


async def main():
    lang = sys.argv[1]
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    cfg = SCRIPT[lang]
    voice = sys.argv[3] if len(sys.argv) > 3 else cfg["voice"]
    rate = sys.argv[4] if len(sys.argv) > 4 else cfg["rate"]
    meta = {"voice": voice, "rate": rate, "lines": {}}
    for key, text in cfg["lines"].items():
        for attempt in range(10):
            try:
                mp3, words = await synth(text, voice, rate, cfg.get("pitch", "+0Hz"))
                break
            except edge_tts.exceptions.NoAudioReceived:
                print(f"  retry {key} ({attempt + 1})")
                await asyncio.sleep(3 + attempt * 3)
        else:
            raise SystemExit(f"TTS failed for line {key!r}")
        x, lead = trim(decode(mp3))
        write_wav(out / f"{key}.wav", x)
        dur = len(x) / SR
        for w in words:
            w["t0"] = round(max(0.0, w["t0"] - lead), 3)
            w["t1"] = round(min(dur, w["t1"] - lead), 3)
        meta["lines"][key] = {"text": text, "dur": round(dur, 3), "words": words}
        print(f"{key:8s} {dur:5.2f}s {len(words):2d}w  {text}")
    (out / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print("total speech", round(sum(v["dur"] for v in meta["lines"].values()), 2))


asyncio.run(main())
