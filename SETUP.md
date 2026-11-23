# GID Management System – Demo setup (free plans)

This folder is a working demo of all 12 modules (Phases 1 to 3, including Stock). It costs nothing to run on the free plans of Supabase and Netlify. **Use fake data only**: in the demo, anyone who has the link can see and change the data.

## What is in the folder

| File | What it is |
| --- | --- |
| `index.html` | The page that opens the app |
| `app.js` | All the screens, rules and workflows |
| `data.js` | Tables, user groups, permissions and the demo data (40 staff, 5 demo projects, 16 stock items in 4 stores) |
| `map.js` | The Cambodia map outline used on the dashboard |
| `styles.css` | Look and layout (computer and phone) |
| `config.js` | The only file you edit: your Supabase address and key |
| `supabase/schema.sql` | Creates the database tables in Supabase, including the Telegram sender |
| `supabase/telegram-setup.sql` | Puts your Telegram bot token into the database (Step 5) |
| `img/` | GID logos, app icons and the 40 staff photos from the org chart |
| `manifest.webmanifest` | Lets phones add the demo to the home screen like an app |

## Passkey

The demo opens with a passkey screen. The passkey is given to staff by the system admin. "Remember this device" keeps the phone or computer unlocked; the lock button next to DEMO (top of the menu) locks it again.

The passkey hides the demo from people who only have the link. It is not real security: the files can still be downloaded by someone who knows how. That is fine for fake demo data. The live system will use a proper login for each person.

**Change the passkey:** open https://emn178.github.io/online-tools/sha256.html, type the new passkey, copy the long result, open `index.html` in Notepad and paste it between the quotes of `PASS_HASH`. Upload the folder again. Everyone will be asked for the new passkey.

## Option A – try it on one device (2 minutes, no accounts)

1. Go to **app.netlify.com/drop** and sign up for free.
2. Drag the whole `gid-demo` folder onto the page.
3. Netlify gives you a link. Open it on your computer or phone.

The data is saved in that browser only. Each person who opens the link starts with their own copy of the demo data.

## Option B – shared demo with Supabase (about 20 minutes)

With this option, everyone uses the same data. For example, a site engineer raises a request on a phone and the PM approves it on a computer.

### Step 1 – Create the free Supabase project
1. Go to **supabase.com** and sign up (the Free plan).
2. Click **New project**. Name it `gid-demo` and pick the region closest to Cambodia (Singapore).
3. Choose a database password and save it somewhere safe. Wait about 2 minutes while the project is created.

### Step 2 – Create the tables

If you already set up an earlier version of the demo, run the new `schema.sql` again. This version adds the stock tables, and running it resets the demo data.

1. In your project, open **SQL Editor** from the left menu, then click **New query**.
2. Open `supabase/schema.sql` in Notepad, copy everything and paste it into the editor.
3. Click **Run**. The result should say "Success. No rows returned".

