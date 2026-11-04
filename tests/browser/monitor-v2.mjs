import { chromium } from 'playwright-core';

let browser = null, page = null;
for (let i = 0; i < 30; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); break; }
  catch { await new Promise(r => setTimeout(r, 2000)); }
}
if (!browser) { console.error('无法连接调试端口'); process.exit(1); }
const ctx = browser.contexts()[0];
page = ctx.pages().find(p => p.url().includes('5173')) || ctx.pages()[0] || await ctx.newPage();
console.log('已挂载:', page.url());

await page.evaluate(() => {
  window.__log = [];
  const t = e => {
    const el = e.target;
    const path = el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0,3).join('.') : '');
    window.__log.push(`${e.type} @ ${path} (${Math.round(e.clientX)},${Math.round(e.clientY)}) DPR=${window.devicePixelRatio} 缩放=${Math.round((window.outerWidth / window.innerWidth) * 100)}%`);
  };
  ['pointerdown','mousedown','mouseup','click'].forEach(ty => document.addEventListener(ty, t, true));
  new MutationObserver(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].map(d => d.className.includes('hidden') ? 'dropdown:hidden' : 'dropdown:VISIBLE rect=' + JSON.stringify(d.getBoundingClientRect()));
    if (dd.length) window.__log.push('DOM → ' + dd.join(' | '));
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
}).catch(e => console.log('注入失败(页面可能未加载完):', e.message));

console.log('监听中(60秒)——请在 Chrome 窗口里操作: 知识库 → 新增标准回复 → 点「来源类型」');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  try {
    const log = await page.evaluate(() => window.__log.splice(0));
    if (log.length) log.forEach(l => console.log(`  ${l}`));
  } catch (e) { console.log('页面连接丢失:', e.message); break; }
}
console.log('监听结束');
await browser.close();
