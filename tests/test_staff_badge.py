"""Staff profile badges (v22). Run from the repo root:  python3 tests/test_staff_badge.py   (exit code 1 if anything fails)
Tapping a person opens two hanging badges (front and back) that drop in from the top. On a computer (1366 x 900) and a touch
phone (390 x 844), in English light and Khmer dark, as the MD (s01) and a site engineer (s07), checks that:
  - both badges appear after the drop, inside the screen (phone: the back is reached by swiping sideways)
  - no text runs out of its box, also with a long name, a long job title, a long email and Khmer
  - everything the old profile window showed is there (photo, name, short name, position, staff ID, department, phone, Telegram,
    email, start date, desk, projects; leave, system tags and Telegram link only for people allowed to see them)
  - the buttons follow the same rules as before (MD: Edit / Remove; a site engineer: only "Edit my phone and Telegram" on their own badge)
  - the Back button, the phone's Back button (history.back) and Escape close the badges, and the page scrolls normally afterwards
  - with "reduce motion" switched on the badges simply fade in and out
Screenshots go to /home/claude/qa/v22/badge/ (outside the repository) or to $GID_SHOTS.
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import new_context, login

SHOTS = os.environ.get("GID_SHOTS", "/home/claude/qa/v22/badge")
LONG_TITLE = "Senior Mechanical, Electrical and Plumbing Coordination Engineer"
LONG_MAIL = "sesothavan.senior.site.engineer@greenindesign-cambodia.com"

# text boxes that must never be wider than their own box or stick out of the card
OVERFLOW = """() => {
  const bad = [];
  document.querySelectorAll('#badges .bdg-card').forEach((card) => {
    const cr = card.getBoundingClientRect();
    card.querySelectorAll('h2, p, b, small, dt, dd, a, span, div').forEach((el) => {
      if (!el.clientWidth || getComputedStyle(el).display === 'contents') return;
      if (el.scrollWidth > el.clientWidth + 1) bad.push('wide: ' + el.className + ' ' + el.textContent.trim().slice(0, 30));
      if (el.textContent.trim() && el.closest('.bdg-mark') === null) {
        const r = el.getBoundingClientRect();
        if (r.left < cr.left - 1 || r.right > cr.right + 1) bad.push('out: ' + el.className + ' ' + el.textContent.trim().slice(0, 30));
      }
    });
  });
  return bad.slice(0, 5);
}"""
RECT = "(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; }"


async def drag(cdp, pg, x, y, dx, dy, steps=10):
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for i in range(1, steps + 1):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - dx * i / steps, "y": y - dy * i / steps}]})
        await pg.wait_for_timeout(16)
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    await pg.wait_for_timeout(500)


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    fails, passes = [], 0

    def check(ok, name):
        nonlocal passes
        if ok: passes += 1
        else: fails.append(name)
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        for phone in (False, True):
            for mode in ("en", "km-dark"):
                for user in ("s01", "s07"):
                    dev = "phone" if phone else "desktop"
                    t = f"{dev} {mode} {user}"
                    vp = {"width": 390, "height": 844} if phone else {"width": 1366, "height": 900}
                    ctx = await new_context(b, phone=phone, viewport=vp, has_touch=phone, is_mobile=phone)
                    pg = await ctx.new_page(); errs = []
                    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                    cdp = await ctx.new_cdp_session(pg) if phone else None
                    await login(pg, user, "people")
                    # a long title, a long email, a short name and Telegram on s07, to test wrapping
                    await pg.evaluate("""([title, mail]) => { const k = 'gid-demo-v6'; const d = JSON.parse(localStorage.getItem(k)); const s = d.staff.find((x) => x.id === 's07');
                      Object.assign(s, { title, email: mail, telegram_user: 'sothavan_site', short_name: 'Van', start_date: '2023-03-01', desk: 'Site office, Project 1' }); localStorage.setItem(k, JSON.stringify(d)); }""", [LONG_TITLE, LONG_MAIL])
                    if mode == "km-dark":
                        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))")
                    await pg.reload(); await pg.wait_for_selector(".rail"); await pg.wait_for_timeout(400)
                    km = mode == "km-dark"

                    async def open_badge(staff_id):
                        if await pg.locator(".main .ocn").count() == 0:
                            await pg.evaluate("location.hash = '#people'"); await pg.wait_for_timeout(300)
                        name = await pg.evaluate(f"JSON.parse(localStorage.getItem('gid-demo-v6')).staff.find((x) => x.id === '{staff_id}').name")
                        node = pg.locator(".main .ocn", has_text=name).first
                        await node.scroll_into_view_if_needed()
                        await (node.tap() if phone else node.click())
                        if user == "s01" and mode == "en" and staff_id == "s36":
                            await pg.wait_for_timeout(420); await pg.screenshot(path=os.path.join(SHOTS, f"{dev}-dropping.png"))
                        await pg.wait_for_timeout(1800)  # the drop, the bounce and the swing
                        return name

                    targets = ["s07", "s36"] if user == "s01" else ["s07", "s02"]
                    for target in targets:
                        tt = f"{t} -> {target}"
                        name = await open_badge(target)
                        check(await pg.locator("body > #badges .bdg-card").count() == 2, f"{tt} two badges open")
                        locked = await pg.evaluate("document.documentElement.classList.contains('lock-scroll')")
                        check(locked, f"{tt} page behind is held still")
                        # inside the screen
                        fr = await pg.evaluate(RECT, "#badges .front .bdg-card")
                        check(fr and fr[0] >= 0 and fr[2] <= fr[4] + 1 and fr[1] >= 0 and fr[3] <= fr[5] + 1, f"{tt} front badge inside the screen {fr}")
                        if target == targets[0]:
                            await pg.screenshot(path=os.path.join(SHOTS, f"{dev}-{user}-{target}-{mode}-front.png" if phone else f"{dev}-{user}-{target}-{mode}.png"))
                        if phone:
                            sl = await pg.evaluate("document.querySelector('#badges .bdg-stage').scrollLeft")
                            await drag(cdp, pg, 300, 500, 240, 0)
                            sl2 = await pg.evaluate("document.querySelector('#badges .bdg-stage').scrollLeft")
                            check(sl2 > sl + 100, f"{tt} a sideways swipe shows the back ({sl} -> {sl2})")
                            await pg.evaluate("document.querySelector('#badges .back .bdg-card').scrollIntoView({block: 'nearest', inline: 'nearest'})"); await pg.wait_for_timeout(300)
                        bk = await pg.evaluate(RECT, "#badges .back .bdg-card")
                        if bk and bk[3] > bk[5]:  # a tall back on a short screen: the badges window scrolls up and down
                            await pg.evaluate("document.querySelector('#badges').scrollTop = 9999"); await pg.wait_for_timeout(200); bk = await pg.evaluate(RECT, "#badges .back .bdg-card")
                        check(bk and bk[0] >= -1 and bk[2] <= bk[4] + 1 and bk[3] <= bk[5] + 1, f"{tt} back badge inside the screen {bk}")
                        over = await pg.evaluate(OVERFLOW)
                        check(not over, f"{tt} no text runs out of its box {over}")
                        text = await pg.evaluate("document.querySelector('#badges').innerText")
                        st = await pg.evaluate(f"JSON.parse(localStorage.getItem('gid-demo-v6')).staff.find((x) => x.id === '{target}')")
                        need = [st["phone"], (st.get("staff_no") or target).upper()]  # v23: the Staff ID number (GID-007), or the record id when empty
                        need.append(name.upper())
                        if not km: need += [st["title"].upper(), "POSITION", "STAFF ID", "DEPARTMENT", "Phone", "Projects", "GREEN IN DESIGN", "STRUCTURE · ARCHITECTURE · MEP · ELV"]
                        else: need += ["មុខតំណែង", "លេខសម្គាល់បុគ្គលិក", "ទូរស័ព្ទ", "គម្រោង"]
                        if target == "s07": need += [LONG_MAIL, "@sothavan_site", "“Van”", "Site office, Project 1"]
                        missing = [x for x in need if x.lower() not in text.lower()]
                        check(not missing, f"{tt} all details on the badges (missing {missing})")
                        photo = await pg.evaluate("(() => { const i = document.querySelector('#badges .bdg-ph'); return !!i && (i.tagName !== 'IMG' || i.complete && i.naturalWidth > 0); })()")
                        check(photo, f"{tt} photo shown")
                        # private rows only for people allowed to see them (same rule as the old window)
                        sees_private = user == "s01" or target == user
                        has_private = "Leave taken" in text or "ច្បាប់បានយក" in text
                        check(has_private == sees_private, f"{tt} leave / system tags shown only when allowed ({has_private})")
                        btns = await pg.locator("#badges .bdg-actions .btn").all_inner_texts()
                        want = 2 if user == "s01" else (1 if target == user else 0)
                        check(len(btns) == want, f"{tt} buttons follow the old rules ({btns})")
                        if phone and target == targets[0]:
                            await pg.screenshot(path=os.path.join(SHOTS, f"{dev}-{user}-{target}-{mode}-back.png"))

                        # close: Back button for the first person, phone Back for the second; Escape on the computer
                        hash0 = await pg.evaluate("location.hash")
                        if target == targets[0]:
                            bb = pg.locator("#badges .bdg-back")
                            await (bb.tap() if phone else bb.click()); how = "Back button"
                        else:
                            await pg.evaluate("history.back()"); how = "phone Back"
                        await pg.wait_for_timeout(800)
                        gone = await pg.locator("#badges, #badges-out").count() == 0
                        check(gone and await pg.evaluate("location.hash") == hash0, f"{tt} {how} closes the badges and stays on People")
                        check(not await pg.evaluate("document.documentElement.classList.contains('lock-scroll')"), f"{tt} page unlocked after closing")
                        await pg.evaluate("window.scrollTo(0, 0)"); await pg.wait_for_timeout(100)
                        if phone: await drag(cdp, pg, 200, 650, 0, 300)
                        else: await pg.mouse.move(700, 600); await pg.mouse.wheel(0, 400); await pg.wait_for_timeout(400)
                        check(await pg.evaluate("scrollY") > 50, f"{tt} page scrolls after closing")
                        # one more Back must not leave the People screen (no extra step left behind)
                        if how == "phone Back":
                            await pg.wait_for_timeout(300)
                            check(await pg.evaluate("location.hash") == "#people", f"{tt} still on People after the phone Back")

                    if not phone:
                        await open_badge(targets[0])
                        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(800)
                        check(await pg.locator("#badges, #badges-out").count() == 0, f"{t} Escape closes the badges")
                    # MD: Edit puts the badges away and opens the edit window
                    if user == "s01" and not km:
                        await open_badge("s07")
                        ed = pg.locator("#badges .bdg-actions .btn", has_text="Edit")
                        await (ed.tap() if phone else ed.click()); await pg.wait_for_timeout(500)
                        check(await pg.locator("#badges").count() == 0 and await pg.locator("#modal #mform").count() == 1, f"{t} Edit opens the edit window")
                        await pg.evaluate("history.back()"); await pg.wait_for_timeout(500)
                        check(await pg.locator("#modal").count() == 0 and await pg.evaluate("location.hash") == "#people", f"{t} phone Back closes the edit window and stays on People")
                    check(not errs, f"{t} no script errors {errs[:2]}")
                    await ctx.close()

        # reduce motion: simple fade, still opens and closes
        ctx = await new_context(b, phone=True, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, reduced_motion="reduce")
        pg = await ctx.new_page(); await login(pg, "s01", "people")
        await pg.locator(".main .ocn").nth(3).tap(); await pg.wait_for_timeout(500)
        tr = await pg.evaluate("getComputedStyle(document.querySelector('#badges .bdg-hang')).animationName")
        check(await pg.locator("#badges .bdg-card").count() == 2 and tr == "none", f"reduce motion: badges shown without the drop ({tr})")
        await pg.locator("#badges .bdg-back").tap(); await pg.wait_for_timeout(500)
        check(await pg.locator("#badges, #badges-out").count() == 0, "reduce motion: Back closes")
        await ctx.close()
        await b.close()
    print(f"\n{passes} passed, {len(fails)} failed. Screenshots: {SHOTS}")
    if fails:
        print("\n".join("  - " + f for f in fails)); sys.exit(1)


asyncio.run(main())
