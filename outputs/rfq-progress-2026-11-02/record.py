# -*- coding: utf-8 -*-
"""Record a guided demo video of the RFQ prototype:
dashboard -> 我的RFQ -> project workspace -> 知识库 -> detail panel.
"""
import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\video_raw")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:5173"

async def click_nav(page, name):
    for sel in [f"aside >> text={name}", f"text={name}"]:
        try:
            await page.locator(sel).first.click(timeout=2500)
            return True
        except Exception:
            continue
    return False

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

        # scene 2: 我的RFQ list
        await click_nav(page, "我的 RFQ")
        await page.wait_for_timeout(2200)

        # scene 3: enter project workspace
        await page.locator("text=新能源精密切割产线").first.click(timeout=3000)
        await page.wait_for_timeout(2600)
        # scroll a bit to show content
        try:
            await page.mouse.wheel(0, 500)
            await page.wait_for_timeout(1200)
            await page.mouse.wheel(0, -500)
            await page.wait_for_timeout(800)
        except Exception:
            pass
        # click first clause row to show 原文定位联动
        for sel in ["main tbody tr", "main table >> nth=0 >> tbody tr"]:
            try:
                await page.locator(sel).first.click(timeout=1500)
                await page.wait_for_timeout(1800)
                break
            except Exception:
                continue

        # scene 4: knowledge base
        await click_nav(page, "知识库")
        await page.wait_for_timeout(2400)
        # open detail of the knowledge entry
        try:
            await page.locator("text=详情").first.click(timeout=2500)
            await page.wait_for_timeout(2200)
        except Exception:
            pass

        await ctx.close()  # finalize video
        await browser.close()
        print("videos:", [f.name for f in OUT.iterdir()])

asyncio.run(main())
