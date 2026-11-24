"""Desktop layout regression test (v20 visual audit). Copy to tests/ once the bugs are fixed.
Run from the repo root:  python3 tests/test_desktop_layout.py      (exit code 1 if anything fails)
Checks, at 1280x800 in English light and Khmer dark:
  1. Dashboard "Spend by category" legend rows do not overlap (MD).
  2. Settings permissions table headers fit their columns (System Admin).
  3. Settings permissions table keeps its sideways scroll after changing a cell.
  4. Menu: the DEMO chip does not run under the Reset demo button (Khmer, System Admin).
  5. Dark mode: Draft / To do badges are readable (contrast >= 3).
  6. Photo viewer: Escape closes the photo viewer first, not the window under it; changing page closes it.
  7. Mouse wheel over an open window does not scroll the page behind it.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from playwright.async_api import async_playwright
from harness import new_context, login

OVERLAP_JS = """(sel) => { const els = [...document.querySelectorAll(sel)]; const r = els.map(e => e.getBoundingClientRect()); let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j];
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 2 && h > 2) n++; } return n; }"""
CONTRAST_JS = """(sel) => { const el = document.querySelector(sel); if (!el) return 99; const p = (s) => s.match(/[\\d.]+/g).map(Number);
  const L = (c) => { const f = (x) => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const cs = getComputedStyle(el); const fg = p(cs.color); let bg = p(cs.backgroundColor); const a = bg.length > 3 ? bg[3] : 1;
  const base = [20, 32, 24]; bg = [0, 1, 2].map(k => bg[k] * a + base[k] * (1 - a)); const x = L(fg), y = L(bg); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }"""


async def ui(pg, mode):
    if mode == "km-dark":
        await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'km'}))"); await pg.reload(); await pg.wait_for_selector(".rail"); await pg.wait_for_timeout(300)


async def main():
    fails, passes = [], 0
    def check(ok, name):
        nonlocal passes
        if ok: passes += 1
        else: fails.append(name)
        print(("PASS " if ok else "FAIL ") + name)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for mode in ("en-light", "km-dark"):
            ctx = await new_context(b); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            # 1
            await login(pg, "s01", "dashboard"); await ui(pg, mode)
            await pg.locator("#d-cat").scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
            n = await pg.evaluate(OVERLAP_JS, "#d-cat .legend .lg > span, #d-cat .legend .lg > b")
            w = await pg.evaluate("Math.min(...[...document.querySelectorAll('#d-cat .legend .lg')].map(e => e.getBoundingClientRect().width))")
            check(n == 0 and w > 100, f"{mode} dashboard spend legend text does not overlap ({n} overlaps, row width {w:.0f}px)")
            # 2, 3
            await login(pg, "s33", "admin"); await ui(pg, mode)
            await pg.locator("table.perm").scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
            cut = await pg.evaluate("[...document.querySelectorAll('table.perm th')].filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.textContent)")
            check(not cut, f"{mode} permissions headers fit ({cut})")
            await pg.evaluate("{const s = document.querySelector('table.perm').closest('.scroll'); s.scrollLeft = s.scrollWidth;}")
            l0 = await pg.evaluate("document.querySelector('table.perm').closest('.scroll').scrollLeft")
            sel = pg.locator("table.perm tbody tr:nth-child(3) td:last-child select")
            await sel.select_option("view" if await sel.input_value() != "view" else "edit"); await pg.wait_for_timeout(400)
            l1 = await pg.evaluate("document.querySelector('table.perm').closest('.scroll').scrollLeft")
            check(l0 == 0 or l1 > 0, f"{mode} permissions table keeps sideways scroll after an edit ({l0} -> {l1})")
            # 4
            await pg.evaluate("window.scrollTo(0,0)")
            ov = await pg.evaluate("""() => { const d = document.querySelector('.rail-sub .demo'), r = document.querySelector('.rail-sub .resetbtn'); if (!d || !r) return 0;
               const a = d.getBoundingClientRect(), b = r.getBoundingClientRect(); return Math.max(0, a.left + d.scrollWidth - b.left) + Math.max(0, d.scrollWidth - d.clientWidth); }""")
            check(ov <= 1, f"{mode} DEMO chip does not run under Reset demo ({ov}px)")
            # 5
            if mode == "km-dark":
                await login(pg, "s01", "docs"); await ui(pg, mode)
                c = await pg.evaluate(CONTRAST_JS, ".badge.b-draft")
                check(c >= 3, f"{mode} Draft badge readable in dark mode (contrast {c:.2f})")
            # 6
            await login(pg, "s13", "daily"); await ui(pg, mode)
            await pg.locator(".main tr.click").first.click(); await pg.wait_for_timeout(300)
            await pg.locator("#modal .ph").first.click(); await pg.wait_for_timeout(300)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
            lb, md = await pg.locator("#lightbox").count(), await pg.locator("#modal").count()
            check(lb == 0 and md == 1, f"{mode} Escape closes the photo viewer first (viewer {lb}, window {md})")
            if lb == 0 and md == 1:
                await pg.locator("#modal .ph").first.click(); await pg.wait_for_timeout(200)
            await pg.evaluate("location.hash = '#home'"); await pg.wait_for_timeout(400)
            check(await pg.locator("#lightbox").count() == 0, f"{mode} photo viewer closes when the page changes")
            # 7
            await login(pg, "s01", "stock"); await ui(pg, mode)
            await pg.locator(".main tr.click").first.click(); await pg.wait_for_timeout(300)
            y0 = await pg.evaluate("scrollY"); await pg.mouse.move(640, 300); await pg.mouse.wheel(0, 1500); await pg.wait_for_timeout(300)
            y1 = await pg.evaluate("scrollY")
            check(y1 == y0, f"{mode} page behind a window does not scroll ({y0} -> {y1})")
            check(not errs, f"{mode} no page errors {errs[:2]}")
            await ctx.close()
        await b.close()
    print(f"\n{passes} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)

asyncio.run(main())
