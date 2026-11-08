// shot.cjs <lang> <scheme> <outdir> [scale]: App Store screens of the inbox as the app shows it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [lang, scheme, outdir, scale = '3'] = process.argv.slice(2);
const R = path.join(__dirname, 'rec');
const X = JSON.parse(fs.readFileSync(path.join(R, 'texts.json')))[lang];
const cid = fs.readFileSync(path.join(R, 'cid.txt'), 'utf8').trim();
const low = fs.readFileSync(path.join(R, 'low.txt'), 'utf8').trim();
const jar = fs.readFileSync(path.join(R, 'owner.jar'), 'utf8').split('\n').filter((l) => l.includes('hlc_')).map((l) => { const f = l.split('\t'); return { name: f[5], value: f[6], domain: 'chat.localhost', path: '/' }; });
(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: +scale, isMobile: true, hasTouch: true, locale: X.locale, colorScheme: scheme,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HibiraChatApp/ios' });
  await ctx.addCookies(jar);
  await ctx.addInitScript((l) => { try { localStorage.setItem('hlc:locale', l); } catch {} }, X.locale);
  const p = await ctx.newPage();
  await p.goto('http://chat.localhost:8080/inbox');
  await p.locator('button.item').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(outdir, '1-list.png') });
  await p.goto('http://chat.localhost:8080/inbox/' + cid);
  await p.locator('.thread .msgs .msg').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: path.join(outdir, '2-chat.png') });
  await p.goto('http://chat.localhost:8080/inbox/' + low);
  await p.locator('.thread .msgs .msg').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: path.join(outdir, '3-low.png') });
  const c2 = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: +scale, isMobile: true, hasTouch: true, locale: X.locale, colorScheme: scheme,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HibiraChatApp/ios' });
  await c2.addInitScript((l) => { try { localStorage.setItem('hlc:locale', l); } catch {} }, X.locale);
  const q = await c2.newPage();
  await q.goto('http://chat.localhost:8080/login');
  await q.locator('input[type=email]').waitFor({ timeout: 15000 });
  await q.locator('input[type=email]').fill('aiko@sakura-tea.example');
  await q.waitForTimeout(600);
  await q.screenshot({ path: path.join(outdir, '4-login.png') });
  await b.close();
})();
