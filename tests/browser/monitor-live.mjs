import { chromium } from 'playwright-core';

let browser = null;
for (let i = 0; i < 20; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); break; }
  catch (error) { console.error('连接 Chrome 调试端口失败', error); await new Promise(r => setTimeout(r, 2000)); }
}
if (!browser) { console.error('无法连接'); process.exit(1); }
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('5173')) || ctx.pages()[0];
console.log('已挂载真实配置会话:', page.url());

await page.evaluate(() => {
  window.__log = [];
  const path = el => el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0,3).join('.') : '');
  const t = e => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    window.__log.push(`${e.type} @ ${path(e.target)} 坐标(${Math.round(e.clientX)},${Math.round(e.clientY)}) 命中:${hit ? path(hit) : '无'} DPR=${window.devicePixelRatio} zoom=${Math.round(window.outerWidth / window.innerWidth * 100)}%`);
  };
  ['pointerdown','mousedown','mouseup','click'].forEach(ty => document.addEventListener(ty, t, true));
  new MutationObserver(() => {
    const dd = [...document.querySelectorAll('.ant-select-dropdown')].map(d => {
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return d.className.includes('hidden') ? 'dropdown:hidden' : `dropdown:VISIBLE rect=(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}) opacity=${cs.opacity} display=${cs.display}`;
    });
    if (dd.length) { window.__log.push('DOM → ' + dd.join(' | ')); }
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
}).catch(e => console.error('注入浏览器监控脚本失败', e));

console.log('监听 90 秒 —— 请在这个 Chrome 窗口里点「来源类型」（多点几次）');
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(3000);
  try {
    const log = await page.evaluate(() => window.__log.splice(0));
    if (log.length) { log.forEach(l => console.log(`  ${l}`)); }
  } catch (e) { console.error('读取浏览器监控日志失败', e); break; }
}
console.log('监听结束（浏览器保持打开）');
try { browser.close(); } catch (error) { console.error('关闭浏览器连接失败', error); }
console.log('DONE');
