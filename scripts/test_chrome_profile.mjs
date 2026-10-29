import puppeteer from 'puppeteer-core';

async function test(profile) {
  const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\ad\\AppData\\Local\\Google\\Chrome\\User Data Puppeteer';

  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      userDataDir,
      args: [`--profile-directory=${profile}`, '--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://github.com', { waitUntil: 'networkidle2', timeout: 30000 });
    const isLoginGitHub = await page.evaluate(() => !document.querySelector('a[href="/login"]'));
    console.log(`Profile [${profile}] - GitHub URL: ${page.url()} - LoggedIn: ${isLoginGitHub}`);
    await browser.close();
  } catch (err) {
    console.error(`Profile [${profile}] ERROR:`, err.message);
  }
}

async function main() {
  await test('Default');
  await test('Profile 1');
}

main();
