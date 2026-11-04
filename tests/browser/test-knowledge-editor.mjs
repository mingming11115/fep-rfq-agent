import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../../.local/artifacts/browser/', import.meta.url));
mkdirSync(OUT,{recursive:true});

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="如 sr01"]', 'sr01');
  await page.fill('input[placeholder="请输入密码"]', 'Rfq@2026');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2500);

  // 进入 知识库
  await page.click('text=知识库');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/r1-knowledge.png` });

  // 点「新增」按钮（新增标准回复）
  const addBtn = page.locator('button:has-text("新增")').first();
  console.log('新增按钮存在:', await addBtn.count() > 0);
  await addBtn.click();
  await page.waitForTimeout(1200);
  const dialog = page.locator('[role="dialog"]:visible, .ant-modal:visible');
  console.log('弹窗可见:', await dialog.count() > 0);
  await page.screenshot({ path: `${OUT}/r2-dialog.png` });

  // 点弹窗里第一个 Select（来源类型）
  const sel = page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').first();
  console.log('弹窗内 Select 数量:', await page.locator('.ant-modal .ant-select, [role="dialog"] .ant-select').count());
  await sel.click();
  await page.waitForTimeout(900);

  const check = await page.evaluate(() => {
    const dds = [...document.querySelectorAll('.ant-select-dropdown')];
    return dds.map(dd => {
      const cs = getComputedStyle(dd);
      const r = dd.getBoundingClientRect();
      return { cls: dd.className.slice(0, 120), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    });
  });
  console.log('下拉面板状态:', JSON.stringify(check, null, 1));
  const visibleOptions = await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').count();
  console.log('可见选项数:', visibleOptions);
  await page.screenshot({ path: `${OUT}/r3-source-dropdown.png` });

  console.log('--- 控制台错误/警告 ---');
  console.log(logs.slice(0, 20).join('\n') || '(无)');

  await browser.close();
};

run().catch(e => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
