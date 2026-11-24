# GID alerts: what each Telegram message says (version 23)

**For Jack, in short:** today every alert looks the same ("🔔 title, one line, name · date") and the words come from the app's internal log: lower-case status codes ("qs checked"), no project, no amount, no reason when something is rejected, English only. From version 23 every alert has the same clear shape: **what kind of alert it is**, **what happened with the reference number**, the **project / amount / date** when there is one, then **the same in Khmer**, then who sent it and when.

Developers: what each new database column means is in section 6, "For developers", at the end.

The database part (the Telegram sender) is ready in `supabase/update-v23.sql`. The app part (writing the new texts below into each alert) is the front-end developer's next job. Until then, alerts keep today's look.

---

## 1. The seven kinds of alert

| Icon | Kind (English · Khmer) | Meaning for the person who receives it |
|---|---|---|
| ⚠️ | **ACTION NEEDED** · រង់ចាំអ្នកចាត់ការ | Something is waiting for **you** (approve, check, pay, fix, issue). |
| ✅ | **APPROVED / DONE** · បានអនុម័ត / រួចរាល់ | Your item was approved, paid, passed or finished. |
| ❌ | **REJECTED / RETURNED** · បានបដិសេធ / បញ្ជូនត្រឡប់ | Your item was rejected, returned with comments, failed or cancelled. The reason is always shown. |
| 📅 | **REMINDER** · ការរំលឹក | Meetings, inspections and other dates in the schedule. |
| 📢 | **ANNOUNCEMENT** · សេចក្តីជូនដំណឹង | Company announcement from management, sent exactly as written. |
| ℹ️ | **FOR YOUR INFORMATION** · សម្រាប់ជាព័ត៌មាន | Something happened on your project; nothing to do. |
| 🎉 | **WELCOME** · សូមស្វាគមន៍ | A new colleague joined, or your account is ready. |

**One alert can be a different kind for different people.** Example: a new petty-cash request is ⚠️ *Action needed* for the PM who must approve it, but ℹ️ *For your information* for the Site Manager who follows the project.

## 2. The message layout

```
⚠️ ACTION NEEDED · Requests                  ← kind + module (bold)
REQ-0012 · Petty cash waiting for your approval   ← what happened, with the reference (bold)
Water pump repair, Block B                   ← one short detail line
Project / គម្រោង: DEMO-101 · Riverside Villa    ← only the lines that apply
Amount / ទឹកប្រាក់: $650
Date / កាលបរិច្ឆេទ: needed by 28 Nov 2026

រង់ចាំអ្នកចាត់ការ · សំណើ                      ← kind + module in Khmer (always there)
REQ-0012 · សំណើសាច់ប្រាក់តូចតាច រង់ចាំការអនុម័តរបស់អ្នក   ← Khmer title (bold)
ជួសជុលម៉ាស៊ីនបូមទឹក អគារ B                     ← Khmer detail

Sok Dara · 25 Nov 2026 14:05                 ← who did it · Phnom Penh time (italic)
[ Open in GID / បើកក្នុង GID ]               ← button
```

**Why English first and Khmer below (not mixed line by line):**
- The reference, project code, amount, dates and names are the same in both languages, so they are written **once**, with two-language labels (`Project / គម្រោង`). Nothing is repeated.
- Office staff (QS, Finance, Design, management) work in English; site staff read Khmer. Each group reads its own block from top to bottom without jumping between languages.
- The phone's pop-up preview shows the first two lines. The icon (⚠️ ✅ ❌ 📅) already tells everybody, in any language, what kind of alert it is.
- If you prefer **Khmer first**, it is a small change in one place (the database). See "Decisions" below.

