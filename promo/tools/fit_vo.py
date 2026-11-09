"""Make every VO line fit its slot in the timeline (time-stretch without pitch change).

Usage: python3 fit_vo.py <tag>      (tag = he | ru | he-30 | ru-30)
Reads build/vo/<tag>/{vo.json,*.wav} and the cue times in generated/<tag>/cues.json.
A line may run until 0.2 s before the next line starts (or 0.4 s before the end);
longer lines are sped up with ffmpeg atempo (max 1.18x) and word timings scaled.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
tag = sys.argv[1]
vdir = ROOT / "build" / "vo" / tag
meta = json.loads((vdir / "vo.json").read_text(encoding="utf-8"))
cues = json.loads((ROOT / "generated" / tag / "cues.json").read_text())
at = {k: v for k, v in cues["voAt"].items() if k in meta["lines"]}
order = sorted(at, key=at.get)
total = float(cues["total"])
for i, k in enumerate(order):
    slot = (at[order[i + 1]] - 0.2 if i + 1 < len(order) else total - 0.4) - at[k]
    line = meta["lines"][k]
    if line["dur"] <= slot:
        continue
    f = min(1.18, line["dur"] / slot)
    src = vdir / f"{k}.wav"
    tmp = vdir / f"{k}.tmp.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter:a", f"atempo={f:.4f}", "-ar", "48000", "-ac", "1", str(tmp)], check=True)
    tmp.replace(src)
    for w in line["words"]:
        w["t0"] = round(w["t0"] / f, 3)
        w["t1"] = round(w["t1"] / f, 3)
    old = line["dur"]
    line["dur"] = round(old / f, 3)
    print(f"{k:8s} {old:.2f}s -> {line['dur']:.2f}s (x{f:.2f}, slot {slot:.2f}s){'  STILL LONG' if line['dur'] > slot + 0.05 else ''}")
(vdir / "vo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
print("fitted", tag)
