// Dump the director's cue sheet (event times) for the sound design. Usage: node cues.js <lang> <out.json>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [lang = 'he', out, edit = 'full'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 0.25 });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://localhost:8765/promo/src/index.html?lang=${lang}&edit=${edit}`);
  const cues = await p.evaluate(() => window.cues());
  fs.writeFileSync(out, JSON.stringify(cues, null, 1));
  console.log('wrote', out);
  await b.close();
})();
