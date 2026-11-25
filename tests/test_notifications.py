"""v23 clear alerts (docs/NOTIFICATIONS.md): kind per reader, module, project "CODE · Name", amount, Khmer title.
Flows: a material request PM → QS → MD → Procurement, a rejection with reason, a variation, an event invite, a welcome, an announcement.
Run from the repo root:  python3 tests/test_notifications.py     (about 1 minute; exit code 1 if anything fails)"""
import asyncio, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

DB = "JSON.parse(localStorage.getItem('gid-demo-v6'))"
P1 = "DEMO-101 · Riverside Office Fit-out"


async def notes(pg, cond):
    return await pg.evaluate(f"{DB}.notifications.filter(n => {cond})")


async def material_request(pg, qty, cost, name):
    await pg.locator(".main .btn.primary", has_text="New request").click(); await pg.wait_for_selector("#modal .typebtn")
    await pg.locator("#modal .typebtn", has_text="Material").click(); await pg.wait_for_selector("#mr-go")
    await pg.select_option("#mr-p", "p1")
    await pg.select_option('#modal select[data-k="item_id"]', "__new")
    await pg.fill('#modal input[data-k="name"]', name); await pg.dispatch_event('#modal input[data-k="name"]', "change")
    await pg.fill('#modal input[data-k="cost"]', str(cost)); await pg.dispatch_event('#modal input[data-k="cost"]', "change")
    await pg.fill('#modal input[data-k="qty"]', str(qty)); await pg.dispatch_event('#modal input[data-k="qty"]', "change")
    await pg.click("#mr-go"); await pg.wait_for_timeout(900)
    return await pg.evaluate(f"{DB}.requests.filter(r => r.title.startsWith('{name}')).pop()")


async def act_on(pg, who, rid, button=None, fill=None):
    await login(pg, who, f"open=requests:{rid}")
    await pg.wait_for_selector("#modal")
    if button: await pg.locator("#modal .btn", has_text=button).first.click()
    else: await pg.locator("#modal .form-actions .btn.primary").first.click()
    await pg.wait_for_selector("#mform")
    for k, v in (fill or {}).items():
        if k.startswith("select:"): await pg.select_option(f"#mform select[name={k[7:]}]", v)
        else: await pg.fill(f"#mform [name={k}]", v)
    await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(900)


