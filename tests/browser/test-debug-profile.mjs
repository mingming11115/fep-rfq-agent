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
console.log('初始页面 URL:', page.url());
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
console.log('当前 URL:', page.url());
console.log('标题:', await page.title());
const inputs = await page.locator('input').all();
console.log('input 数量:', inputs.length);
for (const i of inputs.slice(0, 8)) console.log('  placeholder:', JSON.stringify(await i.getAttribute('placeholder')), 'type:', await i.getAttribute('type'));
await page.screenshot({ path: `${OUT}/debug-profile-landing.png` });
await page.waitForTimeout(8000);
await ctx.close();
console.log('DONE');
