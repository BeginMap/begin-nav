// Render the promo frame-by-frame into a numbered JPEG sequence (resumable).
// Usage: node render.js <lang> <outDir> [scale=1] [fps=30] [from=0] [to=end] [workers=2] [extraQuery]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [lang = 'he', outDir, scaleS = '1', fpsS = '30', fromS = '0', toS = '74', workersS = '2', extra = ''] = process.argv.slice(2);
const scale = parseFloat(scaleS), fps = parseFloat(fpsS), workers = parseInt(workersS, 10);
const f0 = Math.round(parseFloat(fromS) * fps), f1 = Math.round(parseFloat(toS) * fps);
fs.mkdirSync(outDir, { recursive: true });

async function worker(w) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.log(`[w${w}] pageerror`, e.message));
  await page.goto(`http://localhost:8765/promo/src/index.html?lang=${lang}${extra ? '&' + extra : ''}`);
  await page.evaluate(() => window.__ready);
  let n = 0;
  const t0 = Date.now();
  for (let f = f0 + w; f < f1; f += workers) {
    const file = path.join(outDir, `${String(f).padStart(5, '0')}.jpg`);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) continue;
    await page.evaluate((t) => window.seek(t), f / fps);
    const tmp = file + '.tmp';
    await page.screenshot({ path: tmp, type: 'jpeg', quality: 95 });
    fs.renameSync(tmp, file);
    n++;
    if (n % 25 === 0) console.log(`[w${w}] frame ${f} (${((Date.now() - t0) / n / 1000).toFixed(2)} s/frame)`);
  }
  await browser.close();
  return n;
}

(async () => {
  const t0 = Date.now();
  const counts = await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
  const n = counts.reduce((a, b) => a + b, 0);
  console.log(`done: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s (${((Date.now() - t0) / 1000 / Math.max(1, n)).toFixed(2)} s/frame overall)`);
})();
