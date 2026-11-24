"""Settings page on touch screens (v22). Run from the repo root:  python3 tests/test_settings_scroll.py   (exit code 1 if anything fails)
Jack reported that on his Android tablet the Settings page froze while scrolling the permissions table.
On a touch tablet (994 x 1513 and 800 x 1280) and a touch phone (390 x 844), as the System Admin (s33) and the MD (s01), checks that:
  1. a finger swipe scrolls the page from the top to the very bottom, also when the swipe starts inside the permissions table
  2. the permissions table box never scrolls up and down by itself on touch screens (only sideways), so it cannot catch the page
  3. changing a permission keeps the choice, shows Save / Undo, and the page still scrolls afterwards
  4. Refresh (Devices) and Check again (System health, online only) respond and the page still scrolls
  5. opening and closing a window and the phone menu leaves no scroll lock and nothing invisible over the page
  6. a left-over scroll lock or a left-over menu state is cleared by the next touch
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import new_context, login


async def drag(cdp, pg, x, y, dy, steps=10):
    """A real finger swipe (touchstart, touchmove..., touchend). dy > 0 scrolls the page down."""
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for i in range(1, steps + 1):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - dy * i / steps}]})
        await pg.wait_for_timeout(16)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    await pg.wait_for_timeout(250)


MAXY = "Math.max(0, document.documentElement.scrollHeight - innerHeight)"
COVER = """() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!(e && e.closest('.main')); }"""


async def main():
    fails, passes = [], 0

    def check(ok, name):
        nonlocal passes
        if ok: passes += 1
        else: fails.append(name)
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in ((994, 1513), (800, 1280), (390, 844)):
            for user in ("s33", "s01"):
                for mode in (("en", "km-dark") if (w, h) == (994, 1513) and user == "s33" else ("en",)):
                    t = f"{w}x{h} {user} {mode}"
                    ctx = await new_context(b, phone=True, viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
                    pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg); errs = []
                    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                    await login(pg, user, "admin")
                    if mode == "km-dark":
                        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))"); await pg.reload(); await pg.wait_for_selector(".rail"); await pg.wait_for_timeout(400)
                    x, ymid = w // 2, int(h * .7)

                    # 2. the table box does not scroll up and down on touch screens
                    trap = await pg.evaluate("(() => { const p = document.querySelector('.permwrap'); return p ? [p.scrollHeight - p.clientHeight, getComputedStyle(p).overflowY] : [0, 'none']; })()")
                    check(trap[0] <= 1 and trap[1] != "auto", f"{t} permissions box has no up/down scroll of its own ({trap})")

                    # 1. swipe from top to bottom (the finger lands on whatever is in the middle, often the table)
                    maxy = await pg.evaluate(MAXY)
                    for _ in range(30):
                        await drag(cdp, pg, x, ymid, int(h * .45))
                        if await pg.evaluate("scrollY") >= maxy - 2: break
                    y = await pg.evaluate("scrollY")
                    check(y >= maxy - 2, f"{t} swipes reach the bottom of Settings (scrollY {y} of {maxy})")
                    # a swipe that starts on the table goes up again
                    tbl = await pg.evaluate("(() => { const r = document.querySelector('.permwrap').getBoundingClientRect(); return [r.top, r.bottom]; })()")
                    sy = max(int(tbl[0]) + 60, 40)
                    if sy < h - 120:
                        before = await pg.evaluate("scrollY"); await drag(cdp, pg, x, sy, -200); after = await pg.evaluate("scrollY")
                        check(after < before - 50, f"{t} a swipe that starts on the permissions table scrolls the page ({before} -> {after})")

                    # 3. change a permission
                    sel = pg.locator("[data-perm]").nth(4)
                    if await sel.count():
                        key = await sel.get_attribute("data-perm"); old = await sel.input_value(); new = "none" if old != "none" else "view"
                        await sel.scroll_into_view_if_needed(); await sel.tap(); await sel.select_option(new); await pg.wait_for_timeout(300)
                        v = await pg.locator(f'[data-perm="{key}"]').input_value()
                        dirty = await pg.locator(f'td.dirty [data-perm="{key}"]').count()
                        savebtn = await pg.locator(".permcard .card-head .btn.primary").count()
                        check(v == new and dirty == 1 and savebtn == 1, f"{t} permission change kept, marked and Save shown ({v}, dirty {dirty}, save {savebtn})")
                        await pg.evaluate("window.scrollTo(0, 0)"); await pg.wait_for_timeout(200)
                        for _ in range(30):
                            await drag(cdp, pg, x, ymid, int(h * .45))
                            if await pg.evaluate("scrollY") >= await pg.evaluate(MAXY) - 2: break
                        y, maxy = await pg.evaluate("scrollY"), await pg.evaluate(MAXY)
                        check(y >= maxy - 2, f"{t} page still scrolls to the bottom after a change ({y} of {maxy})")
                        undo = pg.locator(".permcard .card-head .btn", has_text="Undo") if mode == "en" else pg.locator(".permcard .card-head .btn").first
                        await undo.scroll_into_view_if_needed(); await undo.tap(); await pg.wait_for_timeout(300)
                        check(await pg.locator(".permcard td.dirty").count() == 0, f"{t} Undo responds")
                    else:
                        check(user != "s33" and user != "s01", f"{t} permission boxes shown to the System Admin and the MD")

                    # 4. Refresh and Check again
                    for label in ("Refresh", "Check again"):
                        bt = pg.locator(".main .card-head .btn", has_text=label)
                        if mode == "en" and await bt.count():
                            n0 = await pg.locator(".main .card").count()
                            await bt.first.scroll_into_view_if_needed(); await bt.first.tap(); await pg.wait_for_timeout(500)
                            check(await pg.locator(".main .card").count() == n0 and not await pg.evaluate("document.documentElement.classList.contains('lock-scroll')"), f"{t} {label} responds, cards still there, page not locked")
                    await pg.evaluate("window.scrollTo(0, 0)"); await pg.wait_for_timeout(150)
                    await drag(cdp, pg, x, ymid, 300)
                    check(await pg.evaluate("scrollY") > 100, f"{t} page scrolls after Refresh")

                    # 5. a window: open, close, scroll
                    row = pg.locator(".main .devices tr.click").first
                    if await row.count():
                        await row.scroll_into_view_if_needed(); await row.tap(); await pg.wait_for_timeout(400)
                        locked = await pg.evaluate("document.documentElement.classList.contains('lock-scroll')")
                        check(await pg.locator("#modal").count() == 1 and locked, f"{t} device window opens and holds the page still")
                        await pg.locator("#modal .x").tap(); await pg.wait_for_timeout(400)
                        locked = await pg.evaluate("document.documentElement.classList.contains('lock-scroll')")
                        check(await pg.locator("#modal").count() == 0 and not locked, f"{t} window closes and the page is unlocked")
                        y0 = await pg.evaluate("scrollY"); await drag(cdp, pg, x, ymid, 300 if y0 < await pg.evaluate(MAXY) - 300 else -300)
                        check(abs(await pg.evaluate("scrollY") - y0) > 100, f"{t} page scrolls after the window closed")
                    # the phone menu
                    if w <= 900:
                        await pg.wait_for_timeout(900)  # let the last swipe's glide stop (a tap during a glide only stops it)
                        await pg.locator(".tabbar button[aria-label='Open full menu']").tap(); await pg.wait_for_timeout(300)
                        check(await pg.evaluate("document.body.classList.contains('nav-open')"), f"{t} menu opens")
                        await pg.touchscreen.tap(w - 20, h // 2); await pg.wait_for_timeout(400)
                        check(not await pg.evaluate("document.body.classList.contains('nav-open')") and await pg.evaluate(COVER), f"{t} tap beside the menu closes it, nothing left over the page")

                    # 6. left-overs are cleared by the next touch
                    await pg.wait_for_timeout(600)
                    await pg.evaluate("window.scrollTo(0, 0)"); await pg.wait_for_timeout(150)  # tap the page heading, not a table row that opens a window
                    await pg.evaluate("document.documentElement.classList.add('lock-scroll')")
                    await pg.touchscreen.tap(x, 10); await pg.wait_for_timeout(200)
                    check(not await pg.evaluate("document.documentElement.classList.contains('lock-scroll')"), f"{t} a stale scroll lock is cleared by the next touch")
                    if w > 900:
                        await pg.evaluate("document.body.classList.add('nav-open')"); await pg.wait_for_timeout(100)
                        await pg.touchscreen.tap(x, 10); await pg.wait_for_timeout(300)
                        check(not await pg.evaluate("document.body.classList.contains('nav-open')"), f"{t} an invisible menu state on a wide screen is cleared")
                    await pg.evaluate("window.scrollTo(0, 0)"); await pg.wait_for_timeout(150)
                    await drag(cdp, pg, x, ymid, 300)
                    check(await pg.evaluate("scrollY") > 100 and await pg.evaluate(COVER), f"{t} page scrolls and the middle of the screen is the page")
                    check(not errs, f"{t} no script errors {errs[:2]}")
                    await ctx.close()
        await b.close()
    print(f"\n{passes} passed, {len(fails)} failed")
    if fails:
        print("\n".join("  - " + f for f in fails)); sys.exit(1)


asyncio.run(main())
