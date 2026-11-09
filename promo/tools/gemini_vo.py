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
MODELS = os.environ.get("TTS_MODELS", "gemini-3.1-flash-tts-preview,gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts").split(",")

STYLE = {
    "he": "Read this Hebrew voice-over like a smart, calm and confident narrator of a premium tech product film. "
          "Warm, clear, intelligent, modern; natural Israeli Hebrew pronunciation; not deep or gravelly, not over-acted; "
          "small pauses at commas and full stops. Text:",
    "ru": "Read this Russian voice-over like a smart, calm and confident narrator of a premium tech product film. "
          "Warm, clear, intelligent, modern; natural native Russian pronunciation; not deep or gravelly, not over-acted; "
          "small pauses at commas and full stops. Text:",
}


def tts(text, lang, voice, extra=""):
    key = os.environ.get("GEMINI_API_KEY", "")
    body = {
        "contents": [{"parts": [{"text": f"{STYLE[lang]}{extra} {text}"}]}],
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


def split_on_pauses(x, n):
    """Cut x into n pieces at the n-1 longest pauses (10 ms frames below -42 dB of peak)."""
    hop = int(0.01 * SR)
    fr = np.sqrt(np.mean(x[: len(x) // hop * hop].reshape(-1, hop) ** 2, axis=1) + 1e-12)
    silent = 20 * np.log10(fr / fr.max()) < -42
    runs, i = [], 0
    while i < len(silent):
        if silent[i]:
            j = i
            while j < len(silent) and silent[j]:
                j += 1
            if i > 0 and j < len(silent):
                runs.append((j - i, i, j))
            i = j
        else:
            i += 1
    cuts = sorted(sorted(runs, reverse=True)[: n - 1], key=lambda r: r[1])
    if len(cuts) < n - 1:
        raise SystemExit(f"only {len(cuts) + 1} phrases found, expected {n}")
    bounds = [0] + [((a + b) // 2) * hop for _, a, b in cuts] + [len(x)]
    print("pauses (s):", [round(c[0] * 0.01, 2) for c in cuts], flush=True)
    return [x[bounds[k]: bounds[k + 1]] for k in range(n)]


def _norm(t, lang):
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    rep = {"ё": "е", "бегин": "begin", "мэп": "map", "мап": "map", "три-дэ": "3d", "מאפ": "מפ", "בגין": "begin"}
    for a, b in rep.items():
        t = t.replace(a, b)
    return re.sub(r"[^\w]", "", t)


def split_by_alignment(model, x, lines, lang):
    """Cut a whole-cut recording into lines using Whisper word timestamps aligned to the script text."""
    import difflib
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-f", "f32le", "-ar", "16000", "-ac", "1", "-"], input=x.tobytes(), capture_output=True, check=True).stdout
    segs, _ = model.transcribe(np.frombuffer(raw, np.float32), language=lang, word_timestamps=True, beam_size=5)
    hw = [(w.start, w.end, _norm(w.word, lang)) for s in segs for w in s.words]
    hstr, hidx = "", []
    for i, (_, _, t) in enumerate(hw):
        hstr += t
        hidx += [i] * len(t)
    sstr, ends = "", []
    for line in lines:
        sstr += "".join(_norm(w, lang) for w in line.split())
        ends.append(len(sstr))
    sm = difflib.SequenceMatcher(None, sstr, hstr, autojunk=False)
    blocks = sm.get_matching_blocks()

    def map_pos(p):  # script char index -> hyp char index (nearest matched)
        best = None
        for a, b, n in blocks:
            if n == 0:
                continue
            if a <= p < a + n:
                return b + (p - a)
            d = min(abs(p - a), abs(p - (a + n - 1)))
            if best is None or d < best[0]:
                best = (d, b if p < a else b + n - 1)
        return best[1]

    hop = int(0.01 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode="same"))
    bounds = [0]
    for e in ends[:-1]:
        hi = map_pos(e - 1)
        wi = hidx[min(hi, len(hidx) - 1)]
        t_end = hw[wi][1]
        t_next = hw[wi + 1][0] if wi + 1 < len(hw) else t_end + 0.3
        a, b = int(t_end * SR), max(int(t_next * SR), int(t_end * SR) + hop)
        cut = a + int(np.argmin(env[a:b])) if b > a else a
        bounds.append(cut)
    bounds.append(len(x))
    return [x[bounds[k]:bounds[k + 1]] for k in range(len(lines))]


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
    items = list(script[lang]["lines"].items())
    if os.environ.get("TTS_BATCH", "1") == "1":
        # one request for the whole cut (free-tier friendly, consistent delivery), then split by text alignment
        wf = out / "_whole.wav"
        if os.environ.get("RESPLIT") == "1" and wf.exists():
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wf), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
            whole, model = np.frombuffer(raw, np.float32).copy(), "cached"
        else:
            pcm, rate, model = tts("\n\n".join(t for _, t in items), lang, voice,
                                   extra=" Read each paragraph as a separate line and leave a clear pause of about one second between paragraphs.")
            whole = resample(pcm, rate)
            write_wav(wf, whole)
        segs = split_by_alignment(wm, whole, [t for _, t in items], lang)
        results = [(seg, SR, model) for seg in segs]
    else:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=int(os.environ.get("TTS_PARALLEL", "4"))) as ex:
            results = [(resample(p, r), SR, m) for p, r, m in ex.map(lambda kv: tts(kv[1], lang, voice), items)]
    for (key, text), (pcm, rate, model) in zip(items, results):
        x = trim(pcm)
        write_wav(out / f"{key}.wav", x)
        words, hyp = align(wm, x, text, lang)
        meta["lines"][key] = {"text": text, "dur": round(len(x) / SR, 3), "words": words}
        print(f"{key:8s} {len(x) / SR:5.2f}s [{model}] heard: {hyp}", flush=True)
    (out / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("total", round(sum(v["dur"] for v in meta["lines"].values()), 2), "s")


if __name__ == "__main__":
    main()
