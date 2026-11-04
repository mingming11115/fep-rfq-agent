import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});
const PROFILE = process.env.RFQ_CHROME_PROFILE;
if (!PROFILE) throw new Error('Set RFQ_CHROME_PROFILE to an isolated Chrome test profile.');

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--start-maximized', '--profile-directory=Default']
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/rf0-landing.png` });

// 当前登录身份
const identity = await page.evaluate(() => {
  const el = document.querySelector('.rfq-layout-identity, [class*="identity"]');
  return el?.innerText?.slice(0, 80) || '(未找到身份区)';
});
console.log('当前身份区域文本:', JSON.stringify(identity));

await page.click('text=知识库');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/rf1-knowledge.png` });
await page.locator('button:has-text("新增")').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/rf2-dialog.png` });
console.log('弹窗内按钮/字段:');
const modalText = await page.evaluate(() => document.querySelector('.ant-modal, [role="dialog"]')?.innerText?.slice(0, 400) || '(无弹窗)');
console.log(modalText);

const selCount = await page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').count();
console.log('弹窗内 Select 数量:', selCount);
if (selCount > 0) {
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
  console.log('按住未松手:', JSON.stringify(r1));
  await page.screenshot({ path: `${OUT}/rf3-pressed.png` });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const r2 = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
    if (!dd) return { dom: false };
    const r = dd.getBoundingClientRect();
    const cs = getComputedStyle(dd);
    return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && r.height > 0 };
  });
  console.log('松手 900ms 后:', JSON.stringify(r2));
  await page.screenshot({ path: `${OUT}/rf4-released.png` });
}
console.log('窗口保持打开 25 秒，你可以亲自操作...');
await page.waitForTimeout(25000);
await ctx.close();
console.log('DONE');
