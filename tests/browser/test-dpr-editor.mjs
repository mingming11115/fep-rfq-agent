import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});

const testOne = async (browser, dsf, label) => {
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
  await page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').first().click();
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.className.includes('hidden'));
    if (!dd) return { dom: false };
    const rect = dd.getBoundingClientRect();
    const cs = getComputedStyle(dd);
    return { dom: true, visible: cs.visibility === 'visible' && cs.opacity === '1' && rect.height > 0, rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }, dpr: window.devicePixelRatio };
  });
  console.log(`${label} → ${JSON.stringify(r)}`);
  await page.screenshot({ path: `${OUT}/dpr-editor-${label}.png` });
  await ctx.close();
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
await testOne(browser, 1.25, 'DPR125');
await testOne(browser, 1.5, 'DPR150');
await browser.close();
console.log('DONE');
