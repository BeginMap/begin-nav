"""Tile rendered review frames into one contact sheet. Usage: python3 sheet.py <dir> <out.jpg> [cols] [width]"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

d = Path(sys.argv[1])
out = sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
w = int(sys.argv[4]) if len(sys.argv) > 4 else 360
files = sorted(d.glob("f_*.png"), key=lambda p: float(p.stem.split("_")[-1]))
h = int(w * 16 / 9)
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 26)), "white")
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 26)
    sheet.paste(im, (x, y))
    dr.text((x + 6, y + h + 6), f.stem, fill="black")
sheet.save(out, quality=88)
print(out, len(files))
