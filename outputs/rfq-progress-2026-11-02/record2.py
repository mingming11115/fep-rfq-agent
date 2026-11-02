# -*- coding: utf-8 -*-
"""Record guided demo v2: dashboard -> 我的RFQ -> 原文批阅(批注) -> 应答卡片 -> 知识库详情.
Uses direct hash routes for scenes after entering the workspace (sidebar collapses to icons)."""
import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\video_raw2")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:5173"
PID = "RFQ-001"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(OUT),
            record_video_size={"width": 1280, "height": 720},
        )
        page = await ctx.new_page()

        # scene 1: dashboard
        await page.goto(f"{BASE}/#/dashboard", wait_until="networkidle")
        await page.wait_for_timeout(2600)

        # scene 2: 我的RFQ
        await page.locator("aside >> text=我的 RFQ").first.click(timeout=3000)
        await page.wait_for_timeout(2400)

        # scene 3: enter project -> 原文批阅工作区 (documents)
        await page.locator("text=新能源精密切割产线").first.click(timeout=3000)
        await page.wait_for_timeout(3500)

        # click a clause to show 原文定位联动 + 批注入口
        try:
            await page.locator("text=S1").first.click(timeout=2000)
            await page.wait_for_timeout(2500)
        except Exception:
            pass

        # scene 4: 应答卡片页 (response)
        await page.goto(f"{BASE}/#/response?projectId={PID}", wait_until="networkidle")
        await page.wait_for_timeout(3000)
        try:  # click first requirement/card -> 原文定位
            await page.locator("main tbody tr").first.click(timeout=2000)
            await page.wait_for_timeout(2500)
        except Exception:
            pass

        # scene 5: 知识库
        await page.goto(f"{BASE}/#/knowledge", wait_until="networkidle")
        await page.wait_for_timeout(2800)
        try:
            await page.locator("text=详情").first.click(timeout=2500)
            await page.wait_for_timeout(2600)
        except Exception:
            pass

        await ctx.close()
        await browser.close()
        print("videos:", [f.name for f in OUT.iterdir()])

asyncio.run(main())
