"""Smoke test: every screen for the main roles on desktop and phone, in English and Khmer dark, plus key rules.
Run from the repo root:  python3 tests/smoke.py        (about 3 minutes; exit code 1 if anything fails)
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

ROUTES = ["home", "schedule", "dashboard", "projects", "projects/p1", "daily", "requests", "docs", "qaqc", "safety", "svr", "vo", "subs",
          "cost", "finance", "procurement", "stock", "handover", "people", "admin"]
ROLES = ["s01", "s03", "s06", "s13", "s18", "s20", "s29", "s30", "s31", "s33", "s34", "s35", "s39"]


async def main():
    out = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for phone in (False, True):
            tag = "phone" if phone else "desktop"
            ctx = await new_context(b, phone=phone)
            pg = await ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            for lang, theme in (("en", "light"), ("km", "dark")):
                for u in ROLES:
                    await login(pg, u, "home")
                    if lang == "km":
                        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))")
                        await pg.reload(); await pg.wait_for_selector(".rail")
                    for h in ROUTES:
                        await pg.goto("http://localhost/index.html#" + h)
                        await pg.wait_for_timeout(100)
                        if phone and await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                            errs.append(f"sideways scroll: {u} #{h} {lang}")
            out.append((f"{tag}: all screens, {len(ROLES)} roles, EN + KM: " + ("; ".join(errs[:3]) or "no errors"), not errs))
            # key rules
            await login(pg, "s20", "docs")
            await pg.locator(".main .btn.primary", has_text="New document").click(); await pg.wait_for_timeout(300)
            await pg.select_option("#mform select[name=project_id]", "p1")
            await pg.fill("#mform input[name=doc_no]", "A-101"); await pg.fill("#mform input[name=title]", "dup")
            await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(400)
            out.append((f"{tag}: duplicate drawing number refused", await pg.locator("#modal").count() == 1))
            await login(pg, "s13", "")
            out.append((f"{tag}: site engineer has no Cost or Finance menu", await pg.locator('.rail a[href="#cost"], .rail a[href="#finance"]').count() == 0))
            await login(pg, "s20", "")
            out.append((f"{tag}: designer has no Subcontractors menu", await pg.locator('.rail a[href="#subs"]').count() == 0))
            await ctx.close()
        await b.close()
    bad = 0
    for k, v in out:
        print(("OK   " if v else "FAIL ") + k)
        bad += not v
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
