# Begin Map — 3D promo video

A 74-second vertical (1080×1920, 30 fps) motion-graphics promo for Begin Map, in Hebrew and Russian.
Everything is generated from this repository: the 3D campus is built from the app's own data
(`data/buildings3d.json`, `data/scene3d.json`, `public/maps/plan.jpg`), the phone shows real
screenshots of the app, routes are computed on the app's walkability grid (`data/walk.json`),
and the soundtrack (music + sound design) is synthesised from scratch.

Finished videos: `out/begin-map-promo-{he,ru}.mp4` (74 s) and `out/begin-map-promo-{he,ru}-30.mp4` (30 s).

## Story

| Time | Scene |
|------|-------|
| 0–8 s | Night. Drone dive into the courtyard, windows light up, floating room tags and "?" — *Where's my class?* |
| 8–14 s | Top view: lost paths that dead-end — *everything looks the same* |
| 14–20 s | A beam, the Begin Map pin lands, a shock-wave turns night into day, 3D wordmark |
| 20–26 s | 3D phone: real search for "Dolphin", typing, picking the room |
| 26–32 s | Dive into the screen: the paper map rises into 3D, the route draws itself, the pin lands on Dolphin |
| 32–40 s | "Already inside?" — tap on the map, *you are here*, the route restarts from there |
| 40–48 s | Toilets / office / safe room badges rise over the campus, one tap → route |
| 48–56 s | The app's 3D view + a carousel of real school photos |
| 56–60 s | Hebrew · Russian · English |
| 60–70 s | Golden hour crane shot, tagline, QR code + link |
| 70–74 s | End card with the app creators |

## Render on your own PC (fast, uses the graphics card)

Needs only [Node.js](https://nodejs.org) 18+. In a terminal (PowerShell on Windows):

```bash
git clone -b claude/3d-motion-graphics-video-f1p5g4 https://github.com/BeginMap/begin-nav
cd begin-nav/promo
npm install
npx playwright install chromium
npm run make:he       # -> out/begin-map-promo-he.mp4   (74 s, Hebrew)
npm run make:ru       # -> out/begin-map-promo-ru.mp4   (74 s, Russian)
npm run make:he30     # -> out/begin-map-promo-he-30.mp4 (30 s)
npm run make:ru30     # -> out/begin-map-promo-ru-30.mp4 (30 s)
```

With `--gpu` the renderer switches to high quality (`q=high`): 8-sample motion blur, ground-truth ambient
occlusion (GTAO) and 4K shadow maps — expect a few minutes per cut instead of under one. Add `--fast` to skip it.

The first lines of the log print the WebGL renderer; it should name your GPU (e.g. NVIDIA GeForce RTX 5080).
If it says SwiftShader, add `--headed`: `node tools/make.js --lang he --gpu --headed`.
Voice, music and timings are already in `generated/`, so no Python is needed for rendering.

## Rebuild everything from scratch

Requirements: Node 18+, Python 3.11+, ffmpeg, Playwright with Chromium (software WebGL is fine).

```bash
cd promo
npm install                                   # three, @fontsource/rubik, opentype.js
pip install edge-tts faster-whisper numpy scipy soundfile pyloudnorm pillow
python3 -m http.server 8765 --directory ..    # serve the repo root (keep running)

# 1. app screenshots (optional — already in assets/screens)
node tools/capture_app.js /tmp/shots he && node tools/capture_more.js /tmp/shots he
# 2. routes on the app's walk grid
python3 tools/route.py
# 3. voiceover (Microsoft neural voices) + optional Whisper check
python3 tools/make_vo.py he build/vo/he && python3 tools/check_vo.py he build/vo/he
# 4. cue sheet + soundtrack
node tools/cues.js he build/cues_he.json && python3 tools/soundtrack.py he
# 5. frames + encode
node tools/render.js he build/frames_he 1 30 0 74 2
tools/encode.sh build/frames_he build/audio/he/mix.wav out/begin-map-promo-he.mp4
```

Preview single frames: `node tools/shot.js /tmp/f he 0.5 3,15,22` and open
`http://localhost:8765/promo/src/index.html?lang=he` in a browser, then call `seek(t)` in the console.

Voice lines live in `vo/script.json`; on-screen copy and timings in `src/text.js`;
the per-frame choreography in `src/director.js`.
