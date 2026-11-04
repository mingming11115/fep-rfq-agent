import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const consoleMsgs = [];
  page.on('console', m => {
    if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', e => consoleMsgs.push(`[pageerror] ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${OUT}/01-login.png` });

  // 登录
  await page.fill('input[placeholder="如 sr01"]', 'sr01');
  await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/02-after-login.png`, fullPage: false });

  // 找页面上第一个 antd Select，点开看下拉面板
  const selects = await page.locator('.ant-select').all();
  console.log(`页面共找到 ${selects.length} 个 antd Select`);
  if (selects.length > 0) {
    await selects[0].scrollIntoViewIfNeeded();
    await selects[0].click();
    await page.waitForTimeout(800);
    const dropdownVisible = await page.locator('.ant-select-dropdown:visible').count();
    const options = await page.locator('.ant-select-dropdown:visible .ant-select-item').count();
    console.log(`点击第 1 个 Select → 下拉面板可见: ${dropdownVisible > 0}, 选项数: ${options}`);
    await page.screenshot({ path: `${OUT}/03-dropdown-open.png` });
    // 打印下拉面板的 computed style，排查透明/被遮挡
    const style = await page.evaluate(() => {
      const dd = document.querySelector('.ant-select-dropdown');
      if (!dd) return null;
      const cs = getComputedStyle(dd);
      const r = dd.getBoundingClientRect();
      return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, childCount: dd.children.length };
    });
    console.log('下拉面板样式:', JSON.stringify(style));
  }

  console.log('--- 控制台错误/警告 ---');
  console.log(consoleMsgs.slice(0, 30).join('\n') || '(无)');

  await browser.close();
};

run().catch(e => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