### Step 3 – Connect the app to Supabase
1. In Supabase, open **Project Settings → API** (or the **Connect** button at the top).
2. Copy the **Project URL** and the **anon / publishable key**. Do not use the `service_role` / secret key.
3. Open `config.js` in Notepad and paste the two values between the quotes:
   ```js
   window.GID_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
4. Save the file.

### Step 4 – Put it online with Netlify
1. Go to **app.netlify.com/drop** and drag the `gid-demo` folder onto the page.
2. Open the link Netlify gives you. The first time, it shows **Load demo data**; click it.
3. To give the site a better name, go to **Site configuration → Change site name** (for example `gid-demo.netlify.app`).
4. To publish changes later, open your site in Netlify, go to **Deploys**, and drag the folder again.

### Step 5 – Telegram alerts (about 10 minutes)

Every notification in the bell is also sent to the person's Telegram, with an **Open in GID** button that opens the request, report or PO directly. Telegram works with Supabase only (Option B). The bot token stays inside the database; the app and the public cannot read it.

**A. Create the GID bot (once, by the system admin)**
1. In Telegram, open **@BotFather** and send `/newbot`.
2. Give it a name, e.g. `GID Alerts`, and a username ending in `bot`, e.g. `GID_management_system_bot`.
3. BotFather replies with a **token** like `7712345678:AAH...`. Keep it secret; anyone with it can send messages as the bot.
4. Optional: send `/setuserpic` to BotFather and choose `img/logo-square.png` as the bot photo.

**B. Put the token into Supabase**
1. Make sure you ran the new `schema.sql` (Step 2).
2. Open `supabase/telegram-setup.sql` in Notepad. Replace only the token (the bot username and the demo link https://gidmgmt.github.io/GID-MANAGEMENT/ are already filled in).
3. Paste it into **SQL Editor → New query** and click **Run**. The last line should show `"ready": true`.
   (The token is kept if you run `schema.sql` again later.)

**C. Each person links their Telegram (1 minute each)**
1. In the demo, tap the bell → **Settings** → **Telegram alerts**.
2. Open the GID bot from the link there and press **Start** (a bot can only message people who pressed Start).
3. Open **@userinfobot** in Telegram, press Start, and copy the **Id** number it replies with.
4. Paste the number in the demo and press **Save**, then **Send test message**.

The admin can also fill in someone's Telegram ID from **People → (person) → Edit**.

**Check it in the app.** Bell → **Settings** → **Telegram alerts** shows a checklist: shared database connected, GID bot ready, your Telegram linked, and whether the last message was delivered. If Telegram refused a message, it says why in plain words (for example "press Start on the bot"). The system admin also sees **System health** at the top of **Settings**: database, bot, and how many staff have linked Telegram.

If a message does not arrive: check the person pressed Start on the GID bot, and that the ID is right. In Supabase, **SQL Editor** → `select status_code, content from net._http_response order by created desc limit 5;` shows Telegram's last replies.

## Reset the demo

The MD and the system admins see a red **Reset demo** button at the top of the menu (and in **Settings → Data**). It puts back the starting demo data: 40 staff, 5 demo projects and the sample records. You can keep everyone's Telegram link and the permission settings (both are ticked by default). With Supabase connected it resets the demo for everyone using the link.

## How to test

- Use **Acting as** at the top right to switch person. Each person sees their own home screen, menu and approvals.
- Suggested test: as **Chomreon Vathanak** (Site Engineer), raise a $900 Material request for DEMO-101. Then switch to **Kum Sophea** (PM) to approve, **Sovath Sopharith** (Senior QS) to check, **Phan Vibol** (MD) to approve, and **Park Vuthea** (Procurement) to issue the PO. Back as Chomreon Vathanak, confirm delivery. As **Sou Sophea** (Finance), mark it paid.
- Try a $120 request too. It skips the MD.
- **Material request with stock check:** as **Chomreon Vathanak**, choose New request → Material, add Gypsum board 100 and THHN wire 30. The form shows what comes from stock and what must be ordered. Approve it as Kum Sophea (PM), Sovath Sopharith (QS) and Phan Vibol (MD). Then as **Park Vuthea**, tap "Release stock and order": stock is issued and a PO is created only for the shortfall. When site confirms the delivery, the items go into the site store.
- **Daily reports:** site engineers send up to three reports per project per day: **Morning** (workers arrived, plan for today, safety briefing), **End of day at 5 PM** (workers by trade, work done, issues, plan for tomorrow, captioned photos) and **Overtime** (start and end time, workers, reason, work done, photos). After sending, or from any report, tap **PDF in English** or **PDF ជាភាសាខ្មែរ** to download the photo report. Designers (for example **Oung Russy**) use "My daily work" to log hours and progress on their own drawings and tasks. The MD sees both on the dashboard.
- **Drawings:** designers only see the projects their PM assigned them to (Projects → open a project → Assign people). They upload the PDF, update progress, then send for review.
- **Stock:** as a site engineer, open Stock and issue material from your site store to your project. As **Park Vuthea**, receive new stock or transfer it from the main store to a site store. When confirming a PO delivery, you can add the goods straight into stock.
- **Dashboard (as Phan Vibol):** tap the map pins, move along the line chart, and tap the donut slices and stock categories.
- **Notifications:** every save tells the people it concerns (approvers, the requester, the PM, Procurement, Finance, the site team, and so on). Tap the bell to see them, open the item, or read **All activity**. In **Settings** inside the bell, each person chooses: only things for me, everything on my projects, or everything in the company. To watch it live, open the demo in two browser tabs as two different people (for example Chomreon Vathanak and Kum Sophea) and send a request from one.
- The look is the GID green glass style with the company logo; staff photos come from the 2026 org chart (folder `img/staff`, files `s01.jpg` to `s40.jpg`; replace a file to change a photo).
- Red badges show unread notifications on the bell, on each menu item, on the phone tab bar and on the browser tab. New notifications do not pop up; they wait in the bell list.
- On a phone, open the site in Safari or Chrome and choose **Add to Home Screen**. It then opens like an app with the GID icon. On Android and computers the app icon also shows the unread number.
- **Settings → Permissions:** as **Phan Vibol** (MD) or **Hang Sokpanha** (system admin), change what each group can do in each module, then save. Changes apply straight away and are logged. Kry Menglong (backup admin) can see the settings but not change them.
- **System Admin** (as Hang Sokpanha or Kry Menglong) can reset the demo data and download everything.

## Notifications in the live system

Notifications appear in the bell (with red badges on the menu, the phone tab bar and the browser tab) and, once Step 5 is done, in each person's Telegram even when the app is closed. Telegram messages follow each person's choice in bell → Settings (only mine / my projects / everything).

## PDF photo reports

The PDF is made in the browser. It needs an internet connection to load the PDF tool and the Khmer font the first time. Inside the Claude preview the download may be blocked; on your Netlify site it downloads normally. The Khmer labels on the report were translated for this demo, so please have them checked by a Khmer reader before using it with clients.

## Free plan limits to know about

- **Supabase Free pauses a project after about a week with no use.** Open the Supabase dashboard and click **Restore** to wake it up. The data is kept.
- **Netlify Free gives 300 credits a month.** Each deploy uses some of them, so drag a new version when you have a batch of changes rather than after every small edit.
- **Photos and PDFs:** in the browser-only demo they are kept inside the browser, which holds only about 5 MB, so keep to a few photos and PDFs of 1.5 MB or less. With Supabase they go to Supabase Storage (1 GB on the free plan) and PDFs up to 20 MB work. `schema.sql` creates the storage bucket for you.

## Before going live (Phase 1)

The demo is built for testing, not for real company data. The live version will:
1. Give each person their own login (email and password) instead of the "Acting as" switch.
2. Replace the open demo access rules in Supabase with strict rules for each role, so site staff only see their projects and only Finance and management see payments.
3. Store photos and drawings in Supabase Storage instead of inside the records.
4. Move to Supabase Pro ($25/month) for daily backups and so the project does not pause.

## Updating an existing database (version 12)

If your Supabase database was set up before version 12, do NOT run schema.sql again (it starts the database from empty).
Instead open Supabase → SQL Editor → New query, paste everything from `supabase/update-v12.sql`, and press Run.
It adds the location, late-report and safety-form columns and keeps all data and Telegram links.
Then open the demo, press **Reset demo** (keep Telegram links ticked) to load the new sample data.

## Updating an existing database (version 13)

Paste `supabase/update-v13.sql` into Supabase → SQL Editor and press Run. It adds the QA/QC photo, correction and PDF columns and keeps all data.
(On the GID demo database this has already been done.)

## Updating an existing database (version 14)

Paste `supabase/update-v14.sql` into Supabase → SQL Editor and press Run (adds project scopes). Already done on the GID demo database.

## Updating an existing database (version 15)

Paste `supabase/update-v15.sql` into Supabase → SQL Editor and press Run (staff details and the Telegram welcome message). Already done on the GID demo database.

## Updating an existing database (version 16)

Paste `supabase/update-v16.sql` into Supabase → SQL Editor and press Run. It adds the Site Visit Reports table and keeps all data.
Until it is run, the Site visits page opens empty and new site visits cannot be saved; everything else works.

## Updating an existing database (version 17)

Paste `supabase/update-v17.sql` into Supabase → SQL Editor and press Run. It adds the tables for Variations, Subcontractors (contracts and payment claims), Tests, Handover items and Warranties, plus two project columns (handover date and defect liability months). All existing data is kept.
The GID database (`bsqbdfpgsrsostronjyv`) already has this update. Until it is run on another database, those three pages open empty; everything else works.

What is new in version 17:
- Menu in groups (My work, Projects, Money & materials, Company).
- Each project opens as its own page with tabs: Overview, Daily reports, Drawings, Requests, QA/QC, Safety, Variations, Subcontractors, Cost, Handover, Team. People only see the tabs their role allows.
- Variations: Raised → QS prices → PM checks → MD approves the price → sent to client → client signed copy → added to an IPC claim.
- Subcontractors: list with insurance and rating, contracts (retention 0%, 5% or 10%), payment claims QS → PM → Finance invoice → paid, retention release.
- Handover: test sheets (insulation, earth, RCD, pressure, CCTV, data); a failed line raises a defect automatically. Handover checklist and warranties with end-date alerts.
- Site reports work without internet: they are saved on the phone and sent when the connection comes back.

## Updating an existing database (version 18)

Paste `supabase/update-v18.sql` into Supabase → SQL Editor and press Run. It adds the `device_sessions` table and the `device_beat` function. All data is kept.
The GID database already has this update.

What is new in version 18: Settings → Devices shows every phone or computer that unlocked the app, who is using it, when it was last active and whether it is online now. The System Admin (and backup admin) can sign one device, or all other devices, out; that device locks within a minute and asks for the passkey again. The MD can see the list but not sign devices out. The lock button in the menu now also marks the device as signed out.
Note: this is a demo control. Until real logins are added, it signs the app out on that device but does not stop a technical person from reading the database with the public key.
