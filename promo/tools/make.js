// One command: serve the repo, render every frame, encode the final MP4.
// Works on Windows / macOS / Linux with only Node installed (ffmpeg comes from ffmpeg-static).
//
//   npm install && npx playwright install chromium
//   node tools/make.js --lang he --gpu            # fast on a desktop graphics card
//   node tools/make.js --lang ru --gpu
//   node tools/make.js --lang he --edit 30 --gpu  # 30-second cut
//
// Options: --lang he|ru  --edit full|30  --gpu  --headed  --workers N  --scale 1  --fps 30
//          --from S --to S (partial range)  --out file.mp4  --keep (keep frames)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);

const PROMO = path.resolve(__dirname, '..');
const REPO = path.resolve(PROMO, '..');
const lang = opt('lang', 'he');
const edit = opt('edit', 'full');
const gpu = flag('gpu');
const headed = flag('headed');
const workers = parseInt(opt('workers', gpu ? '2' : '2'), 10);
const scale = parseFloat(opt('scale', '1'));
const fps = parseFloat(opt('fps', '30'));
const gen = path.join(PROMO, 'generated', edit === 'full' ? lang : `${lang}-${edit}`);
const cues = JSON.parse(fs.readFileSync(path.join(gen, 'cues.json'), 'utf8'));
const t0s = parseFloat(opt('from', '0'));
const t1s = parseFloat(opt('to', String(cues.total)));
const framesDir = path.join(PROMO, 'build', `frames_${lang}_${edit}`);
const out = path.resolve(opt('out', path.join(PROMO, 'out', `begin-map-promo-${lang}${edit === 'full' ? '' : '-' + edit}.mp4`)));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { resp.writeHead(404); resp.end(); return; }
      resp.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function worker(w, base) {
  const launchArgs = gpu
    ? ['--ignore-gpu-blocklist', '--enable-gpu', '--enable-gpu-rasterization', '--use-angle=' + (process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan')]
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ headless: !headed, args: launchArgs });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.log(`[w${w}] page error:`, e.message));
  const q = flag('fast') ? '' : gpu ? '&q=high' : '';
  await page.goto(`${base}/promo/src/index.html?lang=${lang}&edit=${edit}${q}`);
  await page.evaluate(() => window.__ready);
  if (w === 0) {
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      const d = c && c.getExtension('WEBGL_debug_renderer_info');
      return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log('WebGL renderer:', gl);
    if (gpu && /swiftshader|llvmpipe|software/i.test(gl)) console.log('!! GPU not in use — try adding --headed');
  }
  const f0 = Math.round(t0s * fps), f1 = Math.round(t1s * fps);
  let n = 0;
  const start = Date.now();
  for (let f = f0 + w; f < f1; f += workers) {
    const file = path.join(framesDir, `${String(f).padStart(5, '0')}.jpg`);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) continue;
    await page.evaluate((t) => window.seek(t), f / fps);
    await page.screenshot({ path: file + '.tmp', type: 'jpeg', quality: 95 });
    fs.renameSync(file + '.tmp', file);
    if (++n % 50 === 0) console.log(`[w${w}] frame ${f}/${f1} · ${((Date.now() - start) / n / 1000).toFixed(2)} s/frame`);
  }
  await browser.close();
  return n;
}

// The story cut's 3D people come from the three.js model library (Mixamo characters, not
// redistributed here): download them once into build/cache.
async function ensureModels() {
  const dir = path.join(PROMO, 'build', 'cache');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['Xbot.glb', 'Michelle.glb']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 100000) continue;
    try {
      console.log('Downloading 3D model', f, '...');
      const r = await fetch('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/' + f);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.log('  could not download', f, '-', e.message, '(the page will try again by itself)');
    }
  }
}

(async () => {
  if (edit === 'story') await ensureModels();
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  console.log(`Rendering ${lang}/${edit}: ${t0s}-${t1s}s at ${fps} fps, scale ${scale}, ${workers} worker(s), ${gpu ? 'GPU' : 'CPU'}`);
  const t = Date.now();
  const n = (await Promise.all(Array.from({ length: workers }, (_, w) => worker(w, base)))).reduce((a, b) => a + b, 0);
  srv.close();
  console.log(`Rendered ${n} frames in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  const ffmpeg = require('ffmpeg-static');
  const r = spawnSync(ffmpeg, [
    '-v', 'error', '-y', '-framerate', String(fps), '-start_number', String(Math.round(t0s * fps)), '-i', path.join(framesDir, '%05d.jpg'),
    '-ss', String(t0s), '-i', path.join(gen, 'mix.flac'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'film', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out,
  ], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  if (!flag('keep') && t0s === 0 && t1s >= cues.total) fs.rmSync(framesDir, { recursive: true, force: true });
  console.log('Done →', out);
})();
