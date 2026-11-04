import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const OUT = 'C:/Users/ming/Desktop/新建文件夹/fep-rfq-agent/.workbuddy/browser-test';

const test = async (browser, { dsf, zoom, label }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="如 sr01"]', 'sr01');
  await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2500);
  await page.click('text=知识库');
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("新增")').first().click();
  await page.waitForTimeout(1200);
  // 调整页面缩放: 100%→110→125→150 (Ctrl+加号 3 次), 或复位后不动
  if (!zoom) { await page.keyboard.down('Control'); await page.keyboard.press('Numpad0'); await page.keyboard.up('Control'); }
  else { for (let i = 0; i < zoom; i++) { await page.keyboard.down('Control'); await page.keyboard.press('Equal'); await page.keyboard.up('Control'); await page.waitForTimeout(150); } }
  await page.waitForTimeout(500);
  await page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').first().click();
  await page.waitForTimeout(1200); // 等动画完成
  const r = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
    if (!dd) return { dom: false };
    const rect = dd.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const onScreen = rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh && rect.width > 0;
    return { dom: true, onScreen, rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }, dpr: window.devicePixelRatio, zoom: Math.round(window.outerWidth / window.innerWidth * 100) + '%' };
  });
  console.log(`${label} → ${JSON.stringify(r)}`);
  await page.screenshot({ path: `${OUT}/combined-${label}.png` });
  await ctx.close();
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
await test(browser, { dsf: 1.5, zoom: 3, label: 'DPR1.5-zoom150' });
await test(browser, { dsf: 1.25, zoom: 3, label: 'DPR1.25-zoom150' });
await test(browser, { dsf: 1.5, zoom: 0, label: 'DPR1.5-zoom100' });
await browser.close();
console.log('DONE');
