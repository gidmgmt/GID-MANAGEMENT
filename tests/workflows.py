"""Workflow test: variations, subcontractor payments (with and without retention), test sheets and handover, as the real roles.
Run from the repo root:  python3 tests/workflows.py   (about 5 minutes)"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from harness import route, login, img_bytes, _pass_hash
IMG=img_bytes('img/staff/s03.jpg')
FILE=[{'name':'a.jpg','mimeType':'image/jpeg','buffer':IMG}]
async def btnm(pg, text): await pg.locator('#modal .btn', has_text=text).first.click(); await pg.wait_for_timeout(350)
async def submit(pg): await pg.click('#mform button[type=submit]'); await pg.wait_for_timeout(500)
async def open_vo(pg, title):
    await pg.goto('http://localhost/index.html#vo'); await pg.wait_for_timeout(400)
    await pg.locator('table.list tbody tr', has_text=title).first.click(); await pg.wait_for_timeout(350)
async def st(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('gid-demo-v6')).variations.find(v=>v.title==='Test VO cable').status")
async def run(b, vp, tag, out):
    ctx=await b.new_context(viewport=vp, device_scale_factor=1 if tag=='d' else 2); await ctx.route('**/*', route); await ctx.add_init_script("try{if(!localStorage.getItem('gid-pass'))localStorage.setItem('gid-pass','%s')}catch(e){}" % _pass_hash()); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    A=lambda k,v: out.append((tag+' '+k, v))
    # --- VO flow
    await login(pg,'s12','vo'); await pg.locator('.main .btn.primary', has_text='New variation').click(); await pg.wait_for_timeout(300)
    await pg.select_option('#mform select[name=project_id]','p1'); await pg.fill('#mform input[name=title]','Test VO cable'); await pg.fill('#mform textarea[name=reason]','Client asked'); await submit(pg)
    A('VO raised', await st(pg)=='Raised')
    await login(pg,'s33','vo'); await open_vo(pg,'Test VO cable'); await btnm(pg,'Price it')
    await pg.locator('.voline[data-i="0"] .l-item').fill('Cable 4mm'); await pg.locator('.voline[data-i="0"] .l-qty').fill('100'); await pg.locator('.voline[data-i="0"] .l-rate').fill('2.5')
    await pg.click('#vo-add'); await pg.locator('.voline[data-i="1"] .l-item').fill('Labour'); await pg.locator('.voline[data-i="1"] .l-qty').fill('1'); await pg.locator('.voline[data-i="1"] .l-rate').fill('100')
    await pg.wait_for_timeout(100); tot=await pg.inner_text('#vo-total'); A('VO total '+tot, '368' in tot)
    if tag=='p': await pg.screenshot(path='v19-price-p.png')
    await pg.click('#voform button[type=submit]'); await pg.wait_for_timeout(500); A('VO priced', await st(pg)=='Priced')
    await login(pg,'s03','vo'); await open_vo(pg,'Test VO cable'); await btnm(pg,'PM checked'); A('PM checked', await st(pg)=='PM checked')
    await login(pg,'s03','vo'); await open_vo(pg,'Test VO cable'); A('PM cannot approve price', await pg.locator('#modal .btn', has_text='Approve price').count()==0)
    await login(pg,'s01','home'); A('MD sees VO in my work', 'Test VO cable' in await pg.inner_text('.main'))
    await open_vo(pg,'Test VO cable'); await btnm(pg,'Approve price'); A('MD approved', await st(pg)=='MD approved')
    await login(pg,'s03','vo'); await open_vo(pg,'Test VO cable'); await btnm(pg,'Sent to client'); await submit(pg); A('sent', await st(pg)=='Sent to client')
    await open_vo(pg,'Test VO cable'); await btnm(pg,'Client approved'); await submit(pg); A('client approval needs evidence', await pg.locator('#mform').count()==1)
    await pg.set_input_files('.evidence input[accept="image/*,application/pdf"]', files=FILE); await pg.wait_for_timeout(500); await submit(pg); A('client approved', await st(pg)=='Client approved')
    await login(pg,'s33','vo'); await open_vo(pg,'Test VO cable'); await btnm(pg,'Add to claim'); await submit(pg); A('in claim', await st(pg)=='In claim')
    await btnm(pg,'PDF English'); await pg.wait_for_selector('#modal iframe.pdf, #modal a.btn[target=_blank]', timeout=30000); A('VO pdf', True); await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
    # --- Subcontractor payment flow
    await login(pg,'s33','subs'); await pg.locator('table.list tbody tr', has_text='Angkor').click(); await pg.wait_for_timeout(300)
    if tag=='d': await pg.screenshot(path='v19-sub-d.png')
    await pg.locator('#modal .btn', has_text='Claim').first.click(); await pg.wait_for_timeout(300)
    await pg.fill('#mform input[name=claimed]','5000'); await submit(pg)
    pst=lambda: pg.evaluate("(()=>{const d=JSON.parse(localStorage.getItem('gid-demo-v6'));const x=d.sub_payments.filter(p=>p.contract_id==='sk1').sort((a,b)=>a.pc_no<b.pc_no?1:-1)[0];return [x.pc_no,x.status,x.certified,x.retention_amt]})()")
    A('claim saved '+str(await pst()), (await pst())[1]=='Claimed')
    await pg.goto('http://localhost/index.html#subs'); await pg.click('.tabs .tab >> text=Payment certificates'); await pg.wait_for_timeout(200)
    await pg.locator('table.list tbody tr', has_text='5,000').first.click(); await pg.wait_for_timeout(300); await btnm(pg,'QS check'); await pg.fill('#mform input[name=certified]','4800'); await submit(pg)
    A('QS checked w/ 5% retention '+str(await pst()), (await pst())[1]=='QS checked' and (await pst())[3]==240)
    await login(pg,'s03','home'); A('PM sees sub payment', 'Angkor MEP Works PC-04' in await pg.inner_text('.main'))
    await pg.locator('.main li', has_text='Angkor MEP Works PC-04').first.click(); await pg.wait_for_timeout(300); await btnm(pg,'PM approve')
    A('PM approved', (await pst())[1]=='PM approved')
    inv=await pg.evaluate("JSON.parse(localStorage.getItem('gid-demo-v6')).invoices.find(i=>i.source_type==='sub_payment' && i.amount===4560)"); A('bill in finance', inv is not None)
    await login(pg,'s34','finance'); await pg.locator('table.list tbody tr', has_text='Angkor').first.click(); await pg.wait_for_timeout(300); await btnm(pg,'Mark paid')
    A('paid synced', (await pst())[1]=='Paid')
    # no-retention contract
    await login(pg,'s33','subs'); await pg.locator('.main .btn.primary', has_text='Add subcontractor').click(); await pg.wait_for_timeout(200)
    await pg.fill('#mform input[name=name]','Tiny Tile Team'); await pg.fill('#mform input[name=trade]','Tiling'); await pg.fill('#mform input[name=phone]','010 1'); await submit(pg)
    await pg.locator('table.list tbody tr', has_text='Tiny Tile').click(); await pg.wait_for_timeout(300); await btnm(pg,'New contract')
    await pg.select_option('#mform select[name=project_id]','p1'); await pg.fill('#mform input[name=scope]','Toilet tiles'); await pg.fill('#mform input[name=contract_value]','3000'); await pg.select_option('#mform select[name=retention_pct]','0'); await submit(pg)
    A('no-retention contract', 'None' in await pg.inner_text('#modal'))
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
    # --- Test sheet with failure → defect
    await login(pg,'s12','handover'); await pg.locator('.main .btn.primary', has_text='New test sheet').click(); await pg.wait_for_timeout(300)
    await pg.select_option('#mform select[name=project_id]','p1'); await pg.select_option('#mform select[name=test_type]','RCD'); await pg.fill('#mform input[name=location]','DB-L1'); await submit(pg)
    await pg.wait_for_timeout(300); A('test sheet editor', await pg.locator('#tform').count()==1)
    rows=pg.locator('#tform .tgrid .tr')
    await rows.nth(0).locator('[data-k=id]').fill('L1-C01'); await rows.nth(0).locator('[data-k=v1]').fill('30'); await rows.nth(0).locator('[data-k=v2]').fill('25'); await rows.nth(0).locator('[data-k=v2]').press('Tab')
    await pg.wait_for_timeout(200)
    rows=pg.locator('#tform .tgrid .tr')
    await rows.nth(1).locator('[data-k=id]').fill('L1-C02'); await rows.nth(1).locator('[data-k=v1]').fill('30'); await rows.nth(1).locator('[data-k=v2]').fill('450'); await rows.nth(1).locator('[data-k=v2]').press('Tab')
    await pg.wait_for_timeout(200)
    if tag=='p': await pg.screenshot(path='v19-test-p.png')
    else: await pg.screenshot(path='v19-test-d.png')
    await pg.click('#tform button[type=submit]'); await pg.wait_for_timeout(700)
    res=await pg.evaluate("(()=>{const d=JSON.parse(localStorage.getItem('gid-demo-v6'));const t=d.tests.find(x=>x.location==='DB-L1');return [t.result,t.rows.length,(t.defect_ids||[]).length, d.defects.filter(f=>/L1-C02/.test(f.description)).length]})()")
    A('test fail + defect '+str(res), res==['Fail',2,1,1])
    await pg.locator('table.list tbody tr', has_text='DB-L1').first.click(); await pg.wait_for_timeout(300); await btnm(pg,'PDF ខ្មែរ'); await pg.wait_for_selector('#modal iframe.pdf, #modal a.btn[target=_blank]', timeout=30000); A('test pdf km', True)
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
    # warranty + handover item
    await login(pg,'s03','handover'); await pg.locator('.main .btn', has_text='Add warranty').click(); await pg.wait_for_timeout(200)
    await pg.select_option('#mform select[name=project_id]','p1'); await pg.fill('#mform input[name=item]','Test pumps'); await pg.fill('#mform input[name=end_date]','2026-12-10'); await submit(pg)
    await login(pg,'s03','home'); A('PM warranty alert', 'Test pumps ends in' in await pg.inner_text('.main'))
    # site engineer project page tabs
    await login(pg,'s12','projects'); await pg.locator('table.list tbody tr').first.click(); await pg.wait_for_timeout(400)
    tabs=await pg.locator('.ptabs button').all_inner_texts(); A('site tabs '+','.join(t.split('\n')[0] for t in tabs), 'Cost' not in ''.join(tabs) and 'Handover' in ''.join(tabs))
    await pg.screenshot(path=f'v19-site-proj-{tag}.png')
    # finance / design nav
    await login(pg,'s20','dashboard'); nv=await pg.locator('.nav').inner_text(); A('designer no subs', 'Subcontractors' not in nv)
    A('errs '+str(errs[:3]), not errs); await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); out=[]
        for vp,tag in [({'width':1440,'height':900},'d'),({'width':390,'height':844},'p')]:
            try: await run(b,vp,tag,out)
            except Exception as e: out.append((tag+' EXC '+str(e)[:300], False))
        for k,v in out: print('OK  ' if v else 'FAIL', k)
        await b.close()
if __name__=="__main__": asyncio.run(main())
