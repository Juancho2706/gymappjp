const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const htmlPath = path.resolve('scripts/output/one-pager.html').replace(/\\/g, '/');
  await page.goto('file:///' + htmlPath, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: 'scripts/output/EVA-Enterprise-One-Pager.pdf',
    width: '210mm',
    height: '297mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  console.log('PDF generado: scripts/output/EVA-Enterprise-One-Pager.pdf');
})();
