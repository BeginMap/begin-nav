// Extra Begin Map states: photo popup, chips routes, start-point dialog, intro.
// Usage: node capture_more.js <outDir> <lang>
const { chromium } = require('playwright');
const OUT = process.argv[2];
const LANG = process.argv[3] || 'he';

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((l) => { try { localStorage.setItem('lang', l); } catch (e) {} }, LANG);
  const p = await ctx.newPage();
  const shot = async (pg, n) => { await pg.screenshot({ path: OUT + '/' + LANG + '_' + n + '.png' }); console.log('saved', n); };

  await p.goto('http://localhost:8765/?nointro', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  const btns = await p.$$('button.photobtn:not(.photobtn--cluster)');
  console.log('photo buttons', btns.length);
  if (btns.length) {
    await btns[0].evaluate(e => e.click()); await p.waitForTimeout(2500); await shot(p, '05_photo');
    await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  }
  const cl = await p.$$('button.photobtn--cluster');
  if (cl.length) {
    await cl[cl.length - 1].evaluate(e => e.click()); await p.waitForTimeout(2500); await shot(p, '05_photo_cluster');
    await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  }

  for (const [id, name] of [['#chipToilet', '06_toilet'], ['#chipOffice', '06_office']]) {
    await p.click(id).catch(e => console.log('chip fail', id, e.message));
    await p.waitForTimeout(2500); await shot(p, name);
    await p.click('#btnBack').catch(() => {}); await p.waitForTimeout(800);
  }

  await p.click('#chipOffice').catch(() => {}); await p.waitForTimeout(1500);
  await p.click('#btnChangeStart').catch(e => console.log('no change start', e.message));
  await p.waitForTimeout(1200); await shot(p, '07_here');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.click('#btnBack').catch(() => {}); await p.waitForTimeout(800);
  await p.click('#chipShelter').catch(() => {}); await p.waitForTimeout(2500); await shot(p, '06_shelter');

  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:8765/', { waitUntil: 'load' });
  for (const t of [1, 2, 3, 4, 5]) { await p2.waitForTimeout(900); await shot(p2, '08_intro_' + t); }
  await b.close();
})();
