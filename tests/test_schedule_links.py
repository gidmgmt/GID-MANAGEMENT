"""Schedule (v22 security fix): an event linked to a money record (IPC claim) must not let an invited person
who has no access to that module open the record. The QS who can see claims still gets the link.
Run from the repo root:  python3 tests/test_schedule_links.py   (exit code 1 if anything fails)
"""
import asyncio, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

TITLE = "Linked IPC review test"
fails = []


def ok(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await new_context(b)
        pg = await ctx.new_page()
        await login(pg, "s01", "schedule")
        data = json.loads(await pg.evaluate("localStorage.getItem('gid-demo-v6')"))
        claim = data["claims"][0]
        today = await pg.evaluate("new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })")
        data["events"].append({"id": "evlinktest", "no": "EV-9999", "title": TITLE, "type": "Meeting", "date": today, "start_time": "10:00", "end_time": "11:00",
                               "all_day": False, "project_id": claim.get("project_id") or "", "location": "", "organiser_id": "s31", "attendees": ["s12", "s31"],
                               "notes": "", "minutes": "", "status": "Planned", "link_module": "claims", "link_id": claim["id"], "created_by": "s31"})
        await pg.evaluate("(d) => localStorage.setItem('gid-demo-v6', d)", json.dumps(data))

        for user, should_link in (("s12", False), ("s31", True)):
            await login(pg, user, "schedule")
            await pg.wait_for_timeout(400)
            tabs = pg.locator(".main .tabs .tab", has_text="Agenda")
            if await tabs.count():
                await tabs.first.click(); await pg.wait_for_timeout(250)
            item = pg.locator(".sch-it", has_text=TITLE)
            ok(f"{user} sees the event", await item.count() >= 1)
            if not await item.count():
                continue
            await item.first.click(); await pg.wait_for_timeout(400)
            body = await pg.inner_text("#modal")
            link = pg.locator("#modal a", has_text="IPC")
            if should_link:
                ok(f"{user} (QS) gets the link to the IPC", await link.count() >= 1)
            else:
                ok(f"{user} (site engineer) gets no link to the IPC", await link.count() == 0)
                ok(f"{user} sees only a plain note, no IPC number", "Linked to a record in" in body and f"IPC {claim.get('ipc_no')}" not in body)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        await b.close()
    print(f"\n{'ALL OK' if not fails else str(len(fails)) + ' failed'}")
    sys.exit(1 if fails else 0)


asyncio.run(main())