async def main():
    out = []
    ok = lambda k, v: out.append((k, bool(v)))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await new_context(b)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))

        # 1. material request USD 1,000: PM → QS → MD → Procurement
        await login(pg, "s07", "home")
        r = await material_request(pg, 100, 10, "Test cable tray")
        rid, ref = r["id"], r["ref_no"]
        n = await notes(pg, f"n.record_id==='{rid}' && n.to_id==='s03'")
        ok("R1: PM gets ACTION 'waiting for your approval'", n and n[-1]["kind"] == "action" and n[-1]["title"] == f"{ref} · Material request waiting for your approval")
        ok("R1: module, project 'CODE · Name', amount, Khmer title", n and n[-1]["module"] == "requests" and n[-1]["project"] == P1 and n[-1]["amount"] == "$1,000" and "រង់ចាំការអនុម័តរបស់អ្នក" in (n[-1]["title_km"] or ""))
        ok("R1: due date is human ('needed by …')", n and n[-1]["due"].startswith("needed by ") and "-" not in n[-1]["due"])
        await act_on(pg, "s03", rid)
        qs = await notes(pg, f"n.record_id==='{rid}' && ['s31','s32','s33'].includes(n.to_id)")
        ok("R2: QS gets ACTION 'waiting for your budget check'", qs and all(x["kind"] == "action" and x["title"].endswith("waiting for your budget check") for x in qs))
        mine = (await notes(pg, f"n.record_id==='{rid}' && n.to_id==='s07'"))[-1]
        ok("R3: requester gets INFO 'approved by …, now with …'", mine["kind"] == "info" and " approved by " in mine["title"] and "now with" in mine["title"])
        ok("no '(+N more)' anywhere", not await pg.evaluate(f"{DB}.notifications.some(n => /\\(\\+\\d+ more\\)/.test(n.title))"))
        await act_on(pg, "s31", rid)
        md = (await notes(pg, f"n.record_id==='{rid}' && n.to_id==='s01'"))[-1]
        ok("R2: MD gets ACTION for USD 500+", md["kind"] == "action" and md["title"] == f"{ref} · Material request waiting for your approval" and "Approved by" in md["body"])
        await act_on(pg, "s01", rid)
        pr = (await notes(pg, f"n.record_id==='{rid}' && n.to_id==='s39'"))[-1]
        ok("R2: Procurement gets ACTION 'waiting for your order'", pr["kind"] == "action" and pr["title"].endswith("waiting for your order"))
        await act_on(pg, "s39", rid, fill={"select:supplier_id": "v1"})
        st = await pg.evaluate(f"{DB}.requests.find(r => r.id==='{rid}').status")
        mine = (await notes(pg, f"n.to_id==='s07' && n.tbl==='requests' && n.record_id==='{rid}'"))[-1]
        ok("R4: request approved; requester gets APPROVED with the PO", st == "Approved" and mine["kind"] == "approved" and mine["title"] == f"{ref} · Material request approved" and "PO-" in mine["body"] and "issued to" in mine["body"])

        # 2. reject with reason
        await login(pg, "s07", "home")
        r2 = await material_request(pg, 2, 10, "Test wrong item")
        await act_on(pg, "s03", r2["id"], button="Reject", fill={"note": "Wrong item, use the stock cable"})
        rj = (await notes(pg, f"n.record_id==='{r2['id']}' && n.to_id==='s07'"))[-1]
        ok("R5: requester gets REJECTED with the reason", rj["kind"] == "rejected" and "rejected by" in rj["title"] and "Reason: Wrong item, use the stock cable" in rj["body"])

        # 3. variation raised → QS must price it
        await login(pg, "s12", "vo"); await pg.locator(".main .btn.primary", has_text="New variation").click(); await pg.wait_for_timeout(300)
        await pg.select_option("#mform select[name=project_id]", "p1"); await pg.fill("#mform input[name=title]", "Notif VO socket"); await pg.fill("#mform textarea[name=reason]", "Client asked")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(800)
        vo = await pg.evaluate(f"{DB}.variations.find(v => v.title==='Notif VO socket')")
        vq = await notes(pg, f"n.record_id==='{vo['id']}' && ['s31','s32','s33'].includes(n.to_id)")
        ok("VO1: QS gets ACTION 'New variation to price'", vq and all(x["kind"] == "action" and "New variation to price" in x["title"] and x["project"] == P1 and x["module"] == "vo" for x in vq))

        # VO sent back to QS shows "Returned to QS by …" with the reason (was ": Raised")
        await login(pg, "s33", "open=variations:" + vo["id"]); await pg.wait_for_selector("#modal")
        await pg.locator("#modal .btn", has_text="Price it").click(); await pg.wait_for_timeout(400)
        await pg.locator('.voline[data-i="0"] .l-item').fill("Socket"); await pg.locator('.voline[data-i="0"] .l-qty').fill("2"); await pg.locator('.voline[data-i="0"] .l-rate').fill("50")
        await pg.click("#voform button[type=submit]"); await pg.wait_for_timeout(700)
        pm = (await notes(pg, f"n.record_id==='{vo['id']}' && n.to_id==='s03'"))[-1]
        ok("VO2: PM gets ACTION 'Priced, waiting for your check'", pm["kind"] == "action" and pm["title"].endswith("Priced, waiting for your check"))
        await login(pg, "s03", "open=variations:" + vo["id"]); await pg.wait_for_selector("#modal")
        await pg.locator("#modal .btn", has_text="Back to QS").click(); await pg.wait_for_selector("#mform")
        await pg.fill("#mform textarea[name=note]", "Add the cable too"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(700)
        bq = (await notes(pg, f"n.record_id==='{vo['id']}' && n.to_id==='s12'"))[-1]
        ok("VO7: raiser gets REJECTED 'Returned to QS by …' with the reason", bq["kind"] == "rejected" and "Returned to QS by" in bq["title"] and "Reason: Add the cable too" in bq["body"])

        # daily report reviewed: the author is told, with a different title from a new report
        await login(pg, "s03", "open=daily_reports:d2"); await pg.wait_for_selector("#modal")
        await pg.locator("#modal .btn", has_text="Mark reviewed").click(); await pg.wait_for_timeout(700)
        dr = await notes(pg, "n.record_id==='d2' && n.to_id==='s11'")
        ok("D4: author gets APPROVED 'Your … report of … was reviewed by …'", dr and dr[-1]["kind"] == "approved" and dr[-1]["title"].startswith("Your end of day report of ") and "was reviewed by" in dr[-1]["title"])

        # 4. event invite
        await login(pg, "s03", "schedule")
        await pg.locator(".main .btn.primary", has_text="New event").click(); await pg.wait_for_timeout(300)
        await pg.fill('#mform input[name="title"]', "Notif site meeting")
        await pg.select_option('#mform select[name="project_id"]', "p1")
        await pg.fill('#mform input[name="start_time"]', "08:00"); await pg.fill('#mform input[name="end_time"]', "09:00")
        await pg.locator('.pp-row input[value="s07"]').check()
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(900)
        ev = await notes(pg, "n.tbl==='events' && n.to_id==='s07' && n.title==='Invitation: Notif site meeting'")
        ok("E1: invitee gets REMINDER with date/time and project", ev and ev[-1]["kind"] == "reminder" and "08:00–09:00" in ev[-1]["due"] and ev[-1]["project"] == P1 and ev[-1]["title_km"] == "ការអញ្ជើញ៖ Notif site meeting")

        # 5. welcome
        await login(pg, "s35", "people")
        await pg.locator(".main .btn.primary", has_text="Add staff").click(); await pg.wait_for_selector("#mform")
        await pg.fill('#mform input[name="name"]', "Test Newcomer"); await pg.fill('#mform input[name="title"]', "Site Engineer"); await pg.fill('#mform input[name="phone"]', "012 345 678")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(1500)
        wl = await notes(pg, "n.tbl==='welcome' && n.to_id==='s07'")
        ok("PE2: everyone gets WELCOME with a Khmer title", wl and wl[-1]["kind"] == "welcome" and wl[-1]["module"] == "people" and "Test Newcomer" in (wl[-1]["title_km"] or ""))

        # 6. announcement + Telegram link #open=announcements:<id>
        await login(pg, "s33", "admin")
        await pg.locator(".card.ann .btn.primary").click(); await pg.wait_for_selector("#mform")
        await pg.fill("#mform input[name=title]", "Notif test notice"); await pg.fill("#mform textarea[name=message]", "Hello\nteam")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(900)
        an = await notes(pg, "n.tbl==='announcements' && n.to_id==='s07' && n.title==='Notif test notice'")
        ok("AN1: kind announcement, module announcements", an and an[-1]["kind"] == "announcement" and an[-1]["module"] == "announcements")
        await login(pg, "s07", "open=announcements:" + an[-1]["record_id"])
        await pg.wait_for_selector("#modal")
        ok("Telegram link #open=announcements:<id> opens the announcement", await pg.inner_text("#modal h3") == "Announcement" and "Hello\nteam" in await pg.inner_text("#modal .annc-m"))
        await pg.click("#modal .x")

        # every new alert row has kind and module; projects never as the code alone
        rows = await pg.evaluate(f"{DB}.notifications.filter(n => n.kind)")
        ok(f"all {len(rows)} new alerts have a module and a Khmer title", rows and all(x.get("module") and x.get("title_km") for x in rows))
        ok("project always 'CODE · Name' (never the code alone)", all((not x.get("project")) or " · " in x["project"] for x in rows))
        ok("no raw computer dates in titles or dates", not any(__import__("re").search(r"\d{4}-\d{2}-\d{2}", (x.get("title") or "") + (x.get("due") or "")) for x in rows))

        # Khmer alert list shows the Khmer title
        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))"); await pg.reload(); await pg.wait_for_selector(".rail")
        await pg.click("#bell"); await pg.wait_for_selector("#drawer")
        txt = await pg.inner_text("#drawer")
        ok("Khmer alert list shows the Khmer titles", "ការអញ្ជើញ៖ Notif site meeting" in txt and "ត្រូវបានអនុម័ត" in txt)
        await pg.screenshot(path=os.path.join(os.environ.get("GID_SHOTS", "/tmp/gid-shots/v23"), "alerts-km-dark.png"))
        ok("no page errors", not errs)
        await ctx.close(); await b.close()
    bad = 0
    for k, v in out:
        print(("OK   " if v else "FAIL ") + k)
        bad += not v
    if errs: print(errs[:5])
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
