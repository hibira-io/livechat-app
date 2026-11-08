// compose.cjs <outroot> <langs...>: brand frame + headline around each raw screenshot, 1320x2868.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [outroot, ...langs] = process.argv.slice(2);
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'heads.json')));
const fonts = { ja: "'Noto Sans CJK JP'", ko: "'Noto Sans CJK KR'", 'zh-TW': "'Noto Sans CJK TC'", 'zh-CN': "'Noto Sans CJK SC'", th: "'Noto Sans Thai'" };
const shots = ['1-list', '2-chat', '3-login'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1320, height: 2868 } });
  for (const l of langs) {
    const dir = path.join(outroot, H[l].asc); fs.mkdirSync(dir, { recursive: true });
    for (const [i, s] of shots.entries()) {
      const img = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'raw', l, s + '.png')).toString('base64');
      await p.setContent(`<html lang="${l}"><body style="margin:0;width:1320px;height:2868px;overflow:hidden;background:radial-gradient(120% 60% at 50% 0%,#F06A6E 0%,#E5484D 55%,#C93A3F 100%);font-family:${fonts[l] ? fonts[l] + ',' : ''}Inter,'Noto Sans',sans-serif">
        <h1 style="margin:0;position:absolute;top:170px;left:110px;right:110px;height:330px;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-size:${l === 'vi' ? 88 : 100}px;line-height:1.22;font-weight:800;letter-spacing:-0.01em;text-wrap:balance">${H[l].h[i].replace(/\n/g, '<br>')}</h1>
        <div style="position:absolute;top:610px;left:110px;width:1100px;height:2390px;border-radius:72px;overflow:hidden;box-shadow:0 40px 120px rgba(80,0,10,.35),0 0 0 14px rgba(255,255,255,.18)"><img src="${img}" style="width:1100px;display:block"></div>
        </body></html>`);
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: path.join(dir, `${i + 1}.jpg`), type: 'jpeg', quality: 90 });
    }
    console.log('composed', l);
  }
  await b.close();
})();
