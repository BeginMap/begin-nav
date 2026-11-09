#!/usr/bin/env bash
# Use narration recorded/generated elsewhere (e.g. one MP3 per cut from a TTS website):
# split it into lines by aligning to the script, fit to the timeline, re-cue and re-mix.
# Usage: tools/import_vo.sh <tag: he|ru|he-30|ru-30> <audio file> [label]
# Needs a static server on :8765 serving the repo root and the Python deps (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
tag="$1"; src="$2"; label="${3:-imported}"
lang="${tag%%-*}"; edit=full; script=script.json
if [[ "$tag" == *-30 ]]; then edit=30; script=script30.json; fi
mkdir -p "build/vo/$tag" "generated/$tag"
ffmpeg -v error -y -i "$src" -af "highpass=f=60" -ar 48000 -ac 1 "build/vo/$tag/_whole.wav"
RESPLIT=1 python3 tools/gemini_vo.py "$lang" "build/vo/$tag" "$label" "$script"
python3 tools/fit_vo.py "$tag"
cp "build/vo/$tag/vo.json" "generated/$tag/vo.json"
node tools/cues.js "$lang" "generated/$tag/cues.json" "$edit"
if [[ "$edit" == full ]]; then python3 tools/soundtrack.py "$lang"; else python3 tools/soundtrack.py "$lang" 30; fi
echo "Imported narration for $tag"
