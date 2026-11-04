import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const OUT = 'C:/Users/ming/Desktop/新建文件夹/fep-rfq-agent/.workbuddy/browser-test';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--start-maximized'] });
const ctx = await browser.newContext({ viewport: null, noViewport: true });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.fill('input[placeholder="如 sr01"]', 'sr01');
await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
await page.click('button[type="submit"], button:has-text("登录")');
await page.waitForTimeout(2500);
await page.click('text=知识库');
await page.waitForTimeout(1500);
await page.locator('button:has-text("新增")').first().click();
await page.waitForTimeout(1200);

// 模拟真人：hover 后按下、停顿、松开
const sel = page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').first();
await sel.hover();
await page.waitForTimeout(300);
await page.mouse.down();
await page.waitForTimeout(500);
const r1 = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
  if (!dd) return { dom: false };
  const r = dd.getBoundingClientRect();
  const cs = getComputedStyle(dd);
  return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && r.height > 0, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
});
console.log('按住未松手时:', JSON.stringify(r1));
await page.screenshot({ path: `${OUT}/headed-pressed.png` });
await page.mouse.up();
await page.waitForTimeout(900);
const r2 = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
  if (!dd) return { dom: false };
  const r = dd.getBoundingClientRect();
  const cs = getComputedStyle(dd);
  return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && r.height > 0, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
});
console.log('松手 900ms 后:', JSON.stringify(r2));
await page.screenshot({ path: `${OUT}/headed-released.png` });
console.log('页面错误:', logs.join(' | ') || '(无)');
console.log('浏览器保持打开 20 秒供你查看，然后自动关闭...');
await page.waitForTimeout(20000);
await browser.close();
console.log('DONE');
