import { chromium } from 'playwright-core';
const BASE = 'http://127.0.0.1:5173';
const PROFILE = process.env.RFQ_CHROME_PROFILE;
if (!PROFILE) { throw new Error('Set RFQ_CHROME_PROFILE to an isolated Chrome test profile.'); }

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--start-maximized', '--profile-directory=Default']
});
const page = ctx.pages().find(p => p.url().includes('5173')) || ctx.pages()[0] || await ctx.newPage();
if (!page.url().includes('5173')) { await page.goto(BASE, { waitUntil: 'domcontentloaded' }); }
await page.waitForTimeout(2000);

await page.evaluate(() => {
  window.__log = [];
  const t = e => {
    const el = e.target;
    const path = el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0,3).join('.') : '');
    window.__log.push(`${e.type} @ ${path} (${Math.round(e.clientX)},${Math.round(e.clientY)}) DPR=${window.devicePixelRatio} zoom=${Math.round(window.outerWidth / window.innerWidth * 100)}%`);
  };
  ['pointerdown','mousedown','mouseup','click'].forEach(ty => document.addEventListener(ty, t, true));
  new MutationObserver(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].map(d => d.className.includes('hidden') ? 'dropdown:hidden' : 'dropdown:VISIBLE rect=' + JSON.stringify(d.getBoundingClientRect()));
    if (dd.length) { window.__log.push('DOM → ' + dd.join(' | ')); }
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
});

console.log('窗口已就绪并开始监听 180 秒。请在这个窗口里: 知识库 → 新增标准回复 → 点「来源类型」');
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  try {
    const log = await page.evaluate(() => window.__log.splice(0));
    if (log.length) { log.forEach(l => console.log(`  ${l}`)); }
  } catch (e) { console.error('读取浏览器监控日志失败', e); break; }
}
console.log('监听结束, 窗口即将关闭');
await ctx.close();
console.log('DONE');
