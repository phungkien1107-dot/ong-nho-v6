import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : edgePath;

  console.log('Using executable:', executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const artifactDir = 'C:\\Users\\ad\\.gemini\\antigravity\\brain\\fe4e8f65-5036-40a6-b243-06eab4dcb21e';

  const viewports = [
    { name: 'gsc_demo_1280px.png', width: 1280, height: 900 },
    { name: 'gsc_demo_768px.png', width: 768, height: 1024 },
    { name: 'gsc_demo_360px.png', width: 360, height: 800 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });

    // Bấm tab Thống kê
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const statsBtn = buttons.find((b) => b.textContent && b.textContent.includes('Thống kê'));
      if (statsBtn) statsBtn.click();
    });

    await new Promise((r) => setTimeout(r, 3000));

    const outPath = path.join(artifactDir, vp.name);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved screenshot: ${vp.name} (${vp.width}px)`);

    if (vp.width === 1280) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const advBtn = buttons.find((b) => b.textContent && b.textContent.includes('Xem nâng cao'));
        if (advBtn) advBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1200));
      const advPath = path.join(artifactDir, 'gsc_demo_1280px_advanced_expanded.png');
      await page.screenshot({ path: advPath, fullPage: true });
      console.log('Saved screenshot with Xem nâng cao expanded');
    }

    await page.close();
  }

  await browser.close();
  console.log('ALL_SCREENSHOTS_DONE');
}

run().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
