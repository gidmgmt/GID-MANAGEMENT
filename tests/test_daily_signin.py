"""v23 Sign in every day: a sign-in lasts until 03:00 the next morning (Phnom Penh time).
Passkey mode (local) and account mode (with a small fake of the Supabase library; nothing leaves this machine).
Run from the repo root:  python3 tests/test_daily_signin.py     (about 1 minute; exit code 1 if anything fails)"""
import asyncio, os, sys, json, re
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
import harness
from harness import new_context, login, remember_script, _pass_hash, WORKDAY_JS

SHOTS = os.environ.get("GID_SHOTS", "/tmp/gid-shots/v23")
os.makedirs(SHOTS, exist_ok=True)
YESTERDAY_JS = "new Date(Date.now()-27*3600000).toLocaleDateString('en-CA',{timeZone:'Asia/Phnom_Penh'})"
MSG = "Everyone signs in again each day after 3:00 am. Please sign in."

# Stand-in for supabase-js: tables come from seed(), inserts are kept in window.__inserts, rpc() posts to /rest/v1/rpc/<name>
FAKE_SUPA = r"""(function(){
  var DB=null; function db(){ if(!DB) DB=window.GID.seed(); return DB; }
  window.__inserts=[];
  function q(t){ var res={data:(db()[t]||[]).slice(),error:null,status:200};
    var p={select:function(){return p},limit:function(){return p},order:function(){return p},eq:function(){return p},neq:function(){return p},gt:function(){res.data=[];return p},
      insert:function(r){var l=Array.isArray(r)?r:[r]; window.__inserts.push([t,l]); res={data:l,error:null,status:201}; return p},update:function(){res={data:[],error:null,status:200};return p},delete:function(){return p},upsert:function(){return p},
      then:function(a,b){return Promise.resolve(res).then(a,b)}}; return p; }
  window.supabase={createClient:function(url,key){return {
    from:q, storage:{from:function(){return {upload:function(){return Promise.resolve({data:{},error:null})},getPublicUrl:function(){return {data:{publicUrl:""}}}}}},
    rpc:function(n,a){ if(!/^gid_/.test(n)) return Promise.resolve({data:null,error:{message:"x"},status:404});
      return fetch(url+"/rest/v1/rpc/"+n,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(a)})
      .then(function(r){return r.json().then(function(j){return r.ok?{data:j,error:null,status:r.status}:{data:null,error:j,status:r.status}})},function(e){return {data:null,error:{message:String(e)},status:0}}); }
  };}};
})();"""
STATE = {"session": {"ok": True, "staff_id": "s07", "name": "Se Sothavan", "account_id": "a1", "login": "012345678", "must_change_password": False}}
CALLS = []


async def acct_route(r):
    u = r.request.url
    if "supabase-js" in u:
        return await r.fulfill(body=FAKE_SUPA, content_type="text/javascript")
    if u.endswith("/config.js") or "/config.js?" in u:
        return await r.fulfill(body='window.GID_CONFIG={SUPABASE_URL:"https://abcdefghijk.supabase.co",SUPABASE_ANON_KEY:"anon"};', content_type="text/javascript")
    if "/rest/v1/rpc/" in u:
        n = u.split("/rest/v1/rpc/")[1]; CALLS.append(n)
        d = {"gid_sign_in": {"ok": True, "token": "T2", "staff_id": "s07", "name": "Se Sothavan", "must_change_password": False},
             "gid_session": STATE["session"], "gid_sign_out": {"ok": True}}.get(n, {"ok": False, "error": "server"})
        return await r.fulfill(body=json.dumps(d), content_type="application/json")
    if "supabase.co" in u:
        return await r.fulfill(body="[]", content_type="application/json")
    return await harness.route(r)

OUTBOX_ITEM = {"qid": "q1", "t": "daily_reports", "row": {"id": "dr-offline-1", "kind": "Site", "project_id": "p1", "author_id": "s07", "session": "Morning", "manpower": 5, "work_done": "Queued while offline"},
               "photos": [], "summary": "Morning report P1", "at": "2026-11-25T01:00:00.000Z", "by": "s07", "label": "Morning report P1"}


