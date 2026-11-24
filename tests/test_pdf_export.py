"""PDF export layout checks (English and Khmer), local mode only.

Wraps window.html2canvas so every PDF page is inspected just before it is drawn:
  - nothing runs past the footer (content would be cut off),
  - sign-off boxes: the bottom line (<em>) does not overlap the text above it,
  - the small header on continuation/photo pages stays on one line,
  - English pages list the bundled Khmer font (Khmer typed by staff must not break apart),
  - Khmer pages: table headers / labels are translated (no plain English words left),
  - app CSS (.empty, dark theme) does not leak into the PDF.
Run from the repo root:  GID_TEST_LIBS=... python3 tests/test_pdf_export.py
"""
import asyncio, os, sys, json, re
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import new_context, login

HOOK = r"""
(() => {
  window.__pdfIssues = [];
  let real;
  const ok = (t) => /^[\s\d.,:;()\/·–—+%$-]*$/.test(t) || /[ក-៿]/.test(t) || /^(GID|QS|PM|MD|VO|GPS|CCTV|ELV|MEP|MVAC|HVAC|EDC|SN|RCD|Cat6|MΩ|Ω|mA|ms|m|bar|min|PDF)\b/.test(t);
  const inspect = (el) => {
    const out = [], isKm = el.classList.contains('km'), r0 = el.getBoundingClientRect();
    const tag = (el.querySelector('.rp-mini, .rp-top') || {}).textContent || '';
    if (el.classList.contains('rp-page')) {
      const foot = el.querySelector('.rp-foot'), fb = foot ? foot.getBoundingClientRect().top : r0.bottom;
      el.querySelectorAll('.rp-body > *, .rp-grid').forEach((b) => { if (b.getBoundingClientRect().bottom > fb + 1) out.push('content runs past the footer (cut off)'); });
      el.querySelectorAll('.rp-sign > div, .sf-sign > div').forEach((box) => {
        const em = box.querySelector('em'); if (!em) return;
        const et = em.getBoundingClientRect().top;
        [...box.children].filter((c) => c !== em).forEach((c) => { if (c.getBoundingClientRect().bottom > et + 1) out.push('sign-off text overlaps the signature line'); });
      });
      const mini = el.querySelector('.rp-mini');
      if (mini) { const s = mini.querySelectorAll(':scope > span'); s.forEach((x) => { const lh = parseFloat(getComputedStyle(x).lineHeight) || 20; if (x.getBoundingClientRect().height > lh * 1.6) out.push('page header wraps to two lines'); }); }
      if (!isKm && !/GID Khmer/.test(getComputedStyle(el).fontFamily)) out.push('English page has no Khmer font (Khmer text will break apart)');
      el.querySelectorAll('.empty').forEach((e) => { const cs = getComputedStyle(e); if (cs.borderStyle === 'dashed' || cs.borderRadius === '14px') out.push('app .empty style leaks into the PDF'); });
    }
    if (isKm || el.classList.contains('km')) {
      el.querySelectorAll('th, h2, .hd, .rp-sess, .sf-chk, .oc-l, .oc-none, .ocn i').forEach((e) => { const t = e.textContent.replace(/✓/g, '').trim(); if (t && !ok(t) && /[A-Za-z]{3,}/.test(t)) out.push('English left in Khmer PDF: "' + t.slice(0, 40) + '"'); });
    }
    if (el.classList.contains('oc-print')) {
      el.querySelectorAll('.ocn b').forEach((b) => { const c = getComputedStyle(b).color.match(/\d+/g).map(Number); if (c[0] + c[1] + c[2] > 600) out.push('org chart names nearly invisible (light text on white)'); });
    }
    [...new Set(out)].forEach((m) => window.__pdfIssues.push(tag.replace(/\s+/g, ' ').trim().slice(0, 50) + ' | ' + m));
  };
  Object.defineProperty(window, 'html2canvas', { configurable: true, get: () => real && ((el, o) => { try { inspect(el); } catch (e) { window.__pdfIssues.push('inspect error ' + e); } return real(el, o); }), set: (v) => { real = v; } });
})();
"""

