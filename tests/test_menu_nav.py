"""Phone menu: open the menu, tap a module, the app must go there and stay there (v22 iPhone fix).
Safari kept the menu's Back marker when the app used location.replace(), so the app stepped Back to the old screen.
Checks on an iPhone-sized touch screen with an iPhone user agent, for several roles and modules, that:
  - the new screen opens and is still showing after a pause, the menu is closed, no Back marker is left;
  - the phone Back button afterwards goes to the screen before, not to a blank or stuck menu.
Run from the repo root:  python3 tests/test_menu_nav.py   (exit code 1 if anything fails)
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
fails = []


def ok(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for user, start, targets in (("s01", "home", ["schedule", "projects", "requests"]), ("s07", "home", ["schedule", "daily", "projects"]), ("s33", "dashboard", ["admin", "people"])):
            ctx = await new_context(b, phone=True, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, user_agent=UA)
            pg = await ctx.new_page()
            await login(pg, user, start)
            await pg.wait_for_timeout(500)
            prev = start
            for r in targets:
                await pg.locator(".tabbar button[aria-label='Open full menu']").tap(); await pg.wait_for_timeout(350)
                ok(f"{user} menu opens", await pg.evaluate("document.body.classList.contains('nav-open')"))
                link = pg.locator(f'.rail a[href="#{r}"]')
                if not await link.count():
                    ok(f"{user} menu has #{r}", False); continue
                await link.first.tap(); await pg.wait_for_timeout(900)
                st = await pg.evaluate("[location.hash, document.body.classList.contains('nav-open'), !!(history.state && history.state.gidModal)]")
                ok(f"{user} tap {r}: screen is #{r}, menu closed, no Back marker left {st}", st == [f"#{r}", False, False])
                prev = r
            await pg.go_back(); await pg.wait_for_timeout(700)
            h = await pg.evaluate("location.hash")
            ok(f"{user} phone Back goes to the screen before ({h})", h != f"#{prev}" and h != "")
            await ctx.close()
        await b.close()
    print(f"\n{'ALL OK' if not fails else str(len(fails)) + ' failed'}")
    sys.exit(1 if fails else 0)


asyncio.run(main())
