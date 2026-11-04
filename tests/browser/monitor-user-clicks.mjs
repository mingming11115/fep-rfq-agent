import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('5173')) || ctx.pages()[0];
console.log('已挂载到页面:', page.url());

await page.evaluate(() => {
  window.__log = [];
  const t = e => {
    const el = e.target;
    const path = el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,3).join('.') : '');
    window.__log.push(`${e.type} @ ${path} (${Math.round(e.clientX)},${Math.round(e.clientY)}) DPR=${window.devicePixelRatio}`);
  };
  ['pointerdown','mousedown','mouseup','click'].forEach(ty => document.addEventListener(ty, t, true));
  const mo = new MutationObserver(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].map(d => d.className.includes('hidden') ? 'dropdown:hidden' : 'dropdown:VISIBLE rect=' + JSON.stringify(d.getBoundingClientRect()));
    window.__log.push('DOM → ' + dd.join(' | '));
  });
  mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
});

console.log('开始监听 60 秒 —— 请现在在这个 Chrome 窗口里点「知识库 → 新增标准回复 → 来源类型」');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const log = await page.evaluate(() => { const l = window.__log.splice(0); return l; });
  if (log.length) log.forEach(l => console.log(`  ${l}`));
}
console.log('监听结束');
await browser.close();
