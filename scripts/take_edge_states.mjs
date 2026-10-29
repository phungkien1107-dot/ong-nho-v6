import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : edgePath;

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const artifactDir = 'C:\\Users\\ad\\.gemini\\antigravity\\brain\\fe4e8f65-5036-40a6-b243-06eab4dcb21e';

  // 1. Kiểm tra trạng thái Chưa kết nối Google
  const pageNoAuth = await browser.newPage();
  await pageNoAuth.setViewport({ width: 1280, height: 800 });
  // Chặn API accounts để trả về mảng rỗng và demo=false
  await pageNoAuth.setRequestInterception(true);
  pageNoAuth.on('request', (req) => {
    if (req.url().includes('/api/gsc/status')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, isConfigured: true, isDemo: false }),
      });
    } else if (req.url().includes('/api/gsc/accounts')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, isDemo: false, data: [] }),
      });
    } else {
      req.continue();
    }
  });

  await pageNoAuth.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await pageNoAuth.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const statsBtn = buttons.find((b) => b.textContent && b.textContent.includes('Thống kê'));
    if (statsBtn) statsBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await pageNoAuth.screenshot({ path: path.join(artifactDir, 'gsc_state_chua_ket_noi.png'), fullPage: true });
  console.log('Saved: gsc_state_chua_ket_noi.png');
  await pageNoAuth.close();

  // 2. Kiểm tra trạng thái Dữ liệu dưới ngưỡng (< 100 lượt hiển thị)
  const pageLowData = await browser.newPage();
  await pageLowData.setViewport({ width: 1280, height: 900 });
  await pageLowData.setRequestInterception(true);
  pageLowData.on('request', (req) => {
    if (req.url().includes('/api/gsc/status')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, isConfigured: true, isDemo: false }),
      });
    } else if (req.url().includes('/api/gsc/accounts')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ email: 'test@gmail.com', status: 'active', sites: [{ siteUrl: 'https://site-moi.vn' }] }],
        }),
      });
    } else if (req.url().includes('/api/gsc/analytics')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            siteUrl: 'https://site-moi.vn',
            startDate: '2026-10-01',
            endDate: '2026-10-26',
            dimension: 'query',
            tableRows: [],
            dailyRows: [{ keys: ['2026-10-26'], clicks: 2, impressions: 45, ctr: 4.4, position: 18.2 }],
            deviceRows: [{ keys: ['MOBILE'], clicks: 2, impressions: 45, ctr: 4.4, position: 18.2 }],
            pageRows: [],
            totals: { clicks: 2, impressions: 45, ctr: 4.4, position: 18.2 },
            comparison: null,
          },
        }),
      });
    } else {
      req.continue();
    }
  });

  await pageLowData.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await pageLowData.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const statsBtn = buttons.find((b) => b.textContent && b.textContent.includes('Thống kê'));
    if (statsBtn) statsBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await pageLowData.screenshot({ path: path.join(artifactDir, 'gsc_state_duoi_nguong.png'), fullPage: true });
  console.log('Saved: gsc_state_duoi_nguong.png');
  await pageLowData.close();

  // 3. Kiểm tra trạng thái Một trang không tải được ở Phần 3
  const pageErrorAudit = await browser.newPage();
  await pageErrorAudit.setViewport({ width: 1280, height: 900 });
  await pageErrorAudit.setRequestInterception(true);
  pageErrorAudit.on('request', (req) => {
    if (req.url().includes('/api/fetch-site')) {
      req.respond({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Không thể truy cập máy chủ đích (Connection timed out).' }),
      });
    } else {
      req.continue();
    }
  });

  await pageErrorAudit.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await pageErrorAudit.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const statsBtn = buttons.find((b) => b.textContent && b.textContent.includes('Thống kê'));
    if (statsBtn) statsBtn.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  await pageErrorAudit.screenshot({ path: path.join(artifactDir, 'gsc_state_loi_tai_trang.png'), fullPage: true });
  console.log('Saved: gsc_state_loi_tai_trang.png');
  await pageErrorAudit.close();

  await browser.close();
  console.log('ALL_EDGE_STATES_DONE');
}

run().catch((err) => {
  console.error('Edge states error:', err);
  process.exit(1);
});
