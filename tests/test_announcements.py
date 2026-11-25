"""v23 Announcements: the System Admin writes a message to everyone or to chosen departments / people.
Run from the repo root:  python3 tests/test_announcements.py     (about 1 minute; exit code 1 if anything fails)
Screenshots go to $GID_SHOTS (default /tmp/gid-shots/v23), never into the repository."""
import asyncio, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

SHOTS = os.environ.get("GID_SHOTS", "/tmp/gid-shots/v23")
os.makedirs(SHOTS, exist_ok=True)
DB = "JSON.parse(localStorage.getItem('gid-demo-v6'))"


async def shot(pg, name, full=False):
    await pg.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)


async def compose(pg, title, message, important, dept=None):
    await pg.locator(".card.ann .btn.primary").click(); await pg.wait_for_selector("#mform")
    await pg.fill("#mform input[name=title]", title)
    await pg.fill("#mform textarea[name=message]", message)
    await pg.select_option("#mform select[name=importance]", "Important" if important else "Normal")
    if dept:
        await pg.select_option("#mform select[name=audience]", "some")
        await pg.locator(f'.pp-all[data-g="{dept}"]').click()
    await pg.wait_for_timeout(150)


async def banners(pg):
    return await pg.locator(".main .annc").count()


async def main():
    out = []
    ok = lambda k, v: out.append((k, bool(v)))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await new_context(b)
        pg = await ctx.new_page()
        errs, dialogs = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        async def on_dialog(d):
            dialogs.append(d.message); await d.accept()
        pg.on("dialog", lambda d: asyncio.ensure_future(on_dialog(d)))

        # who may write
        await login(pg, "s07", "admin")
        ok("s07 (site engineer) cannot see the Announcements card", await pg.locator(".card.ann").count() == 0)
        await login(pg, "s01", "admin")
        ok("MD (owner: may send) sees the Announcements card in Settings", await pg.locator(".card.ann").count() == 1)
        await login(pg, "s35", "admin")
        ok("HR (owner: may send) sees the Announcements card", await pg.locator(".card.ann").count() == 1)
        ok("HR sees only announcements in Settings (no permissions, devices or activity log)", await pg.locator(".main .card").count() == 1 and "Activity log" not in await pg.inner_text(".main"))
        await login(pg, "s30", "admin")
        ok("backup admin (s30) sees the Announcements card", await pg.locator(".card.ann .btn.primary").count() == 1)

        # 1. Important, to everyone
        await login(pg, "s33", "admin")
        await compose(pg, "Office closed <Friday>", "Line one\nLine two <img src=x onerror=alert(1)>\n\nThanks", True)
        await shot(pg, "ann-compose-desktop")
        ok("preview shows the message with line breaks", "Line one\nLine two" in await pg.inner_text("#modal .ann-prev .annc-m"))
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(700)
        n_all = await pg.evaluate(f"{DB}.staff.filter(s=>!s.left_on).length") - 1
        ok(f"confirm asks 'Send to {n_all} people?'", dialogs and dialogs[-1] == f"Send to {n_all} people?")
        a1 = await pg.evaluate(f"{DB}.announcements[0]")
        notes1 = await pg.evaluate(f"{DB}.notifications.filter(n=>n.tbl==='announcements'&&n.record_id==='{a1['id']}')")
        ok("announcement saved (Sent, Important, audience all)", a1["status"] == "Sent" and a1["importance"] == "Important" and a1["audience"] == {"all": True})
        ok("one alert per active staff member, not the sender", len(notes1) == n_all and len(a1["recipients"]) == n_all and "s33" not in a1["recipients"]
           and all(n["title"] == a1["title"] and n["body"] == a1["message"] and n["actor_id"] == "s33" for n in notes1))

        # 2. Normal, to the Finance department
        await compose(pg, "Finance team meeting", "Bring the November bills.", False, dept="FIN")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(700)
        ok("confirm asks 'Send to 5 people?'", dialogs[-1] == "Send to 5 people?")
        a2 = await pg.evaluate(f"{DB}.announcements.find(a=>a.title==='Finance team meeting')")
        ok("department saved as a department", a2["audience"] == {"groups": ["FIN"], "staff": []} and sorted(a2["recipients"]) == ["s34", "s35", "s36", "s37", "s38"])
        await shot(pg, "ann-history-desktop")

        # recipients see the banners
        await login(pg, "s36", "home")
        ok("s36 (Finance) sees 2 banners on My work", await banners(pg) == 2)
        ok("message text is escaped (no <img> in the banner)", await pg.locator(".main .annc img").count() == 0 and "<img src=x" in await pg.inner_text(".main .annc.imp .annc-m"))
        ok("line breaks kept in the banner", "Line one\nLine two" in await pg.inner_text(".main .annc.imp .annc-m"))
        await shot(pg, "ann-banner-desktop")
        await pg.locator(".main .annc.imp .btn.primary", has_text="Got it").click(); await pg.wait_for_timeout(400)
        ok("Got it hides that banner", await banners(pg) == 1 and await pg.locator(".main .annc.imp").count() == 0)
        await pg.reload(); await pg.wait_for_selector(".rail")
        ok("still hidden after reload", await banners(pg) == 1)

        await login(pg, "s07", "home")
        ok("s07 sees only the Everyone banner (not the Finance one)", await banners(pg) == 1 and await pg.locator(".main .annc.imp").count() == 1)
        # open it from Alerts
        await pg.click("#bell"); await pg.wait_for_selector("#drawer")
        await pg.locator("#drawer li", has_text="Office closed").first.click(); await pg.wait_for_selector("#modal")
        ok("Alerts opens the announcement in a window", await pg.inner_text("#modal h3") == "Announcement" and "Line two <img" in await pg.inner_text("#modal .annc-m"))
        await pg.click("#modal .x"); await pg.wait_for_timeout(300)
        ok("opening it marks it read (banner gone)", await banners(pg) == 0)

        await login(pg, "s01", "dashboard")
        ok("MD sees the banner on the Dashboard", await pg.locator(".main .annc.imp").count() == 1)

        # history: read count and Withdraw
        await login(pg, "s33", "admin")
        txt = await pg.inner_text(".card.ann")
        ok(f"history shows read count 2 / {n_all}", f"2 / {n_all}" in txt)
        await pg.locator(".card.ann tr", has_text="Office closed").locator(".btn.danger").click(); await pg.wait_for_timeout(600)
        ok("Withdraw asks first", "Withdraw this announcement?" in dialogs[-1])
        st = await pg.evaluate(f"{DB}.announcements.find(a=>a.id==='{a1['id']}').status")
        ok("withdrawn, not deleted", st == "Withdrawn" and await pg.evaluate(f"{DB}.announcements.length") == 2)
        await login(pg, "s38", "home")
        ok("after Withdraw: s38 sees only the Finance banner", await banners(pg) == 1 and await pg.locator(".main .annc.imp").count() == 0)
        await login(pg, "s07", "home")
        ok("after Withdraw: s07 sees no banner", await banners(pg) == 0)
        ok("no page errors (desktop)", not errs)
        await ctx.close()

        # Khmer + dark, phone 390 x 844: no sideways scroll
        ctx = await new_context(b, phone=True, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs2 = []
        pg.on("pageerror", lambda e: errs2.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await login(pg, "s33", "admin")
        await compose(pg, "Safety week", "Wear your helmet.\nEvery day on every site.", True)
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(700)
        for lang in ("en", "km"):
            theme = "dark" if lang == "km" else "light"
            await login(pg, "s33", "admin")
            await pg.evaluate(f"localStorage.setItem('gid-ui', JSON.stringify({{theme:'{theme}',lang:'{lang}'}}))"); await pg.reload(); await pg.wait_for_selector(".rail")
            await pg.locator(".card.ann").scroll_into_view_if_needed()
            wide = await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            ok(f"phone {lang}: Settings with Announcements has no sideways scroll", not wide)
            await shot(pg, f"ann-history-phone-{lang}", True)
            await pg.locator(".card.ann .btn.primary").click(); await pg.wait_for_selector("#mform")
            await pg.select_option("#mform select[name=audience]", "some"); await pg.wait_for_timeout(200)
            await pg.fill("#mform input[name=title]", "Test"); await pg.fill("#mform textarea[name=message]", "Long line " * 30)
            wide = await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#modal .modal *')].some(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed')")
            ok(f"phone {lang}: compose window fits the screen", not wide)
            await shot(pg, f"ann-compose-phone-{lang}")
            await pg.click("#modal .x")
            await login(pg, "s13", "home")
            await pg.evaluate(f"localStorage.setItem('gid-ui', JSON.stringify({{theme:'{theme}',lang:'{lang}'}}))"); await pg.reload(); await pg.wait_for_selector(".rail")
            ok(f"phone {lang}: s13 sees the banner", await banners(pg) == 1)
            wide = await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            ok(f"phone {lang}: My work with banner has no sideways scroll", not wide)
            if lang == "km":
                ok("Khmer: Got it button translated", "យល់ហើយ" in await pg.inner_text(".main .annc"))
                ok("Khmer: the message itself is not translated", "Wear your helmet." in await pg.inner_text(".main .annc"))
            await shot(pg, f"ann-banner-phone-{lang}")
        ok("no page errors (phone)", not errs2)
        await ctx.close()
        await b.close()
    bad = 0
    for k, v in out:
        print(("OK   " if v else "FAIL ") + k)
        bad += not v
    print("screenshots:", SHOTS)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
