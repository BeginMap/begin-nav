#!/bin/bash
# Dev helper: render frames of a cut and make a contact sheet.  review.sh <outDir> <times> [query]
D="${1:?}"; mkdir -p "$D"; rm -f "${D:?}"/f_he_*.png
node "$(dirname "$0")/shot.js" "$D" he 0.4 "$2" "${3:-edit=story}" 2>&1 | grep -iE "error|ready" | head -5
python3 - "$D" <<'PY'
import sys, glob
from PIL import Image, ImageDraw
D = sys.argv[1]
fs = sorted(glob.glob(D + '/f_he_*.png'), key=lambda f: float(f.split('_')[-1][:-4]))
ims = [Image.open(f).resize((216, 384)) for f in fs]
rows = (len(ims) + 5) // 6
S = Image.new('RGB', (216 * 6, 404 * rows), 'white')
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % 6) * 216, (i // 6) * 404
    S.paste(im, (x, y + 20)); ImageDraw.Draw(S).text((x + 4, y + 4), f.split('_')[-1][:-4], fill='black')
S.save(D + '/sheet.jpg', quality=85)
PY
