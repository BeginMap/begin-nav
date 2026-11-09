// Render a few individual frames of the promo for review.
// Usage: node shot.js <outDir> <lang> <scale> <t1,t2,...> [extraQuery]
const { chromium } = require('playwright');

(async () => {
  const [outDir, lang = 'he', scale = '0.5', times = '0', extra = ''] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: parseFloat(scale) });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:8765/promo/src/index.html?lang=${lang}${extra ? '&' + extra : ''}`);
  await page.evaluate(() => window.__ready);
  console.log('ready in', Date.now() - t0, 'ms');
  for (const t of times.split(',').map(Number)) {
    const a = Date.now();
    await page.evaluate((tt) => window.seek(tt), t);
    const b = Date.now();
    await page.screenshot({ path: `${outDir}/f_${lang}_${t.toFixed(2)}.png` });
    console.log(`t=${t} render ${b - a}ms shot ${Date.now() - b}ms`);
  }
  await browser.close();
})();
