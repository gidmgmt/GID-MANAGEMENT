# Tests

Automated browser tests (Python Playwright). They run the app from this folder in **local mode**: no Supabase, no Telegram, no internet. Nothing in the live system is touched.

```
pip install playwright && python3 -m playwright install chromium        # once
npm install --prefix tests/.libs jspdf html2canvas @fontsource/noto-sans-khmer @fontsource/plus-jakarta-sans   # once, optional
export GID_PASSKEY='…'     # the demo passkey, from the System Admin (never write it in a file)
python3 tests/smoke.py       # all screens, 13 roles, desktop + phone, English + Khmer dark (about 3 min)
python3 tests/workflows.py   # variations, subcontractors, retention, test sheets, handover (about 5 min)
```
Write new tests with `harness.py`: `ctx = await new_context(browser, phone=True)`, `await login(pg, "s13", "daily")`.
