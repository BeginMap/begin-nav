// Dev helper: render the campus from arbitrary cameras (no choreography).
// Usage: node tools/peek.js <outDir> <scale> "x,y,z,lx,ly,lz[,fov]" ... [--t 30] [--q extra]
const { chromium } = require('playwright');
(async () => {
  const a = process.argv.slice(2);
  const outDir = a[0], scale = parseFloat(a[1]);
  const ti = a.indexOf('--t'); const T = ti > 0 ? parseFloat(a[ti + 1]) : 30;
  const qi = a.indexOf('--q'); const Q = qi > 0 ? a[qi + 1] : '';
  const cams = a.slice(2).filter((s, i, arr) => !s.startsWith('--') && !(arr[i - 1] || '').startsWith('--'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (['error', 'warning', 'log'].includes(m.type())) console.log('[page]', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:8765/promo/src/index.html?lang=he&captions=0${Q ? '&' + Q : ''}`);
  await page.evaluate(() => window.__ready);
  let i = 0;
  for (const c of cams) {
    const v = c.split(',').map(Number);
    await page.evaluate(async ([v, T]) => {
      await window.seek(T);
      const { camera, post } = window.__dbg;
      camera.position.set(v[0], v[1], v[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(v[3], v[4], v[5]);
      camera.fov = v[6] || 50; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      document.getElementById('ov').style.display = 'none';
      post.composer.render();
    }, [v, T]);
    await page.screenshot({ path: `${outDir}/peek_${i++}.png` });
  }
  await browser.close();
})();