Long texts are cut safely (Telegram's limit is 4,096 characters). Announcements longer than about 3,300 characters end with "Read the rest in GID".

## 3. Every alert, one row each

Placeholders: `{ref}` reference number · `{project}` project number and name, always written `{code} · {name}` (for example `DEMO-101 · Tower A Office Fit-out`), never the number alone · `{amount}` amount in USD · `{person}` who did it · `{date}` a date · `{type}` request type · `{title}` the item's own title · `{step}` approval step · `{reason}` the comment typed by the person who rejected or returned it. Khmer words for types, steps and statuses come from the app's Khmer list (`i18n-km.js`), shown here as `{type_km}`, `{step_km}`.

"Today" quotes the current text; "Problem" says what is wrong with it.

### Requests & Approvals (`requests`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| R1 | ⚠️ | A request is sent | The first approver (PM, line manager...) | `{ref} · {type} request waiting for your approval` / `{ref} · សំណើ{type_km} រង់ចាំការអនុម័តរបស់អ្នក` | `{title}` · Project · Amount · Date: needed by `{date}` (leave: `{date}` to `{date}`, `{n}` days) | "REQ-0012 · new petty cash request" / "Water pump · $650 · DEMO-101 · waiting for Sok Dara, Chan Lina" · Does not say it is waiting for *you*; lists names instead; English only. |
| R2 | ⚠️ | A step is approved and the next person must act | The next approver (QS, MD for USD 500+, Procurement, Finance, HR) | `{ref} · {type} request waiting for your {step}` / `{ref} · សំណើ{type_km} រង់ចាំ{step_km}របស់អ្នក` | `{title}` · "Approved by {person} ({step})" · Project · Amount | "REQ-0012 · waiting: QS check" · Internal step label, does not say who approved before. |
| R3 | ℹ️ | Same moment as R2 | Requester and PM | `{ref} · {type} request approved by {person}, now with {next person}` / `{ref} · សំណើ{type_km} បានអនុម័តដោយ {person} ឥឡូវនៅ {next person}` | `{title}` · Project · Amount | Same text as R2 for everybody · Requester cannot tell where it is. |
| R4 | ✅ | Last step done | Requester, PM; HR for leave; HR and MD for overtime | `{ref} · {type} request approved` / `{ref} · សំណើ{type_km} ត្រូវបានអនុម័ត` | `{title}` · what happens next ("PO {po} issued to {supplier}" / "Paid by Finance" / "Leave recorded") · Project · Amount | "REQ-0012 approved (+1 more)" · No amount, no next step; "(+1 more)" means nothing to staff. |
| R5 | ❌ | Any approver rejects | Requester, PM | `{ref} · {type} request rejected by {person}` / `{ref} · សំណើ{type_km} ត្រូវបានបដិសេធដោយ {person}` | "Reason: {reason}" · `{title}` · Amount | "REQ-0012 rejected" · **No reason**, no name. |
| R6 | ℹ️ | Requester cancels | PM, the approver who was waiting | `{ref} · {type} request cancelled by {person}` / `{ref} · សំណើ{type_km} ត្រូវបានលុបចោលដោយ {person}` | `{title}` · Amount | "REQ-0012 cancelled" · Approver does not know it is off their list. |

### Procurement (`procurement`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| P1 | ℹ️ | PO issued | Procurement, PM, requester, site team | `{ref} · Purchase order sent to {supplier}` / `{ref} · ការបញ្ជាទិញបានផ្ញើទៅ {supplier}` | `{items}` · "For request {req}" · Project · Amount | "PO-0007 ordered" / "Cement x50 · ABC Co · $1,200" · Status word only; no project. |
| P2 | ⚠️ Finance · ℹ️ others | Site confirms delivery | Finance (to pay), Procurement, PM, requester, site team | Finance: `{ref} · Delivered: supplier bill {inv} to pay` / `{ref} · បានដឹកមកដល់៖ វិក្កយបត្រ {inv} ត្រូវបង់`. Others: `{ref} · Delivered on site` / `{ref} · បានដឹកមកដល់ការដ្ឋាន` | `{supplier}` · "Received by {person}" · Project · Amount · Date: due `{date}` | "PO-0007 delivered (+3 more)" · Finance is not told a bill is waiting; stock lines merged as "+3 more". |
| P3 | ✅ | Finance pays the supplier | Procurement, PM, requester | `{ref} · Supplier paid` / `{ref} · បានបង់ប្រាក់អ្នកផ្គត់ផ្គង់` | `{supplier}` · Project · Amount | "PO-0007 paid" · OK but no amount. |
| P4 | ⚠️ | **New:** a PO looks like a split order (same supplier, same project, 7 days, total USD 500+) | MD | `{ref} · Possible split order: please check` / `{ref} · អាចជាការបំបែកការបញ្ជាទិញ៖ សូមពិនិត្យ` | "{supplier} has {total} on this project in 7 days" · Project · Amount | Today only a pop-up on the buyer's screen says "Flagged for the MD"; **the MD gets nothing**. |
| P5 | ℹ️ | Supplier added or changed | Procurement, Admin | `New supplier: {name}` / `Supplier changed: {name}` (KM `អ្នកផ្គត់ផ្គង់ថ្មី៖` / `បានកែប្រែអ្នកផ្គត់ផ្គង់៖`) | category, phone | "New supplier ABC Co" · OK, English only. |

### Stock (`stock`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| S1 | ℹ️ | Stock received, issued, moved or counted | Procurement, PM, site team, the person who did it | `{item}: {qty} {unit} received / issued / moved / counted` / `{item}៖ បានទទួល / បានបញ្ចេញ / បានផ្ទេរ / បានរាប់ {qty} {unit}` | Store · "Now {qty} {unit} in total" · Project · ref (PO / request) | "Stock receive: Cement" / "+50 bag · Main store · now 120 bag" · "Stock receive", "Stock adjust" are not real English; internal word "adjust". |
| S2 | ⚠️ Procurement · ℹ️ QS | Stock falls below the minimum | Procurement (to reorder), QS | `Low stock: {item} ({qty} {unit} left, minimum {min})` / `ស្តុកទាប៖ {item} (នៅសល់ {qty} {unit}, អប្បបរមា {min})` | Store · Project | "(below minimum)" added to the end of S1 · Easy to miss; nobody is asked to act. |
| S3 | ℹ️ | New stock item or store | Procurement, Admin | `New stock item: {name}` / `New store: {name}` (KM `ទំនិញស្តុកថ្មី៖` / `ឃ្លាំងថ្មី៖`) | unit, minimum / project | OK, English only. |

### Daily reports (`daily`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| D1 | ℹ️ | Site report sent on time | PM, Site Manager; site team when it lists an issue | `{Morning / End of day / Overtime} report from {person}` / `របាយការណ៍{ពេលព្រឹក / ចុងថ្ងៃ / ថែមម៉ោង} ពី {person}` | "{n} workers · {n} photos" · "Issue: {issue}" · Project · Date: `{date}` | "DEMO-101 end of day report" / "26 workers · 3 photos · issue: gypsum board ru…" · Issue cut at 60 characters; no author. |
| D2 | ℹ️ (marked) | Morning report late, or sent away from site / without location | Same as D1 **plus MD** | `LATE morning report ({n} min) from {person}` or `· report sent AWAY FROM SITE ({distance})` / `របាយការណ៍ពេលព្រឹក យឺត ({n} នាទី) ពី {person}` / `· ផ្ញើក្រៅការដ្ឋាន` | Location note · workers · Project | Same text as D1 · **MD is alerted because it is late, but the text does not say it is late.** |
| D3 | ℹ️ | Design daily work sent | Head of Design, PMs of the projects listed | `Daily work from {person}: {hours} hours` / `ការងារប្រចាំថ្ងៃពី {person}៖ {hours} ម៉ោង` | projects and drawings worked on | "Sok sent daily work" / "7.5 hours" · OK, English only. |
| D4 | ✅ | A report is marked reviewed | The author | `Your {session} report of {date} was reviewed by {person}` / `របាយការណ៍{session_km} ថ្ងៃ {date} របស់អ្នក ត្រូវបានពិនិត្យដោយ {person}` | Project | **Bug:** same title as D1 ("DEMO-101 end of day report"), so it looks like a new report; and the author is not in the list. |

### Documents & drawings (`docs`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| DC1 | ℹ️ | New document or new revision | Owner, PM, project design team | `{doc no} rev {n} · New drawing: {doc title}` / `{doc no} rev {n} · ប្លង់ថ្មី៖ {doc title}` | discipline · Project | "A-101 rev 0 · draft" · No drawing title; "draft" is a status code. |
| DC2 | ℹ️ | PDF uploaded or progress changed | Same as DC1 | `{doc no} rev {n} · PDF added` / `… progress {p}%` (KM `បានបន្ថែម PDF` / `វឌ្ឍនភាព {p}%`) | Project | Same "A-101 rev 0 · draft" as DC1 · Looks like a new document; noisy. **Suggest: bell only, no Telegram.** |
| DC3 | ⚠️ checkers · ℹ️ others | Sent for review | Head of Design and Engineering (to check), owner, PM | `{doc no} rev {n} · Drawing waiting for your review` / `{doc no} rev {n} · ប្លង់រង់ចាំការពិនិត្យរបស់អ្នក` | `{doc title}` · Project · Date: due `{date}` | "A-101 rev 0 · in review" · Does not ask anyone to act. |
| DC4 | ❌ | Returned with comments | Owner, PM | `{doc no} rev {n} · Returned with comments by {person}` / `{doc no} rev {n} · បញ្ជូនត្រឡប់ជាមួយមតិយោបល់ដោយ {person}` | "Comments: {reason}" · Project | "A-101 rev 0 · draft" · **Does not say it was returned, no comments.** |
| DC5 | ⚠️ Document Engineer · ✅ owner | Approved | Document Engineer (to issue), owner, PM | DOC: `{doc no} rev {n} · Approved: please issue` / `… បានអនុម័ត៖ សូមចេញផ្សាយ`. Owner: `{doc no} rev {n} · Approved by {person}` / `… បានអនុម័តដោយ {person}` | `{doc title}` · Project | "A-101 rev 0 · approved" · Document Engineer is not told to act. |
| DC6 | ℹ️ | Issued (old revision superseded) | Site team, Site Manager, PM, owner | `{doc no} rev {n} · Issued for construction: {doc title}` / `{doc no} rev {n} · បានចេញផ្សាយសម្រាប់សាងសង់៖ {doc title}` | "Replaces rev {n-1}" · Project | "A-101 rev 1 · issued (+1 more)" · Site does not know the old one is replaced. |

### Projects & Tasks (`projects`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| PJ1 | ℹ️ | New project (also from a won site visit) | All PMs, MD | `New project {project}` / `គម្រោងថ្មី {project}` | client · PM · "From site visit {svr}" | "New project DEMO-104" · No name or client. |
| PJ2 | ℹ️ | PM changed | New PM, PMs, MD | `{project}: {person} is now Project Manager` / `{project}៖ {person} ជាប្រធានគម្រោងថ្មី` | Project | "DEMO-101 Project Manager: Sok" · OK, English only. |
| PJ3 | ℹ️ | Added to / removed from a project team | The person, PM | `You were added to {project}` / `You were removed from {project}` (KM `អ្នកត្រូវបានបញ្ចូលក្នុងគម្រោង {project}` / `…ដកចេញពីគម្រោង {project}`) | role | "Assigned Sok to DEMO-101" · The person reads their own name in the third person. |
| PJ4 | ℹ️ | Progress updated | PM, PMs, MD (by preference) | `{project} progress now {p}%` / `{project} វឌ្ឍនភាពឥឡូវ {p}%` | per scope (Architecture 50%, MEP 30%) | OK, English only. |
| PJ5 | ℹ️ | Site location or handover date set | PM, PMs, MD | `{project}: site location saved` / `{project}: handover date {date}` (KM `បានរក្សាទុកទីតាំងការដ្ឋាន` / `ថ្ងៃប្រគល់ {date}`) | defects period | "DEMO-101 handover date 2026-12-01" · Raw computer date. |
| PJ6 | ⚠️ | New task assigned | The person assigned | `New task for you: {task}` / `កិច្ចការថ្មីសម្រាប់អ្នក៖ {task}` | Project · Date: due `{date}` · priority | "New task: Fix door" · No due date or project. |
| PJ7 | ℹ️ (✅ when done) | Task started, done, reopened or changed | Creator, assignee, PM | `Task done: {task}` / `started` / `reopened` / `changed` (KM `កិច្ចការរួចរាល់៖` / `បានចាប់ផ្តើម` / `បានបើកឡើងវិញ` / `បានកែប្រែ`) | Project · by `{person}` | OK, English only. |

### Cost & Claims – IPC (`cost`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| C1 | ℹ️ | New IPC draft | PM, QS | `{project} IPC {n} started` / `{project} IPC {n} បានចាប់ផ្តើម` | period · Amount claimed | "DEMO-101 IPC 3 · draft" · Status code. |
| C2 | ⚠️ next person · ℹ️ others | IPC moves a step (QS checked, PM verified, MD approved, Invoiced) | The next person (PM to verify, MD to approve, Finance to invoice / collect), QS, PM | `{project} IPC {n} waiting for your {step}` / `{project} IPC {n} រង់ចាំ{step_km}របស់អ្នក` | "{previous step} by {person}" · Amount certified · Project | "DEMO-101 IPC 3 · qs checked" / "md approved" · Lower-case internal codes; nobody is told to act. |
| C3 | ✅ | Client paid the IPC | PM, QS, Finance, MD | `{project} IPC {n} paid by the client` / `{project} IPC {n} ម្ចាស់គម្រោងបានបង់ប្រាក់` | Amount · invoice `{inv}` | "IPC paid" (or "DEMO-101 IPC 3 · paid") · No amount. |
| C4 | ℹ️ | Cost line actual changed | PM, QS | `{project} {category}: actual cost now {amount}` / `{project} {category}៖ ចំណាយជាក់ស្តែងឥឡូវ {amount}` | budget | OK, English only. |

### Finance (`finance`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| F1 | ⚠️ | New bill to pay (supplier, subcontractor, retention) | Finance; PM for information | `{inv} · New bill to pay: {party}` / `{inv} · វិក្កយបត្រថ្មីត្រូវបង់៖ {party}` | "For {PO / PC / retention}" · Project · Amount · Date: due `{date}` | "Subcontractor bill ABC PC-02: $3,000" / "Retention release ABC: $900" · Finance is not clearly asked to pay; no due date. |
| F2 | ℹ️ | New client invoice (from an MD-approved IPC) | Finance, PM, MD | `{inv} · Client invoice for IPC {n}` / `{inv} · វិក្កយបត្រអតិថិជនសម្រាប់ IPC {n}` | client · Project · Amount | "Invoice for IPC 3" · No amount or client. |
| F3 | ✅ | Bill paid / client payment received | Finance, PM (MD for client payments) | `{inv} · Paid to {party}` / `{inv} · Received from {client}` (KM `បានបង់ឱ្យ` / `បានទទួលពី`) | Project · Amount | "AP-0012 paid" · No amount or party. |

### QA/QC (`qaqc`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| Q1 | ⚠️ inspector · ℹ️ others | Inspection request sent | Inspector, PM, site team | `Inspection request: {title}` / `សំណើត្រួតពិនិត្យ៖ {title}` | location · Project · Date: `{date}` | "Inspection: Rebar level 3" · Inspector is not asked to act; no date. |
| Q2 | ✅ | Inspection passed | Requester, PM, site team | `Inspection passed: {title}` / `ការត្រួតពិនិត្យបានឆ្លង៖ {title}` | note · Project | "Inspection passed: …" · OK, English only. |
| Q3 | ❌ | Inspection failed | Same | `Inspection failed: {title}` / `ការត្រួតពិនិត្យមិនឆ្លង៖ {title}` | "Reason: {note}" · Project | "Inspection failed: …" · No reason. |
| Q4 | ⚠️ | Defect raised and assigned | The person assigned; raiser and PM for information | `Defect to fix: {description}` / `ចំណុចខ្វះខាតត្រូវជួសជុល៖ {description}` | location · priority · Project · Date: due `{date}` | "Defect: cracked tile" · Not addressed to the person who must fix it; no due date. |
| Q5 | ⚠️ | Defect marked fixed | The person who raised it (to verify), PM | `Defect fixed, please check: {description}` / `បានជួសជុលរួច សូមពិនិត្យ៖ {description}` | "Fixed by {person}" · Project | "Defect fixed: …" · Raiser is not asked to verify. |
| Q6 | ✅ | Defect closed | Assignee, PM | `Defect closed: {description}` / `បានបិទចំណុចខ្វះខាត៖ {description}` | Project | OK, English only. |
| Q7 | ❌ | Defect reopened | Assignee, PM | `Defect reopened: {description}` / `បានបើកចំណុចខ្វះខាតឡើងវិញ៖ {description}` | "Reason: {note}" · Project | "Defect reopened: …" · No reason. |

### Safety (`safety`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| SF1 | ⚠️ | High-severity incident or near miss | Reporter, PM, Site Manager, MD, all PMs | `HIGH severity {type} on {project}` / `{type_km} កម្រិតធ្ងន់ធ្ងរខ្ពស់ នៅ {project}` | what happened · Project · Date: `{date}` | "Safety: Near miss (High)" · **No project**, no description. |
| SF2 | ℹ️ | Other safety record (toolbox talk, observation, low/medium incident) | Reporter, PM, Site Manager | `{type} on {project}` / `{type_km} នៅ {project}` | short description · Project | "Safety: Toolbox talk" · No project. |
| SF3 | ✅ | Safety record closed | Reporter, PM, Site Manager | `Safety {type} closed on {project}` / `បានបិទ{type_km} នៅ {project}` | correction · Project | "Safety record closed: Near miss" · No project. |

### Site visits – SVR (`svr`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| V1 | ℹ️ | New site visit report | MD, PMs, visitors, action owners | `{svr} · Site visit: {client}` / `{svr} · ការចុះពិនិត្យទីតាំង៖ {client}` | location · scopes · Date: `{date}` | "SVR-0004 site visit: ABC" · OK, English only. |
| V2 | ✅ | MD approves the report | Author, visitors | `{svr} · Report approved by {person}` / `{svr} · របាយការណ៍បានអនុម័តដោយ {person}` | client | "SVR-0004 approved by Sok" · OK, English only. |
| V3 | ℹ️ (✅ when won) | Quoted, won, lost or back to lead | MD, PMs, author | `{svr} · Quotation sent` / `Won: project {project}` / `Lost` (KM `បានផ្ញើសម្រង់តម្លៃ` / `ឈ្នះ៖ គម្រោង {project}` / `មិនបានឈ្នះ`) | Amount · "Reason: {reason}" when lost | "SVR-0004 lost: price" · OK-ish. |
| V4 | ⚠️ | An action from a visit is given to someone | The action owner | `{svr} · Action for you: {action}` / `{svr} · សកម្មភាពសម្រាប់អ្នក៖ {action}` | client · Date: due `{date}` | Only "SVR-0004 updated" · Owner does not know what to do. |

### Variations – VO (`vo`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| VO1 | ⚠️ | VO raised | QS (to price), PM | `{vo} · New variation to price: {title}` / `{vo} · ការងារកែប្រែថ្មីត្រូវដាក់តម្លៃ៖ {title}` | Project | "VO-101-003 raised: Extra socket" · QS not asked to act. |
| VO2 | ⚠️ | QS priced it | PM (to check), raiser | `{vo} · Priced, waiting for your check` / `{vo} · បានដាក់តម្លៃ រង់ចាំការពិនិត្យរបស់អ្នក` | `{title}` · Amount · "+{days} days" · Project | "VO-101-003 priced: $1,200" · OK, English only. |
| VO3 | ⚠️ | PM checked | MD (to approve the price) | `{vo} · Price waiting for your approval` / `{vo} · តម្លៃរង់ចាំការអនុម័តរបស់អ្នក` | `{title}` · Amount · Project | "VO-101-003 Extra socket: PM checked" · Internal status. |
| VO4 | ⚠️ PM · ✅ others | MD approved the price | PM / QS (to send to client), raiser | `{vo} · Price approved: send to the client` / `{vo} · តម្លៃបានអនុម័ត៖ សូមផ្ញើទៅម្ចាស់គម្រោង` | Amount · Project | "…: MD approved" · Nobody told to send. |
| VO5 | ℹ️ | Sent to client | QS, MD, raiser, PM | `{vo} · Sent to the client` / `{vo} · បានផ្ញើទៅម្ចាស់គម្រោង` | "How: {method}" · Amount | "…: Sent to client" · OK-ish. |
| VO6 | ✅ | Client approved (signed copy) | QS, MD, raiser, PM | `{vo} · Client approved: add to the next IPC` / `{vo} · ម្ចាស់គម្រោងបានយល់ព្រម៖ បញ្ចូលក្នុង IPC បន្ទាប់` | client ref · Amount | "…: Client approved" · OK-ish. |
| VO7 | ❌ | Sent back to QS | QS, raiser | `{vo} · Returned to QS by {person}` / `{vo} · បញ្ជូនត្រឡប់ទៅ QS ដោយ {person}` | "Reason: {reason}" | "…: Raised" · **Reads like a new VO; no reason.** |
| VO8 | ❌ | VO cancelled | Raiser, PM, QS | `{vo} · Cancelled by {person}` / `{vo} · បានលុបចោលដោយ {person}` | "Reason: {reason}" | "…: Cancelled" · No reason. |
| VO9 | ℹ️ | Added to an IPC | QS, MD, PM | `{vo} · Added to IPC {n}` / `{vo} · បានបញ្ចូលក្នុង IPC {n}` | Amount | OK, English only. |

### Subcontractors (`subs`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| SB1 | ⚠️ | Payment claim received | QS (to check), PM | `{pc} · {sub} payment claim to check` / `{pc} · ការស្នើទូទាត់របស់ {sub} ត្រូវពិនិត្យ` | Amount claimed · Project | "ABC payment claim $3,000 · DEMO-101" · No PC number; QS not asked. |
| SB2 | ⚠️ | QS checked | PM (to approve) | `{pc} · {sub} claim checked: waiting for your approval` / `{pc} · បានពិនិត្យ រង់ចាំការអនុម័តរបស់អ្នក` | certified / claimed · retention · Project | "ABC PC-02: QS checked" · Internal status. |
| SB3 | ⚠️ Finance · ℹ️ MD | PM approved (bill created) | Finance (to pay), MD | `{pc} · {sub} approved: bill {inv} to pay` / `{pc} · បានអនុម័ត៖ វិក្កយបត្រ {inv} ត្រូវបង់` | Net amount · Project · Date: due `{date}` | "ABC PC-02: PM approved (+1 more)" · Finance not clearly asked. |
| SB4 | ✅ | Paid | PM, QS | `{pc} · {sub} paid` / `{pc} · បានបង់ប្រាក់ {sub}` | Amount · Project | "ABC PC-02: Paid" · No amount. |
| SB5 | ⚠️ | Retention released | Finance (to pay), PM | `Retention to pay: {sub}` / `ប្រាក់ធានាត្រូវបង់៖ {sub}` | Amount · Project · Date: due `{date}` | "ABC retention released: $900" · Finance not asked. |
| SB6 | ℹ️ | Subcontractor / contract added or changed, rating saved | People following the project | `{sub}: new contract on {project}` / `contract changed` / `rated` (KM `កិច្ចសន្យាថ្មី` / `បានកែប្រែ` / `បានវាយតម្លៃ`) | Amount · Project | OK, English only. |

### Testing & Handover (`handover`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| H1 | ℹ️ | Test sheet created | Tester, PM | `{tc} · Test sheet: {test name}` / `{tc} · សន្លឹកតេស្ត៖ {test name}` | location · Project | OK, English only. |
| H2 | ✅ | Test passed | Tester, PM | `{tc} · {test name} PASSED` / `{tc} · {test name} ឆ្លង` | location · Project | "TC-101-004 Insulation resistance: Pass" · OK, English only. |
| H3 | ❌ | Test failed (defects created) | Tester, PM, MD | `{tc} · {test name} FAILED: {n} defects raised` / `{tc} · {test name} មិនឆ្លង៖ ចំណុចខ្វះខាត {n}` | failed points · Project | "…: Fail (+2 more)" · Defects merged as "+2 more". |
| H4 | ℹ️ | Handover item or warranty added / changed | PM | `Handover item {status}: {title}` / `Warranty {item} until {date}` (KM `ធាតុប្រគល់ការងារ` / `ការធានា … រហូតដល់ {date}`) | Project | "Warranty added: AC until 2027-12-01" · Raw date. |

### People and Settings (`people`, `admin`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| PE1 | ⚠️ | Someone creates an account (sent by the database) | HR, System Admin, backup admin | `New account waiting for approval: {name}` / `គណនីថ្មីរង់ចាំការអនុម័ត៖ {name}` | "Signed up with {phone/email} · "{note}". Check who it is, link the staff profile and approve, or reject." | "New sign-up waiting for approval" / "Sok · 099…" · **Done in update-v23.sql.** |
| PE2 | 🎉 | New staff member added | Everyone | HR's welcome text, as written | (HR's text) | Fine; keeps its own look. |
| PE3 | ℹ️ | Staff details changed | The person, MD, System Admin | `Your details were updated by {person}` (others: `{name}'s details updated`) / `ព័ត៌មានរបស់អ្នកត្រូវបានកែប្រែដោយ {person}` | what changed (title, phone, Telegram) | "Staff details updated: Sok · Engineer" · Third person to the person themselves. |
| PE4 | ℹ️ | Staff left / came back | MD, System Admin | `{name} left the company (last day {date})` / `{name} is back` (KM `បានចាកចេញ (ថ្ងៃចុងក្រោយ {date})` / `បានត្រឡប់មកវិញ`) | note | "Staff removed: Sok (last day 2026-11-30)" · "Removed" sounds harsh; raw date. |
| PE5 | ℹ️ | Telegram test button | Yourself | `Telegram test from GID: it works` / `សាកល្បង Telegram ពី GID៖ ដំណើរការ` | "Alerts for {name} now arrive here." | OK, English only. |
| PE6 | 🎉 | **New:** account approved | The new user (if their Telegram is saved) | `Your GID account is ready` / `គណនី GID របស់អ្នករួចរាល់` | "Sign in with {phone/email}. Sign in again every day after 3:00 am." | Today nothing is sent. |
| A1 | ℹ️ | Permission changed | MD, System Admin, backup admin | `Permission changed: {module} for {group}: {old} → {new}` / `បានប្តូរសិទ្ធិ៖ {module} សម្រាប់ {group}` | | "Sales · PM: view → edit" · Uses internal levels ("view", "own"). |

