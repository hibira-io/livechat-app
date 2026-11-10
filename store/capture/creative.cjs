// creative.cjs <langs...>: App Store product page header (3840x1646) and
// search results card (3000x2000) per language, from the real in-app
// screens inside ../ios/screenshots and the headlines in heads.json.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const langs = process.argv.slice(2);
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'heads.json')));
const ROOT = path.join(__dirname, '..', 'ios');
const fonts = { ja: "'Noto Sans CJK JP'", ko: "'Noto Sans CJK KR'", 'zh-TW': "'Noto Sans CJK TC'", 'zh-CN': "'Noto Sans CJK SC'", th: "'Noto Sans Thai'" };
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', '..', 'www', 'icon.png')).toString('base64');
const CSS = `
  body{margin:0;overflow:hidden;position:relative;color:#fff;background:radial-gradient(90% 120% at 15% 10%,#F06A6E 0%,#E5484D 50%,#B8343A 100%)}
  .glow{position:absolute;inset:0;background:radial-gradient(40% 50% at 85% 20%,rgba(255,255,255,.18),transparent 70%),radial-gradient(35% 45% at 60% 100%,rgba(120,0,20,.35),transparent 70%)}
  .brand{display:flex;align-items:center;gap:28px;font-weight:800;letter-spacing:-0.01em}
  .brand img{border-radius:22%;box-shadow:0 12px 40px rgba(80,0,10,.35)}
  h1{margin:0;font-weight:800;letter-spacing:-0.015em;line-height:1.12;text-wrap:balance}
  .phone{position:absolute;border-radius:52px;overflow:hidden;background:#fff;box-shadow:0 50px 140px rgba(60,0,10,.45),0 0 0 12px rgba(255,255,255,.2)}
  .phone img{display:block;width:100%}`;
(async () => {
  const b = await chromium.launch();
  for (const l of langs) {
    const asc = H[l].asc;
    // The phone screen inside each framed screenshot: 1100x2390 at (110, 610).
    const p0 = await b.newPage({ viewport: { width: 1320, height: 2868 } });
    const shots = [];
    for (const n of [1, 2, 3]) {
      const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'screenshots', asc, `${n}.jpg`)).toString('base64');
      await p0.setContent(`<body style="margin:0"><img src="${src}"></body>`);
      const buf = await p0.screenshot({ type: 'png', clip: { x: 110, y: 610, width: 1100, height: 2390 } });
      shots.push('data:image/png;base64,' + buf.toString('base64'));
    }
    await p0.close();
    const font = `${fonts[l] ? fonts[l] + ',' : ''}Inter,'Noto Sans',sans-serif`;
    const head = H[l].h[0].replace(/\n/g, '<br>');
    const jobs = [
      { dir: 'header', w: 3840, h: 1646, html: `
        <div class="glow"></div>
        <div style="position:absolute;left:230px;top:0;bottom:0;width:1650px;display:flex;flex-direction:column;justify-content:center;gap:70px">
          <div class="brand" style="font-size:96px"><img src="${icon}" width="170" height="170">Hibira Chat</div>
          <h1 style="font-size:${l === 'vi' || l === 'en' ? 150 : 170}px">${head}</h1>
        </div>
        <div class="phone" style="left:2120px;top:380px;width:470px"><img src="${shots[0]}"></div>
        <div class="phone" style="left:2680px;top:300px;width:470px"><img src="${shots[1]}"></div>
        <div class="phone" style="left:3240px;top:440px;width:470px"><img src="${shots[2]}"></div>` },
      { dir: 'search', w: 3000, h: 2000, html: `
        <div class="glow"></div>
        <div style="position:absolute;left:200px;top:0;bottom:0;width:1300px;display:flex;flex-direction:column;justify-content:center;gap:70px">
          <div class="brand" style="font-size:96px"><img src="${icon}" width="170" height="170">Hibira Chat</div>
          <h1 style="font-size:${l === 'vi' || l === 'en' ? 140 : 160}px">${head}</h1>
        </div>
        <div class="phone" style="left:1690px;top:460px;width:520px"><img src="${shots[0]}"></div>
        <div class="phone" style="left:2300px;top:360px;width:520px"><img src="${shots[1]}"></div>` },
    ];
    for (const j of jobs) {
      const p = await b.newPage({ viewport: { width: j.w, height: j.h } });
      await p.setContent(`<html lang="${l}"><head><style>${CSS}</style></head><body style="width:${j.w}px;height:${j.h}px;font-family:${font}">${j.html}</body></html>`);
      await p.evaluate(() => document.fonts.ready);
      fs.mkdirSync(path.join(ROOT, j.dir), { recursive: true });
      await p.screenshot({ path: path.join(ROOT, j.dir, `${asc}.png`) });
      await p.close();
    }
    console.log('creative', l);
  }
  await b.close();
})();
