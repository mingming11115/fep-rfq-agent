# -*- coding: utf-8 -*-
"""Record v3: smart waits — hold each Word-pane scene until the document is actually rendered."""
import asyncio, io, pathlib
from playwright.async_api import async_playwright
from PIL import Image

OUT = pathlib.Path(r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\video_raw3")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:5173"
PID = "RFQ-001"

async def pane_dev(page):
    """Pixel deviation of the Word pane region; loading spinner -> ~3, rendered doc -> >8."""
    shot = await page.screenshot()
    im = Image.open(io.BytesIO(shot)).convert("L")
    w, h = im.size
    pane = im.crop((60, 150, int(w * 0.55), h - 40)).resize((200, 120))
    px = list(pane.getdata())
    mean = sum(px) / len(px)
    return sum(abs(p - mean) for p in px) / len(px)

async def wait_word_loaded(page, timeout_s=30, threshold=7.0):
    for i in range(int(timeout_s / 1.5)):
        dev = await pane_dev(page)
        if dev > threshold:
            return True, i * 1.5
        await page.wait_for_timeout(1500)
    return False, timeout_s

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

        # scene 3: enter project -> documents, WAIT for Word to render
        await page.locator("text=新能源精密切割产线").first.click(timeout=3000)
        ok, waited = await wait_word_loaded(page)
        print("documents word loaded:", ok, f"after {waited:.0f}s")
        await page.wait_for_timeout(2500)
        try:
            await page.locator("text=S1").first.click(timeout=2000)
            await page.wait_for_timeout(2200)
        except Exception:
            pass

        # scene 4: response page, WAIT for Word to render
        await page.goto(f"{BASE}/#/response?projectId={PID}", wait_until="networkidle")
        ok, waited = await wait_word_loaded(page)
        print("response word loaded:", ok, f"after {waited:.0f}s")
        await page.wait_for_timeout(2500)
        try:
            await page.locator("main tbody tr").first.click(timeout=2000)
            await page.wait_for_timeout(2200)
        except Exception:
            pass

        # scene 5: knowledge base + detail drawer
        await page.goto(f"{BASE}/#/knowledge", wait_until="networkidle")
        await page.wait_for_timeout(2800)
        opened = False
        for sel in ["text=详情", "text=K-012"]:
            try:
                await page.locator(sel).first.click(timeout=2000)
                await page.wait_for_timeout(1500)
                if await page.locator("text=审核与维护记录").count() > 0 or \
                   await page.locator("text=版本与审核记录").count() > 0:
                    opened = True
                    break
            except Exception:
                continue
        print("knowledge detail opened:", opened)
        await page.wait_for_timeout(2600)

        await ctx.close()
        await browser.close()
        print("videos:", [f.name for f in OUT.iterdir()])

asyncio.run(main())
