"""Schedule & Meetings (v22): create a meeting with the attendee picker, who sees it, alerts, public holidays in red,
items linked from other modules, phone + desktop, English + Khmer dark, no sideways scrolling on the phone.
Run from the repo root:  python3 tests/test_schedule.py        (exit code 1 if anything fails)
Optional: GID_SHOTS=/some/folder saves screenshots there (keep them out of the repo).
"""
import asyncio, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

SHOTS = os.environ.get("GID_SHOTS", "")
TITLE = "Coordination meeting MEP test"


async def shot(pg, name, full=True):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        await pg.screenshot(path=os.path.join(SHOTS, name), full_page=full)


async def db(pg):
    return json.loads(await pg.evaluate("localStorage.getItem('gid-demo-v6')"))


async def tab(pg, label):
    await pg.locator(".main .tabs .tab", has_text=label).first.click()
    await pg.wait_for_timeout(250)


async def goto_month(pg, ym):
    """Open the month view and step to year-month 'YYYY-MM' with the arrows."""
    await tab(pg, "Month")
    for _ in range(30):
        cur = await pg.evaluate("document.querySelector('.cal-grid .cal-d:not(.other)').dataset.date.slice(0,7)")
        if cur == ym:
            return True
        await pg.click('.cal-bar button[aria-label="%s"]' % ("Next month" if cur < ym else "Previous month"))
        await pg.wait_for_timeout(150)
    return False


async def overflow(pg):
    return await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")


