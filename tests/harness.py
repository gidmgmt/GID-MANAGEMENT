"""Test harness for the GID Management System (Python Playwright).

Serves the app from this repository in LOCAL MODE (no Supabase, data in localStorage), so tests never touch the live database.

    import sys; sys.path.insert(0, "tests")
    from harness import route, login, new_context
    ctx = await new_context(browser, phone=False)   # route already attached, particle intro blocked
    pg = await ctx.new_page(); await login(pg, "s13", "daily")

Optional: PDF tests need jspdf + html2canvas and Khmer fonts. Install once with
    npm install --prefix tests/.libs jspdf html2canvas @fontsource/noto-sans-khmer @fontsource/plus-jakarta-sans
Without them the PDF buttons still run but produce empty PDFs.
"""
import os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LIBS = os.environ.get("GID_TEST_LIBS") or os.path.join(ROOT, "tests", ".libs", "node_modules")
PASSKEY = os.environ.get("GID_PASSKEY", "")  # optional; normally not needed (see remembered_device below)


def _pass_hash():
    m = re.search(r'PASS_HASH = "([0-9a-f]{64})"', open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())
    return m.group(1) if m else ""
CT = {"js": "text/javascript", "css": "text/css", "html": "text/html", "png": "image/png", "jpg": "image/jpeg",
      "webmanifest": "application/json", "woff2": "font/woff2", "md": "text/plain", "sql": "text/plain"}


def _lib(rel):
    p = os.path.join(LIBS, rel)
    return p if os.path.exists(p) else None


async def route(r):
    u = r.request.url
    if "splash-particles.js" in u and not os.environ.get("GID_TEST_SPLASH"):
        return await r.fulfill(body="", content_type="text/javascript")  # skip the 6 s intro
    if "fonts.googleapis" in u:
        css = ""
        for w in (400, 500, 600, 700, 800):
            css += "@font-face{font-family:'Noto Sans Khmer';font-weight:%d;src:url(/__fonts/noto-sans-khmer/files/noto-sans-khmer-khmer-%d-normal.woff2) format('woff2')}" % (w, w)
            css += "@font-face{font-family:'Plus Jakarta Sans';font-weight:%d;src:url(/__fonts/plus-jakarta-sans/files/plus-jakarta-sans-latin-%d-normal.woff2) format('woff2')}" % (w, w)
        return await r.fulfill(body=css, content_type="text/css")
    if "/__fonts/" in u:
        p = _lib("@fontsource/" + u.split("/__fonts/")[1])
        return await (r.fulfill(path=p, content_type="font/woff2") if p else r.fulfill(status=404, body=""))
    if "html2canvas" in u or "jspdf" in u:
        p = _lib("html2canvas/dist/html2canvas.min.js" if "html2canvas" in u else "jspdf/dist/jspdf.umd.min.js")
        return await r.fulfill(path=p, content_type="text/javascript") if p else await r.fulfill(body="", content_type="text/javascript")
    if "fonts.g" in u or "jsdelivr" in u:
        return await r.fulfill(body="", content_type="text/css")
    if u.endswith("/config.js") or "/config.js?" in u:  # force local mode
        return await r.fulfill(body='window.GID_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:""};', content_type="text/javascript")
    if u.startswith("http://localhost/"):
        p = u[len("http://localhost/"):].split("?")[0].split("#")[0] or "index.html"
        f = os.path.join(ROOT, p)
        if os.path.isfile(f):
            return await r.fulfill(path=f, content_type=CT.get(p.rsplit(".", 1)[-1], "application/octet-stream"))
        return await r.fulfill(status=404, body="")
    await r.abort()  # nothing leaves the machine


# v23: a remembered device must also carry today's "work day" stamp (the day changes at 03:00 Phnom Penh time).
# Same formula as workDay() in index.html: the Phnom Penh date of (now - 3 hours).
WORKDAY_JS = "new Date(Date.now()-3*3600000).toLocaleDateString('en-CA',{timeZone:'Asia/Phnom_Penh'})"


def remember_script(day_js=WORKDAY_JS):
    """Init script: open the app like a device that passed the passkey gate today (no passkey needed)."""
    return ("try{if(!localStorage.getItem('gid-pass'))localStorage.setItem('gid-pass','%s');"
            "if(!localStorage.getItem('gid-pass-day'))localStorage.setItem('gid-pass-day',%s)}catch(e){}") % (_pass_hash(), day_js)


async def new_context(browser, phone=False, remembered_device=True, **kw):
    """remembered_device=True opens the app like a device that already passed the passkey gate (no passkey needed)."""
    vp = {"width": 390, "height": 844} if phone else {"width": 1280, "height": 800}
    opts = dict(viewport=vp, device_scale_factor=2 if phone else 1, timezone_id="Asia/Phnom_Penh",
                geolocation={"latitude": 11.5561, "longitude": 104.9283, "accuracy": 20}, permissions=["geolocation"])
    opts.update(kw)
    ctx = await browser.new_context(**opts)
    await ctx.route("**/*", route)
    if remembered_device and _pass_hash():
        await ctx.add_init_script(remember_script())
    return ctx


async def login(pg, user="s01", hash=""):
    """Pass the passkey gate, become staff `user` (see data.js), open #hash. English, light theme."""
    await pg.wait_for_timeout(300)  # let a save from the previous step finish before navigating
    try:
        await pg.goto("http://localhost/index.html")
    except Exception:  # a pending reload can abort the first navigation; try once more
        await pg.wait_for_timeout(500)
        await pg.goto("http://localhost/index.html")
    if await pg.locator("#pk").count():
        if not PASSKEY:
            raise SystemExit("The passkey gate is showing. Use new_context(..., remembered_device=True) or set GID_PASSKEY.")
        await pg.fill("#pk", PASSKEY)
        await pg.click(".gate-go")
    await pg.wait_for_selector(".rail")
    await pg.evaluate(f"localStorage.setItem('gid-demo-v6-user','{user}'); localStorage.setItem('gid-ui', JSON.stringify({{theme:'light',lang:'en'}}))")
    await pg.goto("http://localhost/index.html#" + hash)
    await pg.reload()
    await pg.wait_for_selector(".rail")
    await pg.wait_for_timeout(300)


def img_bytes(name="img/icon-192.png"):
    return open(os.path.join(ROOT, name), "rb").read()
