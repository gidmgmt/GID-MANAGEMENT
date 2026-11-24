# GID Management System: rules for the Claude developer team

This repository is the **GID Management System**, a company management web app for **Green In Design (GID)**, a construction company in Phnom Penh, Cambodia (structure, architecture, MEP, ELV; about 45 staff).
The owner is **Jack** (project/technical coordination). He does not write code. Explain things in plain words, short, no jargon.

Live site: https://gidmgmt.github.io/GID-MANAGEMENT/ (GitHub Pages, deploys from `main` about 1 minute after a push).
Database: Supabase project `bsqbdfpgsrsostronjyv` (use the Supabase connector; never a password).

## The team (in `.claude/agents/`)
The main session is the **team lead**: it talks to Jack, plans, splits work, reviews, merges and deploys. It delegates to:

| Agent | Does | Edits files? |
|---|---|---|
| `gid-frontend-dev` | New screens and changes in `app.js`, `styles.css`, `index.html` | yes |
| `gid-database-dev` | Supabase tables, `supabase/update-vNN.sql`, RLS, triggers, Telegram alerts | yes (SQL files); runs SQL only when the lead asks |
| `gid-khmer-ux` | Khmer translations (`i18n-km.js`), phone layout, wording for site workers | yes |
| `gid-qa-tester` | Writes and runs Playwright tests in `tests/`, reports bugs with steps | tests only, never app files |
| `gid-security-reviewer` | Reviews every change before deploy: secrets, permissions, data leaks | no (read-only) |

Typical flow for a feature: lead plans → (optional) mock-up screenshots for Jack → frontend + database + khmer work → qa-tester runs `tests/smoke.py`, `tests/workflows.py` and a test for the new feature → security-reviewer → lead deploys → lead reports to Jack.
Give each agent a precise brief: the files, the business rule, the roles involved and what "done" means. Agents running at the same time must not edit the same file.

## Hard rules (everyone)
- **Never put secrets in any file, commit, chat or memory**: no Telegram bot token, no Supabase database password, no `service_role` key. The bot token lives only in Supabase `private.settings`. `config.js` holds only the public URL and anon key.
- **The demo uses fake data only** until real staff logins and per-role security exist. Say so if Jack asks to load real company data.
- Do not delete staff or data: use soft delete (`left_on`, status changes). Keep history.
- Before any push: check that nobody changed `main` since your last pull (`git fetch`, compare); never overwrite Jack's own uploads (for example `splash-particles.js`, the particle intro, came from him).
- Do not commit test output, screenshots or `tests/.libs/`.
- Ask Jack before changing a business rule (who approves what). Fix bugs without asking.

## How the app is built
Plain HTML/JS, no build step. Files:
- `index.html`: start screen with three tabs (Sign in · Create account · Demo passkey), particle intro, loads the scripts. Accounts: see `docs/AUTH-SPEC.md` (private.accounts / private.sessions, `gid_*` functions, `authRpc()` in app.js, `window.GID_AUTH`).
- `config.js`: `window.GID_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }`. Empty values = **local mode** (localStorage `gid-demo-v6`, used by all tests).
- `data.js`: `GID.TABLES` (every table and column → also drives `tools/gen-sql.js`), `GID.PERMS` (module × user group → none/view/own/edit/approve/admin), seed data (`seed()`), staff list with groups and tags (MD, PM, SITEMGR, HEAD, QAQC, DOC, HR, PROC, SYSADMIN, BACKUPADMIN…).
- `app.js` (~6k lines, one IIFE):
  - `SCREENS.<route>(u)` returns HTML for `#route`; `NAV` = `[route, label, module, group]`; `can(u, module, level)`.
  - UI helpers: `formModal(title, fields, onSubmit, submitLabel, opts)` (`opts.onReady`, `opts.extraHtml`), `detail()`, `openModal()`, `btn()`, `act()` (data-act click handlers), `table()`, `tabs()`, `toast()`.
  - Data: `save()`, `patch()`, `Store.insert/update`, `byId()`, `nextNo()` / `nextCode()` for numbers.
  - Requests: `approversFor()`, `decide()`.
  - Alerts: `NOTE_MODULE`, `NOTE_ICON`, `directRecipients()` → `notifications` table → Supabase trigger `notify_telegram` → Telegram.
  - Dates: always local Phnom Penh dates (`today()`, `dateInPP()`), never `toISOString().slice(0,10)`.
  - PDFs: `makePdf()` with English and Khmer labels.