async def main():
    out = []
    ok = lambda name, cond: out.append((name, bool(cond)))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await new_context(b)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        # 1. PM s02 creates a meeting tomorrow on DEMO-101, picks s07 by search and the whole QS department
        await login(pg, "s02", "schedule")
        tomorrow = await pg.evaluate("(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); })()")
        await pg.locator(".main .btn.primary", has_text="New event").click()
        await pg.wait_for_timeout(300)
        await pg.fill('#mform input[name="title"]', TITLE)
        await pg.select_option('#mform select[name="type"]', "Meeting")
        await pg.fill('#mform input[name="date"]', tomorrow)
        await pg.fill('#mform input[name="start_time"]', "08:00")
        await pg.fill('#mform input[name="end_time"]', "09:00")
        await pg.select_option('#mform select[name="project_id"]', "p1")
        await pg.fill(".pp-q", "sothavan")
        await pg.wait_for_timeout(150)
        visible = await pg.locator(".pp-row:visible").count()
        ok("picker search finds one person for 'sothavan'", visible == 1)
        await pg.locator('.pp-row:visible input[value="s07"]').check()
        await pg.fill(".pp-q", "")
        await pg.dispatch_event(".pp-q", "input")
        await pg.click('.pp-all[data-g="QS"]')
        count = await pg.inner_text(".pp-count")
        ok("whole QS department + s07 = 4 selected (" + count + ")", count.startswith("4 "))
        ok("selected people shown as chips", await pg.locator(".pp-chip").count() == 4)
        await shot(pg, "01-new-meeting-desktop.png", full=False)
        await pg.click("#mform button[type=submit]")
        await pg.wait_for_timeout(1200)
        d = await db(pg)
        ev = next((e for e in d["events"] if e["title"] == TITLE), None)
        ok("meeting saved with 4 attendees", ev and sorted(ev["attendees"]) == ["s07", "s31", "s32", "s33"] and ev["date"] == tomorrow)
        ok("s07 got an alert for the meeting", ev and any(n["to_id"] == "s07" and n["tbl"] == "events" and n["record_id"] == ev["id"] for n in d["notifications"]))
        ok("s40 (not invited) got no alert", ev and not any(n["to_id"] == "s40" and n["record_id"] == ev["id"] for n in d["notifications"]))

        # 2. s07 sees it (agenda, Tomorrow); s40 does not
        await login(pg, "s07", "schedule")
        await tab(pg, "Agenda")
        ok("s07 sees the meeting in the agenda", await pg.locator(".sch-it", has_text=TITLE).count() >= 1)
        await pg.locator(".sch-it", has_text=TITLE).first.click()
        await pg.wait_for_timeout(300)
        ok("event window lists the attendees", await pg.locator("#modal .sch-att li").count() == 4)
        await pg.keyboard.press("Escape")
        await login(pg, "s40", "schedule")
        await tab(pg, "Agenda")
        await pg.locator(".seg button", has_text="Everyone").click()
        await pg.wait_for_timeout(200)
        ok("s40 (not invited, not on DEMO-101) does not see it", await pg.locator(".sch-it", has_text=TITLE).count() == 0)
        await tab(pg, "Public holidays")
        ok("s40 cannot add public holidays", await pg.locator(".btn", has_text="Add holiday").count() == 0)
        await login(pg, "s35", "schedule")
        await tab(pg, "Public holidays")
        ok("HR (s35) can add public holidays", await pg.locator(".btn", has_text="Add holiday").count() == 1)

        # 3. Public holidays in red on the month view
        await login(pg, "s01", "schedule")
        ok("month view reaches November 2026", await goto_month(pg, "2026-11"))
        red = await pg.evaluate("""['2026-11-23','2026-11-24','2026-11-25'].map((d) => { const c = document.querySelector('.cal-d[data-date="' + d + '"]');
            return c && c.classList.contains('hol') && /Water Festival/.test(c.textContent) ? getComputedStyle(c.querySelector('.cal-n')).color : ''; })""")
        ok("23-25 Nov 2026 Water Festival marked as holidays " + str(red), all(red))
        ok("holiday day number is red", all(r and (r.startswith("rgb(192, 54, 44)") or r.startswith("rgb(255, 255, 255)")) for r in red))
        await shot(pg, "02-month-november-desktop.png")
        await pg.click('.cal-bar button[aria-label="Next month"]')
        await pg.wait_for_timeout(200)
        ok("29 Dec 2026 Peace Day marked as holiday", await pg.evaluate("(() => { const c = document.querySelector('.cal-d[data-date=\"2026-12-29\"]'); return !!c && c.classList.contains('hol') && /Peace Day/.test(c.textContent); })()"))
        await pg.click('.cal-d[data-date="2026-12-29"]')
        await pg.wait_for_timeout(200)
        ok("tapping a day shows its list with the holiday", await pg.locator(".sch-day .sch-it.hol", has_text="Peace Day").count() == 1)

        # 4. Linked module items: s11's task due date appears and opens the task
        await login(pg, "s11", "schedule")
        await tab(pg, "Agenda")
        item = pg.locator(".sch-it.lnk", has_text="Ceiling grid level 3 complete")
        ok("task due date shown in the schedule", await item.count() >= 1)
        if await item.count():
            await item.first.click()
            await pg.wait_for_timeout(300)
            ok("tapping it opens the task", "Ceiling grid level 3 complete" in (await pg.inner_text("#modal h3")))
        ok("no page errors on desktop", not errs)
        await ctx.close()

        # 5. Phone 390 x 844: English light and Khmer dark, every tab and the form, no sideways scrolling
        ctx = await new_context(b, phone=True)
        pg = await ctx.new_page()
        perrs = []
        pg.on("pageerror", lambda e: perrs.append(str(e)))
        for lang, theme in (("en", "light"), ("km", "dark")):
            await login(pg, "s07", "schedule")
            if lang == "km":
                await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))")
                await pg.reload(); await pg.wait_for_selector(".rail")
            bad = []
            for i in range(3):
                await pg.locator(".main .tabs .tab").nth(i).click()
                await pg.wait_for_timeout(250)
                if await overflow(pg):
                    bad.append(i)
                await shot(pg, "03-phone-%s-tab%d.png" % (lang, i))
            ok("phone %s: no sideways scroll on the three tabs %s" % (lang, bad or ""), not bad)
            await pg.locator(".main .tabs .tab").nth(0).click()
            await pg.wait_for_timeout(200)
            await pg.locator(".main .sch-tools .btn.primary").click()
            await pg.wait_for_timeout(300)
            ok("phone %s: event form with the picker opens" % lang, await pg.locator("#modal .pp-row").count() >= 30)
            await shot(pg, "04-phone-%s-form.png" % lang, full=False)
            await pg.keyboard.press("Escape")
        ok("no page errors on phone", not perrs)
        await ctx.close()
        await b.close()
    bad = 0
    for k, v in out:
        print(("OK   " if v else "FAIL ") + k)
        bad += not v
    if errs:
        print("page errors:", errs[:3])
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
