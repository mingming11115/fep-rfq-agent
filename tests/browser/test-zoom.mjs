import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="如 sr01"]', 'sr01');
  await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2500);

  for (const zoom of ['100%', '110%', '125%', '150%', '175%']) {
    // 重置缩放到 100%
    await page.keyboard.down('Control'); await page.keyboard.press('Digit0'); await page.keyboard.up('Control');
    await page.waitForTimeout(300);
    // 按次数放大（Chrome 每次约 +10%）
    const steps = { '100%': 0, '110%': 1, '125%': 2, '150%': 4, '175%': 5 }[zoom];
    for (let i = 0; i < steps; i++) {
      await page.keyboard.down('Control'); await page.keyboard.press('Equal'); await page.keyboard.up('Control');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);

    const sel = page.locator('.ant-select').first();
    await sel.scrollIntoViewIfNeeded();
    await sel.click();
    await page.waitForTimeout(700);
    const check = await page.evaluate(() => {
      const dd = document.querySelector('.ant-select-dropdown');
      if (!dd) return { dom: false };
      const cs = getComputedStyle(dd);
      const r = dd.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const offscreen = r.width === 0 || r.x + r.width < 0 || r.x > vw || r.y > vh || r.y + r.height < 0;
      return { dom: true, opacity: cs.opacity, visibility: cs.visibility, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, offscreen, innerZoom: window.devicePixelRatio };
    });
    console.log(`缩放 ${zoom} → 下拉DOM: ${check.dom}, opacity: ${check.opacity}, 可见性: ${check.visibility}, 位置: ${JSON.stringify(check.rect)}, 超出屏幕: ${check.offscreen}, DPR: ${check.innerZoom}`);
    await page.screenshot({ path: `${OUT}/zoom-${zoom.replace('%', '')}.png` });
  }

  await browser.close();
  console.log('DONE');
};

run().catch(e => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
