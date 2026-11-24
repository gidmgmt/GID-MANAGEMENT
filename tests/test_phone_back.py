"""Phone Back button and layers (v21). Run from the repo root:  python3 tests/test_phone_back.py   (exit code 1 if anything fails)
On a touch phone (390 and 360 wide), English light and Khmer dark, checks that the phone's Back button:
  1. closes the photo viewer first and leaves the window under it open; a second Back closes the window and stays on the screen
  2. the photo viewer also closes when the screen changes
  3. closes the Alerts panel and stays on the screen
  4. closes the slide-out menu and stays on the screen; a menu link followed by Back returns to the screen before
  5. closes one window at a time
and that changing a permission on the phone keeps the table's sideways place.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import new_context, login


async def ui(pg, mode):
    if mode == "km-dark":
        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))"); await pg.reload(); await pg.wait_for_selector(".rail"); await pg.wait_for_timeout(300)


async def hop(pg, *hashes):
    for h in hashes:
        await pg.evaluate(f"location.hash = '{h}'"); await pg.wait_for_timeout(300)


async def back(pg):
    await pg.go_back(); await pg.wait_for_timeout(500)


async def main():
    fails, passes = [], 0

    def check(ok, name):
        nonlocal passes
        if ok: passes += 1
        else: fails.append(name)
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in ((390, 844), (360, 780)):
            for mode in ("en-light", "km-dark"):
                t = f"{w} {mode}"
                ctx = await new_context(b, phone=True, viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
                pg = await ctx.new_page(); errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                # 1, 2 photo viewer over a window
                await login(pg, "s13", "daily"); await ui(pg, mode)
                await hop(pg, "#home", "#daily")
                await pg.locator(".main tr.click").first.tap(); await pg.wait_for_timeout(400)
                await pg.locator("#modal .ph").first.tap(); await pg.wait_for_timeout(300)
                await back(pg)
                lb, md = await pg.locator("#lightbox").count(), await pg.locator("#modal").count()
                check(lb == 0 and md == 1, f"{t} Back closes the photo viewer first (viewer {lb}, window {md})")
                await back(pg)
                md, hs = await pg.locator("#modal").count(), await pg.evaluate("location.hash")
                check(md == 0 and hs == "#daily", f"{t} second Back closes the window and stays on the screen (window {md}, {hs})")
                await pg.locator(".main tr.click").first.tap(); await pg.wait_for_timeout(400)
                await pg.locator("#modal .ph").first.tap(); await pg.wait_for_timeout(300)
                await hop(pg, "#home")
                lb, md = await pg.locator("#lightbox").count(), await pg.locator("#modal").count()
                check(lb == 0 and md == 0, f"{t} photo viewer and window close when the screen changes (viewer {lb}, window {md})")
                # 3 Alerts panel
                await hop(pg, "#requests", "#home")
                await pg.locator(".tabbar .bell-ring").tap(); await pg.wait_for_timeout(400)
                op = await pg.locator("#drawer").count()
                await back(pg)
                dr, hs = await pg.locator("#drawer").count(), await pg.evaluate("location.hash")
                check(op == 1 and dr == 0 and hs == "#home", f"{t} Back closes Alerts and stays on the screen (opened {op}, still open {dr}, {hs})")
                # 4 menu
                await hop(pg, "#requests", "#home")
                await pg.locator(".tabbar button").last.tap(); await pg.wait_for_timeout(400)
                op = await pg.evaluate("document.body.classList.contains('nav-open')")
                await back(pg)
                nav, hs = await pg.evaluate("document.body.classList.contains('nav-open')"), await pg.evaluate("location.hash")
                check(op and not nav and hs == "#home", f"{t} Back closes the menu and stays on the screen (menu {nav}, {hs})")
                await pg.locator(".tabbar button").last.tap(); await pg.wait_for_timeout(400)
                await pg.locator('.rail .nav a[href="#daily"]').tap(); await pg.wait_for_timeout(500)
                nav, hs = await pg.evaluate("document.body.classList.contains('nav-open')"), await pg.evaluate("location.hash")
                check(not nav and hs == "#daily", f"{t} menu link opens the screen and closes the menu (menu {nav}, {hs})")
                await back(pg)
                hs = await pg.evaluate("location.hash")
                check(hs == "#home", f"{t} Back after a menu link returns to the screen before ({hs})")
                # 5 one window at a time
                await hop(pg, "#requests", "#home")
                await pg.locator("#who").tap(); await pg.wait_for_timeout(400)
                await back(pg)
                md, hs = await pg.evaluate("document.querySelectorAll('#modal').length"), await pg.evaluate("location.hash")
                check(md == 0 and hs == "#home", f"{t} Back closes the switch-person window and stays ({md}, {hs})")
                check(not errs, f"{t} no page errors {errs[:2]}")
                await ctx.close()
            # permissions on the phone (English only, once per size)
            ctx = await new_context(b, phone=True, viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
            pg = await ctx.new_page()
            await login(pg, "s33", "admin")
            sc = pg.locator(".card .scroll").filter(has=pg.locator("table.perm")).first
            target = pg.locator("table.perm tbody tr").nth(2).locator("select").last
            await target.scroll_into_view_if_needed()
            await sc.evaluate("e => e.scrollLeft = e.scrollWidth"); await pg.wait_for_timeout(200)
            b0 = await pg.evaluate("() => [Math.round(scrollY), Math.round(document.querySelector('table.perm').closest('.scroll').scrollLeft)]")
            await target.select_option("view" if await target.input_value() != "view" else "none"); await pg.wait_for_timeout(500)
            b1 = await pg.evaluate("() => [Math.round(scrollY), Math.round(document.querySelector('table.perm').closest('.scroll').scrollLeft)]")
            check(b0[1] > 0 and abs(b1[0] - b0[0]) < 40 and abs(b1[1] - b0[1]) < 40, f"{w} changing a permission keeps the table's place ([scrollY, scrollLeft] {b0} -> {b1})")
            await ctx.close()
        await b.close()
    print(f"\n{passes} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)

asyncio.run(main())
