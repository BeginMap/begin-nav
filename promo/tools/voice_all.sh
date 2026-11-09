#!/usr/bin/env bash
# Regenerate the narration with Gemini TTS for all four cuts, refit, re-cue and re-mix.
# Needs GEMINI_API_KEY (or a proxy that injects it), Python deps and a static server on :8765
# serving the repo root (python3 -m http.server 8765 --directory ..).
# Usage: tools/voice_all.sh [voice=Charon]
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE="${1:-Charon}"
for tag in he ru he-30 ru-30; do
  lang="${tag%%-*}"
  edit=full; script=script.json
  if [[ "$tag" == *-30 ]]; then edit=30; script=script30.json; fi
  python3 tools/gemini_vo.py "$lang" "build/vo/$tag" "$VOICE" "$script"
  python3 tools/fit_vo.py "$tag"
  mkdir -p "generated/$tag"
  cp "build/vo/$tag/vo.json" "generated/$tag/vo.json"
  node tools/cues.js "$lang" "generated/$tag/cues.json" "$edit"
  if [[ "$edit" == full ]]; then python3 tools/soundtrack.py "$lang"; else python3 tools/soundtrack.py "$lang" 30; fi
done
echo "Narration updated. Commit generated/ and run: npm run make:all"
