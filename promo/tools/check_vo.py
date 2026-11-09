"""Round-trip check of voiceover lines with Whisper (I can't listen, so ASR is the ear).

Usage: python3 check_vo.py <lang> <vo_dir> [model]
Prints per-line transcription and character error rate against the script.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import subprocess

import numpy as np
from faster_whisper import WhisperModel

HERE = Path(__file__).resolve().parent
SCRIPT = json.loads((HERE.parent / "vo" / "script.json").read_text(encoding="utf-8"))


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("ё", "е")
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def cer(ref, hyp):
    r, h = norm(ref).replace(" ", ""), norm(hyp).replace(" ", "")
    d = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hc in enumerate(h, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (rc != hc))
    return d[len(h)] / max(1, len(r))


def load16k(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def main():
    lang, vo_dir = sys.argv[1], Path(sys.argv[2])
    model_name = sys.argv[3] if len(sys.argv) > 3 else "large-v3-turbo"
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=4)
    total = []
    for key, text in SCRIPT[lang]["lines"].items():
        segs, info = model.transcribe(load16k(vo_dir / f"{key}.wav"), language=lang, beam_size=5)
        hyp = " ".join(s.text.strip() for s in segs)
        c = cer(text, hyp)
        total.append(c)
        print(f"{key:8s} CER {c:5.1%} | {hyp}")
    print(f"MEAN CER {sum(total) / len(total):.1%}")


if __name__ == "__main__":
    main()