- `i18n.js` + `i18n-km.js`: Khmer by exact string plus regex patterns `[regex, (m, tr) => …]`. Every new English UI string needs a Khmer entry.
- `styles.css`: light and dark (`html[data-theme="dark"]`), phone breakpoint 640px. Wide tables inside windows go in `<div class="tscroll">`.
- `supabase/`:
  - `schema.sql`: full schema, regenerate with `node tools/gen-sql.js`.
  - `update-vNN.sql`: one safe upgrade file per version, using `if not exists`.
  - `telegram-setup.sql`: placeholder token only.

## Testing (required before every deploy)
```
npm install --prefix tests/.libs jspdf html2canvas @fontsource/noto-sans-khmer @fontsource/plus-jakarta-sans   # once, optional (PDFs/fonts)
python3 tests/smoke.py       # every screen × 13 roles × desktop/phone × English/Khmer-dark, plus key permission rules
python3 tests/workflows.py   # variations, subcontractor payments, retention, test sheets, handover
```
Use `tests/harness.py` (`new_context`, `login(pg, staff_id, route)`) for new tests. It runs offline in local mode, never touches Supabase, and opens the app as a remembered device, so **nobody needs the passkey for testing**. Never ask Jack for the passkey or write it anywhere.
Staff ids: s01 MD · s02–s05 PM · s06 Site Manager · s07–s17 site engineers · s18 Head of Design · s19–s27 design · s28 structural · s29 QA/QC · s30 Document Engineer (backup admin) · s31–s33 QS (s33 System Admin) · s34–s38 Finance · s35 HR · s39 Procurement · s40 Admin.

## Deploying (lead only)
1. All tests pass; security review done.
2. Bump the version notes in `SETUP.md` ("Version NN" section, plain words). If the database changes: add `supabase/update-vNN.sql`, run it on Supabase with the connector (`execute_sql`), verify, then regenerate `schema.sql`.
3. `git fetch` and confirm `origin/main` is what you last pulled, then commit with a clear message and push to `main`.
4. Wait about 1 minute and check the live site serves the new files.
5. Tell Jack in plain words: what changed, what to tell staff, whether to press **Reset demo** (only the System Admin, once; it wipes everyone's test data).

## Business rules (keep them true)
- Requests: Material/Purchase/Payment → PM → QS → MD (only USD 500+) → Procurement/Finance. Petty cash → PM → MD (500+) → Finance. Leave → line manager → HR. Overtime → line manager. Line manager: site staff → project PM; office teams → department head. A PO cannot exceed the approved amount.
- Site reports: Morning (late after 09:00), End of day (photos required), Overtime; GPS within 200 m of the site pin; date is always today; offline queue.
- Documents: Draft → In review (PDF required) → Approved (Head of Design / Engineering) → Issued (Document Engineer / System Admin); one number per project; newest revision wins.
- VO: Raised → Priced (QS) → PM checked → MD approves price → Sent to client → Client approved (signed copy) → In claim.
- Subcontractors: Claimed → QS checked (certified ≤ claimed; retention by contract %, 0% allowed) → PM approved (creates bill) → Paid by Finance. Retention released by bill.
- IPC: Draft → QS checked → PM verified → MD approved → Invoiced → Paid.
- Devices: only the System Admin and backup admin can sign devices out.
- Open questions waiting for Jack's decision (do not change until he answers): MD doing the "PM checked" step on VOs; who may mark payments paid (Finance only?); whether any PM may act on any project; whether drawings need a second approver; QA/QC closing rights for all engineering staff.
