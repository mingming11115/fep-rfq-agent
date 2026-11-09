import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});
const PROFILE = process.env.RFQ_CHROME_PROFILE;
if (!PROFILE) { throw new Error('Set RFQ_CHROME_PROFILE to an isolated Chrome test profile.'); }

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--start-maximized', '--profile-directory=Default']
});
const page = ctx.pages()[0] || await ctx.newPage();
const logs = [];
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// 扩展状态
const extInfo = await page.evaluate(async () => {
  try {
    const mod = await import('chrome://extensions-internals-page.mjs').catch((error) => { console.error('导入 Chrome 扩展信息模块失败', error); return null; });
    return 'n/a';
  } catch (error) { console.error('读取 Chrome 扩展信息失败', error); return 'n/a'; }
});

await page.fill('input[placeholder="如 sr01"]', 'sr01');
await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
await page.click('button[type="submit"], button:has-text("登录")');
await page.waitForTimeout(2500);
await page.click('text=知识库');
await page.waitForTimeout(1500);
await page.locator('button:has-text("新增")').first().click();
await page.waitForTimeout(1200);

const sel = page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').first();
await sel.hover();
await page.waitForTimeout(300);
await page.mouse.down();
await page.waitForTimeout(500);
const r1 = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
  if (!dd) { return { dom: false }; }
  const r = dd.getBoundingClientRect();
  const cs = getComputedStyle(dd);
  return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && r.height > 0 };
});
console.log('你的配置文件 · 按住未松手:', JSON.stringify(r1));
await page.mouse.up();
await page.waitForTimeout(900);
const r2 = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
  if (!dd) { return { dom: false }; }
  const r = dd.getBoundingClientRect();
  const cs = getComputedStyle(dd);
  return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && r.height > 0 };
});
console.log('你的配置文件 · 松手 900ms 后:', JSON.stringify(r2));
await page.screenshot({ path: `${OUT}/real-profile-result.png` });
console.log('页面错误:', logs.join(' | ') || '(无)');
console.log('这个窗口用的是你的配置（含扩展），保持打开 25 秒，你也可以亲自点一下试试...');
await page.waitForTimeout(25000);
await ctx.close();
console.log('DONE');