### Schedule & Meetings (`schedule`)

| # | Kind | When | Who gets it | New title (EN) / (KM) | Detail lines | Today · Problem |
|---|---|---|---|---|---|---|
| E1 | 📅 | Invitation to a meeting / inspection / visit | Attendees | `Invitation: {title}` / `ការអញ្ជើញ៖ {title}` | Date: `{date} {start}–{end}` · location · Project | "Invitation: Site meeting · 28 Nov 2026" / "28 Nov 2026 · 09:00–10:00 · Site office · DEMO-101 · Sok" · OK, English only. |
| E2 | 📅 | Meeting changed | Attendees | `Changed: {title}` / `បានកែប្រែ៖ {title}` | new Date / time / place | "Event changed: …" · Does not say what changed. |
| E3 | 📅 | Meeting cancelled | Attendees | `CANCELLED: {title}` / `បានលុបចោល៖ {title}` | "Reason: {reason}" · Date | "Event cancelled: …" · No reason. |
| E4 | 📅 | You were removed from a meeting | That person | `You no longer need to attend: {title}` / `អ្នកមិនចាំបាច់ចូលរួមទៀតទេ៖ {title}` | Date | "Removed from: Site meeting" · Sounds like a punishment. |
| E5 | ℹ️ | Meeting done / minutes saved | Attendees | `Minutes ready: {title}` / `កំណត់ហេតុប្រជុំរួចរាល់៖ {title}` | Date | "Event done: …" / "Minutes updated: …" · Does not say minutes are ready. |
| E6 | 📅 | **New:** reminder before the meeting | Attendees | `Today {start}: {title}` / `ថ្ងៃនេះ ម៉ោង {start}៖ {title}` | place · Project | Not sent today (needs a timed job in the database). |