async def main():
    out = []
    ok = lambda k, v: out.append((k, bool(v)))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []

        # ---- passkey mode ----
        ctx = await new_context(b, remembered_device=False)
        await ctx.add_init_script(remember_script(YESTERDAY_JS))
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost/index.html"); await pg.wait_for_selector("#gate", timeout=8000)
        ok("passkey, yesterday's stamp: passkey screen shown", await pg.locator(".rail").count() == 0 and await pg.locator("#pk").is_visible())
        ok("passkey, yesterday's stamp: message " + MSG, MSG in await pg.inner_text("#gmsg"))
        await pg.screenshot(path=os.path.join(SHOTS, "daily-passkey-gate.png"))
        await ctx.close()

        ctx = await new_context(b, remembered_device=False)  # today's stamp, set once only (so a sign-out is not undone on reload)
        await ctx.add_init_script("if(!sessionStorage.getItem('t-init')){sessionStorage.setItem('t-init','1');" + remember_script() + "}")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await login(pg, "s07", "home")
        ok("passkey, today's stamp: app opens", await pg.locator(".rail").count() == 1)
        until = await pg.inner_text(".rail-until")
        ok("menu shows 'Signed in until 03:00 ...' (" + until + ")", re.match(r"^Signed in until 03:00 (today|tomorrow)$", until.strip()))
        # a form is open when the day ends: warning first, the window stays
        await pg.locator(".main .btn.primary", has_text="New request").click(); await pg.wait_for_selector("#modal")
        await pg.locator("#modal .typebtn", has_text="Leave").click(); await pg.wait_for_selector("#mform")
        await pg.evaluate(f"localStorage.setItem('gid-pass-day', {YESTERDAY_JS}); document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(500)
        ok("day ended with a form open: warning shown, form kept", await pg.locator("#dayend").count() == 1 and await pg.locator("#modal").count() == 1)
        await pg.screenshot(path=os.path.join(SHOTS, "daily-form-warning.png"))
        await pg.click("#modal .x"); await pg.wait_for_timeout(300)
        if await pg.locator("#modal .x").count(): await pg.click("#modal .x")
        await pg.wait_for_selector("#gate", timeout=30000)
        ok("after closing the window: passkey screen with the message", MSG in await pg.inner_text("#gmsg"))
        ok("the remembered passkey is forgotten", await pg.evaluate("localStorage.getItem('gid-pass')") is None)
        await ctx.close()

        # ---- account mode ----
        async def acct_ctx(init):
            c = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Asia/Phnom_Penh")
            await c.route("**/*", acct_route)
            await c.add_init_script("if(!sessionStorage.getItem('t-init')){sessionStorage.setItem('t-init','1');" + init + "}")
            return c
        ctx = await acct_ctx(f"localStorage.setItem('gid-session','T1');localStorage.setItem('gid-session-day',{YESTERDAY_JS});localStorage.setItem('gid-outbox',JSON.stringify([{json.dumps(OUTBOX_ITEM)}]));")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)));
        await pg.goto("http://localhost/index.html"); await pg.wait_for_selector("#gin", timeout=10000)
        ok("account, yesterday's sign-in: sign-in screen with the message", MSG in await pg.inner_text("#gmsg"))
        ok("account, yesterday's sign-in: token dropped", await pg.evaluate("localStorage.getItem('gid-session')") is None)
        ok("account, yesterday's sign-in: offline queue kept", len(json.loads(await pg.evaluate("localStorage.getItem('gid-outbox')") or "[]")) == 1)
        await pg.screenshot(path=os.path.join(SHOTS, "daily-account-gate-phone.png"))
        await pg.wait_for_timeout(1500)
        ok("account, yesterday's sign-in: server told to end it", "gid_sign_out" in CALLS)
        # sign in again: today's stamp saved, the queued report is sent
        await pg.wait_for_timeout(1500)  # (the queued report must not be sent, and the app not drawn, before signing in)
        ok("nothing is sent and the app stays closed before signing in", await pg.locator(".rail").count() == 0 and not await pg.evaluate("window.__inserts.length"))
        await pg.fill("#li", "012345678")
        await pg.fill("#lp", "good1234"); await pg.click("#gin .gate-go")
        await pg.wait_for_selector(".rail", timeout=10000)
        ok("signed in again: today's day stamp saved", await pg.evaluate(f"localStorage.getItem('gid-session-day') === {WORKDAY_JS}"))
        await pg.wait_for_timeout(3500)
        sent = await pg.evaluate("window.__inserts.some(x => x[0]==='daily_reports' && x[1].some(r => r.id==='dr-offline-1'))")
        ok("the queued report is sent after signing in again", sent and len(json.loads(await pg.evaluate("localStorage.getItem('gid-outbox')") or "[]")) == 0)
        # account menu
        await pg.click("#who"); await pg.wait_for_selector("#modal")
        until = await pg.inner_text("#modal .acct-until")
        ok("My account shows 'Signed in until 03:00 ...' (" + until + ")", re.match(r"^Signed in until 03:00 (today|tomorrow)$", until.strip()))
        await pg.screenshot(path=os.path.join(SHOTS, "daily-account-menu-phone.png"))
        await pg.click("#modal .x"); await pg.wait_for_timeout(300)
        # the day ends while the app is open (no form): signed out at once, queue kept
        await pg.evaluate(f"localStorage.setItem('gid-outbox',JSON.stringify([{json.dumps(OUTBOX_ITEM)}])); localStorage.setItem('gid-session-day', {YESTERDAY_JS}); document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_selector("#gin", timeout=10000)
        ok("account, day over while open: sign-in screen with the message", MSG in await pg.inner_text("#gmsg"))
        ok("account, day over while open: offline queue still there", len(json.loads(await pg.evaluate("localStorage.getItem('gid-outbox')") or "[]")) == 1)
        await ctx.close()

        # server expiry time earlier than 03:00 is respected too
        ctx = await acct_ctx(f"localStorage.setItem('gid-session','T1');localStorage.setItem('gid-session-day',{WORKDAY_JS});localStorage.setItem('gid-session-exp',new Date(Date.now()-60000).toISOString());")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost/index.html"); await pg.wait_for_selector("#gin", timeout=10000)
        ok("account, server expiry passed: sign-in screen", MSG in await pg.inner_text("#gmsg"))
        await ctx.close()
        # a valid session today opens the app
        ctx = await acct_ctx(f"localStorage.setItem('gid-session','T1');localStorage.setItem('gid-session-day',{WORKDAY_JS});")
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost/index.html"); await pg.wait_for_selector(".rail", timeout=10000)
        ok("account, today's sign-in: app opens", True)
        await ctx.close()
        ok("no page errors", not errs)
        await b.close()
    bad = 0
    for k, v in out:
        print(("OK   " if v else "FAIL ") + k)
        bad += not v
    if errs: print(errs[:5])
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
