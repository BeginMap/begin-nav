#!/usr/bin/env bash
# Mux a rendered JPEG sequence with its soundtrack into a social-ready MP4.
# Usage: tools/encode.sh <frames_dir> <mix.wav> <out.mp4> [fps=30]
set -euo pipefail
frames="$1"; audio="$2"; out="$3"; fps="${4:-30}"
ffmpeg -v error -y -framerate "$fps" -i "$frames/%05d.jpg" -i "$audio" \
  -c:v libx264 -preset slow -crf 19 -tune film -pix_fmt yuv420p -profile:v high -level 4.2 \
  -x264-params "keyint=60:min-keyint=30" \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest "$out"
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=nw=1 "$out"
