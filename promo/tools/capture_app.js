// Captures real Begin Map screens for the promo's 3D phone. Usage: node capture_app.js <outDir> <lang>
const { chromium } = require('playwright');
const OUT = process.argv[2]; const LANG = process.argv[3] || 'he';
const QUERY = { he: 'דולפין', ru: 'Дольфин', en: 'Dolphin' }[LANG];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((l) => { try { localStorage.setItem('lang', l); } catch (e) {} }, LANG);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
  const shot = async (n) => { await p.screenshot({ path: `${OUT}/${LANG}_${n}.png` }); console.log('saved', n); };
  await p.goto('http://localhost:8765/?nointro', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await shot('00_home');
  await p.click('#q'); await p.waitForTimeout(500);
  await shot('01_focus');
  for (let i = 1; i <= QUERY.length; i++) {
    await p.fill('#q', QUERY.slice(0, i)); await p.waitForTimeout(250);
    await shot('02_type' + i);
  }
  await p.waitForTimeout(400);
  await p.click('#roomList li:first-child'); await p.waitForTimeout(2500);
  await shot('03_route');
  // 3D view
  await p.click('#btn3d'); await p.waitForTimeout(9000);
  await shot('04_3d');
  await p.waitForTimeout(4000);
  await shot('04_3d_b');
  await p.click('#btn3d'); await p.waitForTimeout(2000);
  // photo marker: click a camera marker element on the map
  const cams = await p.evaluate(() => [...document.querySelectorAll('#map *')].filter(e => /photo|cam/i.test(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)).slice(0, 5).map(e => e.className.toString()));
  console.log('cams', cams);
  await b.close();
})();