LONG = r"""(() => { const d = JSON.parse(localStorage.getItem('gid-demo-v6')); const b = d.daily_reports.find(x => x.id === 'd2');
  if (!d.daily_reports.find(x => x.id === 'qa-long')) { const L = Array.from({ length: 45 }, (_, i) => 'Line ' + (i + 1) + ': cable tray level ' + (i % 5 + 1) + ' ការដំឡើងបំពង់ខ្សែភ្លើង ជាន់ទី ' + (i % 5 + 1));
  d.daily_reports.push(Object.assign({}, b, { id: 'qa-long', report_date: '2026-11-20', work_done: L.join('\n'), issues: '', plan: 'x', status: 'Reviewed', reviewed_by: 's06' })); }
  localStorage.setItem('gid-demo-v6', JSON.stringify(d)); })()"""

ONLY = sys.argv[1] if len(sys.argv) > 1 else ""
CASES = [  # name, user, route, how to open
    ("daily EOD", "s01", "daily", ["row", "DEMO-101", "End of day"]),
    ("daily long text", "s01", "daily", ["row", "Line 1: cable"]),
    ("QA defect", "s29", "qaqc", ["row", "Paint touch-up"]),
    ("QA inspection", "s29", "qaqc", ["tabrow", "Inspections", "Fire alarm"]),
    ("safety form B", "s01", "safety", ["row", "duct section"]),
    ("SVR", "s01", "svr", ["row", "SVR-2026-0001"]),
    ("VO", "s01", "vo", ["row", "Extra 24 data"]),
    ("test sheet", "s01", "handover", ["row", "TC-101-002"]),
    ("org chart", "s01", "projects/p1", ["org"]),
]

async def one(b, name, user, rt, how, lang, dark=False):
    ctx = await new_context(b); pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await ctx.add_init_script(HOOK)
    await login(pg, user, rt)
    await pg.evaluate(LONG)
    if dark: await pg.evaluate("localStorage.setItem('gid-ui', JSON.stringify({theme:'dark',lang:'en'}))")
    await pg.reload(); await pg.wait_for_selector(".rail"); await pg.wait_for_timeout(400)
    if how[0] == "tabrow":
        await pg.locator(".main .tabs .tab", has_text=how[1]).first.click(); await pg.wait_for_timeout(300); how = ["row", how[2]]
    if how[0] == "row":
        loc = pg.locator("table.list tbody tr")
        for t in how[1:]: loc = loc.filter(has_text=t)
        await loc.first.click()
    else:
        if not await pg.locator(".btn", has_text="Full view and PDF").count():
            await pg.locator(".main").get_by_text("Team", exact=True).first.click(); await pg.wait_for_timeout(300)
        await pg.locator(".btn", has_text="Full view and PDF").first.click()
    await pg.wait_for_timeout(400)
    label = "PDF English" if lang == "en" else "PDF ខ្មែរ"
    try:
        async with pg.expect_download(timeout=20000):
            await pg.locator("#modal .btn", has_text=label).first.click()
        issues = await pg.evaluate("window.__pdfIssues")
    except Exception as e:
        issues = ["no PDF within 20 s: " + str(e)[:120]]
    await ctx.close()
    return sorted(set(issues)) + ["page error: " + e for e in errs]

async def main():
    fails = 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, user, rt, how in CASES:
            if ONLY and ONLY not in name: continue
            for lang in ("en", "km"):
                iss = await one(b, name, user, rt, how, lang)
                print(("PASS" if not iss else "FAIL"), name, lang, *(["\n    - " + i for i in iss] if iss else []))
                fails += bool(iss)
        iss = [] if ONLY and ONLY not in "org chart" else await one(b, "org chart", "s01", "projects/p1", ["org"], "km", dark=True)
        if not (ONLY and ONLY not in "org chart"): print(("PASS" if not iss else "FAIL"), "org chart km (dark app)", *(["\n    - " + i for i in iss] if iss else [])); fails += bool(iss)
        await b.close()
    print("\n%d failing" % fails); sys.exit(1 if fails else 0)

asyncio.run(main())
