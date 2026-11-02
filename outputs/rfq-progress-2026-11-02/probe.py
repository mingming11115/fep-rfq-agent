# -*- coding: utf-8 -*-
"""Probe app DOM to find clickable nav items, project cards, knowledge page."""
import json, asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 810})
        await page.goto("http://127.0.0.1:5173/#/dashboard", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        state = await page.evaluate("localStorage.getItem('fep-rfq-app-v1')")
        s = json.loads(state) if state else {}
        print("projects:", [(pr.get("id"), pr.get("name")) for pr in s.get("projects", [])])
        print("actor:", s.get("actorId"), "| role:", s.get("currentRole") or s.get("role"))
        # nav items
        navs = await page.locator("nav a, aside a, [class*=nav] li").all_inner_texts()
        print("nav texts:", [t.strip()[:20] for t in navs if t.strip()][:20])
        await page.screenshot(path=r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\shot_dashboard.png")
        # projects page
        await page.goto("http://127.0.0.1:5173/#/projects", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        cards = await page.locator("main button, main a, main [role=button]").all_inner_texts()
        print("project page buttons:", [t.strip().replace("\n", "/")[:40] for t in cards if t.strip()][:25])
        await page.screenshot(path=r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\shot_projects.png")
        # knowledge page
        await page.goto("http://127.0.0.1:5173/#/knowledge", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        await page.screenshot(path=r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\shot_knowledge.png")
        print("knowledge url:", page.url)
        await browser.close()

asyncio.run(main())
