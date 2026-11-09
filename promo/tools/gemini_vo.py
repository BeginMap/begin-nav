"""Voiceover with Google Gemini TTS (expressive male narrator), word-aligned with Whisper.

Usage:
  python3 gemini_vo.py <lang> <out_dir> [voice] [script.json]
Key: the API key is read from GEMINI_API_KEY (or injected by a proxy for
generativelanguage.googleapis.com). Writes one trimmed 48 kHz WAV per line + vo.json
in the same format as make_vo.py, so the rest of the pipeline is unchanged.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR = 48000
MODELS = ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"]

STYLE = {
    "he": "Read this Hebrew voice-over like a smart, calm and confident narrator of a premium tech product film. "
          "Warm, clear, intelligent, modern; natural Israeli Hebrew pronunciation; not deep or gravelly, not over-acted; "
          "small pauses at commas and full stops. Text:",
    "ru": "Read this Russian voice-over like a smart, calm and confident narrator of a premium tech product film. "
          "Warm, clear, intelligent, modern; natural native Russian pronunciation; not deep or gravelly, not over-acted; "
          "small pauses at commas and full stops. Text:",
}


def tts(text, lang, voice):
    key = os.environ.get("GEMINI_API_KEY", "")
    body = {
        "contents": [{"parts": [{"text": f"{STYLE[lang]} {text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    last = None
    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        if key:
            req.add_header("x-goog-api-key", key)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.loads(r.read())
                part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
                pcm = np.frombuffer(base64.b64decode(part["data"]), dtype="<i2").astype(np.float32) / 32768
                rate = int(part.get("mimeType", "rate=24000").split("rate=")[-1].split(";")[0])
                return pcm, rate, model
            except urllib.error.HTTPError as e:
                last = f"{model}: HTTP {e.code} {e.read()[:300]!r}"
                if e.code in (429, 500, 503):
                    time.sleep(4 + attempt * 6)
                    continue
                break
            except Exception as e:  # network hiccup
                last = f"{model}: {e}"
                time.sleep(3)
    raise SystemExit(f"Gemini TTS failed: {last}")


def resample(x, sr):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
                          "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"], input=x.tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def trim(x, thr_db=-48, pre=0.03, post=0.1):
    thr = 10 ** (thr_db / 20)
    idx = np.nonzero(np.abs(x) > thr)[0]
    a, b = max(0, idx[0] - int(pre * SR)), min(len(x), idx[-1] + int(post * SR))
    y = x[a:b].copy()
    f = int(0.006 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", str(path)], input=pcm, check=True)


def align(model, x, text, lang):
    """Word timings for the script's words using Whisper word timestamps."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-f", "f32le", "-ar", "16000", "-ac", "1", "-"], input=x.tobytes(), capture_output=True, check=True).stdout
    a16 = np.frombuffer(raw, np.float32)
    segs, _ = model.transcribe(a16, language=lang, word_timestamps=True, beam_size=5)
    hw = [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]
    sw = [w for w in text.replace("...", " ").split() if any(ch.isalnum() for ch in w)]
    words = []
    if len(hw) == len(sw):
        for (t0, t1, _), w in zip(hw, sw):
            words.append({"w": w.strip(".,?!:…"), "t0": round(t0, 3), "t1": round(t1, 3)})
    else:
        # different segmentation: spread script words over the recognised speech span by length
        t0, t1 = (hw[0][0], hw[-1][1]) if hw else (0.0, len(x) / SR)
        total = sum(len(w) for w in sw) or 1
        cur = t0
        for w in sw:
            d = (t1 - t0) * len(w) / total
            words.append({"w": w.strip(".,?!:…"), "t0": round(cur, 3), "t1": round(cur + d, 3)})
            cur += d
    hyp = " ".join(h[2] for h in hw)
    return words, hyp


def main():
    lang, out = sys.argv[1], Path(sys.argv[2])
    voice = sys.argv[3] if len(sys.argv) > 3 else "Charon"
    script = json.loads((HERE.parent / "vo" / (sys.argv[4] if len(sys.argv) > 4 else "script.json")).read_text(encoding="utf-8"))
    out.mkdir(parents=True, exist_ok=True)
    from faster_whisper import WhisperModel
    wm = WhisperModel("large-v3-turbo", device="auto", compute_type="int8")
    meta = {"voice": f"gemini:{voice}", "lines": {}}
    for key, text in script[lang]["lines"].items():
        pcm, rate, model = tts(text, lang, voice)
        x = trim(resample(pcm, rate))
        write_wav(out / f"{key}.wav", x)
        words, hyp = align(wm, x, text, lang)
        meta["lines"][key] = {"text": text, "dur": round(len(x) / SR, 3), "words": words}
        print(f"{key:8s} {len(x) / SR:5.2f}s [{model}] heard: {hyp}")
    (out / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("total", round(sum(v["dur"] for v in meta["lines"].values()), 2), "s")


if __name__ == "__main__":
    main()