### Announcements (`announcements`)

| # | Kind | When | Who gets it | Message | Today |
|---|---|---|---|---|---|
| AN1 | 📢 | MD / HR / Admin sends an announcement | The people chosen (everyone, a department, a project) | `📢 ANNOUNCEMENT · សេចក្តីជូនដំណឹង` (or `IMPORTANT ANNOUNCEMENT` when importance is High), the bold title, then the full message exactly as written | New in version 23. |

### Count

**85 alert types**, 3 of them new (P4 split order to MD, PE6 account ready, E6 meeting reminder):

| Kind | Number |
|---|---|
| ⚠️ Action needed | 24 |
| ✅ Approved / done | 12 |
| ❌ Rejected / returned | 7 |
| 📅 Reminder / schedule | 5 |
| 📢 Announcement | 1 |
| ℹ️ For your information | 34 |
| 🎉 Welcome | 2 |

## 4. How finished messages look

**1. A request for the MD (over USD 500)**
```
⚠️ ACTION NEEDED · Requests
REQ-0012 · Petty cash request waiting for your approval
Water pump repair, Block B · Approved by Chan Lina (QS check)
Project / គម្រោង: DEMO-101 · Riverside Villa
Amount / ទឹកប្រាក់: $650
Date / កាលបរិច្ឆេទ: needed by 28 Nov 2026

រង់ចាំអ្នកចាត់ការ · សំណើ
REQ-0012 · សំណើសាច់ប្រាក់តូចតាច រង់ចាំការអនុម័តរបស់អ្នក
ជួសជុលម៉ាស៊ីនបូមទឹក អគារ B · បានអនុម័តដោយ Chan Lina (ពិនិត្យដោយ QS)

Chan Lina · 25 Nov 2026 14:05
[ Open in GID / បើកក្នុង GID ]
```

