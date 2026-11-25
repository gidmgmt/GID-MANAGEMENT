"""Version 23 business rules (approved by Jack) and the Staff ID number. Run from the repo root:  python3 tests/test_rules_v23.py
(exit code 1 if anything fails). Local mode only, never touches Supabase.

For each rule it checks the allowed case, that the button is hidden from people who may not use it, and that the action
itself refuses at save time with a clear message. The save-time check is tested by opening the window as an allowed person,
then changing the data from a second tab (the app picks the change up through the browser's storage event) so that the
person is no longer allowed, and pressing the button that is still on the screen.
  1. VO "PM checked": only the PM of that project; not the MD; never the person who did the step before
  2. Mark paid: Finance only (not Procurement, Admin or the System Admin)
  3. PMs act only on their own projects (request PM step, IPC "PM verified", subcontractor PM approve, deliveries)
  4. Nobody approves their own drawing
  5. QA/QC: only the QA/QC inspector, the project's PM or the MD pass / fail / close
  6. Staff ID number: HR / System Admin edit it (badge pencil and Edit form), unique; a site engineer has no pencil
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import new_context, login

K = "gid-demo-v6"
MSG = {
    "voPM": "Only the Project Manager of this project can do the PM check.",
    "twice": "You did the previous check on this variation, so another person must do this step.",
    "finance": "Only Finance staff can mark this as paid.",
    "ownDoc": "You created this drawing, so another approver must approve it.",
    "qa": "Only the QA/QC inspector, the Project Manager of this project or the MD can pass, fail or close this.",
    "notYours": "This step is waiting for someone else.",
    "notPM": "Only the Project Manager of this project (or the MD) can do this.",
}

# extra demo records used by the checks (added to the saved demo data)
SEED = """() => { const k = 'gid-demo-v6', d = JSON.parse(localStorage.getItem(k)), now = new Date().toISOString(), H = (by, action) => ({ at: now, by, action, note: '' });
  const put = (t, r) => { d[t] = (d[t] || []).filter((x) => x.id !== r.id); d[t].push(Object.assign({ created_at: now }, r)); };
  put('variations', { id: 'tv1', vo_no: 'VO-T-01', project_id: 'p1', title: 'Rule VO one', reason: 'test', status: 'Priced', amount: 1000, lines: [{ item: 'x', qty: 1, unit: 'lot', rate: 1000 }], markup_pct: 0, raised_by: 's12', evidence: [], client_evidence: [], history: [H('s12', 'Raised'), H('s33', 'Priced')] });
  put('variations', { id: 'tv2', vo_no: 'VO-T-02', project_id: 'p1', title: 'Rule VO two', reason: 'test', status: 'Priced', amount: 500, lines: [{ item: 'y', qty: 1, unit: 'lot', rate: 500 }], markup_pct: 0, raised_by: 's12', evidence: [], client_evidence: [], history: [H('s12', 'Raised'), H('s33', 'Priced')] });
  put('variations', { id: 'tv3', vo_no: 'VO-T-03', project_id: 'p4', title: 'Rule VO three', reason: 'test', status: 'PM checked', amount: 700, lines: [{ item: 'z', qty: 1, unit: 'lot', rate: 700 }], markup_pct: 0, raised_by: 's13', evidence: [], client_evidence: [], history: [H('s13', 'Raised'), H('s33', 'Priced'), H('s01', 'PM checked')] });
  put('invoices', { id: 'ti1', inv_no: 'AP-9901', direction: 'Payable', project_id: 'p1', party: 'Rule supplier one', source_type: 'other', source_id: '', amount: 120, due_date: '2030-01-01', status: 'Unpaid', paid_at: null });
  put('invoices', { id: 'ti2', inv_no: 'AP-9902', direction: 'Payable', project_id: 'p1', party: 'Rule supplier two', source_type: 'other', source_id: '', amount: 130, due_date: '2030-01-01', status: 'Unpaid', paid_at: null });
  put('requests', { id: 'tr1', ref_no: 'REQ-T-01', type: 'Purchase', project_id: 'p1', requester_id: 's12', title: 'Rule request one', details: '', amount: 100, status: 'Pending', step_index: 0,
    steps: [{ role: 'PM', label: 'Project Manager approves' }, { role: 'QS', label: 'QS checks budget' }, { role: 'PROC', label: 'Procurement issues PO' }], history: [H('s12', 'Submitted')], items: [] });
  put('documents', { id: 'td1', project_id: 'p1', doc_no: 'A-T01', title: 'Rule drawing by head', discipline: 'Architecture', doc_type: 'Drawing', revision: 0, status: 'In review', owner_id: 's18', due_date: '2030-01-01', notes: '', file_url: 'data:application/pdf;base64,JVBERi0=', file_name: 'a.pdf', progress: 80 });
  put('documents', { id: 'td2', project_id: 'p1', doc_no: 'E-T02', title: 'Rule drawing by designer', discipline: 'Electrical', doc_type: 'Drawing', revision: 0, status: 'In review', owner_id: 's19', due_date: '2030-01-01', notes: '', file_url: 'data:application/pdf;base64,JVBERi0=', file_name: 'b.pdf', progress: 80 });
  put('defects', { id: 'tf1', project_id: 'p1', location: 'Rule corridor', description: 'Rule defect fixed one', discipline: 'Fire', priority: 'Low', assigned_to: 's12', due_date: '2030-01-01', status: 'Fixed', photo: '', raised_by: 's28', evidence: [], close_evidence: [], correction: 'done', fixed_by: 's12', fixed_at: now });
  put('defects', { id: 'tf2', project_id: 'p1', location: 'Rule lobby', description: 'Rule defect fixed two', discipline: 'Fire', priority: 'Low', assigned_to: 's12', due_date: '2030-01-01', status: 'Fixed', photo: '', raised_by: 's29', evidence: [], close_evidence: [], correction: 'done', fixed_by: 's12', fixed_at: now });
  put('purchase_orders', { id: 'tp1', po_no: 'PO-9901', request_id: '', project_id: 'p1', supplier_id: (d.suppliers[0] || {}).id, description: 'Rule cable', amount: 90, status: 'Ordered', delivered_note: '', delivered_photo: '', delivered_by: '', delivered_at: null, split_flag: false, items: [] });
  localStorage.setItem(k, JSON.stringify(d)); }"""

# change the saved data from a second tab: the open page gets a storage event and updates its data (the window stays open)
async def other_tab(ctx, js):
    pg2 = await ctx.new_page()
    await pg2.goto("http://localhost/index.html#none")
    await pg2.evaluate("(js) => { const k = 'gid-demo-v6', d = JSON.parse(localStorage.getItem(k)); (new Function('d', js))(d); localStorage.setItem(k, JSON.stringify(d)); }", js)
    await pg2.close()


async def main():
    fails, passes = [], 0

    def check(ok, name):
        nonlocal passes
        if ok: passes += 1
        else: fails.append(name)
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await new_context(b)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        data = lambda js: pg.evaluate("(js) => (new Function('d', js))(JSON.parse(localStorage.getItem('gid-demo-v6')))", js)

        async def fresh():
            await login(pg, "s01", "home")
            await pg.evaluate("localStorage.removeItem('gid-demo-v6')"); await pg.reload(); await pg.wait_for_selector(".rail")
            await pg.evaluate(SEED)

        async def as_user(uid, route):
            await login(pg, uid, route); await pg.wait_for_timeout(200)

        async def open_row(route, text, tab=None):
            for _ in range(3):
                if await pg.locator("#modal").count() == 0: break
                await pg.keyboard.press("Escape"); await pg.wait_for_timeout(250)
            await pg.evaluate(f"location.hash = '#{route}'"); await pg.wait_for_timeout(350)
            if tab or route == "requests": await pg.click(".tabs .tab >> text=" + (tab or "All requests")); await pg.wait_for_timeout(250)
            await pg.locator("table.list tbody tr", has_text=text).first.click(); await pg.wait_for_timeout(350)

        has_btn = lambda text: pg.locator("#modal .form-actions .btn", has_text=text).count()

        async def click_btn(text):
            await pg.locator("#modal .form-actions .btn", has_text=text).first.click(); await pg.wait_for_timeout(450)

        async def toast_has(msg):
            await pg.wait_for_timeout(250)
            return msg in " ".join(await pg.locator("#toasts .toast").all_inner_texts())

        async def clear_toasts():
            await pg.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")

        await fresh()

        # ---------- 1. VO PM check ----------
        vo_st = lambda vid: data(f"return d.variations.find((v) => v.id === '{vid}').status")
        await as_user("s01", "vo"); await open_row("vo", "Rule VO one")
        check(await has_btn("PM checked") == 0, "1 MD has no 'PM checked' button")
        await as_user("s04", "vo"); await open_row("vo", "Rule VO one")
        check(await has_btn("PM checked") == 0, "1 PM of another project has no 'PM checked' button")
        await as_user("s03", "vo"); await open_row("vo", "Rule VO one")
        check(await has_btn("PM checked") == 1, "1 the project's PM sees 'PM checked'")
        await click_btn("PM checked")
        check(await vo_st("tv1") == "PM checked", "1 the project's PM can do the PM check")
        # refused at save time: the project's PM changes while the window is open
        await as_user("s03", "vo"); await open_row("vo", "Rule VO two"); await clear_toasts()
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's02';")
        await click_btn("PM checked")
        check(await toast_has(MSG["voPM"]) and await vo_st("tv2") == "Priced", "1 PM check refused when no longer the project's PM (toast)")
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's03';")
        # the person who priced cannot also do the PM check
        await as_user("s03", "vo"); await open_row("vo", "Rule VO two"); await clear_toasts()
        await other_tab(ctx, "const v = d.variations.find((x) => x.id === 'tv2'); v.history[v.history.length - 1].by = 's03';")
        await click_btn("PM checked")
        check(await toast_has(MSG["twice"]) and await vo_st("tv2") == "Priced", "1 no two checks in a row by the same person (toast)")
        await as_user("s03", "vo"); await open_row("vo", "Rule VO two")
        check(await has_btn("PM checked") == 0, "1 the person who priced does not see 'PM checked'")
        # MD approves the price, but not right after their own check
        await as_user("s01", "vo"); await open_row("vo", "Rule VO three")
        check(await has_btn("Approve price") == 0, "1 MD who did the check before cannot approve the price")
        await open_row("vo", "Rule VO one")
        check(await has_btn("Approve price") == 1, "1 MD approves the price after the PM's check")

        # ---------- 2. Mark paid: Finance only ----------
        inv_st = lambda iid: data(f"return d.invoices.find((i) => i.id === '{iid}').status")
        for uid, who in (("s39", "Procurement"), ("s40", "Admin"), ("s33", "System Admin")):
            await as_user(uid, "finance"); await open_row("finance", "Rule supplier one")
            check(await has_btn("Mark paid") == 0, f"2 {who} ({uid}) has no 'Mark paid'")
        await as_user("s34", "finance"); await open_row("finance", "Rule supplier one")
        await click_btn("Mark paid")
        check(await inv_st("ti1") == "Paid", "2 Finance (s34) marks a bill paid")
        await as_user("s36", "finance"); await open_row("finance", "Rule supplier two"); await clear_toasts()
        await other_tab(ctx, "d.staff.find((s) => s.id === 's36').groups = 'ADMIN';")
        await click_btn("Mark paid")
        check(await toast_has(MSG["finance"]) and await inv_st("ti2") == "Unpaid", "2 Mark paid refused for someone no longer in Finance (toast)")
        await other_tab(ctx, "d.staff.find((s) => s.id === 's36').groups = 'FIN';")
        # subcontractor payment waiting for payment: no 'Mark paid' for Procurement
        await other_tab(ctx, "const x = d.sub_payments.find((p) => p.status !== 'Paid') || d.sub_payments[0]; x.status = 'PM approved'; x.pc_no = 'PC-T9'; x.claimed = 777; x.certified = 777; x.retention_amt = 0;")
        await as_user("s39", "subs"); await pg.click(".tabs .tab >> text=Payment certificates"); await pg.wait_for_timeout(250)
        await pg.locator("table.list tbody tr", has_text="PC-T9").first.click(); await pg.wait_for_timeout(350)
        check(await has_btn("Mark paid") == 0, "2 Procurement has no 'Mark paid' on a subcontractor payment")

        # ---------- 3. PMs act only on their own projects ----------
        req_st = lambda: data("const r = d.requests.find((x) => x.id === 'tr1'); return r.status + ':' + r.step_index")
        await as_user("s04", "requests"); await open_row("requests", "Rule request one")
        check(await has_btn("Approve") == 0, "3 PM of another project cannot approve the PM step")
        await as_user("s03", "requests"); await open_row("requests", "Rule request one"); await clear_toasts()
        check(await has_btn("Approve") == 1, "3 the project's PM sees Approve")
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's04';")
        await click_btn("Approve"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await toast_has(MSG["notYours"]) and await req_st() == "Pending:0", "3 request approval refused once the PM is no longer the project's PM (toast)")
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's03';")
        await as_user("s03", "requests"); await open_row("requests", "Rule request one")
        await click_btn("Approve"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await req_st() == "Pending:1", "3 the project's PM approves the PM step")
        # IPC 'PM verified' (ipc2 on p1 is waiting for the PM)
        await as_user("s04", "cost"); await pg.click(".tabs .tab >> text=IPC claims"); await pg.wait_for_timeout(250)
        await pg.locator("table.list tbody tr", has_text="Oct 2026").first.click(); await pg.wait_for_timeout(350)
        check(await has_btn("PM verified") == 0, "3 PM of another project cannot verify the IPC")
        # deliveries
        await as_user("s04", "procurement"); await open_row("procurement", "Rule cable")
        check(await has_btn("Confirm delivery") == 0, "3 PM of another project cannot confirm a delivery")
        await as_user("s03", "procurement"); await open_row("procurement", "Rule cable"); await clear_toasts()
        check(await has_btn("Confirm delivery") == 1, "3 the project's PM can confirm a delivery")
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's04';")
        await click_btn("Confirm delivery"); await pg.fill("#mform textarea[name=delivered_note]", "All arrived")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        po = await data("return d.purchase_orders.find((x) => x.id === 'tp1').status")
        check(await toast_has(MSG["notPM"]) and po == "Ordered", "3 delivery refused once no longer the project's PM (toast)")
        await other_tab(ctx, "d.projects.find((p) => p.id === 'p1').pm_id = 's03';")

        # ---------- 4. Nobody approves their own drawing ----------
        doc_st = lambda did: data(f"return d.documents.find((x) => x.id === '{did}').status")
        await as_user("s18", "docs"); await open_row("docs", "Rule drawing by head")
        txt = await pg.inner_text("#modal")
        check(await has_btn("Approve") == 0 and MSG["ownDoc"] in txt, "4 Head of Design cannot approve own drawing, and is told why")
        await as_user("s01", "docs"); await open_row("docs", "Rule drawing by head")
        await click_btn("Approve")
        check(await doc_st("td1") == "Approved", "4 the MD approves the Head of Design's drawing")
        await as_user("s30", "docs"); await open_row("docs", "Rule drawing by designer"); await clear_toasts()
        check(await has_btn("Approve") == 1, "4 Document Engineer can approve someone else's drawing")
        await other_tab(ctx, "d.documents.find((x) => x.id === 'td2').owner_id = 's30';")
        await click_btn("Approve")
        check(await toast_has(MSG["ownDoc"]) and await doc_st("td2") == "In review", "4 approving own drawing refused at save time (toast)")
        await other_tab(ctx, "d.documents.find((x) => x.id === 'td2').owner_id = 's19';")
        await as_user("s18", "docs"); await open_row("docs", "Rule drawing by designer"); await click_btn("Approve")
        check(await doc_st("td2") == "Approved", "4 Head of Design approves a designer's drawing")

        # ---------- 5. QA/QC pass / fail / close ----------
        f_st = lambda fid: data(f"return d.defects.find((x) => x.id === '{fid}').status")
        await as_user("s28", "qaqc")
        await pg.click(".tabs .tab >> text=Inspections"); await pg.wait_for_timeout(250)
        check(await pg.locator(".main .btn", has_text="New inspection").count() == 1, "5 structural engineer can still raise an inspection")
        await pg.locator("table.list tbody tr", has_text="Banking hall").first.click(); await pg.wait_for_timeout(350)
        check(await has_btn("Passed") == 0 and await has_btn("Failed") == 0, "5 structural engineer cannot pass / fail an inspection")
        await as_user("s29", "qaqc"); await pg.click(".tabs .tab >> text=Inspections"); await pg.wait_for_timeout(250)
        await pg.locator("table.list tbody tr", has_text="Banking hall").first.click(); await pg.wait_for_timeout(350)
        check(await has_btn("Passed") == 1, "5 QA/QC inspector can pass / fail")
        for uid, who in (("s28", "structural"), ("s30", "Document Engineer"), ("s04", "PM of another project")):
            await as_user(uid, "qaqc"); await open_row("qaqc", "Rule defect fixed one")
            check(await has_btn("Close") == 0, f"5 {who} ({uid}) cannot close a defect")
        await as_user("s03", "qaqc"); await open_row("qaqc", "Rule defect fixed one"); await click_btn("Close")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await f_st("tf1") == "Closed", "5 the project's PM closes a defect")
        await as_user("s29", "qaqc"); await open_row("qaqc", "Rule defect fixed two"); await clear_toasts()
        await other_tab(ctx, "d.staff.find((s) => s.id === 's29').tags = '';")
        await click_btn("Close"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await toast_has(MSG["qa"]) and await f_st("tf2") == "Fixed", "5 closing refused for someone without close rights (toast)")
        await other_tab(ctx, "d.staff.find((s) => s.id === 's29').tags = 'QAQC';")
        await as_user("s29", "qaqc"); await open_row("qaqc", "Rule defect fixed two"); await click_btn("Close")
        await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await f_st("tf2") == "Closed", "5 QA/QC inspector closes a defect")

        # ---------- 6. Staff ID number ----------
        sno = lambda sid: data(f"return d.staff.find((s) => s.id === '{sid}').staff_no")
        check(await sno("s01") == "GID-001" and await sno("s40") == "GID-040", "6 demo staff have numbers GID-001 … GID-040")

        async def open_badge(sid):
            await pg.evaluate("location.hash = '#people'"); await pg.wait_for_timeout(300)
            name = await data(f"return d.staff.find((x) => x.id === '{sid}').name")
            node = pg.locator(".main .ocn", has_text=name).first
            await node.scroll_into_view_if_needed(); await node.click(); await pg.wait_for_timeout(1800)

        await as_user("s07", "people"); await open_badge("s08")
        check(await pg.locator("#badges .bdg-noedit").count() == 0, "6 site engineer has no Staff ID pencil")
        check("GID-008" in await pg.inner_text("#badges .front"), "6 badge front shows the Staff ID number")
        await as_user("s35", "people"); await open_badge("s08")
        check(await pg.locator("#badges .bdg-noedit").count() == 1, "6 HR sees the Staff ID pencil")
        await pg.click("#badges .bdg-noedit"); await pg.wait_for_timeout(400)
        await pg.fill("#mform input[name=staff_no]", "GID-001"); await clear_toasts(); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await toast_has("Staff ID number GID-001 is already used by") and await sno("s08") == "GID-008", "6 a number already used is refused (toast)")
        await pg.fill("#mform input[name=staff_no]", "gid-808"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await sno("s08") == "GID-808", "6 HR changes the Staff ID number from the badge")
        await as_user("s33", "people"); await open_badge("s08")
        check("GID-808" in await pg.inner_text("#badges .front") and await pg.locator("#badges .bdg-noedit").count() == 1, "6 System Admin sees the new number and the pencil")
        await pg.locator("#badges .bdg-actions .btn", has_text="Edit").first.click(); await pg.wait_for_timeout(500)
        check(await pg.locator("#mform input[name=staff_no]").input_value() == "GID-808", "6 the Edit form has the Staff ID number")
        await pg.fill("#mform input[name=staff_no]", "GID-002"); await clear_toasts(); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await toast_has("is already used by") and await sno("s08") == "GID-808", "6 Edit form refuses a duplicate number")
        await pg.fill("#mform input[name=staff_no]", "GID-108"); await pg.click("#mform button[type=submit]"); await pg.wait_for_timeout(500)
        check(await sno("s08") == "GID-108", "6 Edit form saves the Staff ID number")
        await pg.evaluate("location.hash = '#people'"); await pg.wait_for_timeout(300)
        await pg.click(".tabs .tab >> text=List"); await pg.wait_for_timeout(200)
        await pg.fill(".main input.search", "GID-108"); await pg.press(".main input.search", "Tab"); await pg.wait_for_timeout(500)
        people = await pg.locator(".main ul.people li").all_inner_texts()
        name8 = await data("return d.staff.find((x) => x.id === 's08').name")
        check(len(people) == 1 and name8 in people[0], f"6 People search finds the Staff ID number ({len(people)})")

        # Khmer: the new messages are translated
        km = await pg.evaluate("""(list) => list.filter((s) => !(window.GID_KM || {})[s])""", list(MSG.values()) + ["Staff ID number"])
        check(not km, f"Khmer for every new message (missing {km})")
        check(not errs, f"no page errors {errs[:3]}")
        await ctx.close(); await b.close()
    print(f"\n{passes} passed, {len(fails)} failed")
    for f in fails: print("  FAIL", f)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    asyncio.run(main())
