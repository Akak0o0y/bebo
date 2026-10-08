const { chromium } = require('playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.aora-renderer svg').waitFor();
    const svg = await page.locator('.aora-renderer svg').evaluate(el => {
      const clone = el.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', '256');
      clone.setAttribute('height', '256');
      clone.setAttribute('style', 'display:block;width:100%;height:100%');
      return clone.outerHTML;
    });
    fs.writeFileSync('public/bebo.svg', '<!-- Original OpenAgents / Aora artwork. See vendor/aora/PROVENANCE.md -->\n' + svg);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
