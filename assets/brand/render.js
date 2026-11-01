const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = process.argv[2];
  const out = process.argv[3];
  const mark = fs.readFileSync(path.join(dir, 'mark.svg'), 'utf8');
  const markData = 'data:image/svg+xml;base64,' + Buffer.from(mark).toString('base64');
  const jobs = [
    // [file, size, html background, mark size ratio, transparent]
    ['icon.png', 1024, 'linear-gradient(135deg,#101D32,#070F1E)', 0.70, false, true],
    ['android-icon-foreground.png', 1024, 'transparent', 0.46, true, false],
    ['android-icon-background.png', 1024, 'linear-gradient(135deg,#101D32,#070F1E)', 0, false, true],
    ['android-icon-monochrome.png', 1024, 'transparent', 0.46, true, false, true],
    ['splash-icon.png', 1024, 'transparent', 0.62, true, false],
    ['favicon.png', 96, 'linear-gradient(135deg,#101D32,#070F1E)', 0.76, false, false],
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size, bg, ratio, transparent, halo, mono] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    const m = Math.round(size * ratio);
    const filter = mono ? 'filter: brightness(0) invert(1);' : '';
    const html = `<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${halo ? `<div style="position:absolute;width:${size*0.9}px;height:${size*0.9}px;border-radius:50%;background:radial-gradient(circle,rgba(40,123,255,0.42),rgba(40,123,255,0) 70%)"></div>` : ''}
      ${m ? `<img src="${markData}" style="position:relative;width:${m}px;height:${m}px;${filter}"/>` : ''}
    </body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: path.join(out, file), omitBackground: transparent });
  }
  await browser.close();
})();