**2. A drawing returned to the designer**
```
❌ REJECTED / RETURNED · Documents
A-101 rev 2 · Returned with comments by Heng Vibol
Comments: Door schedule does not match the plan; please update D3 and D4.
Project / គម្រោង: DEMO-102 · Office Tower

បានបដិសេធ / បញ្ជូនត្រឡប់ · ឯកសារ
A-101 rev 2 · បញ្ជូនត្រឡប់ជាមួយមតិយោបល់ដោយ Heng Vibol

Heng Vibol · 25 Nov 2026 10:42
[ Open in GID / បើកក្នុង GID ]
```

**3. A late morning report (MD)**
```
ℹ️ FOR YOUR INFORMATION · Daily reports
LATE morning report (35 min) from Chomreon Vathanak
24 workers · 4 photos
Project / គម្រោង: DEMO-101 · Riverside Villa
Date / កាលបរិច្ឆេទ: 25 Nov 2026

សម្រាប់ជាព័ត៌មាន · របាយការណ៍ប្រចាំថ្ងៃ
របាយការណ៍ពេលព្រឹក យឺត (35 នាទី) ពី Chomreon Vathanak

Chomreon Vathanak · 25 Nov 2026 09:35
[ Open in GID / បើកក្នុង GID ]
```

**4. A subcontractor payment paid**
```
✅ APPROVED / DONE · Subcontractors
PC-02 · ABC Painting paid
Project / គម្រោង: DEMO-103 · Sunrise School
Amount / ទឹកប្រាក់: $2,850

បានអនុម័ត / រួចរាល់ · អ្នកម៉ៅការបន្ត
PC-02 · បានបង់ប្រាក់ ABC Painting

Mean Sreypov · 25 Nov 2026 16:20
[ Open in GID / បើកក្នុង GID ]
```

