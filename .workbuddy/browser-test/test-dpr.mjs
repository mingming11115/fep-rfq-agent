import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'C:/Users/ming/Desktop/新建文件夹/fep-rfq-agent/.workbuddy/browser-test';

const testOne = async (browser, { dsf, zoomSteps, label }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dsf });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="如 sr01"]', 'sr01');
  await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2500);

  for (let i = 0; i < zoomSteps; i++) {
    await page.keyboard.down('Control'); await page.keyboard.press('Equal'); await page.keyboard.up('Control');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);

  const sel = page.locator('.ant-select').first();
  await sel.scrollIntoViewIfNeeded();
  await sel.click();
  await page.waitForTimeout(700);

  const check = await page.evaluate(() => {
    const dd = document.querySelector('.ant-select-dropdown');
    if (!dd) return { dom: false };
    const cs = getComputedStyle(dd);
    const r = dd.getBoundingClientRect();
    return {
      dom: true, transform: cs.transform, animClass: dd.className.split(' ').filter(c => /-appear|-enter|motion/.test(c)).join(','),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      dpr: window.devicePixelRatio,
    };
  });
  console.log(`${label} → DOM:${check.dom} rect:${JSON.stringify(check.rect)} transform:${check.transform} 动画类:${check.animClass} DPR:${check.dpr}`);
  await page.screenshot({ path: `${OUT}/case-${label}.png` });
  await context.close();
};

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  // 场景 A：页面缩放 100%，模拟 Windows 系统显示缩放 125% / 150%
  await testOne(browser, { dsf: 1.25, zoomSteps: 0, label: 'DPR125-zoom100' });
  await testOne(browser, { dsf: 1.5, zoomSteps: 0, label: 'DPR150-zoom100' });
  await browser.close();
  console.log('DONE');
};

run().catch(e => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