**5. An announcement**
```
📢 IMPORTANT ANNOUNCEMENT · សេចក្តីជូនដំណឹងសំខាន់
Office closed on Friday 28 November

Dear team, the office will be closed on Friday for the electrical upgrade.
Site work continues as normal. Please send reports in the app as usual.
បុគ្គលិកទាំងអស់ ការិយាល័យនឹងបិទនៅថ្ងៃសុក្រ ...

Sok Dara · 25 Nov 2026 08:00
[ Open in GID / បើកក្នុង GID ]
```

## 5. Decisions for Jack

1. **English first, Khmer below** (proposed), or Khmer first?
2. **Drawing PDF uploads and progress changes (DC2):** stop sending them to Telegram (bell only)? They are frequent and nobody must act.
3. **New alerts:** send P4 (possible split order → MD), PE6 (your account is ready) and E6 (reminder before a meeting; needs a small timed job in the database)?
4. **Sign in every day:** someone who signs in at 02:50 is signed out at 03:00 (10 minutes later). Is that fine, or should a sign-in after, say, 02:00 last until 03:00 the next day?

## 6. For developers

### New columns on `public.notifications` (all optional text)

| Column | Fill with | Example |
|---|---|---|
| `kind` | `action`, `approved`, `rejected`, `reminder`, `announcement`, `info`, `welcome`. **Per recipient**: `action` only for the person who must act now (e.g. in `approversFor(r)` for a Pending request, the Finance group for a new bill); everyone else gets `info` (or `approved` / `rejected` when it is their own item). Empty = old message look. | `action` |
| `module` | Module code: `requests`, `procurement`, `stock`, `daily`, `docs`, `projects`, `cost`, `finance`, `qaqc`, `safety`, `svr`, `vo`, `subs`, `handover`, `people`, `admin`, `schedule`, `announcements`. Use `NOTE_MODULE[tbl]`. Empty = worked out from `tbl`. | `requests` |
| `ref` | The record's own number. Put it in the title too; if it is missing from a title the database adds `ref · ` in front. | `REQ-0012`, `PO-0007`, `A-101 rev 2`, `VO-101-003`, `PC-02` |
| `project` | Project number **and** name, written `code · name` (the owner's rule: never the number alone). Empty when there is no project. If the app sends only the code (`DEMO-101`) or the project id, the database looks up `public.projects` and shows `code · name` itself; any other text is shown as sent. | `DEMO-101 · Tower A Office Fit-out` |
| `amount` | Ready to show, `money()` format. Empty when there is none. | `$650` |
| `due` | Ready to show date / time, `fmtDate()` style, with a word in front when helpful. Never `2026-11-28`. | `needed by 28 Nov 2026`, `28 Nov 2026 09:00–10:00` |
| `title_km` | Khmer title (same meaning as `title`). Use `i18n-km.js` words for types, steps and statuses. | `សំណើសាច់ប្រាក់តូចតាច រង់ចាំការអនុម័តរបស់អ្នក` |
| `body_km` | Khmer detail line(s); free text the user typed (reasons, comments) stays as typed, only once (in `body`). | `ជួសជុលម៉ាស៊ីនបូមទឹក អគារ B` |

`title` and `body` stay as today (English, shown in the bell). Keep `body` one or two short lines: reason / comments first, then the item title. Project, amount and date go in their own columns, **not** in `body` (otherwise they show twice in Telegram).

### Rules
- One alert per action, as now. When several saves are merged (`flushNotify`), do not add "(+N more)"; describe the main action (for example R4 says "PO-0007 issued to ABC Co").
- No internal codes in text: no lower-case statuses ("qs checked"), no `YYYY-MM-DD`, no permission levels ("own").
- Projects: wherever a project appears (title, body, `project` column, Khmer too) write the number **and** the name, `DEMO-101 · Tower A Office Fit-out`, never the number alone (owner's decision). Helper idea: `projFull(id) = code + " · " + name`.
- Talk to the reader: "waiting for **your** approval", "You were added to…".
- Every rejected / returned / cancelled alert shows the reason the person typed.
- Telegram limits are handled by the database (title 250, body 1,200, Khmer 250 + 1,200, announcement message 3,300 characters). The bell may still cut `body` to 300.
- `tbl` + `record_id` make the button link `#open=tbl:record_id`; for announcements use `tbl = 'announcements'` and the announcement id (the app must open it). The database reads the full announcement message from `public.announcements`, so the bell `body` may be short.
- The welcome message (`tbl = 'welcome'`) keeps its own look; `title_km` / `body_km` are added under it when filled.
- `public.announcements` columns: `title`, `message`, `importance` (`Normal` | `High`), `audience` (jsonb: what was chosen in the form, e.g. `{"all":true}` or `{"groups":["SITE"],"projects":["p1"]}`), `recipients` (jsonb list of staff ids actually sent to), `sent_by` (staff id), `sent_at`, `pin_until` (date), `status` (`Draft` | `Sent` | `Withdrawn`). Add it to `GID.TABLES` in `data.js`.

### Security note (before real company data)
`notifications` and `announcements` use the open "demo access" rule: anyone with the public app key can write a row, and every row is sent to that person's Telegram. That means anyone could send any staff member a Telegram message that looks like it comes from GID, or post a fake announcement. Before real use, alerts and announcements must be written only through checked database functions (signed-in session, and only MD / HR / Admin for announcements).
