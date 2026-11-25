/* GID Management System - DEMO
   app.js: data store (browser or Supabase), permissions, approval engine and all screens. */
(function () {
  "use strict";
  const { TABLES, GROUPS, PERMS: PERMS_STANDARD, APPROVAL_LIMIT, seed } = window.GID;
  const HOLIDAYS_STD = window.GID.HOLIDAYS || []; // v22: official public holidays, used when the saved data has none yet
  const CFG = window.GID_CONFIG || {};
  const LEVEL = { none: 0, view: 1, own: 2, edit: 3, approve: 4, admin: 5 };
  const LS_KEY = "gid-demo-v6";

  // ================= small helpers =================
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => new Date().toLocaleDateString("en-CA");
  const nowIso = () => new Date().toISOString();
  const money = (n) => (n == null || n === "" ? "" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const fmtDate = (d) => { if (!d) return ""; const x = new Date(String(d).length === 10 ? d + "T00:00:00" : d); return isNaN(x) ? esc(d) : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }); };
  // a date like "2026-12-01" means local midnight (Phnom Penh), not UTC
  const daysSince = (d) => (Date.now() - new Date(String(d).length === 10 ? d + "T00:00:00" : d).getTime()) / 86400000;
  const daysUntil = (d) => -daysSince(d);
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const split = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

  let ACTS = new Map(), actSeq = 0, OPENER = null;
  const act = (fn) => { const k = "a" + ++actSeq; ACTS.set(k, fn); return k; };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = ACTS.get(el.dataset.act);
    if (!fn) return;
    e.preventDefault();
    OPENER = () => fn(e, el); // a window opened by this tap can be opened again (fresh) when the person comes back to it
    try { fn(e, el); } finally { OPENER = null; }
  });

  // Escape closes the top layer only: the photo viewer first, then the window, then the alerts panel
  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (closeLightbox()) { e.preventDefault(); return; } if (badgesOnTop()) { e.preventDefault(); closeBadges(); return; } if (document.getElementById("modal")) modalBack(); else if (document.getElementById("drawer")) closeDrawer(); else document.body.classList.remove("nav-open"); });
  function toast(msg, bad) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), bad ? 5000 : 3500);
  }


  // Staff photos come from the 2026 org chart (img/staff/s01.jpg ... s40.jpg). New staff without a photo show initials.
  const hasPhoto = (s) => s && /^s(0[1-9]|[1-3][0-9]|40)$/.test(s.id);
  const initialsOf = (s) => String((s && s.name) || "?").split(" ").map((x) => x[0]).join("").slice(0, 2);
  function avatar(s, cls) { cls = cls || "av"; const src = s && s.photo ? s.photo : hasPhoto(s) ? `img/staff/${s.id}.jpg?v=16` : ""; return src ? `<img class="${cls} pic" src="${esc(src)}" alt="" loading="lazy">` : `<span class="${cls}">${esc(initialsOf(s))}</span>`; }

  // ================= data store =================
  const db = {};
  const Store = {
    mode: "local", client: null, memory: null,
    // Make the Supabase connection (no network yet). Sign-in calls need it before the data is read.
    connect() {
      if (this.client || !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY)) return this.client;
      if (!window.supabase) throw new Error("The Supabase library did not load. Check your internet connection.");
      this.mode = "supabase";
      // Clean up common copy-paste mistakes: spaces, a trailing slash, or "/rest/v1" copied with the address
      const url = String(CFG.SUPABASE_URL).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
      const key = String(CFG.SUPABASE_ANON_KEY).trim().replace(/^["']|["']$/g, "");
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error("The Supabase address in config.js looks wrong: \"" + CFG.SUPABASE_URL + "\". It should look like https://abcdefghijk.supabase.co with nothing after .co");
      this.client = window.supabase.createClient(url, key);
      return this.client;
    },
    async init() {
      if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
        this.connect();
        await this.loadAllRemote();
      } else {
        this.mode = "local";
        const saved = this.readLocal();
        Object.assign(db, saved || seed());
        for (const t of Object.keys(TABLES)) db[t] = db[t] || [];
        if (!db.holidays.length) { db.holidays = HOLIDAYS_STD.map((h) => Object.assign({ created_at: nowIso() }, h)); if (saved) this.writeLocal(); } // v22: data saved before the Schedule existed
        if (!saved) this.writeLocal();
      }
    },
    readLocal() { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return this.memory; } },
    writeLocal() {
      const snap = {}; for (const t of Object.keys(TABLES)) snap[t] = db[t];
      try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) { this.memory = JSON.parse(JSON.stringify(snap)); if (!this.warned) { this.warned = true; toast("This browser's storage is full: new photos and files will be lost when the page reloads. Connect Supabase to keep them.", true); } }
    },
    async loadAllRemote() {
      // All tables are read at the same time (one round trip instead of 22 in a row)
      const names = Object.keys(TABLES);
      const res = await Promise.all(names.map((t) => this.client.from(t).select("*").limit(5000)));
      res.forEach(({ data, error }, i) => {
        // a table added in a newer version (for example site_visits) may not exist yet: start it empty instead of stopping the app
        if (error && ["site_visits", "variations", "subcontractors", "sub_contracts", "sub_payments", "tests", "handover_items", "warranties", "events", "holidays", "announcements"].includes(names[i])) { console.warn(names[i] + " table missing: run the newest supabase/update SQL"); db[names[i]] = names[i] === "holidays" ? HOLIDAYS_STD.map((h) => Object.assign({}, h)) : []; this.missing = (this.missing || []).concat(names[i]); return; }
        if (error) throw new Error("Could not read table '" + names[i] + "': " + error.message + ". Did you run schema.sql in Supabase?");
        db[names[i]] = data || [];
      });
      // reports saved on this phone without internet stay visible until they are sent
      outbox().forEach((it) => { if (db[it.t] && !db[it.t].some((x) => x.id === it.row.id)) db[it.t].push(Object.assign({}, it.row, { photos: it.photos, _pending: true, created_at: it.at })); });
      setTimeout(() => flushOutbox(true), 2000);
    },
    clean(t, row) { const out = { id: row.id, created_at: row.created_at }; for (const c of Object.keys(TABLES[t])) if (c in row) out[c] = row[c] === "" && TABLES[t][c] !== "text" ? null : row[c]; return out; },
    async insert(t, row) {
      row.id = row.id || uid(); row.created_at = row.created_at || nowIso();
      const r = this.clean(t, row);
      if (this.mode === "supabase") {
        const { data, error } = await this.client.from(t).insert(r).select();
        if (error) throw new Error(error.message);
        if (data && data[0]) Object.assign(r, data[0]); // values set by the database (for example the server send time)
      }
      db[t].push(r); if (this.mode === "local") this.writeLocal();
      return r;
    },
    // Many rows of one table in one request (for example one alert per person for an announcement)
    async insertMany(t, rows) {
      const list = rows.map((row) => { row.id = row.id || uid(); row.created_at = row.created_at || nowIso(); return this.clean(t, row); });
      if (!list.length) return [];
      if (this.mode === "supabase") {
        const { data, error } = await this.client.from(t).insert(list).select();
        if (error) throw new Error(error.message);
        (data || []).forEach((d) => { const r = list.find((x) => x.id === d.id); if (r) Object.assign(r, d); });
      }
      db[t].push(...list); if (this.mode === "local") this.writeLocal();
      return list;
    },
    async update(t, id, patch) {
      const cleanPatch = {}; for (const c of Object.keys(patch)) if (c in TABLES[t]) cleanPatch[c] = patch[c] === "" && TABLES[t][c] !== "text" ? null : patch[c];
      if (this.mode === "supabase") { const { error } = await this.client.from(t).update(cleanPatch).eq("id", id); if (error) throw new Error(error.message); }
      const r = db[t].find((x) => x.id === id); Object.assign(r, cleanPatch); if (this.mode === "local") this.writeLocal();
      return r;
    },
    async remove(t, id) {
      if (this.mode === "supabase") { const { error } = await this.client.from(t).delete().eq("id", id); if (error) throw new Error(error.message); }
      db[t] = db[t].filter((x) => x.id !== id); if (this.mode === "local") this.writeLocal();
    },
    // Put the demo back to its starting data. keep.telegram keeps each person's Telegram link; keep.settings keeps permissions and alert choices.
    async reset(keep) {
      keep = keep || {};
      const fresh = seed();
      const chats = {}; (db.staff || []).forEach((st) => { if (String(st.telegram_chat_id || "").trim()) chats[st.id] = st.telegram_chat_id; });
      const keptSettings = keep.settings ? (db.app_settings || []).filter((x) => x.key === "permissions" || String(x.key).startsWith("notify:")) : [];
      if (keep.settings) { const keys = new Set(keptSettings.map((x) => x.key)); fresh.app_settings = (fresh.app_settings || []).filter((x) => !keys.has(x.key)).concat(keptSettings); }
      // Public holidays are real company settings (HR keeps them up to date): Reset demo keeps HR's list and only adds missing standard days
      if ((db.holidays || []).length && fresh.holidays) { const have = new Set(db.holidays.map((h) => h.id)), days = new Set(db.holidays.map((h) => h.date));
        fresh.holidays = db.holidays.map((h) => Object.assign({}, h)).concat(fresh.holidays.filter((h) => !have.has(h.id) && !days.has(h.date))); }
      if (this.mode === "supabase") {
        const names = Object.keys(TABLES);
        const del = await Promise.all(names.map((t) => this.client.from(t).delete().neq("id", "___")));
        del.forEach(({ error }, i) => { if (error) throw new Error(names[i] + ": " + error.message); });
        // Staff first, without Telegram IDs, so the sample notifications are not sent to anyone's Telegram
        const ins = async (t) => { const rows = fresh[t].map((r) => this.clean(t, Object.assign({ created_at: nowIso() }, r, t === "staff" ? { telegram_chat_id: "" } : {}))); if (rows.length) { const { error } = await this.client.from(t).insert(rows); if (error) throw new Error(t + ": " + error.message); } };
        await ins("staff");
        await Promise.all(names.filter((t) => t !== "staff").map(ins));
        if (keep.telegram) await Promise.all(Object.entries(chats).filter(([id]) => fresh.staff.some((st) => st.id === id)).map(([id, c]) => this.client.from("staff").update({ telegram_chat_id: c }).eq("id", id)));
        await this.loadAllRemote();
      } else {
        for (const t of Object.keys(TABLES)) db[t] = fresh[t];
        if (keep.telegram) db.staff.forEach((st) => { if (chats[st.id]) st.telegram_chat_id = chats[st.id]; });
        this.writeLocal();
      }
    }
  };

  async function save(t, row, summary) { const r = await Store.insert(t, row); await log("Created", t, r.id, typeof summary === "function" ? summary(r) : summary); return r; }
  // (v23) the record as it was before the change goes with the alert, so the alert can say what happened (returned, reviewed, reopened…)
  async function patch(t, id, p, summary) { const old = byId(t, id), before = old ? JSON.parse(JSON.stringify(old)) : null; const r = await Store.update(t, id, p); await log("Updated", t, id, summary, before); return r; }
  async function log(action, tbl, record_id, summary, before) {
    if (tbl === "audit_log") return;
    try { await Store.insert("audit_log", { at: nowIso(), actor_id: state.user, action, tbl, record_id, summary: summary || "" }); } catch (e) { /* logging never blocks work */ }
    queueNotify(action, tbl, record_id, summary, before);
  }

  // ================= lookups =================
  const byId = (t, id) => (db[t] || []).find((x) => x.id === id);
  const staffName = (id) => (byId("staff", id) || {}).name || "";
  const projLabel = (id) => { const p = byId("projects", id); return p ? p.code : ""; };
  const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Phnom_Penh" }); } catch (e) { return String(iso || "").slice(11, 16); } };
  const dateInPP = (iso) => { try { return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Phnom_Penh" }); } catch (e) { return String(iso || "").slice(0, 10); } };
  const supplierName = (id) => (byId("suppliers", id) || {}).name || "";
  // Staff who have left (removed by HR) stay in the records' history but are hidden from lists, pickers and alerts
  const staffNow = () => db.staff.filter((s) => !s.left_on);
  const withTag = (tag) => staffNow().filter((s) => split(s.tags).includes(tag));
  const inGroup = (g) => staffNow().filter((s) => split(s.groups).includes(g));
  const MD = () => (withTag("MD")[0] || {}).id;
  // The Project Director role was merged into Project Manager: every PM now has the former PD functions
  const PD = () => MD();

  // ================= people and permissions =================
  const state = { user: null, route: "home", tab: {}, project: "", search: "", showAll: false };
  const me = () => byId("staff", state.user) || db.staff[0];
  const groupsOf = (u) => split(u.groups);
  const hasTag = (u, t) => split(u.tags).includes(t);
  const isSysAdmin = (u) => hasTag(u, "SYSADMIN");
  const isPMRole = (u) => groupsOf(u).includes("PM") || hasTag(u, "PD");
  // Who may manage a project's team and progress: the MD, any Project Manager, the system admin
  const canManageProject = (u, pid) => hasTag(u, "MD") || (pid == null ? isPMRole(u) : isPMof(u, pid)) || isSysAdmin(u); // v23: with a project, only that project's PM
  const isAdminPage = (u) => hasTag(u, "SYSADMIN") || hasTag(u, "BACKUPADMIN") || hasTag(u, "MD");

  // Permission matrix in use: the standard one, with the changes saved by the MD or system admin on top
  const LEVELS = ["none", "view", "own", "edit", "approve", "admin"];
  const MODULE_NAMES = { requests: "Requests & Approvals", people: "People", projects: "Projects & Tasks", daily: "Daily reports", docs: "Document Control", cost: "Cost & Claims",
    procurement: "Procurement", finance: "Finance", qaqc: "QA/QC & Snags", safety: "Safety", dashboard: "Management Dashboard", stock: "Stock",
    vo: "Variations", subs: "Subcontractors", handover: "Testing & Handover", svr: "Site visits (SVR)", schedule: "Schedule & Meetings" };
  const LEVEL_HELP = { none: "Hidden: the module is not in the menu", view: "See all records (in their projects), change nothing", own: "Create and see only their own records",
    edit: "Create and update records", approve: "Edit, plus approve or reject", admin: "Full control, including settings and deleting" };
  const LEVEL_PLAIN = { none: "hidden", view: "see all", own: "own records only", edit: "edit", approve: "approve", admin: "full control" };
  function permSetting() { return (db.app_settings || []).find((x) => x.key === "permissions"); }
  function PERMS_NOW() {
    const saved = (permSetting() || {}).value || {}, out = {};
    for (const m of Object.keys(PERMS_STANDARD)) { out[m] = {}; for (const g of Object.keys(GROUPS)) out[m][g] = (saved[m] && LEVELS.includes(saved[m][g])) ? saved[m][g] : PERMS_STANDARD[m][g]; }
    return out;
  }
  const canManagePerms = (u) => isSysAdmin(u) || hasTag(u, "MD");
  function level(u, mod) {
    if (isSysAdmin(u)) return "admin";
    let best = "none"; const P = PERMS_NOW();
    for (const g of groupsOf(u)) { const l = (P[mod] || {})[g] || "none"; if (LEVEL[l] > LEVEL[best]) best = l; }
    if (mod === "qaqc" && hasTag(u, "QAQC") && LEVEL[best] < LEVEL.edit) best = "edit";
    if (mod === "people" && hasTag(u, "HR")) best = "admin";
    if (mod === "procurement" && hasTag(u, "PROC")) best = "admin";
    if (mod === "docs" && hasTag(u, "DOC")) best = "admin";
    if (mod === "schedule" && (hasTag(u, "HR") || hasTag(u, "BACKUPADMIN") || hasTag(u, "MD"))) best = "admin";
    if (mod === "schedule" && LEVEL[best] < LEVEL.own) best = "own"; // everyone keeps their own diary, even if a group is set lower
    return best;
  }
  const can = (u, mod, min) => LEVEL[level(u, mod)] >= LEVEL[min];
  const seesAll = (u, mod) => ["view", "edit", "approve", "admin"].includes(level(u, mod));

  // Which projects a person works on (null = all projects)
  function projectScope(u) {
    const g = groupsOf(u);
    if (isSysAdmin(u) || isPMRole(u) || hasTag(u, "SITEMGR")) return null;
    if (g.some((x) => ["EXEC", "QS", "FIN", "ADMIN", "ENG"].includes(x))) return null;
    if (g.includes("DESIGN")) return hasTag(u, "HEAD") ? null : new Set(db.project_members.filter((m) => m.staff_id === u.id).map((m) => m.project_id));
    if (g.includes("PM")) return new Set(db.projects.filter((p) => p.pm_id === u.id).map((p) => p.id));
    if (g.includes("SITE")) return new Set(db.project_members.filter((m) => m.staff_id === u.id).map((m) => m.project_id));
    return new Set();
  }
  const inScope = (u, pid) => { const s = projectScope(u); return !pid || !s || s.has(pid); };
  const myProjects = (u) => db.projects.filter((p) => inScope(u, p.id));
  // v23 rules: a PM acts only on their own projects (the project's PM, or listed as a PM in its team). The MD is checked separately where the MD may act.
  const projectPMs = (pid) => { const p = byId("projects", pid); if (!p) return [];
    const ids = [p.pm_id].concat(db.project_members.filter((m) => m.project_id === pid && (/project manager/i.test(m.role || "") || isPMRole(byId("staff", m.staff_id) || { groups: "", tags: "" }))).map((m) => m.staff_id));
    return ids.filter((x, i) => x && ids.indexOf(x) === i); };
  const isPMof = (u, pid) => !!(u && pid && projectPMs(pid).includes(u.id));
  const isFinance = (u) => groupsOf(u).includes("FIN"); // v23 rules: only Finance marks bills, payments and invoices as paid
  const RULE_MSG = { notPM: "Only the Project Manager of this project (or the MD) can do this.", voPM: "Only the Project Manager of this project can do the PM check.",
    twice: "You did the previous check on this variation, so another person must do this step.", finance: "Only Finance staff can mark this as paid.",
    ownDoc: "You created this drawing, so another approver must approve it.", qaClose: "Only the QA/QC inspector, the Project Manager of this project or the MD can pass, fail or close this.",
    notYours: "This step is waiting for someone else." };

  // ================= approval engine =================
  const STEP_LABEL = { PM: "Project Manager approves", QS: "QS checks budget", MD: "MD approves (USD 500 or more)",
    PROC: "Procurement issues PO", FIN: "Finance pays", HEAD: "Line manager approves", HR: "HR records", STORE: "Store releases stock to site", LINE: "Line manager approves (MD and HR informed)" };
  // Who acts at each step, in plain words (the short codes PM, QS, HEAD… are never shown to people)
  const STEP_WHO = { PM: "Project Manager", QS: "Quantity surveyor", MD: "Managing Director", PROC: "Procurement", STORE: "Store", FIN: "Finance", HEAD: "Line manager", LINE: "Line manager", HR: "HR" };
  const stepWho = (step) => (step && (STEP_WHO[step.role] || step.label || step.role)) || "";
  const REQUEST_TYPES = ["Material", "Purchase", "Payment", "Petty cash", "Leave", "Overtime"];
  const MONEY_TYPES = ["Material", "Purchase", "Payment", "Petty cash"];

  function buildSteps(type, amount, opts) {
    const big = Number(amount) >= APPROVAL_LIMIT;
    let roles;
    if (type === "Material" && opts && !opts.order) roles = ["PM", "STORE"];
    else if (type === "Material" || type === "Purchase") roles = ["PM", "QS"].concat(big ? ["MD"] : [], ["PROC"]);
    else if (type === "Payment") roles = ["PM", "QS"].concat(big ? ["MD"] : [], ["FIN"]);
    else if (type === "Petty cash") roles = ["PM"].concat(big ? ["MD"] : [], ["FIN"]);
    else if (type === "Overtime") roles = ["LINE"]; // approved by the line manager only; executives and HR are informed and can view
    else roles = ["HEAD", "HR"];
    return roles.map((role) => ({ role, label: role === "PROC" && type === "Material" ? "Procurement releases stock and orders the rest" : STEP_LABEL[role] }));
  }

  function headOf(id) {
    const u = byId("staff", id); if (!u) return [MD()];
    const g = groupsOf(u);
    if (hasTag(u, "MD")) return [];
    if (isPMRole(u) || hasTag(u, "HEAD")) return [MD()];
    if (hasTag(u, "SITEMGR") || g.includes("ENG")) return [MD()];
    if (g.includes("SITE")) {
      const m = db.project_members.find((x) => x.staff_id === id); const p = m && byId("projects", m.project_id);
      return [p ? p.pm_id : (withTag("SITEMGR")[0] || {}).id];
    }
    if (g.includes("DESIGN")) return inGroup("DESIGN").filter((s) => hasTag(s, "HEAD")).map((s) => s.id);
    if (g.includes("QS")) return inGroup("QS").filter((s) => hasTag(s, "HEAD")).map((s) => s.id);
    if (g.includes("FIN")) return withTag("FINMGR").map((s) => s.id);
    return [MD()];
  }

  function approversFor(req, step) {
    step = step || (req.steps || [])[req.step_index];
    if (!step) return [];
    let ids = [];
    const p = byId("projects", req.project_id);
    switch (step.role) {
      case "PM": ids = p ? projectPMs(p.id) : headOf(req.requester_id); if (ids.includes(req.requester_id)) ids = [PD()]; break;
      case "QS": { const qsTeam = req.project_id ? db.project_members.filter((m) => m.project_id === req.project_id && groupsOf(byId("staff", m.staff_id) || { groups: "" }).includes("QS")).map((m) => m.staff_id) : [];
        ids = qsTeam.length ? qsTeam : inGroup("QS").map((s) => s.id); break; }
      case "MD": ids = [MD()]; break;
      case "PROC": case "STORE": ids = withTag("PROC").map((s) => s.id); break;
      case "FIN": ids = inGroup("FIN").map((s) => s.id); break;
      case "HEAD": ids = headOf(req.requester_id); break;
      // line manager: site staff answer to the project's PM; office teams (design, engineering, QS, finance, admin) to their own head
      case "LINE": { const rq = byId("staff", req.requester_id) || { groups: "" };
        ids = p && groupsOf(rq).includes("SITE") ? [p.pm_id] : headOf(req.requester_id); if (ids.includes(req.requester_id)) ids = headOf(req.requester_id); break; }
      case "HR": ids = withTag("HR").map((s) => s.id); break;
    }
    ids = ids.filter((x) => x && x !== req.requester_id);
    return ids.length ? ids : [MD()];
  }
  const waitingOn = (req) => approversFor(req).map(staffName).join(", ");
  const waitDays = (r) => daysSince(((r.history || [])[(r.history || []).length - 1] || {}).at || r.created_at || nowIso());
  const myApprovals = (u) => db.requests.filter((r) => r.status === "Pending" && approversFor(r).includes(u.id));

  async function decide(req, approve, note, extra) {
    const u = me();
    const step = req.steps[req.step_index];
    if (req.status !== "Pending" || !approversFor(req).includes(u.id)) throw new Error(RULE_MSG.notYours);
    const history = (req.history || []).concat([{ at: nowIso(), by: u.id, action: approve ? "Approved" : "Rejected", note: note || "" }]);
    if (!approve) { await patch("requests", req.id, { status: "Rejected", history }, req.ref_no + " rejected"); return; }
    const notes = [];
    if (step.role === "STORE" || (step.role === "PROC" && (req.items || []).length)) {
      const rel = await releaseStock(req, u); if (rel.length) notes.push("Released from stock: " + rel.join("; "));
    }
    if (step.role === "PROC") {
      const lines = (req.items || []).filter((x) => x.to_order > 0).map((x) => ({ item_id: x.item_id, name: x.name, unit: x.unit, qty: x.to_order, unit_cost: x.unit_cost }));
      if (!(req.items || []).length || lines.length) {
        if (!extra.supplier_id) throw new Error("Choose the supplier for the items to order.");
        const poAmt = Number(extra.amount || req.amount) || 0, approved = Number(req.amount) || 0;
        if (approved > 0 && poAmt > approved + 0.5) throw new Error("The PO amount (" + money(poAmt) + ") is more than what was approved (" + money(approved) + "). Lower the PO, or reject and ask for a new request so the right people approve the higher amount.");
        const po = await createPO({ request_id: req.id, project_id: req.project_id, supplier_id: extra.supplier_id, description: lines.length ? lines.map((x) => x.name + " x" + x.qty).join(", ").slice(0, 120) : req.title,
          amount: Number(extra.amount || req.amount), items: lines });
        notes.push(po.po_no + " issued");
      }
    }
    if (notes.length) history[history.length - 1].note = [note].concat(notes).filter(Boolean).join(" · ");
    if (step.role === "FIN") {
      await save("invoices", { inv_no: nextNo("invoices", "inv_no", "AP-"), direction: "Payable", project_id: req.project_id, party: staffName(req.requester_id) + " (" + req.type + ")",
        source_type: "request", source_id: req.id, amount: req.amount, due_date: today(), status: "Paid", paid_at: nowIso() }, "Paid " + req.ref_no);
    }
    const next = req.step_index + 1;
    await patch("requests", req.id, { step_index: next, status: next >= req.steps.length ? "Approved" : "Pending", history }, req.ref_no + " approved: " + step.label);
  }

  function nextNo(t, field, prefix) {
    const n = db[t].map((r) => parseInt(String(r[field] || "").replace(/\D/g, ""), 10) || 0);
    return prefix + String((n.length ? Math.max.apply(null, n) : 0) + 1).padStart(4, "0");
  }

  async function createPO(o) {
    const recent = db.purchase_orders.filter((p) => p.supplier_id === o.supplier_id && p.project_id === o.project_id && daysSince(p.created_at || nowIso()) <= 7);
    const total = sum(recent, (p) => p.amount) + Number(o.amount);
    const flag = Number(o.amount) < APPROVAL_LIMIT && recent.length > 0 && total >= APPROVAL_LIMIT;
    const po = await save("purchase_orders", Object.assign({ po_no: nextNo("purchase_orders", "po_no", "PO-"), status: "Ordered", split_flag: flag,
      delivered_note: "", delivered_photo: "", delivered_by: "", delivered_at: null }, o), "PO for " + supplierName(o.supplier_id));
    if (flag) {
      toast("Possible split order: this supplier has " + money(total) + " on this project in 7 days. Flagged for the MD.", true);
      const md = MD(); // (v23) the MD really gets the alert now
      if (md && md !== state.user) await insertNotes([noteRow(md, state.user, "purchase_orders", po.id, { kind: "action", ref: po.po_no, project: projFull(po.project_id), amount: money(po.amount),
        title: po.po_no + " · Possible split order: please check", title_km: po.po_no + " · អាចជាការបញ្ជាទិញបំបែកជាច្រើនដង៖ សូមពិនិត្យ",
        body: supplierName(po.supplier_id) + " has " + money(total) + " on this project in 7 days", body_km: supplierName(po.supplier_id) + " មាន " + money(total) + " លើគម្រោងនេះក្នុង 7 ថ្ងៃ" }, nowIso())]);
    }
    return po;
  }

  // ================= photos =================
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1000, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.55));
      };
      img.onerror = reject; img.src = url;
    });
  }

  // ================= files (photos and PDFs) =================
  // Browser demo: files are kept inside the record. Supabase: files go to Storage and the record keeps the link.
  const BUCKET = "gid-demo-files";
  async function storeFile(dataUrl, name) {
    if (!dataUrl || Store.mode !== "supabase" || !String(dataUrl).startsWith("data:")) return dataUrl || "";
    const blob = await (await fetch(dataUrl)).blob();
    const path = today() + "/" + uid() + "-" + String(name || "file").replace(/[^\w.-]+/g, "_");
    const { error } = await Store.client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
    if (error) throw new Error("Upload failed: " + error.message);
    return Store.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function storeFiles(list, prefix) { const out = []; for (let i = 0; i < (list || []).length; i++) out.push(await storeFile(list[i], prefix + "-" + (i + 1) + ".jpg")); return out; }
  // ---------- OUTBOX: site reports made with no internet ----------
  // The report (with its photos) is kept on the phone and sent by itself when the signal comes back.
  // The time and GPS place are those of the moment the report was made, so it is not counted late because it uploaded late.
  const OUTBOX_KEY = "gid-outbox";
  const outbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch (e) { return []; } };
  const setOutbox = (l) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(l)); return true; } catch (e) { toast("The phone's storage is full. Free some space, then try again.", true); return false; } };
  const isNetErr = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(String((e && e.message) || e));
  const offlineNow = () => Store.mode === "supabase" && !navigator.onLine;
  function queueOffline(t, row, photos, summary) {
    const id = row.id || uid(), item = { qid: uid(), t, row: Object.assign({}, row, { id }), photos: photos || [], summary, at: nowIso(), by: state.user };
    const l = outbox(); l.push(item); if (!setOutbox(l)) throw new Error("Could not save on this phone.");
    // show it in the app straight away, marked as waiting
    (db[t] = db[t] || []).push(Object.assign({}, item.row, { photos: item.photos, _pending: true, created_at: item.at }));
    return db[t][db[t].length - 1];
  }
  let flushing = false;
  async function flushOutbox(quiet) {
    if (flushing || Store.mode !== "supabase" || !navigator.onLine || !state.user) return 0; // (v23) only once someone is signed in
    const l = outbox(); if (!l.length) return 0;
    flushing = true; let sent = 0;
    try {
      for (const it of l.slice()) {
        try {
          const photos = await storeFiles(it.photos, it.t === "daily_reports" ? "site" : "file");
          const row = Object.assign({}, it.row, { photos }); delete row._pending;
          const local = (db[it.t] || []).findIndex((x) => x.id === row.id); if (local >= 0) db[it.t].splice(local, 1);
          await save(it.t, row, it.summary);
          setOutbox(outbox().filter((x) => x.qid !== it.qid)); sent++;
        } catch (e) { if (isNetErr(e)) break; console.warn("outbox item failed", e); }
      }
    } finally { flushing = false; }
    if (sent) { render(); if (!quiet) toast(sent === 1 ? "1 saved report was sent." : sent + " saved reports were sent."); }
    return sent;
  }
  window.addEventListener("online", () => setTimeout(() => flushOutbox(), 1500));
  setInterval(() => { if (outbox().length) flushOutbox(true); }, 60000);
  function outboxBar() {
    const l = outbox(); if (!l.length) return "";
    return `<div class="queue" role="status"><span class="sigdot"></span><span><b>${l.length} waiting to send</b><small>${esc(l.map((x) => x.label || x.summary).slice(0, 2).join(" · "))}${navigator.onLine ? " · sending…" : " · no internet"}</small></span>${navigator.onLine ? `<button class="btn small" data-act="${act(() => flushOutbox())}">Send now</button>` : ""}</div>`;
  }
  window.addEventListener("offline", () => { if (typeof render === "function") render(); });

  function readPdf(file) {
    const max = (Store.mode === "supabase" ? 20 : 1.5) * 1024 * 1024;
    if (file.type && file.type !== "application/pdf") return Promise.reject(new Error("Please choose a PDF file."));
    if (file.size > max) return Promise.reject(new Error("This PDF is " + (file.size / 1048576).toFixed(1) + " MB. The " + (Store.mode === "supabase" ? "limit is 20 MB." : "browser demo keeps files up to 1.5 MB; connect Supabase for larger drawings.")));
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Could not read the PDF.")); r.readAsDataURL(file); });
  }
  const blobCache = {};
  function fileHref(url) {
    if (!url) return "";
    if (!String(url).startsWith("data:")) return url;
    if (blobCache[url]) return blobCache[url];
    try { const [h, b] = url.split(","); const bin = atob(b); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return (blobCache[url] = URL.createObjectURL(new Blob([arr], { type: h.slice(5).split(";")[0] }))); } catch (e) { return url; }
  }

  // ================= PDF photo report (English or Khmer) =================
  // The report is laid out as HTML, drawn page by page with html2canvas and saved with jsPDF, so Khmer script is shaped correctly.
  const PDF_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("Could not load the PDF tool. Check the internet connection.")); }; document.head.appendChild(s); }));
  }
  const RT = {
    en: { title: "Site Daily Photo Report", no: "No.", submitted: "SUBMITTED", project: "Project", date: "Date", client: "Client", session: "Session", location: "Location", weather: "Weather",
      by: "Reported by", pm: "Project Manager", workers: "WORKERS ON SITE", workersM: "WORKERS ARRIVED", workersO: "WORKERS ON OVERTIME", progress: "PROJECT PROGRESS", photos: "PHOTOS", issuesK: "OPEN ISSUES",
      trades: "Workers by trade", trade: "Trade / company", count: "Workers", total: "Total", morning: "Morning report today", subm: "Submitted", arrived: "Workers arrived", planned: "Planned today", otTonight: "Overtime report",
      done: "Work done today", doneO: "Work done during overtime", notes: "Notes", issues: "Site issues and delays", noIssues: "No issues reported.", planT: "Plan for tomorrow", planD: "Plan for today", reason: "Reason for overtime",
      ot: "Overtime", otTime: "Overtime hours", materials: "Materials today", issued: "Issued", received: "Received", none: "None", safety: "Safety", safetyNote: "Safety briefing", prepared: "Prepared by",
      reviewed: "Reviewed by", waiting: "Waiting for review", inSystem: "Submitted in GID system", fills: "Fills in when the report is marked reviewed", sitePhotos: "Site photos", generated: "GID Management System · generated",
      page: (a, b) => "Page " + a + " of " + b, cont: "continued", nPhotos: (n) => n + " photo" + (n === 1 ? "" : "s"), yes: "Yes", no2: "No",
      sessions: { Morning: "MORNING", "End of day": "END OF DAY", Overtime: "OVERTIME" }, sessionLong: { Morning: "Morning report", "End of day": "End of day (5 PM report)", Overtime: "Overtime report" },
      weatherMap: {}, unit: "", locCheck: "Location check", locMap: {}, late: "Late", fromPin: "from the site pin" },
    km: { title: "របាយការណ៍ប្រចាំថ្ងៃការដ្ឋាន", no: "លេខ", submitted: "ដាក់ជូនម៉ោង", project: "គម្រោង", date: "កាលបរិច្ឆេទ", client: "ម្ចាស់គម្រោង", session: "ប្រភេទរបាយការណ៍", location: "ទីតាំង", weather: "អាកាសធាតុ",
      by: "រាយការណ៍ដោយ", pm: "អ្នកគ្រប់គ្រងគម្រោង", workers: "កម្មករនៅការដ្ឋាន", workersM: "កម្មករមកដល់", workersO: "កម្មករថែមម៉ោង", progress: "វឌ្ឍនភាពគម្រោង", photos: "រូបថត", issuesK: "បញ្ហាមិនទាន់ដោះស្រាយ",
      trades: "ចំនួនកម្មករតាមផ្នែកការងារ", trade: "ផ្នែកការងារ / ក្រុមហ៊ុន", count: "ចំនួន (នាក់)", total: "សរុប", morning: "របាយការណ៍ពេលព្រឹកថ្ងៃនេះ", subm: "ម៉ោងដាក់ជូន", arrived: "កម្មករមកដល់", planned: "ផែនការថ្ងៃនេះ", otTonight: "ការងារថែមម៉ោង",
      done: "ការងារដែលបានធ្វើថ្ងៃនេះ", doneO: "ការងារដែលបានធ្វើក្នុងម៉ោងថែម", notes: "កំណត់សម្គាល់", issues: "បញ្ហា និងការពន្យារពេល", noIssues: "គ្មានបញ្ហា", planT: "ផែនការថ្ងៃស្អែក", planD: "ផែនការថ្ងៃនេះ", reason: "មូលហេតុធ្វើការថែមម៉ោង",
      ot: "ការងារថែមម៉ោង", otTime: "ម៉ោងធ្វើការថែម", materials: "សម្ភារៈប្រើប្រាស់ថ្ងៃនេះ", issued: "បញ្ចេញ", received: "ទទួល", none: "គ្មាន", safety: "សុវត្ថិភាព", safetyNote: "ការណែនាំសុវត្ថិភាពពេលព្រឹក", prepared: "រៀបចំដោយ",
      reviewed: "ត្រួតពិនិត្យដោយ", waiting: "រង់ចាំការត្រួតពិនិត្យ", inSystem: "បានដាក់ជូនក្នុងប្រព័ន្ធ GID", fills: "បំពេញនៅពេលរបាយការណ៍ត្រូវបានត្រួតពិនិត្យ", sitePhotos: "រូបថតការដ្ឋាន", generated: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·",
      page: (a, b) => "ទំព័រ " + a + "/" + b, cont: "បន្ត", nPhotos: (n) => "រូបថត " + n + " សន្លឹក", yes: "មាន", no2: "គ្មាន",
      sessions: { Morning: "ពេលព្រឹក", "End of day": "ចុងថ្ងៃ", Overtime: "ថែមម៉ោង" }, sessionLong: { Morning: "របាយការណ៍ពេលព្រឹក", "End of day": "របាយការណ៍ចុងថ្ងៃ (ម៉ោង 5 ល្ងាច)", Overtime: "របាយការណ៍ថែមម៉ោង" },
      weatherMap: { "Sunny": "មេឃស្រឡះ", "Cloudy": "មេឃស្រទំ", "Rain (morning)": "ភ្លៀងពេលព្រឹក", "Rain (afternoon)": "ភ្លៀងពេលរសៀល", "Rain (all day)": "ភ្លៀងពេញមួយថ្ងៃ" }, unit: " នាក់",
      locCheck: "ពិនិត្យទីតាំង", locMap: { "On site": "នៅការដ្ឋាន", "Away from site": "ក្រៅការដ្ឋាន", "No location": "គ្មានទីតាំង", "No site pin": "គម្រោងមិនទាន់កំណត់ទីតាំង" }, late: "យឺត", fromPin: "ពីចំណុចការដ្ឋាន" }
  };
  const KM_DAYS = ["អាទិត្យ", "ចន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];
  const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
  const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // One date format per PDF language, always the Phnom Penh date and Arabic digits: "24 Nov 2026" / "24 វិច្ឆិកា 2026"
  const rDate = (iso, lang) => {
    if (!iso) return "";
    const day = String(iso).length > 10 ? dateInPP(iso) : String(iso);
    const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return String(iso);
    const d = Number(m[3]), mo = Number(m[2]) - 1;
    return lang === "km" ? d + " " + KM_MONTHS[mo] + " " + m[1] : d + " " + EN_MONTHS[mo] + " " + m[1];
  };
  const rTime = (iso) => (iso ? timeOf(iso) : "");
  const rDT = (iso, lang) => (iso ? rDate(iso, lang) + (String(iso).length > 10 ? " " + timeOf(iso) : "") : "");
  // Khmer for words that come from the data (statuses, scopes, job titles, test columns...) in Khmer PDFs, whatever
  // language the app is showing. The shared dictionary (i18n-km.js) wins; PDF_KM only fills gaps until the
  // Khmer specialist adds the word there. Every word asked for is listed in window.__gidKmAsked (for the word list).
  const PDF_KM = {
    "Circuit": "សៀគ្វី", "Circuit / RCD": "សៀគ្វី / RCD", "Electrode / location": "បង្គោលដី / ទីតាំង", "Reading (Ω)": "តម្លៃវាស់ (Ω)", "Rating (mA)": "កម្រិត (mA)",
    "Trip time (ms)": "រយៈពេលផ្តាច់ (ms)", "Pipe section": "ផ្នែកបំពង់", "Test pressure (bar)": "សម្ពាធតេស្ត (bar)", "Start (bar)": "ចាប់ផ្តើម (bar)", "End (bar)": "បញ្ចប់ (bar)",
    "Time (min)": "រយៈពេល (នាទី)", "Camera": "កាមេរ៉ា", "Image clear": "រូបភាពច្បាស់", "Night vision": "មើលឃើញពេលយប់", "Recording on NVR": "ថតចូល NVR", "Point ID": "លេខចំណុច",
    "Length (m)": "ប្រវែង (m)", "Tester result": "លទ្ធផលឧបករណ៍តេស្ត", "Pass if every reading is at least (MΩ)": "ជាប់ បើតម្លៃវាស់នីមួយៗយ៉ាងតិច (MΩ)",
    "Pass if the reading is at most (Ω)": "ជាប់ បើតម្លៃវាស់មិនលើស (Ω)", "Pass if trip time is at most (ms)": "ជាប់ បើរយៈពេលផ្តាច់មិនលើស (ms)",
    "Allowed pressure drop (bar)": "ការធ្លាក់សម្ពាធអនុញ្ញាត (bar)", "Maximum length (m)": "ប្រវែងអតិបរមា (m)"
  };
  const KM_ASKED = (window.__gidKmAsked = window.__gidKmAsked || {});
  const arabicDigits = (x) => String(x).replace(/[០-៩]/g, (c) => String(c.charCodeAt(0) - 0x17E0));
  function kmText(x) {
    if (x == null) return "";
    const k = String(x).replace(/\s+/g, " ").trim();
    if (!k || !/[A-Za-z]/.test(k)) return arabicDigits(x);
    const d = window.I18N && I18N.km ? I18N.km(k) : null, out = d != null ? d : Object.prototype.hasOwnProperty.call(PDF_KM, k) ? PDF_KM[k] : null;
    KM_ASKED[k] = d != null ? "dictionary" : out != null ? "temporary Khmer in app.js PDF_KM" : "MISSING";
    return arabicDigits(out != null ? out : k);
  }
  // Translator for one PDF: Khmer PDFs translate, English PDFs keep the word
  const pdfTr = (lang) => (x) => (lang === "km" ? kmText(x) : String(x == null ? "" : x));
  // Khmer titles: break only between phrases (at spaces), never inside a Khmer word
  const kmTitle = (t, lang) => lang === "km" ? String(t).split(/ +/).map((w) => `<span class="rp-kw">${w}</span>`).join(" ") : t;
  const lines = (t) => String(t || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  function reportNo(d) { const p = byId("projects", d.project_id) || {}; return "DR-" + String(p.code || "").replace(/\D/g, "") + "-" + String(d.report_date).slice(2).replace(/-/g, "") + "-" + (d.session || "End of day")[0]; }

  function reportBlocks(d, L, lang) {
    const p = byId("projects", d.project_id) || {}, s = d.session || "End of day", who = byId("staff", d.author_id) || {};
    const ph = reportPhotos(d), w = (x) => esc(L.weatherMap[x] || x || "");
    const morning = s === "End of day" ? db.daily_reports.find((x) => x.kind !== "Design" && x.project_id === d.project_id && x.report_date === d.report_date && x.session === "Morning") : null;
    const ot = s === "End of day" ? db.daily_reports.find((x) => x.kind !== "Design" && x.project_id === d.project_id && x.report_date === d.report_date && x.session === "Overtime") : null;
    const moves = db.stock_moves.filter((m) => m.project_id === d.project_id && m.move_date === d.report_date && ["Issue", "Receive"].includes(m.move_type));
    const safety = db.safety.filter((x) => x.project_id === d.project_id && x.rec_date === d.report_date);
    const openIssues = (d.issues ? 1 : 0) + db.defects.filter((x) => x.project_id === d.project_id && x.status === "Open").length + db.safety.filter((x) => x.project_id === d.project_id && x.status === "Open").length;
    const blocks = [], T = pdfTr(lang);
    blocks.push(`<div class="rp-info">
      <div><span>${L.project}</span><b>${esc(p.code)} ${esc(p.name)}</b></div><div><span>${L.date}</span><b>${esc(rDate(d.report_date, lang))}</b></div>
      <div><span>${L.client}</span>${esc(p.client)}</div><div><span>${L.session}</span>${esc(L.sessionLong[s])}${s === "Overtime" ? " · " + esc(d.ot_start) + "–" + esc(d.ot_end) : ""}</div>
      <div><span>${L.location}</span>${esc(p.location)}</div><div><span>${L.weather}</span>${w(d.weather)}</div>
      <div><span>${L.by}</span>${esc(who.name)}, ${esc(T(who.title))}</div><div><span>${L.pm}</span>${esc(staffName(p.pm_id))}</div>
      ${d.loc_status ? `<div class="rp-wide"><span>${L.locCheck}</span><p><b class="${d.loc_status === "On site" ? "rp-ok" : "rp-bad"}">${esc(L.locMap[d.loc_status] || d.loc_status)}</b>${d.distance_m != null && d.distance_m !== "" ? " · " + esc(fmtDist(d.distance_m)) + " " + L.fromPin : ""}${d.late ? ` · <b class="rp-bad">${L.late} ${rTime(d.submitted_at)}</b>` : ""}${d.loc_note ? " · " + esc(d.loc_note) : ""}</p></div>` : ""}</div>`);
    blocks.push(`<div class="rp-kpis"><div><small>${s === "Morning" ? L.workersM : s === "Overtime" ? L.workersO : L.workers}</small><b>${esc(d.manpower)}</b></div>
      <div><small>${L.progress}</small><b>${esc(p.progress)}%</b><div class="rp-bar"><i style="width:${Number(p.progress) || 0}%"></i></div></div>
      <div><small>${L.photos}</small><b>${ph.length}</b></div><div><small>${L.issuesK}</small><b class="${openIssues ? "rp-red" : ""}">${openIssues}</b></div></div>`);
    const tradesT = (d.trades || []).length ? `<div><h2>${L.trades}</h2><table><thead><tr><th>${L.trade}</th><th class="rp-n">${L.count}</th></tr></thead><tbody>${d.trades.map((t) => `<tr><td>${esc(t.trade)}</td><td class="rp-n">${esc(t.workers)}</td></tr>`).join("")}<tr><td><b>${L.total}</b></td><td class="rp-n"><b>${sum(d.trades, (t) => t.workers)}</b></td></tr></tbody></table></div>` : "";
    const side = s === "End of day" ? `<div><h2>${L.morning}</h2><table><tbody>${morning ? `<tr><td>${L.subm}</td><td class="rp-n">${rTime(morning.submitted_at)}</td></tr><tr><td>${L.arrived}</td><td class="rp-n">${esc(morning.manpower)}</td></tr><tr><td>${L.planned}</td><td>${esc(morning.plan)}</td></tr>` : `<tr><td colspan="2">${L.none}</td></tr>`}
        <tr><td>${L.otTonight}</td><td class="rp-n">${ot ? esc(ot.ot_start) + "–" + esc(ot.ot_end) : L.no2}</td></tr></tbody></table></div>`
      : s === "Overtime" ? `<div><h2>${L.ot}</h2><table><tbody><tr><td>${L.otTime}</td><td class="rp-n">${esc(d.ot_start)} – ${esc(d.ot_end)}</td></tr><tr><td>${L.workersO}</td><td class="rp-n">${esc(d.manpower)}${L.unit}</td></tr></tbody></table></div>` : "";
    if (tradesT || side) blocks.push(`<div class="rp-two">${tradesT || "<div></div>"}${side || "<div></div>"}</div>`);
    if (s === "Morning") {
      blocks.push(`<h2>${L.planD}</h2><ul>${lines(d.plan).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      if (d.safety_note) blocks.push(`<h2>${L.safetyNote}</h2><p>${esc(d.safety_note)}</p>`);
      if (d.work_done) blocks.push(`<h2>${L.notes}</h2><ul>${lines(d.work_done).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
    } else {
      blocks.push(`<h2>${s === "Overtime" ? L.doneO : L.done}</h2><ul>${lines(d.work_done).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      if (s === "Overtime") blocks.push(`<h2>${L.reason}</h2><p>${esc(d.plan)}</p>`);
      else blocks.push(`<h2>${L.issues}</h2>${d.issues ? `<div class="rp-issue">${lines(d.issues).map(esc).join("<br>")}</div>` : `<p>${L.noIssues}</p>`}`);
    }
    const mat = `<div><h2>${L.materials}</h2><table><tbody>${moves.length ? moves.map((m) => { const it = byId("stock_items", m.item_id) || {}; return `<tr><td>${m.move_type === "Issue" ? L.issued : L.received}</td><td>${esc(it.name)}${m.ref ? " (" + esc(m.ref) + ")" : ""}</td><td class="rp-n">${Math.abs(m.qty)} ${esc(it.unit)}</td></tr>`; }).join("") : `<tr><td>${L.none}</td></tr>`}</tbody></table></div>`;
    if (s === "End of day") blocks.push(`<div class="rp-two"><div><h2>${L.planT}</h2>${d.plan ? `<ul>${lines(d.plan).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${L.none}</p>`}</div>${mat}</div>`);
    else blocks.push(mat);
    const sNote = d.safety_note || (morning && morning.safety_note) || "";
    blocks.push(`<h2>${L.safety}</h2><table><tbody>${sNote ? `<tr><td>${esc(sNote)}</td></tr>` : ""}${safety.map((x) => `<tr><td>${esc(T(x.rec_type))}: ${esc(x.description)}</td><td>${esc(x.action || T(x.status))}</td></tr>`).join("")}${!sNote && !safety.length ? `<tr><td>${L.none}</td></tr>` : ""}</tbody></table>`);
    const rv = byId("staff", d.reviewed_by);
    blocks.push(`<div class="rp-sign"><div><span>${L.prepared}</span><b>${esc(who.name)}</b><br>${esc(T(who.title))} · ${esc(rDate(d.report_date, lang))} ${rTime(d.submitted_at || d.created_at)}<em>${L.inSystem}</em></div>
      <div><span>${L.reviewed}</span>${rv ? `<b>${esc(rv.name)}</b><br>${esc(T(rv.title))}` : `<b>${esc((withTag("SITEMGR")[0] || {}).name || "")}</b><br><span class="rp-pend">${L.waiting}</span>`}<em>${rv ? L.inSystem : L.fills}</em></div></div>`);
    return blocks;
  }

  let LOGO_DATA = "";
  try { fetch("img/logo-landscape.png").then((r) => r.ok ? r.blob() : null).then((b) => { if (!b) return; const fr = new FileReader(); fr.onload = () => { LOGO_DATA = fr.result; }; fr.readAsDataURL(b); }).catch(() => {}); } catch (e) { /* use the file path */ }
  const RP_FONT = `"Plus Jakarta Sans","GID Khmer",Arial,sans-serif`;
  const RP_CSS = `.rp-host{position:fixed;left:-12000px;top:0;width:794px;z-index:-1;color-scheme:light}
  .rp-page{width:794px;height:1123px;padding:53px 53px 60px;position:relative;background:#fff;color:#121a2c;font:13px/1.45 ${RP_FONT};box-sizing:border-box;text-align:left}
  .rp-page *{box-sizing:border-box}.rp-blk{display:flow-root}
  .rp-top{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:18px;align-items:start;border-bottom:3px solid #2e8540;padding-bottom:10px}
  .rp-brand{display:flex;flex-direction:column;gap:3px;padding-top:2px}.rp-logo{height:44px;width:auto;display:block}.rp-co{color:#6b7488;font-size:10.5px;white-space:nowrap;padding-left:2px}
  .rp-title{text-align:right;min-width:0}.rp-title h1{margin:0;font-size:20px;font-weight:800;line-height:1.25;display:block;color:#121a2c}.rp-kw{white-space:nowrap}
  .rp-title small{color:#6b7488;font-size:11px;display:block;margin-top:2px}.rp-sess{display:inline-block;background:#1f4d2b;color:#fff;font-weight:700;font-size:11px;padding:4px 11px;border-radius:999px;margin-top:4px}
  .rp-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe3ea;border-radius:7px;margin-top:12px}.rp-info>div{padding:6px 11px;border-bottom:1px solid #eef0f4;display:grid;grid-template-columns:118px 1fr;font-size:12px}
  .rp-info>div:nth-child(odd){border-right:1px solid #eef0f4}.rp-info>div:nth-last-child(-n+2){border-bottom:0}.rp-info span{color:#6b7488}
  .rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:11px}.rp-kpis>div{background:#f1f7f1;border-radius:7px;padding:9px 11px}.rp-kpis small{display:block;color:#6b7488;font-size:10px;font-weight:700;letter-spacing:.4px}
  .rp-kpis b{font-size:21px}.rp-kpis b.rp-red{color:#c0362c}.rp-bar{height:7px;background:#dfe3ea;border-radius:4px;margin-top:4px}.rp-bar i{display:block;height:7px;background:#2e8540;border-radius:4px}
  .rp-page h2{display:block;font-size:13px;font-weight:700;margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid #dfe3ea;text-transform:uppercase;letter-spacing:.5px;color:#1f4d2b;line-height:1.45}
  .rp-page ul{margin:0;padding-left:18px}.rp-page li{margin:1px 0}.rp-page li.rp-cli{list-style:none}.rp-page p{margin:0}.rp-page table{width:100%;border-collapse:collapse;font-size:12px}
  .rp-page th{text-align:left;font-size:10px;color:#6b7488;font-weight:700;padding:4px 7px;border-bottom:1px solid #dfe3ea;text-transform:uppercase;vertical-align:top}.rp-page td{padding:4px 7px;border-bottom:1px solid #eef0f4;vertical-align:top}.rp-two td:first-child{white-space:nowrap}
  .rp-page .rp-n{text-align:right;white-space:nowrap}.rp-issue{background:#fdeceb;border-left:3px solid #c0362c;padding:8px 11px;border-radius:0 7px 7px 0;color:#7a1f18}
  .rp-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.rp-sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
  .rp-sign>div{border:1px solid #dfe3ea;border-radius:7px;padding:7px 11px;min-height:80px;font-size:11.5px;display:flex;flex-direction:column}.rp-sign span{color:#6b7488;font-size:10px;text-transform:uppercase;font-weight:700;display:block}
  .rp-sgb{padding-bottom:20px}.rp-sign .rp-pend{color:#a15c00;text-transform:none;font-size:11.5px;font-weight:400}.rp-sign em{margin-top:auto;display:block;border-top:1px dotted #b8bfcc;padding-top:3px;font-style:normal;color:#8a93a6;font-size:10px}
  .rp-foot{position:absolute;left:53px;right:53px;bottom:26px;display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#8a93a6;border-top:1px solid #eef0f4;padding-top:5px}.rp-foot span:last-child{white-space:nowrap}
  .rp-mini{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:3px solid #2e8540;padding-bottom:8px;font-size:12px;white-space:nowrap}
  .rp-mini>span{overflow:hidden;text-overflow:ellipsis;min-width:0}.rp-mini>span:first-child{flex:1 1 auto}.rp-mini>span:last-child{flex-shrink:0}.rp-mini b{font-size:15px}
  .rp-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px 13px;margin-top:11px}.rp-fig{border:1px solid #dfe3ea;border-radius:7px;overflow:hidden}
  .rp-fig .rp-img{width:100%;height:232px;background:#f3f5f8 center/contain no-repeat}.rp-fig .rp-cap{display:grid;grid-template-columns:22px 1fr;gap:7px;padding:6px 9px;font-size:11.5px;min-height:34px}
  .rp-fig .rp-cap b{background:#2e8540;color:#fff;border-radius:4px;text-align:center;font-size:11px;height:18px;line-height:18px}
  .rp-info>div.rp-wide{grid-column:1/-1;border-right:0;border-top:1px solid #eef0f4}.rp-ok{color:#1a7f42}.rp-bad{color:#c0362c}
  .rp-page.km,.rp-page.km *{font-family:${RP_FONT}!important;letter-spacing:0!important;text-transform:none!important;font-variant:normal!important;font-style:normal!important}
  .rp-page.km{font-size:13.5px;line-height:1.58}.rp-page.km h1{font-size:21px;font-weight:700;line-height:1.5}.rp-page.km h2{font-size:14px;font-weight:700;line-height:1.55;margin:9px 0 3px;padding-bottom:3px}
  .rp-page.km b,.rp-page.km strong,.rp-page.km th,.rp-page.km .rp-sess{font-weight:700}.rp-page.km .rp-kpis small{font-size:11.5px;font-weight:400;line-height:1.5}.rp-page.km .rp-kpis{margin-top:9px}.rp-page.km .rp-kpis>div{padding:6px 11px}.rp-page.km .rp-kpis b{line-height:1.25}.rp-page.km td{padding:3px 7px}
  .rp-page.km .rp-info>div{grid-template-columns:132px 1fr;line-height:1.55;padding:4px 11px}.rp-page.km td,.rp-page.km th{line-height:1.5}.rp-page.km th{font-size:11.5px}.rp-page.km li{margin:0}
  .rp-page.km .rp-sign span{font-size:11.5px}.rp-page.km .rp-sess{padding:3px 12px 5px;font-size:12px}.rp-page.km .rp-foot{font-size:10.5px}`;
  const pdfCss = () => { if (!document.getElementById("rp-css")) { const st = document.createElement("style"); st.id = "rp-css"; st.textContent = RP_CSS; document.head.appendChild(st); } };

  // ---- Page breaking: a block that does not fit is split (lists by item, tables by row with the header row repeated,
  // text by line); only blocks that must stay whole (sign-off, photos, key figures) move to the next page.
  const PDF_WHOLE = ["rp-sign", "sf-sign", "rp-kpis", "rp-info", "sf-ba", "sf-mx", "svconv", "rp-fig", "rp-grid"];
  const INLINE_TAGS = new Set(["B", "I", "EM", "SPAN", "BR", "SMALL", "A", "STRONG", "U", "S"]);
  const rectBottom = (n) => { if (n.nodeType === 3) { const r = document.createRange(); r.selectNodeContents(n); const rs = [...r.getClientRects()]; return rs.length ? Math.max(...rs.map((x) => x.bottom)) : -Infinity; } return n.getBoundingClientRect().bottom; };
  const pdfShell = (el, cont) => { const c = el.cloneNode(false); if (cont) c.classList.add("rp-contd"); return c; };
  function pdfSplit(el, Y) {
    if (el.nodeType !== 1 || PDF_WHOLE.some((c) => el.classList.contains(c)) || /^H[1-6]$/.test(el.tagName)) return null;
    if (el.tagName === "TABLE") return splitTable(el, Y);
    if (el.classList.contains("rp-two") || el.classList.contains("sf-two")) return splitCols(el, Y);
    const inline = [...el.childNodes].some((n) => (n.nodeType === 3 && n.nodeValue.trim()) || (n.nodeType === 1 && INLINE_TAGS.has(n.tagName)));
    return inline ? splitText(el, Y) : splitKids(el, Y);
  }
  // Tries a split on a copy put in the node's place, so a split that fails half-way never changes (or loses) the original
  function trySplit(node, Y) {
    const copy = node.cloneNode(true); node.replaceWith(copy);
    const parts = pdfSplit(copy, Y);
    if (!parts) { copy.replaceWith(node); return null; }
    copy.replaceWith(parts[0]); parts.undo = () => parts[0].replaceWith(node);
    return parts;
  }
  function splitKids(el, Y) {
    const kids = [...el.children], k = kids.findIndex((c) => c.getBoundingClientRect().bottom > Y + 0.5);
    if (k < 0) return null;
    const sub = trySplit(kids[k], Y);
    let head, tail;
    if (sub) { head = kids.slice(0, k).concat(sub[0]); tail = [sub[1]].concat(kids.slice(k + 1)); }
    else { let j = k; while (j > 0 && /^H[1-6]$/.test(kids[j - 1].tagName)) j--; if (j === 0) return null; head = kids.slice(0, j); tail = kids.slice(j); }
    const a = pdfShell(el), b = pdfShell(el, true);
    head.forEach((n) => a.appendChild(n)); tail.forEach((n) => b.appendChild(n));
    return [a, b];
  }
  function splitCols(el, Y) {
    const cols = [...el.children], plan = [], undo = [];
    let any = false;
    for (const c of cols) {
      if (c.getBoundingClientRect().bottom <= Y + 0.5) { plan.push([c, pdfShell(c)]); any = true; continue; }
      const top = c.getBoundingClientRect().top, sub = trySplit(c, Y);
      if (sub) { plan.push([sub[0], sub[1]]); undo.push(sub.undo); any = true; }
      else if (top >= Y - 40) plan.push([pdfShell(c), c]);
      else { undo.reverse().forEach((f) => f()); return null; }
    }
    if (!any) { undo.reverse().forEach((f) => f()); return null; }
    const a = pdfShell(el), b = pdfShell(el, true);
    plan.forEach(([x, y]) => { a.appendChild(x); b.appendChild(y); });
    return [a, b];
  }
  function splitTable(t, Y) {
    const rows = [...t.rows];
    let nh = 0; while (nh < rows.length && (rows[nh].parentElement.tagName === "THEAD" || (rows[nh].cells.length > 1 && [...rows[nh].cells].every((c) => c.tagName === "TH")))) nh++;
    const k = rows.findIndex((r) => r.getBoundingClientRect().bottom > Y + 0.5);
    if (k <= nh) return null;
    const a = pdfShell(t), b = pdfShell(t, true), ta = document.createElement("tbody"), tb = document.createElement("tbody");
    rows.forEach((r, i) => { if (i < nh) { ta.appendChild(r.cloneNode(true)); tb.appendChild(r.cloneNode(true)); } else if (r.parentElement.tagName !== "TFOOT") (i < k ? ta : tb).appendChild(r.cloneNode(true)); });
    a.appendChild(ta); b.appendChild(tb); if (t.tFoot) b.appendChild(t.tFoot.cloneNode(true));
    return [a, b];
  }
  // Text: split at the last whole word (or Khmer syllable) that still fits above the line Y
  function splitText(el, Y) {
    const nodes = [...el.childNodes], k = nodes.findIndex((n) => rectBottom(n) > Y + 0.5);
    if (k < 0) return null;
    let cut = 0; const n = nodes[k];
    if (n.nodeType === 3) {
      const txt = n.nodeValue, r = document.createRange(); let lo = 0, hi = txt.length;
      const fits = (o) => { r.setStart(n, 0); r.setEnd(n, o); const rs = [...r.getClientRects()]; return !rs.length || Math.max(...rs.map((x) => x.bottom)) <= Y + 0.5; };
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
      const ws = Math.max(txt.lastIndexOf(" ", lo), txt.lastIndexOf("\n", lo), txt.lastIndexOf("​", lo));
      cut = ws > 0 ? ws : lo; while (cut > 0 && cut < txt.length && /[ា-៓៝‌‍]/.test(txt[cut])) cut--;
    }
    const headText = nodes.slice(0, k).map((x) => x.textContent).join("") + (n.nodeType === 3 ? n.nodeValue.slice(0, cut) : "");
    if (!headText.trim()) return null;
    const a = pdfShell(el), b = pdfShell(el, true);
    nodes.slice(0, k).forEach((x) => a.appendChild(x));
    if (n.nodeType === 3 && cut > 0) { a.appendChild(document.createTextNode(n.nodeValue.slice(0, cut))); b.appendChild(document.createTextNode(n.nodeValue.slice(cut).replace(/^[ \n​]+/, ""))); }
    else b.appendChild(n);
    nodes.slice(k + 1).forEach((x) => b.appendChild(x));
    while (b.firstChild && b.firstChild.nodeName === "BR") b.firstChild.remove();
    if (b.tagName === "LI") b.classList.add("rp-cli");
    return [a, b];
  }
  // Sign-off boxes: the text sits in its own wrapper so the signature line always stays below it, at the bottom of the box
  const signWrap = (root) => root.querySelectorAll(".rp-sign > div, .sf-sign > div").forEach((box) => {
    const em = box.querySelector(":scope > em"); if (!em || box.querySelector(":scope > .rp-sgb")) return;
    const w = document.createElement("div"); w.className = "rp-sgb"; [...box.childNodes].forEach((c) => { if (c !== em) w.appendChild(c); }); box.insertBefore(w, em);
  });

  // Phones and tablets cannot show a PDF inside the app (an iframe stays blank on Android Chrome, or downloads again)
  function isPhoneView() { return !!(window.matchMedia && window.matchMedia("(max-width: 640px), (pointer: coarse)").matches); }
  // Saves the finished PDF with one download. Computer: a preview is shown as well. Phone: no preview; one
  // "Open PDF" button (and "Share" where the phone supports it) in case the download is not opened automatically.
  function pdfDeliver(blob, fileName) {
    const url = URL.createObjectURL(blob);
    try { const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* the button below still works */ }
    const close = `<button class="btn" data-act="${act(modalBack)}">Close</button>`;
    if (!isPhoneView()) {
      openModal(fileName, `<iframe class="pdf" src="${url}" title="PDF preview"></iframe><div class="form-actions"><a class="btn primary" href="${url}" download="${esc(fileName)}">Download</a>${close}</div>`);
      return;
    }
    const file = typeof File === "function" ? new File([blob], fileName, { type: "application/pdf" }) : null;
    const canShare = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    openModal(fileName, `<p>PDF saved to your downloads.</p><p class="muted small">${esc(fileName)}</p><div class="form-actions"><a class="btn primary" href="${url}" target="_blank" rel="noopener">Open PDF</a>${canShare ? btn("Share PDF", () => navigator.share({ files: [file], title: fileName }).catch(() => {})) : ""}${close}</div>`);
  }

  // Shared PDF maker: lays out A4 pages from HTML blocks, then draws each page with html2canvas and saves it with jsPDF.
  // Khmer needs care: the Khmer font is bundled with the app, weights are limited to regular and bold, and no letter
  // spacing or capitals are used, so every Khmer syllable is drawn as one piece and keeps its correct shape.
  // Every page lists the Khmer font, so Khmer typed by staff also prints correctly in English PDFs.
  async function makePdf(o) {
    const lang = o.lang, km = lang === "km";
    toast(km ? "កំពុងបង្កើត PDF…" : "Making the PDF…");
    const host = document.createElement("div"); host.className = "rp-host notr"; document.body.appendChild(host);
    try {
      await Promise.all(PDF_LIBS.map(loadScript));
      pdfCss();
      const fontLoads = ['400 13px "GID Khmer"', '700 13px "GID Khmer"', '400 13px "Plus Jakarta Sans"', '700 13px "Plus Jakarta Sans"', '800 13px "Plus Jakarta Sans"'].map((f) => document.fonts.load(f, f.includes("Khmer") ? "កខគ" : "Ag"));
      await Promise.race([Promise.all(fontLoads).then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 6000))]).catch(() => {});
      const pages = [], cls = "rp-page" + (km ? " km" : "");
      // the small header on continuation and photo pages stays on one line: long project names are shortened with …
      const fitMini = (pg) => { const sp = pg.querySelector(".rp-mini > span"); if (!sp) return; const tn = [...sp.childNodes].filter((x) => x.nodeType === 3 && x.nodeValue.trim()).pop(); if (!tn) return;
        let t = tn.nodeValue; while (sp.scrollWidth > sp.clientWidth + 1 && t.length > 4) { t = t.slice(0, -2).replace(/[\s·]+$/, ""); tn.nodeValue = t + "…"; } };
      const newPage = (first) => { const pg = document.createElement("div"); pg.className = cls; pg.innerHTML = (first ? o.head : o.mini(o.contTitle)) + '<div class="rp-body"></div><div class="rp-foot"><span>&nbsp;</span></div>'; host.appendChild(pg); pages.push(pg); if (!first) fitMini(pg); return pg.querySelector(".rp-body"); };
      // content may run down to just above the page footer
      let body = newPage(true);
      const lineY = () => body.parentElement.querySelector(".rp-foot").getBoundingClientRect().top - 8;
      const over = (el) => el.getBoundingClientRect().bottom > lineY() + 0.5;
      for (const b of o.blocks) {
        let el = document.createElement("div"); el.className = "rp-blk"; el.innerHTML = b; signWrap(el); body.appendChild(el);
        for (let guard = 0; over(el) && guard < 500; guard++) {
          const parts = trySplit(el, lineY());
          if (parts) { body = newPage(false); body.appendChild(parts[1]); el = parts[1]; continue; }
          if (body.children.length > 1) {
            // a sign-off never stands alone on a page: the section before it (or its last lines) comes along
            const prev = el.previousElementSibling, isSign = !!el.querySelector(".rp-sign, .sf-sign");
            let carry = null;
            if (isSign && prev && body.children.length > 2 && !prev.classList.contains("rp-contd") && prev.getBoundingClientRect().height < 300) { carry = prev; prev.remove(); }
            else if (isSign && prev && prev.getBoundingClientRect().height > 160) { const r = prev.getBoundingClientRect(), cut = trySplit(prev, r.bottom - 110); if (cut) carry = cut[1]; }
            el.remove(); body = newPage(false); if (carry) body.appendChild(carry); body.appendChild(el); continue;
          }
          break;
        }
      }
      const ph = o.photos || [];
      for (let i = 0; i < ph.length; i += 6) {
        const pg = document.createElement("div"); pg.className = cls;
        pg.innerHTML = o.mini(o.photoTitle) + `<div class="rp-grid">${ph.slice(i, i + 6).map((x, j) => `<div class="rp-fig"><div class="rp-img" style="background-image:url('${String(x.src).replace(/'/g, "%27")}')"></div><div class="rp-cap"><b>${i + j + 1}</b><span>${esc(x.cap || "")}</span></div></div>`).join("")}</div><div class="rp-foot"></div>`;
        host.appendChild(pg); pages.push(pg); fitMini(pg);
      }
      pages.forEach((pg, i) => { pg.querySelector(".rp-foot").innerHTML = `<span>${o.footLeft}</span><span>${esc(o.no)} · ${o.pageLabel(i + 1, pages.length)}</span>`; });
      await Promise.all(ph.map((x) => new Promise((r) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = im.onerror = r; im.src = x.src; })));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      for (let i = 0; i < pages.length; i++) {
        const canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, letterRendering: false });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 210, 297);
      }
      host.remove();
      pdfDeliver(pdf.output("blob"), o.fileName);
    } catch (err) { host.remove(); toast(err.message || String(err), true); }
  }
  const pdfGenerated = (lang) => rDT(nowIso(), lang);
  const pdfLogo = () => `<div class="rp-brand"><img class="rp-logo" src="${LOGO_DATA || "img/logo-landscape.png"}" alt="Green In Design"><small class="rp-co">Structure · Architecture · MEP · ELV</small></div>`;

  async function reportPdf(d, lang) {
    const L = RT[lang], s = d.session || "End of day", p = byId("projects", d.project_id) || {}, no = reportNo(d), ph = reportPhotos(d), caps = d.captions || [];
    await makePdf({ lang, no, fileName: no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1>${kmTitle(L.title, lang)}</h1><small>${L.no} ${esc(no)}</small><span class="rp-sess">${esc(L.sessions[s])} · ${L.submitted} ${rTime(d.submitted_at || d.created_at)}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} ${esc(p.name)} · ${esc(rDate(d.report_date, lang))} · ${esc(L.sessions[s])}</span><span>${esc(no)}</span></div>`,
      contTitle: L.title + " (" + L.cont + ")", photoTitle: L.sitePhotos, blocks: reportBlocks(d, L, lang),
      photos: ph.map((src, i) => ({ src, cap: caps[i] || "" })), footLeft: L.generated + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }

  // ================= notifications =================
  // Every save is logged. The people concerned by it get one notification per action (several saves from one tap are merged).
  const NOTE_MODULE = { requests: "requests", purchase_orders: "procurement", suppliers: "procurement", stock_moves: "stock", stock_items: "stock", stores: "stock", daily_reports: "daily",
    documents: "docs", tasks: "projects", projects: "projects", project_members: "projects", claims: "cost", cost_lines: "cost", monthly_costs: "cost", invoices: "finance",
    defects: "qaqc", inspections: "qaqc", safety: "safety", site_visits: "svr", variations: "vo", subcontractors: "subs", sub_contracts: "subs", sub_payments: "subs", tests: "handover", handover_items: "handover", warranties: "handover", staff: "people", accounts: "people", app_settings: "admin", events: "schedule", holidays: "schedule", announcements: "admin" };
  const NOTE_ICON = { requests: "requests", purchase_orders: "procurement", suppliers: "procurement", stock_moves: "stock", stock_items: "stock", stores: "stock", daily_reports: "daily", documents: "docs",
    tasks: "projects", projects: "projects", project_members: "people", claims: "cost", cost_lines: "cost", monthly_costs: "cost", invoices: "finance", defects: "qaqc", inspections: "qaqc", safety: "safety", site_visits: "svr", variations: "vo", subcontractors: "subs", sub_contracts: "subs", sub_payments: "subs", tests: "handover", handover_items: "handover", warranties: "handover", staff: "people", accounts: "people", app_settings: "admin", events: "schedule", holidays: "schedule", announcements: "megaphone" };
  const PREF_LABEL = { mine: "Only things for me", projects: "Everything on my projects", all: "Everything in the company" };
  function notifyPref(u) {
    const s = (db.app_settings || []).find((x) => x.key === "notify:" + u.id);
    if (s && s.value && PREF_LABEL[s.value.level]) return s.value.level;
    return hasTag(u, "MD") ? "all" : groupsOf(u).includes("PM") || hasTag(u, "SITEMGR") ? "projects" : "mine";
  }
  async function setNotifyPref(u, level) {
    const key = "notify:" + u.id, s = (db.app_settings || []).find((x) => x.key === key), row = { key, value: { level }, updated_by: u.id, updated_at: nowIso() };
    if (s) await Store.update("app_settings", s.id, row); else await Store.insert("app_settings", Object.assign({ id: "notify-" + u.id }, row));
  }
  const recordProject = (tbl, r) => {
    if (!r) return "";
    if (tbl === "projects") return r.id;
    if (tbl === "stock_moves") return r.project_id || (byId("stores", r.store_id) || {}).project_id || "";
    if (tbl === "stores") return r.project_id || "";
    return r.project_id || "";
  };
  function directRecipients(tbl, r) {
    if (!r) return [];
    const pm = (pid) => (byId("projects", pid) || {}).pm_id, ids = (t) => withTag(t).map((s) => s.id), grp = (g) => inGroup(g).map((s) => s.id);
    const team = (pid, g) => db.project_members.filter((m) => m.project_id === pid && (!g || groupsOf(byId("staff", m.staff_id) || { groups: "" }).includes(g))).map((m) => m.staff_id);
    const pid = recordProject(tbl, r);
    switch (tbl) {
      case "requests": return [r.requester_id, pm(r.project_id)].concat(r.status === "Pending" ? approversFor(r) : [], r.status === "Cancelled" ? approversFor(r) : [], r.status === "Approved" && r.type === "Leave" ? ids("HR") : [],
        r.type === "Overtime" && r.status !== "Pending" ? ids("HR").concat(ids("MD")) : []);
      case "purchase_orders": { const rq = byId("requests", r.request_id); return ids("PROC").concat([pm(pid), rq && rq.requester_id], team(pid, "SITE"), r.status !== "Ordered" ? grp("FIN") : []); }
      case "stock_moves": { const it = byId("stock_items", r.item_id), low = it && stockQty(it.id) < Number(it.min_qty); return ids("PROC").concat([pm(pid), r.by_id], team(pid, "SITE"), low ? grp("QS") : []); }
      case "stock_items": case "stores": case "suppliers": return ids("PROC").concat(grp("ADMIN"));
      case "daily_reports": return r.kind === "Design" ? inGroup("DESIGN").filter((s) => hasTag(s, "HEAD")).map((s) => s.id).concat((r.entries || []).map((e) => pm(e.project_id)))
        : [pm(pid), r.author_id].concat(ids("SITEMGR"), r.late || r.loc_status === "Away from site" || r.loc_status === "No location" ? ids("MD") : [], r.issues ? team(pid, "SITE") : []);
      case "documents": return [r.owner_id, pm(pid)].concat(team(pid, "DESIGN"), r.status === "In review" ? inGroup("DESIGN").filter((s) => hasTag(s, "HEAD")).map((s) => s.id).concat(grp("ENG")) : [],
        r.status === "Approved" ? ids("DOC") : [], r.status === "Issued" ? team(pid, "SITE").concat(ids("SITEMGR")) : []);
      case "tasks": return [r.assignee_id, r.created_by, pm(pid)];
      case "claims": return [pm(pid)].concat(grp("QS"), r.status === "PM verified" ? ids("MD") : [], ["MD approved", "Invoiced", "Paid"].includes(r.status) ? grp("FIN") : []);
      case "invoices": return grp("FIN").concat([pm(pid)], r.direction === "Receivable" ? ids("MD") : []);
      case "defects": return [r.assigned_to, r.raised_by, pm(pid)];
      case "inspections": return [r.inspector_id, pm(pid)].concat(team(pid, "SITE"));
      case "safety": return [r.reported_by, pm(pid)].concat(ids("SITEMGR"), r.severity === "High" ? ids("MD").concat(grp("PM")) : []);
      case "project_members": return [r.staff_id, pm(pid)];
      case "projects": return [r.pm_id].concat(grp("PM"), ids("MD"));
      case "cost_lines": case "monthly_costs": return [pm(pid)].concat(grp("QS"));
      case "staff": return [r.id].concat(ids("MD"), ids("SYSADMIN"));
      case "variations": { const st = r.status; return [r.raised_by, pm(pid)].concat(st === "Raised" ? grp("QS") : [], st === "PM checked" ? ids("MD") : [], VO_OK.includes(st) ? grp("QS").concat(ids("MD")) : []); }
      case "sub_payments": { const k = byId("sub_contracts", r.contract_id) || {}; return [pm(k.project_id)].concat(r.status === "Claimed" || r.status === "Paid" ? grp("QS") : [], r.status === "PM approved" ? grp("FIN") : [], ids("MD").filter(() => r.status === "PM approved")); }
      case "tests": return [r.tested_by, pm(pid)].concat(r.result === "Fail" ? ids("MD") : []);
      case "warranties": case "handover_items": return [pm(pid)];
      case "site_visits": return ids("MD").concat(inGroup("PM").map((s) => s.id), split(r.visited_by), (r.actions || []).map((a) => a.who), [r.author_id]);
      case "app_settings": return ids("MD").concat(ids("SYSADMIN"), ids("BACKUPADMIN"));
      case "events": return [r.organiser_id].concat(Array.isArray(r.attendees) ? r.attendees : []);
      default: return [];
    }
  }
  function recipientsFor(tbl, r, actor) {
    const out = new Set(directRecipients(tbl, r).filter(Boolean));
    const pid = recordProject(tbl, r), mod = NOTE_MODULE[tbl];
    for (const s of staffNow()) {
      if (out.has(s.id)) continue;
      const pref = notifyPref(s);
      if (pref === "mine" || !mod || !navVisible(s, mod)) continue;
      if (pref === "all" && inScope(s, pid)) out.add(s.id);
      if (pref === "projects" && pid && (isPMof(s, pid) || db.project_members.some((m) => m.project_id === pid && m.staff_id === s.id) || hasTag(s, "SITEMGR"))) out.add(s.id);
    }
    out.delete(actor);
    if (tbl === "events" && r) return [...out].filter((id) => { const s = byId("staff", id); return s && canSeeEvent(s, r); });
    if (tbl === "holidays") return [];
    return [...out].filter((id) => byId("staff", id));
  }
  // A clear title for each kind of record
  function noteTitle(tbl, r, summary) {
    if (!r) return summary;
    if (tbl === "requests") {
      if (r.status === "Pending") { const st = r.steps[r.step_index] || {}; return r.ref_no + " · " + (r.step_index === 0 && (r.history || []).length <= 1 ? "new " + r.type.toLowerCase() + " request" : "waiting: " + st.label); }
      return r.ref_no + " " + r.status.toLowerCase();
    }
    if (tbl === "daily_reports") return r.kind === "Design" ? staffName(r.author_id) + " sent daily work" : projLabel(r.project_id) + " " + (r.session || "End of day").toLowerCase() + " report";
    if (tbl === "purchase_orders") return r.po_no + " " + r.status.toLowerCase();
    if (tbl === "stock_moves") { const it = byId("stock_items", r.item_id) || {}, low = stockQty(it.id) < Number(it.min_qty); return "Stock " + r.move_type.toLowerCase() + ": " + it.name + (low ? " (below minimum)" : ""); }
    if (tbl === "documents") return r.doc_no + " rev " + r.revision + " · " + r.status.toLowerCase();
    if (tbl === "claims") return projLabel(r.project_id) + " IPC " + r.ipc_no + " · " + r.status.toLowerCase();
    return summary;
  }
  function noteBody(tbl, r, summary) {
    if (!r) return "";
    if (tbl === "requests") return r.title + (r.amount ? " · " + money(r.amount) : "") + (r.project_id ? " · " + projLabel(r.project_id) : "") + (r.status === "Pending" ? " · waiting for " + waitingOn(r) : "");
    if (tbl === "daily_reports") return r.kind === "Design" ? sum(r.entries || [], (e) => e.hours) + " hours" : r.manpower + " workers · " + reportPhotos(r).length + " photos" + (r.issues ? " · issue: " + String(r.issues).slice(0, 60) : "");
    if (tbl === "purchase_orders") return r.description + " · " + supplierName(r.supplier_id) + " · " + money(r.amount);
    if (tbl === "events") return [fmtDate(r.date), r.all_day || !r.start_time ? "All day" : r.start_time + (r.end_time ? "–" + r.end_time : ""), r.location, projLabel(r.project_id), staffName(r.organiser_id)].filter(Boolean).join(" · ");
    if (tbl === "stock_moves") { const it = byId("stock_items", r.item_id) || {}; return (r.qty > 0 ? "+" : "") + r.qty + " " + it.unit + " · " + ((byId("stores", r.store_id) || {}).name || "") + (r.project_id ? " · " + projLabel(r.project_id) : "") + " · now " + stockQty(it.id) + " " + it.unit + " in total"; }
    return summary;
  }
  // ================= v23 alert texts (docs/NOTIFICATIONS.md) =================
  // Each alert has a kind for its reader (action = you must act now; approved / rejected = your own item; info = nothing to do;
  // reminder = schedule), the module, the reference, the project as "CODE · Name", amount, date, and the same title and detail in Khmer.
  const projFull = (id) => { const p = byId("projects", id); return p ? p.code + (p.name ? " · " + p.name : "") : ""; };
  const KMW = (x) => { if (x == null || x === "") return ""; const k = window.I18N && I18N.km ? I18N.km(String(x)) : null; return k || String(x); };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // "28 Nov 2026" (Phnom Penh date) for alerts
  const dLong = (d) => { if (!d) return ""; const s = String(d).length === 10 ? String(d) : dateInPP(d); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? Number(m[3]) + " " + MON[Number(m[2]) - 1] + " " + m[1] : String(d); };
  const lastHist = (r, action) => { const h = (r && r.history) || []; for (let i = h.length - 1; i >= 0; i--) if (!action || h[i].action === action) return h[i]; return null; };
  const STEP_SHORT = { PM: "approval", QS: "budget check", MD: "approval", PROC: "order", STORE: "stock release", FIN: "payment", HEAD: "approval", LINE: "approval", HR: "approval" };
  const STEP_SHORT_KM = { approval: "ការអនុម័ត", "budget check": "ការពិនិត្យថវិកា", order: "ការបញ្ជាទិញ", "stock release": "ការបញ្ចេញស្តុក", payment: "ការទូទាត់" };
  const STEP_DONE = { PM: "PM approval", QS: "QS check", MD: "MD approval", PROC: "Procurement", STORE: "Store", FIN: "Finance", HEAD: "Head of department", LINE: "Line manager", HR: "HR" };
  const STEP_DONE_KM = { PM: "PM អនុម័ត", QS: "QS ពិនិត្យ", MD: "នាយកអនុម័ត", PROC: "លទ្ធកម្ម", STORE: "ឃ្លាំង", FIN: "ហិរញ្ញវត្ថុ", HEAD: "ប្រធានផ្នែក", LINE: "ប្រធានផ្ទាល់", HR: "ធនធានមនុស្ស" };
  const ids_ = (t) => withTag(t).map((s) => s.id), grp_ = (g) => inGroup(g).map((s) => s.id);
  const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const changed = (b, r, k) => !!b && JSON.stringify(b[k] == null ? null : b[k]) !== JSON.stringify(r[k] == null ? null : r[k]);

  // describe(e) → function (to) → message for that reader, or null for "no alert"
  function describe(e) {
    const tbl = e.tbl, r = e.r, b = e.before, actor = staffName(e.actor);
    if (!r) return null;
    const pid = recordProject(tbl, r);
    const M = (o) => Object.assign({ kind: "info", ref: "", project: projFull(pid), amount: "", due: "", body: "", body_km: "" }, o);
    const pick = (fn) => fn; // readability: the describer returns a function of the reader
    const isNew = !b;
    switch (tbl) {
      case "requests": {
        const ref = r.ref_no, typ = r.type, tk = ({ Purchase: "ទិញ", Payment: "ទូទាត់" })[typ] || KMW(typ), amount = r.amount ? money(r.amount) : "";
        const due = r.needed_by ? (typ === "Leave" ? "from " + dLong(r.needed_by) + (r.leave_days ? ", " + r.leave_days + " days" : "") : "needed by " + dLong(r.needed_by)) : "";
        const base = { ref, amount, due, body: cut(r.title, 160), body_km: "" };
        const mine = (to) => to === r.requester_id;
        if (r.status === "Pending") {
          const st = r.steps[r.step_index] || {}, appr = approversFor(r);
          if (r.step_index === 0 && (isNew || b.status !== "Pending")) return pick((to) => appr.includes(to)
            ? M(Object.assign({}, base, { kind: "action", title: `${ref} · ${typ} request waiting for your approval`, title_km: `${ref} · សំណើ${tk} រង់ចាំការអនុម័តរបស់អ្នក` }))
            : M(Object.assign({}, base, { title: `${ref} · New ${typ.toLowerCase()} request from ${staffName(r.requester_id)}`, title_km: `${ref} · សំណើ${tk}ថ្មីពី ${staffName(r.requester_id)}` })));
          if (isNew || b.step_index === r.step_index) return null; // nothing moved
          const prev = r.steps[r.step_index - 1] || {}, short = STEP_SHORT[st.role] || "approval";
          const by = `Approved by ${actor} (${STEP_DONE[prev.role] || prev.label || ""})`, byKm = `បានអនុម័តដោយ ${actor} (${STEP_DONE_KM[prev.role] || ""})`;
          return pick((to) => appr.includes(to)
            ? M(Object.assign({}, base, { kind: "action", title: `${ref} · ${typ} request waiting for your ${short}`, title_km: `${ref} · សំណើ${tk} រង់ចាំ${STEP_SHORT_KM[short]}របស់អ្នក`, body: base.body + " · " + by, body_km: byKm }))
            : M(Object.assign({}, base, { title: `${ref} · ${typ} request approved by ${actor}, now with ${waitingOn(r)}`, title_km: `${ref} · សំណើ${tk} ត្រូវបានអនុម័តដោយ ${actor} ឥឡូវរង់ចាំ ${waitingOn(r)}` })));
        }
        if (b && b.status === r.status) return null;
        if (r.status === "Approved") {
          const po = db.purchase_orders.find((p) => p.request_id === r.id), last = (r.steps[r.steps.length - 1] || {}).role;
          const next = po ? `${po.po_no} issued to ${supplierName(po.supplier_id)}` : last === "FIN" ? "Paid by Finance" : typ === "Leave" ? "Leave recorded" : last === "STORE" ? "Released from stock" : "";
          const nextKm = po ? `បានចេញ ${po.po_no} ទៅ ${supplierName(po.supplier_id)}` : last === "FIN" ? "ហិរញ្ញវត្ថុបានទូទាត់" : typ === "Leave" ? "បានកត់ត្រាច្បាប់ឈប់សម្រាក" : last === "STORE" ? "បានបញ្ចេញពីស្តុក" : "";
          return pick((to) => M(Object.assign({}, base, { kind: mine(to) ? "approved" : "info", title: `${ref} · ${typ} request approved`, title_km: `${ref} · សំណើ${tk} ត្រូវបានអនុម័ត`,
            body: [base.body, next].filter(Boolean).join(" · "), body_km: nextKm })));
        }
        if (r.status === "Rejected") {
          const h = lastHist(r, "Rejected") || {};
          return pick((to) => M(Object.assign({}, base, { kind: mine(to) ? "rejected" : "info", title: `${ref} · ${typ} request rejected by ${actor}`, title_km: `${ref} · សំណើ${tk} ត្រូវបានបដិសេធដោយ ${actor}`,
            body: [h.note ? "Reason: " + cut(h.note, 300) : "", base.body].filter(Boolean).join(" · ") })));
        }
        if (r.status === "Cancelled") return pick(() => M(Object.assign({}, base, { title: `${ref} · ${typ} request cancelled by ${actor}`, title_km: `${ref} · សំណើ${tk} ត្រូវបានលុបចោលដោយ ${actor}` })));
        return null;
      }
      case "purchase_orders": {
        const ref = r.po_no, sup = supplierName(r.supplier_id), rq = byId("requests", r.request_id), amount = money(r.amount);
        if (isNew) return pick(() => M({ ref, amount, title: `${ref} · Purchase order sent to ${sup}`, title_km: `${ref} · បានផ្ញើការបញ្ជាទិញទៅ ${sup}`,
          body: [cut(r.description, 160), rq ? "For request " + rq.ref_no : ""].filter(Boolean).join(" · "), body_km: rq ? "សម្រាប់សំណើ " + rq.ref_no : "" }));
        if (!changed(b, r, "status")) return null;
        if (r.status === "Delivered") {
          const inv = db.invoices.find((i) => i.source_type === "po" && i.source_id === r.id), fin = grp_("FIN");
          return pick((to) => fin.includes(to) && inv
            ? M({ ref, amount, kind: "action", due: inv.due_date ? "due " + dLong(inv.due_date) : "", title: `${ref} · Delivered: supplier bill ${inv.inv_no} to pay`, title_km: `${ref} · បានដឹកមកដល់៖ ត្រូវបង់វិក្កយបត្រ ${inv.inv_no}`, body: `${sup} · Received by ${staffName(r.delivered_by)}`, body_km: `${sup} · ទទួលដោយ ${staffName(r.delivered_by)}` })
            : M({ ref, amount, title: `${ref} · Delivered on site`, title_km: `${ref} · បានដឹកមកដល់ការដ្ឋាន`, body: `${sup} · Received by ${staffName(r.delivered_by)}`, body_km: `${sup} · ទទួលដោយ ${staffName(r.delivered_by)}` }));
        }
        if (r.status === "Paid") return pick((to) => M({ ref, amount, kind: rq && to === rq.requester_id ? "approved" : "info", title: `${ref} · Supplier paid`, title_km: `${ref} · បានបង់ប្រាក់អ្នកផ្គត់ផ្គង់`, body: sup }));
        return null;
      }
      case "stock_moves": {
        const it = byId("stock_items", r.item_id) || {}, q = stockQty(it.id), low = Number(it.min_qty) > 0 && q < Number(it.min_qty), st = (byId("stores", r.store_id) || {}).name || "";
        const verb = { Receive: ["received", "បានទទួល"], Issue: ["issued", "បានបញ្ចេញ"], Transfer: ["moved", "បានផ្ទេរ"], Adjust: ["counted", "បានរាប់"] }[r.move_type] || ["changed", "បានកែ"];
        const qty = Math.abs(Number(r.qty) || 0) + " " + (it.unit || "");
        const proc = ids_("PROC");
        return pick((to) => low && proc.includes(to)
          ? M({ ref: r.ref || "", kind: "action", title: `Low stock: ${it.name} (${q} ${it.unit} left, minimum ${it.min_qty})`, title_km: `ស្តុកតិច៖ ${it.name} (នៅសល់ ${q} ${it.unit} អប្បបរមា ${it.min_qty})`, body: st, body_km: "" })
          : M({ ref: r.ref || "", title: low ? `Low stock: ${it.name} (${q} ${it.unit} left, minimum ${it.min_qty})` : `${it.name}: ${qty} ${verb[0]}`, title_km: low ? `ស្តុកតិច៖ ${it.name} (នៅសល់ ${q} ${it.unit} អប្បបរមា ${it.min_qty})` : `${it.name}៖ ${verb[1]} ${qty}`,
            body: [st, `Now ${q} ${it.unit} in total`].filter(Boolean).join(" · "), body_km: `ឥឡូវមានសរុប ${q} ${it.unit}` }));
      }
      case "daily_reports": {
        const who = staffName(r.author_id), date = dLong(r.report_date);
        if (r.kind === "Design") {
          if (!isNew) return null;
          const h = sum(r.entries || [], (x) => x.hours);
          return pick(() => M({ due: date, title: `Daily work from ${who}: ${h} hours`, title_km: `ការងារប្រចាំថ្ងៃពី ${who}៖ ${h} ម៉ោង`, body: cut((r.entries || []).map((x) => x.label).join(", "), 200) }));
        }
        const S = r.session || "End of day", Skm = KMW(S);
        if (!isNew) {
          if (!(changed(b, r, "status") && r.status === "Reviewed")) return null;
          return pick((to) => to === r.author_id
            ? M({ kind: "approved", due: date, title: `Your ${S.toLowerCase()} report of ${date} was reviewed by ${actor}`, title_km: `របាយការណ៍${Skm} ថ្ងៃ ${date} របស់អ្នក ត្រូវបានពិនិត្យដោយ ${actor}` })
            : M({ due: date, title: `${S} report from ${who} reviewed by ${actor}`, title_km: `របាយការណ៍${Skm} ពី ${who} ត្រូវបានពិនិត្យដោយ ${actor}` }));
        }
        const away = r.loc_status === "Away from site" || r.loc_status === "No location";
        const title = r.late && S === "Morning" ? `LATE morning report (${r.late_minutes || 0} min) from ${who}` : `${S} report from ${who}`;
        const title_km = r.late && S === "Morning" ? `របាយការណ៍ពេលព្រឹកយឺត ${r.late_minutes || 0} នាទី ពី ${who}` : `របាយការណ៍${Skm} ពី ${who}`;
        const awayEn = away ? (r.loc_status === "No location" ? " · sent WITHOUT LOCATION" : ` · sent AWAY FROM SITE${r.distance_m ? " (" + Math.round(r.distance_m) + " m)" : ""}`) : "";
        const awayKm = away ? (r.loc_status === "No location" ? " · ផ្ញើដោយគ្មានទីតាំង" : ` · ផ្ញើពីក្រៅការដ្ឋាន${r.distance_m ? " (" + Math.round(r.distance_m) + " m)" : ""}`) : "";
        return pick(() => M({ due: date, title: title + awayEn, title_km: title_km + awayKm,
          body: [`${r.manpower || 0} workers · ${reportPhotos(r).length} photos`, r.issues ? "Issue: " + cut(r.issues, 160) : "", r.loc_note ? cut(r.loc_note, 100) : ""].filter(Boolean).join(" · "),
          body_km: `កម្មករ ${r.manpower || 0} នាក់ · រូបថត ${reportPhotos(r).length} សន្លឹក` }));
      }
      case "documents": {
        const ref = r.doc_no + " rev " + r.revision, t = r.title || "", owner = (to) => to === r.owner_id;
        if (r.status === "Superseded") return null;
        if (isNew) return pick(() => M({ ref, title: `${ref} · ${Number(r.revision) > 0 ? "New revision" : "New drawing"}: ${t}`, title_km: `${ref} · ${Number(r.revision) > 0 ? "កំណែថ្មី" : "ប្លង់ថ្មី"}៖ ${t}`, body: r.discipline || "", body_km: KMW(r.discipline) }));
        if (!changed(b, r, "status")) {
          if (changed(b, r, "file_url")) return pick(() => M({ ref, silent: true, title: `${ref} · PDF added`, title_km: `${ref} · បានបន្ថែម PDF`, body: t }));
          if (changed(b, r, "progress")) return pick(() => M({ ref, silent: true, title: `${ref} · progress ${r.progress}%`, title_km: `${ref} · វឌ្ឍនភាព ${r.progress}%`, body: t }));
          return null;
        }
        if (r.status === "In review") {
          const chk = inGroup("DESIGN").filter((s) => hasTag(s, "HEAD")).map((s) => s.id).concat(grp_("ENG"));
          return pick((to) => chk.includes(to)
            ? M({ ref, kind: "action", due: r.due_date ? "due " + dLong(r.due_date) : "", title: `${ref} · Drawing waiting for your review`, title_km: `${ref} · ប្លង់រង់ចាំការពិនិត្យរបស់អ្នក`, body: t })
            : M({ ref, title: `${ref} · Sent for review`, title_km: `${ref} · បានបញ្ជូនទៅពិនិត្យ`, body: t }));
        }
        if (r.status === "Draft" && b.status === "In review") return pick((to) => M({ ref, kind: owner(to) ? "rejected" : "info", title: `${ref} · Returned with comments by ${actor}`, title_km: `${ref} · ${actor} បានបញ្ជូនមកវិញ ជាមួយមតិយោបល់`,
          body: [r.notes ? "Comments: " + cut(r.notes, 400) : "", t].filter(Boolean).join(" · ") }));
        if (r.status === "Approved") { const doc = ids_("DOC"); return pick((to) => doc.includes(to)
          ? M({ ref, kind: "action", title: `${ref} · Approved: please issue`, title_km: `${ref} · បានអនុម័ត៖ សូមចេញឯកសារ`, body: t })
          : M({ ref, kind: owner(to) ? "approved" : "info", title: `${ref} · Approved by ${actor}`, title_km: `${ref} · បានអនុម័តដោយ ${actor}`, body: t })); }
        if (r.status === "Issued") return pick((to) => M({ ref, kind: owner(to) ? "approved" : "info", title: `${ref} · Issued for construction: ${t}`, title_km: `${ref} · បានចេញសម្រាប់សាងសង់៖ ${t}`,
          body: Number(r.revision) > 0 ? "Replaces rev " + (Number(r.revision) - 1) : "", body_km: Number(r.revision) > 0 ? "ជំនួសកំណែ " + (Number(r.revision) - 1) : "" }));
        return pick(() => M({ ref, title: `${ref} · ${r.status}`, title_km: `${ref} · ${KMW(r.status)}`, body: t }));
      }
      case "tasks": {
        const due = r.due_date ? "due " + dLong(r.due_date) : "";
        if (isNew) return pick((to) => to === r.assignee_id
          ? M({ kind: "action", due, title: `New task for you: ${r.title}`, title_km: `កិច្ចការថ្មីសម្រាប់អ្នក៖ ${r.title}`, body: r.priority ? "Priority: " + r.priority : "", body_km: r.priority ? "អាទិភាព៖ " + KMW(r.priority) : "" })
          : M({ due, title: `New task for ${staffName(r.assignee_id)}: ${r.title}`, title_km: `កិច្ចការថ្មីសម្រាប់ ${staffName(r.assignee_id)}៖ ${r.title}` }));
        const w = !changed(b, r, "status") ? ["changed", "បានកែប្រែ"] : r.status === "Done" ? ["done", "រួចរាល់"] : r.status === "In progress" ? ["started", "បានចាប់ផ្តើម"] : b.status === "Done" ? ["reopened", "បានបើកឡើងវិញ"] : ["changed", "បានកែប្រែ"];
        return pick((to) => M({ kind: r.status === "Done" && to === r.created_by && changed(b, r, "status") ? "approved" : "info", due, title: `Task ${w[0]}: ${r.title}`, title_km: `កិច្ចការ${w[1]}៖ ${r.title}`, body: "By " + actor, body_km: "ដោយ " + actor }));
      }
      case "projects": {
        const P = projFull(r.id);
        if (isNew) return pick(() => M({ title: `New project ${P}`, title_km: `គម្រោងថ្មី ${P}`, body: [r.client, r.pm_id ? "PM: " + staffName(r.pm_id) : ""].filter(Boolean).join(" · ") }));
        if (changed(b, r, "pm_id")) return pick(() => M({ title: `${P}: ${staffName(r.pm_id)} is now Project Manager`, title_km: `${P}៖ ${staffName(r.pm_id)} ជាអ្នកគ្រប់គ្រងគម្រោងថ្មី` }));
        if (changed(b, r, "progress")) return pick(() => M({ silent: true, title: `${P} progress now ${r.progress}%`, title_km: `${P} វឌ្ឍនភាពឥឡូវ ${r.progress}%` }));
        if (changed(b, r, "handover_date")) return pick(() => M({ due: dLong(r.handover_date), title: `${P}: handover date ${dLong(r.handover_date)}`, title_km: `${P}៖ ថ្ងៃប្រគល់ការងារ ${dLong(r.handover_date)}`, body: r.dlp_months ? "Defects period: " + r.dlp_months + " months" : "" }));
        if (changed(b, r, "lat") || changed(b, r, "lng")) return pick(() => M({ title: `${P}: site location saved`, title_km: `${P}៖ បានរក្សាទុកទីតាំងការដ្ឋាន` }));
        return pick(() => M({ title: `${P} updated`, title_km: `បានកែប្រែគម្រោង ${P}`, body: e.summary || "" }));
      }
      case "project_members": {
        const P = projFull(r.project_id);
        return pick((to) => to === r.staff_id ? M({ title: `You were added to ${P}`, title_km: `អ្នកត្រូវបានបញ្ចូលក្នុងគម្រោង ${P}`, body: r.role || "" })
          : M({ title: `${staffName(r.staff_id)} added to ${P}`, title_km: `${staffName(r.staff_id)} ត្រូវបានបញ្ចូលក្នុងគម្រោង ${P}`, body: r.role || "" }));
      }
      case "claims": {
        const P = projFull(r.project_id), ref = "IPC " + r.ipc_no, amount = money(r.certified || r.claimed);
        if (isNew) return pick(() => M({ ref, amount: money(r.claimed), title: `${P} IPC ${r.ipc_no} started`, title_km: `${P} · បានបង្កើត IPC ${r.ipc_no}`, body: r.period || "" }));
        if (!changed(b, r, "status")) return null;
        if (r.status === "Paid") return pick(() => M({ ref, amount, kind: "approved", title: `${P} IPC ${r.ipc_no} paid by the client`, title_km: `${P} · ម្ចាស់គម្រោងបានបង់ប្រាក់ IPC ${r.ipc_no}` }));
        const nx = { "QS checked": [[(byId("projects", r.project_id) || {}).pm_id], "verification", "ការផ្ទៀងផ្ទាត់"], "PM verified": [ids_("MD"), "approval", "ការអនុម័ត"], "MD approved": [grp_("FIN"), "invoice", "ការចេញវិក្កយបត្រ"], Invoiced: [grp_("FIN"), "payment collection", "ការប្រមូលប្រាក់"] }[r.status];
        const by = `${r.status} by ${actor}`, byKm = `${KMW(r.status)} ដោយ ${actor}`;
        return pick((to) => nx && nx[0].includes(to)
          ? M({ ref, amount, kind: "action", title: `${P} IPC ${r.ipc_no} waiting for your ${nx[1]}`, title_km: `${P} IPC ${r.ipc_no} រង់ចាំ${nx[2]}របស់អ្នក`, body: by, body_km: byKm })
          : M({ ref, amount, title: `${P} IPC ${r.ipc_no}: ${by}`, title_km: `${P} IPC ${r.ipc_no}៖ ${byKm}`, body: (lastHist(r) || {}).note || "" }));
      }
      case "invoices": {
        const ref = r.inv_no, amount = money(r.amount), due = r.due_date && r.status !== "Paid" ? "due " + dLong(r.due_date) : "";
        if (r.direction === "Receivable") {
          if (isNew) { const c = r.source_type === "claim" ? byId("claims", r.source_id) : null; return pick(() => M({ ref, amount, due, title: `${ref} · Client invoice${c ? " for IPC " + c.ipc_no : ""}`, title_km: `${ref} · វិក្កយបត្រម្ចាស់គម្រោង${c ? " សម្រាប់ IPC " + c.ipc_no : ""}`, body: r.party || "" })); }
          if (changed(b, r, "status") && r.status === "Paid") return pick(() => M({ ref, amount, kind: "approved", title: `${ref} · Received from ${r.party}`, title_km: `${ref} · បានទទួលពី ${r.party}` }));
          return null;
        }
        if ((isNew && r.status === "Paid") || (changed(b, r, "status") && r.status === "Paid")) return pick(() => M({ ref, amount, kind: "approved", title: `${ref} · Paid to ${r.party}`, title_km: `${ref} · បានបង់ឱ្យ ${r.party}` }));
        if (!isNew) return null;
        const src = r.source_type === "po" ? (byId("purchase_orders", r.source_id) || {}).po_no : r.source_type === "sub_payment" ? (byId("sub_payments", r.source_id) || {}).pc_no : r.source_type === "retention" ? "retention" : r.source_type === "request" ? (byId("requests", r.source_id) || {}).ref_no : "";
        const fin = grp_("FIN");
        return pick((to) => M({ ref, amount, due, kind: fin.includes(to) ? "action" : "info", title: `${ref} · New bill to pay: ${r.party}`, title_km: `${ref} · វិក្កយបត្រថ្មីត្រូវបង់៖ ${r.party}`, body: src ? "For " + src : "", body_km: src ? "សម្រាប់ " + (src === "retention" ? "ប្រាក់កាត់ទុក" : src) : "" }));
      }
      case "inspections": {
        const t = r.title, due = r.insp_date ? dLong(r.insp_date) : "";
        if (isNew) return pick((to) => to === r.inspector_id
          ? M({ kind: "action", due, title: `Inspection request: ${t}`, title_km: `សំណើត្រួតពិនិត្យ៖ ${t}`, body: r.area || "" })
          : M({ due, title: `Inspection request: ${t}`, title_km: `សំណើត្រួតពិនិត្យ៖ ${t}`, body: r.area || "" }));
        if (!changed(b, r, "result")) return null;
        if (r.result === "Passed") return pick(() => M({ kind: "approved", title: `Inspection passed: ${t}`, title_km: `ការត្រួតពិនិត្យជាប់៖ ${t}`, body: cut(r.result_note, 200) }));
        if (r.result === "Failed") return pick(() => M({ kind: "rejected", title: `Inspection failed: ${t}`, title_km: `ការត្រួតពិនិត្យមិនជាប់៖ ${t}`, body: r.result_note ? "Reason: " + cut(r.result_note, 300) : "" }));
        return null;
      }
      case "defects": {
        const d = cut(r.description, 90), due = r.due_date && r.status === "Open" ? "due " + dLong(r.due_date) : "";
        if (isNew) return pick((to) => to === r.assigned_to
          ? M({ kind: "action", due, title: `Defect to fix: ${d}`, title_km: `ចំណុចខ្វះខាតត្រូវជួសជុល៖ ${d}`, body: [r.location, r.priority].filter(Boolean).join(" · ") })
          : M({ due, title: `New defect: ${d}`, title_km: `ចំណុចខ្វះខាតថ្មី៖ ${d}`, body: [r.location, "Assigned to " + staffName(r.assigned_to)].filter(Boolean).join(" · ") }));
        if (!changed(b, r, "status")) return null;
        if (r.status === "Fixed") return pick((to) => M({ kind: to === r.raised_by ? "action" : "info", title: `Defect fixed, please check: ${d}`, title_km: `បានជួសជុលរួច សូមពិនិត្យ៖ ${d}`, body: "Fixed by " + staffName(r.fixed_by || e.actor), body_km: "ជួសជុលដោយ " + staffName(r.fixed_by || e.actor) }));
        if (r.status === "Closed") return pick((to) => M({ kind: to === r.assigned_to ? "approved" : "info", title: `Defect closed: ${d}`, title_km: `បានបិទចំណុចខ្វះខាត៖ ${d}` }));
        if (r.status === "Open") return pick((to) => M({ kind: to === r.assigned_to ? "rejected" : "info", due, title: `Defect reopened: ${d}`, title_km: `បានបើកចំណុចខ្វះខាតឡើងវិញ៖ ${d}`, body: r.verify_note ? "Reason: " + cut(r.verify_note, 300) : "" }));
        return null;
      }
      case "safety": {
        const P = projFull(r.project_id), T = r.rec_type || "Safety record", Tk = KMW(T);
        if (isNew) {
          const hi = r.severity === "High", act_ = [ (byId("projects", r.project_id) || {}).pm_id ].concat(ids_("SITEMGR"), ids_("MD"));
          return pick((to) => M({ kind: hi && act_.includes(to) ? "action" : "info", due: dLong(r.rec_date), title: hi ? `HIGH severity ${T.toLowerCase()} on ${P}` : `${T} on ${P}`, title_km: hi ? `${Tk} កម្រិតធ្ងន់ធ្ងរខ្ពស់ នៅ ${P}` : `${Tk} នៅ ${P}`, body: cut(r.description, 200) }));
        }
        if (changed(b, r, "status") && r.status === "Closed") return pick((to) => M({ kind: to === r.reported_by ? "approved" : "info", title: `Safety ${T.toLowerCase()} closed on ${P}`, title_km: `បានបិទ${Tk} នៅ ${P}`, body: cut(r.correction, 200) }));
        return null;
      }
      case "site_visits": {
        const ref = r.svr_no;
        const newActs = (to) => (r.actions || []).filter((a) => a.who === to && !a.done && !((b && b.actions) || []).some((x) => x.who === to && x.action === a.action));
        const forOwner = (to) => { const a = newActs(to)[0]; return a ? M({ ref, kind: "action", due: a.by ? "by " + dLong(a.by) : "", title: `${ref} · Action for you: ${cut(a.action, 120)}`, title_km: `${ref} · សកម្មភាពសម្រាប់អ្នក៖ ${cut(a.action, 120)}`, body: r.client || "" }) : null; };
        if (isNew) return pick((to) => forOwner(to) || M({ ref, due: dLong(r.visit_date), title: `${ref} · Site visit: ${r.client}`, title_km: `${ref} · ចុះពិនិត្យទីតាំង៖ ${r.client}`, body: [r.address, r.city].filter(Boolean).join(", ") }));
        if (changed(b, r, "approved_by") && r.approved_by) return pick((to) => M({ ref, kind: to === r.author_id ? "approved" : "info", title: `${ref} · Report approved by ${actor}`, title_km: `${ref} · របាយការណ៍ត្រូវបានអនុម័តដោយ ${actor}`, body: r.client || "" }));
        if (changed(b, r, "status")) {
          const s = { Quoted: ["Quotation sent", "បានផ្ញើសម្រង់តម្លៃ"], Won: ["Won: project " + projFull(r.project_id), "ទទួលបានការងារ៖ គម្រោង " + projFull(r.project_id)], Lost: ["Lost", "មិនបានការងារ"], Lead: ["Back to lead", "ត្រឡប់ជាអតិថិជនសក្តានុពលវិញ"] }[r.status] || [r.status, KMW(r.status)];
          return pick((to) => M({ ref, kind: r.status === "Won" && to === r.author_id ? "approved" : "info", amount: r.quote_value ? money(r.quote_value) : "", title: `${ref} · ${s[0]}`, title_km: `${ref} · ${s[1]}`,
            body: [r.client, r.status === "Lost" && r.lost_reason ? "Reason: " + cut(r.lost_reason, 200) : ""].filter(Boolean).join(" · ") }));
        }
        return pick((to) => forOwner(to) || M({ ref, title: `${ref} · Site visit updated: ${r.client}`, title_km: `${ref} · បានកែប្រែរបាយការណ៍ចុះពិនិត្យទីតាំង៖ ${r.client}` }));
      }
      case "variations": {
        const ref = r.vo_no, t = r.title, amount = r.amount ? money(r.amount) : "", qs = grp_("QS"), pm = (byId("projects", r.project_id) || {}).pm_id, raiser = (to) => to === r.raised_by;
        const note = (lastHist(r) || {}).note || "";
        if (isNew) return pick((to) => M({ ref, kind: qs.includes(to) ? "action" : "info", title: `${ref} · New variation to price: ${t}`, title_km: `${ref} · ការងារកែប្រែថ្មីត្រូវដាក់តម្លៃ៖ ${t}`, body: cut(r.reason, 200) }));
        if (!changed(b, r, "status")) return null;
        const st = r.status, was = b.status;
        if (st === "Priced") return pick((to) => to === pm ? M({ ref, amount, kind: "action", title: `${ref} · Priced, waiting for your check`, title_km: `${ref} · បានដាក់តម្លៃ រង់ចាំការពិនិត្យរបស់អ្នក`, body: t + (r.time_days ? " · +" + r.time_days + " days" : "") })
          : M({ ref, amount, title: `${ref} · Priced by ${actor}`, title_km: `${ref} · បានដាក់តម្លៃដោយ ${actor}`, body: t }));
        if (st === "PM checked") return pick((to) => ids_("MD").includes(to) ? M({ ref, amount, kind: "action", title: `${ref} · Price waiting for your approval`, title_km: `${ref} · តម្លៃរង់ចាំការអនុម័តរបស់អ្នក`, body: t })
          : M({ ref, amount, title: `${ref} · Checked by ${actor}`, title_km: `${ref} · បានពិនិត្យដោយ ${actor}`, body: t }));
        if (st === "MD approved") return pick((to) => to === pm || qs.includes(to) ? M({ ref, amount, kind: "action", title: `${ref} · Price approved: send to the client`, title_km: `${ref} · តម្លៃត្រូវបានអនុម័ត៖ សូមផ្ញើទៅម្ចាស់គម្រោង`, body: t })
          : M({ ref, amount, kind: raiser(to) ? "approved" : "info", title: `${ref} · Price approved by ${actor}`, title_km: `${ref} · តម្លៃត្រូវបានអនុម័តដោយ ${actor}`, body: t }));
        if (st === "Sent to client") return pick(() => M({ ref, amount, title: `${ref} · Sent to the client`, title_km: `${ref} · បានផ្ញើទៅម្ចាស់គម្រោង`, body: [t, r.client_ref ? "How: " + r.client_ref : ""].filter(Boolean).join(" · ") }));
        if (st === "Client approved") return pick((to) => M({ ref, amount, kind: raiser(to) ? "approved" : "info", title: `${ref} · Client approved: add to the next IPC`, title_km: `${ref} · ម្ចាស់គម្រោងបានយល់ព្រម៖ បញ្ចូលក្នុង IPC បន្ទាប់`, body: t }));
        if (st === "Client rejected") return pick((to) => M({ ref, amount, kind: raiser(to) ? "rejected" : "info", title: `${ref} · Client rejected`, title_km: `${ref} · ម្ចាស់គម្រោងមិនយល់ព្រម`, body: [note ? "Reason: " + cut(note, 300) : "", t].filter(Boolean).join(" · ") }));
        if (st === "Raised" && was !== "Raised") return pick((to) => M({ ref, kind: qs.includes(to) || raiser(to) ? "rejected" : "info", title: `${ref} · Returned to QS by ${actor}`, title_km: `${ref} · ${actor} បានបញ្ជូនត្រឡប់ទៅ QS វិញ`, body: [note ? "Reason: " + cut(note, 300) : "", t].filter(Boolean).join(" · ") }));
        if (st === "Cancelled") return pick((to) => M({ ref, kind: raiser(to) ? "rejected" : "info", title: `${ref} · Cancelled by ${actor}`, title_km: `${ref} · បានលុបចោលដោយ ${actor}`, body: [note ? "Reason: " + cut(note, 300) : "", t].filter(Boolean).join(" · ") }));
        if (st === "In claim") { const c = byId("claims", r.claim_id); return pick(() => M({ ref, amount, title: `${ref} · Added to IPC ${c ? c.ipc_no : ""}`, title_km: `${ref} · បានបញ្ចូលក្នុង IPC ${c ? c.ipc_no : ""}`, body: t })); }
        return pick(() => M({ ref, amount, title: `${ref} · ${st}`, title_km: `${ref} · ${KMW(st)}`, body: t }));
      }
      case "sub_payments": {
        const k = byId("sub_contracts", r.contract_id) || {}, sub = (byId("subcontractors", k.sub_id) || {}).name || "", ref = r.pc_no, pm = (byId("projects", k.project_id) || {}).pm_id;
        const M2 = (o) => Object.assign(M(o), { project: projFull(k.project_id) });
        if (isNew) return pick((to) => M2({ ref, amount: money(r.claimed), kind: grp_("QS").includes(to) ? "action" : "info", title: `${ref} · ${sub} payment claim to check`, title_km: `${ref} · ការស្នើសុំទូទាត់ពី ${sub} ត្រូវពិនិត្យ` }));
        if (!changed(b, r, "status")) return null;
        if (r.status === "QS checked") return pick((to) => M2({ ref, amount: money(r.certified), kind: to === pm ? "action" : "info", title: to === pm ? `${ref} · ${sub} claim checked: waiting for your approval` : `${ref} · ${sub} claim checked by ${actor}`, title_km: to === pm ? `${ref} · ការស្នើសុំទូទាត់ពី ${sub} បានពិនិត្យរួច រង់ចាំការអនុម័តរបស់អ្នក` : `${ref} · ការស្នើសុំទូទាត់ពី ${sub} ត្រូវបានពិនិត្យដោយ ${actor}`,
          body: `Certified ${money(r.certified)} of ${money(r.claimed)} claimed` + (Number(r.retention_amt) ? " · retention " + money(r.retention_amt) : ""), body_km: `បញ្ជាក់ ${money(r.certified)} ក្នុងចំណោម ${money(r.claimed)} ដែលបានស្នើ` + (Number(r.retention_amt) ? " · ប្រាក់កាត់ទុក " + money(r.retention_amt) : "") }));
        if (r.status === "PM approved") { const inv = db.invoices.find((i) => i.source_type === "sub_payment" && i.source_id === r.id), fin = grp_("FIN");
          return pick((to) => M2({ ref, amount: money(Number(r.certified || 0) - Number(r.retention_amt || 0)), due: inv && inv.due_date ? "due " + dLong(inv.due_date) : "", kind: fin.includes(to) ? "action" : "info",
            title: `${ref} · ${sub} approved: bill ${inv ? inv.inv_no : ""} to pay`, title_km: `${ref} · ${sub} PM បានអនុម័ត៖ ត្រូវបង់វិក្កយបត្រ ${inv ? inv.inv_no : ""}` })); }
        if (r.status === "Paid") return pick(() => M2({ ref, amount: money(Number(r.certified || 0) - Number(r.retention_amt || 0)), kind: "approved", title: `${ref} · ${sub} paid`, title_km: `${ref} · បានបង់ប្រាក់ ${sub}` }));
        return pick(() => M2({ ref, title: `${ref} · ${sub}: ${r.status}`, title_km: `${ref} · ${sub}៖ ${KMW(r.status)}`, body: (lastHist(r) || {}).note || "" }));
      }
      case "sub_contracts": {
        const sub = (byId("subcontractors", r.sub_id) || {}).name || "", P = projFull(r.project_id);
        if (isNew) return pick(() => M({ amount: money(r.contract_value), title: `${sub}: new contract on ${P}`, title_km: `${sub}៖ កិច្ចសន្យាថ្មីនៅ ${P}`, body: cut(r.scope, 160) }));
        if (changed(b, r, "retention_released") && r.retention_released) return pick((to) => M({ kind: grp_("FIN").includes(to) ? "action" : "info", title: `Retention to pay: ${sub}`, title_km: `ត្រូវបង់ប្រាក់កាត់ទុកឱ្យ ${sub}` }));
        if (changed(b, r, "ratings")) return pick(() => M({ title: `${sub} rated on ${P}`, title_km: `បានវាយតម្លៃ ${sub} នៅ ${P}` }));
        return pick(() => M({ title: `${sub}: contract changed on ${P}`, title_km: `${sub}៖ បានកែប្រែកិច្ចសន្យានៅ ${P}` }));
      }
      case "subcontractors": return pick(() => M({ title: (isNew ? "New subcontractor: " : "Subcontractor changed: ") + r.name, title_km: (isNew ? "អ្នកម៉ៅការបន្តថ្មី៖ " : "បានកែប្រែអ្នកម៉ៅការបន្ត៖ ") + r.name, body: r.trade || "", body_km: KMW(r.trade) }));
      case "tests": {
        const ref = r.test_no, n = r.test_type || r.system || "";
        if (isNew) return pick(() => M({ ref, title: `${ref} · Test sheet: ${n}`, title_km: `${ref} · សន្លឹកតេស្ត៖ ${n}`, body: r.location || "" }));
        if (!changed(b, r, "result")) return null;
        if (r.result === "Pass") return pick((to) => M({ ref, kind: to === r.tested_by ? "approved" : "info", title: `${ref} · ${n} PASSED`, title_km: `${ref} · ${n} ជាប់`, body: r.location || "" }));
        if (r.result === "Fail") { const nd = (r.defect_ids || []).length; return pick((to) => M({ ref, kind: to === r.tested_by ? "rejected" : "info", title: `${ref} · ${n} FAILED: ${nd} defects raised`, title_km: `${ref} · ${n} មិនជាប់៖ បានបង្កើតចំណុចខ្វះខាត ${nd}`, body: r.location || "" })); }
        return null;
      }
      case "handover_items": return pick(() => M({ title: `Handover item ${String(r.status || "").toLowerCase()}: ${r.title}`, title_km: `មុខប្រគល់ការងារ ${KMW(r.status)}៖ ${r.title}`, due: r.due_date ? "due " + dLong(r.due_date) : "" }));
      case "warranties": return pick(() => M({ due: dLong(r.end_date), title: `Warranty ${r.item} until ${dLong(r.end_date)}`, title_km: `ការធានា ${r.item} រហូតដល់ ${dLong(r.end_date)}`, body: r.supplier || "" }));
      case "staff": {
        if (changed(b, r, "left_on")) return pick(() => r.left_on ? M({ title: `${r.name} left the company (last day ${dLong(r.left_on)})`, title_km: `${r.name} បានចាកចេញពីក្រុមហ៊ុន (ថ្ងៃចុងក្រោយ ${dLong(r.left_on)})` }) : M({ title: `${r.name} is back`, title_km: `${r.name} បានត្រឡប់មកធ្វើការវិញ` }));
        return pick((to) => to === r.id ? M({ title: `Your details were updated by ${actor}`, title_km: `ព័ត៌មានរបស់អ្នកត្រូវបានកែប្រែដោយ ${actor}`, body: r.title || "" })
          : M({ title: `${r.name}'s details updated`, title_km: `បានកែប្រែព័ត៌មានរបស់ ${r.name}`, body: r.title || "" }));
      }
      case "app_settings": return pick(() => M({ title: "Permission changed: " + (e.summary || ""), title_km: "បានប្តូរសិទ្ធិ៖ " + (e.summary || "") }));
      case "events": {
        const t = r.title, due = dLong(r.date) + (r.all_day || !r.start_time ? "" : " " + r.start_time + (r.end_time ? "–" + r.end_time : "")), loc = r.location || "";
        if (isNew) return pick(() => M({ kind: "reminder", ref: r.no || "", due, title: `Invitation: ${t}`, title_km: `ការអញ្ជើញ៖ ${t}`, body: [loc, "By " + actor].filter(Boolean).join(" · "), body_km: "ដោយ " + actor }));
        if (changed(b, r, "status") && r.status === "Cancelled") { const why = String(r.notes || "").split("\n").reverse().find((x) => /^Cancelled: /.test(x)); return pick(() => M({ kind: "reminder", ref: r.no || "", due, title: `CANCELLED: ${t}`, title_km: `បានលុបចោល៖ ${t}`, body: why ? "Reason: " + why.replace(/^Cancelled: /, "") : "" })); }
        if ((changed(b, r, "status") && r.status === "Done") || changed(b, r, "minutes")) return pick(() => M({ ref: r.no || "", due, title: r.minutes ? `Minutes ready: ${t}` : `Meeting done: ${t}`, title_km: r.minutes ? `កំណត់ហេតុប្រជុំរួចរាល់៖ ${t}` : `កិច្ចប្រជុំបានបញ្ចប់៖ ${t}` }));
        const what = [changed(b, r, "date") || changed(b, r, "start_time") || changed(b, r, "end_time") ? "New date / time: " + due : "", changed(b, r, "location") ? "New place: " + loc : ""].filter(Boolean).join(" · ");
        return pick(() => M({ kind: "reminder", ref: r.no || "", due, title: `Changed: ${t}`, title_km: `បានកែប្រែ៖ ${t}`, body: what || loc }));
      }
      case "suppliers": return pick(() => M({ title: (isNew ? "New supplier: " : "Supplier changed: ") + r.name, title_km: (isNew ? "អ្នកផ្គត់ផ្គង់ថ្មី៖ " : "បានកែប្រែអ្នកផ្គត់ផ្គង់៖ ") + r.name, body: [r.trade, r.phone].filter(Boolean).join(" · ") }));
      case "stock_items": return pick(() => M({ title: (isNew ? "New stock item: " : "Stock item changed: ") + r.name, title_km: (isNew ? "មុខទំនិញស្តុកថ្មី៖ " : "បានកែប្រែមុខទំនិញស្តុក៖ ") + r.name, body: [r.unit, r.min_qty ? "minimum " + r.min_qty : ""].filter(Boolean).join(" · ") }));
      case "stores": return pick(() => M({ title: (isNew ? "New store: " : "Store changed: ") + r.name, title_km: (isNew ? "ឃ្លាំងថ្មី៖ " : "បានកែប្រែឃ្លាំង៖ ") + r.name }));
      case "cost_lines": return pick(() => M({ amount: money(r.actual), title: `${projFull(r.project_id)} ${r.category}: actual cost now ${money(r.actual)}`, title_km: `${projFull(r.project_id)} ${KMW(r.category)}៖ ចំណាយជាក់ស្តែងឥឡូវ ${money(r.actual)}`, body: "Budget " + money(r.budget), body_km: "ថវិកា " + money(r.budget) }));
      default: {
        const t = noteTitle(tbl, r, e.summary) || e.summary || "";
        return pick(() => M({ title: t, title_km: KMW(t), body: cut(noteBody(tbl, r, e.summary), 300) }));
      }
    }
  }
  // Save alert rows in one request. If the database is not upgraded yet (no v23 columns), save them the old way (title and body only).
  const V23_NOTE_COLS = ["kind", "module", "ref", "project", "amount", "due", "title_km", "body_km", "silent"];
  async function insertNotes(rows) {
    if (!rows.length) return [];
    try { return await Store.insertMany("notifications", rows); }
    catch (err) {
      if (Store.mode !== "supabase") return [];
      const old = rows.map((x) => { const y = Object.assign({}, x); V23_NOTE_COLS.forEach((c) => delete y[c]); delete y.id; delete y.created_at; return y; });
      try { const saved = await Store.insertMany("notifications", old); console.warn("alerts saved without the v23 columns: run supabase/update-v23.sql", err); return saved; } catch (x) { return []; /* never block the work */ }
    }
  }
  // One alert row (columns of the notifications table) for one reader
  function noteRow(to, actorId, tbl, recordId, m, at) {
    return { to_id: to, actor_id: actorId, title: cut(m.title, 250), body: cut(m.body, 300), tbl, record_id: recordId, read: false, at,
      kind: m.kind || "info", module: NOTE_MODULE[tbl] || "", ref: m.ref || "", project: m.project || "", amount: m.amount || "", due: m.due || "",
      title_km: cut(m.title_km || "", 250), body_km: cut(m.body_km || "", 300), silent: !!m.silent };
  }
  let noteQueue = [], noteTimer = null;
  function queueNotify(action, tbl, record_id, summary, before) {
    if (["audit_log", "notifications", "announcements"].includes(tbl) || (tbl === "app_settings" && String(record_id).startsWith("notify-"))) return;
    // several saves of one record in one go: keep the first "before" (Created = no before) and the latest summary
    const prev = noteQueue.find((x) => x.tbl === tbl && x.record_id === record_id);
    if (prev) { prev.summary = summary; prev.actor = state.user; if (action === "Created") prev.before = null; return; }
    noteQueue.push({ tbl, record_id, summary, actor: state.user, action, before: action === "Created" ? null : before || null });
    clearTimeout(noteTimer); noteTimer = setTimeout(flushNotify, 400);
  }
  async function flushNotify() {
    const q = noteQueue; noteQueue = []; if (!q.length) return;
    // One alert per person: when one tap saved several records, the person gets the one that matters most to them
    // (something they must do first, then a request, then the first record), with its own clear text (no "+N more").
    const per = new Map();
    for (const e of q) {
      const r = e.tbl === "app_settings" ? { id: e.record_id } : byId(e.tbl, e.record_id); e.r = r;
      let msgFor = null; try { msgFor = describe(e); } catch (err) { console.warn("alert text", err); }
      if (!msgFor) continue;
      for (const to of recipientsFor(e.tbl, r, e.actor)) {
        let m = null; try { m = msgFor(to); } catch (err) { console.warn("alert text", err); }
        if (!m || !m.title) continue;
        const rank = (m.kind === "action" ? 0 : m.kind === "rejected" || m.kind === "approved" ? 1 : 2) * 2 + (e.tbl === "requests" ? 0 : 1);
        const cur = per.get(to); if (!cur || rank < cur.rank) per.set(to, { e, m, rank });
      }
    }
    const at = nowIso(), rows = [...per].map(([to, x]) => noteRow(to, x.e.actor, x.e.tbl, x.e.record_id, x.m, at));
    await insertNotes(rows);
    if (Store.mode === "local" && db.notifications.length > 600) { db.notifications = db.notifications.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 500); Store.writeLocal(); }
    updateBell();
  }
  const myNotes = (u) => db.notifications.filter((x) => x.to_id === u.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const unreadCount = (u) => db.notifications.filter((x) => x.to_id === u.id && !x.read).length;
  // Unread counts per menu item (module), shown as red badges on the menu, the phone tab bar, the browser tab and the installed app icon
  function unreadByModule(u) { const m = {}; db.notifications.forEach((x) => { if (x.to_id === u.id && !x.read) { const r = NOTE_MODULE[x.tbl] || "admin"; m[r] = (m[r] || 0) + 1; } }); return m; }
  const badgeTxt = (n) => n > 99 ? "99+" : String(n);
  let favBase = null, lastBadge = -1;
  function setTabBadge(n) {
    document.title = (n ? "(" + badgeTxt(n) + ") " : "") + "GID Management System · Demo";
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); } } catch (e) { /* not supported */ }
    if (n === lastBadge) return; lastBadge = n;
    const draw = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
        g.drawImage(favBase, 2, 2, 60, 60);
        if (n) { const t = badgeTxt(n), w = Math.max(34, 14 + t.length * 13); g.fillStyle = "#e5484d"; g.beginPath(); g.roundRect ? g.roundRect(64 - w, 0, w, 34, 17) : g.arc(47, 17, 17, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "bold 24px system-ui, Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, 64 - w / 2, 18); }
        let l = document.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
        l.type = "image/png"; l.href = c.toDataURL("image/png");
      } catch (e) { /* favicon badge not available */ }
    };
    if (favBase && favBase.complete) draw(); else { favBase = new Image(); favBase.onload = draw; favBase.src = "img/icon-64.png"; }
  }
  function updateBell() {
    const u = me(); if (!u) return; const n = unreadCount(u), mods = unreadByModule(u);
    document.querySelectorAll("[data-badge]").forEach((el) => { const k = el.dataset.badge, v = k === "all" ? n : (mods[k] || 0); let d = el.querySelector(".nb"); if (v) { if (!d) { d = document.createElement("span"); d.className = "nb"; el.appendChild(d); } d.textContent = badgeTxt(v); } else if (d) d.remove(); el.classList.toggle("has-nb", !!v); });
    const b = $("#bell"); if (b) b.setAttribute("aria-label", n + " unread notifications");
    setTabBadge(n);
  }
  function ringBell() { document.querySelectorAll(".bell-ring").forEach((b) => { b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring"); }); }
  // Opening a record from anywhere marks its notifications as read
  async function markSeen(tbl, id) {
    const u = me(); if (!u || !id) return;
    const list = db.notifications.filter((x) => x.to_id === u.id && !x.read && x.tbl === tbl && x.record_id === id);
    for (const x of list) { try { await Store.update("notifications", x.id, { read: true }); } catch (e) { /* ignore */ } }
    if (list.length) updateBell();
  }
  const ago_ = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  function openRecord(tbl, id) {
    const r = byId(tbl, id);
    const map = { requests: openRequest, purchase_orders: openPO, daily_reports: openDaily, documents: openDoc, tasks: openTask, claims: openClaim, invoices: openInvoice, defects: openDefect, safety: openSafety,
      inspections: openInspection, projects: openProject, staff: openPerson, stock_items: openItem, site_visits: openSvr,
      variations: openVO, subcontractors: openSub, sub_payments: openPayment, tests: openTest, sub_contracts: (k) => openSub(byId("subcontractors", k.sub_id)), events: openEvent, announcements: openAnnouncement };
    if (tbl === "welcome") { const st = byId("staff", id); if (st) return openPerson(st); }
    if (tbl === "accounts") { state.tab.people = "accounts"; ACC.loaded = false; if (state.route === "people" && (location.hash || "").replace(/^#\/?/, "") === "people") render(); else go("people"); return; }
    if (tbl === "stock_moves" && r) return openItem(byId("stock_items", r.item_id));
    if (tbl === "project_members" && r) return openProject(byId("projects", r.project_id));
    if (tbl === "invoices" && r) return openInvoice(r);
    if (map[tbl] && r) return map[tbl](r);
    const route = NOTE_MODULE[tbl]; if (route) go(route === "admin" ? "admin" : route);
  }
  function noteItem(n, unreadable) {
    // (v23) in Khmer, the alert's own Khmer title and detail when it has them; project, amount and date on their own line
    const km = window.I18N && I18N.lang === "km" && n.title_km, ann = n.tbl === "announcements";
    const title = km ? n.title_km : n.title, body = km && !ann ? [n.body_km].filter(Boolean).join(" · ") : String(n.body || "");
    const extra = [n.project, n.amount, n.due].filter(Boolean).join(" · ");
    return `<li class="${n.read || unreadable ? "" : "unread"} k-${esc(n.kind || "info")}" data-act="${act(async () => { closeDrawer(); if (!n.read && !unreadable) { await Store.update("notifications", n.id, { read: true }); updateBell(); } openRecord(n.tbl, n.record_id); })}">
      <span class="nic">${svgI(NOTE_ICON[n.tbl] || "bell")}</span><span${km || ann ? ' class="notr"' : ""}>${n.kind === "action" ? `<i class="nk">${km ? "រង់ចាំអ្នកចាត់ការ" : "Action needed"}</i>` : ""}<b>${esc(title)}</b><small>${esc(body.length > 160 ? body.slice(0, 157) + "…" : body)}</small>${extra ? `<small class="nx">${esc(extra)}</small>` : ""}<em>${esc(staffName(n.actor_id))} · ${ago_(n.at)}</em></span></li>`;
  }
  // ---------- Telegram alerts ----------
  // The database sends each new notification to the person's Telegram (see supabase/schema.sql and telegram-setup.sql).
  // The bot token never comes to the browser; the app only saves each person's chat ID.
  let tgStatus = { checked: false, ready: false, bot: "" };
  async function loadTelegramStatus() {
    // (v22) no answer within 15 seconds: say so (the card no longer shows "Checking…" for ever)
    const late = new Promise((res) => setTimeout(() => res({ late: true }), 15000));
    try {
      const r = await Promise.race([Store.client.rpc("telegram_status"), late]);
      if (r.late) { tgStatus = { checked: true, ready: false, bot: "", late: true }; return; }
      const { data, error } = r; if (error) throw error; tgStatus = { checked: true, ready: !!(data && data.ready), bot: (data && data.bot) || "" };
    }
    catch (e) { tgStatus = { checked: true, ready: false, bot: "", missing: true }; }
  }
  // Plain-language reasons for Telegram's error answers
  function tgReason(desc) {
    const d = String(desc || "").toLowerCase();
    if (d.includes("chat not found")) return "Telegram does not know this chat. Open the GID bot, press Start, then check the ID number.";
    if (d.includes("blocked")) return "You blocked the GID bot. Open it in Telegram, unblock it and press Start.";
    if (d.includes("deactivated")) return "This Telegram account is deleted or deactivated.";
    if (d.includes("unauthorized") || d.includes("not found") && !d.includes("chat")) return "The bot token in the database is wrong. The system admin must run telegram-setup.sql again with the token from @BotFather.";
    if (d.includes("button") || d.includes("url")) return "The demo link in telegram-setup.sql is not valid. The system admin must fix app_url.";
    if (d.includes("timed out")) return "Telegram did not answer in time. Try Send test again.";
    return desc ? "Telegram answered: " + desc : "";
  }
  let tgLast = {};
  async function checkTelegramResult(chat, tries) {
    for (let i = 0; i < (tries || 1); i++) {
      try { const { data } = await Store.client.rpc("telegram_last_result", { p_chat: String(chat).trim() }); tgLast = data || {}; } catch (e) { tgLast = { state: "unknown" }; }
      if (tgLast.state === "delivered" || tgLast.state === "failed" || tgLast.state === "none") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if ($("#drawer") && $("#tgbox")) openDrawer("set");
  }
  function telegramBox(u) {
    const head = `<hr class="sep"><p class="tg-h">${svgI("telegram")}<b>Telegram alerts</b></p>`;
    const me_ = byId("staff", u.id) || u, chat = String(me_.telegram_chat_id || "").trim(), linked = !!chat;
    const isAdmin = isAdminPage(u);
    const row = (ok, title, sub) => `<li class="${ok === true ? "ok" : ok === false ? "no" : "wait"}"><i>${ok === true ? "✓" : ok === false ? "✕" : "…"}</i><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span></li>`;
    // 1. database
    if (Store.mode !== "supabase") {
      return head + `<div id="tgbox" class="tg"><ul class="tg-check">${row(false, "Shared database not connected", "This website runs in browser-only mode, so messages cannot leave this phone or computer.")}${row(null, "GID bot", "Checked after the database is connected")}${row(null, "Your Telegram", "Linked after the database is connected")}</ul>
        <p class="small muted">${isAdmin ? "To switch Telegram on: put the Supabase Project URL and anon key into <b>config.js</b>, upload the folder to Netlify again, then run <b>schema.sql</b> and <b>telegram-setup.sql</b> in Supabase (SETUP.md, Steps 1 to 5)." : "Ask the system admin to connect the shared database. Telegram alerts start as soon as it is done."}</p></div>`;
    }
    if (!tgStatus.checked) return head + `<p class="muted small" id="tgbox">Checking Telegram set-up…</p>`;
    const bot = String(tgStatus.bot || "").replace(/^@/, "");
    const botRow = tgStatus.missing ? row(false, "Telegram part missing in the database", isAdmin ? "Run the new supabase/schema.sql, then telegram-setup.sql." : "The system admin must update the database.")
      : tgStatus.ready ? row(true, "GID bot ready", bot ? "@" + esc(bot) : "") : row(false, "GID bot not set up", isAdmin ? "Run supabase/telegram-setup.sql with the token from @BotFather." : "The system admin must finish the bot set-up.");
    let lastRow = "";
    if (linked && tgStatus.ready) {
      const L = tgLast || {};
      lastRow = L.state === "delivered" ? row(true, "Last message delivered", L.at ? fmtDate(L.at) + " " + String(new Date(L.at).toTimeString()).slice(0, 5) : "")
        : L.state === "failed" ? row(false, "Last message not delivered", esc(tgReason(L.description)))
        : L.state === "sending" ? row(null, "Sending…", "Waiting for Telegram's answer")
        : L.state === "none" ? row(null, "No message sent yet", "Press Send test message") : "";
    }
    return head + `<div id="tgbox" class="tg">
      <ul class="tg-check">${row(true, "Shared database connected", "")}${botRow}${row(linked, linked ? "Your Telegram is linked" : "Your Telegram is not linked yet", linked ? "Chat ID " + esc(chat) : "Follow the 3 steps below")}${lastRow}</ul>
      ${tgStatus.ready ? `<ol class="tg-steps small">
        <li>Open ${bot ? `<a href="https://t.me/${encodeURIComponent(bot)}" target="_blank" rel="noopener">@${esc(bot)}</a>` : "the GID bot"} in Telegram and press <b>Start</b>. A bot can only write to people who pressed Start.</li>
        <li>Open <a href="https://t.me/userinfobot" target="_blank" rel="noopener">@userinfobot</a> and press <b>Start</b>. It replies with your <b>Id</b> (a number like 512345678).</li>
        <li>Paste that number here, press <b>Save</b>, then <b>Send test message</b>.</li></ol>
      <div class="tg-row"><input id="tgid" inputmode="numeric" autocomplete="off" placeholder="Your Telegram ID, e.g. 512345678" value="${esc(chat)}" aria-label="Your Telegram ID">
        <button class="btn primary" data-act="${act(async () => {
          const v = $("#tgid").value.replace(/\s+/g, "");
          if (v && !/^-?[0-9]{5,15}$/.test(v)) return toast("The Telegram ID is only numbers, like 512345678. Do not use your @username or phone number.", true);
          await Store.update("staff", u.id, { telegram_chat_id: v }); // no alert to others for this
          tgLast = {}; toast(v ? "Telegram linked. Now press Send test message." : "Telegram unlinked"); openDrawer("set");
        })}">Save</button></div>
      ${linked ? `<button class="btn" data-act="${act(async (e, el) => {
          el.disabled = true; el.textContent = "Sending…";
          await insertNotes([Object.assign(noteRow(u.id, u.id, "staff", u.id, { kind: "info", title: "Telegram test from GID: it works", title_km: "សាកល្បង Telegram ពី GID៖ ដំណើរការបាន", body: "Alerts for " + u.name + " now arrive here.", body_km: "ដំណឹងសម្រាប់ " + u.name + " នឹងមកដល់ទីនេះ។" }, nowIso()), { read: true })]);
          tgLast = { state: "sending" }; openDrawer("set");
          await checkTelegramResult(chat, 6);
        })}">Send test message</button>` : ""}` : ""}
    </div>`;
  }
  function closeDrawer() { const d = $("#drawer"); if (d) d.remove(); }
  function openDrawer(tab) {
    closeDrawer();
    const u = me(); tab = tab || "mine";
    const notes = myNotes(u).slice(0, 80), unread = notes.filter((n) => !n.read).length;
    const feed = db.audit_log.filter((a) => { const mod = NOTE_MODULE[a.tbl]; if (!mod || !navVisible(u, mod)) return false; if (a.tbl === "accounts" && !canAccounts(u)) return false; const r = byId(a.tbl, a.record_id); if (a.tbl === "events" && !(r && canSeeEvent(u, r))) return false; return inScope(u, recordProject(a.tbl, r)); })
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80)
      .map((a) => ({ id: a.id, title: a.summary || a.action, body: a.action + " · " + (MODULE_NAMES[NOTE_MODULE[a.tbl]] || "Settings"), actor_id: a.actor_id, at: a.at, tbl: a.tbl, record_id: a.record_id, read: true }));
    const d = document.createElement("div"); d.id = "drawer"; d.className = "drawer-wrap";
    d.innerHTML = `<aside class="drawer" role="dialog" aria-label="Notifications"><div class="dh"><h3>Notifications</h3><button class="x" data-act="${act(closeDrawer)}" aria-label="Close notifications">×</button></div>
      <div class="tabs"><button class="tab ${tab === "mine" ? "on" : ""}" data-act="${act(() => openDrawer("mine"))}">For me${unread ? ` <span class="dot">${unread}</span>` : ""}</button><button class="tab ${tab === "feed" ? "on" : ""}" data-act="${act(() => openDrawer("feed"))}">All activity</button><button class="tab ${tab === "set" ? "on" : ""}" data-act="${act(() => openDrawer("set"))}">Settings</button></div>
      ${tab === "mine" ? `<div class="dbar"><span class="muted small">${unread} unread · ${esc(PREF_LABEL[notifyPref(u)])}</span>${unread ? `<button class="link" data-act="${act(async () => { for (const n of notes.filter((x) => !x.read)) await Store.update("notifications", n.id, { read: true }); updateBell(); openDrawer("mine"); })}">Mark all as read</button>` : ""}</div>
        <ul class="notes">${notes.map((n) => noteItem(n)).join("") || `<li class="empty">Nothing yet. You'll be told here when something needs you or changes on your work.</li>`}</ul>`
      : tab === "feed" ? `<p class="muted small" style="margin:8px 4px">Every change in the modules and projects you can see, newest first.</p><ul class="notes">${feed.map((n) => noteItem(n, true)).join("") || '<li class="empty">No activity yet.</li>'}</ul>`
      : `<div class="nset"><p><b>Notify me about</b></p>${Object.keys(PREF_LABEL).map((k) => `<label class="radio"><input type="radio" name="np" value="${k}" ${notifyPref(u) === k ? "checked" : ""}><span><b>${esc(PREF_LABEL[k])}</b><small>${k === "mine" ? "Approvals waiting for me, my requests, my tasks, my reports and anything assigned to me." : k === "projects" ? "Plus every report, order, stock movement and drawing on the projects I manage or work on." : "Plus every activity in the modules I can see. Best for the MD and Project Director."}</small></span></label>`).join("")}
        <p class="muted small">You are always told when something needs your approval or action, whatever you choose here.</p>
        ${"Notification" in window ? `<button class="btn" data-act="${act(async () => { try { const p = await Notification.requestPermission(); toast(p === "granted" ? "Phone and desktop alerts are on while the app is open." : "Alerts were not allowed by the browser."); } catch (e) { toast("This browser cannot show alerts here.", true); } })}">Turn on phone / desktop alerts</button>` : ""}${telegramBox(u)}</div>`}
    </aside>`;
    d.addEventListener("click", (e) => { if (e.target === d) closeDrawer(); });
    document.body.appendChild(d);
    if (tab === "set" && Store.mode === "supabase" && !tgStatus.checked) loadTelegramStatus().then(async () => {
      const c = String((byId("staff", u.id) || {}).telegram_chat_id || "").trim();
      if (c && tgStatus.ready && !tgLast.state) await checkTelegramResult(c, 1); else if ($("#drawer") && $("#tgbox")) openDrawer("set");
    });
    d.querySelectorAll('input[name="np"]').forEach((el) => el.addEventListener("change", async () => { await setNotifyPref(u, el.value); toast("Saved: " + PREF_LABEL[el.value]); }));
  }
  // Opening any record from anywhere marks its notifications as read
  openRequest = ((f) => (r, ...a) => { if (r) markSeen("requests", r.id); return f(r, ...a); })(openRequest);
  openPO = ((f) => (r, ...a) => { if (r) markSeen("purchase_orders", r.id); return f(r, ...a); })(openPO);
  openDaily = ((f) => (r, ...a) => { if (r) markSeen("daily_reports", r.id); return f(r, ...a); })(openDaily);
  openDoc = ((f) => (r, ...a) => { if (r) markSeen("documents", r.id); return f(r, ...a); })(openDoc);
  openTask = ((f) => (r, ...a) => { if (r) markSeen("tasks", r.id); return f(r, ...a); })(openTask);
  openClaim = ((f) => (r, ...a) => { if (r) markSeen("claims", r.id); return f(r, ...a); })(openClaim);
  openInvoice = ((f) => (r, ...a) => { if (r) markSeen("invoices", r.id); return f(r, ...a); })(openInvoice);
  openDefect = ((f) => (r, ...a) => { if (r) markSeen("defects", r.id); return f(r, ...a); })(openDefect);
  openSafety = ((f) => (r, ...a) => { if (r) markSeen("safety", r.id); return f(r, ...a); })(openSafety);
  openInspection = ((f) => (r, ...a) => { if (r) markSeen("inspections", r.id); return f(r, ...a); })(openInspection);
  openItem = ((f) => (r, ...a) => { if (r) { markSeen("stock_items", r.id); db.stock_moves.filter((m) => m.item_id === r.id).forEach((m) => { if (db.notifications.some((x) => x.tbl === "stock_moves" && x.record_id === m.id && !x.read)) markSeen("stock_moves", m.id); }); } return f(r, ...a); })(openItem);
  // Keep screens up to date when other people make changes: other browser tabs (browser demo) or the online database (Supabase)
  let lastNoteCheck = nowIso();
  function announceNew(fresh) {
    if (!fresh.length) return;
    // New notifications go to the bell list only (no pop-up); the red badges update and the bell rings once
    updateBell(); ringBell();
    try { if (window.Notification && Notification.permission === "granted" && document.hidden) fresh.slice(0, 3).forEach((n) => new Notification("GID · " + n.title, { body: n.body || "" })); } catch (e) { /* alerts not available */ }
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue || Store.mode !== "local") return;
    try { const before = new Set(db.notifications.map((n) => n.id)); Object.assign(db, JSON.parse(e.newValue)); const fresh = db.notifications.filter((n) => n.to_id === state.user && !before.has(n.id)); if (!$("#modal")) renderWhenFree(); else updateBell(); announceNew(fresh); } catch (x) { /* ignore */ }
  });
  setInterval(async () => {
    if (Store.mode !== "supabase" || !state.user) return;
    try {
      const { data } = await Store.client.from("notifications").select("id").eq("to_id", state.user).gt("at", lastNoteCheck).limit(50);
      lastNoteCheck = nowIso();
      if (data && data.length) { const known = new Set(db.notifications.map((n) => n.id)); await Store.loadAllRemote(); const fresh = db.notifications.filter((n) => n.to_id === state.user && !known.has(n.id)); if (!$("#modal") && !$("#drawer")) renderWhenFree(); else updateBell(); announceNew(fresh); }
    } catch (e) { /* try again next time */ }
  }, 20000);

  // (v22) Redraw for news from other people, but never under a finger, during a scroll or while typing: wait until the person is free
  function renderWhenFree() {
    clearTimeout(renderWhenFree.t);
    const a = document.activeElement, typing = a && a !== document.body && a.matches && a.matches("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable]");
    if (handsOn() || typing || document.querySelector("body > #badges, body > #lightbox")) { updateBell(); renderWhenFree.t = setTimeout(renderWhenFree, 1500); return; }
    if ($("#modal") || $("#drawer")) { updateBell(); return; }
    renderKeep();
  }

  // ================= UI building blocks =================
  const badge = (s) => `<span class="badge b-${esc(String(s || "").toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(s)}</span>`;
  const bar = (v, warn) => `<div class="bar ${warn ? "warn" : ""}"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div>`;
  const btn = (label, fn, cls) => `<button class="btn ${cls || ""}" data-act="${act(fn)}">${esc(label)}</button>`;
  const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;

  function table(cols, rows, onOpen) {
    if (!rows.length) return empty("Nothing here yet.");
    return `<table class="list"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) =>
      `<tr ${onOpen ? `data-act="${act(() => onOpen(r))}" class="click"` : ""}>${cols.map((c) => `<td data-label="${esc(c.label)}"><span class="tdv">${c.get(r)}</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function tabs(key, list) {
    const cur = state.tab[key] || list[0][0];
    return { cur, html: `<div class="tabs">${list.map(([k, label]) => `<button class="tab ${k === cur ? "on" : ""}" data-act="${act(() => { state.tab[key] = k; render(); })}">${esc(label)}</button>`).join("")}</div>` };
  }

  function projectFilter(u) {
    const list = myProjects(u);
    return `<select class="pf" data-change="project"><option value="">All my projects</option>${list.map((p) => `<option value="${p.id}" ${state.project === p.id ? "selected" : ""}>${esc(p.code + " " + p.name)}</option>`).join("")}</select>`;
  }
  const byProjectFilter = (r) => !state.project || r.project_id === state.project;
  const matchSearch = (r, fields) => !state.search || fields.some((f) => String(r[f] || "").toLowerCase().includes(state.search.toLowerCase()));

  function toolbar(u, opts) {
    return `<div class="toolbar">${opts.project !== false ? projectFilter(u) : ""}<input class="search" data-change="search" placeholder="Search" value="${esc(state.search)}">${opts.extra || ""}<span class="grow"></span>${opts.buttons || ""}</div>`;
  }

  // ---------- modal and forms ----------
  // Windows open on top of each other. A window opened from inside another one has a Back button
  // (and the phone's back button works too): Back returns to the window underneath, as it was.
  // After saving, the window underneath opens again with the new information.
  const MSTACK = []; let REOPENING = false, POP_SKIP = 0;
  function modalActs(node) { const keep = new Map(); node.querySelectorAll("[data-act]").forEach((el) => { const f = ACTS.get(el.dataset.act); if (f) keep.set(el.dataset.act, f); }); return keep; }
  function openModal(title, bodyHtml, onReady) {
    const cur = $("#modal");
    if (cur) {
      if (!REOPENING && cur.dataset.title !== title) {
        const body = cur.querySelector(".modal-body");
        MSTACK.push({ title: cur.dataset.title, node: cur, acts: modalActs(cur), reopen: cur._reopen || null, scroll: body ? body.scrollTop : 0 });
      }
      cur.remove();
    }
    const m = document.createElement("div"); m.className = "modal-wrap"; m.id = "modal"; m.dataset.title = title;
    m._reopen = REOPENING ? REOPENING : OPENER;
    const back = MSTACK.length ? `<button class="mback" data-act="${act(modalBack)}" aria-label="Back">${svgI("back")}<span>Back</span></button>` : "";
    m.innerHTML = `<div class="modal${MSTACK.length ? " nested" : ""}" role="dialog" aria-modal="true"><div class="modal-head">${back}<h3>${esc(title)}</h3><button class="x" data-act="${act(closeAllModals)}" aria-label="Close window">×</button></div><div class="modal-body">${bodyHtml}</div></div>`;
    m.addEventListener("click", (e) => { if (e.target === m) closeAllModals(); });
    document.body.appendChild(m);
    if (!(history.state && history.state.gidModal)) { try { history.pushState({ gidModal: true }, "", location.href); } catch (e) { /* ignore */ } }
    if (onReady) onReady(m);
    if (typeof translateNow === "function") translateNow(m);
  }
  // Back (Cancel, Back button, phone back): show the window underneath exactly as it was
  function modalBack() {
    const m = $("#modal"); if (m) m.remove();
    const prev = MSTACK.pop();
    if (!prev) { syncHistory(); return; }
    prev.acts.forEach((f, k) => ACTS.set(k, f));
    document.body.appendChild(prev.node);
    const b = prev.node.querySelector(".modal-body"); if (b) b.scrollTop = prev.scroll;
  }
  // After a save: open the window underneath again, so it shows the new information
  function closeModal() {
    const m = $("#modal"); if (m) m.remove();
    const prev = MSTACK.pop();
    if (!prev) { syncHistory(); return; }
    if (prev.reopen) {
      const r = prev.reopen; REOPENING = r;
      try { r(); } catch (e) { console.error(e); } finally { REOPENING = false; }
      const n = $("#modal"); if (n && n.dataset.title === prev.title) { const b = n.querySelector(".modal-body"); if (b) b.scrollTop = prev.scroll; return; }
    }
    if (!$("#modal")) { prev.acts.forEach((f, k) => ACTS.set(k, f)); document.body.appendChild(prev.node); }
  }
  function dropModal() { const m = $("#modal"); if (m) m.remove(); }
  function closeAllModals() { closeLightbox(); MSTACK.length = 0; const m = $("#modal"); if (m) m.remove(); syncHistory(); }
  // The photo viewer sits above every window. Returns true when it was open.
  function closeLightbox() { const lb = document.getElementById("lightbox"); if (!lb) return false; lb.remove(); return true; }
  // Layers on top of the page: a window, the photo viewer, the alerts panel, the phone menu
  const layerOpen = () => !!(document.querySelector("body > #modal, body > #lightbox, body > #drawer, body > #badges") || document.body.classList.contains("nav-open"));
  function pushLayer() { if (!(history.state && history.state.gidModal)) { try { history.pushState({ gidModal: true }, "", location.href); } catch (e) { /* ignore */ } } }
  // While a layer is open the page behind it does not scroll, and the phone's Back button closes the layer (one at a time) instead of leaving the screen
  let layersSeen = "";
  // (v22) The page is locked only while a layer really is on screen. Checked on every change, every redraw and every new touch,
  // so a lock (or an invisible menu backdrop) can never stay behind and freeze the page.
  function syncLayers() {
    document.documentElement.classList.toggle("lock-scroll", !!document.querySelector("body > #modal, body > #lightbox, body > #drawer, body > #badges"));
    // the slide-out menu only exists on phones and tablets (900 px or less); on a wider screen its "open" state is invisible: clear it
    if (document.body.classList.contains("nav-open") && !window.matchMedia("(max-width: 900px)").matches) document.body.classList.remove("nav-open");
  }
  // (v22) Is a finger on the screen, or did the page or a table just scroll? Then nothing is redrawn under the person's hand.
  let TOUCHING = 0, lastScrollAt = 0;
  document.addEventListener("touchstart", (e) => { TOUCHING = e.touches ? e.touches.length : 1; syncLayers(); }, { passive: true, capture: true });
  const touchOff = (e) => { TOUCHING = e.touches ? e.touches.length : 0; lastScrollAt = Date.now(); };
  document.addEventListener("touchend", touchOff, { passive: true, capture: true });
  document.addEventListener("touchcancel", touchOff, { passive: true, capture: true });
  window.addEventListener("scroll", () => { lastScrollAt = Date.now(); }, { passive: true, capture: true });
  const handsOn = () => TOUCHING > 0 || Date.now() - lastScrollAt < 900;
  new MutationObserver(() => {
    syncLayers();
    const now = ["#lightbox", "#drawer", "#badges"].filter((x) => document.querySelector("body > " + x)).concat(document.body.classList.contains("nav-open") ? ["nav"] : []).join(",");
    if (now === layersSeen) return;
    const opened = now.split(",").some((x) => x && !layersSeen.split(",").includes(x));
    layersSeen = now;
    if (opened) pushLayer(); else if (!layerOpen()) syncHistory();
  }).observe(document.body, { childList: true, attributes: true, attributeFilter: ["class"] });
  // A link tapped while a layer is open replaces the layer's Back step, so Back later returns to the screen before
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || !(history.state && history.state.gidModal)) return;
    const h = a.getAttribute("href") || "#";
    e.preventDefault();
    if (h === location.hash || (h === "#" && !location.hash)) { closeLightbox(); closeBadges(true); closeDrawer(); document.body.classList.remove("nav-open"); closeAllModals(); return; }
    // Replace the layer's Back step with the new screen in one go and clear its marker. (Safari on iPhone kept the
    // layer marker with location.replace(), so closing the menu then stepped Back to the old screen.)
    try { history.replaceState(null, "", h); } catch (err) { location.replace(h); return; }
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  // Keep the phone's back button in step with the windows
  function syncHistory() {
    setTimeout(() => { if (!layerOpen() && history.state && history.state.gidModal) { POP_SKIP++; history.back(); } }, 0);
  }
  window.addEventListener("popstate", () => {
    if (POP_SKIP) { POP_SKIP--; return; }
    // phone Back closes the top layer only: photo viewer, then the staff badges, then alerts panel, then menu, then one window
    let closed = closeLightbox();
    if (!closed && badgesOnTop()) closed = closeBadges();
    if (!closed && $("#drawer")) { closeDrawer(); closed = true; }
    if (!closed && document.body.classList.contains("nav-open")) { document.body.classList.remove("nav-open"); closed = true; }
    if (closed) { if (layerOpen()) pushLayer(); return; }
    if ($("#modal")) {
      modalBack();
      if (layerOpen()) pushLayer();
    }
  });

  // fields: {name,label,type:text|number|date|textarea|select|photo|staff|project|supplier, options, required, value}
  function fieldHtml(f) {
    const v = f.value == null ? "" : f.value; const req = f.required ? "required" : "";
    let input;
    if (f.type === "textarea") input = `<textarea name="${f.name}" rows="3" ${req}>${esc(v)}</textarea>`;
    else if (f.type === "select") input = `<select name="${f.name}" ${req}>${f.blank ? `<option value="">${esc(f.blank)}</option>` : ""}${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
    else if (f.type === "photo") input = `<input type="file" accept="image/*" capture="environment" data-photo="${f.name}"><input type="hidden" name="${f.name}" value=""><div class="photo-prev" id="prev-${f.name}"></div>`;
    else if (f.type === "photos") input = `<input type="file" accept="image/*" multiple data-photos="${f.name}"><input type="hidden" name="${f.name}" value="[]"><div class="gallery" id="prev-${f.name}"></div><small>Tap again to add more photos. Each photo is made smaller before saving.</small>`;
    else if (f.type === "evidence") input = `<div class="evidence" data-evidence="${f.name}"><input type="hidden" name="${f.name}" value="[]"><div class="evbtns">
      <label class="btn">${svgI("camera")} Take photo<input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="btn">${svgI("doc")} Photo or PDF file<input type="file" accept="image/*,application/pdf" multiple hidden></label></div><div class="evlist gallery"></div></div>`;
    else if (f.type === "pdf") input = `<input type="file" accept="application/pdf" data-pdf="${f.name}" ${req}><input type="hidden" name="${f.name}" value=""><input type="hidden" name="${f.name}_name" value=""><small>PDF, up to ${Store.mode === "supabase" ? "20" : "1.5"} MB${Store.mode === "supabase" ? "" : " in the browser demo"}</small>`;
    else input = `<input type="${f.type || "text"}" name="${f.name}" value="${esc(v)}" ${f.type === "number" ? 'step="any" min="0"' : ""} ${req}>`;
    return `<label class="field"><span>${esc(f.label)}${f.required ? " *" : ""}</span>${input}${f.help ? `<small>${esc(f.help)}</small>` : ""}</label>`;
  }

  function formModal(title, fields, onSubmit, submitLabel, opts) {
    opts = opts || {};
    const body = `<form id="mform">${fields.map(fieldHtml).join("")}${opts.extraHtml || ""}<div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">${esc(submitLabel || "Save")}</button></div></form>`;
    openModal(title, body, (m) => {
      if (opts.onReady) opts.onReady(m);
      m.querySelectorAll("[data-evidence]").forEach((wrap) => {
        const name = wrap.dataset.evidence, hid = m.querySelector(`input[name="${name}"]`), prev = wrap.querySelector(".evlist"), list = [];
        const paint = () => { hid.value = JSON.stringify(list); prev.innerHTML = list.map((x, i) => `<span class="ph ${x.type === "pdf" ? "pdf" : ""}">${x.type === "pdf" ? `<i>PDF</i><small>${esc(x.name)}</small>` : `<img src="${x.data}" alt="Evidence ${i + 1}">`}<button type="button" class="rm" data-rm="${i}" aria-label="Remove file">×</button></span>`).join(""); };
        prev.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { e.preventDefault(); list.splice(Number(b.dataset.rm), 1); paint(); } });
        wrap.querySelectorAll("input[type=file]").forEach((inp) => inp.addEventListener("change", async () => {
          for (const f of inp.files) {
            try {
              if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) list.push({ type: "pdf", name: f.name, data: await readPdf(f) });
              else list.push({ type: "image", name: f.name || "photo.jpg", data: await compressImage(f) });
            } catch (e) { toast(e.message || "Could not read that file", true); }
          }
          inp.value = ""; paint();
        }));
      });
      m.querySelectorAll("[data-photo]").forEach((inp) => inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        try { const data = await compressImage(f); m.querySelector(`input[name="${inp.dataset.photo}"]`).value = data; $("#prev-" + inp.dataset.photo, m).innerHTML = `<img src="${data}" alt="Photo preview">`; } catch (e) { toast("Could not read that photo", true); }
      }));
      m.querySelectorAll("[data-photos]").forEach((inp) => {
        const hid = m.querySelector(`input[name="${inp.dataset.photos}"]`), prev = $("#prev-" + inp.dataset.photos, m), list = [];
        const paint = () => { hid.value = JSON.stringify(list); prev.innerHTML = list.map((p, i) => `<span class="ph"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="rm" data-rm="${i}" aria-label="Remove photo">×</button></span>`).join(""); };
        prev.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { e.preventDefault(); list.splice(Number(b.dataset.rm), 1); paint(); } });
        inp.addEventListener("change", async () => { for (const f of inp.files) { try { list.push(await compressImage(f)); } catch (e) { toast("Could not read a photo", true); } } inp.value = ""; paint(); });
      });
      m.querySelectorAll("[data-pdf]").forEach((inp) => inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        try { m.querySelector(`input[name="${inp.dataset.pdf}"]`).value = await readPdf(f); m.querySelector(`input[name="${inp.dataset.pdf}_name"]`).value = f.name; } catch (e) { inp.value = ""; toast(e.message, true); }
      }));
      const form = $("#mform", m);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const vals = Object.fromEntries(new FormData(form).entries());
        for (const f of fields) {
          if (f.type === "number" && vals[f.name] !== "" && vals[f.name] != null) vals[f.name] = Number(vals[f.name]);
          if (f.type === "photos") { try { vals[f.name] = JSON.parse(vals[f.name] || "[]"); } catch (x) { vals[f.name] = []; } }
          if (f.type === "evidence") { try { vals[f.name] = JSON.parse(vals[f.name] || "[]"); } catch (x) { vals[f.name] = []; } if (f.required && !vals[f.name].length) { toast(f.requiredMsg || "Attach at least one photo, image or PDF.", true); return; } }
          if (f.type === "pdf") { delete vals[f.name + "_name"]; vals.file_name = form.querySelector(`input[name="${f.name}_name"]`).value; if (f.required && !vals[f.name]) { toast("Choose the PDF file.", true); return; } }
        }
        const b = form.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Saving…";
        try { const ok = await onSubmit(vals); if (ok !== false) { closeModal(); render(); } } catch (err) { toast(err.message || String(err), true); }
        b.disabled = false; b.textContent = submitLabel || "Save";
      });
    });
  }

  const staffOptions = (list) => (list || staffNow()).map((s) => [s.id, s.name + " · " + s.title]);
  const projectOptions = (u) => myProjects(u).map((p) => [p.id, p.code + " " + p.name]);

  function detail(title, rows, actionsHtml, extraHtml) {
    openModal(title, `<dl class="dl">${rows.filter((r) => r && r[1] !== undefined).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === "" || v == null ? "—" : v}</dd>`).join("")}</dl>${extraHtml || ""}${actionsHtml ? `<div class="form-actions">${actionsHtml}</div>` : ""}`);
  }

  // Ask for a note (and optional extra fields) before an action
  function confirmAction(title, fields, run, label) { formModal(title, fields, async (v) => { await run(v); toast("Saved"); }, label || "Confirm"); }

  // ================= screens =================
  const SCREENS = {};
  // Menu in groups. Each person sees only the items (and groups) their role allows.
  const NAV = [
    ["dashboard", "Dashboard", "dashboard", ""],
    ["home", "My work", null, "My work"], ["schedule", "Schedule", "schedule", "My work"], ["requests", "Requests", "requests", "My work"], ["daily", "Daily report", "daily", "My work"],
    ["projects", "Projects", "projects", "Projects"], ["svr", "Site visits", "svr", "Projects"], ["docs", "Documents", "docs", "Projects"], ["qaqc", "QA/QC", "qaqc", "Projects"], ["safety", "Safety", "safety", "Projects"],
    ["vo", "Variations", "vo", "Projects"], ["handover", "Handover", "handover", "Projects"],
    ["cost", "Cost & Claims", "cost", "Money & materials"], ["subs", "Subcontractors", "subs", "Money & materials"], ["procurement", "Procurement", "procurement", "Money & materials"],
    ["stock", "Stock", "stock", "Money & materials"], ["finance", "Finance", "finance", "Money & materials"],
    ["people", "People", "people", "Company"], ["admin", "Settings", "admin", "Company"]
  ];
  const navVisible = (u, mod) => mod === null || (mod === "admin" ? isAdminPage(u) : mod === "svr" ? svrAccess(u) : can(u, mod, "view") || level(u, mod) === "own");

  // ---------- HOME ----------
  SCREENS.home = (u) => {
    const todo = [];
    const appr = myApprovals(u);
    appr.forEach((r) => todo.push({ kind: "Approval", text: `${r.ref_no} ${r.title}`, sub: `${r.type}${r.amount ? " · " + money(r.amount) : ""} · ${staffName(r.requester_id)}`, go: () => openRequest(r) }));
    if (can(u, "daily", "approve") || hasTag(u, "SITEMGR"))
      db.daily_reports.filter((d) => d.kind !== "Design" && d.status === "Submitted" && inScope(u, d.project_id) && (hasTag(u, "SITEMGR") || isPMof(u, d.project_id)))
        .forEach((d) => todo.push({ kind: "Review report", text: `${projLabel(d.project_id)} ${(d.session || "End of day").toLowerCase()} report · ${reportPhotos(d).length} photos`, sub: fmtDate(d.report_date) + " · " + staffName(d.author_id), go: () => openDaily(d) }));
    if (isDesigner(u) && hasTag(u, "HEAD")) db.daily_reports.filter((d) => d.kind === "Design" && d.status === "Submitted").forEach((d) => todo.push({ kind: "Review work", text: staffName(d.author_id) + " daily work", sub: fmtDate(d.report_date) + " · " + sum(d.entries || [], (e) => e.hours) + " hours", go: () => openDaily(d) }));
    db.purchase_orders.filter((p) => p.status === "Ordered" && groupsOf(u).includes("SITE") && inScope(u, p.project_id))
      .forEach((p) => todo.push({ kind: "Confirm delivery", text: `${p.po_no} ${p.description}`, sub: supplierName(p.supplier_id), go: () => openPO(p) }));
    db.documents.filter((d) => d.status === "In review" && canReviewDoc(u)).forEach((d) => todo.push({ kind: "Review document", text: `${d.doc_no} rev ${d.revision} ${d.title}`, sub: projLabel(d.project_id), go: () => openDoc(d) }));
    db.claims.filter((c) => claimActionsFor(u, c).length).forEach((c) => todo.push({ kind: "IPC claim", text: `${projLabel(c.project_id)} IPC ${c.ipc_no}`, sub: c.status + " · " + money(c.claimed), go: () => openClaim(c) }));
    if (can(u, "finance", "admin")) db.invoices.filter((i) => i.status === "Unpaid" && i.direction === "Payable").forEach((i) => todo.push({ kind: "Pay", text: `${i.inv_no} ${i.party}`, sub: money(i.amount) + " · due " + fmtDate(i.due_date), go: () => openInvoice(i) }));
    db.tasks.filter((t) => t.assignee_id === u.id && t.status !== "Done").forEach((t) => todo.push({ kind: "Task", text: t.title, sub: projLabel(t.project_id) + " · due " + fmtDate(t.due_date), go: () => openTask(t) }));
    // variations, subcontractor payments, warranties and insurance waiting for this person
    const mineP = (pid) => hasTag(u, "MD") || isQS(u) || isSysAdmin(u) || can(u, "finance", "admin") || (byId("projects", pid) || {}).pm_id === u.id;
    db.variations.filter((v) => inScope(u, v.project_id) && (mineP(v.project_id) || v.raised_by === u.id) && !["In claim", "Client rejected", "Cancelled"].includes(v.status)).forEach((v) => { const a = voActions(u, v).filter((x) => !["Cancelled", "Raised"].includes(x[1]) || x[0] === "Price it"); if (a.length) todo.push({ kind: "Variation", text: v.vo_no + " " + v.title, sub: v.status + (v.amount ? " · " + money(v.amount) : "") + " · next: " + a[a.length - 1][0], go: () => openVO(v) }); });
    db.sub_payments.filter((x) => x.status !== "Paid").forEach((x) => { const k = byId("sub_contracts", x.contract_id); if (!k || !inScope(u, k.project_id) || !mineP(k.project_id)) return; const a = payActions(u, x, k); if (a.length) todo.push({ kind: "Sub payment", text: ((byId("subcontractors", k.sub_id) || {}).name || "") + " " + x.pc_no, sub: projLabel(k.project_id) + " · " + money(x.status === "Claimed" ? x.claimed : x.certified - x.retention_amt) + " · " + a[a.length - 1][0], go: () => openPayment(x) }); });
    if (canManageProject(u) || hasTag(u, "MD")) db.warranties.filter((w) => inScope(u, w.project_id) && wDays(w) >= 0 && wDays(w) <= 60 && (hasTag(u, "MD") || isPMof(u, w.project_id))).forEach((w) => todo.push({ kind: "Warranty", text: w.item + " ends in " + wDays(w) + " days", sub: projLabel(w.project_id) + " · " + (w.supplier || ""), go: () => warrantyForm(u, w.project_id, w) }));
    if (can(u, "subs", "approve") && (hasTag(u, "MD") || hasTag(u, "PROC") || isQS(u))) db.subcontractors.filter((sc) => sc.status === "Active" && insDays(sc) != null && insDays(sc) <= 30).forEach((sc) => todo.push({ kind: "Insurance", text: sc.name + (insDays(sc) < 0 ? " insurance expired" : " insurance ends in " + insDays(sc) + " days"), sub: sc.trade, go: () => openSub(sc) }));
    if (svrAccess(u)) db.site_visits.filter((v) => ["Lead", "Quoted"].includes(v.status)).forEach((v) => (v.actions || []).filter((a) => a.who === u.id && !a.done).forEach((a) => todo.push({ kind: "Site visit", text: a.action, sub: v.svr_no + " · " + v.client + (a.by ? " · by " + fmtDate(a.by) : ""), go: () => openSvr(v) })));
    db.defects.filter((f) => f.assigned_to === u.id && f.status === "Open").forEach((f) => todo.push({ kind: "Defect", text: f.description, sub: projLabel(f.project_id) + " · " + f.location, go: () => openDefect(f) }));

    const quick = [];
    quick.push(btn("New request", () => newRequest(u), "primary"));
    if (isSiteEng(u)) quick.push(btn("Site daily report", () => newSiteDaily(u)));
    if (isDesigner(u)) quick.push(btn("My daily work", () => newDesignDaily(u)));
    if (can(u, "stock", "view") || level(u, "stock") === "edit") quick.push(btn("Check stock", () => go("stock")));
    if (canRaiseQA(u)) quick.push(btn("Report a defect", () => newDefect(u)));
    if (can(u, "safety", "edit")) quick.push(btn("Safety record", () => newSafety(u)));
    if (can(u, "dashboard", "view")) quick.push(btn("Open dashboard", () => go("dashboard")));

    const mine = db.requests.filter((r) => r.requester_id === u.id).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6);
    const dueSess = new Date().getHours() < 12 ? "Morning" : "End of day";
    const missing = isSiteEng(u) ? db.project_members.filter((m) => m.staff_id === u.id && !db.daily_reports.some((d) => d.kind !== "Design" && d.author_id === u.id && d.project_id === m.project_id && d.report_date === today() && (d.session || "End of day") === dueSess)).map((m) => byId("projects", m.project_id)).filter(Boolean) : [];
    const designMissing = isDesigner(u) && !hasTag(u, "HEAD") && !db.daily_reports.some((d) => d.kind === "Design" && d.author_id === u.id && d.report_date === today());

    return `<h1>Welcome in, ${esc(u.name.split(" ").slice(-1)[0])}</h1>
      <p class="muted">${esc(u.title)} · ${groupsOf(u).map((g) => GROUPS[g]).join(" + ")}${isSysAdmin(u) ? " · System administrator" : hasTag(u, "BACKUPADMIN") ? " · Backup administrator" : ""}</p>
      ${annBanners(u)}
      <div class="quick">${quick.join("")}</div>
      ${missing.length ? `<div class="alert">You haven't sent today's ${dueSess.toLowerCase()} report for ${missing.map((p) => esc(p.code)).join(", ")}. ${btn("Send now", () => newSiteDaily(u), "small")}</div>` : ""}
      ${designMissing ? `<div class="alert">You haven't sent today's daily work report. ${btn("Send now", () => newDesignDaily(u), "small")}</div>` : ""}
      <div class="grid2">
        <section class="card"><h2>Waiting for you <span class="count">${todo.length}</span></h2>
          ${todo.length ? `<ul class="todo">${todo.map((t) => `<li data-act="${act(t.go)}"><span class="kind">${esc(t.kind)}</span><b>${esc(t.text)}</b><small>${esc(t.sub)}</small></li>`).join("")}</ul>` : empty("You're all caught up.")}
        </section>
        <section class="card"><h2>My requests</h2>
          ${mine.length ? `<ul class="todo">${mine.map((r) => `<li data-act="${act(() => openRequest(r))}"><span class="kind">${badge(r.status)}</span><b>${esc(r.ref_no + " " + r.title)}</b><small>${r.status === "Pending" ? "Waiting for " + esc(waitingOn(r)) : esc(r.type)}</small></li>`).join("")}</ul>` : empty("No requests yet.")}
        </section>
      </div>${todayScheduleCard(u, "sch-home")}`;
  };

  // ---------- REQUESTS ----------
  const TYPE_INFO = {
    Material: "Site materials. Checks stock first; only what is missing is ordered.", Purchase: "Tools, equipment or office items to buy.",
    Payment: "Pay a subcontractor or supplier.", "Petty cash": "Small cash for site consumables.", Leave: "Annual or personal leave.", Overtime: "Overtime work approval."
  };
  function newRequest(u, preset) {
    if (preset && preset.type === "Material") return materialRequest(u, preset);
    if (preset && preset.type) return genericRequest(u, preset.type);
    openModal("New request", `<p class="muted">What do you need?</p><div class="typegrid">${REQUEST_TYPES.map((t) => `<button class="typebtn" data-act="${act(() => newRequest(u, { type: t }))}"><b>${esc(t)}</b><small>${esc(TYPE_INFO[t])}</small></button>`).join("")}</div>`);
  }
  function genericRequest(u, type) {
    const projects = projectOptions(u), money_ = MONEY_TYPES.includes(type), leave = type === "Leave";
    formModal(type + " request", [
      { name: "project_id", label: "Project", type: "select", options: projects, blank: "No project (office)", value: state.project || (projects[0] || [])[0] },
      { name: "title", label: type === "Leave" ? "Reason" : "What is it for?", required: true },
      { name: "details", label: "Details", type: "textarea" },
      money_ ? { name: "amount", label: "Amount (USD)", type: "number", required: true, help: "USD " + APPROVAL_LIMIT + " or more also needs MD approval." } : null,
      leave ? { name: "leave_days", label: "Number of days", type: "number", required: true } : null,
      { name: "needed_by", label: leave ? "First day" : "Needed by", type: "date", value: today() }
    ].filter(Boolean), async (v) => {
      if (money_ && !(v.amount > 0)) throw new Error("Please enter the amount.");
      if (money_ && !v.project_id && type !== "Petty cash") throw new Error("Please choose the project for this request.");
      const steps = buildSteps(type, v.amount || 0);
      const r = await save("requests", Object.assign(v, { type, ref_no: nextNo("requests", "ref_no", "REQ-"), requester_id: u.id, status: "Pending", step_index: 0, steps,
        amount: v.amount || 0, leave_days: v.leave_days || 0, items: [], history: [{ at: nowIso(), by: u.id, action: "Submitted", note: "" }] }), "New " + type + " request");
      toast(r.ref_no + " sent to " + waitingOn(r));
    }, "Submit");
  }

  // Stock available for a project = its site store(s) + the main store
  const projectStores = (pid) => db.stores.filter((s) => s.project_id === pid);
  const mainStores = () => db.stores.filter((s) => !s.project_id);
  function availableFor(itemId, pid) {
    const site = sum(projectStores(pid), (s) => stockQty(itemId, s.id)), main = sum(mainStores(), (s) => stockQty(itemId, s.id));
    return { site: Math.max(0, site), main: Math.max(0, main), total: Math.max(0, site) + Math.max(0, main) };
  }

  // Material request: pick items, the form checks stock line by line and splits "from stock" and "to order"
  function materialRequest(u, preset) {
    const projects = projectOptions(u);
    const lines = (preset && preset.lines) || [{ item_id: "", name: "", qty: "", cost: "" }];
    let pid = (preset && preset.project_id != null) ? preset.project_id : (state.project || (projects[0] || [])[0] || "");
    const itemOpts = `<option value="">Choose item…</option>${[...new Set(db.stock_items.map((i) => i.category))].map((c) => `<optgroup label="${esc(c)}">${db.stock_items.filter((i) => i.category === c).map((i) => `<option value="${i.id}">${esc(i.code + " " + i.name)}</option>`).join("")}</optgroup>`).join("")}<option value="__new">Other item (not in stock list)</option>`;
    const calc = () => lines.map((l) => {
      const it = byId("stock_items", l.item_id), q = Number(l.qty) || 0;
      const av = it && pid ? availableFor(it.id, pid) : { site: 0, main: 0, total: 0 };
      const from = it && pid ? Math.min(q, av.total) : 0;
      return Object.assign({}, l, { it, q, av, from, order: q - from, unit: it ? it.unit : "", unit_cost: it ? Number(it.unit_cost) : Number(l.cost) || 0 });
    });
    const body = () => {
      const c = calc(), orderAmt = sum(c, (x) => x.order * x.unit_cost), anyOrder = c.some((x) => x.order > 0), anyStock = c.some((x) => x.from > 0);
      return `<label class="field"><span>Project *</span><select id="mr-p">${projects.map(([v, l]) => `<option value="${v}" ${v === pid ? "selected" : ""}>${esc(l)}</option>`).join("")}<option value="" ${pid === "" ? "selected" : ""}>Restock main store (no project)</option></select></label>
        <div class="lines">${c.map((x, i) => `<div class="line"><div class="line-top"><select data-i="${i}" data-k="item_id" aria-label="Item">${itemOpts.replace(`value="${x.item_id}"`, `value="${x.item_id}" selected`)}</select>
            <input data-i="${i}" data-k="qty" type="number" min="0" step="any" placeholder="Qty" value="${esc(x.qty)}" aria-label="Quantity"><span class="unit">${esc(x.unit)}</span>
            ${lines.length > 1 ? `<button class="x" data-rm="${i}" aria-label="Remove line">×</button>` : ""}</div>
          ${x.item_id === "__new" ? `<div class="line-top"><input data-i="${i}" data-k="name" placeholder="Item description" value="${esc(x.name)}"><input data-i="${i}" data-k="cost" type="number" min="0" step="any" placeholder="Unit price USD" value="${esc(x.cost)}"></div>` : ""}
          ${x.it ? `<div class="avail">${pid ? `In stock: <b>${x.av.site}</b> at site store · <b>${x.av.main}</b> at main store` : "Restock: all ordered"} ${x.q ? `→ ${x.from ? `<span class="tag ok">${x.from} from stock</span>` : ""} ${x.order ? `<span class="tag order">${x.order} to order · ${money(x.order * x.unit_cost)}</span>` : ""}` : ""}</div>` : x.item_id === "__new" && x.q ? `<div class="avail"><span class="tag order">${x.q} to order · ${money(x.q * x.unit_cost)}</span></div>` : ""}
        </div>`).join("")}</div>
        <button class="btn small" id="mr-add">+ Add item</button>
        <label class="field" style="margin-top:12px"><span>Needed by</span><input id="mr-d" type="date" value="${esc((preset && preset.needed_by) || today())}"></label>
        <label class="field"><span>Note</span><textarea id="mr-n" rows="2">${esc((preset && preset.note) || "")}</textarea></label>
        <div class="summary">${anyStock ? `<div><span class="tag ok">From stock</span> ${sum(c, (x) => x.from)} units released by the store after PM approval</div>` : ""}
          ${anyOrder ? `<div><span class="tag order">To order</span> ${money(orderAmt)} · route: PM → QS${orderAmt >= APPROVAL_LIMIT ? " → MD" : ""} → Procurement</div>` : ""}
          ${!anyOrder && anyStock ? "<div>Nothing to buy: route is PM → Store.</div>" : ""}</div>
        <div class="form-actions"><button class="btn" data-act="${act(modalBack)}">Cancel</button><button class="btn primary" id="mr-go">Submit request</button></div>`;
    };
    const paint = () => {
      const m = $("#modal .modal-body"); m.innerHTML = body();
      $("#mr-p", m).onchange = (e) => { pid = e.target.value; paint(); };
      m.querySelectorAll("[data-k]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "change", () => { lines[el.dataset.i][el.dataset.k] = el.value; paint(); }));
      m.querySelectorAll("[data-rm]").forEach((el) => el.onclick = () => { lines.splice(Number(el.dataset.rm), 1); paint(); });
      $("#mr-add", m).onclick = () => { lines.push({ item_id: "", name: "", qty: "", cost: "" }); paint(); };
      $("#mr-go", m).onclick = async (e) => {
        const c = calc().filter((x) => x.item_id && x.q > 0);
        if (!c.length) return toast("Add at least one item with a quantity.", true);
        if (c.some((x) => x.item_id === "__new" && !x.name)) return toast("Describe the item that is not in the stock list.", true);
        const items = c.map((x) => ({ item_id: x.it ? x.it.id : "", name: x.it ? x.it.name : x.name, unit: x.unit || "pc", qty: x.q, from_stock: x.from, to_order: x.order, unit_cost: x.unit_cost }));
        const amount = Math.round(sum(items, (x) => x.to_order * x.unit_cost) * 100) / 100;
        const title = items.map((x) => x.name + " x" + x.qty).join(", ").slice(0, 90);
        e.target.disabled = true;
        try {
          const r = await save("requests", { type: "Material", project_id: pid, title, details: $("#mr-n").value, amount, leave_days: 0, needed_by: $("#mr-d").value, items,
            ref_no: nextNo("requests", "ref_no", "REQ-"), requester_id: u.id, status: "Pending", step_index: 0, steps: buildSteps("Material", amount, { order: items.some((x) => x.to_order > 0) }),
            history: [{ at: nowIso(), by: u.id, action: "Submitted", note: "" }] }, "New material request");
          closeModal(); render(); toast(r.ref_no + " sent to " + waitingOn(r));
        } catch (err) { toast(err.message, true); e.target.disabled = false; }
      };
    };
    openModal("Material request", "", paint);
  }

  function linesTable(items, withStock) {
    if (!items || !items.length) return "";
    return `<h4>Items</h4><div class="scroll"><table class="mini-t"><thead><tr><th>Item</th><th class="n">Qty</th>${withStock ? '<th class="n">From stock</th><th class="n">To order</th>' : ""}<th class="n">Est. cost</th></tr></thead><tbody>
      ${items.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${esc(x.qty)} ${esc(x.unit)}</td>${withStock ? `<td class="n">${x.from_stock || "–"}</td><td class="n">${x.to_order || "–"}</td>` : ""}<td class="n">${money((withStock ? x.to_order : x.qty) * x.unit_cost)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // Release the "from stock" lines: site store first, then the main store
  async function releaseStock(req, u) {
    const out = [];
    for (const x of (req.items || []).filter((l) => l.item_id && l.from_stock > 0)) {
      let need = Number(x.from_stock);
      const av = availableFor(x.item_id, req.project_id);
      if (av.total < need) throw new Error("Only " + av.total + " " + x.unit + " of " + x.name + " left in stock now. Reject and ask for a new request, or receive stock first.");
      for (const st of projectStores(req.project_id).concat(mainStores())) {
        const have = Math.max(0, stockQty(x.item_id, st.id)), take = Math.min(have, need);
        if (take > 0) {
          await save("stock_moves", { move_date: today(), item_id: x.item_id, store_id: st.id, to_store_id: "", qty: -take, move_type: "Issue", project_id: req.project_id, ref: req.ref_no, by_id: u.id, note: "Released for " + req.ref_no }, "Issued " + take + " " + x.unit + " " + x.name);
          out.push(take + " " + x.unit + " " + x.name + " from " + st.name); need -= take;
        }
        if (need <= 0) break;
      }
    }
    return out;
  }

  function stepsHtml(r) {
    return `<ol class="steps">${(r.steps || []).map((s, i) => {
      const done = i < r.step_index || r.status === "Approved"; const cur = i === r.step_index && r.status === "Pending";
      const rej = i === r.step_index && r.status === "Rejected";
      return `<li class="${done ? "done" : cur ? "cur" : rej ? "rej" : ""}"><b>${esc(s.label)}</b><small>${cur ? "Waiting for " + esc(waitingOn(r)) : rej ? "Rejected here" : done ? "Done" : ""}</small></li>`;
    }).join("")}</ol>`;
  }
  const historyHtml = (h) => `<h4>History</h4><ul class="hist">${(h || []).map((x) => `<li><b>${esc(x.action)}</b> · ${esc(staffName(x.by))} · ${fmtDate(x.at)}${String(x.at || "").length > 10 ? " " + rTime(x.at) : ""}${x.note ? `<br><small>${esc(x.note)}</small>` : ""}</li>`).join("")}</ul>`;

  function openRequest(r) {
    const u = me(); const acts = [];
    if (r.status === "Pending" && approversFor(r).includes(u.id)) {
      const step = r.steps[r.step_index];
      const fields = [{ name: "note", label: "Comment", type: "textarea" }];
      const orders = !(r.items || []).length || r.items.some((x) => x.to_order > 0);
      if (step.role === "PROC" && orders) {
        fields.unshift({ name: "amount", label: "PO amount (USD)", type: "number", value: r.amount, required: true });
        fields.unshift({ name: "supplier_id", label: "Supplier for the items to order", type: "select", options: db.suppliers.map((s) => [s.id, s.name]), required: true });
      }
      acts.push(btn("Reject", () => confirmAction("Reject " + r.ref_no, [{ name: "note", label: "Reason (required)", type: "textarea", required: true }], (v) => decide(r, false, v.note), "Reject"), "danger"));
      acts.push(btn(step.role === "PROC" ? ((r.items || []).length ? "Release stock and order" : "Issue PO") : step.role === "STORE" ? "Release stock" : step.role === "FIN" ? "Mark paid" : step.role === "HR" ? "Record" : "Approve",
        () => confirmAction(step.label + " · " + r.ref_no, fields, (v) => decide(r, true, v.note, v), "Confirm"), "primary"));
    }
    if (r.status === "Pending" && r.requester_id === u.id) acts.unshift(btn("Cancel request", async () => { await patch("requests", r.id, { status: "Cancelled", history: r.history.concat([{ at: nowIso(), by: u.id, action: "Cancelled", note: "" }]) }, r.ref_no + " cancelled"); closeModal(); render(); }));
    const po = db.purchase_orders.find((p) => p.request_id === r.id);
    detail(r.ref_no + " · " + r.title, [
      ["Status", badge(r.status)], ["Type", esc(r.type)], ["Project", esc(projLabel(r.project_id))], ["Requested by", esc(staffName(r.requester_id))],
      ["Amount", r.amount ? money(r.amount) : ""], ["Days", r.leave_days ? esc(r.leave_days) : ""], ["Needed by", fmtDate(r.needed_by)], ["Details", esc(r.details)],
      ["Purchase order", po ? `<a href="#" data-act="${act(() => openPO(po))}">${esc(po.po_no)} · ${badge(po.status)}</a>` : ""]
    ], acts.join(""), `${linesTable(r.items, true)}<h4>Approval route</h4>${stepsHtml(r)}${historyHtml(r.history)}`);
  }

  SCREENS.requests = (u) => {
    const lv = level(u, "requests");
    const hrView = hasTag(u, "HR") || groupsOf(u).includes("EXEC");
    const T = tabs("requests", [["mine", "My requests"], ["approve", "Waiting for my approval (" + myApprovals(u).length + ")"]].concat(LEVEL[lv] >= LEVEL.approve || hrView ? [["all", LEVEL[lv] >= LEVEL.approve ? "All requests" : "Leave and overtime"]] : []));
    let rows = T.cur === "mine" ? db.requests.filter((r) => r.requester_id === u.id) : T.cur === "approve" ? myApprovals(u)
      : db.requests.filter((r) => inScope(u, r.project_id) || lv === "admin" || (hrView && ["Leave", "Overtime"].includes(r.type)));
    rows = rows.filter(byProjectFilter).filter((r) => matchSearch(r, ["ref_no", "title", "type"])).sort((a, b) => String(b.ref_no).localeCompare(String(a.ref_no)));
    return `<h1>Requests & Approvals</h1><p class="muted">Material, purchase, payment, petty cash, leave and overtime. Requests of USD ${APPROVAL_LIMIT} or more per order also go to the MD.</p>
      ${T.html}${toolbar(u, { buttons: btn("New request", () => newRequest(u), "primary") })}
      ${table([
        { label: "Ref", get: (r) => esc(r.ref_no) }, { label: "Request", get: (r) => `<b>${esc(r.title)}</b>` }, { label: "Type", get: (r) => esc(r.type) },
        { label: "Project", get: (r) => esc(projLabel(r.project_id)) }, { label: "Amount", get: (r) => (r.amount ? money(r.amount) : "") },
        { label: "Status", get: (r) => badge(r.status) }, { label: "Waiting for", get: (r) => (r.status === "Pending" ? esc(waitingOn(r)) + ` <small class="age">${Math.floor(daysSince((r.history || [])[r.history.length - 1]?.at || r.created_at))}d</small>` : "") }
      ], rows, openRequest)}`;
  };

  // ---------- PROJECTS & TASKS ----------
  // Team of a project by group (Site, QS, Design)
  const teamOf = (pid, g) => db.project_members.filter((m) => m.project_id === pid && groupsOf(byId("staff", m.staff_id) || { groups: "" }).includes(g));
  function manageTeam(p) {
    const cur = new Set(db.project_members.filter((m) => m.project_id === p.id).map((m) => m.staff_id));
    const box = (g, label) => `<fieldset class="pickset"><legend>${label}</legend><div class="pickgrid">${inGroup(g).map((s) => `<label class="pick"><input type="checkbox" name="mem" value="${s.id}" ${cur.has(s.id) ? "checked" : ""}>${avatar(s, "av sm")}<span><b>${esc(s.name)}</b><small>${esc(s.title)}</small></span></label>`).join("")}</div></fieldset>`;
    openModal("Team · " + p.code, `<form id="tform"><label class="field"><span>Project Manager *</span><select name="pm_id" required>${inGroup("PM").map((s) => `<option value="${s.id}" ${s.id === p.pm_id ? "selected" : ""}>${esc(s.name)} · ${esc(s.title)}</option>`).join("")}</select></label>
      ${box("SITE", "Site team")}${box("QS", "QS team")}${box("DESIGN", "Design team")}${box("ENG", "Technical & Engineering team (optional)")}
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">Save team</button></div></form>`, (m) => {
      m.querySelector("#tform").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target), want = new Set(f.getAll("mem")), pmId = f.get("pm_id");
        try {
          if (pmId && pmId !== p.pm_id) await patch("projects", p.id, { pm_id: pmId }, p.code + " Project Manager: " + staffName(pmId));
          for (const id of want) if (!cur.has(id)) await save("project_members", { project_id: p.id, staff_id: id, role: (byId("staff", id) || {}).title }, "Assigned " + staffName(id) + " to " + p.code);
          for (const mm of db.project_members.filter((x) => x.project_id === p.id && !want.has(x.staff_id))) { await Store.remove("project_members", mm.id); await log("Removed", "project_members", mm.id, staffName(mm.staff_id) + " removed from " + p.code); }
          closeModal(); render(); toast("Team saved for " + p.code);
        } catch (err) { toast(err.message, true); }
      });
    });
  }
  // ---------- project progress by scope ----------
  // A project has one or more scopes. Each scope has a share of the project (%) and its own progress (%).
  // Project progress = sum of (share × progress) ÷ total share. Example: Structure 40% share at 50% done
  // and Architecture 60% share at 20% done → 40×50% + 60×20% = 20 + 12 = 32% for the project.
  const SCOPES = ["Structure", "Architecture", "Landscape", "Electrical", "Plumbing", "MVAC", "HVAC", "ELV"];
  // Usual shares of a full-scope building project; used as the starting point, the PM or QS can change them
  const SCOPE_SHARE = { Structure: 30, Architecture: 30, Landscape: 5, Electrical: 12, Plumbing: 6, MVAC: 4, HVAC: 8, ELV: 5 };
  const SCOPE_INFO = { MVAC: "Mechanical ventilation and air conditioning", HVAC: "Heating, ventilation and air conditioning", ELV: "Extra-low voltage: CCTV, data, access, fire alarm" };
  function defaultShares(list) {
    const tot = list.reduce((a, k) => a + (SCOPE_SHARE[k] || 10), 0); let left = 100;
    return list.map((k, i) => { const w = i === list.length - 1 ? left : Math.round((SCOPE_SHARE[k] || 10) * 100 / tot); left -= w; return { scope: k, weight: w, progress: 0 }; });
  }
  const scopesOf = (p) => Array.isArray(p.scopes) ? p.scopes : [];
  function overallProgress(list) { const tw = list.reduce((a, x) => a + (Number(x.weight) || 0), 0); return tw ? Math.round(list.reduce((a, x) => a + (Number(x.weight) || 0) * (Number(x.progress) || 0), 0) / tw) : 0; }
  // Who may update progress: the boss, Project Managers, the project's site engineers and the QS team
  function canUpdateProgress(u, p) {
    if (canManageProject(u, p.id) || isSysAdmin(u)) return true;
    const g = groupsOf(u), mine = db.project_members.some((m) => m.project_id === p.id && m.staff_id === u.id);
    if (g.includes("SITE")) return mine || hasTag(u, "SITEMGR");
    if (g.includes("QS")) return mine || !teamOf(p.id, "QS").length;
    return false;
  }
  // Only the boss, PMs and QS change the scopes and their shares; site engineers enter progress only
  const canSetShares = (u, pid) => canManageProject(u, pid) || isSysAdmin(u) || groupsOf(u).includes("QS");
  const HOW_CALC = "How it is calculated: each scope's share of the project × its progress, added together. Example: Structure 40% share at 50% done + Architecture 60% share at 20% done = 20% + 12% = 32% for the project. Shares must add up to 100%.";
  function scopePicker(sel) {
    sel = sel || [];
    return `<fieldset class="pickset scopepick"><legend>Project scope *</legend><label class="pick full"><input type="checkbox" class="sc-full" ${sel.length === SCOPES.length ? "checked" : ""}><span><b>Full scope</b><small>All scopes below</small></span></label>
      <div class="pickgrid">${SCOPES.map((k) => `<label class="pick"><input type="checkbox" name="scope" value="${k}" ${sel.includes(k) ? "checked" : ""}><span><b>${k}</b>${SCOPE_INFO[k] ? `<small>${esc(SCOPE_INFO[k])}</small>` : ""}</span></label>`).join("")}</div></fieldset>`;
  }
  function wireScopePicker(m) {
    const full = m.querySelector(".sc-full"), boxes = [...m.querySelectorAll('input[name="scope"]')];
    if (!full) return;
    full.addEventListener("change", () => boxes.forEach((b) => { b.checked = full.checked; }));
    boxes.forEach((b) => b.addEventListener("change", () => { full.checked = boxes.every((x) => x.checked); }));
  }
  const pickedScopes = (m) => [...m.querySelectorAll('input[name="scope"]:checked')].map((b) => b.value);
  function scopeTable(p) {
    const list = scopesOf(p);
    if (!list.length) return '<p class="muted small">No scopes set yet. Tap Update progress to choose the scopes.</p>';
    return `<table class="scopet"><thead><tr><th>Scope</th><th class="r">Share</th><th>Progress</th></tr></thead><tbody>${list.map((x) => `<tr><td><b>${esc(x.scope)}</b>${x.by ? `<small>${esc(staffName(x.by))} · ${esc(fmtDate(x.at))}</small>` : ""}</td><td class="r">${esc(x.weight)}%</td><td>${bar(x.progress)} <span class="pc">${esc(x.progress)}%</span></td></tr>`).join("")}</tbody>
      <tfoot><tr><td><b>Project</b></td><td class="r">${list.reduce((a, x) => a + (Number(x.weight) || 0), 0)}%</td><td>${bar(overallProgress(list))} <b class="pc">${overallProgress(list)}%</b></td></tr></tfoot></table><p class="muted small howcalc">${esc(HOW_CALC)}</p>`;
  }
  function updateProgress(p) {
    const u = me(), shares = canSetShares(u, p.id), mgr = canManageProject(u, p.id);
    let list = scopesOf(p).map((x) => Object.assign({}, x));
    const rowsHtml = () => list.map((x, i) => `<tr data-i="${i}"><td><b>${esc(x.scope)}</b>${SCOPE_INFO[x.scope] ? `<small>${esc(SCOPE_INFO[x.scope])}</small>` : ""}</td>
        <td><input class="num sc-w" type="number" min="0" max="100" step="1" inputmode="numeric" value="${esc(x.weight)}" ${shares ? "" : "readonly"} aria-label="Share of project % for ${esc(x.scope)}"></td>
        <td><input class="num sc-p" type="number" min="0" max="100" step="1" inputmode="numeric" value="${esc(x.progress)}" aria-label="Progress % for ${esc(x.scope)}"></td></tr>`).join("");
    const body = () => `<form id="pform">${shares ? `<details class="scdet"${list.length ? "" : " open"}><summary>Scopes in this project (${list.length})</summary>${scopePicker(list.map((x) => x.scope))}<button type="button" class="btn small sc-apply">Apply scopes</button></details>` : ""}
      ${list.length ? `<table class="scopet edit"><thead><tr><th>Scope</th><th>Share of project %</th><th>Progress %</th></tr></thead><tbody>${rowsHtml()}</tbody>
      <tfoot><tr><td><b>Project progress</b></td><td><span class="sc-tw"></span></td><td><b class="sc-total"></b></td></tr></tfoot></table>
      ${shares ? '<button type="button" class="btn small sc-even">Use usual shares</button>' : '<p class="muted small">Shares are set by the PM or QS.</p>'}
      <p class="muted small howcalc">${esc(HOW_CALC)}</p>` : '<p class="muted">Choose the scopes of this project first.</p>'}
      ${mgr ? `<label class="field"><span>Status</span><select name="status">${["Active", "On hold", "Completed"].map((x) => `<option ${x === p.status ? "selected" : ""}>${x}</option>`).join("")}</select></label>` : ""}
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary" ${list.length ? "" : "disabled"}>Save progress</button></div></form>`;
    const wire = (m) => {
      const f = m.querySelector("#pform");
      const read = () => f.querySelectorAll("tbody tr[data-i]").forEach((tr) => { const x = list[tr.dataset.i]; x.weight = Math.max(0, Math.min(100, Math.round(Number(tr.querySelector(".sc-w").value) || 0))); x.progress = Math.max(0, Math.min(100, Math.round(Number(tr.querySelector(".sc-p").value) || 0))); });
      const calc = () => { read(); const tw = list.reduce((a, x) => a + x.weight, 0); const tEl = f.querySelector(".sc-tw"), oEl = f.querySelector(".sc-total");
        if (tEl) { tEl.textContent = tw + "%"; tEl.className = "sc-tw " + (tw === 100 ? "ok" : "bad"); } if (oEl) oEl.textContent = overallProgress(list) + "%"; };
      const redraw = () => { const b = m.querySelector(".modal-body"); b.innerHTML = body(); wire(m); if (typeof translateNow === "function") translateNow(m); };
      wireScopePicker(m);
      f.addEventListener("input", calc); calc();
      const ap = f.querySelector(".sc-apply"); if (ap) ap.addEventListener("click", () => { read(); const pick = pickedScopes(f); if (!pick.length) { toast("Choose at least one scope.", true); return; }
        const fresh = defaultShares(pick); list = fresh.map((x) => Object.assign(x, (list.find((o) => o.scope === x.scope) || {}), { weight: x.weight })); redraw(); });
      const ev = f.querySelector(".sc-even"); if (ev) ev.addEventListener("click", () => { read(); const d = defaultShares(list.map((x) => x.scope)); list.forEach((x, i) => { x.weight = d[i].weight; }); redraw(); });
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); read();
        const tw = list.reduce((a, x) => a + x.weight, 0);
        if (tw !== 100) { toast("The shares must add up to 100% (now " + tw + "%).", true); return; }
        const old = scopesOf(p), now = nowIso();
        const out = list.map((x) => { const o = old.find((y) => y.scope === x.scope) || {}; const changed = o.progress !== x.progress || o.weight !== x.weight; return { scope: x.scope, weight: x.weight, progress: x.progress, by: changed ? u.id : (o.by || u.id), at: changed ? now : (o.at || now) }; });
        const v = { scopes: out, progress: overallProgress(out) }; const st = f.querySelector('select[name="status"]'); if (st) v.status = st.value;
        const b = f.querySelector("button[type=submit]"); b.disabled = true;
        try { await patch("projects", p.id, v, p.code + " progress " + v.progress + "% (" + out.map((x) => x.scope + " " + x.progress + "%").join(", ") + ")"); closeModal(); render(); toast("Progress saved: " + v.progress + "%"); }
        catch (err) { b.disabled = false; toast(err.message, true); }
      });
    };
    openModal("Progress · " + p.code, body(), wire);
  }

  // Opening a project goes to its own page with tabs
  function openProject(p) { if (p) go("projects/" + encodeURIComponent(p.id)); }
  function openProjectModal(p) {
    const u = me();
    const canEdit = canManageProject(u, p.id);
    const acts = (canUpdateProgress(u, p) ? btn("Update progress", () => updateProgress(p), canEdit ? "" : "primary") : "")
      + (canEdit ? btn("Manage team", () => manageTeam(p), "primary") + btn("Site location", () => editSiteLocation(p)) : btn("Org chart", () => openProjectOrg(p)));
    const li = (m) => `<li>${esc(staffName(m.staff_id))} · <small>${esc(m.role)}</small></li>`;
    const last = db.daily_reports.filter((d) => d.kind !== "Design" && d.project_id === p.id).sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)))[0];
    const teamHtml = `<h4>Progress by scope</h4>${scopeTable(p)}<h4 class="ochead"><span>Project org chart</span>${btn("Full view and PDF", () => openProjectOrg(p))}</h4>${orgChartHtml(projectOrgData(p))}`
      + (last ? `<h4>Latest site report · ${fmtDate(last.report_date)} · ${esc(staffName(last.author_id))}</h4><p>${esc(last.work_done)}</p>${gallery(reportPhotos(last))}` : "");
    detail(p.code + " · " + p.name, [["Client", esc(p.client)], ["Location", esc(p.location)], ["Site pin", hasSitePin(p) ? `<a href="https://maps.google.com/?q=${p.lat},${p.lng}" target="_blank" rel="noopener">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</a> · reports must be within ${SITE_RADIUS} m` : '<span class="tag order">Not set</span>'],
      ["Project Manager", esc(staffName(p.pm_id))], ["Status", badge(p.status)],
      ["Dates", fmtDate(p.start_date) + " to " + fmtDate(p.end_date)], ["Progress", bar(p.progress) + " " + esc(p.progress) + "%"],
      can(u, "cost", "view") ? ["Contract value", money(p.contract_value)] : null], acts, teamHtml);
    const pm = $("#modal .modal"); if (pm) pm.classList.add("wide");
  }

  // ---------- site location (GPS) ----------
  const SITE_RADIUS = 200; // metres: a site report must be sent within this distance of the site pin
  const hasSitePin = (p) => p && isFinite(parseFloat(p.lat)) && isFinite(parseFloat(p.lng)) && !(Number(p.lat) === 0 && Number(p.lng) === 0);
  function distanceM(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }
  const fmtDist = (m) => m == null || m === "" ? "" : Number(m) >= 1000 ? (Number(m) / 1000).toFixed(1) + " km" : Math.round(Number(m)) + " m";
  // Reads the phone's GPS. Resolves {lat,lng,acc} or {error}
  function getPosition() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res({ error: "This browser cannot share its location." });
      navigator.geolocation.getCurrentPosition((pos) => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) }),
        (err) => res({ error: err.code === 1 ? "Location permission was refused. Allow location for this site in the browser settings." : err.code === 3 ? "The phone took too long to find its location. Go outside or near a window and try again." : "The phone could not find its location." }),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  // Accepts "11.5564, 104.9282" or a Google Maps link
  function parseLatLng(text) {
    const t = String(text || "");
    const m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)[, ]+(-?\d+\.\d+)/) || t.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{2,3}\.\d{3,})/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  }
  function locationField(p) {
    const v = hasSitePin(p) ? Number(p.lat).toFixed(6) + ", " + Number(p.lng).toFixed(6) : "";
    return `<label class="field"><span>Site location (GPS pin) *</span><div class="locrow"><input name="site_loc" id="site_loc" required placeholder="11.556400, 104.928200 or a Google Maps link" value="${v}">
      <button type="button" class="btn" id="here">${svgI("map")} Use my location</button></div><small class="help">Stand on site and tap <b>Use my location</b>, or paste the pin from Google Maps. Site reports must be sent within ${SITE_RADIUS} m of this pin.</small><small class="help" id="locmsg"></small></label>`;
  }
  function wireLocation(m) {
    const b = m.querySelector("#here"); if (!b) return;
    b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Finding location…"; const msg = m.querySelector("#locmsg");
      const g = await getPosition(); b.disabled = false; b.innerHTML = svgI("map") + " Use my location";
      if (g.error) { msg.textContent = g.error; msg.className = "help bad"; return; }
      m.querySelector("#site_loc").value = g.lat.toFixed(6) + ", " + g.lng.toFixed(6);
      msg.textContent = "Location found, accurate to about " + g.acc + " m."; msg.className = "help good";
    });
  }
  function editSiteLocation(p) {
    openModal("Site location · " + p.code, `<form id="lform">${locationField(p)}<div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button class="btn primary" type="submit">Save location</button></div></form>`, (m) => {
      wireLocation(m);
      m.querySelector("#lform").addEventListener("submit", async (e) => {
        e.preventDefault(); const ll = parseLatLng(m.querySelector("#site_loc").value);
        if (!ll) return toast("Enter the location as 11.556400, 104.928200 or paste a Google Maps link.", true);
        await patch("projects", p.id, ll, p.code + " site location set"); closeModal(); render(); toast("Site location saved for " + p.code);
      });
    });
  }
  function newProject(u) {
    formModal("New project", [
      { name: "code", label: "Code", required: true, value: "DEMO-1" + String(db.projects.length + 1).padStart(2, "0") }, { name: "name", label: "Name", required: true },
      { name: "client", label: "Client" }, { name: "location", label: "City / province", value: "Phnom Penh" },
      { name: "pm_id", label: "Project Manager", type: "select", options: staffOptions(inGroup("PM")), required: true },
      { name: "start_date", label: "Start", type: "date", value: today() }, { name: "end_date", label: "Finish", type: "date" },
      { name: "contract_value", label: "Contract value (USD)", type: "number" }, { name: "budget", label: "Cost budget (USD)", type: "number" }
    ], async (v) => {
      const pick = pickedScopes(document.getElementById("mform")); if (!pick.length) throw new Error("Choose the project scope: Full scope, or one or more scopes.");
      const ll = parseLatLng(v.site_loc); if (!ll) throw new Error("Set the site location: tap Use my location on site, or paste the pin from Google Maps.");
      delete v.site_loc; delete v.scope;
      await save("projects", Object.assign(v, ll, { status: "Active", progress: 0, scopes: defaultShares(pick) }), "New project " + v.code);
    }, "Create project", { extraHtml: scopePicker([]) + '<p class="muted small">Each scope gets a usual share of the project to start with. The PM or QS can change the shares in Update progress.</p>' + locationField({}), onReady: (m) => { wireLocation(m); wireScopePicker(m); } });
  }

  // people who work on a project: its team plus the PM (everyone if the project has no team yet)
  function projectPeople(pid) {
    const p = byId("projects", pid), ids = db.project_members.filter((m) => m.project_id === pid).map((m) => m.staff_id);
    if (p && p.pm_id) ids.push(p.pm_id);
    const list = staffNow().filter((s) => ids.includes(s.id));
    return list.length ? list : staffNow();
  }
  function wireTeamSelect(m, field) {
    const ps = m.querySelector('select[name="project_id"]'), as = m.querySelector(`select[name="${field}"]`);
    if (!ps || !as) return;
    const fill = () => { const cur = as.value, team = projectPeople(ps.value);
      as.innerHTML = '<option value="">—</option>' + team.map((x) => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.name + " · " + x.title)}</option>`).join("");
      if (!as.value && team.length) as.value = team[0].id;
      if (typeof translateNow === "function") translateNow(as); };
    ps.addEventListener("change", fill); fill();
  }
  function taskForm(u, t) {
    const isNew = !t; t = t || {};
    formModal(isNew ? "New task" : "Edit task", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: t.project_id || state.project },
      { name: "title", label: "Task", required: true, value: t.title || "" },
      { name: "assignee_id", label: "Assign to", type: "select", options: staffOptions(projectPeople(t.project_id || state.project)), value: t.assignee_id || u.id, required: true },
      { name: "due_date", label: "Due", type: "date", value: t.due_date || today() }, { name: "priority", label: "Priority", type: "select", options: ["Normal", "High"], value: t.priority || "Normal" }
    ], async (v) => {
      if (!projectPeople(v.project_id).some((x) => x.id === v.assignee_id)) throw new Error("Choose someone on this project's team.");
      if (isNew) await save("tasks", Object.assign(v, { status: "To do", created_by: u.id }), "New task: " + v.title);
      else await patch("tasks", t.id, v, "Task changed: " + v.title);
    }, isNew ? "Save" : "Save changes", { onReady: (m) => wireTeamSelect(m, "assignee_id") });
  }
  function openTask(t) {
    const u = me(); const acts = [];
    const mineOrPM = t.assignee_id === u.id || isPMof(u, t.project_id) || isSysAdmin(u);
    const canEdit = t.created_by === u.id || isPMof(u, t.project_id) || isSysAdmin(u) || hasTag(u, "HEAD");
    if (mineOrPM && t.status === "To do") acts.push(btn("Start", async () => { await patch("tasks", t.id, { status: "In progress" }, "Task started: " + t.title); closeModal(); render(); }, "primary"));
    if (mineOrPM && t.status !== "Done") acts.push(btn("Mark done", async () => { await patch("tasks", t.id, { status: "Done" }, "Task done: " + t.title); closeModal(); render(); }, "primary"));
    if (canEdit && t.status === "Done") acts.push(btn("Reopen", async () => { await patch("tasks", t.id, { status: "To do" }, "Task reopened: " + t.title); closeModal(); render(); }));
    if (canEdit) acts.push(btn("Edit", () => taskForm(u, t)));
    detail(t.title, [["Project", esc(projLabel(t.project_id))], ["Assigned to", esc(staffName(t.assignee_id))], ["Due", fmtDate(t.due_date)], ["Priority", esc(t.priority)], ["Status", badge(t.status)], t.created_by ? ["Created by", esc(staffName(t.created_by))] : null].filter(Boolean), acts.join(""));
  }

  function newTask(u) { taskForm(u); }

  SCREENS.projects = (u) => {
    if (state.pid) { const pp = byId("projects", state.pid); if (pp && inScope(u, pp.id)) return projectPage(u, pp); }
    const T = tabs("projects", [["projects", "Projects"], ["tasks", "Tasks"]]);
    if (T.cur === "projects") {
      const rows = myProjects(u).filter((p) => matchSearch(p, ["code", "name", "client"]));
      return `<h1>Projects & Tasks</h1>${T.html}${toolbar(u, { project: false, buttons: canManageProject(u) ? btn("New project", () => newProject(u), "primary") : "" })}
        ${table([{ label: "Code", get: (p) => esc(p.code) }, { label: "Project", get: (p) => `<b>${esc(p.name)}</b><br><small>${esc(p.client)}</small>` },
          { label: "PM", get: (p) => esc(staffName(p.pm_id)) }, { label: "Progress", get: (p) => bar(p.progress) + `<small>${esc(p.progress)}%</small>` },
          { label: "Finish", get: (p) => fmtDate(p.end_date) }, { label: "Status", get: (p) => badge(p.status) }], rows, openProject)}`;
    }
    const lv = level(u, "projects");
    let rows = db.tasks.filter((t) => inScope(u, t.project_id)).filter(byProjectFilter).filter((t) => matchSearch(t, ["title"]));
    if (!state.showAll && !(lv === "admin" || lv === "view")) rows = rows.filter((t) => t.assignee_id === u.id);
    rows.sort((a, b) => (a.status === "Done") - (b.status === "Done") || String(a.due_date).localeCompare(String(b.due_date)));
    const toggle = !(lv === "admin" || lv === "view") ? `<label class="chk"><input type="checkbox" data-change="showAll" ${state.showAll ? "checked" : ""}> Show the whole team</label>` : "";
    return `<h1>Projects & Tasks</h1>${T.html}${toolbar(u, { extra: toggle, buttons: can(u, "projects", "edit") ? btn("New task", () => newTask(u), "primary") : "" })}
      ${table([{ label: "Task", get: (t) => `<b>${esc(t.title)}</b>` }, { label: "Project", get: (t) => esc(projLabel(t.project_id)) }, { label: "Assigned to", get: (t) => esc(staffName(t.assignee_id)) },
        { label: "Due", get: (t) => fmtDate(t.due_date) + (t.status !== "Done" && t.due_date < today() ? ' <span class="late">late</span>' : "") }, { label: "Priority", get: (t) => esc(t.priority) }, { label: "Status", get: (t) => badge(t.status) }], rows, openTask)}`;
  };

  // ---------- DAILY REPORTS (site engineers and designers) ----------
  const isDesigner = (u) => groupsOf(u).includes("DESIGN");
  const isSiteEng = (u) => groupsOf(u).includes("SITE") && !hasTag(u, "SITEMGR");
  // Who is expected to report today: each site engineer for each project they are on, and each designer (not the senior architects)
  function siteExpected(u) {
    return db.project_members.filter((m) => { const s = byId("staff", m.staff_id); return s && isSiteEng(s) && inScope(u, m.project_id); })
      .map((m) => { const rs = db.daily_reports.filter((d) => d.kind !== "Design" && d.author_id === m.staff_id && d.project_id === m.project_id && d.report_date === today());
        return { m, rs, done: rs.find((d) => d.session === "End of day") || rs[0] }; });
  }
  function designExpected() {
    return inGroup("DESIGN").filter((s) => !hasTag(s, "HEAD")).map((s) => ({ s, done: db.daily_reports.find((d) => d.kind === "Design" && d.author_id === s.id && d.report_date === today()) }));
  }
  function newDaily(u) { if (isDesigner(u)) return newDesignDaily(u); return newSiteDaily(u); }
  // ----- Site reports: Morning, End of day (5 PM) and Overtime -----
  const SESSIONS = ["Morning", "End of day", "Overtime"];
  const defaultSession = () => { const h = new Date().getHours(); return h < 12 ? "Morning" : h < 18 ? "End of day" : "Overtime"; };
  const TRADES = ["GID site staff", "Drywall and ceiling (sub.)", "Electrical (sub.)", "Plumbing (sub.)", "HVAC (sub.)", "Fire alarm (sub.)", "ELV (sub.)", "Painting (sub.)", "Civil (sub.)", "General labour"];
  const nowHM = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  // Morning reports sent at or after this time (Phnom Penh time) are counted as late
  const LATE_AT = "09:00";
  function lateInfo(iso, session) {
    if (session !== "Morning") return { late: false, late_minutes: 0 };
    const t = timeOf(iso), [h, m] = t.split(":").map(Number), [lh, lm] = LATE_AT.split(":").map(Number);
    const mins = h * 60 + m - (lh * 60 + lm);
    return { late: mins >= 0, late_minutes: mins >= 0 ? mins : 0 };
  }
  // Decide the location status of a report from the GPS reading and the project's site pin
  function locCheck(pos, p) {
    if (!hasSitePin(p)) return { loc_status: "No site pin", distance_m: null };
    if (!pos || pos.error) return { loc_status: "No location", distance_m: null };
    const d = distanceM(pos, { lat: Number(p.lat), lng: Number(p.lng) });
    const slack = Math.min(Number(pos.acc) || 0, 100); // allow for GPS accuracy, up to 100 m
    return { loc_status: d - slack <= SITE_RADIUS ? "On site" : "Away from site", distance_m: d };
  }
  function locChip(r) {
    if (!r || !r.loc_status) return "";
    const cls = r.loc_status === "On site" ? "ok" : r.loc_status === "No site pin" ? "muted-tag" : "bad";
    return `<span class="tag ${cls}" title="${esc(r.loc_note || "")}">${svgI("map")}${esc(r.loc_status)}${r.distance_m != null && r.distance_m !== "" ? " · " + fmtDist(r.distance_m) : ""}</span>`;
  }
  const lateChip = (r) => r && r.late ? `<span class="tag bad">${svgI("clock")}Late ${esc(timeOf(r.submitted_at))}${r.late_minutes ? " · " + r.late_minutes + " min" : ""}</span>` : "";
  const sentChip = (r) => r && r.submitted_at ? `<span class="tag">${svgI("clock")}Sent ${esc(timeOf(r.submitted_at))}</span>` : "";
  function newSiteDaily(u, preset) {
    const projects = projectOptions(u);
    if (!projects.length) { toast("You are not assigned to a project yet. Ask your PM.", true); return; }
    const f = Object.assign({ project_id: state.project || projects[0][0], report_date: today(), session: defaultSession(), weather: "Sunny", manpower: "", work_done: "", issues: "", plan: "", safety_note: "",
      ot_start: "17:30", ot_end: "", trades: [{ trade: "GID site staff", workers: "" }], photos: [], captions: [], times: [], loc_note: "" }, preset || {});
    f.report_date = today(); // a site report is always for today: the date cannot be changed
    let pos = null, locBusy = true;
    const findPos = async () => { locBusy = true; repaintLoc(); pos = await getPosition(); locBusy = false; repaintLoc(); };
    const locNow = () => locCheck(pos, byId("projects", f.project_id));
    const locBanner = () => {
      if (locBusy) return `<div class="locbar wait">${svgI("map")}<span><b>Checking your location…</b><small>Allow location when the phone asks. Reports must be sent within ${SITE_RADIUS} m of the site.</small></span></div>`;
      const c = locNow();
      if (c.loc_status === "On site") return `<div class="locbar ok">${svgI("map")}<span><b>On site · ${fmtDist(c.distance_m)} from the site pin</b><small>Location accurate to about ${pos.acc} m</small></span></div>`;
      if (c.loc_status === "No site pin") return `<div class="locbar muted">${svgI("map")}<span><b>This project has no site pin yet</b><small>The PM sets it in Projects → Site location. Your location is still recorded.</small></span></div>`;
      const msg = c.loc_status === "Away from site" ? `You are ${fmtDist(c.distance_m)} from the site pin (limit ${SITE_RADIUS} m).` : (pos && pos.error) || "Location not available.";
      return `<div class="locbar bad">${svgI("map")}<span><b>${c.loc_status === "Away from site" ? "Away from site" : "Location not found"}</b><small>${esc(msg)} You can still send, but you must give a reason and the PM will be told.</small></span><button type="button" class="btn small" id="sd-relock">Try again</button></div>
        <label class="field"><span>Reason *</span><input data-f="loc_note" value="${esc(f.loc_note)}" placeholder="Example: writing the report at the office after the site visit"></label>`;
    };
    const repaintLoc = () => { const el = $("#sd-loc"); if (el) { el.innerHTML = locBanner(); wireLoc(); } };
    const wireLoc = () => { const r = $("#sd-relock"); if (r) r.onclick = findPos; const n = $('#sd-loc [data-f="loc_note"]'); if (n) n.addEventListener("input", () => { f.loc_note = n.value; }); };
    const val = (k) => esc(f[k] == null ? "" : f[k]);
    const sess = () => f.session;
    const body = () => {
      const s = sess(), tradeTotal = sum(f.trades, (t) => Number(t.workers) || 0);
      const workLabel = s === "Morning" ? "Workers arrived" : s === "Overtime" ? "Workers on overtime" : "Workers on site";
      return `<div class="sessions" role="group" aria-label="Session">${SESSIONS.map((x) => `<button type="button" class="${x === s ? "on" : ""}" data-sess="${x}"><b>${x}</b><small>${x === "Morning" ? "start of work" : x === "End of day" ? "5 PM report" : "after overtime"}</small></button>`).join("")}</div>
        <div class="row2"><label class="field"><span>Project *</span><select data-f="project_id">${projects.map(([v, l]) => `<option value="${v}" ${v === f.project_id ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          <label class="field"><span>Date</span><input type="date" value="${val("report_date")}" readonly title="Site reports are always for today"><small>Today. The send time is recorded by the system.</small></label></div>
        <div id="sd-loc">${locBanner()}</div>
        ${s === "Overtime" ? `<div class="row2"><label class="field"><span>Overtime start *</span><input type="time" data-f="ot_start" value="${val("ot_start")}"></label><label class="field"><span>Overtime end *</span><input type="time" data-f="ot_end" value="${val("ot_end")}"></label></div>` : ""}
        <label class="field"><span>Weather</span><select data-f="weather">${["Sunny", "Cloudy", "Rain (morning)", "Rain (afternoon)", "Rain (all day)"].map((w) => `<option ${w === f.weather ? "selected" : ""}>${w}</option>`).join("")}</select></label>
        <div class="field"><span>Workers by trade</span><div class="trades">${f.trades.map((t, i) => `<div class="trade"><input list="trade-list" placeholder="Trade or company" data-t="${i}" data-tk="trade" value="${esc(t.trade)}"><input type="number" min="0" placeholder="0" data-t="${i}" data-tk="workers" value="${esc(t.workers)}"><button type="button" class="x" data-trm="${i}" aria-label="Remove">×</button></div>`).join("")}</div>
          <datalist id="trade-list">${TRADES.map((t) => `<option value="${esc(t)}">`).join("")}</datalist><button type="button" class="btn small" id="sd-addt">+ Add trade</button></div>
        <label class="field"><span>${workLabel} *</span><input type="number" min="0" data-f="manpower" value="${f.manpower !== "" ? val("manpower") : tradeTotal || ""}" placeholder="${tradeTotal || ""}"><small id="sd-tt">${tradeTotal ? "Total from trades: " + tradeTotal : "Fills in from the trades above, or type the total."}</small></label>
        ${s === "Morning" ? `<label class="field"><span>Plan for today *</span><textarea rows="3" data-f="plan">${val("plan")}</textarea></label>
          <label class="field"><span>Safety briefing</span><textarea rows="2" data-f="safety_note" placeholder="Toolbox talk topic and attendance">${val("safety_note")}</textarea></label>
          <label class="field"><span>Notes</span><textarea rows="2" data-f="work_done">${val("work_done")}</textarea></label>`
        : `<label class="field"><span>Work done ${s === "Overtime" ? "during overtime" : "today"} *</span><textarea rows="4" data-f="work_done" placeholder="One line per item">${val("work_done")}</textarea></label>
          <label class="field"><span>${s === "Overtime" ? "Reason for overtime *" : "Site issues and delays"}</span><textarea rows="2" data-f="${s === "Overtime" ? "plan" : "issues"}">${val(s === "Overtime" ? "plan" : "issues")}</textarea></label>
          ${s === "End of day" ? `<label class="field"><span>Plan for tomorrow</span><textarea rows="2" data-f="plan">${val("plan")}</textarea></label>` : ""}`}
        <div class="field"><span>Photos ${s === "Morning" ? "(optional)" : "*"}</span><input type="file" accept="image/*" multiple id="sd-ph">
          <div class="capgrid">${f.photos.map((p, i) => `<div class="cap"><span class="ph"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="rm" data-prm="${i}" aria-label="Remove photo">×</button></span><input data-cap="${i}" placeholder="Caption for photo ${i + 1}" value="${esc(f.captions[i] || "")}"></div>`).join("")}</div>
          <small>Add as many photos as you need, then write a short caption under each one. Captions go into the PDF report.</small></div>
        ${offlineNow() ? '<div class="offline"><span class="sigdot"></span><span><b>No internet on site</b>You can still fill in and save this report. It will send by itself when the signal comes back. The time and place are recorded now.</span></div>' : ""}
        <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="button" class="btn" id="sd-copy">Copy last report</button><button type="button" class="btn primary" id="sd-go">${offlineNow() ? "Save · send when online" : "Send " + s.toLowerCase() + " report"}</button></div>`;
    };
    const paint = () => {
      const m = $("#modal .modal-body"); m.innerHTML = body();
      m.querySelectorAll("[data-sess]").forEach((b) => b.onclick = () => { f.session = b.dataset.sess; paint(); });
      m.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("input", () => { f[el.dataset.f] = el.value; if (el.dataset.f === "project_id") repaintLoc(); }));
      m.querySelectorAll('select[data-f="project_id"]').forEach((el) => el.addEventListener("change", () => { f.project_id = el.value; repaintLoc(); }));
      wireLoc();
      m.querySelectorAll("[data-t]").forEach((el) => el.addEventListener("input", () => { f.trades[el.dataset.t][el.dataset.tk] = el.value; const t = sum(f.trades, (x) => Number(x.workers) || 0); if (f.manpower === "") { const w = m.querySelector('[data-f="manpower"]'); w.placeholder = t || ""; w.value = t || ""; } $("#sd-tt", m).textContent = t ? "Total from trades: " + t : ""; }));
      m.querySelectorAll("[data-trm]").forEach((b) => b.onclick = () => { f.trades.splice(Number(b.dataset.trm), 1); paint(); });
      $("#sd-addt", m).onclick = () => { f.trades.push({ trade: "", workers: "" }); paint(); };
      m.querySelectorAll("[data-cap]").forEach((el) => el.addEventListener("input", () => { f.captions[el.dataset.cap] = el.value; }));
      m.querySelectorAll("[data-prm]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.prm); f.photos.splice(i, 1); f.captions.splice(i, 1); f.times.splice(i, 1); paint(); });
      $("#sd-ph", m).onchange = async (e) => { for (const file of e.target.files) { try { f.photos.push(await compressImage(file)); f.captions.push(""); f.times.push(nowHM()); } catch (x) { toast("Could not read a photo", true); } } paint(); };
      $("#sd-copy", m).onclick = () => {
        const last = db.daily_reports.filter((d) => d.kind !== "Design" && d.author_id === u.id && d.project_id === f.project_id).sort((a, b) => String(b.submitted_at || b.report_date).localeCompare(String(a.submitted_at || a.report_date)));
        const exact = last.find((d) => (d.session || "End of day") === f.session), same = exact || last[0];
        if (!same) { toast("No earlier report on this project to copy.", true); return; }
        f.weather = same.weather || f.weather; f.trades = (same.trades || []).map((t) => ({ trade: t.trade, workers: String(t.workers) })); if (!f.trades.length) f.trades = [{ trade: "", workers: "" }];
        f.manpower = same.manpower != null ? String(same.manpower) : "";
        // only copy the written parts from a report of the same kind (morning plan must not become an overtime reason)
        if (exact) { f.plan = exact.plan || ""; f.safety_note = exact.safety_note || ""; f.work_done = f.session === "Morning" ? "" : (exact.work_done || ""); }
        paint(); toast("Copied from " + fmtDate(same.report_date) + ". Check and change what is different today.");
      };
      $("#sd-go", m).onclick = async (e) => {
        const s = sess(), trades = f.trades.filter((t) => t.trade && Number(t.workers) > 0).map((t) => ({ trade: t.trade, workers: Number(t.workers) }));
        const workers = f.manpower !== "" ? Number(f.manpower) : sum(trades, (t) => t.workers);
        const need = (ok, msg) => { if (!ok) throw new Error(msg); };
        try {
          need(f.project_id && f.report_date, "Choose the project and date.");
          need(workers > 0 || s === "Overtime" && workers >= 0 && trades.length, "Enter the number of workers.");
          if (s === "Morning") need(f.plan.trim(), "Write the plan for today.");
          else { need(f.work_done.trim(), "Write the work done."); need(f.photos.length, "Add at least one photo."); }
          if (s === "Overtime") { need(f.ot_start && f.ot_end, "Enter the overtime start and end time."); need(f.plan.trim(), "Write the reason for overtime."); }
          need(!db.daily_reports.some((d) => d.kind !== "Design" && d.author_id === u.id && d.project_id === f.project_id && d.report_date === f.report_date && (d.session || "End of day") === s), "You already sent the " + s.toLowerCase() + " report for this project and date.");
          need(!locBusy, "Still checking your location. Wait a moment.");
          const lc = locNow();
          if (lc.loc_status === "Away from site" || lc.loc_status === "No location") need(String(f.loc_note || "").trim(), "Give the reason why the report is not sent from site.");
          e.target.disabled = true; e.target.textContent = "Sending…";
          const sentAt = nowIso(), li = lateInfo(sentAt, s);
          const caps = f.photos.map((_, i) => (f.captions[i] || "").trim() || (f.times[i] ? "Photo taken " + f.times[i] : ""));
          const base = { kind: "Site", session: s, project_id: f.project_id, report_date: f.report_date, author_id: u.id, weather: f.weather, manpower: workers, trades,
            work_done: f.work_done.trim(), issues: s === "End of day" ? f.issues.trim() : "", plan: f.plan.trim(), safety_note: f.safety_note.trim(), ot_start: s === "Overtime" ? f.ot_start : "", ot_end: s === "Overtime" ? f.ot_end : "",
            captions: caps, photo: "", entries: [], status: "Submitted", reviewed_by: "", submitted_at: sentAt,
            lat: pos && !pos.error ? pos.lat : null, lng: pos && !pos.error ? pos.lng : null, loc_acc: pos && !pos.error ? pos.acc : null, distance_m: lc.distance_m, loc_status: lc.loc_status,
            loc_note: lc.loc_status === "On site" ? "" : String(f.loc_note || "").trim(), late: li.late, late_minutes: li.late_minutes };
          const summ = projLabel(f.project_id) + " " + s.toLowerCase() + " report " + f.report_date + (li.late ? " · LATE, sent " + timeOf(sentAt) : "") + (lc.loc_status === "Away from site" ? " · away from site " + fmtDist(lc.distance_m) : "");
          const goOffline = () => { const r = queueOffline("daily_reports", base, f.photos.slice(), summ); const ob = outbox(); ob[ob.length - 1].label = s + " report " + projLabel(f.project_id); setOutbox(ob);
            try { localStorage.removeItem("gid-draft-" + u.id); } catch (x) { /* ignore */ }
            render(); closeAllModals(); toast("No internet. The report is saved on this phone and will send by itself.", false); };
          if (offlineNow()) { goOffline(); return; }
          let photos;
          try { photos = await storeFiles(f.photos, "site"); } catch (netE) { if (isNetErr(netE)) { goOffline(); return; } throw netE; }
          let rec;
          try { rec = await save("daily_reports", { kind: "Site", session: s, project_id: f.project_id, report_date: f.report_date, author_id: u.id, weather: f.weather, manpower: workers, trades,
            work_done: f.work_done.trim(), issues: s === "End of day" ? f.issues.trim() : "", plan: f.plan.trim(), safety_note: f.safety_note.trim(), ot_start: s === "Overtime" ? f.ot_start : "", ot_end: s === "Overtime" ? f.ot_end : "",
            photos, captions: f.photos.map((_, i) => (f.captions[i] || "").trim() || (f.times[i] ? "Photo taken " + f.times[i] : "")), photo: "", entries: [], status: "Submitted", reviewed_by: "", submitted_at: sentAt,
            lat: pos && !pos.error ? pos.lat : null, lng: pos && !pos.error ? pos.lng : null, loc_acc: pos && !pos.error ? pos.acc : null, distance_m: lc.distance_m, loc_status: lc.loc_status,
            loc_note: lc.loc_status === "On site" ? "" : String(f.loc_note || "").trim(),
            // With the shared database the server sets the send time and the late flag, so a wrong phone clock cannot change them
            late: Store.mode === "supabase" ? null : li.late, late_minutes: Store.mode === "supabase" ? -1 : li.late_minutes },
            (r) => projLabel(f.project_id) + " " + s.toLowerCase() + " report " + r.report_date + (r.late ? " · LATE, sent " + timeOf(r.submitted_at) : "") + (lc.loc_status === "Away from site" ? " · away from site " + fmtDist(lc.distance_m) : lc.loc_status === "No location" ? " · no location" : ""));
          } catch (netE) { if (isNetErr(netE)) { goOffline(); return; } throw netE; }
          try { localStorage.removeItem("gid-draft-" + u.id); } catch (x) { /* ignore */ }
          render(); dropModal(); // the sent form is finished: Report sent takes its place
          openModal("Report sent", `<div class="sent"><div class="tick">✓</div><p><b>${esc(projLabel(rec.project_id))} · ${esc(s)} report</b><br>${photos.length} photo${photos.length === 1 ? "" : "s"} · sent ${esc(timeOf(rec.submitted_at || sentAt))}</p>
            <p class="quick" style="justify-content:center">${locChip(rec)}${lateChip(rec)}</p>${rec.late ? `<p class="muted small">Morning reports are due before ${LATE_AT}. Your PM and the MD have been told.</p>` : ""}
            <p class="muted">Download the photo report as a PDF to share with the client or the office.</p>
            <div class="quick" style="justify-content:center">${btn("PDF in English", () => reportPdf(rec, "en"), "primary")}${btn("PDF ជាភាសាខ្មែរ", () => reportPdf(rec, "km"), "primary")}${btn("Close", closeAllModals)}</div></div>`);
        } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = "Send " + s.toLowerCase() + " report"; }
      };
    };
    openModal("Site daily report", "", paint);
    findPos();
  }

  // Designer daily work: hours and progress against their own drawings and tasks
  function newDesignDaily(u) {
    if (db.daily_reports.some((d) => d.kind === "Design" && d.author_id === u.id && d.report_date === today())) { toast("You already sent today's report.", true); return; }
    const docs = db.documents.filter((d) => d.owner_id === u.id && ["Draft", "In review", "Approved"].includes(d.status));
    const tasks = db.tasks.filter((t) => t.assignee_id === u.id && t.status !== "Done");
    const rows = docs.map((d) => ({ ref_type: "doc", ref_id: d.id, label: d.doc_no + " rev " + d.revision + " " + d.title, project_id: d.project_id, cur: Number(d.progress) || 0 }))
      .concat(tasks.map((t) => ({ ref_type: "task", ref_id: t.id, label: t.title, project_id: t.project_id, cur: t.status === "In progress" ? 50 : 0 })));
    const body = `<p class="muted">Enter the hours you worked on each item today and its new progress. Leave hours empty for items you did not touch.</p>
      <div class="entries">${rows.map((r, i) => `<div class="entry"><div><b>${esc(r.label)}</b><small>${esc(projLabel(r.project_id))} · ${r.ref_type === "doc" ? "Drawing" : "Task"} · now ${r.cur}%</small></div>
        <label><span>Hours</span><input type="number" min="0" max="16" step="0.5" data-h="${i}"></label><label><span>Progress %</span><input type="number" min="0" max="100" step="5" data-p="${i}" value="${r.cur}"></label></div>`).join("") || empty("No open drawings or tasks assigned to you.")}
        <div class="entry"><div><input id="dd-other" placeholder="Other work (meetings, site visit, office)"></div><label><span>Hours</span><input type="number" min="0" max="16" step="0.5" id="dd-oh"></label><span></span></div></div>
      <label class="field"><span>Notes / problems</span><textarea id="dd-note" rows="2"></textarea></label>
      <label class="field"><span>Screenshots or photos (optional)</span><input type="file" accept="image/*" multiple id="dd-ph"><div class="gallery" id="dd-prev"></div></label>
      <div class="form-actions"><button class="btn" data-act="${act(modalBack)}">Cancel</button><button class="btn primary" id="dd-go">Send report</button></div>`;
    openModal("My daily work · " + fmtDate(today()), body, (m) => {
      const shots = [];
      $("#dd-ph", m).addEventListener("change", async (e) => { for (const f of e.target.files) { try { shots.push(await compressImage(f)); } catch (x) { toast("Could not read a photo", true); } } $("#dd-prev", m).innerHTML = shots.map((s) => `<span class="ph"><img src="${s}" alt=""></span>`).join(""); });
      $("#dd-go", m).onclick = async (e) => {
        const entries = [];
        let bad = "";
        rows.forEach((r, i) => {
          const hv = $(`[data-h="${i}"]`, m).value, pv = $(`[data-p="${i}"]`, m).value;
          const h = Number(hv) || 0, p = pv === "" ? r.cur : Number(pv);
          if (h < 0 || h > 16) bad = "Hours must be between 0 and 16 for “" + r.label + "”.";
          else if (!(p >= 0 && p <= 100)) bad = "Progress must be between 0 and 100% for “" + r.label + "”.";
          if (h > 0 || p !== r.cur) entries.push({ ref_type: r.ref_type, ref_id: r.ref_id, label: r.label, project_id: r.project_id, hours: h, progress: p, note: "" }); });
        if (bad) return toast(bad, true);
        const oh = Number($("#dd-oh", m).value) || 0, ot = $("#dd-other", m).value.trim();
        if (oh < 0 || oh > 16) return toast("Hours must be between 0 and 16.", true);
        if (sum(entries, (x) => x.hours) + oh > 16) return toast("Total hours for one day cannot be more than 16.", true);
        if (ot || oh) entries.push({ ref_type: "other", ref_id: "", label: ot || "Other work", project_id: "", hours: oh, progress: 0, note: "" });
        if (!entries.length) return toast("Enter hours or progress for at least one item.", true);
        e.target.disabled = true;
        try {
          for (const x of entries) {
            if (x.ref_type === "doc") await patch("documents", x.ref_id, { progress: x.progress }, "Drawing progress " + x.progress + "%: " + x.label);
            if (x.ref_type === "task") { const t = byId("tasks", x.ref_id); const st = x.progress >= 100 ? "Done" : x.progress > 0 ? "In progress" : t.status; if (st !== t.status) await patch("tasks", t.id, { status: st }, "Task " + st.toLowerCase() + ": " + t.title); }
          }
          const photos = await storeFiles(shots, "design");
          await save("daily_reports", { kind: "Design", project_id: "", report_date: today(), author_id: u.id, weather: "", manpower: 0, work_done: $("#dd-note", m).value, issues: "", photo: "", photos, entries, status: "Submitted", reviewed_by: "" }, "Design daily report " + u.name);
          closeModal(); render(); toast("Daily work sent: " + sum(entries, (x) => x.hours) + " hours");
        } catch (err) { toast(err.message, true); e.target.disabled = false; }
      };
    });
  }

  const reportPhotos = (d) => (d.photos && d.photos.length ? d.photos : d.photo ? [d.photo] : []);
  function gallery(photos, cls, caps) {
    if (!photos.length) return "";
    if (caps) return `<div class="capgrid view">${photos.map((p, i) => `<figure><button class="ph" data-act="${act(() => lightbox(photos, i, caps))}" aria-label="Open photo ${i + 1}"><img src="${esc(p)}" alt="${esc(caps[i] || "Photo " + (i + 1))}" loading="lazy"></button><figcaption><b>${i + 1}</b> ${esc(caps[i] || "")}</figcaption></figure>`).join("")}</div>`;
    return `<div class="gallery ${cls || ""}">${photos.map((p, i) => `<button class="ph" data-act="${act(() => lightbox(photos, i))}" aria-label="Open photo ${i + 1}"><img src="${esc(p)}" alt="Photo ${i + 1}" loading="lazy"></button>`).join("")}</div>`;
  }
  function lightbox(photos, i, caps) {
    const old = $("#lightbox"); if (old) old.remove();
    const lb = document.createElement("div"); lb.id = "lightbox"; lb.className = "lightbox";
    const show = () => { lb.innerHTML = `<img src="${esc(photos[i])}" alt="Photo ${i + 1} of ${photos.length}"><div class="lb-bar"><button data-d="-1" aria-label="Previous">‹</button><span>${i + 1} / ${photos.length}${caps && caps[i] ? " · " + esc(caps[i]) : ""}</span><button data-d="1" aria-label="Next">›</button><button data-x aria-label="Close">×</button></div>`; };
    show();
    lb.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.d) { i = (i + Number(b.dataset.d) + photos.length) % photos.length; show(); } else if (!e.target.closest("img")) lb.remove(); });
    document.body.appendChild(lb);
  }
  function openDaily(d) {
    const u = me();
    const design = d.kind === "Design";
    const canReview = d.status === "Submitted" && (design ? (hasTag(u, "HEAD") && isDesigner(u)) || (d.entries || []).some((x) => x.project_id && isPMof(u, x.project_id)) : hasTag(u, "SITEMGR") || isPMof(u, d.project_id)) || (d.status === "Submitted" && isSysAdmin(u));
    const act_ = canReview ? btn("Mark reviewed", async () => { await patch("daily_reports", d.id, { status: "Reviewed", reviewed_by: u.id }, "Reviewed report of " + staffName(d.author_id)); closeModal(); render(); }, "primary") : "";
    if (design) {
      const en = d.entries || [];
      detail("Daily work · " + staffName(d.author_id) + " · " + fmtDate(d.report_date), [["Hours", `<b>${sum(en, (x) => x.hours)}</b>`], ["Notes", esc(d.work_done)], ["Status", badge(d.status) + (d.reviewed_by ? " by " + esc(staffName(d.reviewed_by)) : "")]], act_,
        `<h4>Work done</h4><div class="scroll"><table class="mini-t"><thead><tr><th>Item</th><th>Project</th><th class="n">Hours</th><th class="n">Progress</th></tr></thead><tbody>${en.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(projLabel(x.project_id))}</td><td class="n">${esc(x.hours)}</td><td class="n">${x.ref_type === "other" ? "" : esc(x.progress) + "%"}</td></tr>`).join("")}</tbody></table></div>${gallery(reportPhotos(d))}`);
    } else {
      const ss = d.session || "End of day", ph = reportPhotos(d);
      const pdfBtns = btn("PDF English", () => reportPdf(d, "en")) + btn("PDF ខ្មែរ", () => reportPdf(d, "km"));
      detail(projLabel(d.project_id) + " · " + ss + " · " + fmtDate(d.report_date), [["Session", `${badge(ss)} sent ${rTime(d.submitted_at || d.created_at)}${ss === "Overtime" ? " · overtime " + esc(d.ot_start) + "–" + esc(d.ot_end) : ""} ${lateChip(d)}`],
        ["Location check", (locChip(d) || '<span class="muted">Not recorded (report sent before the location check)</span>') + (d.loc_note ? `<br><small>Reason: ${esc(d.loc_note)}</small>` : "") + (d.lat ? ` <a class="small" href="https://maps.google.com/?q=${d.lat},${d.lng}" target="_blank" rel="noopener">open map</a>` : "")],
        ["By", esc(staffName(d.author_id))], ["Weather", esc(d.weather)], [ss === "Morning" ? "Workers arrived" : ss === "Overtime" ? "Workers on overtime" : "Workers on site", `<b>${esc(d.manpower)}</b>` + ((d.trades || []).length ? `<br><small>${d.trades.map((t) => esc(t.trade) + " " + esc(t.workers)).join(" · ")}</small>` : "")],
        ss === "Morning" ? ["Plan for today", `<span class="pre">${esc(d.plan)}</span>`] : ["Work done", `<span class="pre">${esc(d.work_done)}</span>`],
        ss === "Morning" && d.safety_note ? ["Safety briefing", esc(d.safety_note)] : null, ss === "Morning" && d.work_done ? ["Notes", `<span class="pre">${esc(d.work_done)}</span>`] : null,
        ss === "End of day" ? ["Issues", d.issues ? `<span class="late pre">${esc(d.issues)}</span>` : "None"] : null,
        ss === "End of day" ? ["Plan for tomorrow", `<span class="pre">${esc(d.plan)}</span>`] : null, ss === "Overtime" ? ["Reason", esc(d.plan)] : null,
        ["Status", badge(d.status) + (d.reviewed_by ? " by " + esc(staffName(d.reviewed_by)) : "")]], pdfBtns + act_,
        ph.length ? `<h4>Photos (${ph.length})</h4>${gallery(ph, "", (d.captions && d.captions.length) ? d.captions : ph.map((_, i) => "Photo " + (i + 1)))}` : "");
    }
  }
  const seesDesignReports = (u) => isDesigner(u) || can(u, "daily", "view");
  // "Who has reported today": one card that explains itself (green = sent, red = not sent yet)
  function todayStrip(title, list) {
    const done = list.filter((x) => x.done).length;
    return `<section class="card today-card"><div class="card-head"><h2>${esc(title)}: ${done} of ${list.length} sent</h2>
      <div class="klegend"><span><i class="kdot ok"></i>Sent</span><span><i class="kdot no"></i>Not sent yet</span><span><i class="kdot late"></i>Late morning report (after ${LATE_AT})</span></div></div>
      ${bar(list.length ? Math.round(done / list.length * 100) : 0)}
      <div class="who-list">${list.map((x) => `<span class="pill ${x.done ? (x.late ? "late" : "ok") : "no"}"><b>${x.done ? "✓ " : ""}${esc(x.label)}</b><small>${x.proj ? esc(x.proj) + " · " : ""}${esc(x.sub)}</small></span>`).join("") || '<span class="muted">No one is assigned yet.</span>'}</div></section>`;
  }
  SCREENS.daily = (u) => {
    const T = tabs("daily", [["site", "Site reports"]].concat(seesDesignReports(u) ? [["design", "Design reports"]] : []));
    const btns = (isSiteEng(u) ? btn("Site report", () => newSiteDaily(u), "primary") : "") + (isDesigner(u) ? btn("My daily work", () => newDesignDaily(u), "primary") : "");
    if (T.cur === "design") {
      const allDesign = (hasTag(u, "HEAD") && isDesigner(u)) || !isDesigner(u);
      const exp = designExpected();
      const rows = db.daily_reports.filter((d) => d.kind === "Design" && (allDesign || d.author_id === u.id)).filter((d) => matchSearch(Object.assign({ who: staffName(d.author_id) }, d), ["who", "work_done"]))
        .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
      return `<h1>Daily Reports</h1><p class="muted">Designers report the hours and progress on their own drawings and tasks every day.</p>${T.html}
        ${allDesign ? todayStrip("Designers' daily work today", exp.map((x) => ({ done: x.done, label: x.s.name, sub: x.done ? "sent" : "not sent yet" }))) : ""}
        ${toolbar(u, { project: false, buttons: btns })}
        ${table([{ label: "Date", get: (d) => fmtDate(d.report_date) }, { label: "Designer", get: (d) => `<b>${esc(staffName(d.author_id))}</b>` },
          { label: "Hours", get: (d) => esc(sum(d.entries || [], (x) => x.hours)) }, { label: "Worked on", get: (d) => esc((d.entries || []).map((x) => x.label.split(" ").slice(0, 4).join(" ")).join(" · ").slice(0, 90)) },
          { label: "Status", get: (d) => (d._pending ? '<span class="chip w">Waiting to send</span>' : badge(d.status)) + (reportPhotos(d).length ? " 📷" : "") }], rows, openDaily)}`;
    }
    const exp = siteExpected(u).filter((x) => !state.project || x.m.project_id === state.project);
    const rows = db.daily_reports.filter((d) => d.kind !== "Design" && inScope(u, d.project_id)).filter(byProjectFilter).filter((d) => matchSearch(d, ["work_done", "issues"]))
      .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)) || String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
    return `<h1>Daily Reports</h1><p class="muted">Site engineers report up to three times a day per project: Morning, End of day (5 PM) and Overtime. Each report can be downloaded as a PDF photo report in English or Khmer.</p>${T.html}
      ${todayStrip("Site reports today", exp.map((x) => ({ done: x.done, late: x.rs.some((r) => r.late), label: staffName(x.m.staff_id), proj: projLabel(x.m.project_id),
        sub: x.rs.length ? x.rs.map((r) => (r.session || "End of day") + (r.late ? " (late)" : "")).join(" + ") : "not sent yet" })))}
      ${toolbar(u, { buttons: btns })}
      ${table([{ label: "Date", get: (d) => fmtDate(d.report_date) + `<br><small>sent ${rTime(d.submitted_at || d.created_at)}</small>` + (d.late ? `<br>${lateChip(d)}` : "") }, { label: "Session", get: (d) => badge(d.session || "End of day") }, { label: "Project", get: (d) => esc(projLabel(d.project_id)) }, { label: "By", get: (d) => esc(staffName(d.author_id)) },
        { label: "Workers", get: (d) => esc(d.manpower) }, { label: "Work done", get: (d) => esc(String((d.session === "Morning" ? d.plan : d.work_done) || "").replace(/\n/g, " · ").slice(0, 80)) },
        { label: "Photos", get: (d) => { const ph = reportPhotos(d); return ph.length ? `<span class="thumbs">${ph.slice(0, 3).map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join("")}${ph.length > 3 ? `<b>+${ph.length - 3}</b>` : ""}</span>` : ""; } },
        { label: "Location", get: (d) => locChip(d) || '<span class="muted small">not recorded</span>' },
        { label: "Status", get: (d) => (d._pending ? '<span class="chip w">Waiting to send</span>' : badge(d.status)) + (d.issues ? ' <span class="late">issue</span>' : "") + (reportPhotos(d).length ? " 📷" : "") }], rows, openDaily)}`;
  };

  // ---------- DOCUMENT CONTROL ----------
  const canReviewDoc = (u) => hasTag(u, "HEAD") && groupsOf(u).includes("DESIGN") || groupsOf(u).includes("ENG") || isSysAdmin(u) || hasTag(u, "MD");
  const docAuthor = (d) => d.owner_id || ""; // v23 rules: the person who created this revision never approves it
  const canIssueDoc = (u) => hasTag(u, "DOC") || isSysAdmin(u);
  const siteOnly = (u) => !can(u, "docs", "edit") && groupsOf(u).some((g) => ["SITE"].includes(g));
  const canEditDoc = (u, d) => can(u, "docs", "edit") && inScope(u, d.project_id);

  function openDoc(d) {
    const u = me(); const acts = []; const go2 = async (status, summary, extra) => { await patch("documents", d.id, Object.assign({ status }, extra || {}), summary); closeModal(); render(); toast("Saved"); };
    const edit = canEditDoc(u, d);
    const sameNo = db.documents.filter((x) => x.project_id === d.project_id && x.doc_no === d.doc_no);
    const maxRev = Math.max.apply(null, sameNo.map((x) => Number(x.revision) || 0));
    if (edit && d.status === "Draft") {
      acts.push(btn(d.file_url ? "Replace PDF" : "Upload PDF", () => formModal("Upload PDF · " + d.doc_no + " rev " + d.revision, [{ name: "file", label: "Drawing PDF", type: "pdf", required: true }],
        async (v) => { const url = await storeFile(v.file, v.file_name || d.doc_no + ".pdf"); await patch("documents", d.id, { file_url: url, file_name: v.file_name }, "PDF uploaded for " + d.doc_no); toast("PDF uploaded"); })));
      acts.push(btn("Update progress", () => formModal("Progress · " + d.doc_no, [{ name: "progress", label: "Drawing progress (%)", type: "number", value: d.progress, required: true }],
        async (v) => { await patch("documents", d.id, { progress: Math.min(100, v.progress) }, d.doc_no + " progress " + v.progress + "%"); })));
    }
    if (d.status === "Draft" && edit) acts.push(btn("Send for review", () => { if (!d.file_url) return toast("Upload the PDF before sending for review.", true); go2("In review", d.doc_no + " sent for review", { progress: Math.max(80, Number(d.progress) || 0) }); }, "primary"));
    if (d.status === "In review" && canReviewDoc(u)) {
      acts.push(btn("Return with comments", () => confirmAction("Return " + d.doc_no, [{ name: "notes", label: "Comments", type: "textarea", required: true }], (v) => patch("documents", d.id, { status: "Draft", notes: v.notes }, d.doc_no + " returned"))));
      if (docAuthor(d) === u.id) acts.push(`<p class="muted small">${esc(RULE_MSG.ownDoc)}</p>`);
      else acts.push(btn("Approve", () => { const cur = byId("documents", d.id) || d; if (docAuthor(cur) === me().id) return toast(RULE_MSG.ownDoc, true); if (!canReviewDoc(me())) return toast(RULE_MSG.notYours, true); go2("Approved", d.doc_no + " approved", { progress: 100 }); }, "primary"));
    }
    if (d.status === "Approved" && canIssueDoc(u)) acts.push(btn("Issue to site", async () => {
      const newer = sameNo.find((x) => x.id !== d.id && x.status === "Issued" && Number(x.revision) > Number(d.revision));
      if (newer) return toast("Rev " + newer.revision + " of " + d.doc_no + " is already issued. An older revision cannot replace it.", true);
      for (const o of db.documents.filter((x) => x.project_id === d.project_id && x.doc_no === d.doc_no && x.id !== d.id && x.status === "Issued")) await patch("documents", o.id, { status: "Superseded" }, o.doc_no + " rev " + o.revision + " superseded");
      await go2("Issued", d.doc_no + " rev " + d.revision + " issued");
    }, "primary"));
    const openNewer = sameNo.some((x) => x.id !== d.id && Number(x.revision) > Number(d.revision) && x.status !== "Superseded");
    if (d.status === "Issued" && edit && Number(d.revision) === maxRev && !openNewer) acts.push(btn("Start new revision", () => formModal("New revision · " + d.doc_no + " rev " + (Number(d.revision) + 1), [{ name: "file", label: "Revised drawing PDF (can add later)", type: "pdf" }, { name: "notes", label: "What changed", type: "textarea" }],
      async (v) => {
        const url = v.file ? await storeFile(v.file, v.file_name || d.doc_no + ".pdf") : "";
        await save("documents", { project_id: d.project_id, doc_no: d.doc_no, title: d.title, discipline: d.discipline, doc_type: d.doc_type, revision: Number(d.revision) + 1, status: "Draft", owner_id: u.id, due_date: today(), notes: v.notes || "", file_url: url, file_name: v.file_name || "", progress: url ? 60 : 20 }, d.doc_no + " new revision");
        toast("Revision " + (Number(d.revision) + 1) + " created as Draft");
      })));
    const href = fileHref(d.file_url);
    detail(d.doc_no + " rev " + d.revision + " · " + d.title, [["Project", esc(projLabel(d.project_id))], ["Type", esc(d.doc_type)], ["Discipline", esc(d.discipline)],
      ["Owner", esc(staffName(d.owner_id))], ["Due", fmtDate(d.due_date)], ["Progress", bar(d.progress) + " " + esc(d.progress || 0) + "%"], ["Status", badge(d.status)], ["Comments", esc(d.notes)],
      ["File", href ? `<a href="${esc(href)}" target="_blank" rel="noopener">📄 ${esc(d.file_name || "Open PDF")}</a>` : '<span class="muted small">No PDF yet</span>']], acts.join(""),
      href && !isPhoneView() ? `<iframe class="pdf" src="${esc(href)}" title="PDF preview"></iframe>` : "");
  }

  SCREENS.docs = (u) => {
    const site = siteOnly(u);
    let rows = db.documents.filter((d) => inScope(u, d.project_id)).filter(byProjectFilter).filter((d) => matchSearch(d, ["doc_no", "title", "discipline"]));
    if (site) rows = rows.filter((d) => d.status === "Issued");
    else if (!state.showAll) rows = rows.filter((d) => d.status !== "Superseded");
    rows.sort((a, b) => String(a.doc_no).localeCompare(String(b.doc_no)) || b.revision - a.revision);
    const toggle = site ? `<span class="muted small">Showing issued, latest revisions only</span>` : `<label class="chk"><input type="checkbox" data-change="showAll" ${state.showAll ? "checked" : ""}> Show superseded</label>`;
    return `<h1>Document Control</h1><p class="muted">${isDesigner(u) && !hasTag(u, "HEAD") ? "Drawings for the projects you are assigned to. Upload the PDF, keep progress up to date, then send for review." : "Drawings, RFIs and submittals with their PDF files. Draft → In review → Approved → Issued; a new issue supersedes the old revision."}</p>
      ${toolbar(u, { extra: toggle, buttons: can(u, "docs", "edit") && projectOptions(u).length ? btn("New document", () => formModal("New document", [
        { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project },
        { name: "doc_no", label: "Number", required: true, help: "Example: A-101 or RFI-008" }, { name: "title", label: "Title", required: true },
        { name: "doc_type", label: "Type", type: "select", options: ["Drawing", "RFI", "Submittal", "Method statement", "Transmittal"] },
        { name: "discipline", label: "Discipline", type: "select", options: ["Architecture", "Interior", "Structure", "Mechanical", "Electrical", "Plumbing", "Fire", "ELV"] },
        { name: "due_date", label: "Due", type: "date", value: today() }, { name: "file", label: "PDF file (can add later)", type: "pdf" }
      ], async (v) => {
        v.doc_no = String(v.doc_no || "").trim().toUpperCase();
        if (db.documents.some((x) => x.project_id === v.project_id && String(x.doc_no).trim().toUpperCase() === v.doc_no)) throw new Error(v.doc_no + " already exists on this project. Open it and use “Start new revision”, or choose another number.");
        const url = v.file ? await storeFile(v.file, v.file_name || v.doc_no + ".pdf") : ""; delete v.file;
        await save("documents", Object.assign(v, { revision: 0, status: "Draft", owner_id: u.id, notes: "", file_url: url, progress: url ? 50 : 10 }), "New document " + v.doc_no);
      }), "primary") : "" })}
      ${table([{ label: "No.", get: (d) => `<b>${esc(d.doc_no)}</b>` + (d.file_url ? ' <span title="PDF attached">📄</span>' : "") }, { label: "Rev", get: (d) => esc(d.revision) }, { label: "Title", get: (d) => esc(d.title) },
        { label: "Project", get: (d) => esc(projLabel(d.project_id)) }, { label: "Owner", get: (d) => esc(staffName(d.owner_id)) },
        { label: "Progress", get: (d) => bar(d.progress || 0) + `<small>${esc(d.progress || 0)}%</small>` },
        { label: "Due", get: (d) => fmtDate(d.due_date) + (["Draft", "In review"].includes(d.status) && d.due_date < today() ? ' <span class="late">late</span>' : "") }, { label: "Status", get: (d) => badge(d.status) }], rows, openDoc)}`;
  };

  // ---------- COST & CLAIMS ----------
  const CLAIM_FLOW = ["Draft", "QS checked", "PM verified", "MD approved", "Invoiced", "Paid"];
  function claimActionsFor(u, c) {
    const s = c.status;
    if (s === "Draft" && groupsOf(u).includes("QS") && hasTag(u, "HEAD")) return ["QS checked"];
    if (s === "QS checked" && isPMof(u, c.project_id) && groupsOf(u).includes("PM")) return ["PM verified"];
    if (s === "PM verified" && hasTag(u, "MD")) return ["MD approved"];
    if (s === "MD approved" && can(u, "finance", "admin")) return ["Invoiced"];
    return [];
  }
  function openClaim(c) {
    const u = me(); const next = claimActionsFor(u, c)[0];
    const run = async (v) => {
      if (claimActionsFor(me(), byId("claims", c.id) || c)[0] !== next) throw new Error(next === "PM verified" ? RULE_MSG.notPM : RULE_MSG.notYours);
      const hist = (c.history || []).concat([{ at: nowIso(), by: u.id, action: next, note: v.note || "" }]);
      const p = { status: next, history: hist };
      if (next === "Invoiced") {
        p.certified = v.certified;
        const proj = byId("projects", c.project_id);
        await save("invoices", { inv_no: nextNo("invoices", "inv_no", "AR-"), direction: "Receivable", project_id: c.project_id, party: proj ? proj.client : "", source_type: "claim", source_id: c.id,
          amount: v.certified, due_date: new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA"), status: "Unpaid", paid_at: null }, "Invoice for IPC " + c.ipc_no);
      }
      await patch("claims", c.id, p, projLabel(c.project_id) + " IPC " + c.ipc_no + ": " + next);
    };
    const fields = next === "Invoiced" ? [{ name: "certified", label: "Amount certified by client (USD)", type: "number", value: c.claimed, required: true }, { name: "note", label: "Comment", type: "textarea" }] : [{ name: "note", label: "Comment", type: "textarea" }];
    const vos = db.variations.filter((v) => v.claim_id === c.id);
    detail(projLabel(c.project_id) + " · IPC " + c.ipc_no, [["Period", esc(c.period)], ["Claimed", money(c.claimed)], vos.length ? ["Variations included", vos.map((v) => `<a href="#" data-act="${act(() => openVO(v))}">${esc(v.vo_no)}</a> ${money(v.amount)}`).join(" · ") + " = <b>" + money(sum(vos, (v) => v.amount)) + "</b>"] : null, ["Certified", c.certified ? money(c.certified) : ""], ["Status", badge(c.status)]],
      (next ? btn(next === "Invoiced" ? "Raise invoice" : "Mark " + next, () => confirmAction(next + " · IPC " + c.ipc_no, fields, run), "primary") : "") + schedBtn(u, "claims", c, { type: "Progress claim", title: "Submit IPC " + c.ipc_no + " · " + projLabel(c.project_id), all_day: true, start_time: "", end_time: "" }),
      `<h4>Route</h4><ol class="steps">${CLAIM_FLOW.map((s, i) => `<li class="${i <= CLAIM_FLOW.indexOf(c.status) ? "done" : ""}"><b>${esc(s)}</b></li>`).join("")}</ol>${historyHtml(c.history)}`);
  }

  SCREENS.cost = (u) => {
    const T = tabs("cost", [["budget", "Budget vs actual"], ["claims", "IPC claims"]]);
    const projs = myProjects(u).filter((p) => !state.project || p.id === state.project);
    if (T.cur === "budget") {
      const blocks = projs.map((p) => {
        const lines = db.cost_lines.filter((c) => c.project_id === p.id);
        const committed = sum(db.purchase_orders.filter((o) => o.project_id === p.id && o.status !== "Paid"), (o) => o.amount);
        const b = sum(lines, (l) => l.budget), a = sum(lines, (l) => l.actual);
        return `<section class="card"><h2>${esc(p.code + " " + p.name)}</h2><p class="muted small">Budget ${money(b)} · Spent ${money(a)} (${pct(a, b)}%) · Open POs ${money(committed)} · Progress ${esc(p.progress)}%</p>
          ${table([{ label: "Cost line", get: (l) => esc(l.category) }, { label: "Budget", get: (l) => money(l.budget) }, { label: "Actual", get: (l) => money(l.actual) },
            { label: "Used", get: (l) => bar(pct(l.actual, l.budget), pct(l.actual, l.budget) > Number(p.progress) + 15) + `<small>${pct(l.actual, l.budget)}%</small>` }], lines,
            can(u, "cost", "admin") ? (l) => formModal("Update " + l.category, [{ name: "actual", label: "Actual cost to date (USD)", type: "number", value: l.actual, required: true }], async (v) => { await patch("cost_lines", l.id, v, p.code + " " + l.category + " actual " + money(v.actual)); }) : null)}</section>`;
      }).join("");
      return `<h1>Cost & Claims</h1>${T.html}${toolbar(u, {})}<p class="muted small">An orange bar means that cost line has used more than 15 points above the project's progress.</p>${blocks || empty("No projects.")}`;
    }
    const rows = db.claims.filter((c) => inScope(u, c.project_id)).filter(byProjectFilter).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return `<h1>Cost & Claims</h1>${T.html}${toolbar(u, { buttons: can(u, "cost", "admin") ? btn("New IPC claim", () => formModal("New IPC claim", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project },
      { name: "period", label: "Period", required: true, value: new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" }) },
      { name: "claimed", label: "Amount claimed (USD)", type: "number", required: true }
    ], async (v) => { const n = Math.max(0, ...db.claims.filter((c) => c.project_id === v.project_id).map((c) => c.ipc_no)) + 1;
      await save("claims", Object.assign(v, { ipc_no: n, certified: 0, status: "Draft", history: [{ at: nowIso(), by: u.id, action: "Created", note: "" }] }), "New IPC " + n + " " + projLabel(v.project_id)); }), "primary") : "" })}
      ${table([{ label: "Project", get: (c) => esc(projLabel(c.project_id)) }, { label: "IPC", get: (c) => esc(c.ipc_no) }, { label: "Period", get: (c) => esc(c.period) },
        { label: "Claimed", get: (c) => money(c.claimed) }, { label: "Certified", get: (c) => (c.certified ? money(c.certified) : "") }, { label: "Status", get: (c) => badge(c.status) }], rows, openClaim)}`;
  };

  // ---------- PROCUREMENT ----------
  function openPO(p) {
    const u = me(); const acts = [];
    const deliveryOk = (x) => groupsOf(x).includes("SITE") && inScope(x, p.project_id) || isPMof(x, p.project_id) || hasTag(x, "MD") || isSysAdmin(x) || hasTag(x, "PROC");
    const onSite = deliveryOk(u);
    const stockLines = (p.items || []).filter((x) => x.item_id);
    const defStore = (projectStores(p.project_id)[0] || mainStores()[0] || {}).id;
    if (p.status === "Ordered" && onSite) acts.push(btn("Confirm delivery", () => formModal("Confirm delivery · " + p.po_no, [
      { name: "delivered_note", label: "What arrived? Any damage or shortage?", type: "textarea", required: true }, { name: "delivered_photo", label: "Photo of delivery", type: "photo" }]
      .concat(stockLines.length ? [{ name: "to_stock", label: "Put the " + stockLines.length + " stock item" + (stockLines.length > 1 ? "s" : "") + " into stock?", type: "select", options: [["yes", "Yes, receive into stock"], ["no", "No, used straight away"]], value: "yes" },
        { name: "stock_store", label: "Into store", type: "select", options: db.stores.map((s) => [s.id, s.name]), value: defStore }]
        : [{ name: "stock_item", label: "Add to stock (optional)", type: "select", options: db.stock_items.map((i) => [i.id, i.code + " " + i.name]), blank: "Not a stock item" },
          { name: "stock_qty", label: "Quantity received into stock", type: "number" }, { name: "stock_store", label: "Into store", type: "select", options: db.stores.map((s) => [s.id, s.name]), value: defStore }]),
      async (v) => {
        if (!deliveryOk(me())) throw new Error(RULE_MSG.notPM);
        if ((byId("purchase_orders", p.id) || p).status !== "Ordered") throw new Error(p.po_no + " is already " + (byId("purchase_orders", p.id) || p).status + ".");
        const toStock = v.to_stock === "yes", one = v.stock_item, oneQ = Number(v.stock_qty), store = v.stock_store;
        ["to_stock", "stock_item", "stock_qty", "stock_store"].forEach((k) => delete v[k]);
        if (one && !(oneQ > 0)) throw new Error("Enter the quantity received into stock, or choose 'Not a stock item'.");
        await patch("purchase_orders", p.id, Object.assign(v, { status: "Delivered", delivered_by: u.id, delivered_at: nowIso() }), p.po_no + " delivered");
        const mv = (item_id, qty) => save("stock_moves", { move_date: today(), item_id, store_id: store, to_store_id: "", qty, move_type: "Receive", project_id: p.project_id, ref: p.po_no, by_id: u.id, note: "Delivered on site" }, "Received into stock from " + p.po_no);
        if (toStock) for (const x of stockLines) await mv(x.item_id, Number(x.qty));
        if (one) await mv(one, oneQ);
        await save("invoices", { inv_no: nextNo("invoices", "inv_no", "AP-"), direction: "Payable", project_id: p.project_id, party: supplierName(p.supplier_id), source_type: "po", source_id: p.id,
          amount: p.amount, due_date: new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA"), status: "Unpaid", paid_at: null }, "Supplier bill for " + p.po_no);
        toast("Delivery confirmed" + (toStock || one ? " and stock updated" : "") + ". Finance can now pay the supplier.");
      }, "Confirm"), "primary"));
    const req = byId("requests", p.request_id);
    detail(p.po_no + " · " + p.description, [["Supplier", esc(supplierName(p.supplier_id))], ["Project", esc(projLabel(p.project_id) || "Main store restock")], ["Amount", money(p.amount)], ["Status", badge(p.status)],
      ["From request", req ? `<a href="#" data-act="${act(() => openRequest(req))}">${esc(req.ref_no)}</a>` : ""],
      ["Split-order check", p.split_flag ? '<span class="late">Flagged: same supplier and project within 7 days adds up to USD ' + APPROVAL_LIMIT + " or more</span>" : "OK"],
      ["Delivered", p.delivered_at ? fmtDate(p.delivered_at) + " by " + esc(staffName(p.delivered_by)) : ""], ["Delivery note", esc(p.delivered_note)]], acts.join(""),
      linesTable(p.items, false) + (p.delivered_photo ? `<img class="photo" src="${p.delivered_photo}" alt="Delivery photo">` : ""));
  }

  SCREENS.procurement = (u) => {
    const T = tabs("proc", [["po", "Purchase orders"], ["sup", "Suppliers"]]);
    if (T.cur === "sup") {
      return `<h1>Procurement</h1>${T.html}${toolbar(u, { project: false, buttons: can(u, "procurement", "admin") ? btn("Add supplier", () => formModal("Add supplier", [
        { name: "name", label: "Company", required: true }, { name: "trade", label: "Supplies" }, { name: "contact", label: "Contact person" }, { name: "phone", label: "Phone" }
      ], async (v) => { await save("suppliers", v, "New supplier " + v.name); }), "primary") : "" })}
        ${table([{ label: "Supplier", get: (s) => `<b>${esc(s.name)}</b>` }, { label: "Supplies", get: (s) => esc(s.trade) }, { label: "Contact", get: (s) => esc(s.contact) },
          { label: "Orders", get: (s) => esc(db.purchase_orders.filter((p) => p.supplier_id === s.id).length) }], db.suppliers.filter((s) => matchSearch(s, ["name", "trade"])),
          can(u, "procurement", "admin") ? (s) => formModal("Edit supplier · " + s.name, [
            { name: "name", label: "Company", required: true, value: s.name }, { name: "trade", label: "Supplies", value: s.trade || "" }, { name: "contact", label: "Contact person", value: s.contact || "" }, { name: "phone", label: "Phone", value: s.phone || "" }
          ], async (v) => { await patch("suppliers", s.id, v, "Supplier changed: " + v.name); }, "Save changes") : null)}`;
    }
    const rows = db.purchase_orders.filter((p) => inScope(u, p.project_id)).filter(byProjectFilter).filter((p) => matchSearch(p, ["po_no", "description"])).sort((a, b) => String(b.po_no).localeCompare(String(a.po_no)));
    return `<h1>Procurement</h1><p class="muted">Material requests check stock first; only the shortfall becomes a purchase order. Site confirms delivery with a photo, the items go into stock, then Finance pays.</p>${T.html}
      ${toolbar(u, { buttons: can(u, "procurement", "admin") ? btn("New PO", () => formModal("New purchase order", [
        { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project },
        { name: "supplier_id", label: "Supplier", type: "select", options: db.suppliers.map((s) => [s.id, s.name]), required: true },
        { name: "description", label: "Items", required: true }, { name: "amount", label: "Amount (USD)", type: "number", required: true,
          help: "Orders of USD " + APPROVAL_LIMIT + " or more should come through a request so the MD approves first." }
      ], async (v) => { if (v.amount >= APPROVAL_LIMIT) throw new Error("USD " + APPROVAL_LIMIT + " or more needs MD approval: create a Material or Purchase request instead."); await createPO(Object.assign(v, { request_id: "" })); }), "primary") : "" })}
      ${table([{ label: "PO", get: (p) => `<b>${esc(p.po_no)}</b>` + (p.split_flag ? ' <span class="late">split?</span>' : "") }, { label: "Items", get: (p) => esc(p.description) },
        { label: "Supplier", get: (p) => esc(supplierName(p.supplier_id)) }, { label: "Project", get: (p) => esc(projLabel(p.project_id)) }, { label: "Amount", get: (p) => money(p.amount) },
        { label: "Status", get: (p) => badge(p.status) }], rows, openPO)}`;
  };

  // ---------- FINANCE ----------
  function openInvoice(i) {
    const u = me();
    const canPay = i.status === "Unpaid" && isFinance(u); // v23 rules: Finance only
    detail(i.inv_no + " · " + i.party, [["Type", esc(i.direction)], ["Project", esc(projLabel(i.project_id))], ["Amount", money(i.amount)], ["Due", fmtDate(i.due_date)],
      ["Status", badge(i.status)], ["Paid on", i.paid_at ? fmtDate(i.paid_at) : ""], ["Source", esc(i.source_type === "po" ? (byId("purchase_orders", i.source_id) || {}).po_no : i.source_type === "claim" ? "IPC claim" : i.source_type === "sub_payment" ? "Subcontractor payment " + ((byId("sub_payments", i.source_id) || {}).pc_no || "") : i.source_type === "retention" ? "Retention release" : i.source_type)]],
      canPay ? btn(i.direction === "Payable" ? "Mark paid" : "Mark received", async () => {
        if (!isFinance(me())) return toast(RULE_MSG.finance, true);
        await patch("invoices", i.id, { status: "Paid", paid_at: nowIso() }, i.inv_no + (i.direction === "Payable" ? " paid" : " received"));
        if (i.source_type === "po") await patch("purchase_orders", i.source_id, { status: "Paid" }, "PO paid");
        if (i.source_type === "sub_payment") { const x = byId("sub_payments", i.source_id); if (x && x.status !== "Paid") await patch("sub_payments", x.id, { status: "Paid", paid_at: nowIso(), history: (x.history || []).concat([{ at: nowIso(), by: u.id, action: "Paid", note: i.inv_no }]) }, x.pc_no + " paid"); }
        if (i.source_type === "claim") { const c = byId("claims", i.source_id); if (c) await patch("claims", c.id, { status: "Paid", history: (c.history || []).concat([{ at: nowIso(), by: u.id, action: "Paid", note: "Client payment received" }]) }, "IPC paid"); }
        closeModal(); render(); toast("Saved");
      }, "primary") : "");
  }

  SCREENS.finance = (u) => {
    const T = tabs("fin", [["Payable", "Supplier bills (payable)"], ["Receivable", "Client invoices (receivable)"]]);
    const all = db.invoices.filter(byProjectFilter);
    const ap = all.filter((i) => i.direction === "Payable" && i.status === "Unpaid"), ar = all.filter((i) => i.direction === "Receivable" && i.status === "Unpaid");
    const overdue = all.filter((i) => i.status === "Unpaid" && i.due_date < today());
    const rows = all.filter((i) => i.direction === T.cur).filter((i) => matchSearch(i, ["inv_no", "party"])).sort((a, b) => (a.status === "Paid") - (b.status === "Paid") || String(a.due_date).localeCompare(String(b.due_date)));
    return `<h1>Finance</h1>
      <div class="tiles"><div class="tile"><small>To pay suppliers</small><b>${money(sum(ap, (i) => i.amount))}</b><span>${ap.length} bills</span></div>
      <div class="tile"><small>To collect from clients</small><b>${money(sum(ar, (i) => i.amount))}</b><span>${ar.length} invoices</span></div>
      <div class="tile ${overdue.length ? "warn" : ""}"><small>Overdue</small><b>${overdue.length}</b><span>${money(sum(overdue, (i) => i.amount))}</span></div></div>
      ${T.html}${toolbar(u, {})}
      ${table([{ label: "No.", get: (i) => `<b>${esc(i.inv_no)}</b>` }, { label: "Party", get: (i) => esc(i.party) }, { label: "Project", get: (i) => esc(projLabel(i.project_id)) },
        { label: "Amount", get: (i) => money(i.amount) }, { label: "Due", get: (i) => fmtDate(i.due_date) + (i.status === "Unpaid" && i.due_date < today() ? ' <span class="late">overdue</span>' : "") },
        { label: "Status", get: (i) => badge(i.status) }], rows, openInvoice)}`;
  };

  // ---------- QA/QC ----------
  const qaqcBoss = (u) => can(u, "qaqc", "admin") || hasTag(u, "QAQC");
  // ---------- QA/QC: defects and inspections ----------
  // Raised ("imposed") by the executive, Project Managers, the QS team and QA/QC inspectors, always with a photo or PDF.
  // The site team corrects the defect, again with a photo or PDF; the person who raised it (or the PM) checks and closes it.
  const canCloseQA = (u, pid) => hasTag(u, "QAQC") || isPMof(u, pid) || hasTag(u, "MD"); // v23 rules: pass/fail and close
  const canRaiseQA = (u) => groupsOf(u).some((g) => ["EXEC", "PM", "QS"].includes(g)) || hasTag(u, "QAQC") || qaqcBoss(u);
  const QA_DISC = ["Architecture", "Structure", "Mechanical", "Electrical", "Plumbing", "Fire", "ELV"];
  const defectNo = (f) => "DEF-" + String(db.defects.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).indexOf(f) + 1).padStart(4, "0");
  const inspNo = (i) => "INS-" + String(db.inspections.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).indexOf(i) + 1).padStart(4, "0");
  const qaEvidence = (f) => (f.evidence && f.evidence.length ? f.evidence : f.photo ? [{ type: "image", name: "defect.jpg", url: f.photo }] : []);
  function newDefect(u, preset) {
    preset = preset || {};
    // who can fix it: the site team of that project, then its PM; only the whole site group if the project has no team yet
    const siteTeam = (pid) => {
      const p = pid ? byId("projects", pid) : null;
      const t = pid ? teamOf(pid, "SITE").map((m) => byId("staff", m.staff_id)).filter(Boolean) : [];
      if (p && p.pm_id && byId("staff", p.pm_id) && !t.some((x) => x.id === p.pm_id)) t.push(byId("staff", p.pm_id));
      return t.length ? t : inGroup("SITE");
    };
    formModal("Report a defect", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: preset.project_id || state.project },
      { name: "location", label: "Location", required: true, value: preset.location || "" }, { name: "discipline", label: "Discipline", type: "select", options: QA_DISC, value: preset.discipline || "" },
      { name: "description", label: "Defect", type: "textarea", required: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], value: "Medium" },
      { name: "assigned_to", label: "Who fixes it", type: "select", options: staffOptions(siteTeam(preset.project_id || state.project)), required: true },
      { name: "due_date", label: "Fix by", type: "date", value: today() },
      { name: "evidence", label: "Photos or files", type: "evidence", required: true, requiredMsg: "Attach at least one photo, image or PDF of the defect.", help: "Required. Take a photo with the camera, or attach images or a PDF." }
    ], async (v) => {
      if (!siteTeam(v.project_id).some((x) => x.id === v.assigned_to)) throw new Error("The person who fixes it must be on this project's team.");
      v.evidence = await storeEvidence(v.evidence, "defect");
      await save("defects", Object.assign(v, { status: "Open", raised_by: u.id, photo: "", close_evidence: [], inspection_id: preset.inspection_id || "" }), "Defect: " + v.description);
    }, "Send defect", { onReady: (m) => {
      const ps = m.querySelector('select[name="project_id"]'), as = m.querySelector('select[name="assigned_to"]');
      if (!ps || !as) return;
      const fill = () => { const cur = as.value, team = siteTeam(ps.value);
        as.innerHTML = '<option value="">—</option>' + team.map((x) => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.name + " · " + x.title)}</option>`).join("");
        if (!as.value && team.length) as.value = team[0].id;
        if (typeof translateNow === "function") translateNow(as); };
      ps.addEventListener("change", fill); fill();
    } });
  }
  function newInspection(u) {
    formModal("New inspection", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project }, { name: "title", label: "What is inspected", required: true },
      { name: "area", label: "Area" }, { name: "discipline", label: "Discipline", type: "select", options: QA_DISC },
      { name: "insp_date", label: "Date", type: "date", value: today() }, { name: "notes", label: "Checklist notes", type: "textarea" },
      { name: "evidence", label: "Photos or files", type: "evidence", required: true, requiredMsg: "Attach at least one photo, image or PDF (for example the checklist or drawing).", help: "Required. Photo of the work, the signed checklist or the drawing." }
    ], async (v) => { v.evidence = await storeEvidence(v.evidence, "inspection"); await save("inspections", Object.assign(v, { inspector_id: u.id, result: "Open", result_evidence: [] }), "Inspection: " + v.title); }, "Send inspection");
  }
  function inspectionResult(i, result) {
    formModal((result === "Passed" ? "Passed" : "Failed") + " · " + i.title, [
      { name: "result_note", label: result === "Passed" ? "What was checked" : "What failed", type: "textarea", required: true },
      { name: "result_evidence", label: "Photos or files of the result", type: "evidence", required: true, requiredMsg: "Attach a photo, image or PDF of the result.", help: "Required. Photo of the work as inspected, or the signed checklist." }
    ], async (v) => {
      if (!canCloseQA(me(), i.project_id)) throw new Error(RULE_MSG.qaClose);
      const ev = await storeEvidence(v.result_evidence, "inspection-result");
      await patch("inspections", i.id, { result, result_note: v.result_note, result_evidence: ev, checked_at: nowIso() }, "Inspection " + result.toLowerCase() + ": " + i.title);
    }, result === "Passed" ? "Save: passed" : "Save: failed");
  }
  function openInspection(i) {
    const u = me(); const acts = [];
    if (i.result === "Open" && canCloseQA(u, i.project_id)) {
      acts.push(btn("Failed", () => inspectionResult(i, "Failed"), "danger"));
      acts.push(btn("Passed", () => inspectionResult(i, "Passed"), "primary"));
    }
    if (i.result === "Failed" && canRaiseQA(u)) acts.push(btn("Raise defect", () => newDefect(u, { project_id: i.project_id, location: i.area, discipline: i.discipline, inspection_id: i.id })));
    acts.push(btn("PDF English", () => qaPdf("insp", i, "en")) + btn("PDF ខ្មែរ", () => qaPdf("insp", i, "km")));
    if (i.result === "Open") acts.push(schedBtn(u, "inspections", i, { type: "Inspection", title: i.title, date: i.insp_date && i.insp_date >= today() ? i.insp_date : today(), location: i.area || "", attendees: [i.inspector_id].filter(Boolean) }));
    const raised = db.defects.filter((f) => f.inspection_id === i.id);
    detail(inspNo(i) + " · " + i.title, [["Project", esc(projLabel(i.project_id))], ["Area", esc(i.area)], ["Discipline", esc(i.discipline)], ["Inspector", esc(staffName(i.inspector_id))], ["Date", fmtDate(i.insp_date)], ["Result", badge(i.result)],
      ["Checklist notes", esc(i.notes)], i.result_note ? ["Result notes", esc(i.result_note)] : null, raised.length ? ["Defects raised", raised.map((f) => esc(defectNo(f)) + " " + badge(f.status)).join(" ")] : null], acts.join(""),
      `<h4>Evidence: inspection</h4>${evidenceHtml(i.evidence)}${(i.result_evidence || []).length ? `<h4>Evidence: result</h4>${evidenceHtml(i.result_evidence)}` : ""}`);
  }
  function fixDefect(f) {
    formModal("Correction · " + defectNo(f), [
      { name: "correction", label: "What was corrected", type: "textarea", required: true, value: f.correction || "" },
      { name: "close_evidence", label: "Photos or files of the correction", type: "evidence", required: true, requiredMsg: "Attach a photo, image or PDF that shows the correction.", help: "Required. Show the defect fixed, from the same angle as the first photo if possible." }
    ], async (v) => {
      const ev = await storeEvidence(v.close_evidence, "defect-fix");
      await patch("defects", f.id, { status: "Fixed", correction: v.correction, close_evidence: ev, fixed_by: me().id, fixed_at: nowIso() }, "Defect fixed: " + f.description);
    }, "Send correction");
  }
  function verifyDefect(f, ok) {
    formModal((ok ? "Close" : "Reopen") + " · " + defectNo(f), [{ name: "verify_note", label: ok ? "Checked on site (note)" : "Why it is not accepted", type: "textarea", required: !ok }],
      async (v) => { if (!canCloseQA(me(), f.project_id)) throw new Error(RULE_MSG.qaClose); await patch("defects", f.id, ok ? { status: "Closed", verify_note: v.verify_note, closed_by: me().id, closed_at: nowIso() } : { status: "Open", verify_note: v.verify_note }, "Defect " + (ok ? "closed" : "reopened") + ": " + f.description); },
      ok ? "Close defect" : "Reopen");
  }
  function openDefect(f) {
    const u = me(); const acts = [];
    if (f.status === "Open" && (f.assigned_to === u.id || can(u, "qaqc", "edit") || isPMof(u, f.project_id))) acts.push(btn("Send correction", () => fixDefect(f), "primary"));
    if (f.status === "Fixed" && canCloseQA(u, f.project_id)) { acts.push(btn("Reopen", () => verifyDefect(f, false))); acts.push(btn("Close", () => verifyDefect(f, true), "primary")); }
    acts.push(btn("PDF English", () => qaPdf("defect", f, "en")) + btn("PDF ខ្មែរ", () => qaPdf("defect", f, "km")));
    detail(defectNo(f) + " · " + f.description, [["Project", esc(projLabel(f.project_id))], ["Location", esc(f.location)], ["Discipline", esc(f.discipline)], ["Priority", f.priority ? badge(f.priority) : ""],
      ["Raised by", esc(staffName(f.raised_by))], ["Assigned to", esc(staffName(f.assigned_to))], ["Fix by", fmtDate(f.due_date)], ["Status", badge(f.status)],
      f.correction ? ["Correction", esc(f.correction) + (f.fixed_by ? ` <small>· ${esc(staffName(f.fixed_by))} ${f.fixed_at ? esc(fmtDate(f.fixed_at)) : ""}</small>` : "")] : null,
      f.verify_note || f.closed_by ? ["Checked", esc(f.verify_note || "") + (f.closed_by ? ` <small>· ${esc(staffName(f.closed_by))} ${f.closed_at ? esc(fmtDate(f.closed_at)) : ""}</small>` : "")] : null], acts.join(""),
      `<h4>Evidence: defect</h4>${evidenceHtml(qaEvidence(f))}${(f.close_evidence || []).length ? `<h4>Evidence: correction</h4>${evidenceHtml(f.close_evidence)}` : f.status === "Open" ? '<p class="muted small">A photo or file of the correction is required.</p>' : ""}`);
  }
  // ---------- QA/QC PDF forms (English or Khmer) ----------
  const QAT = {
    en: { titleD: "Quality Defect & Corrective Action Report", titleI: "Quality Inspection Report", formD: "Form GID-QA-F01", formI: "Form GID-QA-F02", details: "Details", project: "Project", loc: "Location / area",
      disc: "Discipline", pri: "Priority", raised: "Raised by", date: "Date", assigned: "To be fixed by", due: "Fix by", found: "Defect found", evidence: "Evidence: before and after", before: "BEFORE · defect", after: "AFTER · correction",
      noAfter: "Waiting for the correction photo", correction: "Correction", corrected: "What was corrected", fixedBy: "Corrected by", verify: "Verification", note: "Note", status: "Status",
      sign: "Sign-off", raiser: "Raised by", fixer: "Corrected by", checker: "Checked and closed by", pm: "Project Manager", sigLine: "Signature / date", photos: "Evidence photos",
      inspector: "Inspector", checklist: "Checklist notes", result: "Result", passed: "PASSED", failed: "FAILED", open: "OPEN", closed: "CLOSED", fixed: "FIXED · TO CHECK", resultNote: "Result notes",
      inspEv: "Evidence: inspection and result", inspPh: "INSPECTION", resPh: "RESULT", defectsRaised: "Defects raised", none: "None", priMap: {}, discMap: {}, from: "From inspection",
      generated: "GID Management System · generated", page: (a, b) => "Page " + a + " of " + b, cont: "continued", files: (n) => n + " file" + (n === 1 ? "" : "s"), attachments: "Attachments" },
    km: { titleD: "របាយការណ៍ចំណុចខ្វះខាតគុណភាព និងវិធានការកែតម្រូវ", titleI: "របាយការណ៍ត្រួតពិនិត្យគុណភាព", formD: "ទម្រង់ GID-QA-F01", formI: "ទម្រង់ GID-QA-F02", details: "ព័ត៌មានលម្អិត", project: "គម្រោង", loc: "ទីតាំង / តំបន់",
      disc: "ផ្នែក", pri: "អាទិភាព", raised: "រាយការណ៍ដោយ", date: "កាលបរិច្ឆេទ", assigned: "អ្នកជួសជុល", due: "ជួសជុលត្រឹម", found: "ចំណុចខ្វះខាតដែលរកឃើញ", evidence: "ភស្តុតាង៖ មុន និងក្រោយ", before: "មុន · ចំណុចខ្វះខាត", after: "ក្រោយ · ការកែតម្រូវ",
      noAfter: "រង់ចាំរូបថតការកែតម្រូវ", correction: "ការកែតម្រូវ", corrected: "អ្វីដែលបានកែតម្រូវ", fixedBy: "កែតម្រូវដោយ", verify: "ការផ្ទៀងផ្ទាត់", note: "កំណត់ចំណាំ", status: "ស្ថានភាព",
      sign: "ហត្ថលេខា", raiser: "រាយការណ៍ដោយ", fixer: "កែតម្រូវដោយ", checker: "ពិនិត្យ និងបិទដោយ", pm: "អ្នកគ្រប់គ្រងគម្រោង", sigLine: "ហត្ថលេខា / កាលបរិច្ឆេទ", photos: "រូបថតភស្តុតាង",
      inspector: "អ្នកត្រួតពិនិត្យ", checklist: "កំណត់ចំណាំបញ្ជីត្រួតពិនិត្យ", result: "លទ្ធផល", passed: "ជាប់", failed: "មិនជាប់", open: "មិនទាន់បិទ", closed: "បានបិទ", fixed: "បានជួសជុល · រង់ចាំពិនិត្យ", resultNote: "កំណត់ចំណាំលទ្ធផល",
      inspEv: "ភស្តុតាង៖ ការត្រួតពិនិត្យ និងលទ្ធផល", inspPh: "ការត្រួតពិនិត្យ", resPh: "លទ្ធផល", defectsRaised: "ចំណុចខ្វះខាតដែលបានបង្កើត", none: "គ្មាន", from: "ពីការត្រួតពិនិត្យ",
      priMap: { Low: "ទាប", Medium: "មធ្យម", High: "ខ្ពស់" }, discMap: { Architecture: "ស្ថាបត្យកម្ម", Structure: "រចនាសម្ព័ន្ធ", Mechanical: "មេកានិច", Electrical: "អគ្គិសនី", Plumbing: "ទឹក និងលូ", Fire: "ប្រព័ន្ធអគ្គិភ័យ", ELV: "ប្រព័ន្ធតង់ស្យុងទាប (ELV)" },
      generated: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·", page: (a, b) => "ទំព័រ " + a + "/" + b, cont: "បន្ត", files: (n) => "ឯកសារ " + n, attachments: "ឯកសារភ្ជាប់" }
  };
  async function qaPdf(kind, r, lang) {
    const L = QAT[lang], p = byId("projects", r.project_id) || {}, tr = pdfTr(lang), T = (m, v) => esc((m && m[v]) || tr(v || ""));
    const imgs = (l) => (l || []).filter((x) => x.type !== "pdf"), pdfs = (l) => (l || []).filter((x) => x.type === "pdf");
    const ph = (x, empty) => x ? `<div class="sf-img" style="background-image:url('${String(x.url).replace(/'/g, "%27")}')"></div>` : `<div class="sf-noimg">${empty}</div>`;
    const person = (id) => byId("staff", id) || {};
    let no, title, form, stamp, blocks, before, after;
    if (kind === "defect") {
      no = defectNo(r); title = L.titleD; form = L.formD; before = qaEvidence(r); after = r.close_evidence || [];
      stamp = r.status === "Closed" ? L.closed : r.status === "Fixed" ? L.fixed : L.open;
      const rb = person(r.raised_by), fx = person(r.fixed_by), cl = person(r.closed_by), pm = person(p.pm_id), insp = r.inspection_id ? byId("inspections", r.inspection_id) : null;
      const files = pdfs(before).concat(pdfs(after));
      blocks = [
        `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.loc}</th><td>${esc(r.location || "")}</td></tr>
          <tr><th>${L.disc}</th><td>${T(L.discMap, r.discipline)}</td><th>${L.pri}</th><td>${T(L.priMap, r.priority)}</td></tr>
          <tr><th>${L.raised}</th><td>${esc(rb.name || "")} · ${esc(tr(rb.title || ""))}</td><th>${L.date}</th><td>${esc(rDate(r.created_at ? dateInPP(r.created_at) : today(), lang))}</td></tr>
          <tr><th>${L.assigned}</th><td>${esc(person(r.assigned_to).name || "")}</td><th>${L.due}</th><td>${esc(rDate(r.due_date, lang))}</td></tr>
          ${insp ? `<tr><th>${L.from}</th><td colspan="3">${esc(inspNo(insp))} · ${esc(insp.title)}</td></tr>` : ""}</table>`,
        `<h2><i>2</i>${L.found}</h2><div class="sf-box">${esc(r.description || "")}</div>`,
        `<h2><i>3</i>${L.evidence}</h2><div class="sf-ba"><div class="sf-bf"><div class="sf-hd">${L.before}</div>${ph(imgs(before)[0], L.none)}<p>${esc(rb.name || "")}</p></div><div class="sf-af"><div class="sf-hd">${L.after}</div>${ph(imgs(after)[0], L.noAfter)}<p>${r.fixed_by ? esc(fx.name || "") + " · " + esc(rDate(r.fixed_at, lang)) : "—"}</p></div></div>`,
        `<h2><i>4</i>${L.correction}</h2><table class="sf-t"><tr><th>${L.corrected}</th><td>${esc(r.correction || "—")}</td></tr><tr><th>${L.fixedBy}</th><td>${r.fixed_by ? esc(fx.name) + " · " + esc(rDT(r.fixed_at, lang)) : "—"}</td></tr>
          <tr><th>${L.verify}</th><td>${esc(r.verify_note || "—")}${r.closed_by ? " · " + esc(cl.name) + " · " + esc(rDate(r.closed_at, lang)) : ""}</td></tr>
          <tr><th>${L.attachments}</th><td>${L.files(before.length + after.length)}${files.length ? " · " + files.map((f) => esc(f.name)).join(", ") : ""}</td></tr></table>`,
        `<h2><i>5</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.raiser}</small><b>${esc(rb.name || "—")}</b><em>${esc(tr(rb.title || ""))}</em></div><div><small>${L.fixer}</small><b>${r.fixed_by ? esc(fx.name) : "—"}</b><em>${L.sigLine}</em></div>
          <div><small>${L.checker}</small><b>${r.closed_by ? esc(cl.name) : "—"}</b><em>${L.sigLine}</em></div><div><small>${L.pm}</small><b>${esc(pm.name || "—")}</b><em>${L.sigLine}</em></div></div>`];
    } else {
      no = inspNo(r); title = L.titleI; form = L.formI; before = r.evidence || []; after = r.result_evidence || [];
      stamp = r.result === "Passed" ? L.passed : r.result === "Failed" ? L.failed : L.open;
      const ins = person(r.inspector_id), pm = person(p.pm_id), raised = db.defects.filter((f) => f.inspection_id === r.id);
      const tick = sfTick;
      blocks = [
        `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.loc}</th><td>${esc(r.area || "")}</td></tr>
          <tr><th>${L.disc}</th><td>${T(L.discMap, r.discipline)}</td><th>${L.date}</th><td>${esc(rDate(r.insp_date, lang))}</td></tr><tr><th>${L.inspector}</th><td colspan="3">${esc(ins.name || "")} · ${esc(tr(ins.title || ""))}</td></tr></table>`,
        `<h2><i>2</i>${L.checklist}</h2><div class="sf-box">${esc(r.notes || "—")}</div>`,
        `<h2><i>3</i>${L.result}</h2><table class="sf-t"><tr><th>${L.result}</th><td>${tick(r.result === "Passed", L.passed)}${tick(r.result === "Failed", L.failed)}${tick(r.result === "Open", L.open)}</td></tr>
          <tr><th>${L.resultNote}</th><td>${esc(r.result_note || "—")}</td></tr><tr><th>${L.defectsRaised}</th><td>${raised.length ? raised.map((f) => esc(defectNo(f) + " · " + f.description)).join("<br>") : L.none}</td></tr></table>`,
        `<h2><i>4</i>${L.inspEv}</h2><div class="sf-ba"><div class="sf-bf"><div class="sf-hd">${L.inspPh}</div>${ph(imgs(before)[0], L.none)}<p>${esc(rDate(r.insp_date, lang))}</p></div><div class="sf-af"><div class="sf-hd">${L.resPh}</div>${ph(imgs(after)[0], L.none)}<p>${r.checked_at ? esc(rDT(r.checked_at, lang)) : "—"}</p></div></div>`,
        `<h2><i>5</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.inspector}</small><b>${esc(ins.name || "—")}</b><em>${L.sigLine}</em></div><div><small>${L.pm}</small><b>${esc(pm.name || "—")}</b><em>${L.sigLine}</em></div><div><small>&nbsp;</small><b>&nbsp;</b><em>${L.sigLine}</em></div><div><small>&nbsp;</small><b>&nbsp;</b><em>${L.sigLine}</em></div></div>`];
    }
    const more = imgs(before).concat(imgs(after));
    sfCss();
    await makePdf({ lang, no, fileName: no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${kmTitle(title, lang)}</h1><small>${esc(no)} · ${form}</small><span class="rp-sess ${/OPEN|FIXED|FAILED|មិន|រង់ចាំ/.test(stamp) ? "sf-open" : ""}">${stamp}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} · ${esc(no)}</span><span>${form}</span></div>`,
      contTitle: title + " (" + L.cont + ")", photoTitle: L.photos, blocks,
      photos: more.length > 2 ? more.map((x, i) => ({ src: x.url, cap: i < imgs(before).length ? (kind === "defect" ? L.before : L.inspPh) : (kind === "defect" ? L.after : L.resPh) })) : [],
      footLeft: L.generated + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }
  SCREENS.qaqc = (u) => {
    const T = tabs("qaqc", [["defects", "Defects (snag list)"], ["insp", "Inspections"]]);
    if (T.cur === "insp") {
      const rows = db.inspections.filter((i) => inScope(u, i.project_id)).filter(byProjectFilter).filter((i) => matchSearch(i, ["title", "area"])).sort((a, b) => String(b.insp_date).localeCompare(String(a.insp_date)));
      return `<h1>QA/QC & Snags</h1>${T.html}${toolbar(u, { buttons: canRaiseQA(u) ? btn("New inspection", () => newInspection(u), "primary") : "" })}
        ${table([{ label: "Date", get: (i) => fmtDate(i.insp_date) }, { label: "Inspection", get: (i) => `<small>${esc(inspNo(i))}</small> <b>${esc(i.title)}</b>` }, { label: "Project", get: (i) => esc(projLabel(i.project_id)) },
          { label: "Inspector", get: (i) => esc(staffName(i.inspector_id)) }, { label: "Result", get: (i) => badge(i.result) }], rows, openInspection)}`;
    }
    const rows = db.defects.filter((f) => inScope(u, f.project_id)).filter(byProjectFilter).filter((f) => matchSearch(f, ["description", "location"])).sort((a, b) => (a.status === "Closed") - (b.status === "Closed"));
    return `<h1>QA/QC & Snags</h1>${T.html}${toolbar(u, { buttons: canRaiseQA(u) ? btn("Report defect", () => newDefect(u), "primary") : "" })}
      ${table([{ label: "No.", get: (f) => `<small>${esc(defectNo(f))}</small>` }, { label: "Defect", get: (f) => `<b>${esc(f.description)}</b>` + (qaEvidence(f).length ? " 📷" : "") }, { label: "Location", get: (f) => esc(f.location) }, { label: "Project", get: (f) => esc(projLabel(f.project_id)) },
        { label: "Assigned to", get: (f) => esc(staffName(f.assigned_to)) }, { label: "Fix by", get: (f) => fmtDate(f.due_date) + (f.status === "Open" && f.due_date < today() ? ' <span class="late">late</span>' : "") },
        { label: "Status", get: (f) => badge(f.status) }], rows, openDefect)}`;
  };

  // ---------- SAFETY ----------
  // Evidence files (photos and PDFs) shown as thumbnails; images open in the photo viewer, PDFs in a new tab
  function evidenceHtml(list) {
    list = list || [];
    if (!list.length) return '<span class="muted">None</span>';
    return `<div class="gallery evshow">${list.map((x, i) => x.type === "pdf"
      ? `<a class="ph pdf" href="${fileHref(x.url)}" target="_blank" rel="noopener" download="${esc(x.name || "file.pdf")}"><i>PDF</i><small>${esc(x.name || "file.pdf")}</small></a>`
      : `<a class="ph" href="#" data-act="${act(() => lightbox(list.filter((y) => y.type !== "pdf").map((y) => y.url), list.filter((y) => y.type !== "pdf").indexOf(x)))}"><img src="${esc(x.url)}" alt="Evidence ${i + 1}"></a>`).join("")}</div>`;
  }
  async function storeEvidence(list, prefix) {
    const out = [];
    for (let i = 0; i < (list || []).length; i++) { const x = list[i]; out.push({ type: x.type, name: x.name, url: await storeFile(x.data, prefix + "-" + (i + 1) + (x.type === "pdf" ? ".pdf" : ".jpg")) }); }
    return out;
  }
  const SAFETY_OPEN_TYPES = ["Near miss", "Incident"];
  function newSafety(u) {
    formModal("Safety record", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project },
      { name: "rec_type", label: "Type", type: "select", options: ["Toolbox talk", "Inspection", "PPE check", "Near miss", "Incident"], required: true },
      { name: "rec_date", label: "Date", type: "date", value: today() }, { name: "area", label: "Exact location / area", help: "Example: Level 3, east slab edge, grid A-B" },
      { name: "description", label: "What happened / what was covered", type: "textarea", required: true },
      { name: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High"] }, { name: "action", label: "Immediate action taken", type: "textarea" },
      { name: "injury", label: "Injury (near miss and incident)", type: "select", options: ["None", "First aid", "Medical treatment", "Lost time"] },
      { name: "people_involved", label: "People involved / witnesses", help: "Near miss and incident only" },
      { name: "likelihood", label: "Likelihood (1 rare – 5 almost certain)", type: "select", options: ["", "1", "2", "3", "4", "5"], help: "For incidents and High severity: used for the 5×5 risk rating" },
      { name: "consequence", label: "Consequence (1 minor – 5 severe)", type: "select", options: ["", "1", "2", "3", "4", "5"] },
      { name: "root_cause", label: "Root cause (why did it happen?)", type: "textarea" },
      { name: "evidence", label: "Photos or files", type: "evidence", required: true, requiredMsg: "Attach at least one photo, image or PDF of the finding.", help: "Required. Take a photo with the camera, or attach images or a PDF." }
    ], async (v) => {
      v.evidence = await storeEvidence(v.evidence, "safety");
      v.likelihood = v.likelihood ? Number(v.likelihood) : null; v.consequence = v.consequence ? Number(v.consequence) : null;
      await save("safety", Object.assign(v, { reported_by: u.id, status: SAFETY_OPEN_TYPES.includes(v.rec_type) ? "Open" : "Closed", close_evidence: [] }), "Safety: " + v.rec_type + (v.severity ? " (" + v.severity + ")" : ""));
    }, "Send record");
  }
  // PMs, the Site Manager and site engineers on the project may close an open record, with proof of the correction
  const canCloseSafety = (u, s) => s.status === "Open" && (can(u, "safety", "approve") || hasTag(u, "SITEMGR") || (groupsOf(u).includes("SITE") && inScope(u, s.project_id)) || isPMof(u, s.project_id)) && !(isPMRole(u) && !isPMof(u, s.project_id) && !isSysAdmin(u));
  function closeSafety(s) {
    formModal("Close · " + s.rec_type, [
      { name: "correction", label: "What was corrected", type: "textarea", required: true, value: s.correction || "" },
      { name: "preventive", label: "What will stop it happening again", type: "textarea", value: s.preventive || "", help: "Example: permit before removing edge protection; toolbox talk for all trades" },
      { name: "lessons", label: "Lesson learned", value: s.lessons || "" },
      { name: "close_evidence", label: "Photos or files of the correction", type: "evidence", required: true, requiredMsg: "Attach a photo, image or PDF that shows the correction.", help: "Required. Show the problem fixed, for example the guardrail now installed." }
    ], async (v) => {
      const ev = await storeEvidence(v.close_evidence, "safety-close");
      await patch("safety", s.id, { status: "Closed", correction: v.correction, preventive: v.preventive, lessons: v.lessons, close_evidence: ev, closed_by: me().id, closed_at: nowIso() }, "Safety record closed: " + s.rec_type);
    }, "Close record");
  }
  function openSafety(s) {
    const u = me();
    const form = safetyForm(s);
    const acts = (canCloseSafety(u, s) ? btn("Close with correction", () => closeSafety(s), "primary") : "") + btn("PDF English", () => safetyPdf(s, "en")) + btn("PDF ខ្មែរ", () => safetyPdf(s, "km"));
    detail(s.rec_type + " · " + projLabel(s.project_id), [["Date", fmtDate(s.rec_date)], ["Location / area", esc(s.area)], ["Description", esc(s.description)], ["Severity", badge(s.severity)],
      ["Reported by", esc(staffName(s.reported_by))], ["Immediate action", esc(s.action)], ["Status", badge(s.status)],
      s.status === "Closed" && s.closed_by ? ["Closed by", esc(staffName(s.closed_by)) + (s.closed_at ? " · " + fmtDate(s.closed_at) + " " + timeOf(s.closed_at) : "")] : null,
      s.correction ? ["Correction", esc(s.correction)] : null, s.preventive ? ["Prevent it happening again", esc(s.preventive)] : null,
      ["Report form", form === "B" ? "Form B · HSE incident and near-miss investigation (2 pages)" : "Form A · Safety observation and corrective action (1 page)"]], acts,
      `<h4>Evidence: finding</h4>${evidenceHtml(s.evidence)}${(s.close_evidence || []).length ? `<h4>Evidence: correction</h4>${evidenceHtml(s.close_evidence)}` : s.status === "Open" ? '<p class="muted small">A photo or file of the correction is required to close this record.</p>' : ""}`);
  }
  // ---------- Safety report PDF: Form A (everyday records) or Form B (incidents and High severity) ----------
  const safetyForm = (s) => s.rec_type === "Incident" || s.severity === "High" ? "B" : "A";
  const safetyNo = (s) => "SAF-" + String(db.safety.slice().sort((a, b) => String(a.created_at || a.rec_date).localeCompare(String(b.created_at || b.rec_date))).indexOf(s) + 1).padStart(4, "0");
  const SFT = {
    en: { titleA: "Safety Observation & Corrective Action Report", titleB: "HSE Incident & Near-miss Investigation Report", formA: "Form GID-HSE-F01", formB: "Form GID-HSE-F02",
      open: "OPEN", closed: "CLOSED", details: "Record details", event: "Event", project: "Project", area: "Location / area", dt: "Date", reportedAt: "Reported", by: "Reported by", pm: "Project Manager",
      type: "Type", sev: "Severity", found: "What was found", desc: "Description", evidence: "Evidence: before and after", before: "BEFORE · finding", after: "AFTER · correction",
      noAfter: "Waiting for the correction photo", action: "Corrective action", immediate: "Immediate action", correction: "Correction", preventive: "Prevent it happening again",
      attachments: "Attachments", people: "People and injury", involved: "People involved / witnesses", injury: "Injury", risk: "Risk rating", root: "Root cause",
      likely: "Likelihood", conseq: "Consequence", rating: "Rating", levels: ["", "Low", "Low", "Medium", "High", "High"], capa: "Actions", closure: "Closure", closedOn: "Closed on", timeOpen: "Time open",
      lessons: "Lesson learned", sign: "Sign-off", reporter: "Reported by", closer: "Corrected / closed by", verifier: "Verified by (PM)", officer: "Safety officer", toAssign: "To be assigned",
      sigLine: "Signature / date", photos: "Evidence photos", files: (n) => n + " file" + (n === 1 ? "" : "s"), none: "None", stop: "Work stops until the hazard is controlled.",
      types: {}, sevs: {}, injuries: {}, lik: ["", "Rare", "Unlikely", "Possible", "Likely", "Almost certain"], con: ["", "Minor", "Low", "Moderate", "Major", "Severe"],
      generated: "GID Management System · generated", page: (a, b) => "Page " + a + " of " + b, cont: "continued", inSystem: "Signed in GID system" },
    km: { titleA: "របាយការណ៍សង្កេតសុវត្ថិភាព និងវិធានការកែតម្រូវ", titleB: "របាយការណ៍ស៊ើបអង្កេតឧប្បត្តិហេតុ និងហេតុការណ៍ជិតគ្រោះថ្នាក់", formA: "ទម្រង់ GID-HSE-F01", formB: "ទម្រង់ GID-HSE-F02",
      open: "មិនទាន់បិទ", closed: "បានបិទ", details: "ព័ត៌មានកំណត់ត្រា", event: "ព្រឹត្តិការណ៍", project: "គម្រោង", area: "ទីតាំង / តំបន់", dt: "កាលបរិច្ឆេទ", reportedAt: "រាយការណ៍ម៉ោង", by: "រាយការណ៍ដោយ", pm: "អ្នកគ្រប់គ្រងគម្រោង",
      type: "ប្រភេទ", sev: "កម្រិតធ្ងន់ធ្ងរ", found: "អ្វីដែលបានរកឃើញ", desc: "ការពិពណ៌នា", evidence: "ភស្តុតាង៖ មុន និងក្រោយ", before: "មុន · អ្វីដែលរកឃើញ", after: "ក្រោយ · ការកែតម្រូវ",
      noAfter: "រង់ចាំរូបថតការកែតម្រូវ", action: "វិធានការកែតម្រូវ", immediate: "វិធានការភ្លាមៗ", correction: "ការកែតម្រូវ", preventive: "វិធានការការពារកុំឱ្យកើតឡើងម្តងទៀត",
      attachments: "ឯកសារភ្ជាប់", people: "អ្នកពាក់ព័ន្ធ និងរបួស", involved: "អ្នកពាក់ព័ន្ធ / សាក្សី", injury: "របួស", risk: "ការវាយតម្លៃហានិភ័យ", root: "មូលហេតុដើម",
      likely: "លទ្ធភាពកើតឡើង", conseq: "ផលវិបាក", rating: "កម្រិតហានិភ័យ", levels: ["", "ទាប", "ទាប", "មធ្យម", "ខ្ពស់", "ខ្ពស់"], capa: "សកម្មភាព", closure: "ការបិទកំណត់ត្រា", closedOn: "បិទនៅ", timeOpen: "រយៈពេលបើក",
      lessons: "មេរៀនដែលទទួលបាន", sign: "ហត្ថលេខា", reporter: "រាយការណ៍ដោយ", closer: "កែតម្រូវ / បិទដោយ", verifier: "ផ្ទៀងផ្ទាត់ដោយ (អ្នកគ្រប់គ្រងគម្រោង)", officer: "មន្ត្រីសុវត្ថិភាព", toAssign: "មិនទាន់កំណត់",
      sigLine: "ហត្ថលេខា / កាលបរិច្ឆេទ", photos: "រូបថតភស្តុតាង", files: (n) => "ឯកសារ " + n, none: "គ្មាន", stop: "ត្រូវផ្អាកការងាររហូតដល់គ្រោះថ្នាក់ត្រូវបានគ្រប់គ្រង។",
      types: { "Toolbox talk": "កិច្ចប្រជុំសុវត្ថិភាពពេលព្រឹក", "Inspection": "ការត្រួតពិនិត្យ", "PPE check": "ពិនិត្យឧបករណ៍ការពារខ្លួន", "Near miss": "ហេតុការណ៍ជិតគ្រោះថ្នាក់", "Incident": "ឧប្បត្តិហេតុ" },
      sevs: { Low: "ទាប", Medium: "មធ្យម", High: "ខ្ពស់" }, injuries: { "None": "គ្មាន", "First aid": "សង្គ្រោះបឋម", "Medical treatment": "ព្យាបាលដោយគ្រូពេទ្យ", "Lost time": "បាត់បង់ម៉ោងធ្វើការ" },
      lik: ["", "កម្រ", "មិនសូវកើត", "អាចកើតមាន", "ទំនងកើត", "ប្រាកដជាកើត"], con: ["", "តិចតួច", "ទាប", "មធ្យម", "ធ្ងន់", "ធ្ងន់ធ្ងរ"],
      generated: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·", page: (a, b) => "ទំព័រ " + a + "/" + b, cont: "បន្ត", inSystem: "ចុះហត្ថលេខាក្នុងប្រព័ន្ធ GID" }
  };
  function safetyBlocks(s, form, L, lang) {
    const p = byId("projects", s.project_id) || {}, who = byId("staff", s.reported_by) || {}, closer = byId("staff", s.closed_by);
    const tr = pdfTr(lang), T = (map, v) => esc((map && map[v]) || tr(v || ""));
    const imgs = (list) => (list || []).filter((x) => x.type !== "pdf"), pdfs = (list) => (list || []).filter((x) => x.type === "pdf");
    const b1 = imgs(s.evidence)[0], a1 = imgs(s.close_evidence)[0];
    const tick = sfTick;
    const typeRow = ["Toolbox talk", "Inspection", "PPE check", "Near miss", "Incident"].map((t) => tick(s.rec_type === t, T(L.types, t))).join("");
    const sevRow = ["Low", "Medium", "High"].map((v) => `<span class="sf-sev ${s.severity === v ? "sf-on sf-" + v.toLowerCase() : ""}">${T(L.sevs, v)}</span>`).join("");
    const ba = `<div class="sf-ba"><div class="sf-bf"><div class="sf-hd">${L.before}</div>${b1 ? `<div class="sf-img" style="background-image:url('${String(b1.url).replace(/'/g, "%27")}')"></div>` : `<div class="sf-noimg">${L.none}</div>`}<p>${esc(who.name || "")} · ${esc(rDate(s.rec_date, lang))}</p></div>
      <div class="sf-af"><div class="sf-hd">${L.after}</div>${a1 ? `<div class="sf-img" style="background-image:url('${String(a1.url).replace(/'/g, "%27")}')"></div>` : `<div class="sf-noimg">${L.noAfter}</div>`}<p>${closer ? esc(closer.name) + " · " + esc(rDT(s.closed_at, lang)) : "—"}</p></div></div>`;
    const files = pdfs(s.evidence).concat(pdfs(s.close_evidence));
    const verifier = s.status === "Closed" ? (byId("staff", p.pm_id) || {}) : null;
    const sign = `<div class="sf-sign"><div><small>${L.reporter}</small><b>${esc(who.name || "")}</b><em>${esc(tr(who.title || ""))} · ${esc(rDate(s.rec_date, lang))}</em></div>
      <div><small>${L.closer}</small><b>${closer ? esc(closer.name) : "—"}</b><em>${closer ? esc(tr(closer.title)) + " · " + esc(rDate(s.closed_at, lang)) : L.sigLine}</em></div>
      <div><small>${L.verifier}</small><b>${verifier ? esc(verifier.name) : "—"}</b><em>${L.sigLine}</em></div><div><small>${L.officer}</small><b>${L.toAssign}</b><em>${L.sigLine}</em></div></div>`;
    const blocks = [];
    if (form === "A") {
      blocks.push(`<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.area}</th><td>${esc(s.area || "")}</td></tr>
        <tr><th>${L.dt}</th><td>${esc(rDate(s.rec_date, lang))}</td><th>${L.by}</th><td>${esc(who.name || "")} · ${esc(tr(who.title || ""))}</td></tr></table>`);
      blocks.push(`<h2><i>2</i>${L.type} · ${L.sev}</h2><table class="sf-t"><tr><th>${L.type}</th><td>${typeRow}</td></tr><tr><th>${L.sev}</th><td>${sevRow}</td></tr></table>`);
      blocks.push(`<h2><i>3</i>${L.found}</h2><div class="sf-box">${esc(s.description || "")}</div>`);
      blocks.push(`<h2><i>4</i>${L.evidence}</h2>${ba}`);
      blocks.push(`<h2><i>5</i>${L.action}</h2><table class="sf-t"><tr><th>${L.immediate}</th><td>${esc(s.action || L.none)}</td></tr><tr><th>${L.correction}</th><td>${esc(s.correction || "—")}</td></tr>
        ${s.preventive ? `<tr><th>${L.preventive}</th><td>${esc(s.preventive)}</td></tr>` : ""}<tr><th>${L.attachments}</th><td>${L.files((s.evidence || []).length + (s.close_evidence || []).length)}${files.length ? " · " + files.map((f) => esc(f.name)).join(", ") : ""}</td></tr></table>`);
      blocks.push(`<h2><i>6</i>${L.sign}</h2>${sign}`);
    } else {
      const lk = Number(s.likelihood) || 0, cq = Number(s.consequence) || 0, score = lk * cq;
      const cell = (l, c) => { const v = l * c, cls = v >= 15 ? "sf-r" : v >= 8 ? "sf-o" : v >= 4 ? "sf-y" : "sf-g"; return `<td class="${cls}${l === lk && c === cq ? " sf-sel" : ""}">${v}</td>`; };
      const matrix = `<table class="sf-mx"><tbody>${[5, 4, 3, 2, 1].map((l) => `<tr><th>${esc(L.lik[l])} (${l})</th>${[1, 2, 3, 4, 5].map((c) => cell(l, c)).join("")}</tr>`).join("")}<tr><th></th>${[1, 2, 3, 4, 5].map((c) => `<th class="sf-c">${esc(L.con[c])}</th>`).join("")}</tr></tbody></table>`;
      blocks.push(`<h2><i>A</i>${L.event}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.dt}</th><td>${esc(rDate(s.rec_date, lang))}</td></tr>
        <tr><th>${L.area}</th><td>${esc(s.area || "")}</td><th>${L.by}</th><td>${esc(who.name || "")}</td></tr><tr><th>${L.type}</th><td colspan="3">${typeRow}</td></tr>
        <tr><th>${L.desc}</th><td colspan="3">${esc(s.description || "")}</td></tr></table>`);
      blocks.push(`<h2><i>B</i>${L.people}</h2><table class="sf-t"><tr><th>${L.involved}</th><td>${esc(s.people_involved || L.none)}</td><th>${L.injury}</th><td>${T(L.injuries, s.injury || "None")}</td></tr><tr><th>${L.sev}</th><td colspan="3">${sevRow}</td></tr></table>`);
      blocks.push(`<div class="sf-two"><div><h2><i>C</i>${L.risk}</h2>${lk && cq ? matrix + `<div class="sf-note">${L.likely} ${lk} × ${L.conseq} ${cq} = <b>${score} · ${esc(L.levels[score >= 15 ? 5 : score >= 8 ? 4 : score >= 4 ? 3 : 1])}</b>${score >= 15 ? " " + L.stop : ""}</div>` : `<p>${L.none}</p>`}</div>
        <div><h2><i>D</i>${L.root}</h2><div class="sf-box">${esc(s.root_cause || "—")}</div></div></div>`);
      blocks.push(`<h2><i>E</i>${L.evidence}</h2>${ba}`);
      blocks.push(`<h2><i>F</i>${L.capa}</h2><table class="sf-t"><tr><th>${L.immediate}</th><td>${esc(s.action || L.none)}</td></tr><tr><th>${L.correction}</th><td>${esc(s.correction || "—")}</td></tr><tr><th>${L.preventive}</th><td>${esc(s.preventive || "—")}</td></tr>
        <tr><th>${L.attachments}</th><td>${L.files((s.evidence || []).length + (s.close_evidence || []).length)}${files.length ? " · " + files.map((f) => esc(f.name)).join(", ") : ""}</td></tr></table>`);
      const openH = s.closed_at ? Math.max(0, Math.round((new Date(s.closed_at) - new Date(s.created_at || s.rec_date)) / 3600000)) : null;
      blocks.push(`<h2><i>G</i>${L.closure}</h2><table class="sf-t"><tr><th>${L.closedOn}</th><td>${s.closed_at ? esc(rDT(s.closed_at, lang)) : "—"}</td><th>${L.timeOpen}</th><td>${openH != null ? openH + " h" : "—"}</td></tr><tr><th>${L.lessons}</th><td colspan="3">${esc(s.lessons || "—")}</td></tr></table>`);
      blocks.push(`<h2><i>H</i>${L.sign}</h2>${sign}`);
    }
    return blocks;
  }
  async function safetyPdf(s, lang) {
    const L = SFT[lang], form = safetyForm(s), no = safetyNo(s), p = byId("projects", s.project_id) || {};
    const title = form === "B" ? L.titleB : L.titleA;
    const more = (s.evidence || []).concat(s.close_evidence || []).filter((x) => x.type !== "pdf");
    sfCss();
    await makePdf({ lang, no, fileName: no + "-Form" + form + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${kmTitle(title, lang)}</h1><small>${esc(no)} · ${form === "B" ? L.formB : L.formA}</small><span class="rp-sess ${s.status === "Open" ? "sf-open" : ""}">${s.status === "Open" ? L.open : L.closed}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} · ${esc(no)}</span><span>${form === "B" ? L.formB : L.formA}</span></div>`,
      contTitle: title + " (" + L.cont + ")", photoTitle: L.photos, blocks: safetyBlocks(s, form, L, lang),
      photos: more.length > 2 ? more.map((x, i) => ({ src: x.url, cap: (i < (s.evidence || []).filter((y) => y.type !== "pdf").length ? L.before : L.after) })) : [],
      footLeft: L.generated + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }
  const SF_CSS = `.rp-page .sf-h1{font-size:17px;line-height:1.3}.rp-page.km .sf-h1{font-size:17px;line-height:1.55}
  .rp-page h2 i{font-style:normal;background:#2e8540;color:#fff;border-radius:4px;padding:0 6px;margin-right:6px;font-size:11px}
  .sf-t th{background:#eef6ef;width:20%;text-transform:none!important;font-size:11px!important;color:#3b4b41!important;border:1px solid #d5dfd6;vertical-align:top}.sf-t td{border:1px solid #d5dfd6;vertical-align:top}
  .sf-t.sf-cols th{width:auto}.sf-t .sf-wide{width:46%!important}.rp-page .sf-t .sf-num{text-align:right;white-space:nowrap}
  .sf-chk{display:inline-flex;align-items:center;gap:5px;margin:0 10px 2px 0;white-space:nowrap;vertical-align:top}
  .sf-chk i{position:relative;flex:0 0 12px;width:12px;height:12px;border:1.4px solid #3b4b41;border-radius:2px;display:block;font-style:normal}
  .sf-chk i.sf-on{background:#2e8540;border-color:#2e8540}.sf-chk i.sf-on::after{content:"";position:absolute;left:2.6px;top:.4px;width:3.2px;height:6.4px;border:solid #fff;border-width:0 1.8px 1.8px 0;transform:rotate(45deg)}
  .sf-sev{display:inline-block;padding:1px 10px;border-radius:4px;margin-right:6px;border:1px solid #d5dfd6;color:#8a93a6}.sf-sev.sf-on{color:#fff;font-weight:700}.sf-sev.sf-low{background:#1a7f42;border-color:#1a7f42}.sf-sev.sf-medium{background:#b97800;border-color:#b97800}.sf-sev.sf-high{background:#c0362c;border-color:#c0362c}
  .sf-box{border:1px solid #d5dfd6;border-radius:6px;padding:8px 10px;min-height:44px;white-space:pre-wrap}.sf-box.rp-contd{min-height:0}
  .sf-ba{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sf-ba>div{border:1px solid #d5dfd6;border-radius:8px;overflow:hidden}.sf-ba .sf-hd{display:block;padding:5px 9px;color:#fff;font-weight:700;font-size:11.5px}.sf-ba .sf-bf .sf-hd{background:#c0362c}.sf-ba .sf-af .sf-hd{background:#1a7f42}
  .sf-ba .sf-img{height:200px;background:#f3f5f8 center/contain no-repeat}.sf-ba .sf-noimg{height:200px;background:#f3f5f8;display:flex;align-items:center;justify-content:center;color:#8a93a6;font-size:12px;text-align:center;padding:0 12px}.sf-ba p{padding:5px 9px;font-size:11px;color:#4a5a50}
  .sf-sign{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sf-sign>div{border:1px solid #d5dfd6;border-radius:6px;padding:7px 9px;min-height:76px;font-size:11.5px;display:flex;flex-direction:column}.sf-sign small{display:block;color:#6b7488;font-size:10px}.sf-sign em{margin-top:auto;display:block;border-top:1px dashed #9aa79f;padding-top:3px;font-style:normal;font-size:9.5px;color:#7d8c83}
  .sf-two{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;align-items:start}.sf-mx{width:auto!important;border-collapse:separate!important;border-spacing:2px}.sf-mx td{width:34px;height:22px;text-align:center;font-weight:700;border:0!important;border-radius:3px;padding:0!important;font-size:10.5px;vertical-align:middle!important}
  .sf-mx th{font-size:9.5px!important;padding:0 5px!important;border:0!important;text-transform:none!important;color:#5b6b61!important;white-space:nowrap;vertical-align:middle!important}.sf-mx th.sf-c{text-align:center;white-space:normal;line-height:1.2}
  .sf-mx .sf-g{background:#cfe9d4}.sf-mx .sf-y{background:#fbe7a6}.sf-mx .sf-o{background:#f7c08a}.sf-mx .sf-r{background:#f2a39c}.sf-mx td.sf-sel{outline:2.5px solid #121a2c;outline-offset:-2px}
  .sf-note{background:#f4f8f2;border-left:3px solid #2e8540;padding:6px 9px;font-size:11.5px;margin-top:6px}.rp-sess.sf-open{background:#c0362c}
  .rp-page.km .sf-chk i{flex-basis:13px;width:13px;height:13px}`;
  SCREENS.safety = (u) => {
    const rows = db.safety.filter((s) => inScope(u, s.project_id)).filter(byProjectFilter).filter((s) => matchSearch(s, ["description", "rec_type"])).sort((a, b) => String(b.rec_date).localeCompare(String(a.rec_date)));
    const open = rows.filter((s) => s.status === "Open").length;
    return `<h1>Safety</h1><div class="alert info">Every record needs a photo, image or PDF. Near misses and incidents stay open until a PM, the Site Manager or a site engineer closes them with proof of the correction.</div>
      <div class="tiles"><div class="tile"><small>Toolbox talks (30 days)</small><b>${rows.filter((s) => s.rec_type === "Toolbox talk" && daysSince(s.rec_date) <= 30).length}</b></div>
      <div class="tile ${open ? "warn" : ""}"><small>Open near misses / incidents</small><b>${open}</b></div></div>
      ${toolbar(u, { buttons: can(u, "safety", "edit") ? btn("New record", () => newSafety(u), "primary") : "" })}
      ${table([{ label: "Date", get: (s) => fmtDate(s.rec_date) }, { label: "Type", get: (s) => esc(s.rec_type) }, { label: "Description", get: (s) => esc(s.description) },
        { label: "Project", get: (s) => esc(projLabel(s.project_id)) }, { label: "Severity", get: (s) => badge(s.severity) }, { label: "Status", get: (s) => badge(s.status) }], rows, openSafety)}`;
  };

  // ================= SITE VISIT REPORTS (SVR) =================
  // A visit to a possible new job (new client, renovation or new construction). Not part of a project.
  // When the job is won, one tap turns the SVR into a new project and the SVR stays linked as its first site report.
  // Everyone can use it except the Finance and Procurement teams.
  const SVR_STATUS = ["Lead", "Quoted", "Won", "Lost"];
  const SVR_WORK = ["New construction", "Renovation", "Fit-out", "MEP upgrade", "Assessment only"];
  const SVR_COND = ["Good", "Fair", "Poor", "None"];
  const SVR_CONSTRAINTS = [["truck", "Truck access"], ["crane", "Crane possible"], ["parking", "Parking nearby"], ["neighbours", "Neighbours close: noise/dust control"],
    ["power", "EDC power available"], ["power3", "3-phase power"], ["water", "City water"], ["sewer", "Sewer connection"], ["hours", "Work hours limited by Sangkat"]];
  const SVR_DECISION = [["Go", "Go: prepare quotation"], ["More info", "Need more information"], ["No", "Not for GID"]];
  const svrAccess = (u) => isSysAdmin(u) || (can(u, "svr", "view") && !hasTag(u, "PROC") && groupsOf(u)[0] !== "FIN");
  const svrCanEdit = (u, v) => svrAccess(u) && can(u, "svr", "edit") && (!v || v.author_id === u.id || split(v.visited_by).includes(u.id) || can(u, "svr", "approve"));
  const svrVisitors = (v) => split(v.visited_by).map((id) => byId("staff", id)).filter(Boolean);
  function nextSvrNo() {
    const y = today().slice(0, 4), re = new RegExp("^SVR-" + y + "-(\\d+)$");
    const n = Math.max(0, ...db.site_visits.map((v) => { const m = String(v.svr_no || "").match(re); return m ? Number(m[1]) : 0; }));
    return "SVR-" + y + "-" + String(n + 1).padStart(4, "0");
  }
  const svrValue = (v) => v.quote_value || v.est_value || 0;
  function newSvr(u, v) {
    const isNew = !v; v = v || {};
    const f = {
      client: v.client || "", contact_name: v.contact_name || "", contact_phone: v.contact_phone || "", contact_telegram: v.contact_telegram || "", address: v.address || "", city: v.city || "Phnom Penh",
      visit_date: v.visit_date || today(), time_from: v.time_from || nowHM(), time_to: v.time_to || "", visited_by: split(v.visited_by || u.id), lead_source: v.lead_source || "", work_type: v.work_type || "Renovation",
      requirements: v.requirements || "", budget_min: v.budget_min || "", budget_max: v.budget_max || "", timeline: v.timeline || "", scopes: (v.scopes || []).slice(),
      conditions: (v.conditions || []).map((x) => Object.assign({}, x)), constraints: (v.constraints || []).slice(), plot_size: v.plot_size || "", floors: v.floors || "", floor_height: v.floor_height || "", floor_area: v.floor_area || "",
      risks: v.risks || "", opportunities: v.opportunities || "", photos: (v.photos || []).slice(), captions: (v.captions || []).slice(), decision: v.decision || "Go", est_value: v.est_value || "", proposed_team: v.proposed_team || "",
      actions: (v.actions && v.actions.length ? v.actions : [{ action: "Quotation to client", who: "", by: "" }]).map((x) => Object.assign({}, x)), quote_due: v.quote_due || ""
    };
    const inp = (k, label, opt) => { opt = opt || {}; return `<label class="field${opt.cls ? " " + opt.cls : ""}"><span>${label}${opt.req ? " *" : ""}</span><input data-k="${k}" ${opt.type ? `type="${opt.type}"` : ""} ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ""} ${opt.mode ? `inputmode="${opt.mode}"` : ""} value="${esc(f[k])}"></label>`; };
    const area = (k, label, ph) => `<label class="field"><span>${label}</span><textarea data-k="${k}" rows="3" ${ph ? `placeholder="${esc(ph)}"` : ""}>${esc(f[k])}</textarea></label>`;
    const sel = (k, label, opts) => `<label class="field"><span>${label}</span><select data-k="${k}">${opts.map((o) => { const [val, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${f[k] === val ? "selected" : ""}>${esc(t)}</option>`; }).join("")}</select></label>`;
    const people = staffNow().filter((s) => svrAccess(s)).sort(orgSort);
    const condRows = () => f.scopes.length ? `<table class="scopet edit svrcond"><thead><tr><th>Scope</th><th>Condition</th><th>Notes</th></tr></thead><tbody>${f.scopes.map((k) => { const c = f.conditions.find((x) => x.scope === k) || { scope: k, cond: "", note: "" };
        return `<tr data-scope="${esc(k)}"><td><b>${esc(k)}</b></td><td><select class="c-cond"><option value="">–</option>${SVR_COND.map((o) => `<option ${c.cond === o ? "selected" : ""}>${o}</option>`).join("")}</select></td><td><input class="c-note" value="${esc(c.note || "")}" placeholder="What did you see?"></td></tr>`; }).join("")}</tbody></table>` : '<p class="muted small">Choose the scope above first.</p>';
    const actRows = () => f.actions.map((a, i) => `<div class="svract" data-i="${i}"><input class="a-act" placeholder="Action" value="${esc(a.action || "")}"><select class="a-who"><option value="">Who</option>${people.map((s) => `<option value="${s.id}" ${a.who === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select><input class="a-by" type="date" value="${esc(a.by || "")}"><button type="button" class="rm" data-arm="${i}" aria-label="Remove action">×</button></div>`).join("");
    const photosHtml = () => `<div class="capgrid">${f.photos.map((p, i) => `<div class="cap"><span class="ph"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="rm" data-prm="${i}" aria-label="Remove photo">×</button></span><input data-cap="${i}" placeholder="Caption for photo ${i + 1}" value="${esc(f.captions[i] || "")}"></div>`).join("")}</div>`;
    const sec = (n, t) => `<h4 class="svrh"><i>${n}</i>${t}</h4>`;
    const html = `<form id="svform" novalidate>
      <p class="muted small">${isNew ? "Report number is given when you save: " + esc(nextSvrNo()) : esc(v.svr_no)} · Option B: Site Visit &amp; Survey Report</p>
      ${sec(1, "Visit details")}<div class="grid2f">${inp("client", "Client / prospect", { req: 1, ph: "Company or owner name" })}${inp("contact_name", "Contact person")}${inp("contact_phone", "Contact phone", { req: 1, mode: "tel", ph: "012 345 678" })}${inp("contact_telegram", "Telegram", { ph: "@username" })}</div>
      ${inp("address", "Site address", { req: 1, ph: "Street, Sangkat, Khan, city" })}<div class="grid2f">${inp("city", "City / province")}${sel("work_type", "Type of work", SVR_WORK)}</div>
      ${locationField({ lat: v.lat, lng: v.lng })}
      <div class="grid3f">${inp("visit_date", "Visit date", { type: "date", req: 1 })}${inp("time_from", "From", { type: "time" })}${inp("time_to", "To", { type: "time" })}</div>
      <fieldset class="pickset"><legend>Visited by *</legend><div class="pickgrid">${people.map((s) => `<label class="pick"><input type="checkbox" name="vby" value="${s.id}" ${f.visited_by.includes(s.id) ? "checked" : ""}>${avatar(s)}<span><b>${esc(s.name)}</b><small>${esc(s.title)}</small></span></label>`).join("")}</div></fieldset>
      ${inp("lead_source", "Lead source", { ph: "Referral, Facebook, tender, past client…" })}
      ${sec(2, "Client requirements")}${area("requirements", "What the client wants *", "Use of the building, size, special needs")}
      <div class="grid3f">${inp("budget_min", "Budget from (USD)", { type: "number", mode: "numeric" })}${inp("budget_max", "Budget to (USD)", { type: "number", mode: "numeric" })}${inp("timeline", "Wanted timeline", { ph: "Start / finish" })}</div>
      ${scopePicker(f.scopes)}
      ${sec(3, "Existing condition by scope")}<div id="sv-cond">${condRows()}</div>
      ${sec(4, "Site constraints")}<div class="pickgrid svrcons">${SVR_CONSTRAINTS.map(([k, t]) => `<label class="pick"><input type="checkbox" name="cons" value="${k}" ${f.constraints.includes(k) ? "checked" : ""}><span><b>${t}</b></span></label>`).join("")}</div>
      ${sec(5, "Rough measurements")}<div class="grid2f">${inp("plot_size", "Plot", { ph: "4.2 m x 18 m" })}${inp("floors", "Floors", { ph: "3 + roof" })}${inp("floor_height", "Floor-to-floor height", { ph: "3.6 m" })}${inp("floor_area", "Total floor area", { ph: "about 230 m2" })}</div>
      ${sec(6, "Risks and opportunities")}${area("risks", "Risks")}${area("opportunities", "Opportunities")}
      ${sec(7, "Photo log *")}<div class="field"><label class="btn"><input type="file" accept="image/*" capture="environment" id="sv-cam" hidden>${svgI("camera")} Take photo</label> <label class="btn"><input type="file" accept="image/*" multiple id="sv-ph" hidden>Choose photos</label><div id="sv-photos">${photosHtml()}</div><small class="help">At least one photo. Write a short caption under each; captions go into the PDF.</small></div>
      ${sec(8, "Recommendation")}${sel("decision", "Go / no-go", SVR_DECISION)}<div class="grid2f">${inp("est_value", "Estimated value (USD)", { type: "number", mode: "numeric" })}${inp("quote_due", "Quotation due", { type: "date" })}</div>${inp("proposed_team", "Proposed team if awarded", { ph: "PM, QS, design, site" })}
      ${sec(9, "Follow-up actions")}<div id="sv-acts">${actRows()}</div><button type="button" class="btn small" id="sv-addact">+ Add action</button>
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">${isNew ? "Save site visit" : "Save changes"}</button></div></form>`;
    openModal(isNew ? "New site visit" : "Edit · " + v.svr_no, html, (m) => {
      const form = m.querySelector("#svform");
      wireLocation(m); wireScopePicker(m);
      const readCond = () => m.querySelectorAll(".svrcond tr[data-scope]").forEach((tr) => { const k = tr.dataset.scope; let c = f.conditions.find((x) => x.scope === k); if (!c) { c = { scope: k }; f.conditions.push(c); } c.cond = tr.querySelector(".c-cond").value; c.note = tr.querySelector(".c-note").value; });
      const readActs = () => m.querySelectorAll(".svract").forEach((d) => { const a = f.actions[d.dataset.i]; a.action = d.querySelector(".a-act").value; a.who = d.querySelector(".a-who").value; a.by = d.querySelector(".a-by").value; });
      const paintCond = () => { readCond(); f.scopes = pickedScopes(form); m.querySelector("#sv-cond").innerHTML = condRows(); translateNow(m.querySelector("#sv-cond")); };
      const paintActs = () => { m.querySelector("#sv-acts").innerHTML = actRows(); m.querySelectorAll("[data-arm]").forEach((b) => b.onclick = () => { readActs(); f.actions.splice(Number(b.dataset.arm), 1); paintActs(); }); translateNow(m.querySelector("#sv-acts")); };
      const paintPh = () => { m.querySelector("#sv-photos").innerHTML = photosHtml();
        m.querySelectorAll("[data-prm]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.prm); f.photos.splice(i, 1); f.captions.splice(i, 1); paintPh(); });
        m.querySelectorAll("[data-cap]").forEach((x) => x.oninput = () => { f.captions[Number(x.dataset.cap)] = x.value; }); translateNow(m.querySelector("#sv-photos")); };
      const addPh = async (e) => { for (const file of e.target.files) { try { f.photos.push(await compressImage(file)); f.captions.push(""); } catch (x) { toast("Could not read a photo", true); } } e.target.value = ""; paintPh(); };
      m.querySelector("#sv-cam").onchange = addPh; m.querySelector("#sv-ph").onchange = addPh; paintPh(); paintActs();
      form.addEventListener("input", (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) f[k] = e.target.value; });
      form.addEventListener("change", (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) f[k] = e.target.value; if (e.target.name === "scope" || e.target.classList.contains("sc-full")) paintCond(); });
      m.querySelector("#sv-addact").onclick = () => { readActs(); f.actions.push({ action: "", who: "", by: "" }); paintActs(); };
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); readCond(); readActs();
        f.scopes = pickedScopes(form); f.visited_by = [...form.querySelectorAll('input[name="vby"]:checked')].map((x) => x.value); f.constraints = [...form.querySelectorAll('input[name="cons"]:checked')].map((x) => x.value);
        const miss = [!f.client.trim() && "client", !f.contact_phone.trim() && "contact phone", !f.address.trim() && "site address", !f.visit_date && "visit date", !f.visited_by.length && "who visited", !f.requirements.trim() && "what the client wants", !f.scopes.length && "scope", !f.photos.length && "at least one photo"].filter(Boolean);
        if (miss.length) { toast("Please fill in: " + miss.join(", ") + ".", true); return; }
        const ll = parseLatLng(form.querySelector("#site_loc").value);
        if (!ll) { toast("Please set the site location (GPS pin): tap “Use my location” or paste the map link.", true); return; }
        const b = form.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Saving…";
        try {
          const photos = await storeFiles(f.photos, "svr");
          const row = Object.assign({}, f, { visited_by: f.visited_by.join(","), photos, captions: f.photos.map((_, i) => (f.captions[i] || "").trim()), conditions: f.conditions.filter((c) => f.scopes.includes(c.scope) && (c.cond || c.note)),
            actions: f.actions.filter((a) => (a.action || "").trim()).map((a) => Object.assign({ done: false }, a)), budget_min: Number(f.budget_min) || null, budget_max: Number(f.budget_max) || null, est_value: Number(f.est_value) || null,
            quote_due: f.quote_due || null, lat: ll ? ll.lat : null, lng: ll ? ll.lng : null });
          if (isNew) { row.svr_no = nextSvrNo(); row.status = "Lead"; row.author_id = u.id; await save("site_visits", row, (r) => r.svr_no + " site visit: " + r.client); toast(row.svr_no + " saved"); }
          else { await patch("site_visits", v.id, row, v.svr_no + " updated"); toast(v.svr_no + " updated"); }
          closeModal(); render();
        } catch (err) { b.disabled = false; b.textContent = "Save"; toast(err.message || String(err), true); }
      });
    });
  }
  function svrSetStatus(v, status) {
    const u = me();
    if (status === "Quoted") return formModal("Quotation sent · " + v.svr_no, [{ name: "quote_value", label: "Quotation value (USD)", type: "number", required: true, value: v.quote_value || v.est_value || "" }],
      async (x) => { await patch("site_visits", v.id, { status: "Quoted", quote_value: Number(x.quote_value) || null }, v.svr_no + " quotation sent: " + money(x.quote_value)); }, "Save");
    if (status === "Lost") return formModal("Lost · " + v.svr_no, [{ name: "lost_reason", label: "Why did we lose it?", type: "textarea", required: true }],
      async (x) => { await patch("site_visits", v.id, { status: "Lost", lost_reason: x.lost_reason }, v.svr_no + " lost: " + x.lost_reason); }, "Save");
    if (status === "Lead") return patch("site_visits", v.id, { status: "Lead" }, v.svr_no + " back to lead").then(() => { closeModal(); render(); });
    if (status === "Won") {
      const pms = inGroup("PM");
      return formModal("Won · make project from " + v.svr_no, [
        { name: "code", label: "Project code", required: true, value: "DEMO-1" + String(db.projects.length + 1).padStart(2, "0") },
        { name: "name", label: "Project name", required: true, value: (v.work_type || "Project") + " · " + String(v.client).replace(/\s*\(.*\)$/, "") },
        { name: "pm_id", label: "Project Manager", type: "select", options: staffOptions(pms), required: true },
        { name: "start_date", label: "Start", type: "date" }, { name: "end_date", label: "Finish", type: "date" },
        { name: "contract_value", label: "Contract value (USD)", type: "number", value: v.quote_value || v.est_value || "" }
      ], async (x) => {
        if (!hasSitePin(v)) throw new Error("This site visit has no GPS pin. Edit the SVR and set the site location first.");
        const p = await save("projects", Object.assign(x, { client: v.client, location: v.city || "", lat: v.lat, lng: v.lng, status: "Active", progress: 0, budget: null, scopes: defaultShares(v.scopes && v.scopes.length ? v.scopes : ["Architecture"]) }), "New project " + x.code + " from " + v.svr_no);
        await patch("site_visits", v.id, { status: "Won", project_id: p.id }, v.svr_no + " won: project " + x.code);
        toast(x.code + " created from " + v.svr_no);
      }, "Create project");
    }
  }
  function openSvr(v) {
    const u = me(), acts = [];
    if (svrCanEdit(u, v) && v.status !== "Won") acts.push(btn("Edit", () => newSvr(u, v)));
    if (svrCanEdit(u, v)) {
      if (v.status === "Lead") acts.push(btn("Quotation sent", () => svrSetStatus(v, "Quoted")));
      if (["Lead", "Quoted"].includes(v.status)) { acts.push(btn("Lost", () => svrSetStatus(v, "Lost"), "danger")); if (canManageProject(u)) acts.push(btn("Won: make project", () => svrSetStatus(v, "Won"), "primary")); }
      if (v.status === "Lost") acts.push(btn("Reopen", () => svrSetStatus(v, "Lead")));
    }
    if (hasTag(u, "MD") && !v.approved_by) acts.push(btn("Approve report", async () => { await patch("site_visits", v.id, { approved_by: u.id, approved_at: nowIso() }, v.svr_no + " approved by " + u.name); closeModal(); render(); }, "primary"));
    acts.push(btn("PDF English", () => svrPdf(v, "en")) + btn("PDF ខ្មែរ", () => svrPdf(v, "km")));
    const p = v.project_id ? byId("projects", v.project_id) : null;
    const cons = (v.constraints || []).map((k) => (SVR_CONSTRAINTS.find((c) => c[0] === k) || [k, k])[1]);
    const condT = (v.conditions || []).length ? `<table class="scopet"><thead><tr><th>Scope</th><th>Condition</th><th>Notes</th></tr></thead><tbody>${v.conditions.map((c) => `<tr><td><b>${esc(c.scope)}</b></td><td>${c.cond ? badge(c.cond) : ""}</td><td>${esc(c.note || "")}</td></tr>`).join("")}</tbody></table>` : '<p class="muted small">Not recorded.</p>';
    const actT = (v.actions || []).length ? `<ul class="hist svracts">${v.actions.map((a, i) => `<li><label class="check"><input type="checkbox" data-done="${i}" ${a.done ? "checked" : ""} ${can(u, "svr", "edit") ? "" : "disabled"}> <span><b>${esc(a.action)}</b> <small>${esc(staffName(a.who))}${a.by ? " · by " + esc(fmtDate(a.by)) : ""}</small></span></label></li>`).join("")}</ul>` : '<p class="muted small">None.</p>';
    detail(v.svr_no + " · " + v.client, [["Status", badge(v.status) + (p ? ` → <a href="#" data-act="${act(() => openProject(p))}">${esc(p.code)}</a>` : "") + (v.approved_by ? ` <span class="tag ok">Approved by ${esc(staffName(v.approved_by))}</span>` : "")],
      ["Contact", esc([v.contact_name, v.contact_phone, v.contact_telegram].filter(Boolean).join(" · "))], ["Site", esc(v.address) + (hasSitePin(v) ? ` · <a href="https://maps.google.com/?q=${v.lat},${v.lng}" target="_blank" rel="noopener">open map</a>` : "")],
      ["Visit", fmtDate(v.visit_date) + " · " + esc([v.time_from, v.time_to].filter(Boolean).join("–"))], ["Visited by", esc(svrVisitors(v).map((s) => s.name).join(", "))], ["Type of work", esc(v.work_type)], ["Lead source", esc(v.lead_source)],
      ["Client wants", esc(v.requirements)], ["Budget", v.budget_min || v.budget_max ? esc(money(v.budget_min || 0) + " – " + money(v.budget_max || 0)) : ""], ["Timeline", esc(v.timeline)], ["Scope", esc((v.scopes || []).join(", "))],
      ["Site constraints", esc(cons.join(", "))], ["Measurements", esc([v.plot_size && "Plot " + v.plot_size, v.floors && v.floors + " floors", v.floor_height && "height " + v.floor_height, v.floor_area].filter(Boolean).join(" · "))],
      ["Risks", esc(v.risks)], ["Opportunities", esc(v.opportunities)], ["Recommendation", esc((SVR_DECISION.find((d) => d[0] === v.decision) || ["", v.decision || ""])[1]) + (v.est_value ? " · est. " + money(v.est_value) : "")],
      v.quote_value ? ["Quotation", money(v.quote_value) + (v.quote_due ? " · due " + fmtDate(v.quote_due) : "")] : v.quote_due ? ["Quotation due", fmtDate(v.quote_due)] : null, v.lost_reason ? ["Lost because", esc(v.lost_reason)] : null, ["Proposed team", esc(v.proposed_team)]],
      acts.join(""), `<h4>Existing condition by scope</h4>${condT}<h4>Follow-up actions</h4>${actT}<h4>Photo log</h4>${gallery(v.photos || [], "", v.captions || [])}`);
    const md = $("#modal"); if (md) { md.querySelector(".modal").classList.add("wide");
      md.querySelectorAll("[data-done]").forEach((cb) => cb.onchange = async () => { const list = (v.actions || []).map((a) => Object.assign({}, a)); list[cb.dataset.done].done = cb.checked; await patch("site_visits", v.id, { actions: list }, v.svr_no + ": " + list[cb.dataset.done].action + (cb.checked ? " done" : " reopened")); }); }
  }
  SCREENS.svr = (u) => {
    if (!svrAccess(u)) return `<h1>Site visits</h1>${empty("You do not have access to site visit reports.")}`;
    const all = db.site_visits.slice().sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)) || String(b.svr_no).localeCompare(String(a.svr_no)));
    const T = tabs("svr", [["open", "Open leads"], ["all", "All"], ["Won", "Won"], ["Lost", "Lost"]]);
    const rows = all.filter((v) => T.cur === "all" ? true : T.cur === "open" ? ["Lead", "Quoted"].includes(v.status) : v.status === T.cur).filter((v) => matchSearch(v, ["svr_no", "client", "address", "contact_name"]));
    const y = today().slice(0, 4), done = all.filter((v) => ["Won", "Lost"].includes(v.status) && String(v.visit_date).startsWith(y));
    const due = all.filter((v) => v.status === "Lead" && v.quote_due && daysUntil(v.quote_due) <= 7);
    return `<h1>Site visits</h1><p class="muted">Site Visit Reports (SVR) for possible new jobs. When a job is won, make it a project in one tap.</p>
      <div class="tiles"><div class="tile"><small>Open leads</small><b>${all.filter((v) => v.status === "Lead").length}</b></div><div class="tile ${due.length ? "warn" : ""}"><small>Quotations due in 7 days</small><b>${due.length}</b></div>
      <div class="tile"><small>Quoted, waiting</small><b>${all.filter((v) => v.status === "Quoted").length}</b></div><div class="tile"><small>Won ${y} (win rate)</small><b>${done.filter((v) => v.status === "Won").length} <small>${done.length ? Math.round(done.filter((v) => v.status === "Won").length * 100 / done.length) + "%" : ""}</small></b></div></div>
      ${T.html}${toolbar(u, { project: false, buttons: can(u, "svr", "edit") ? btn("New site visit", () => newSvr(u), "primary") : "" })}
      ${table([{ label: "No.", get: (v) => `<small>${esc(v.svr_no)}</small>` }, { label: "Client", get: (v) => `<b>${esc(v.client)}</b><br><small>${esc(v.address)}</small>` }, { label: "Visit", get: (v) => fmtDate(v.visit_date) },
        { label: "Type", get: (v) => esc(v.work_type) }, { label: "Scope", get: (v) => `<small>${esc((v.scopes || []).join(", "))}</small>` }, { label: "Value", get: (v) => svrValue(v) ? money(svrValue(v)) : "" },
        { label: "Status", get: (v) => badge(v.status) + (v.project_id ? ` <small>${esc(projLabel(v.project_id))}</small>` : "") }], rows, openSvr)}`;
  };
  function svrDashCard() {
    const all = db.site_visits, open = all.filter((v) => ["Lead", "Quoted"].includes(v.status)), y = today().slice(0, 4);
    const won = all.filter((v) => v.status === "Won" && String(v.visit_date).startsWith(y)), lost = all.filter((v) => v.status === "Lost" && String(v.visit_date).startsWith(y));
    const recent = all.slice().sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date))).slice(0, 4);
    return `<section class="card c4 svrcard"><div class="card-head"><h2>Site visits</h2><a class="link" href="#svr">View all</a></div>
      <div class="svrstats"><div><b>${open.length}</b><small>Open leads</small></div><div><b>${money(open.reduce((a, v) => a + svrValue(v), 0))}</b><small>Pipeline value</small></div><div><b>${won.length}/${won.length + lost.length}</b><small>Won ${y}</small></div></div>
      <ul class="hist">${recent.map((v) => `<li data-act="${act(() => openSvr(v))}" class="click"><b>${esc(v.svr_no)}</b> ${esc(v.client)} ${badge(v.status)}<small>${esc(fmtDate(v.visit_date))} · ${esc(v.work_type)}</small></li>`).join("") || "<li>No site visits yet.</li>"}</ul></section>`;
  }
  // ---------- SVR PDF (Option B: Site Visit & Survey Report) ----------
  const SVT = {
    en: { title: "Site Visit & Survey Report", form: "Form GID-SVR-B", details: "Visit details", client: "Client / prospect", contact: "Contact", address: "Site address", gps: "GPS pin", visit: "Visit date / time", by: "Visited by",
      source: "Lead source", work: "Type of work", req: "Client requirements", wants: "What the client wants", budget: "Budget range", timeline: "Wanted timeline", scope: "Scope asked", cond: "Existing condition by scope",
      cScope: "Scope", cCond: "Condition", cNote: "Notes", cons: "Site constraints", meas: "Rough measurements", plot: "Plot", floors: "Floors", height: "Floor-to-floor", area: "Total floor area", risks: "Risks and opportunities",
      risk: "Risks", opp: "Opportunity", photos: "Photo log", rec: "Recommendation", go: "Go / no-go", est: "Estimated value", team: "Proposed team if awarded", acts: "Follow-up actions", aAct: "Action", aWho: "Who", aBy: "By", aSt: "Status",
      open: "Open", done: "Done", conv: "When the job is awarded: the system turns this SVR into a new project (client, site pin, scope and photos copied), and the SVR stays linked as the first site report.",
      convDone: (c) => "Awarded: this SVR became project " + c + ".", sign: "Sign-off", sVisit: "Visited by", sQs: "QS / estimator", sAppr: "Approved by", sClient: "Client (optional)", sig: "Signature / date", md: "Managing Director",
      recorded: "recorded on site", none: "—", status: { Lead: "LEAD", Quoted: "QUOTED", Won: "WON", Lost: "LOST" }, due: "QUOTE DUE",
      condMap: {}, workMap: {}, decMap: { Go: "Go: prepare quotation", "More info": "Need more information", No: "Not for GID" }, consMap: Object.fromEntries(SVR_CONSTRAINTS),
      generated: "GID Management System · generated", page: (a, b) => "Page " + a + " of " + b, cont: "continued", lost: "Lost because" },
    km: { title: "របាយការណ៍ចុះពិនិត្យ និងស្ទង់ទីតាំង", form: "ទម្រង់ GID-SVR-B", details: "ព័ត៌មានការចុះពិនិត្យ", client: "អតិថិជន", contact: "ទំនាក់ទំនង", address: "អាសយដ្ឋានទីតាំង", gps: "ចំណុច GPS", visit: "កាលបរិច្ឆេទ / ម៉ោង", by: "ចុះពិនិត្យដោយ",
      source: "ប្រភពអតិថិជន", work: "ប្រភេទការងារ", req: "តម្រូវការអតិថិជន", wants: "អ្វីដែលអតិថិជនចង់បាន", budget: "ថវិកាប្រហាក់ប្រហែល", timeline: "ពេលវេលាដែលចង់បាន", scope: "វិសាលភាពដែលស្នើ", cond: "ស្ថានភាពបច្ចុប្បន្នតាមផ្នែក",
      cScope: "ផ្នែក", cCond: "ស្ថានភាព", cNote: "កំណត់ចំណាំ", cons: "លក្ខខណ្ឌទីតាំង", meas: "ការវាស់វែងប្រហាក់ប្រហែល", plot: "ដី", floors: "ជាន់", height: "កម្ពស់ជាន់", area: "ផ្ទៃក្រឡាសរុប", risks: "ហានិភ័យ និងឱកាស",
      risk: "ហានិភ័យ", opp: "ឱកាស", photos: "រូបថត", rec: "អនុសាសន៍", go: "សម្រេចចិត្ត", est: "តម្លៃប៉ាន់ស្មាន", team: "ក្រុមដែលស្នើ បើទទួលបានការងារ", acts: "សកម្មភាពបន្ត", aAct: "សកម្មភាព", aWho: "អ្នកទទួលខុសត្រូវ", aBy: "ត្រឹម", aSt: "ស្ថានភាព",
      open: "មិនទាន់", done: "រួចរាល់", conv: "ពេលទទួលបានការងារ៖ ប្រព័ន្ធបង្កើតគម្រោងថ្មីពី SVR នេះ (អតិថិជន ទីតាំង វិសាលភាព និងរូបថត) ហើយ SVR ក្លាយជារបាយការណ៍ទីតាំងដំបូងរបស់គម្រោង។",
      convDone: (c) => "ទទួលបានការងារ៖ SVR នេះបានក្លាយជាគម្រោង " + c + "។", sign: "ហត្ថលេខា", sVisit: "ចុះពិនិត្យដោយ", sQs: "QS / អ្នកប៉ាន់ស្មាន", sAppr: "អនុម័តដោយ", sClient: "អតិថិជន (មិនចាំបាច់)", sig: "ហត្ថលេខា / កាលបរិច្ឆេទ", md: "នាយកគ្រប់គ្រង",
      recorded: "កត់ត្រានៅទីតាំង", none: "—", status: { Lead: "អតិថិជនសក្តានុពល", Quoted: "បានផ្ញើតារាងតម្លៃ", Won: "ទទួលបានការងារ", Lost: "មិនបានការងារ" }, due: "ផុតកំណត់តារាងតម្លៃ",
      condMap: { Good: "ល្អ", Fair: "មធ្យម", Poor: "ខ្សោយ", None: "គ្មាន" }, workMap: { "New construction": "សាងសង់ថ្មី", Renovation: "ជួសជុលកែលម្អ", "Fit-out": "តុបតែងខាងក្នុង", "MEP upgrade": "កែលម្អប្រព័ន្ធ MEP", "Assessment only": "វាយតម្លៃតែប៉ុណ្ណោះ" },
      decMap: { Go: "យល់ព្រម៖ រៀបចំតារាងតម្លៃ", "More info": "ត្រូវការព័ត៌មានបន្ថែម", No: "មិនសមស្របសម្រាប់ GID" },
      consMap: { truck: "ឡានធំចូលបាន", crane: "អាចប្រើស្ទូច", parking: "មានចំណតក្បែរ", neighbours: "ផ្ទះជិតខាង៖ គ្រប់គ្រងសំឡេង/ធូលី", power: "មានភ្លើង EDC", power3: "ភ្លើង 3 ហ្វាស", water: "ទឹករដ្ឋ", sewer: "ភ្ជាប់លូក្រុង", hours: "ម៉ោងការងារកំណត់ដោយសង្កាត់" },
      generated: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·", page: (a, b) => "ទំព័រ " + a + "/" + b, cont: "បន្ត", lost: "មូលហេតុមិនបាន" }
  };
  async function svrPdf(v, lang) {
    const L = SVT[lang], tr = pdfTr(lang), T = (m, x) => esc((m && m[x]) || tr(x || "")), vis = svrVisitors(v), qs = vis.find((s) => groupsOf(s).includes("QS")), md = withTag("MD")[0] || {};
    const tick = sfTick;
    const proj = v.project_id ? byId("projects", v.project_id) : null;
    const blocks = [
      `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.client}</th><td>${esc(v.client)}</td><th>${L.contact}</th><td>${esc([v.contact_name, v.contact_phone, v.contact_telegram].filter(Boolean).join(" · "))}</td></tr>
        <tr><th>${L.address}</th><td>${esc(v.address)}</td><th>${L.gps}</th><td>${hasSitePin(v) ? esc(Number(v.lat).toFixed(5) + ", " + Number(v.lng).toFixed(5)) + " · " + L.recorded : L.none}</td></tr>
        <tr><th>${L.visit}</th><td>${esc(rDate(v.visit_date, lang))} · ${esc([v.time_from, v.time_to].filter(Boolean).join("–"))}</td><th>${L.by}</th><td>${esc(vis.map((s) => s.name).join(", "))}</td></tr>
        <tr><th>${L.source}</th><td>${v.lead_source ? esc(tr(v.lead_source)) : L.none}</td><th>${L.work}</th><td>${T(L.workMap, v.work_type)}</td></tr></table>`,
      `<h2><i>2</i>${L.req}</h2><table class="sf-t"><tr><th>${L.wants}</th><td colspan="3">${esc(v.requirements || "")}</td></tr>
        <tr><th>${L.budget}</th><td>${v.budget_min || v.budget_max ? esc(money(v.budget_min || 0) + " – " + money(v.budget_max || 0)) : L.none}</td><th>${L.timeline}</th><td>${esc(v.timeline || L.none)}</td></tr>
        <tr><th>${L.scope}</th><td colspan="3">${SCOPES.map((k) => tick((v.scopes || []).includes(k), esc(tr(k)))).join("")}</td></tr></table>`,
      `<h2><i>3</i>${L.cond}</h2><table class="sf-t sf-cols"><tr><th>${L.cScope}</th><th>${L.cCond}</th><th class="sf-wide">${L.cNote}</th></tr>${(v.conditions || []).map((c) => `<tr><td><b>${esc(tr(c.scope))}</b></td><td><span class="svc svc-${esc(String(c.cond).toLowerCase())}">${T(L.condMap, c.cond)}</span></td><td>${esc(c.note || "")}</td></tr>`).join("") || `<tr><td colspan="3">${L.none}</td></tr>`}</table>`,
      `<h2><i>4</i>${L.cons}</h2><div class="sf-box">${SVR_CONSTRAINTS.map(([k]) => tick((v.constraints || []).includes(k), esc(L.consMap[k]))).join("")}</div>`,
      `<h2><i>5</i>${L.meas}</h2><table class="sf-t"><tr><th>${L.plot}</th><td>${esc(v.plot_size || L.none)}</td><th>${L.floors}</th><td>${esc(v.floors || L.none)}</td></tr><tr><th>${L.height}</th><td>${esc(v.floor_height || L.none)}</td><th>${L.area}</th><td>${esc(v.floor_area || L.none)}</td></tr></table>`,
      `<h2><i>6</i>${L.risks}</h2><div class="sf-box"><b>${L.risk}:</b> ${esc(v.risks || L.none)}<br><b>${L.opp}:</b> ${esc(v.opportunities || L.none)}</div>`,
      `<h2><i>7</i>${L.rec}</h2><table class="sf-t"><tr><th>${L.go}</th><td>${SVR_DECISION.map(([k]) => tick(v.decision === k, esc(L.decMap[k]))).join("")}</td></tr><tr><th>${L.est}</th><td>${v.est_value ? esc(money(v.est_value)) : L.none}${v.quote_value ? " · " + esc(money(v.quote_value)) : ""}</td></tr>
        <tr><th>${L.team}</th><td>${esc(v.proposed_team || L.none)}</td></tr>${v.lost_reason ? `<tr><th>${L.lost}</th><td>${esc(v.lost_reason)}</td></tr>` : ""}</table>`,
      `<h2><i>8</i>${L.acts}</h2><table class="sf-t sf-cols"><tr><th class="sf-wide">${L.aAct}</th><th>${L.aWho}</th><th>${L.aBy}</th><th>${L.aSt}</th></tr>${(v.actions || []).map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(staffName(a.who))}</td><td>${esc(a.by ? rDate(a.by, lang) : "")}</td><td>${a.done ? L.done : L.open}</td></tr>`).join("") || `<tr><td colspan="4">${L.none}</td></tr>`}</table>
        <div class="svconv">${proj ? L.convDone(esc(proj.code + " " + proj.name)) : L.conv}</div>`,
      `<h2><i>9</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.sVisit}</small><b>${esc((byId("staff", v.author_id) || vis[0] || {}).name || "")}</b><em>${L.sig}</em></div><div><small>${L.sQs}</small><b>${esc(qs ? qs.name : "")}</b><em>${L.sig}</em></div>
        <div><small>${L.sAppr}</small><b>${esc(v.approved_by ? staffName(v.approved_by) : md.name || "")}</b><em>${v.approved_at ? esc(rDate(v.approved_at, lang)) : L.md}</em></div><div><small>${L.sClient}</small><b>${esc(v.contact_name || "")}</b><em>${L.sig}</em></div></div>`];
    sfCss();
    if (!document.getElementById("svr-css")) { const st = document.createElement("style"); st.id = "svr-css"; st.textContent = ".svc{font-weight:700;padding:1px 7px;border-radius:4px;font-size:11px}.svc.svc-good{background:#e3f4e8;color:#1a7f42}.svc.svc-fair{background:#fff4d6;color:#8a5a00}.svc.svc-poor{background:#fdeceb;color:#c0362c}.svc.svc-none{background:#eef1ef;color:#5b6b61}.svconv{border:1.5px dashed #2e8540;border-radius:8px;padding:7px 10px;margin-top:8px;background:#f4f8f2;font-size:12px}"; document.head.appendChild(st); }
    const stamp = (L.status[v.status] || v.status) + (v.status === "Lead" && v.quote_due ? " · " + L.due + " " + esc(rDate(v.quote_due, lang)) : "");
    await makePdf({ lang, no: v.svr_no, fileName: v.svr_no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${kmTitle(L.title, lang)}</h1><small>${esc(v.svr_no)} · ${L.form}</small><span class="rp-sess ${v.status === "Lost" ? "sf-open" : ""}">${stamp}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(v.svr_no)} · ${esc(v.client)}</span><span>${L.form}</span></div>`,
      contTitle: L.title + " (" + L.cont + ")", photoTitle: L.photos, blocks,
      photos: (v.photos || []).map((src, i) => ({ src, cap: (i + 1) + " · " + ((v.captions || [])[i] || "") })),
      footLeft: L.generated + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }

  // ================= SHARED for the new modules =================
  const stars = (n) => { n = Math.round(Number(n) || 0); return `<span class="stars" aria-label="${n} of 5">${"★".repeat(n)}<s>${"★".repeat(5 - n)}</s></span>`; };
  const chip = (t, k) => `<span class="chip ${k || "n"}">${esc(t)}</span>`;
  const kpis5 = (list) => `<div class="kp">${list.filter(Boolean).map(([l, v, s, cls]) => `<div><small>${esc(l)}</small><b class="${cls || ""}">${v}</b>${s ? `<small>${s}</small>` : ""}</div>`).join("")}</div>`;
  const stepper = (flow, cur, done) => `<div class="step">${flow.map(([k, l, who], i) => { const ci = flow.findIndex((f) => f[0] === cur); const st = done || i < ci ? "ok" : i === ci ? "cur" : ""; return `<div class="${st}" data-n="${i + 1}">${esc(l)}<br><small>${esc(who)}</small></div>`; }).join("")}</div>`;
  const histList = (h) => (h || []).length ? `<ul class="hist">${h.slice().reverse().map((x) => `<li><small>${esc(fmtDate(x.at))} ${esc(timeOf(x.at))} · ${esc(staffName(x.by))}</small><br><b>${esc(x.action)}</b>${x.note ? " · " + esc(x.note) : ""}</li>`).join("")}</ul>` : "";
  function nextCode(list, field, prefix, pad) { const n = Math.max(0, ...list.map((x) => { const m = String(x[field] || "").match(/(\d+)$/); return String(x[field] || "").startsWith(prefix) && m ? Number(m[1]) : 0; })); return prefix + String(n + 1).padStart(pad || 3, "0"); }
  const projShort = (p) => p ? String(p.code || "").replace(/^[A-Z]+-/, "") : "";
  const sfTick = (on, t) => `<span class="sf-chk"><i class="${on ? "sf-on" : ""}"></i><span>${t}</span></span>`;
  const sfCss = () => { if (!document.getElementById("sf-css")) { const st = document.createElement("style"); st.id = "sf-css"; st.textContent = SF_CSS; document.head.appendChild(st); } };

  // ================= VARIATION ORDERS =================
  // Raised (site/PM) → priced by QS → checked by PM → MD approves the price → sent to the client → client approves (signed copy) → added to an IPC claim
  const VO_FLOW = [["Raised", "Raised", "Site / PM"], ["Priced", "Priced", "QS"], ["PM checked", "Checked", "PM"], ["MD approved", "Price approved", "MD"], ["Sent to client", "Sent to client", "PM"], ["Client approved", "Client approved", "signed copy"], ["In claim", "In claim", "next IPC"]];
  const VO_OK = ["Client approved", "In claim"];
  const voSum = (lines, markup) => Math.round((lines || []).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0) * (1 + (Number(markup) || 0) / 100));
  const voApproved = (pid) => sum(db.variations.filter((v) => v.project_id === pid && VO_OK.includes(v.status)), (v) => v.amount);
  const revisedContract = (p) => Number(p.contract_value || 0) + voApproved(p.id);
  const isQS = (u) => groupsOf(u).includes("QS");
  function voActions(u, v) {
    const pm = isPMof(u, v.project_id) || hasTag(u, "MD"), out = [];
    const pmOnly = isPMof(u, v.project_id) && voLastBy(v, "Priced") !== u.id; // v23 rules: only this project's PM, never the person who priced it
    const step = (label, to, cls, fields, extra) => out.push([label, to, cls, fields, extra]);
    if (["Raised", "Priced"].includes(v.status) && (isQS(u) || isSysAdmin(u))) step(v.status === "Raised" ? "Price it" : "Change price", "price", v.status === "Raised" ? "primary" : "");
    if (v.status === "Priced" && pmOnly) { step("Back to QS", "Raised", "", [{ name: "note", label: "What to change", type: "textarea", required: true }]); step("PM checked", "PM checked", "primary"); }
    if (v.status === "PM checked" && hasTag(u, "MD") && voLastBy(v, "PM checked") !== u.id) { step("Back to QS", "Raised", "", [{ name: "note", label: "What to change", type: "textarea", required: true }]); step("Approve price", "MD approved", "primary"); }
    if (v.status === "MD approved" && (pm || isQS(u))) step("Sent to client", "Sent to client", "primary", [{ name: "client_ref", label: "How it was sent", value: "Email to client", required: true }]);
    if (v.status === "Sent to client" && (pm || isQS(u))) {
      step("Client rejected", "Client rejected", "danger", [{ name: "note", label: "Why did the client reject it?", type: "textarea", required: true }]);
      step("Client approved", "Client approved", "primary", [{ name: "client_evidence", label: "Client signed copy", type: "evidence", required: true, requiredMsg: "Attach the signed VO, the client's email or a photo of the signature.", help: "Required. Signed VO, client email (PDF) or a photo." }, { name: "note", label: "Note" }]);
    }
    if (v.status === "Client approved" && (isQS(u) || pm)) step("Add to claim", "claim", "primary");
    if (["Raised", "Priced", "PM checked"].includes(v.status) && (v.raised_by === u.id || pm)) step("Cancel VO", "Cancelled", "danger", [{ name: "note", label: "Why?", type: "textarea", required: true }]);
    return out;
  }
  const voLastBy = (v, action) => { const h = (v.history || []).filter((x) => x.action === action); return (h[h.length - 1] || {}).by; };
  function voRefusal(u, v, to) {
    if (to === "PM checked" && !isPMof(u, v.project_id)) return RULE_MSG.voPM;
    if ((to === "PM checked" && voLastBy(v, "Priced") === u.id) || (to === "MD approved" && voLastBy(v, "PM checked") === u.id)) return RULE_MSG.twice;
    return voActions(u, v).some((a) => a[1] === to) ? "" : RULE_MSG.notYours;
  }
  async function voMove(v, to, x) {
    const why = voRefusal(me(), byId("variations", v.id) || v, to); if (why) throw new Error(why);
    const u = me(), hist = (v.history || []).concat([{ at: nowIso(), by: u.id, action: to === "Raised" ? "Back to QS" : to === "MD approved" ? "MD approved price" : to, note: (x && (x.note || x.client_ref)) || "" }]);
    const p = { status: to, history: hist };
    if (x && x.client_ref) p.client_ref = x.client_ref;
    if (x && x.client_evidence) p.client_evidence = await storeEvidence(x.client_evidence, "vo-client");
    await patch("variations", v.id, p, v.vo_no + " " + v.title + ": " + to);
  }
  function newVO(u, pid) {
    formModal("New variation", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: pid || state.project },
      { name: "title", label: "What is the change?", required: true, help: "Example: Extra 24 data points, level 3" },
      { name: "reason", label: "Why (who asked, what changed)", type: "textarea", required: true },
      { name: "asked_by", label: "Asked by", type: "select", options: ["Client", "Client (site meeting)", "Client email", "Architect", "Consultant", "Site condition", "GID (our proposal)"] },
      { name: "asked_date", label: "Date asked", type: "date", value: today() },
      { name: "evidence", label: "Photos or files (optional)", type: "evidence", help: "Client email, marked-up drawing or site photos" }
    ], async (x) => {
      const p = byId("projects", x.project_id);
      x.evidence = await storeEvidence(x.evidence || [], "vo");
      await save("variations", Object.assign(x, { vo_no: nextCode(db.variations, "vo_no", "VO-" + projShort(p) + "-"), status: "Raised", lines: [], markup_pct: 5, amount: 0, time_days: 0, client_evidence: [], raised_by: u.id,
        history: [{ at: nowIso(), by: u.id, action: "Raised", note: "" }] }), (r) => r.vo_no + " raised: " + r.title);
    }, "Raise variation");
  }
  function priceVO(v) {
    let lines = (v.lines || []).map((l) => Object.assign({}, l)); if (!lines.length) lines = [{ item: "", qty: 1, unit: "lot", rate: 0 }];
    const rowsHtml = () => lines.map((l, i) => `<div class="voline" data-i="${i}"><label class="cl"><span class="cl-t">Item</span><input class="l-item" placeholder="Item" value="${esc(l.item)}"></label><label class="cl"><span class="cl-t">Qty</span><input class="l-qty num" type="number" step="any" inputmode="decimal" value="${esc(l.qty)}" aria-label="Quantity" placeholder="Qty"></label><label class="cl"><span class="cl-t">Unit</span><input class="l-unit" value="${esc(l.unit)}" aria-label="Unit" placeholder="Unit"></label><label class="cl"><span class="cl-t">Rate $</span><input class="l-rate num" type="number" step="any" inputmode="decimal" value="${esc(l.rate)}" aria-label="Rate USD" placeholder="Rate $"></label><b class="l-amt"></b><button type="button" class="rm" data-rm="${i}" aria-label="Remove line">×</button></div>`).join("");
    openModal("Price · " + v.vo_no, `<form id="voform"><p class="muted small">${esc(v.title)}</p><div class="voline head"><span>Item</span><span>Qty</span><span>Unit</span><span>Rate $</span><span>Amount</span><span></span></div><div id="vo-lines">${rowsHtml()}</div>
      <button type="button" class="btn small" id="vo-add">+ Add line</button>
      <div class="grid3f" style="margin-top:12px"><label class="field"><span>Overhead & profit %</span><input id="vo-mk" type="number" step="any" value="${esc(v.markup_pct == null ? 5 : v.markup_pct)}"></label><label class="field"><span>Extra time (days)</span><input id="vo-days" type="number" value="${esc(v.time_days || 0)}"></label><div class="field"><span>Total variation</span><b id="vo-total" class="vo-total"></b></div></div>
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">Save price</button></div></form>`, (m) => {
      const f = m.querySelector("#voform");
      const read = () => f.querySelectorAll(".voline[data-i]").forEach((r) => { const l = lines[r.dataset.i]; l.item = r.querySelector(".l-item").value; l.qty = Number(r.querySelector(".l-qty").value) || 0; l.unit = r.querySelector(".l-unit").value; l.rate = Number(r.querySelector(".l-rate").value) || 0; r.querySelector(".l-amt").textContent = money(l.qty * l.rate); });
      const calc = () => { read(); f.querySelector("#vo-total").textContent = money(voSum(lines, f.querySelector("#vo-mk").value)); };
      const paint = () => { f.querySelector("#vo-lines").innerHTML = rowsHtml(); f.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { read(); lines.splice(Number(b.dataset.rm), 1); if (!lines.length) lines.push({ item: "", qty: 1, unit: "lot", rate: 0 }); paint(); }); calc(); translateNow(f); };
      f.addEventListener("input", calc); f.querySelector("#vo-add").onclick = () => { read(); lines.push({ item: "", qty: 1, unit: "no", rate: 0 }); paint(); }; paint();
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); read();
        const noName = lines.findIndex((l) => !l.item.trim() && (Number(l.qty) * Number(l.rate)) !== 0);
        if (noName >= 0) { toast("Line " + (noName + 1) + " has a price but no item name. Write what it is, or remove the line.", true); return; }
        const ls = lines.filter((l) => l.item.trim());
        if (!ls.length) { toast("Add at least one priced line.", true); return; }
        const mk = Number(f.querySelector("#vo-mk").value) || 0, amount = voSum(ls, mk);
        try { await patch("variations", v.id, { lines: ls, markup_pct: mk, time_days: Number(f.querySelector("#vo-days").value) || 0, amount, status: "Priced", history: (v.history || []).concat([{ at: nowIso(), by: me().id, action: "Priced", note: money(amount) }]) }, v.vo_no + " priced: " + money(amount));
          closeModal(); render(); toast(v.vo_no + " priced: " + money(amount)); } catch (err) { toast(err.message, true); }
      });
    });
  }
  function voToClaim(v) {
    const open = db.claims.filter((c) => c.project_id === v.project_id && c.status !== "Paid").sort((a, b) => b.ipc_no - a.ipc_no);
    if (!open.length) { toast("There is no open IPC claim for this project. Ask the QS to create the next IPC first.", true); return; }
    formModal("Add to claim · " + v.vo_no, [{ name: "claim_id", label: "IPC claim", type: "select", options: open.map((c) => [c.id, "IPC " + c.ipc_no + " · " + c.period + " · " + c.status]), required: true }], async (x) => {
      const c = byId("claims", x.claim_id);
      await patch("variations", v.id, { status: "In claim", claim_id: c.id, history: (v.history || []).concat([{ at: nowIso(), by: me().id, action: "Added to claim", note: "IPC " + c.ipc_no }]) }, v.vo_no + " added to IPC " + c.ipc_no);
    }, "Add to claim");
  }
  function openVO(v) {
    const u = me(), acts = voActions(u, v).map(([label, to, cls, fields]) => btn(label, () => to === "price" ? priceVO(v) : to === "claim" ? voToClaim(v) : fields ? formModal(label + " · " + v.vo_no, fields, (x) => voMove(v, to, x), label) : voMove(v, to).then(() => { closeModal(); render(); toast(v.vo_no + ": " + to); }, (e) => toast(e.message, true)), cls));
    acts.push(btn("PDF English", () => voPdf(v, "en")) + btn("PDF ខ្មែរ", () => voPdf(v, "km")));
    if (!["In claim", "Client rejected", "Cancelled"].includes(v.status)) acts.push(schedBtn(u, "variations", v, { type: "Meeting", title: v.vo_no + " · " + v.title }));
    const p = byId("projects", v.project_id) || {}, c = v.claim_id ? byId("claims", v.claim_id) : null;
    const lines = (v.lines || []).length ? `<table class="boq"><thead><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${v.lines.map((l) => `<tr><td>${esc(l.item)}</td><td class="r">${esc(l.qty)}</td><td>${esc(l.unit)}</td><td class="r">${money(l.rate)}</td><td class="r">${money(l.qty * l.rate)}</td></tr>`).join("")}
      <tr><td colspan="4">Overhead & profit ${esc(v.markup_pct)}%</td><td class="r">${money(v.amount - sum(v.lines, (l) => l.qty * l.rate))}</td></tr></tbody><tfoot><tr><td colspan="4">Total variation</td><td class="r">${money(v.amount)}</td></tr></tfoot></table>` : '<p class="muted small">Not priced yet. The QS prices it line by line.</p>';
    detail(v.vo_no + " · " + v.title, [["Status", badge(v.status) + (c ? " · IPC " + esc(c.ipc_no) : "")], ["Project", esc(p.code + " " + p.name)], ["Reason", esc(v.reason)], ["Asked by", esc(v.asked_by) + (v.asked_date ? " · " + fmtDate(v.asked_date) : "")],
      ["Time effect", (v.time_days > 0 ? "+" : "") + esc(v.time_days || 0) + " days"], ["Raised by", esc(staffName(v.raised_by))], v.client_ref ? ["Client", esc(v.client_ref)] : null], acts.join(""),
      `${["Client rejected", "Cancelled"].includes(v.status) ? "" : stepper(VO_FLOW, v.status)}<h4>Price</h4>${lines}${(v.evidence || []).length ? `<h4>Evidence</h4>${evidenceHtml(v.evidence)}` : ""}${(v.client_evidence || []).length ? `<h4>Client approval</h4>${evidenceHtml(v.client_evidence)}` : ""}<h4>History</h4>${histList(v.history)}`);
    const md = $("#modal .modal"); if (md) md.classList.add("wide");
  }
  function voTable(rows) {
    return table([{ label: "No.", get: (v) => `<small>${esc(v.vo_no)}</small>` }, { label: "Variation", get: (v) => `<b>${esc(v.title)}</b><br><small>${esc(projLabel(v.project_id))}</small>` }, { label: "Asked by", get: (v) => esc(v.asked_by) },
      { label: "Value", get: (v) => v.amount ? "+" + money(v.amount) : '<span class="muted">pricing…</span>' }, { label: "Days", get: (v) => v.time_days ? "+" + esc(v.time_days) : "—" }, { label: "Status", get: (v) => badge(v.status) },
      { label: "In claim", get: (v) => v.claim_id ? "IPC " + esc((byId("claims", v.claim_id) || {}).ipc_no || "") : "—" }], rows, openVO);
  }
  function voKpis(rows, p) {
    return kpis5([["Approved variations", "+" + money(sum(rows.filter((v) => VO_OK.includes(v.status)), (v) => v.amount)), rows.filter((v) => VO_OK.includes(v.status)).length + " VOs", "g"],
      ["Waiting for client", money(sum(rows.filter((v) => v.status === "Sent to client"), (v) => v.amount)), rows.filter((v) => v.status === "Sent to client").length + " VOs", "o"],
      ["Being priced / checked", String(rows.filter((v) => ["Raised", "Priced", "PM checked", "MD approved"].includes(v.status)).length)],
      ["Rejected", String(rows.filter((v) => v.status === "Client rejected").length)],
      p ? ["Revised contract", money(revisedContract(p)), "was " + money(p.contract_value)] : ["Projects with variations", String(new Set(rows.map((v) => v.project_id)).size)]]);
  }
  SCREENS.vo = (u) => {
    const rows = db.variations.filter((v) => inScope(u, v.project_id)).filter(byProjectFilter).filter((v) => matchSearch(v, ["vo_no", "title", "reason"])).sort((a, b) => String(b.vo_no).localeCompare(String(a.vo_no)));
    const p = state.project ? byId("projects", state.project) : null;
    return `<h1>Variations</h1><p class="muted">Changes to the contract. The QS prices it, the PM checks, the MD approves the price, then it goes to the client. Approved variations go into the next IPC claim.</p>
      ${voKpis(rows, p)}${toolbar(u, { buttons: can(u, "vo", "edit") ? btn("New variation", () => newVO(u), "primary") : "" })}${voTable(rows)}`;
  };
  const VOT = {
    en: { title: "Variation Order", form: "Form GID-VO-01", details: "Details", project: "Project", client: "Client", asked: "Asked by", reason: "Reason for the change", time: "Time effect", days: "days", price: "Price",
      item: "Item", qty: "Qty", unit: "Unit", rate: "Rate (USD)", amt: "Amount (USD)", oh: "Overhead & profit", total: "Total variation", contract: "Contract value", prev: "Approved variations before this one", revised: "Revised contract value with this VO",
      sign: "Approvals", qs: "Priced by (QS)", pm: "Checked by (PM)", md: "Price approved by (MD)", cl: "Approved by the client", sig: "Signature / date", page: (a, b) => "Page " + a + " of " + b, gen: "GID Management System · generated", photos: "Evidence", cont: "continued" },
    km: { title: "លិខិតកែប្រែការងារ (VO)", form: "ទម្រង់ GID-VO-01", details: "ព័ត៌មានលម្អិត", project: "គម្រោង", client: "ម្ចាស់គម្រោង", asked: "ស្នើដោយ", reason: "មូលហេតុនៃការកែប្រែ", time: "ផលប៉ះពាល់ពេលវេលា", days: "ថ្ងៃ", price: "តម្លៃ",
      item: "មុខការងារ", qty: "បរិមាណ", unit: "ឯកតា", rate: "តម្លៃឯកតា (ដុល្លារ)", amt: "ទឹកប្រាក់ (ដុល្លារ)", oh: "ចំណាយទូទៅ និងប្រាក់ចំណេញ", total: "តម្លៃកែប្រែសរុប", contract: "តម្លៃកិច្ចសន្យា", prev: "ការកែប្រែដែលបានអនុម័តមុននេះ", revised: "តម្លៃកិច្ចសន្យាថ្មី រួមទាំង VO នេះ",
      sign: "ការអនុម័ត", qs: "គណនាតម្លៃដោយ (QS)", pm: "ពិនិត្យដោយ (PM)", md: "អនុម័តតម្លៃដោយ (នាយក)", cl: "អនុម័តដោយម្ចាស់គម្រោង", sig: "ហត្ថលេខា / កាលបរិច្ឆេទ", page: (a, b) => "ទំព័រ " + a + "/" + b, gen: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·", photos: "ភស្តុតាង", cont: "បន្ត" }
  };
  async function voPdf(v, lang) {
    const L = VOT[lang], tr = pdfTr(lang), p = byId("projects", v.project_id) || {}, by = (a) => ((v.history || []).filter((h) => h.action === a).slice(-1)[0] || {});
    const prev = sum(db.variations.filter((x) => x.project_id === v.project_id && VO_OK.includes(x.status) && x.id !== v.id), (x) => x.amount);
    const sg = (lab, h) => `<div><small>${lab}</small><b>${esc(h.by ? staffName(h.by) : "")}</b><em>${h.at ? esc(rDate(h.at, lang)) : L.sig}</em></div>`;
    const blocks = [
      `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.client}</th><td>${esc(p.client || "")}</td></tr><tr><th>${L.asked}</th><td>${esc(tr(v.asked_by || ""))}${v.asked_date ? " · " + esc(rDate(v.asked_date, lang)) : ""}</td><th>${L.time}</th><td>${esc((v.time_days > 0 ? "+" : "") + (v.time_days || 0))} ${L.days}</td></tr></table>`,
      `<h2><i>2</i>${L.reason}</h2><div class="sf-box">${esc(v.reason || "")}</div>`,
      `<h2><i>3</i>${L.price}</h2><table class="sf-t sf-cols"><tr><th class="sf-wide">${L.item}</th><th class="sf-num">${L.qty}</th><th>${L.unit}</th><th class="sf-num">${L.rate}</th><th class="sf-num">${L.amt}</th></tr>${(v.lines || []).map((l) => `<tr><td>${esc(l.item)}</td><td class="sf-num">${esc(l.qty)}</td><td>${esc(l.unit)}</td><td class="sf-num">${money(l.rate)}</td><td class="sf-num">${money(l.qty * l.rate)}</td></tr>`).join("")}
        <tr><td colspan="4">${L.oh} ${esc(v.markup_pct || 0)}%</td><td class="sf-num">${money(v.amount - sum(v.lines || [], (l) => l.qty * l.rate))}</td></tr><tr><td colspan="4"><b>${L.total}</b></td><td class="sf-num"><b>${money(v.amount)}</b></td></tr></table>
        <table class="sf-t sf-sum" style="margin-top:6px"><tr><th style="width:60%">${L.contract}</th><td class="sf-num">${money(p.contract_value)}</td></tr><tr><th>${L.prev}</th><td class="sf-num">${money(prev)}</td></tr><tr><th>${L.revised}</th><td class="sf-num"><b>${money(Number(p.contract_value || 0) + prev + Number(v.amount || 0))}</b></td></tr></table>`,
      `<h2><i>4</i>${L.sign}</h2><div class="sf-sign">${sg(L.qs, by("Priced"))}${sg(L.pm, by("PM checked"))}${sg(L.md, by("MD approved price"))}${sg(L.cl, by("Client approved"))}</div>`];
    sfCss();
    await makePdf({ lang, no: v.vo_no, fileName: v.vo_no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${kmTitle(L.title, lang)}</h1><small>${esc(v.vo_no)} · ${L.form}</small><span class="rp-sess ${["Client rejected", "Cancelled"].includes(v.status) ? "sf-open" : ""}">${esc(tr(v.status))}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} · ${esc(v.vo_no)}</span><span>${L.form}</span></div>`, contTitle: L.title + " (" + L.cont + ")", photoTitle: L.photos, blocks,
      photos: (v.evidence || []).concat(v.client_evidence || []).filter((x) => x.type !== "pdf").map((x) => ({ src: x.url, cap: x.name })), footLeft: L.gen + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }

  // ================= SUBCONTRACTORS =================
  // Each subcontractor can have contracts on several projects. Retention is optional (0% = none).
  // Payment certificate: claimed → QS checks (certified) → PM approves → Finance pays (the bill appears in Finance)
  const PC_FLOW = [["Claimed", "Claimed", "site / QS"], ["QS checked", "QS checked", "QS"], ["PM approved", "PM approved", "PM"], ["Paid", "Paid", "Finance"]];
  const contractsOf = (sid) => db.sub_contracts.filter((k) => k.sub_id === sid);
  const paysOf = (kid) => db.sub_payments.filter((x) => x.contract_id === kid);
  const kCertified = (k) => sum(paysOf(k.id).filter((x) => x.status !== "Claimed"), (x) => x.certified);
  const kPaid = (k) => sum(paysOf(k.id).filter((x) => x.status === "Paid"), (x) => x.certified - x.retention_amt);
  // retention held = all retention kept on approved claims minus what was already released (each release makes a retention bill)
  const kRetentionKept = (k) => sum(paysOf(k.id).filter((x) => ["PM approved", "Paid"].includes(x.status)), (x) => x.retention_amt);
  const kRetentionReleased = (k) => sum(db.invoices.filter((i) => i.source_type === "retention" && i.source_id === k.id), (i) => i.amount);
  const kRetention = (k) => Math.max(0, Math.round((kRetentionKept(k) - kRetentionReleased(k)) * 100) / 100);
  const subRating = (sid) => { const r = contractsOf(sid).flatMap((k) => k.ratings || []); return r.length ? sum(r, (x) => (x.quality + x.time + x.safety) / 3) / r.length : 0; };
  const insDays = (s) => s.insurance_until ? Math.floor(daysUntil(s.insurance_until)) : null;
  function subStatusChip(s) {
    const d = insDays(s);
    if (s.status !== "Active") return chip(s.status, "n");
    if (d != null && d < 0) return chip("Insurance expired", "r");
    if (d != null && d <= 30) return chip("Insurance ends " + fmtDate(s.insurance_until), "w");
    return chip("Active", "g");
  }
  function subForm(s) {
    s = s || {};
    formModal(s.id ? "Edit · " + s.name : "Add subcontractor", [
      { name: "name", label: "Company name", required: true, value: s.name || "" }, { name: "trade", label: "Trade", required: true, value: s.trade || "", help: "Example: Electrical, Plumbing, Ceiling" },
      { name: "contact", label: "Contact person", value: s.contact || "" }, { name: "phone", label: "Phone", required: true, value: s.phone || "" }, { name: "telegram", label: "Telegram", value: s.telegram || "" },
      { name: "patent", label: "Patent (business licence)", type: "select", options: [["yes", "Yes"], ["no", "No"]], value: s.patent ? "yes" : "no" }, { name: "vat", label: "VAT registered", type: "select", options: [["yes", "Yes"], ["no", "No"]], value: s.vat ? "yes" : "no" },
      { name: "insurance_until", label: "Insurance valid until", type: "date", value: s.insurance_until || "" }, { name: "status", label: "Status", type: "select", options: ["Active", "On hold", "Blacklisted"], value: s.status || "Active" },
      { name: "notes", label: "Notes", type: "textarea", value: s.notes || "" }
    ], async (x) => {
      x.patent = x.patent === "yes"; x.vat = x.vat === "yes"; x.insurance_until = x.insurance_until || null;
      if (s.id) await patch("subcontractors", s.id, x, "Subcontractor updated: " + x.name); else await save("subcontractors", x, "New subcontractor: " + x.name);
    }, s.id ? "Save" : "Add subcontractor");
  }
  function contractForm(s, k) {
    const u = me(); k = k || {};
    formModal(k.id ? "Edit contract" : "New contract · " + s.name, [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: k.project_id || state.project },
      { name: "scope", label: "Scope of work", required: true, value: k.scope || "" }, { name: "contract_value", label: "Contract value (USD)", type: "number", required: true, value: k.contract_value || "" },
      { name: "retention_pct", label: "Retention", type: "select", options: [["0", "No retention"], ["5", "5%"], ["10", "10%"]], value: String(k.retention_pct == null ? 5 : k.retention_pct), help: "Not every subcontractor has retention. Choose No retention for small teams." },
      { name: "start_date", label: "Start", type: "date", value: k.start_date || today() }, { name: "end_date", label: "Finish", type: "date", value: k.end_date || "" }
    ], async (x) => {
      x.contract_value = Number(x.contract_value) || 0; x.retention_pct = Number(x.retention_pct) || 0; x.end_date = x.end_date || null;
      if (k.id) await patch("sub_contracts", k.id, x, s.name + " contract updated");
      else await save("sub_contracts", Object.assign(x, { sub_id: s.id, status: "Active", ratings: [], retention_released: false }), s.name + " contract on " + projLabel(x.project_id) + ": " + money(x.contract_value));
    }, k.id ? "Save" : "Add contract");
  }
  function newPayment(k) {
    const s = byId("subcontractors", k.sub_id) || {};
    formModal("Payment claim · " + s.name, [
      { name: "period_to", label: "Work done up to", type: "date", value: today(), required: true }, { name: "claimed", label: "Amount claimed by the subcontractor (USD)", type: "number", required: true },
      { name: "evidence", label: "Their claim / measurement (optional)", type: "evidence" }, { name: "note", label: "Note", type: "textarea" }
    ], async (x) => {
      const ev = await storeEvidence(x.evidence || [], "sub-claim");
      await save("sub_payments", { contract_id: k.id, pc_no: nextCode(paysOf(k.id), "pc_no", "PC-", 2), period_to: x.period_to, claimed: Number(x.claimed) || 0, certified: 0, retention_amt: 0, status: "Claimed", note: x.note || "", evidence: ev,
        history: [{ at: nowIso(), by: me().id, action: "Claimed", note: money(x.claimed) }] }, s.name + " payment claim " + money(x.claimed) + " · " + projLabel(k.project_id));
    }, "Save claim");
  }
  function payActions(u, x, k) {
    const pm = isPMof(u, k.project_id) || hasTag(u, "MD"), out = [];
    if (x.status === "Claimed" && (isQS(u) || isSysAdmin(u))) out.push(["QS check", "QS checked", "primary", [{ name: "certified", label: "Amount certified (USD)", type: "number", value: x.claimed, required: true, help: k.retention_pct ? "Retention " + k.retention_pct + "% is kept from this amount." : "No retention on this contract." }, { name: "note", label: "Note", type: "textarea" }]]);
    if (x.status === "QS checked" && pm) { out.push(["Back to QS", "Claimed", "", [{ name: "note", label: "What to check again", type: "textarea", required: true }]]); out.push(["PM approve", "PM approved", "primary", null]); }
    if (x.status === "PM approved" && isFinance(u)) out.push(["Mark paid", "Paid", "primary", null]);
    return out;
  }
  async function payMove(x, k, to, v) {
    const u = me(), s = byId("subcontractors", k.sub_id) || {}, p = { status: to, history: (x.history || []).concat([{ at: nowIso(), by: u.id, action: to, note: (v && v.note) || "" }]) };
    if (!payActions(u, byId("sub_payments", x.id) || x, k).some((a) => a[1] === to)) throw new Error(to === "Paid" ? RULE_MSG.finance : ["PM approved", "Claimed"].includes(to) && x.status === "QS checked" ? RULE_MSG.notPM : RULE_MSG.notYours);
    if (to === "QS checked") {
      const cert = Number(v.certified);
      if (!(cert >= 0)) throw new Error("Enter the amount certified.");
      if (cert > Number(x.claimed)) throw new Error("Certified (" + money(cert) + ") cannot be more than the subcontractor claimed (" + money(x.claimed) + ").");
      p.certified = cert; p.retention_amt = Math.round(p.certified * (Number(k.retention_pct) || 0)) / 100; if (v.note) p.note = v.note; }
    if (to === "PM approved") {
      const net = Number(x.certified) - Number(x.retention_amt);
      await save("invoices", { inv_no: nextNo("invoices", "inv_no", "AP-"), direction: "Payable", project_id: k.project_id, party: s.name, source_type: "sub_payment", source_id: x.id, amount: net,
        due_date: new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA"), status: "Unpaid", paid_at: null }, "Subcontractor bill " + s.name + " " + x.pc_no + ": " + money(net));
    }
    if (to === "Paid") { p.paid_at = nowIso(); const inv = db.invoices.find((i) => i.source_type === "sub_payment" && i.source_id === x.id && i.status === "Unpaid"); if (inv) await patch("invoices", inv.id, { status: "Paid", paid_at: nowIso() }, inv.inv_no + " paid"); }
    await patch("sub_payments", x.id, p, s.name + " " + x.pc_no + ": " + to);
  }
  function openPayment(x) {
    const u = me(), k = byId("sub_contracts", x.contract_id) || {}, s = byId("subcontractors", k.sub_id) || {};
    const acts = payActions(u, x, k).map(([label, to, cls, fields]) => btn(label, () => fields ? formModal(label + " · " + x.pc_no, fields, (v) => payMove(x, k, to, v), label) : payMove(x, k, to).then(() => { closeModal(); render(); toast(x.pc_no + ": " + to); }, (e) => toast(e.message, true)), cls)).join("");
    detail(s.name + " · " + x.pc_no, [["Project", esc(projLabel(k.project_id))], ["Scope", esc(k.scope)], ["Work done up to", fmtDate(x.period_to)], ["Claimed", money(x.claimed)],
      ["Certified by QS", x.status === "Claimed" ? "—" : money(x.certified)], ["Retention kept", k.retention_pct ? money(x.retention_amt) + " (" + esc(k.retention_pct) + "%)" : "No retention"], ["To pay", x.status === "Claimed" ? "—" : "<b>" + money(x.certified - x.retention_amt) + "</b>"],
      ["Status", badge(x.status)], x.note ? ["Note", esc(x.note)] : null], acts, `${stepper(PC_FLOW, x.status, x.status === "Paid")}${(x.evidence || []).length ? `<h4>Claim documents</h4>${evidenceHtml(x.evidence)}` : ""}<h4>History</h4>${histList(x.history)}`);
  }
  function rateContract(k) {
    const s = byId("subcontractors", k.sub_id) || {}, o = [["5", "5 · Excellent"], ["4", "4 · Good"], ["3", "3 · OK"], ["2", "2 · Poor"], ["1", "1 · Very poor"]];
    formModal("Rate · " + s.name, [{ name: "quality", label: "Quality of work", type: "select", options: o, value: "4" }, { name: "time", label: "On time", type: "select", options: o, value: "4" }, { name: "safety", label: "Safety", type: "select", options: o, value: "4" }, { name: "note", label: "Comment", type: "textarea" }],
      async (x) => { await patch("sub_contracts", k.id, { ratings: (k.ratings || []).concat([{ at: nowIso(), by: me().id, quality: Number(x.quality), time: Number(x.time), safety: Number(x.safety), note: x.note || "" }]) }, s.name + " rated on " + projLabel(k.project_id)); }, "Save rating");
  }
  async function releaseRetention(k) {
    const s = byId("subcontractors", k.sub_id) || {}, amt = kRetention(k);
    if (!amt) { toast("No retention held on this contract.", true); return; }
    await save("invoices", { inv_no: nextNo("invoices", "inv_no", "AP-"), direction: "Payable", project_id: k.project_id, party: s.name, source_type: "retention", source_id: k.id, amount: amt, due_date: new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA"), status: "Unpaid", paid_at: null }, "Retention release " + s.name + ": " + money(amt));
    await patch("sub_contracts", k.id, { retention_released: true }, s.name + " retention released: " + money(amt)); closeModal(); render(); toast("Retention " + money(amt) + " sent to Finance to pay");
  }
  function openSub(s) {
    const u = me(), mgr = can(u, "subs", "approve"), ks = contractsOf(s.id), r = subRating(s.id);
    const kt = ks.length ? `<div class="tscroll"><table class="boq"><thead><tr><th>Project</th><th>Scope</th><th class="r">Contract</th><th class="r">Retention</th><th class="r">Certified</th><th class="r">Paid</th><th class="r">Held</th><th></th></tr></thead><tbody>${ks.map((k) => `<tr><td>${esc(projLabel(k.project_id))}</td><td>${esc(k.scope)}</td><td class="r">${money(k.contract_value)}</td><td class="r">${k.retention_pct ? esc(k.retention_pct) + "%" : "None"}</td><td class="r">${money(kCertified(k))}</td><td class="r">${money(kPaid(k))}</td><td class="r">${kRetention(k) ? money(kRetention(k)) : kRetentionReleased(k) ? "Released" : money(0)}</td>
      <td class="r nowrap">${can(u, "subs", "edit") || isQS(u) || isPMof(u, k.project_id) ? `<button class="btn small" data-act="${act(() => newPayment(k))}">Claim</button>` : ""}${isPMof(u, k.project_id) || hasTag(u, "MD") ? ` <button class="btn small" data-act="${act(() => rateContract(k))}">Rate</button>` : ""}${mgr && kRetention(k) ? ` <button class="btn small" data-act="${act(() => releaseRetention(k))}">Release retention</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted small">No contract yet.</p>';
    const pays = ks.flatMap((k) => paysOf(k.id)).sort((a, b) => String(b.period_to).localeCompare(String(a.period_to)));
    const rts = ks.flatMap((k) => (k.ratings || []).map((x) => Object.assign({ pid: k.project_id }, x))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    detail(s.name + " · " + s.trade, [["Contact", esc([s.contact, s.phone, s.telegram].filter(Boolean).join(" · "))], ["Company documents", (s.patent ? "Patent ✓" : "Patent ✗") + " · " + (s.vat ? "VAT ✓" : "VAT ✗") + " · Insurance " + (s.insurance_until ? fmtDate(s.insurance_until) : "not set")],
      ["Status", subStatusChip(s)], ["Rating", r ? stars(r) + " " + r.toFixed(1) + " from " + rts.length + " ratings" : "Not rated yet"], s.notes ? ["Notes", esc(s.notes)] : null],
      (mgr ? btn("Edit", () => subForm(s)) + btn("New contract", () => contractForm(s), "primary") : ""),
      `<h4>Contracts</h4>${kt}<h4>Payment certificates</h4>${pays.length ? `<ul class="mini-l">${pays.map((x) => { const k = byId("sub_contracts", x.contract_id); return `<li data-act="${act(() => openPayment(x))}" class="click">${badge(x.status)}<span><b>${esc(x.pc_no)} · ${esc(projLabel(k.project_id))}</b><small>to ${esc(fmtDate(x.period_to))} · claimed ${money(x.claimed)}${x.status !== "Claimed" ? " · certified " + money(x.certified) : ""}</small></span></li>`; }).join("")}</ul>` : '<p class="muted small">None yet.</p>'}
      ${rts.length ? `<h4>Ratings</h4><ul class="hist">${rts.map((x) => `<li><small>${esc(fmtDate(x.at))} · ${esc(staffName(x.by))} · ${esc(projLabel(x.pid))}</small><br>Quality ${stars(x.quality)} Time ${stars(x.time)} Safety ${stars(x.safety)}${x.note ? "<br>" + esc(x.note) : ""}</li>`).join("")}</ul>` : ""}`);
    const md = $("#modal .modal"); if (md) md.classList.add("wide");
  }
  function payTable(rows) {
    return table([{ label: "No.", get: (x) => `<small>${esc(x.pc_no)}</small>` }, { label: "Subcontractor", get: (x) => { const k = byId("sub_contracts", x.contract_id) || {}; return `<b>${esc((byId("subcontractors", k.sub_id) || {}).name || "")}</b><br><small>${esc(projLabel(k.project_id))}</small>`; } },
      { label: "Up to", get: (x) => fmtDate(x.period_to) }, { label: "Claimed", get: (x) => money(x.claimed) }, { label: "Certified", get: (x) => x.status === "Claimed" ? "—" : money(x.certified) },
      { label: "Retention", get: (x) => x.retention_amt ? money(x.retention_amt) : "—" }, { label: "Status", get: (x) => badge(x.status) }], rows, openPayment);
  }
  function subTable(list, pid) {
    return table([{ label: "Subcontractor", get: (s) => `<b>${esc(s.name)}</b><br><small>${esc([s.contact, s.phone].filter(Boolean).join(" · "))}</small>` }, { label: "Trade", get: (s) => esc(s.trade) },
      { label: "Projects", get: (s) => `<small>${esc(contractsOf(s.id).map((k) => (byId("projects", k.project_id) || {}).code).join(", "))}</small>` },
      { label: "Contract", get: (s) => money(sum(contractsOf(s.id).filter((k) => !pid || k.project_id === pid), (k) => k.contract_value)) },
      { label: "Paid", get: (s) => { const ks = contractsOf(s.id).filter((k) => !pid || k.project_id === pid), v = sum(ks, (k) => k.contract_value), pd = sum(ks, kPaid); return `${pct(pd, v)}% ${bar(pct(pd, v))}`; } },
      { label: "Retention held", get: (s) => { const h = sum(contractsOf(s.id).filter((k) => !pid || k.project_id === pid), kRetention); return h ? money(h) : contractsOf(s.id).some((k) => k.retention_pct) ? "$0" : "None"; } },
      { label: "Rating", get: (s) => subRating(s.id) ? stars(subRating(s.id)) : '<span class="muted">—</span>' }, { label: "Status", get: (s) => subStatusChip(s) }], list, openSub);
  }
  SCREENS.subs = (u) => {
    const T = tabs("subs", [["subs", "Subcontractors"], ["pay", "Payment certificates"]]);
    const all = db.subcontractors.filter((s) => matchSearch(s, ["name", "trade", "contact", "phone"])).filter((s) => !state.project || contractsOf(s.id).some((k) => k.project_id === state.project));
    const ks = db.sub_contracts.filter((k) => k.status === "Active" && byProjectFilter(k)), pays = db.sub_payments.filter((x) => { const k = byId("sub_contracts", x.contract_id); return k && byProjectFilter(k); });
    const waiting = pays.filter((x) => x.status !== "Paid"), ins = db.subcontractors.filter((s) => s.status === "Active" && insDays(s) != null && insDays(s) <= 30);
    const head = `<h1>Subcontractors</h1><p class="muted">Contracts, payment claims, retention (optional), insurance and rating. Payments: claimed → QS checks → PM approves → Finance pays.</p>
      ${kpis5([["Active subcontractors", String(db.subcontractors.filter((s) => s.status === "Active").length)], ["Active contracts", money(sum(ks, (k) => k.contract_value))], ["Payments in progress", String(waiting.length), money(sum(waiting, (x) => x.status === "Claimed" ? x.claimed : x.certified - x.retention_amt)), waiting.length ? "o" : ""],
        ["Retention held", money(sum(ks, kRetention)), ks.filter((k) => !k.retention_pct).length + " contracts without retention"], ["Insurance ending ≤ 30 days", String(ins.length), ins.map((s) => s.name).join(", "), ins.length ? "r" : ""]])}${T.html}`;
    if (T.cur === "pay") return head + toolbar(u, {}) + payTable(pays.filter((x) => matchSearch(x, ["pc_no", "note"])).sort((a, b) => (a.status === "Paid") - (b.status === "Paid") || String(b.period_to).localeCompare(String(a.period_to))));
    return head + toolbar(u, { buttons: can(u, "subs", "approve") ? btn("Add subcontractor", () => subForm(), "primary") : "" }) + subTable(all);
  };

  // ================= TESTING, HANDOVER & WARRANTY =================
  const TT = {
    IR: { name: "Insulation resistance", system: "Electrical", limitLabel: "Pass if every reading is at least (MΩ)", limit: 1, instrument: "Insulation tester",
      cols: [["id", "Circuit"], ["v1", "L–N (MΩ)", "n"], ["v2", "L–E (MΩ)", "n"], ["v3", "N–E (MΩ)", "n"]], pass: (r, L) => [r.v1, r.v2, r.v3].every((v) => Number(v) >= L) },
    ER: { name: "Earth electrode resistance", system: "Electrical", limitLabel: "Pass if the reading is at most (Ω)", limit: 5, instrument: "Earth tester",
      cols: [["id", "Electrode / location"], ["v1", "Reading (Ω)", "n"]], pass: (r, L) => Number(r.v1) <= L },
    RCD: { name: "RCD trip test", system: "Electrical", limitLabel: "Pass if trip time is at most (ms)", limit: 300, instrument: "Multifunction tester",
      cols: [["id", "Circuit / RCD"], ["v1", "Rating (mA)", "n"], ["v2", "Trip time (ms)", "n"]], pass: (r, L) => Number(r.v2) > 0 && Number(r.v2) <= L },
    PT: { name: "Pipe pressure test", system: "Plumbing", limitLabel: "Allowed pressure drop (bar)", limit: 0.2, instrument: "Pressure gauge",
      cols: [["id", "Pipe section"], ["v1", "Test pressure (bar)", "n"], ["v2", "Start (bar)", "n"], ["v3", "End (bar)", "n"], ["v4", "Time (min)", "n"]], pass: (r, L) => Number(r.v2) - Number(r.v3) <= L && Number(r.v4) >= 30 && Number(r.v2) >= Number(r.v1) },
    CCTV: { name: "CCTV commissioning", system: "ELV", limitLabel: "", limit: null, instrument: "",
      cols: [["id", "Camera"], ["v1", "Image clear", "yn"], ["v2", "Night vision", "yn"], ["v3", "Recording on NVR", "yn"]], pass: (r) => r.v1 === "Yes" && r.v2 === "Yes" && r.v3 === "Yes" },
    DATA: { name: "Data point test (Cat6)", system: "ELV", limitLabel: "Maximum length (m)", limit: 90, instrument: "Cable certifier",
      cols: [["id", "Point ID"], ["v1", "Length (m)", "n"], ["v2", "Tester result", "pf"]], pass: (r, L) => r.v2 === "Pass" && Number(r.v1) <= L }
  };
  const rowDone = (t, r) => TT[t].cols.every(([k]) => r[k] !== "" && r[k] != null);
  const rowPass = (test, r) => rowDone(test.test_type, r) ? TT[test.test_type].pass(r, Number(test.limit_value == null ? TT[test.test_type].limit : test.limit_value)) : null;
  const testResult = (test) => { const rs = (test.rows || []).map((r) => rowPass(test, r)); return !rs.length || rs.some((x) => x === null) ? (rs.some((x) => x === false) ? "Fail" : "Open") : rs.every(Boolean) ? "Pass" : "Fail"; };
  const HO_CATS = ["As-built drawings", "O&M manuals", "Warranty certificates", "Test reports", "Keys & access cards", "Training", "Spare parts", "Other"];
  const canTest = (u, pid) => can(u, "handover", "edit") && inScope(u, pid);
  function newTest(u, pid) {
    formModal("New test sheet", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: pid || state.project },
      { name: "test_type", label: "Test", type: "select", options: Object.keys(TT).map((k) => [k, TT[k].system + " · " + TT[k].name]), required: true },
      { name: "location", label: "Location / board / system", required: true, help: "Example: DB-L3, riser L1-L2, CCTV banking hall" },
      { name: "test_date", label: "Test date", type: "date", value: today() }
    ], async (x) => {
      const p = byId("projects", x.project_id), T = TT[x.test_type];
      const r = await save("tests", Object.assign(x, { test_no: nextCode(db.tests, "test_no", "TC-" + projShort(p) + "-"), system: T.system, instrument: T.instrument, instrument_sn: "", calib_until: null, limit_value: T.limit,
        rows: [{ id: "" }, { id: "" }, { id: "" }], result: "Open", tested_by: u.id, witness: "", photos: [], defect_ids: [], note: "" }), (t) => t.test_no + " " + T.name + " · " + t.location);
      setTimeout(() => editTest(byId("tests", r.id) || r), 60); // open the sheet to fill in the results
    }, "Create test sheet");
  }
  function editTest(t0) {
    const t = Object.assign({}, t0, { rows: (t0.rows || []).map((r) => Object.assign({}, r)), photos: (t0.photos || []).slice() }), T = TT[t.test_type];
    const cell = (r, i, [k, l, ty]) => ty === "yn" ? `<select data-r="${i}" data-k="${k}" aria-label="${esc(l)}"><option value="">${esc(l)}</option>${["Yes", "No"].map((o) => `<option ${r[k] === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : ty === "pf" ? `<select data-r="${i}" data-k="${k}" aria-label="${esc(l)}"><option value="">${esc(l)}</option>${["Pass", "Fail"].map((o) => `<option ${r[k] === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : `<input data-r="${i}" data-k="${k}" ${ty === "n" ? 'type="number" step="any" inputmode="decimal"' : ""} value="${esc(r[k] == null ? "" : r[k])}" aria-label="${esc(l)}" placeholder="${esc(l)}">`;
    const grid = () => `<div class="tgrid" style="--tc:${T.cols.length}"><div class="th">${T.cols.map(([, l]) => `<span>${esc(l)}</span>`).join("")}<span>Result</span><span></span></div>${t.rows.map((r, i) => { const ps = rowPass(t, r); return `<div class="tr ${ps === false ? "bad" : ps ? "good" : ""}">${T.cols.map((c) => `<label class="cl"><span class="cl-t">${esc(c[1])}</span>${cell(r, i, c)}</label>`).join("")}<span class="res">${ps == null ? "—" : ps ? chip("Pass", "g") : chip("Fail", "r")}</span><button type="button" class="rm" data-rmr="${i}" aria-label="Remove line">×</button></div>`; }).join("")}</div>`;
    const calibWarn = () => t.calib_until && t.calib_until < (t.test_date || today()) ? '<div class="alert warn">The instrument calibration has expired. Results may not be accepted by the client.</div>' : "";
    const body = () => `<form id="tform"><p class="muted small">${esc(projLabel(t.project_id))} · ${esc(T.system)} · ${esc(t.location)}</p>
      <div class="grid3f"><label class="field"><span>Instrument</span><input data-f="instrument" value="${esc(t.instrument || "")}"></label><label class="field"><span>Serial no.</span><input data-f="instrument_sn" value="${esc(t.instrument_sn || "")}"></label><label class="field"><span>Calibrated until</span><input type="date" data-f="calib_until" value="${esc(t.calib_until || "")}"></label></div>
      <div id="t-cal">${calibWarn()}</div>
      ${T.limitLabel ? `<label class="field"><span>${esc(T.limitLabel)}</span><input type="number" step="any" data-f="limit_value" value="${esc(t.limit_value == null ? T.limit : t.limit_value)}"></label>` : ""}
      <div id="t-grid">${grid()}</div><button type="button" class="btn small" id="t-add">+ Add line</button>
      <p class="muted small">A failed line creates a defect automatically when you save, so the correction is tracked in QA/QC.</p>
      <div class="grid2f"><label class="field"><span>Witnessed by (client / consultant)</span><input data-f="witness" value="${esc(t.witness || "")}"></label><label class="field"><span>Test date</span><input type="date" data-f="test_date" value="${esc(t.test_date || today())}"></label></div>
      <label class="field"><span>Note</span><textarea data-f="note" rows="2">${esc(t.note || "")}</textarea></label>
      <div class="field"><span>Photos of readings (optional)</span><label class="btn"><input type="file" accept="image/*" capture="environment" id="t-cam" hidden>${svgI("camera")} Take photo</label> <label class="btn"><input type="file" accept="image/*" multiple id="t-ph" hidden>Choose photos</label><div class="capgrid" id="t-phs"></div></div>
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">Save test</button></div></form>`;
    openModal(t.test_no + " · " + T.name, body(), (m) => {
      const f = m.querySelector("#tform");
      const paintPh = () => { f.querySelector("#t-phs").innerHTML = t.photos.map((p, i) => `<div class="cap"><span class="ph"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="rm" data-prm="${i}">×</button></span></div>`).join(""); f.querySelectorAll("[data-prm]").forEach((b) => b.onclick = () => { t.photos.splice(Number(b.dataset.prm), 1); paintPh(); }); };
      const repaint = () => { f.querySelector("#t-grid").innerHTML = grid(); f.querySelectorAll("[data-rmr]").forEach((b) => b.onclick = () => { t.rows.splice(Number(b.dataset.rmr), 1); repaint(); }); translateNow(f.querySelector("#t-grid")); };
      // update only the result of the line being typed in, so the phone keyboard and focus are never lost
      const resCell = (i) => { const row = f.querySelectorAll("#t-grid .tr")[i]; if (!row) return; const ps = rowPass(t, t.rows[i]); row.classList.toggle("bad", ps === false); row.classList.toggle("good", !!ps); row.querySelector(".res").innerHTML = ps == null ? "—" : ps ? chip("Pass", "g") : chip("Fail", "r"); translateNow(row); };
      const setCell = (el) => { const i = Number(el.dataset.r); t.rows[i][el.dataset.k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value; resCell(i); };
      f.addEventListener("input", (e) => { const el = e.target; if (el.dataset.r != null) setCell(el); if (el.dataset.f) { t[el.dataset.f] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value; if (el.dataset.f === "limit_value") t.rows.forEach((_, i) => resCell(i)); if (el.dataset.f === "calib_until" || el.dataset.f === "test_date") f.querySelector("#t-cal").innerHTML = calibWarn(); } });
      f.addEventListener("change", (e) => { const el = e.target; if (el.dataset.r != null) setCell(el); });
      f.querySelector("#t-add").onclick = () => { t.rows.push({ id: "" }); repaint(); };
      const addPh = async (e) => { for (const file of e.target.files) { try { t.photos.push(await compressImage(file)); } catch (x) { toast("Could not read a photo", true); } } e.target.value = ""; paintPh(); };
      f.querySelector("#t-cam").onchange = addPh; f.querySelector("#t-ph").onchange = addPh; paintPh(); repaint();
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const b = f.querySelector("button[type=submit]"); b.disabled = true;
        try {
          t.rows = t.rows.filter((r) => String(r.id || "").trim() || TT[t.test_type].cols.slice(1).some(([k]) => r[k] !== "" && r[k] != null));
          if (!t.rows.length) throw new Error("Add at least one line.");
          const noId = t.rows.findIndex((r) => !String(r.id || "").trim());
          if (noId >= 0) throw new Error("Line " + (noId + 1) + " has readings but no " + TT[t.test_type].cols[0][1].toLowerCase() + ". Write it so the result can be judged.");
          const u = me(), ids = (t.defect_ids || []).slice();
          // a failed line is fixed by the project's site team (then the PM), not by the tester
          const proj = byId("projects", t.project_id) || {};
          const fixer = (teamOf(t.project_id, "SITE")[0] || {}).staff_id || proj.pm_id || t.tested_by || u.id;
          for (const r of t.rows) if (rowPass(t, r) === false && !r.defect_id) {
            const d = await save("defects", { project_id: t.project_id, location: t.location + " · " + r.id, description: "Test failed " + t.test_no + ": " + T.name.toLowerCase() + " " + r.id, discipline: T.system, priority: "High",
              assigned_to: fixer, due_date: new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-CA"), status: "Open", photo: "", raised_by: u.id, evidence: [], close_evidence: [], inspection_id: "" }, "Defect from failed test " + t.test_no + " · " + r.id);
            r.defect_id = d.id; ids.push(d.id);
          }
          const photos = await storeFiles(t.photos, "test");
          const res = testResult(t);
          await patch("tests", t.id, { rows: t.rows, result: res, instrument: t.instrument, instrument_sn: t.instrument_sn, calib_until: t.calib_until || null, limit_value: t.limit_value == null ? null : Number(t.limit_value), witness: t.witness, test_date: t.test_date, note: t.note, photos, defect_ids: ids }, t.test_no + " " + T.name + ": " + res);
          closeModal(); render(); toast(t.test_no + ": " + res + (ids.length > (t0.defect_ids || []).length ? " · defect created for failed lines" : ""));
        } catch (err) { b.disabled = false; toast(err.message, true); }
      });
    });
    const md = $("#modal .modal"); if (md) md.classList.add("wide");
  }
  function openTest(t) {
    const u = me(), T = TT[t.test_type];
    const rows = `<table class="boq"><thead><tr>${T.cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}<th>Result</th></tr></thead><tbody>${(t.rows || []).map((r) => { const ps = rowPass(t, r); return `<tr>${T.cols.map(([k]) => `<td>${esc(r[k] == null ? "" : r[k])}</td>`).join("")}<td>${ps == null ? "—" : ps ? chip("Pass", "g") : chip("Fail", "r")}</td></tr>`; }).join("")}</tbody></table>`;
    const defs = (t.defect_ids || []).map((id) => byId("defects", id)).filter(Boolean);
    detail(t.test_no + " · " + T.name, [["Project", esc(projLabel(t.project_id))], ["Location", esc(t.location)], ["Result", badge(t.result)], ["Instrument", esc([t.instrument, t.instrument_sn && "SN " + t.instrument_sn].filter(Boolean).join(" · ")) + (t.calib_until ? " · calibrated to " + fmtDate(t.calib_until) + (t.calib_until < t.test_date ? ' <span class="tag bad">expired</span>' : " ✓") : "")],
      T.limitLabel ? ["Pass rule", esc(T.limitLabel) + " " + esc(t.limit_value == null ? T.limit : t.limit_value)] : null, ["Tested by", esc(staffName(t.tested_by)) + " · " + fmtDate(t.test_date)], ["Witness", esc(t.witness)], t.note ? ["Note", esc(t.note)] : null,
      defs.length ? ["Defects", defs.map((d) => `<a href="#" data-act="${act(() => openDefect(d))}">${esc(defectNo(d))}</a> ${badge(d.status)}`).join(" ")] : null],
      (canTest(u, t.project_id) ? btn("Edit results", () => editTest(t), "primary") : "") + btn("PDF English", () => testPdf(t, "en")) + btn("PDF ខ្មែរ", () => testPdf(t, "km")),
      rows + ((t.photos || []).length ? `<h4>Photos</h4>${gallery(t.photos)}` : ""));
    const md = $("#modal .modal"); if (md) md.classList.add("wide");
  }
  const TTK = { IR: "ការធ្វើតេស្តភាពធន់អ៊ីសូឡង់", ER: "ការធ្វើតេស្តភាពធន់ដីដី (Earth)", RCD: "ការធ្វើតេស្តឧបករណ៍ RCD", PT: "ការធ្វើតេស្តសម្ពាធបំពង់", CCTV: "ការដំណើរការកាមេរ៉ា CCTV", DATA: "ការធ្វើតេស្តចំណុចបណ្តាញ (Cat6)" };
  async function testPdf(t, lang) {
    const km = lang === "km", T = TT[t.test_type], p = byId("projects", t.project_id) || {}, title = km ? TTK[t.test_type] : /test|commissioning/i.test(T.name) ? T.name : T.name + " test", tr = pdfTr(lang);
    const L = km ? { form: "ទម្រង់ GID-TC-" + t.test_type, d: "ព័ត៌មានលម្អិត", pr: "គម្រោង", loc: "ទីតាំង", ins: "ឧបករណ៍", cal: "ក្រិតតាមខ្នាតរហូតដល់", rule: "លក្ខខណ្ឌជាប់", res: "លទ្ធផល", lines: "លទ្ធផលតាមខ្សែ", pass: "ជាប់", fail: "មិនជាប់", yes: "ត្រឹមត្រូវ", no: "មិនត្រឹមត្រូវ", open: "មិនទាន់ចប់", sign: "ហត្ថលេខា", by: "ធ្វើតេស្តដោយ", wit: "សាក្សី", pm: "អ្នកគ្រប់គ្រងគម្រោង", sig: "ហត្ថលេខា / កាលបរិច្ឆេទ", ph: "រូបថត", gen: "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID ·", page: (a, b) => "ទំព័រ " + a + "/" + b, date: "កាលបរិច្ឆេទ", note: "កំណត់ចំណាំ" }
      : { form: "Form GID-TC-" + t.test_type, d: "Details", pr: "Project", loc: "Location", ins: "Instrument", cal: "Calibrated until", rule: "Pass rule", res: "Result", lines: "Results", pass: "PASS", fail: "FAIL", yes: "Yes", no: "No", open: "OPEN", sign: "Sign-off", by: "Tested by", wit: "Witness", pm: "Project Manager", sig: "Signature / date", ph: "Photos", gen: "GID Management System · generated", page: (a, b) => "Page " + a + " of " + b, date: "Date", note: "Note" };
    const cellV = (ty, v) => v == null ? "" : ty === "yn" ? (v === "Yes" ? L.yes : v === "No" ? L.no : tr(v)) : ty === "pf" ? (v === "Pass" ? L.pass : v === "Fail" ? L.fail : tr(v)) : v;
    const R = (x) => x === "Pass" ? L.pass : x === "Fail" ? L.fail : L.open;
    const blocks = [`<h2><i>1</i>${L.d}</h2><table class="sf-t"><tr><th>${L.pr}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.loc}</th><td>${esc(t.location)}</td></tr><tr><th>${L.ins}</th><td>${esc([t.instrument, t.instrument_sn && "SN " + t.instrument_sn].filter(Boolean).join(" · "))}</td><th>${L.cal}</th><td>${t.calib_until ? esc(rDate(t.calib_until, lang)) : "—"}</td></tr>
      <tr><th>${L.date}</th><td>${esc(rDate(t.test_date, lang))}</td><th>${L.rule}</th><td>${T.limitLabel ? esc(tr(T.limitLabel) + " " + (t.limit_value == null ? T.limit : t.limit_value)) : T.cols.filter((c) => c[2] === "yn").map(() => L.yes).join(" / ")}</td></tr></table>`,
      `<h2><i>2</i>${L.lines}</h2><table class="sf-t sf-cols"><tr>${T.cols.map(([, l, ty], i) => `<th${i ? (ty === "n" ? ' class="sf-num"' : "") : ' class="sf-wide"'}>${esc(tr(l))}</th>`).join("")}<th>${L.res}</th></tr>${(t.rows || []).map((r) => { const ps = rowPass(t, r); return `<tr>${T.cols.map(([k, , ty]) => `<td${ty === "n" ? ' class="sf-num"' : ""}>${esc(cellV(ty, r[k]))}</td>`).join("")}<td><b>${ps == null ? "—" : ps ? L.pass : L.fail}</b></td></tr>`; }).join("")}</table>${t.note ? `<div class="sf-box"><b>${L.note}:</b> ${esc(t.note)}</div>` : ""}`,
      `<h2><i>3</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.by}</small><b>${esc(staffName(t.tested_by))}</b><em>${L.sig}</em></div><div><small>${L.wit}</small><b>${esc(t.witness || "")}</b><em>${L.sig}</em></div><div><small>${L.pm}</small><b>${esc(staffName(p.pm_id))}</b><em>${L.sig}</em></div><div><small>&nbsp;</small><b>&nbsp;</b><em>${L.sig}</em></div></div>`];
    sfCss();
    await makePdf({ lang, no: t.test_no, fileName: t.test_no + "-" + (km ? "KH" : "EN") + ".pdf", head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${kmTitle(esc(title), lang)}</h1><small>${esc(t.test_no)} · ${L.form}</small><span class="rp-sess ${t.result === "Pass" ? "" : "sf-open"}">${R(t.result)}</span></div></div>`,
      mini: (x) => `<div class="rp-mini"><span><b>${x}</b> · ${esc(p.code)} · ${esc(t.test_no)}</span><span>${L.form}</span></div>`, contTitle: esc(title) + " (" + (km ? "បន្ត" : "continued") + ")", photoTitle: L.ph, blocks, photos: (t.photos || []).map((src) => ({ src, cap: "" })), footLeft: L.gen + " " + esc(pdfGenerated(lang)), pageLabel: L.page });
  }
  function hoItemForm(u, pid, it) {
    it = it || {};
    formModal(it.id ? "Update · " + it.title : "Add handover item", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: it.project_id || pid || state.project }, { name: "category", label: "Type", type: "select", options: HO_CATS, value: it.category || HO_CATS[0] },
      { name: "title", label: "Item", required: true, value: it.title || "" }, { name: "status", label: "Status", type: "select", options: ["Pending", "Received", "Handed over"], value: it.status || "Pending" },
      { name: "due_date", label: "Due", type: "date", value: it.due_date || "" }, { name: "evidence", label: "File or photo (optional)", type: "evidence", help: "As-built PDF, signed handover note…" }, { name: "note", label: "Note", type: "textarea", value: it.note || "" }
    ], async (x) => {
      const ev = (it.evidence || []).concat(await storeEvidence(x.evidence || [], "handover")); x.evidence = ev; x.due_date = x.due_date || null; x.updated_by = u.id;
      if (it.id) await patch("handover_items", it.id, x, "Handover item " + x.title + ": " + x.status); else await save("handover_items", x, "Handover item added: " + x.title);
    }, it.id ? "Save" : "Add item");
  }
  function warrantyForm(u, pid, w) {
    w = w || {};
    formModal(w.id ? "Edit warranty" : "Add warranty", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: w.project_id || pid || state.project }, { name: "item", label: "Equipment / work", required: true, value: w.item || "" },
      { name: "supplier", label: "Supplier / subcontractor", value: w.supplier || "" }, { name: "start_date", label: "Warranty starts", type: "date", required: true, value: w.start_date || today() },
      { name: "end_date", label: "Warranty ends", type: "date", required: true, value: w.end_date || "" }, { name: "evidence", label: "Warranty certificate (optional)", type: "evidence" }, { name: "note", label: "Note", type: "textarea", value: w.note || "" }
    ], async (x) => {
      x.evidence = (w.evidence || []).concat(await storeEvidence(x.evidence || [], "warranty"));
      if (w.id) await patch("warranties", w.id, x, "Warranty updated: " + x.item); else await save("warranties", x, "Warranty added: " + x.item + " until " + x.end_date);
    }, w.id ? "Save" : "Add warranty");
  }
  const wDays = (w) => Math.ceil(daysUntil(w.end_date));
  const wChip = (w) => { const d = wDays(w); return d < 0 ? chip("Ended", "n") : d <= 14 ? chip("Ends in " + d + " days", "r") : d <= 60 ? chip("Ends in " + d + " days", "w") : chip("Valid", "g"); };
  const dlpEnd = (p) => { if (!p.handover_date) return null; const d = new Date(p.handover_date + "T00:00:00"), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + Number(p.dlp_months || 12)); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.toLocaleDateString("en-CA"); };
  function setHandoverDate(p) {
    formModal("Handover date · " + p.code, [{ name: "handover_date", label: "Handover date", type: "date", required: true, value: p.handover_date || today() }, { name: "dlp_months", label: "Defect liability period", type: "select", options: [["6", "6 months"], ["12", "12 months"], ["24", "24 months"]], value: String(p.dlp_months || 12) }],
      async (x) => { await patch("projects", p.id, { handover_date: x.handover_date, dlp_months: Number(x.dlp_months) }, p.code + " handover date " + x.handover_date); }, "Save");
  }
  function handoverBody(u, pids, pid) {
    const tests = db.tests.filter((t) => pids.has(t.project_id)).filter((t) => matchSearch(t, ["test_no", "location"])).sort((a, b) => String(b.test_date).localeCompare(String(a.test_date)));
    const items = db.handover_items.filter((h) => pids.has(h.project_id)), ws = db.warranties.filter((w) => pids.has(w.project_id)).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
    const p = pid ? byId("projects", pid) : null, dl = p ? dlpEnd(p) : null, edit = can(u, "handover", "edit");
    const sys = ["Electrical", "ELV", "Plumbing"].map((s) => { const ts = tests.filter((t) => t.system === s); const ok = ts.filter((t) => t.result === "Pass").length;
      return `<div class="tc"><h4>${esc(s)} ${chip(ok + "/" + ts.length + (ts.some((t) => t.result === "Fail") ? " · " + ts.filter((t) => t.result === "Fail").length + " failed" : ""), ts.some((t) => t.result === "Fail") ? "r" : ts.length && ok === ts.length ? "g" : "w")}</h4>${bar(pct(ok, ts.length), ts.some((t) => t.result === "Fail"))}<small>${esc(Object.values(TT).filter((x) => x.system === s).map((x) => x.name).join(" · "))}</small></div>`; }).join("")
      + `<div class="tc"><h4>Handover pack ${chip(items.filter((h) => h.status !== "Pending").length + "/" + items.length, items.length && items.every((h) => h.status !== "Pending") ? "g" : "w")}</h4>${bar(pct(items.filter((h) => h.status !== "Pending").length, items.length))}<small>${esc(HO_CATS.slice(0, 6).join(" · "))}</small></div>`;
    return `${kpis5([["Tests passed", tests.filter((t) => t.result === "Pass").length + " / " + tests.length, "", "g"], ["Tests failed", String(tests.filter((t) => t.result === "Fail").length), "defect raised for each failed line", tests.some((t) => t.result === "Fail") ? "r" : ""],
      ["Handover items done", items.filter((h) => h.status !== "Pending").length + " / " + items.length], ["Warranties ending ≤ 60 days", String(ws.filter((w) => wDays(w) >= 0 && wDays(w) <= 60).length), "", ws.some((w) => wDays(w) >= 0 && wDays(w) <= 14) ? "r" : ""],
      p ? ["Defect liability ends", dl ? fmtDate(dl) : "—", p.handover_date ? (p.dlp_months || 12) + " months after handover " + fmtDate(p.handover_date) : "Set the handover date"] : ["Projects", String(pids.size)]])}
      <div class="tc-grid">${sys}</div>
      <div class="sec-h"><h2>Test sheets</h2>${edit ? btn("New test sheet", () => newTest(u, pid), "primary") : ""}${p && canManageProject(u, p.id) ? btn("Set handover date", () => setHandoverDate(p)) : ""}</div>
      ${table([{ label: "No.", get: (t) => `<small>${esc(t.test_no)}</small>` }, { label: "Test", get: (t) => `<b>${esc(TT[t.test_type].name)}</b><br><small>${esc(t.location)}</small>` }, pid ? null : { label: "Project", get: (t) => esc(projLabel(t.project_id)) }, { label: "System", get: (t) => esc(t.system) },
        { label: "Date", get: (t) => fmtDate(t.test_date) }, { label: "Lines", get: (t) => String((t.rows || []).length) }, { label: "Result", get: (t) => badge(t.result) }].filter(Boolean), tests, openTest)}
      <div class="sec-h"><h2>Handover pack</h2>${edit ? btn("Add item", () => hoItemForm(u, pid)) : ""}</div>
      ${table([{ label: "Type", get: (h) => esc(h.category) }, { label: "Item", get: (h) => `<b>${esc(h.title)}</b>${(h.evidence || []).length ? " 📎" : ""}` }, pid ? null : { label: "Project", get: (h) => esc(projLabel(h.project_id)) }, { label: "Due", get: (h) => fmtDate(h.due_date) }, { label: "Status", get: (h) => badge(h.status) }].filter(Boolean), items, (h) => edit ? hoItemForm(u, pid, h) : null)}
      <div class="sec-h"><h2>Warranties</h2>${edit ? btn("Add warranty", () => warrantyForm(u, pid)) : ""}</div>
      ${table([{ label: "Equipment / work", get: (w) => `<b>${esc(w.item)}</b>${w.note ? `<br><small>${esc(w.note)}</small>` : ""}` }, pid ? null : { label: "Project", get: (w) => esc(projLabel(w.project_id)) }, { label: "Supplier", get: (w) => esc(w.supplier) }, { label: "From", get: (w) => fmtDate(w.start_date) }, { label: "Until", get: (w) => fmtDate(w.end_date) }, { label: "Alert", get: wChip }].filter(Boolean), ws, (w) => edit ? warrantyForm(u, pid, w) : null)}`;
  }
  SCREENS.handover = (u) => {
    const pids = new Set(myProjects(u).filter((p) => !state.project || p.id === state.project).map((p) => p.id));
    return `<h1>Handover & warranty</h1><p class="muted">Test sheets with pass/fail, the handover pack for the client, and warranties with alerts 60 and 14 days before they end.</p>${toolbar(u, {})}${handoverBody(u, pids, state.project || null)}`;
  };

  // ================= PROJECT PAGE (everything about one job in one place) =================
  const PTABS = [["overview", "Overview", "projects"], ["daily", "Daily reports", "daily"], ["docs", "Drawings", "docs"], ["requests", "Requests", "requests"], ["qaqc", "QA/QC", "qaqc"], ["safety", "Safety", "safety"],
    ["vo", "Variations", "vo"], ["subs", "Subcontractors", "subs"], ["cost", "Cost", "cost"], ["handover", "Handover", "handover"], ["team", "Team", "projects"]];
  function embedScreen(key, u, pid) {
    const keep = state.project; state.project = pid;
    if (key === "requests" && !state.tab.requests && LEVEL[level(u, "requests")] >= LEVEL.approve) state.tab.requests = "all";
    try { let h = SCREENS[key](u); h = h.replace(/^\s*<h1>[\s\S]*?<\/h1>(\s*<p class="muted">[\s\S]*?<\/p>)?/, ""); return `<div class="embed">${h}</div>`; } finally { state.project = keep; }
  }
  function projectCounts(pid) {
    return { requests: db.requests.filter((r) => r.project_id === pid && r.status === "Pending").length, qaqc: db.defects.filter((f) => f.project_id === pid && f.status !== "Closed").length,
      safety: db.safety.filter((s) => s.project_id === pid && s.status === "Open").length, vo: db.variations.filter((v) => v.project_id === pid && ["Raised", "Priced", "PM checked", "MD approved", "Sent to client"].includes(v.status)).length };
  }
  function planPct(p) { if (!p.start_date || !p.end_date) return null; const a = new Date(p.start_date).getTime(), b = new Date(p.end_date).getTime(); return Math.max(0, Math.min(100, Math.round((Date.now() - a) * 100 / Math.max(1, b - a)))); }
  function projectOverview(u, p) {
    const L = db.cost_lines.filter((c) => c.project_id === p.id), cu = pct(sum(L, (l) => l.actual), sum(L, (l) => l.budget)), plan = planPct(p), gap = plan == null ? 0 : Number(p.progress) - plan;
    const odDef = db.defects.filter((f) => f.project_id === p.id && f.status === "Open"), openSafe = db.safety.filter((s) => s.project_id === p.id && s.status === "Open");
    const voWait = db.variations.filter((v) => v.project_id === p.id && ["Raised", "Priced", "PM checked", "MD approved", "Sent to client"].includes(v.status));
    const reqs = db.requests.filter((r) => r.project_id === p.id && r.status === "Pending"), failT = db.tests.filter((t) => t.project_id === p.id && t.result === "Fail");
    const exp = new Date().getHours() >= 9 ? siteExpected(u).filter((x) => x.m.project_id === p.id && !x.rs.some((d) => d.session === "Morning")) : [];
    const att = [].concat(
      odDef.slice(0, 4).map((f) => [chip("QA/QC", "r"), defectNo(f) + " " + f.description, f.location + (f.due_date < today() ? " · overdue" : " · fix by " + fmtDate(f.due_date)), () => openDefect(f)]),
      openSafe.map((s) => [chip("Safety", "r"), s.rec_type + ": " + s.description, s.severity + " · " + fmtDate(s.rec_date), () => openSafety(s)]),
      voWait.map((v) => [chip("Variation", "w"), v.vo_no + " " + v.title, v.status + (v.amount ? " · " + money(v.amount) : ""), () => openVO(v)]),
      reqs.slice(0, 3).map((r) => [chip("Request", "w"), r.ref_no + " " + r.title, "Waiting for " + stepWho((r.steps || [])[r.step_index]), () => openRequest(r)]),
      failT.map((t) => [chip("Test", "r"), t.test_no + " " + TT[t.test_type].name + " failed", t.location, () => openTest(t)]),
      exp.map((x) => [chip("Report", "n"), x.s ? x.s.name : staffName(x.m.staff_id), "Morning report not sent yet", null]));
    const lastReps = db.daily_reports.filter((d) => d.kind !== "Design" && d.project_id === p.id).sort((a, b) => String(b.submitted_at || b.report_date).localeCompare(String(a.submitted_at || a.report_date))).slice(0, 3);
    const ks = db.sub_contracts.filter((k) => k.project_id === p.id);
    return `${kpis5([["Progress", esc(p.progress) + "%", bar(p.progress)], plan == null ? null : ["Plan today", plan + "%", gap >= 0 ? "on or ahead of plan" : Math.abs(gap) + " points behind", gap < -15 ? "r" : gap < -5 ? "o" : "g"],
      can(u, "cost", "view") ? ["Cost used", cu + "%", "of " + money(sum(L, (l) => l.budget)) + " budget", cu > Number(p.progress) + 15 ? "r" : cu > Number(p.progress) + 5 ? "o" : ""] : null,
      can(u, "vo", "view") ? ["Variations", "+" + money(voApproved(p.id)), voWait.length + " in progress" + (can(u, "cost", "view") ? " · contract " + money(revisedContract(p)) : "")] : null,
      ["Open issues", String(odDef.length + openSafe.length + failT.length), odDef.length + " defects · " + openSafe.length + " safety · " + failT.length + " failed tests", odDef.length + openSafe.length + failT.length ? "r" : "g"]])}
      <div class="g3"><section class="card"><div class="card-head"><h2>Needs attention on this project</h2></div>${att.length ? `<ul class="mini-l">${att.slice(0, 8).map(([c, t, s, go]) => `<li ${go ? `data-act="${act(go)}" class="click"` : ""}>${c}<span><b>${esc(t)}</b><small>${esc(s)}</small></span>${go ? '<span class="rt btn small">Open</span>' : ""}</li>`).join("")}</ul>` : '<p class="muted">Nothing waiting. 👍</p>'}</section>
      <section class="card"><div class="card-head"><h2>Progress by scope</h2>${canUpdateProgress(u, p) ? `<button class="btn small" data-act="${act(() => updateProgress(p))}">Update</button>` : ""}</div>${scopeTable(p)}</section></div>
      <div class="g2"><section class="card"><div class="card-head"><h2>Latest site reports</h2><a class="link" href="#" data-act="${act(() => { state.tab["p:" + p.id] = "daily"; render(); })}">View all</a></div>${lastReps.length ? `<ul class="mini-l">${lastReps.map((d) => `<li data-act="${act(() => openDaily(d))}" class="click">${chip(d.report_date === today() ? "Today" : fmtDate(d.report_date), d.report_date === today() ? "g" : "n")}<span><b>${esc(d.session || "Report")} · ${esc(d.manpower || 0)} workers</b><small>${esc(staffName(d.author_id))}${d.submitted_at ? " · " + esc(timeOf(d.submitted_at)) : ""}${d.loc_status ? " · " + esc(d.loc_status) : ""} · ${reportPhotos(d).length} photos</small></span></li>`).join("")}</ul>${gallery(lastReps.flatMap(reportPhotos).slice(0, 4), "small")}` : '<p class="muted">No site report yet.</p>'}</section>
      ${can(u, "subs", "view") ? `<section class="card"><div class="card-head"><h2>Subcontractors on this job</h2></div>${ks.length ? `<ul class="mini-l">${ks.map((k) => { const s = byId("subcontractors", k.sub_id) || {}; const r = (k.ratings || []).length ? sum(k.ratings, (x) => (x.quality + x.time + x.safety) / 3) / k.ratings.length : 0;
        return `<li data-act="${act(() => openSub(s))}" class="click"><span><b>${esc(s.name)}</b><small>${esc(k.scope)} · ${money(k.contract_value)}${k.retention_pct ? " · retention " + esc(k.retention_pct) + "%" : " · no retention"}</small></span><span class="rt"><b>${pct(kPaid(k), k.contract_value)}% paid</b><br>${r ? stars(r) : ""}</span></li>`; }).join("")}</ul>` : '<p class="muted">None yet.</p>'}</section>` : ""}</div>`;
  }
  function projectTeam(u, p) {
    const mem = db.project_members.filter((m) => m.project_id === p.id).map((m) => [m, byId("staff", m.staff_id)]).filter(([, s]) => s && !s.left_on);
    return `<section class="card"><div class="card-head"><h2>Project org chart</h2>${btn("Full view and PDF", () => openProjectOrg(p))}${canManageProject(u, p.id) ? btn("Manage team", () => manageTeam(p), "primary") : ""}</div>${orgChartHtml(projectOrgData(p))}</section>
      <section class="card"><div class="card-head"><h2>Team list <span class="count">${mem.length + 1}</span></h2></div><ul class="people">${[byId("staff", p.pm_id)].filter(Boolean).map((s) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>Project Manager${s.phone ? " · " + esc(s.phone) : ""}</small></li>`).join("")}${mem.map(([m, s]) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>${esc(s.title)}${s.phone ? " · " + esc(s.phone) : ""}</small></li>`).join("")}</ul></section>`;
  }
  function projectPage(u, p) {
    const tabsOk = PTABS.filter(([, , mod]) => navVisible(u, mod));
    const key = "p:" + p.id; let cur = state.tab[key] || "overview"; if (!tabsOk.some((t) => t[0] === cur)) cur = "overview";
    const n = projectCounts(p.id);
    const tabHtml = `<div class="ptabs" role="tablist">${tabsOk.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? "on" : ""}" data-act="${act(() => { state.tab[key] = k; state.search = ""; render(); const el = document.querySelector(".ptabs .on"); if (el) el.scrollIntoView({ inline: "center", block: "nearest" }); })}">${esc(l)}${n[k] ? `<i>${n[k]}</i>` : ""}</button>`).join("")}</div>`;
    let body;
    if (cur === "overview") body = projectOverview(u, p);
    else if (cur === "team") body = projectTeam(u, p);
    else if (cur === "vo") { const rows = db.variations.filter((v) => v.project_id === p.id).sort((a, b) => String(b.vo_no).localeCompare(String(a.vo_no))); body = voKpis(rows, p) + `<div class="sec-h"><span class="grow"></span>${can(u, "vo", "edit") ? btn("New variation", () => newVO(u, p.id), "primary") : ""}</div>` + voTable(rows); }
    else if (cur === "subs") { const list = db.subcontractors.filter((s) => contractsOf(s.id).some((k) => k.project_id === p.id)); const pays = db.sub_payments.filter((x) => (byId("sub_contracts", x.contract_id) || {}).project_id === p.id);
      body = subTable(list, p.id) + `<div class="sec-h"><h2>Payment certificates</h2></div>` + payTable(pays.sort((a, b) => (a.status === "Paid") - (b.status === "Paid") || String(b.period_to).localeCompare(String(a.period_to)))); }
    else if (cur === "handover") body = handoverBody(u, new Set([p.id]), p.id);
    else body = embedScreen(cur, u, p.id);
    const acts = (canUpdateProgress(u, p) ? btn("Update progress", () => updateProgress(p), "primary") : "") + (canManageProject(u, p.id) ? btn("Site location", () => editSiteLocation(p)) : "")
      + schedBtn(u, "projects", p, { type: "Site visit", title: "Site visit · " + p.code, location: p.name });
    return `<h1>Projects</h1><p class="muted">${esc(p.code)} · everything about this job in one place</p>
      <a class="backlink" href="#projects">‹ All projects</a>
      <div class="phub-h"><div><span class="pc">${esc(p.code)} · ${esc(p.location || "")} · ${esc(p.status)}</span><h2>${esc(p.name)}</h2><span class="meta">Client: ${esc(p.client || "")} · PM ${esc(staffName(p.pm_id))} · ${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}${can(u, "cost", "view") ? " · Contract " + money(revisedContract(p)) : ""}</span></div><div class="phub-acts">${acts}</div></div>
      ${tabHtml}<div class="ptab-body">${body}</div>`;
  }

  // ---------- PEOPLE ----------
  const leaveTaken = (id) => sum(db.requests.filter((r) => r.requester_id === id && r.type === "Leave" && r.status === "Approved"), (r) => r.leave_days);
  // ---------- staff: add, edit, remove (HR, MD and the system administrator) ----------
  const COMPANY = "Green In Design (GID)";
  const canManageStaff = (u) => hasTag(u, "HR") || hasTag(u, "MD") || isSysAdmin(u);
  const DEPT_NAME = { EXEC: "Executive", PM: "Project Management", SITE: "Site", DESIGN: "Architecture & Design", ENG: "Engineering & Technical", QS: "Quantity Surveying", FIN: "Finance", ADMIN: "Administration" };
  const DEPT_DESK = { EXEC: "the Managing Director's office", PM: "the Project Management area at the head office", SITE: "the site office", DESIGN: "the Design studio at the head office",
    ENG: "the Engineering area at the head office", QS: "the QS area at the head office", FIN: "the Finance room at the head office", ADMIN: "the Admin desk at the head office" };
  // Khmer names put the family name first, so people are usually called by the last part of the name
  const calledName = (name) => { const w = String(name || "").trim().split(/\s+/); return w[w.length - 1] || ""; };
  function welcomeText(v, by) {
    const nm = v.name, called = v.short_name || calledName(nm), dept = DEPT_NAME[v.dept] || v.dept;
    const contact = [v.phone, v.telegram_user ? "Telegram " + (String(v.telegram_user).startsWith("@") ? v.telegram_user : "@" + v.telegram_user) : ""].filter(Boolean).join(" / ") || "the office";
    return { title: "Welcome " + nm + " to " + COMPANY + "!",
      body: "Hi team,\nI'm excited to share that " + nm + " is joining " + COMPANY + " as our new " + v.title + " in the " + dept + " team starting " + (v.start_date ? fmtLong(v.start_date) : "today") + ".\n"
        + "Please join me in giving " + called + " a warm welcome! You can reach them at " + contact + " or stop by " + (v.desk || DEPT_DESK[v.dept] || "the office") + " to say hello.\n\nBest,\n" + by.name + "\n" + by.title };
  }
  const fmtLong = (d) => { try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } };
  function staffForm(s) {
    const u = me(), isNew = !s; s = s || {};
    const g = groupsOf(s), dept = g[0] || "SITE", also = g.slice(1), admin = isSysAdmin(u) || hasTag(u, "MD");
    const fields = [
      { name: "name", label: "Full name", required: true, value: s.name || "", help: "Family name first, as on the ID card. Example: Sok Dara" },
      { name: "short_name", label: "Called (short name)", value: s.short_name || "", help: "How the team calls this person. Empty = the last part of the name." },
      { name: "title", label: "Job title", required: true, value: s.title || "", help: "Example: Site Engineer" },
      { name: "staff_no", label: "Staff ID number", value: isNew ? nextStaffNo() : (s.staff_no || ""), help: "Example: GID-041. Shown on the staff badge." },
      { name: "dept", label: "Department", type: "select", required: true, options: Object.keys(DEPT_NAME).map((k) => [k, DEPT_NAME[k]]), value: dept },
      { name: "phone", label: "Phone number", required: true, value: s.phone || "", help: "Example: 012 345 678" },
      { name: "telegram_user", label: "Telegram username", value: s.telegram_user || "", help: "Example: @sokdara (optional)" },
      { name: "email", label: "Email", value: s.email || "" },
      { name: "start_date", label: "Start date", type: "date", value: s.start_date || today() },
      { name: "desk", label: "Desk / work location", value: s.desk || DEPT_DESK[dept], help: "Where the team can find this person" },
      { name: "photo", label: "Profile photo", type: "evidence", value: s.photo ? JSON.stringify([{ type: "image", name: "photo.jpg", url: s.photo }]) : "", help: "Optional. Take a photo or choose one." }
    ];
    if (admin) fields.push({ name: "tags", label: "Special roles (system admin)", value: s.tags || "", help: "MD, HEAD, SITEMGR, QAQC, DOC, HR, PROC, FINMGR, SYSADMIN, BACKUPADMIN" });
    const alsoHtml = `<fieldset class="pickset"><legend>Also works in (optional)</legend><div class="pickgrid alsogrid">${Object.keys(DEPT_NAME).map((k) => `<label class="pick"><input type="checkbox" name="also" value="${k}" ${also.includes(k) ? "checked" : ""}><span><b>${DEPT_NAME[k]}</b></span></label>`).join("")}</div></fieldset>`;
    const welcomeHtml = isNew ? `<label class="check wl-on"><input type="checkbox" id="wl-send" checked> <span>Send the welcome message to the whole team (in the app and on Telegram)</span></label><div class="wl-prev" id="wl-prev" aria-live="polite"></div>` : "";
    formModal(isNew ? "Add staff" : "Edit · " + s.name, fields, async (v) => {
      const f = document.getElementById("mform");
      const extra = [...f.querySelectorAll('input[name="also"]:checked')].map((x) => x.value).filter((k) => k !== v.dept);
      const ph = (v.photo || []).filter((x) => x.type !== "pdf");
      const photo = ph.length ? (await storeEvidence(ph.slice(0, 1), "staff-photo"))[0].url : (s.photo || "");
      const row = { name: v.name.trim(), short_name: v.short_name || "", title: v.title.trim(), groups: [v.dept].concat(extra).join(","), phone: v.phone, telegram_user: v.telegram_user || "", email: v.email || "",
        start_date: v.start_date || null, desk: v.desk || "", photo, staff_no: checkStaffNo(v.staff_no, s.id) };
      if (admin) row.tags = v.tags || ""; else if (isNew) row.tags = "";
      if (!isNew) { await patch("staff", s.id, row, "Staff details updated: " + row.name + " · " + row.title); return; }
      if (db.staff.some((x) => !x.left_on && x.name.toLowerCase() === row.name.toLowerCase())) throw new Error(row.name + " is already in the staff list.");
      const r = await Store.insert("staff", row);
      try { await Store.insert("audit_log", { at: nowIso(), actor_id: u.id, action: "Created", tbl: "staff", record_id: r.id, summary: "New staff: " + row.name + " · " + row.title }); } catch (e) { /* ignore */ }
      if (document.getElementById("wl-send") ? document.getElementById("wl-send").checked : true) {
        const w = welcomeText(Object.assign({}, row, { dept: v.dept }), u); let n = 0; const at = nowIso();
        const wkm = { title: "សូមស្វាគមន៍ " + row.name + " មកកាន់ GID", body: row.title + " · " + (DEPT_NAME[v.dept] ? KMW(DEPT_NAME[v.dept]) : "") };
        const saved = await insertNotes(staffNow().map((t) => Object.assign(noteRow(t.id, u.id, "welcome", r.id, { kind: "welcome", title: w.title, title_km: wkm.title, body_km: wkm.body }, at), { body: w.body, module: "people", read: t.id === u.id })));
        n = saved.length;
        toast("Added " + row.name + ". Welcome message sent to " + n + " people.");
      } else toast("Added " + row.name + ".");
    }, isNew ? "Add staff" : "Save", { extraHtml: alsoHtml + welcomeHtml, onReady: (m) => {
      const f = m.querySelector("#mform"), dsel = f.querySelector('[name="dept"]'), desk = f.querySelector('[name="desk"]');
      let deskTouched = !isNew && !!s.desk; desk.addEventListener("input", () => { deskTouched = true; });
      const prev = () => {
        const box = m.querySelector("#wl-prev"); if (!box) return;
        const vals = Object.fromEntries(new FormData(f).entries());
        const w = welcomeText({ name: vals.name || "[New Hire's Name]", short_name: vals.short_name, title: vals.title || "[Job Title]", dept: vals.dept, phone: vals.phone, telegram_user: vals.telegram_user, start_date: vals.start_date, desk: vals.desk }, me());
        box.innerHTML = `<small class="muted">Preview of the message</small><b>${esc(w.title)}</b><p>${esc(w.body).replace(/\n/g, "<br>")}</p>`;
      };
      dsel.addEventListener("change", () => { if (!deskTouched) desk.value = DEPT_DESK[dsel.value] || ""; prev(); });
      f.addEventListener("input", prev); prev();
    } });
  }
  function removeStaff(s) {
    formModal("Remove · " + s.name, [
      { name: "left_on", label: "Last working day", type: "date", value: today(), required: true },
      { name: "note", label: "Note (optional)", type: "textarea" }
    ], async (v) => {
      if (s.id === me().id) throw new Error("You cannot remove yourself.");
      await patch("staff", s.id, { left_on: v.left_on, telegram_chat_id: "" }, "Staff removed: " + s.name + " (last day " + v.left_on + ")" + (v.note ? " · " + v.note : ""));
      db.project_members.filter((m) => m.staff_id === s.id).forEach((m) => { Store.remove ? Store.remove("project_members", m.id).catch(() => {}) : 0; });
      toast(s.name + " removed. Their past records stay in the history.");
    }, "Remove staff");
  }
  async function restoreStaff(s) { await patch("staff", s.id, { left_on: null }, "Staff restored: " + s.name); closeModal(); render(); toast(s.name + " is back in the staff list."); }

  // ---------- (v22) staff profile: two hanging badges (front and back) that drop in from the top of the screen ----------
  // Shows exactly what the old profile window showed (same permission checks). Back button, Escape and the phone's Back close it.
  const staffNo = (s) => { if (String(s.staff_no || "").trim()) return String(s.staff_no).trim(); const id = String(s.id || ""); return (/^s\d+$/i.test(id) ? id : id.slice(0, 8)).toUpperCase(); };
  // (v23) Staff ID number: HR, the MD and the System Admin set it; two active staff never share one
  const nextStaffNo = () => "GID-" + String(Math.max(0, ...db.staff.map((x) => parseInt(String(x.staff_no || "").replace(/\D/g, ""), 10) || 0)) + 1).padStart(3, "0");
  function checkStaffNo(no, selfId) {
    no = String(no || "").trim().toUpperCase();
    const other = no && db.staff.find((x) => !x.left_on && x.id !== selfId && String(x.staff_no || "").trim().toUpperCase() === no);
    if (other) throw new Error("Staff ID number " + no + " is already used by " + other.name + ". Choose another number.");
    return no;
  }
  function editStaffNo(s) {
    formModal("Staff ID number · " + s.name, [{ name: "staff_no", label: "Staff ID number", value: s.staff_no || "", help: "Example: GID-041. Shown on the staff badge." }], async (v) => {
      if (!canManageStaff(me())) throw new Error("Only HR, the MD or the System Admin can change the Staff ID number.");
      const no = checkStaffNo(v.staff_no, s.id);
      await patch("staff", s.id, { staff_no: no }, "Staff ID number of " + s.name + ": " + (no || "removed"));
      toast("Staff ID number saved");
    }, "Save");
  }
  const STRAP_TXT = Array(14).fill("GREEN IN DESIGN").join(" · ");
  const BADGE_CLIP = `<svg class="bdg-clip" viewBox="0 0 48 92" aria-hidden="true"><defs>
      <linearGradient id="bdgm" x1="0" x2="1"><stop offset="0" stop-color="#8d9a92"/><stop offset=".35" stop-color="#f4f7f5"/><stop offset=".6" stop-color="#b9c4bd"/><stop offset="1" stop-color="#6d7a72"/></linearGradient>
      <linearGradient id="bdgs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e8540"/><stop offset="1" stop-color="#1f5f30"/></linearGradient></defs>
    <path d="M9 0h30v12q0 7-7 9H16q-7-2-7-9z" fill="url(#bdgs)"/>
    <ellipse cx="24" cy="24" rx="11" ry="8" fill="none" stroke="url(#bdgm)" stroke-width="3.4"/>
    <rect x="19" y="30" width="10" height="13" rx="3" fill="url(#bdgm)"/>
    <rect x="21.5" y="43" width="5" height="5" fill="url(#bdgm)"/>
    <path d="M24 47c-7 0-10 5-10 11v14c0 9 4 15 10 15s10-6 10-15v-6" fill="none" stroke="url(#bdgm)" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M34 66l-4-8" stroke="url(#bdgm)" stroke-width="3" stroke-linecap="round"/></svg>`;
  let badgeFocus = null;
  function badgeSide(cls, inner, label) {
    return `<div class="bdg-hang ${cls}"><div class="bdg-strap" aria-hidden="true"><span>${STRAP_TXT}</span></div>${BADGE_CLIP}
      <article class="bdg-card" aria-label="${esc(label)}"><i class="bdg-slot" aria-hidden="true"></i>${inner}</article></div>`;
  }
  function openPerson(s) {
    const u = me(); const full = seesAll(u, "people") || s.id === u.id;
    const projects = db.projects.filter((p) => p.pm_id === s.id || db.project_members.some((m) => m.project_id === p.id && m.staff_id === s.id)).map((p) => p.code).join(", ");
    const lates = db.daily_reports.filter((d) => d.author_id === s.id && d.late);
    const tel = String(s.phone || "").replace(/[^\d+]/g, ""), tg = String(s.telegram_user || "").replace(/^@/, "");
    const depts = groupsOf(s).map((g) => DEPT_NAME[g] || GROUPS[g]).filter(Boolean);
    // the same buttons (and the same rules) as before; a button that opens a window first puts the badges away
    const off = (f) => () => { closeBadges(true); f(); };
    const actions = canManageStaff(u) ? (s.left_on ? btn("Restore", off(() => restoreStaff(s)), "primary") : btn("Remove", off(() => removeStaff(s)), "danger") + btn("Edit", off(() => staffForm(s)), "primary"))
      : s.id === u.id ? btn("Edit my phone and Telegram", off(() => formModal("My contact details", [{ name: "phone", label: "Phone number", value: s.phone || "", required: true }, { name: "telegram_user", label: "Telegram username", value: s.telegram_user || "" }], async (v) => { await patch("staff", s.id, v, "Contact details updated: " + s.name); })), "primary") : "";
    const row = (k, v) => v === null ? "" : `<div class="bdg-row"><dt>${esc(k)}</dt><dd>${v === "" || v == null ? "—" : v}</dd></div>`;
    const front = `<div class="bdg-mark" aria-hidden="true"><img src="img/logo-mark.png" alt=""></div>
      <div class="bdg-top"><span class="bdg-co">GREEN IN DESIGN</span>${s.left_on ? `<span class="bdg-left">Left on ${esc(fmtDate(s.left_on))}</span>` : `<span class="bdg-kind">Staff</span>`}</div>
      <div class="bdg-photo">${avatar(s, "bdg-ph")}</div>
      <div class="bdg-who"><h2 class="bdg-name">${esc(s.name)}</h2>${s.short_name && s.short_name !== s.name ? `<p class="bdg-short">“${esc(s.short_name)}”</p>` : ""}</div>
      <hr><div class="bdg-pos"><small>Position</small><b>${esc(s.title)}</b></div><hr>
      <div class="bdg-foot"><span class="bdg-id"><small>Staff ID</small><b>${esc(staffNo(s))}</b>${canManageStaff(u) && !s.left_on ? `<button type="button" class="bdg-noedit" data-act="${act(off(() => editStaffNo(s)))}" aria-label="Change Staff ID number" title="Change Staff ID number">✎</button>` : ""}</span><span class="bdg-dept"><small>Department</small><b>${depts.map((d) => `<span>${esc(d)}</span>`).join("")}</b></span></div>`;
    const back = `<div class="bdg-brand"><img src="img/logo-mark.png" alt="GID"><span><b>Green In Design</b><small>Structure · Architecture · MEP · ELV</small></span></div>
      <dl class="bdg-info">${[
        row("Phone", s.phone ? `<a href="tel:${esc(tel)}">${esc(s.phone)}</a>` : '<span class="bdg-muted">Not set</span>'),
        tg ? row("Telegram", `<a href="https://t.me/${esc(tg)}" target="_blank" rel="noopener">@${esc(tg)}</a>`) : "",
        s.email ? row("Email", `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`) : "",
        s.start_date ? row("Start date", fmtDate(s.start_date)) : "", s.desk ? row("Desk / location", esc(s.desk)) : "",
        s.left_on ? row("Left on", esc(fmtDate(s.left_on))) : "",
        row("Projects", esc(projects)),
        groupsOf(s).includes("SITE") ? row("Late morning reports", lates.length ? `<b class="late">${lates.length}</b> <small>(${lates.filter((d) => String(d.report_date).slice(0, 7) === today().slice(0, 7)).length} this month)</small>` : "0") : "",
        full ? row("Leave taken (approved days)", esc(leaveTaken(s.id))) : "", full ? row("System tags", esc(s.tags)) : "",
        full ? row("Telegram alerts", String(s.telegram_chat_id || "").trim() ? "Linked" : "Not linked") : ""].join("")}</dl>
      <div class="bdg-foot bdg-foot-b"><span>Structure</span><span>Architecture</span><span>MEP</span><span>ELV</span></div>`;
    const old = document.querySelector("body > #badges, body > #badges-out"); if (old) old.remove();
    badgeFocus = document.activeElement;
    const w = document.createElement("div"); w.id = "badges"; w.className = "bdg-wrap prep";
    w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-label", "Staff badge · " + s.name);
    w.innerHTML = `<button type="button" class="bdg-back" data-act="${act(() => closeBadges())}" aria-label="Back">${svgI("back")}<span>Back</span></button>
      <div class="bdg-stage">${badgeSide("front", front, "Front of the badge")}${badgeSide("back", back, "Back of the badge")}</div>
      <div class="bdg-dots" aria-hidden="true"><i class="on"></i><i></i></div><p class="bdg-hint">Swipe to see the back of the badge</p>
      ${actions ? `<div class="bdg-actions">${actions}</div>` : ""}`;
    w.addEventListener("click", (e) => { if (e.target === w || e.target.classList.contains("bdg-stage")) closeBadges(); });
    document.body.appendChild(w);
    if (typeof translateNow === "function") translateNow(w);
    // the strap reaches from the top edge of the screen down to the clip; the swing turns around that top point
    const stage = w.querySelector(".bdg-stage"), dots = w.querySelectorAll(".bdg-dots i");
    w.querySelectorAll(".bdg-hang").forEach((h) => { h.style.setProperty("--sl", String(Math.max(40, Math.round(h.getBoundingClientRect().top)))); });
    stage.addEventListener("scroll", () => { const i = stage.scrollLeft > stage.clientWidth / 2 ? 1 : 0; dots.forEach((d, k) => d.classList.toggle("on", k === i)); }, { passive: true });
    w.classList.remove("prep"); w.classList.add("in");
    try { w.querySelector(".bdg-back").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // instant = true: remove at once (another window opens, the screen changes). Otherwise the badges are pulled up out of the screen.
  function closeBadges(instant) {
    const w = document.querySelector("body > #badges"); if (!w) return false;
    w.id = "badges-out"; syncLayers(); // no longer counts as an open layer (phone Back and the scroll lock see that at once)
    const done = () => { if (w.parentNode) w.remove(); };
    const f = badgeFocus; badgeFocus = null;
    if (instant) done();
    else {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      w.classList.remove("in"); w.classList.add("out"); setTimeout(done, reduce ? 220 : 520);
    }
    if (f && f.isConnected && f.focus) try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return true;
  }
  // The badges sit above the page; a window opened later sits above the badges. True when the badges are the top layer.
  const badgesOnTop = () => { const b = document.querySelector("body > #badges"), m = $("#modal"); return !!b && !(m && (b.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)); };
  // ================= organization charts (same look as the GID company org chart) =================
  // Departments in the order of the company chart: Administration, Finance, Quantity Surveyor, Engineering & Technical, Architect, Project
  const ORG_DEPTS = [["ADMIN", "Administration"], ["FIN", "Finance"], ["QS", "Quantity Surveyor"], ["ENG", "Engineering & Technical"], ["DESIGN", "Architect"], ["PROJECT", "Project"]];
  const sidNo = (s) => Number(String(s.id).replace(/\D/g, "")) || 999;
  // Seniority inside a department: managers and directors, then senior staff, then staff, then interns
  const orgTier = (s) => /\bMD\b/.test(s.tags || "") ? 0 : /director|manager|head/i.test(s.title) ? 1 : /senior/i.test(s.title) ? 2 : /intern/i.test(s.title) ? 4 : 3;
  const orgSort = (a, b) => orgTier(a) - orgTier(b) || sidNo(a) - sidNo(b);
  function orgDeptOf(s) { const g = groupsOf(s); if (g.includes("EXEC")) return "EXEC"; if (g[0] === "PM" || g[0] === "SITE") return "PROJECT"; return g[0] || "ADMIN"; }
  // Rows inside a department: one row for each level, like the company chart
  function orgRows(list, dept) {
    if (dept === "PROJECT") {
      const pms = list.filter((s) => groupsOf(s)[0] === "PM").sort(orgSort), site = list.filter((s) => groupsOf(s)[0] !== "PM").sort(orgSort);
      return [pms, site].filter((r) => r.length);
    }
    const rows = {}; list.slice().sort(orgSort).forEach((s) => { const t = Math.max(1, orgTier(s)); (rows[t] = rows[t] || []).push(s); });
    return Object.keys(rows).sort().map((k) => rows[k]);
  }
  const ocNode = (s, cls) => `<button type="button" class="ocn${cls ? " " + cls : ""}" data-act="${act(() => openPerson(s))}">${avatar(s, "ocp")}<b>${esc(s.name)}</b><i>${esc(s.title)}</i></button>`;
  // o = { levels: [[staff], [staff]] (top of the chart), branches: [{ label, rows: [[staff]], empty }] }
  function orgChartHtml(o) {
    const lv = (o.levels || []).filter((l) => l && l.length);
    return `<div class="oc">${lv.map((l, i) => `${i ? '<div class="oc-v"></div>' : ""}${l.label ? `<span class="oc-l top">${esc(l.label)}</span>` : ""}<div class="oc-top">${l.map((s) => ocNode(s, i ? "" : "lead")).join("")}</div>`).join("")}
      ${o.branches.length ? `<div class="oc-v"></div><div class="oc-br${o.grid ? " " + o.grid : ""}${o.branches.length <= 2 ? " few" : ""}"${o.grid ? "" : ` style="--occols:${o.branches.length}"`}>${o.branches.map((b, i, all) => `<section class="oc-d ${b.cls || ((i === 0 ? "rs " : "") + (i === all.length - 1 ? "re" : ""))}">${/trunk/.test(b.cls || "") ? '<i class="oc-trunk"></i>' : ""}<span class="oc-l">${esc(b.label)}</span>${b.rows.length ? b.rows.map((r) => `<div class="oc-r">${r.map((s) => ocNode(s)).join("")}</div>`).join("") : `<p class="muted small oc-none">${esc(b.empty || "Not assigned yet")}</p>`}</section>`).join("")}</div>` : ""}</div>`;
  }
  function companyOrg(filter) {
    const list = staffNow().filter(filter || (() => true));
    const top = list.filter((s) => orgDeptOf(s) === "EXEC").sort(orgSort);
    // Same layout as the company chart: Administration and Finance; then QS, Engineering and Architect; then Project across the full width
    // Row 1: Administration, Finance, Quantity Surveyor, Engineering & Technical. Row 2: Architect and Project.
    const LAYOUT = { ADMIN: "c3 rs", FIN: "c3 trunk", QS: "c3", ENG: "c3 re", DESIGN: "c6 rs", PROJECT: "c6 re" };
    const branches = ORG_DEPTS.map(([k, label]) => { const inDept = list.filter((s) => orgDeptOf(s) === k); return { label, rows: orgRows(inDept, k), n: inDept.length, cls: LAYOUT[k] }; }).filter((b) => b.n);
    const full = branches.length === ORG_DEPTS.length;
    if (!full) branches.forEach((b, i, all) => { b.cls = (i === 0 ? "rs " : "") + (i === all.length - 1 ? "re" : ""); });
    return orgChartHtml({ levels: [top], branches, grid: full ? "co" : "" });
  }
  // A project's own org chart: Managing Director, the Project Manager, then the teams assigned to the project
  function projectOrgData(p) {
    const md = withTag("MD")[0], pm = byId("staff", p.pm_id);
    const mem = (g) => teamOf(p.id, g).map((m) => byId("staff", m.staff_id)).filter((x) => x && !x.left_on).filter((s, i, a) => a.indexOf(s) === i && s.id !== p.pm_id);
    const site = mem("SITE").sort(orgSort);
    const branches = [
      { label: "Site team", rows: [site.filter((s) => orgTier(s) <= 1), site.filter((s) => orgTier(s) === 2), site.filter((s) => orgTier(s) >= 3)].filter((r) => r.length), empty: "No site team assigned yet" },
      { label: "Quantity Surveyor", rows: orgRows(mem("QS"), "QS"), empty: "No QS assigned yet" },
      { label: "Architect", rows: orgRows(mem("DESIGN"), "DESIGN"), empty: "No designer assigned yet" }
    ];
    branches.push({ label: "Engineering & Technical", rows: orgRows(mem("ENG"), "ENG"), empty: "Not assigned" });
    return { levels: [md ? [md] : [], pm ? Object.assign([pm], { label: "Project Manager" }) : []], branches };
  }
  async function orgChartPdf(p, lang) {
    const km = lang === "km", data = projectOrgData(p), host = document.createElement("div");
    // notr: the screen translator must never touch the hidden print copy (the English chart stays English in a Khmer app)
    host.className = "oc-print notr" + (km ? " km" : "");
    host.innerHTML = `<div class="ocp-head">${pdfLogo()}<div class="ocp-title"><h1>${km ? kmTitle("តារាងរចនាសម្ព័ន្ធគម្រោង", lang) : "Project Organization Chart"}</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b> · ${esc(p.client || "")} · ${esc(p.location || "")}</p></div></div>`
      + orgChartHtml(data).replace(/data-act="[^"]*"/g, "").replace(/ loading="lazy"/g, ' loading="eager"') + `<div class="ocp-foot"><span>${km ? "បង្កើតដោយប្រព័ន្ធគ្រប់គ្រង GID · " : "GID Management System · generated "}${esc(pdfGenerated(lang))}</span><span>${esc(p.code)}</span></div>`;
    if (km) host.querySelectorAll(".oc-l, .oc-none, .ocn i").forEach((el) => { el.textContent = kmText(el.textContent); });
    host.querySelectorAll(".oc-l.top").forEach((el) => el.remove());
    toast(km ? "កំពុងបង្កើត PDF…" : "Making the PDF…");
    document.body.appendChild(host);
    try {
      await Promise.all(PDF_LIBS.map(loadScript));
      pdfCss();
      await Promise.race([Promise.all(['400 13px "GID Khmer"', '700 13px "GID Khmer"'].map((f) => document.fonts.load(f, "កខគ"))).then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
      // photos in the hidden copy must load now (lazy photos off screen never load), and never wait more than 8 seconds
      await Promise.race([Promise.all([...host.querySelectorAll("img")].map((im) => im.complete && im.naturalWidth ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))), new Promise((r) => setTimeout(r, 8000))]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await window.html2canvas(host, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      const w = 297, h = Math.min(210, (canvas.height / canvas.width) * w), iw = h < 210 ? w : (canvas.width / canvas.height) * 210;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", (297 - iw) / 2, 0, iw, h);
      host.remove();
      pdfDeliver(pdf.output("blob"), p.code + "-OrgChart-" + (km ? "KH" : "EN") + ".pdf");
    } catch (err) { host.remove(); toast(err.message || String(err), true); }
  }
  function openProjectOrg(p) {
    openModal("Org chart · " + p.code, `<p class="muted small">${esc(p.name)} · made from the team assigned in Manage team. Tap a person to see details.</p>${orgChartHtml(projectOrgData(p))}
      <div class="form-actions">${canManageProject(me(), p.id) ? btn("Manage team", () => manageTeam(p)) : ""}${btn("PDF English", () => orgChartPdf(p, "en"), "primary")}${btn("PDF ខ្មែរ", () => orgChartPdf(p, "km"), "primary")}</div>`, (m) => m.querySelector(".modal").classList.add("wide"));
  }

  SCREENS.people = (u) => {
    const rows = staffNow().filter((s) => matchSearch(s, ["name", "title", "phone", "staff_no"]));
    if (state.tab.people === "accounts" && !canAccounts(u)) state.tab.people = "chart";
    const t = tabs("people", [["chart", "Org chart"], ["list", "List"]].concat(canAccounts(u) ? [["accounts", "Accounts"]] : []));
    let content;
    if (t.cur === "accounts") content = accountsTab(u);
    else if (t.cur === "chart") content = rows.length ? `<section class="card occard">${companyOrg((s) => rows.includes(s))}</section>` : '<div class="empty">No one matches.</div>';
    else {
      const top = rows.filter((s) => orgDeptOf(s) === "EXEC");
      const depts = [["EXEC", "Managing Director"]].concat(ORG_DEPTS).map(([k, label]) => { const list = (k === "EXEC" ? top : rows.filter((s) => orgDeptOf(s) === k)); const ordered = k === "EXEC" ? list : [].concat(...orgRows(list, k));
        return ordered.length ? `<section class="card"><h2>${esc(label)} <span class="count">${ordered.length}</span></h2><ul class="people">${ordered.map((s) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>${esc(s.title)}${groupsOf(s).length > 1 ? " · also " + esc(groupsOf(s).slice(1).map((x) => GROUPS[x]).join(", ")) : ""}</small></li>`).join("")}</ul></section>` : ""; }).join("");
      content = `<div class="grid2">${depts}</div>`;
    }
    const former = db.staff.filter((s) => s.left_on);
    if (t.cur === "list" && former.length && canManageStaff(u)) content += `<section class="card"><h2>Former staff <span class="count">${former.length}</span></h2><ul class="people">${former.map((s) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>${esc(s.title)} · left ${esc(fmtDate(s.left_on))}</small></li>`).join("")}</ul></section>`;
    return `<h1>People</h1><p class="muted">${staffNow().length} staff. HR owner: ${esc(withTag("HR").map((s) => s.name).join(", "))}.</p>${t.html}${toolbar(u, { project: false, buttons: canManageStaff(u) && t.cur !== "accounts" ? btn("Add staff", () => staffForm(null), "primary") : "" })}${content}`;
  };

  // ---------- DASHBOARD ----------
  const SVGI = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    schedule: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
    vo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
    subs: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14.5c1.8.9 3 2.9 3 5.5"/>',
    handover: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="m9 14 2 2 4-4"/>',
    svr: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><path d="M9.5 10.5l1.8 1.8 3.4-3.6"/>',
    dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    requests: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
    projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    daily: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16"/>',
    docs: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    cost: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    procurement: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.5"/>',
    stock: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    finance: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/>',
    qaqc: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    safety: '<path d="M4 15a8 8 0 0 1 16 0v2H4z"/><path d="M12 7V4M9 15v2M15 15v2"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.7 2.5 3 5.2"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3-1.6M12 6v2M12 16v2"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    map: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    telegram: '<path d="M21.5 4.5 2.8 11.7c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.4c.3.8 1.3 1 1.9.4l2.6-2.5 4.7 3.5c.7.5 1.7.1 1.9-.7l3-14.6c.2-1-.8-1.8-1.9-1.4z"/><path d="m8 15 10-8"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "Cable and wire": '<path d="M7 3v5a5 5 0 0 0 10 0V3M5 3h4M15 3h4M12 13v8"/>',
    "Pipes and fittings": '<path d="M4 9h10a3 3 0 0 1 3 3v8M4 5v8M20 20h-6"/>',
    "Drywall and ceiling": '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>',
    "Lighting and devices": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    "Paint and finishes": '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-1.5 1-3.5-2-6z"/>',
    "Fire and ELV": '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>'
  };
  const svgI = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVGI[k] || SVGI.stock}</svg>`;
  const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const CHARTS = {};
  const AFTER = [];

  function donut(id, items, fmt, centerLabel, centerSub, onSelect) {
    const total = sum(items, (i) => i.value);
    const r = 70, C = 2 * Math.PI * r, live = items.filter((i) => i.value > 0).length, gap = live > 1 ? 3 : 0;
    let off = 0;
    CHARTS[id] = { items, fmt, total, centerLabel, centerSub, onSelect, active: null };
    const slices = items.map((it, i) => {
      if (!(it.value > 0)) return "";
      const len = (it.value / (total || 1)) * C;
      const s = `<circle class="sl" data-i="${i}" data-act="${act(() => selectDonut(id, i))}" cx="95" cy="95" r="${r}" fill="none" stroke="${it.color}" stroke-width="24" stroke-dasharray="${Math.max(0.1, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 95 95)"><title>${esc(it.label)}: ${esc(fmt(it.value))}</title></circle>`;
      off += len; return s;
    }).join("");
    return `<div class="donut-wrap" id="${id}"><div class="donut"><svg viewBox="0 0 190 190" role="img" aria-label="${esc(centerLabel)}">${total ? slices : `<circle cx="95" cy="95" r="${r}" fill="none" stroke="var(--line)" stroke-width="24"/>`}</svg>
      <div class="donut-c"><small data-c="label">${esc(centerLabel)}</small><b data-c="value">${esc(fmt(total))}</b><span data-c="sub">${esc(centerSub)}</span></div></div>
      <div class="legend">${items.map((it, i) => `<button class="lg" data-i="${i}" data-act="${act(() => selectDonut(id, i))}"><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${esc(fmt(it.value))} · ${pct(it.value, total)}%</b></button>`).join("")}</div></div>`;
  }
  function selectDonut(id, i) {
    const C = CHARTS[id], root = document.getElementById(id); if (!C || !root) return;
    C.active = C.active === i ? null : i;
    const on = C.active;
    root.querySelector(".donut").classList.toggle("has-on", on != null);
    root.querySelectorAll("[data-i]").forEach((el) => el.classList.toggle("on", on != null && Number(el.dataset.i) === on));
    const it = on != null ? C.items[on] : null;
    root.querySelector('[data-c="label"]').textContent = it ? it.label : C.centerLabel;
    root.querySelector('[data-c="value"]').textContent = C.fmt(it ? it.value : C.total);
    root.querySelector('[data-c="sub"]').textContent = it ? pct(it.value, C.total) + "% of total" : C.centerSub;
    if (C.onSelect) C.onSelect(on);
  }

  // Line chart with crosshair; drawn after the page is in the DOM, at real pixel size
  let lineRO = null;
  function lineChart(el, labels, series, fmt) {
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
    const draw = () => {
      const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
      const pad = { l: 48, r: 12, t: 10, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const top = Math.max(1, ...series.flatMap((s) => s.values)), mag = Math.pow(10, Math.floor(Math.log10(top)));
      const step = [0.2, 0.25, 0.5, 1, 2].map((f) => f * mag).find((st) => top / st <= 5) || mag;
      const max = Math.ceil(top / step) * step;
      const X = (i) => pad.l + (labels.length < 2 ? iw / 2 : (i / (labels.length - 1)) * iw), Y = (v) => pad.t + ih - (v / max) * ih;
      const small = W < 420;
      const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
      const k = (v) => (v >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + v);
      svg.innerHTML = ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t ? k(t) : "0"}</text>`).join("")
        + labels.map((m, i) => (!small || (labels.length - 1 - i) % 2 === 0) ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${esc(m)}</text>` : "").join("")
        + series.map((s) => `<path d="${s.values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`).join("")
        + series.map((s) => s.values.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join("")).join("")
        + `<line class="xh" y1="${pad.t}" y2="${pad.t + ih}" stroke="var(--ink-2)" stroke-dasharray="3 3" opacity="0"/>`
        + series.map((s, j) => `<circle class="xp" data-j="${j}" r="7" fill="${s.color}" stroke="#fff" stroke-width="3" opacity="0"/>`).join("")
        + `<rect class="hit" x="${pad.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>`;
      const show = (e) => {
        const rr = svg.getBoundingClientRect(), x = e.clientX - rr.left;
        const i = Math.max(0, Math.min(labels.length - 1, Math.round(((x - pad.l) / iw) * (labels.length - 1))));
        const xh = svg.querySelector(".xh"); xh.setAttribute("x1", X(i)); xh.setAttribute("x2", X(i)); xh.setAttribute("opacity", 1);
        svg.querySelectorAll(".xp").forEach((c) => { const s = series[c.dataset.j]; c.setAttribute("cx", X(i)); c.setAttribute("cy", Y(s.values[i])); c.setAttribute("opacity", 1); });
        tip.innerHTML = `<b>${esc(labels[i])}</b>` + series.map((s) => `<span><span><i style="background:${s.color}"></i>${esc(s.name)}</span>${esc(fmt(s.values[i]))}</span>`).join("");
        const tw = tip.offsetWidth; let left = X(i) + 14; if (left + tw > W) left = X(i) - tw - 14;
        tip.style.left = Math.max(0, left) + "px"; tip.style.top = Math.max(0, Math.min(Y(Math.max(...series.map((s) => s.values[i]))) - 20, H - 90)) + "px"; tip.style.opacity = 1;
      };
      const hide = () => { tip.style.opacity = 0; svg.querySelectorAll(".xh,.xp").forEach((c) => c.setAttribute("opacity", 0)); };
      const hit = svg.querySelector(".hit");
      hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
    };
    if (lineRO) lineRO.disconnect();
    lineRO = new ResizeObserver(draw); lineRO.observe(svg);
  }

  // Cambodia map with project pins (positions come from each project's latitude and longitude)
  // ---------- Interactive project map (zoom, pan, bubbles sized by value, coloured by schedule health) ----------
  const CITIES = [["Phnom Penh", 11.556, 104.928], ["Siem Reap", 13.362, 103.86], ["Battambang", 13.095, 103.202], ["Sihanoukville", 10.627, 103.522], ["Kampot", 10.594, 104.164],
    ["Kampong Cham", 11.993, 105.465], ["Kratie", 12.488, 106.019], ["Stung Treng", 13.525, 105.969], ["Poipet", 13.659, 102.564], ["Koh Kong", 11.616, 102.984], ["Banlung", 13.739, 106.987], ["Takeo", 10.99, 104.785]];
  function projHealth(p) {
    const st = Date.parse(p.start_date), en = Date.parse(p.end_date), now = Date.now();
    const plan = isFinite(st) && isFinite(en) && en > st ? Math.max(0, Math.min(100, (now - st) / (en - st) * 100)) : null;
    const gap = plan == null ? 0 : (Number(p.progress) || 0) - plan;
    if (p.status === "Completed") return { key: "done", label: "Completed", plan, gap };
    if (p.status === "On hold") return { key: "hold", label: "On hold", plan, gap };
    return gap >= -5 ? { key: "ok", label: "On track", plan, gap } : gap >= -15 ? { key: "risk", label: "At risk", plan, gap } : { key: "late", label: "Behind", plan, gap };
  }
  const moneyShort = (v) => { v = Number(v) || 0; return v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M" : v >= 1e4 ? "$" + Math.round(v / 1e3) + "k" : money(v); };
  function projectMap(projs) {
    const M = window.GID_MAP; if (!M) return empty("Map not loaded.");
    const P = M.proj, mp = (lon, lat) => [(lon - P.lon0) * P.k * P.sx, (P.lat1 - lat) * P.sx];
    const located = projs.filter((p) => hasSitePin(p));
    const T = today();
    const info = located.map((p) => {
      const h = projHealth(p), [x, y] = mp(Number(p.lng), Number(p.lat));
      const todayReps = db.daily_reports.filter((d) => d.kind !== "Design" && d.project_id === p.id && d.report_date === T);
      const workers = Math.max(0, ...todayReps.map((d) => Number(d.manpower) || 0), 0);
      const issues = db.defects.filter((x) => x.project_id === p.id && x.status === "Open").length + db.safety.filter((x) => x.project_id === p.id && x.status === "Open").length;
      return { p, h, x, y, workers, issues, reported: todayReps.length > 0 };
    });
    const st = (state.mapUI = state.mapUI || { filter: "all", size: "value", sel: null });
    const maxOf = (k) => Math.max(1, ...info.map((i) => k === "value" ? Number(i.p.contract_value) || 0 : k === "workers" ? i.workers : i.issues));
    const radius = (i) => { const k = st.size, v = k === "value" ? Number(i.p.contract_value) || 0 : k === "workers" ? i.workers : i.issues; return 7 + 17 * Math.sqrt(v / maxOf(k)); };
    const counts = { all: info.length, ok: 0, risk: 0, late: 0 }; info.forEach((i) => { if (counts[i.h.key] != null) counts[i.h.key]++; });
    const totalValue = sum(info, (i) => i.p.contract_value);
    const chip = (k, label) => `<button class="mchip ${st.filter === k ? "on" : ""} ${k}" data-act="${act(() => { st.filter = k; st.sel = null; render(); })}"><i></i>${label}<b>${counts[k] || 0}</b></button>`;
    const sizeBtn = (k, label) => `<button class="${st.size === k ? "on" : ""}" data-act="${act(() => { st.size = k; render(); })}">${label}</button>`;
    const vis = info.filter((i) => st.filter === "all" || i.h.key === st.filter);
    AFTER.push(() => initMap(info, vis, radius, mp));
    return `<div class="mapbi">
      <div class="mapbar">${chip("all", "All")}${chip("ok", "On track")}${chip("risk", "At risk")}${chip("late", "Behind")}
        <div class="mseg" role="group" aria-label="Bubble size">${sizeBtn("value", "Value")}${sizeBtn("workers", "Workers today")}${sizeBtn("issues", "Open issues")}</div></div>
      <div class="mapgrid"><div class="mapstage" id="pmap">
        <svg viewBox="0 0 ${M.W} ${M.H}" role="img" aria-label="Interactive map of Cambodia with GID projects" preserveAspectRatio="xMidYMid meet">
          <defs><radialGradient id="mglow" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1d5a33" stop-opacity=".55"/><stop offset="1" stop-color="#0b1610" stop-opacity="0"/></radialGradient>
            <linearGradient id="mland" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#23593a"/><stop offset="1" stop-color="#173f28"/></linearGradient>
            <filter id="mblur"><feGaussianBlur stdDeviation="6"/></filter>
            <pattern id="mgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#7fd39a" stroke-opacity=".07" stroke-width="1"/></pattern></defs>
          <g class="mview">
            <rect x="-600" y="-600" width="1800" height="1700" fill="url(#mgrid)"/>
            <rect x="0" y="0" width="${M.W}" height="${M.H}" fill="url(#mglow)"/>
            <path d="${M.paths.TH}" class="mn"/><path d="${M.paths.LA}" class="mn"/><path d="${M.paths.VN}" class="mn"/>
            <path d="${M.paths.KH}" class="mkh-glow" filter="url(#mblur)"/><path d="${M.paths.KH}" class="mkh"/>
            <g class="mcities">${CITIES.map(([n, la, lo]) => { const [x, y] = mp(lo, la); return `<g class="mcity" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="2.2"/><text x="5" y="3.5">${esc(n)}</text></g>`; }).join("")}</g>
            <g class="mlinks"></g><g class="mpins"></g>
          </g></svg>
        <div class="mzoom"><button aria-label="Zoom in" data-z="in">+</button><button aria-label="Zoom out" data-z="out">−</button><button aria-label="Show all Cambodia" data-z="reset">⤢</button></div>
        <div class="mtip" role="status"></div>
        <div class="mlegend"><span><i class="ok"></i>On track</span><span><i class="risk"></i>At risk</span><span><i class="late"></i>Behind schedule</span><span class="msz">Bubble size: ${st.size === "value" ? "contract value" : st.size === "workers" ? "workers on site today" : "open issues"}</span></div>
      </div>
      <div class="mside"><div class="mkpi"><div><small>Projects</small><b>${vis.length}</b></div><div><small>Contract value</small><b>${moneyShort(sum(vis, (i) => i.p.contract_value))}</b></div><div><small>Workers today</small><b>${sum(vis, (i) => i.workers)}</b></div></div>
        <ul class="mlist">${vis.sort((a, b) => (Number(b.p.contract_value) || 0) - (Number(a.p.contract_value) || 0)).map((i) => `<li data-pid="${i.p.id}" class="${st.sel === i.p.id ? "on" : ""}" data-act="${act(() => selectMapProject(i.p.id))}">
          <i class="hd ${i.h.key}"></i><span><b>${esc(i.p.code)}</b> ${esc(i.p.name)}<small>${esc(i.p.location || "")} · ${esc(i.h.label)}${i.h.plan != null ? ` · ${esc(i.p.progress)}% vs plan ${Math.round(i.h.plan)}%` : ""}</small>${bar(i.p.progress)}</span>
          <em>${totalValue ? pct(i.p.contract_value, totalValue) : 0}%</em></li>`).join("") || '<li class="muted">No project in this filter.</li>'}</ul></div></div></div>`;
  }
  // Selecting a project highlights it on the map and in the list (cross-filter)
  function selectMapProject(pid) {
    const st = state.mapUI; st.sel = st.sel === pid ? null : pid;
    document.querySelectorAll(".mlist li").forEach((li) => li.classList.toggle("on", li.dataset.pid === st.sel));
    document.querySelectorAll(".mpin").forEach((g) => { g.classList.toggle("on", g.dataset.pid === st.sel); g.classList.toggle("dim", !!st.sel && g.dataset.pid !== st.sel); });
    const g = st.sel && document.querySelector(`.mpin[data-pid="${st.sel}"]`); if (g && window.__mapFocus) window.__mapFocus(st.sel);
    if (!st.sel) { const t = $(".mtip"); if (t) t.classList.remove("show"); }
  }
  function initMap(info, vis, radius, mp) {
    const stage = $("#pmap"); if (!stage) return;
    const svg = stage.querySelector("svg"), view = svg.querySelector(".mview"), pins = svg.querySelector(".mpins"), links = svg.querySelector(".mlinks"), tip = stage.querySelector(".mtip");
    const M = window.GID_MAP, NS = "http://www.w3.org/2000/svg";
    let z = 1, tx = 0, ty = 0;
    const HQ = mp(104.928, 11.556);
    const paint = () => {
      view.setAttribute("transform", `translate(${tx},${ty}) scale(${z})`);
      svg.style.setProperty("--z", z);
      // bubbles keep their screen size while zooming; projects closer than their bubbles are grouped
      pins.innerHTML = ""; links.innerHTML = "";
      const placed = [];
      vis.forEach((i) => {
        const r = radius(i) / Math.sqrt(z);
        const near = placed.find((c) => Math.hypot(c.x - i.x, c.y - i.y) * z < (c.r + r) * z * 0.9);
        if (near) { near.items.push(i); near.r = Math.max(near.r, r) * 1.06; } else placed.push({ x: i.x, y: i.y, r, items: [i] });
      });
      placed.forEach((c) => {
        const l = document.createElementNS(NS, "path"); l.setAttribute("d", `M${HQ[0]} ${HQ[1]} Q ${(HQ[0] + c.x) / 2} ${Math.min(HQ[1], c.y) - 40 / z} ${c.x} ${c.y}`); l.setAttribute("class", "mlink"); links.appendChild(l);
        const g = document.createElementNS(NS, "g"); const one = c.items.length === 1, i0 = c.items[0];
        const worst = c.items.map((x) => x.h.key).sort((a, b) => ["late", "risk", "ok", "hold", "done"].indexOf(a) - ["late", "risk", "ok", "hold", "done"].indexOf(b))[0];
        g.setAttribute("class", "mpin " + worst + (one && state.mapUI.sel === i0.p.id ? " on" : "") + (state.mapUI.sel && !c.items.some((x) => x.p.id === state.mapUI.sel) ? " dim" : ""));
        if (one) g.dataset.pid = i0.p.id;
        g.setAttribute("transform", `translate(${c.x},${c.y})`); g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
        g.setAttribute("aria-label", c.items.map((x) => x.p.code + " " + x.p.name + ", " + x.h.label).join("; "));
        g.innerHTML = `<circle class="ring" r="${c.r * 1.55}"/><circle class="bub" r="${c.r}"/>${one ? (i0.reported ? `<circle class="live" r="${Math.max(2.4, c.r * 0.22)}" cx="${c.r * 0.72}" cy="${-c.r * 0.72}"/>` : "") : `<text class="cnt" y="${4 / Math.sqrt(z)}" style="font-size:${12 / Math.sqrt(z)}px">${c.items.length}</text>`}`;
        const show = (ev) => {
          tip.innerHTML = c.items.map((x) => `<div class="mt"><div class="mt-h"><i class="hd ${x.h.key}"></i><b>${esc(x.p.code)}</b><span>${esc(x.h.label)}</span></div><div class="mt-n">${esc(x.p.name)}</div>
            <div class="mt-g"><span>Progress</span><b>${esc(x.p.progress)}%</b><span>Plan today</span><b>${x.h.plan != null ? Math.round(x.h.plan) + "%" : "–"}</b><span>Contract</span><b>${money(x.p.contract_value)}</b><span>Workers today</span><b>${x.workers || "–"}</b><span>Open issues</span><b class="${x.issues ? "badc" : ""}">${x.issues}</b><span>PM</span><b>${esc(staffName(x.p.pm_id))}</b></div>
            ${bar(x.p.progress)}<button class="btn small primary" data-pid="${x.p.id}">Open project</button></div>`).join("");
          tip.querySelectorAll("button[data-pid]").forEach((b) => b.onclick = () => openProject(byId("projects", b.dataset.pid)));
          const rect = stage.getBoundingClientRect(), pt = g.getBoundingClientRect();
          const cx = pt.left + pt.width / 2 - rect.left, cy = pt.top - rect.top;
          tip.classList.add("show");
          const tw = tip.offsetWidth, th = tip.offsetHeight;
          tip.style.left = Math.max(8, Math.min(rect.width - tw - 8, cx - tw / 2)) + "px";
          tip.style.top = (cy - th - 10 > 8 ? cy - th - 10 : Math.min(rect.height - th - 8, pt.bottom - rect.top + 10)) + "px";
        };
        g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
        g.addEventListener("click", (e) => { e.stopPropagation(); show(e); if (one) selectMapProject(i0.p.id); else zoomTo(c.x, c.y, Math.min(z * 2.4, 14)); });
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); g.dispatchEvent(new MouseEvent("click")); } });
        pins.appendChild(g);
      });
    };
    const box = () => svg.getBoundingClientRect();
    const toSvg = (cx, cy) => { const b = box(), s = M.W / b.width; return [(cx - b.left) * s, (cy - b.top) * s]; };
    const clamp = () => { z = Math.max(1, Math.min(14, z)); const m = 0.15; tx = Math.min(M.W * m, Math.max(M.W * (1 - m) - M.W * z, tx)); ty = Math.min(M.H * m, Math.max(M.H * (1 - m) - M.H * z, ty)); };
    const zoomAt = (sx, sy, nz) => { nz = Math.max(1, Math.min(14, nz)); tx = sx - (sx - tx) * (nz / z); ty = sy - (sy - ty) * (nz / z); z = nz; clamp(); paint(); };
    let anim = 0;
    const zoomTo = (x, y, nz) => {
      cancelAnimationFrame(anim); const z0 = z, tx0 = tx, ty0 = ty, tx1 = M.W / 2 - x * nz, ty1 = M.H / 2 - y * nz, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3); z = z0 + (nz - z0) * e; tx = tx0 + (tx1 - tx0) * e; ty = ty0 + (ty1 - ty0) * e; clamp(); paint(); if (k < 1) anim = requestAnimationFrame(step); };
      anim = requestAnimationFrame(step);
    };
    window.__mapFocus = (pid) => { const i = info.find((x) => x.p.id === pid); if (i) { zoomTo(i.x, i.y, Math.max(z, 5)); setTimeout(() => { const g = stage.querySelector(`.mpin[data-pid="${pid}"]`); if (g) g.dispatchEvent(new MouseEvent("mouseenter")); }, 480); } };
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const [sx, sy] = toSvg(e.clientX, e.clientY); zoomAt(sx, sy, z * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });
    const ptrs = new Map(); let last = null, pinch = null, moved = false;
    svg.addEventListener("pointerdown", (e) => { if (e.target.closest(".mpin")) return; svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
    svg.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const [sx, sy] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomAt(sx, sy, pinch.z * d / pinch.d); moved = true; return; }
      const s = M.W / box().width; tx += (e.clientX - last[0]) * s; ty += (e.clientY - last[1]) * s; last = [e.clientX, e.clientY];
      if (Math.abs(tx) + Math.abs(ty) > 0) moved = true; clamp(); view.setAttribute("transform", `translate(${tx},${ty}) scale(${z})`);
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size && !moved && !e.target.closest(".mpin")) { tip.classList.remove("show"); } };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
    stage.querySelectorAll(".mzoom button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.z === "reset") { zoomTo(M.W / 2, M.H / 2, 1); tip.classList.remove("show"); return; }
      const nz = z * (b.dataset.z === "in" ? 1.6 : 0.62), cx = (M.W / 2 - tx) / z, cy = (M.H / 2 - ty) / z; zoomTo(cx, cy, Math.max(1, Math.min(14, nz)));
    }));
    document.querySelectorAll(".mlist li[data-pid]").forEach((li) => { li.addEventListener("mouseenter", () => document.querySelectorAll(".mpin").forEach((g) => g.classList.toggle("hl", g.dataset.pid === li.dataset.pid))); li.addEventListener("mouseleave", () => document.querySelectorAll(".mpin").forEach((g) => g.classList.remove("hl"))); });
    paint();
    if (state.mapUI.sel) setTimeout(() => window.__mapFocus(state.mapUI.sel), 50);
  }

  // Stock helpers (the level of an item is the sum of its movements)
  const stockQty = (itemId, storeId) => sum(db.stock_moves.filter((m) => m.item_id === itemId && (!storeId || m.store_id === storeId)), (m) => m.qty);
  const stockStatus = (it, q) => (q <= 0 ? "Out of stock" : q < Number(it.min_qty) ? "Low stock" : "OK");
  function stockByCategory() {
    const cats = [...new Set(db.stock_items.map((i) => i.category))];
    return cats.map((c) => {
      const items = db.stock_items.filter((i) => i.category === c).map((i) => ({ it: i, q: stockQty(i.id) }));
      return { c, items, qty: sum(items, (x) => x.q), low: items.filter((x) => x.q < Number(x.it.min_qty)), value: sum(items, (x) => x.q * x.it.unit_cost),
        health: Math.round((sum(items, (x) => Math.min(1, x.q / (2 * (Number(x.it.min_qty) || 1)))) / (items.length || 1)) * 100) };
    });
  }
  function stockCategoryTable(withAll) {
    const rows = stockByCategory();
    let on = null;
    const pickRow = (r, el) => {
      on = on === r.c ? null : r.c;
      el.closest("tbody").querySelectorAll("tr").forEach((tr) => tr.classList.toggle("on", tr === el && on != null));
      const d = $("#sdetail"); if (!d) return;
      d.innerHTML = on ? `<b style="color:var(--ink)">${esc(r.c)}:</b> ` + (r.low.length ? `<span class="badge b-low-stock">${r.low.length} below minimum</span> ` + r.low.map((x) => `${esc(x.it.name)} (${x.q} ${esc(x.it.unit)}, min ${esc(x.it.min_qty)})`).join(" · ") : "All items are at or above their minimum level.") : "Tap a category to see items below their minimum level.";
    };
    return `<table class="stock-t"><thead><tr><th>Category</th><th style="width:22%">Level</th><th class="n">In stock</th><th class="n">Low items</th><th class="n">Value</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="row" data-act="${act((e, el) => pickRow(r, el))}"><td><span class="cat">${svgI(r.c)}${esc(r.c)}</span></td><td><div class="bar ${r.health < 50 ? "bad" : ""}"><span style="width:${r.health}%"></span></div></td><td class="n">${r.qty.toLocaleString()}</td><td class="n">${r.low.length ? `<span class="lowv">${r.low.length}</span>` : '<span class="chip">OK</span>'}</td><td class="n">${money(r.value)}</td></tr>`).join("")}</tbody></table>
      <div class="detail" id="sdetail">Tap a category to see items below their minimum level.</div>`;
  }

  const monthKeys = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i)); return d.toLocaleDateString("en-CA").slice(0, 7); });
  const monthLabel = (k) => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" });

  SCREENS.dashboard = (u) => {
    const projs = myProjects(u), pids = new Set(projs.map((p) => p.id));
    const pend = db.requests.filter((r) => r.status === "Pending" && (!r.project_id || pids.has(r.project_id)));
    const aged = pend.filter((r) => waitDays(r) > 2);
    const mc = db.monthly_costs.filter((m) => pids.has(m.project_id));
    const keys = monthKeys(12), thisM = keys[11], lastM = keys[10];
    // spent = costs booked by the QS for the month + every supplier/subcontractor bill and payment request paid in the app that month
    const paidAP = db.invoices.filter((i) => i.direction === "Payable" && i.status === "Paid" && i.paid_at && (!i.project_id || pids.has(i.project_id)));
    const spentM = (k) => sum(mc.filter((m) => m.month === k), (m) => m.spent) + sum(paidAP.filter((i) => dateInPP(i.paid_at).slice(0, 7) === k), (i) => i.amount);
    const chg = pct(spentM(thisM) - spentM(lastM), spentM(lastM) || 1);
    const ar = db.invoices.filter((i) => i.direction === "Receivable" && i.status === "Unpaid" && pids.has(i.project_id));
    const arOver = ar.filter((i) => i.due_date < today());
    const started = db.projects.filter((p) => pids.has(p.id) && daysSince(p.start_date) <= 60).length;
    const kpi = (label, value, icon, sub, route) => `<a class="kpi" href="#${route}"><span class="ic">${svgI(icon)}</span><div><small>${esc(label)}</small><b>${value}</b><span class="chg">${sub}</span></div></a>`;
    const kpis = `<section class="kpis">
      ${kpi("Active projects", projs.filter((p) => p.status === "Active").length, "projects", started ? `<span class="up">↑ ${started}</span> started in 60 days` : "no new starts", "projects")}
      ${kpi("Approvals waiting", pend.length, "requests", aged.length ? `<span class="dn">${aged.length}</span> over 2 days` : '<span class="up">none</span> over 2 days', "requests")}
      ${kpi("Spent this month", money(spentM(thisM)), "money", `<span class="${chg > 0 ? "dn" : "up"}">${chg > 0 ? "↑" : "↓"} ${Math.abs(chg)}%</span> vs last month`, "cost")}
      ${kpi("To collect", money(sum(ar, (i) => i.amount)), "finance", `${ar.length} invoice${ar.length === 1 ? "" : "s"}${arOver.length ? ` · <span class="dn">${arOver.length} overdue</span>` : ""}`, "finance")}</section>`;

    // Line chart: spent vs billed by month, monthly or running total
    const mode = state.tab.dashLine || "run", span = Number(state.tab.dashSpan || 6);
    const ks = keys.slice(12 - span);
    const raw = (f) => ks.map((k) => sum(mc.filter((m) => m.month === k), f));
    const run = (a) => a.reduce((o, v, i) => (o.push((o[i - 1] || 0) + v), o), []);
    const arPaid = db.invoices.filter((i) => i.direction === "Receivable" && i.created_at && (!i.project_id || pids.has(i.project_id)));
    const sp = ks.map(spentM), bl = ks.map((k) => sum(mc.filter((m) => m.month === k), (m) => m.billed) + sum(arPaid.filter((i) => dateInPP(i.created_at).slice(0, 7) === k), (i) => i.amount));
    const series = [{ name: "Spent", color: "var(--s1)", values: mode === "run" ? run(sp) : sp }, { name: "Billed to clients", color: "var(--s2)", values: mode === "run" ? run(bl) : bl }];
    AFTER.push(() => { const el = $("#dline"); if (el) lineChart(el, ks.map(monthLabel), series, money); });
    const segBtn = (key, val, label) => `<button class="${(state.tab[key] || (key === "dashLine" ? "run" : "6")) === val ? "on" : ""}" data-act="${act(() => { state.tab[key] = val; render(); })}">${label}</button>`;

    // Recent requests
    const recent = db.requests.filter((r) => !r.project_id || pids.has(r.project_id)).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const stCls = (r) => (r.status === "Pending" ? "st-wait" : r.status === "Approved" ? (db.purchase_orders.some((p) => p.request_id === r.id) ? "st-po" : "st-ok") : "st-bad");
    const stTxt = (r) => (r.status === "Pending" ? "Waiting · " + stepWho((r.steps || [])[r.step_index]) : r.status === "Approved" && db.purchase_orders.some((p) => p.request_id === r.id) ? "PO " + db.purchase_orders.find((p) => p.request_id === r.id).status.toLowerCase() : r.status);
    const reqIcon = (t) => (["Material", "Purchase"].includes(t) ? "stock" : ["Payment", "Petty cash"].includes(t) ? "money" : "clock");
    const recentHtml = `<ul class="ship">${recent.map((r) => `<li data-act="${act(() => openRequest(r))}"><span class="ic">${svgI(reqIcon(r.type))}</span><span><b>${esc(r.ref_no)} ${esc(r.title)}</b><small><span class="st ${stCls(r)}">${esc(stTxt(r))}</span> · ${esc(projLabel(r.project_id) || "Office")} · ${fmtDate(r.created_at)}</small></span></li>`).join("")}</ul>`;

    // Spend by category donut (top three cost lines, the rest grouped)
    const lines = db.cost_lines.filter((c) => pids.has(c.project_id));
    const byCat = {}; lines.forEach((l) => { byCat[l.category] = (byCat[l.category] || 0) + Number(l.actual); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 3).concat(cats.length > 3 ? [["Other", sum(cats.slice(3), (c) => c[1])]] : []);
    const dn = donut("d-cat", top.map(([l, v], i) => ({ label: l, value: v, color: SERIES[i] })), money, "Total spent", "tap a slice");

    // Stock overview
    const sItems = db.stock_items.map((i) => ({ it: i, q: stockQty(i.id) }));
    const sValue = sum(sItems, (x) => x.q * x.it.unit_cost), sLow = sItems.filter((x) => x.q < Number(x.it.min_qty)).length;
    const storeVals = db.stores.map((s) => ({ s, v: sum(db.stock_items, (i) => stockQty(i.id, s.id) * i.unit_cost) }));
    const maxV = Math.max(1, ...storeVals.map((x) => x.v));
    const stockDark = `<div class="kv"><span>Stores</span><b>${db.stores.length}</b></div><div class="kv"><span>Items tracked</span><b>${db.stock_items.length}</b></div>
      <div class="kv"><span>Stock value</span><b>${money(sValue)}</b></div><div class="kv" style="border:0"><span>Below minimum</span><b style="color:var(--accent-2)">${sLow}</b></div>
      <ul class="stores">${storeVals.map((x) => `<li><span>${esc(x.s.name)}</span><span>${money(x.v)}</span><div class="bar"><span style="width:${pct(x.v, maxV)}%"></span></div></li>`).join("")}</ul>`;

    // Week calendar
    const ws = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; });
    const isoDays = days.map((d) => d.toLocaleDateString("en-CA"));
    const evs = [];
    db.tasks.filter((t) => pids.has(t.project_id) && t.status !== "Done" && isoDays.includes(t.due_date)).forEach((t) => evs.push({ lane: 0, d: t.due_date, cls: "task", t: t.title, s: projLabel(t.project_id), go: () => openTask(t) }));
    db.documents.filter((x) => pids.has(x.project_id) && ["Draft", "In review"].includes(x.status) && isoDays.includes(x.due_date)).forEach((x) => evs.push({ lane: 1, d: x.due_date, cls: "doc", t: x.doc_no + " " + x.title, s: x.status, go: () => openDoc(x) }));
    db.requests.filter((r) => r.status === "Pending" && (!r.project_id || pids.has(r.project_id)) && isoDays.includes(r.needed_by)).forEach((r) => evs.push({ lane: 2, d: r.needed_by, cls: "req", t: r.title, s: r.ref_no, go: () => openRequest(r) }));
    db.inspections.filter((i) => pids.has(i.project_id) && isoDays.includes(i.insp_date)).forEach((i) => evs.push({ lane: 3, d: i.insp_date, cls: "insp", t: i.title, s: i.result, done: i.result !== "Open", go: () => openInspection(i) }));
    const week = `<div class="week-scroll"><div class="week"><div></div>${days.map((d) => `<div class="dh ${d.toLocaleDateString("en-CA") === today() ? "today" : ""}">${esc(d.toLocaleDateString("en-GB", { weekday: "short" }))}<b>${d.getDate()}</b></div>`).join("")}
      ${["Tasks", "Drawings", "Requests", "Inspections"].map((l, li) => `<div class="lane-label">${l}</div>${isoDays.map((d) => `<div class="cell">${evs.filter((e) => e.lane === li && e.d === d).map((e) => `<button class="ev ${e.cls} ${d < today() && !e.done ? "late" : ""}" data-act="${act(e.go)}"><b>${esc(e.t)}</b>${esc(e.s)}</button>`).join("")}</div>`).join("")}`).join("")}</div></div>`;

    const approvals = `<ul class="ship">${pend.slice().sort((a, b) => waitDays(b) - waitDays(a)).slice(0, 5).map((r) => { const w = Math.floor(waitDays(r)); return `<li data-act="${act(() => openRequest(r))}"><span class="ic">${svgI(reqIcon(r.type))}</span><span><b>${esc(r.title)}</b><small>Step ${r.step_index + 1}/${r.steps.length} · ${esc(waitingOn(r).split(",")[0])} · <span class="${w > 2 ? "dn" : ""}">${w}d</span></small></span></li>`; }).join("") || '<li><span></span><span>Nothing waiting</span></li>'}</ul>`;

    const days7 = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString("en-CA"));
    const pcards = `<div class="pcards">${projs.map((p) => { const L = db.cost_lines.filter((c) => c.project_id === p.id); const cu = pct(sum(L, (l) => l.actual), sum(L, (l) => l.budget));
      return `<button class="pcard" data-act="${act(() => openProject(p))}"><span class="code">${esc(p.code)} · ${esc(p.location || "")} · ${esc(staffName(p.pm_id))}</span><h3>${esc(p.name)}</h3>
        <div class="mini"><span>Progress</span>${bar(p.progress)}<b>${esc(p.progress)}%</b></div>
        <div class="mini"><span>Cost used</span>${bar(cu, cu > Number(p.progress) + 10)}<b>${cu}%</b></div>
        <div class="mini"><span>Reports</span><span class="dots7">${days7.map((d) => `<i class="${db.daily_reports.some((r) => r.project_id === p.id && r.report_date === d) ? "y" : ""}"></i>`).join("")}</span><b>${db.daily_reports.filter((r) => r.project_id === p.id && days7.includes(r.report_date)).length}/7</b></div></button>`; }).join("")}</div>`;
    const flagged = db.purchase_orders.filter((p) => p.split_flag && pids.has(p.project_id));
    const adminActs = db.audit_log.filter((a) => /permission|assigned|removed/i.test(a.summary + a.action)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 4);
    const mon = today().slice(0, 7);
    const monthSite = db.daily_reports.filter((d) => d.kind !== "Design" && String(d.report_date).slice(0, 7) === mon && inScope(u, d.project_id));
    const lateBy = {}; monthSite.filter((d) => d.late).forEach((d) => { lateBy[d.author_id] = (lateBy[d.author_id] || []).concat([d]); });
    const awayN = monthSite.filter((d) => d.loc_status === "Away from site" || d.loc_status === "No location");
    const lateHtml = `<h4 style="margin-top:0">Late morning reports this month <small class="muted">(after ${LATE_AT})</small></h4>${Object.keys(lateBy).length ? `<ul class="todo">${Object.entries(lateBy).sort((a, b) => b[1].length - a[1].length).map(([id, list]) => `<li data-act="${act(() => openDaily(list[0]))}"><span class="kind late-k">${list.length}×</span><b>${esc(staffName(id))}</b><small>last: ${fmtDate(list[0].report_date)} sent ${esc(timeOf(list[0].submitted_at))}</small></li>`).join("")}</ul>` : '<p class="muted small">None. Everyone reported on time.</p>'}
      <h4>Reports not sent from site this month</h4>${awayN.length ? `<ul class="todo">${awayN.map((d) => `<li data-act="${act(() => openDaily(d))}"><span class="kind late-k">GPS</span><b>${esc(staffName(d.author_id))} · ${esc(projLabel(d.project_id))}</b><small>${esc(d.loc_status)}${d.distance_m ? " · " + fmtDist(d.distance_m) : ""}${d.loc_note ? " · " + esc(d.loc_note) : ""}</small></li>`).join("")}</ul>` : '<p class="muted small">None.</p>'}`;
    const checks = lateHtml + `<h4>Possible split orders</h4>${flagged.length ? `<ul class="todo">${flagged.map((p) => `<li data-act="${act(() => openPO(p))}"><span class="kind">PO</span><b>${esc(p.po_no + " " + p.description)}</b><small>${esc(supplierName(p.supplier_id))} · ${money(p.amount)}</small></li>`).join("")}</ul>` : '<p class="muted small">None flagged.</p>'}
      <h4>Permission changes</h4>${adminActs.length ? `<ul class="hist">${adminActs.map((a) => `<li><small>${fmtDate(a.at)} · ${esc(staffName(a.actor_id))}</small><br>${esc(a.summary)}</li>`).join("")}</ul>` : '<p class="muted small">None.</p>'}`;

    // Site progress with the latest reports and photos, and today's daily report check
    const latestSite = (pid) => { const rs = db.daily_reports.filter((d) => d.kind !== "Design" && d.project_id === pid).sort((a, b) => String(b.report_date).localeCompare(String(a.report_date))); return rs.length ? rs.filter((d) => d.report_date === rs[0].report_date).sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || ""))) : []; };
    const siteProgress = `<div class="sp">${projs.map((p) => { const rs = latestSite(p.id), ph = rs.flatMap(reportPhotos), d0 = rs[0];
      return `<div class="sp-row"><button class="sp-head" data-act="${act(() => openProject(p))}"><b>${esc(p.code)}</b> ${esc(p.name)}<small>${esc(p.location || "")} · ${esc(staffName(p.pm_id))}</small></button>
        <div class="sp-prog">${bar(p.progress)}<b>${esc(p.progress)}%</b></div>
        <div class="sp-rep">${d0 ? `<button class="sp-txt" data-act="${act(() => openDaily(d0))}"><span class="${d0.report_date === today() ? "up" : "dn"}">${d0.report_date === today() ? "Today" : fmtDate(d0.report_date)}</span> · ${esc([...new Set(rs.map((r) => r.session || "End of day"))].join(" + "))} · ${esc([...new Set(rs.map((r) => staffName(r.author_id).split(" ").slice(-1)[0]))].join(", "))} · ${esc(Math.max(...rs.map((r) => Number(r.manpower) || 0)))} workers<br>${esc(String((rs.find((r) => r.session !== "Morning") || d0).work_done || d0.plan || "").replace(/\n/g, " · ").slice(0, 110))}${rs.some((r) => r.issues) ? ' <span class="late">issue</span>' : ""}</button>` : '<span class="muted small">No site report yet</span>'}</div>
        <div class="sp-ph">${gallery(ph.slice(0, 3), "small")}${ph.length > 3 ? `<small>+${ph.length - 3}</small>` : ""}</div></div>`; }).join("")}</div>`;
    const sExp = siteExpected(u), dExp = designExpected();
    const reportCheck = `<div class="rc"><div class="rc-h"><span>Site engineers</span><b>${sExp.filter((x) => x.done).length}/${sExp.length}</b></div>${bar(pct(sExp.filter((x) => x.done).length, sExp.length))}
        <ul class="rc-l">${sExp.map((x) => `<li class="${x.done ? "ok" : "no"}" ${x.done ? `data-act="${act(() => openDaily(x.done))}"` : ""}>${x.done ? "✓" : "–"} ${esc(staffName(x.m.staff_id))} <small>${esc(projLabel(x.m.project_id))}${x.rs.length ? " · " + x.rs.map((r) => r.session || "End of day").join(", ") + " · " + sum(x.rs, (r) => reportPhotos(r).length) + " photos" : " · not sent"}</small></li>`).join("")}</ul>
      <div class="rc-h"><span>Designers</span><b>${dExp.filter((x) => x.done).length}/${dExp.length}</b></div>${bar(pct(dExp.filter((x) => x.done).length, dExp.length))}
        <ul class="rc-l">${dExp.map((x) => `<li class="${x.done ? "ok" : "no"}" ${x.done ? `data-act="${act(() => openDaily(x.done))}"` : ""}>${x.done ? "✓" : "–"} ${esc(x.s.name)} <small>${x.done ? sum(x.done.entries || [], (e) => e.hours) + " h · " + esc((x.done.entries || [])[0] ? x.done.entries[0].label.split(" ").slice(0, 3).join(" ") : "") : "not sent"}</small></li>`).join("")}</ul></div>`;
    const head = (title, route, extra) => `<div class="card-head"><h2>${esc(title)}</h2>${extra || ""}${route ? `<a class="link" href="#${route}">View all</a>` : ""}</div>`;
    return `<h1>Dashboard</h1><p class="muted">Welcome back, ${esc(u.name.split(" ").slice(-1)[0])}. Here's what is happening on ${hasTag(u, "MD") || !projectScope(u) ? "GID projects" : "your projects"} today.</p>
      ${annBanners(u)}
      ${kpis}
      <div class="dash">
        <section class="card c8">${head("Site progress and latest reports", "daily")}${siteProgress}</section>
        <section class="card c4">${head("Daily reports today", "daily")}${reportCheck}</section>
        <section class="card c4">${head("Spent vs billed", null, `<div class="seg">${segBtn("dashLine", "run", "Running total")}${segBtn("dashLine", "month", "Monthly")}</div>`)}
          <div class="legend-row"><span><i style="background:var(--s1)"></i>Spent</span><span><i style="background:var(--s2)"></i>Billed to clients</span><span class="seg" style="margin-left:auto">${segBtn("dashSpan", "6", "6 months")}${segBtn("dashSpan", "12", "12 months")}</span></div>
          <div class="fig" id="dline"><svg role="img" aria-label="Spent and billed by month"></svg><div class="tip"></div></div></section>
        <section class="card c8 mapcard">${head("Projects map · live", "projects")}${projectMap(projs)}</section>
        <section class="card c3">${head("Recent requests", "requests")}${recentHtml}</section>
        <section class="card c5">${head("Stock status", "stock")}${stockCategoryTable()}</section>
        <section class="card c4">${head("Spend by category", "cost")}${dn}</section>
        <section class="card dark c3"><div class="card-head"><h2>Stock overview</h2><a class="link" href="#stock" style="color:var(--accent-2)">Open</a></div>${stockDark}</section>
        <section class="card c9">${head("This week", "projects")}${week}</section>
        <section class="card c3">${head("Approvals waiting", "requests")}${approvals}</section>
        ${todayScheduleCard(u, "c4")}
        <section class="card c8">${head("Projects", "projects")}${pcards}</section>
        ${svrAccess(u) ? svrDashCard() : ""}
        <section class="card c4">${head("Checks for the MD", null)}${checks}</section>
      </div>`;
  };

  // ---------- SCHEDULE & MEETINGS (v22) ----------
  // One diary for everyone: events people plan (meetings, inspections, site visits, claim dates…), Cambodia's public holidays,
  // and the dated items of every other module (task due dates, IPC steps, VO dates, deliveries, tests, handover, leave…) that the person may see.
  const EV_TYPES = ["Meeting", "Inspection", "Site visit", "Progress claim", "Deadline", "Training", "Other"];
  const EV_CLS = { Meeting: "meet", Inspection: "insp", "Site visit": "site", "Progress claim": "claim", Deadline: "dead", Training: "train", Other: "other" };
  const DEPT_ORDER = ["EXEC", "PM", "SITE", "DESIGN", "ENG", "QS", "FIN", "ADMIN"];
  const p2_ = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => d.getFullYear() + "-" + p2_(d.getMonth() + 1) + "-" + p2_(d.getDate()); // local (Phnom Penh) calendar date
  const dOf = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const isoAdd = (iso, n) => { const d = dOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const isoAddMonths = (iso, n) => { const d = dOf(iso); d.setMonth(d.getMonth() + Number(n || 0)); return isoOf(d); };
  const weekStartOf = (iso) => isoAdd(iso, -((dOf(iso).getDay() + 6) % 7)); // Monday
  const wdShort = (iso) => dOf(iso).toLocaleDateString("en-GB", { weekday: "short" });
  const isSunday = (iso) => dOf(iso).getDay() === 0;
  const holidaysOn = (iso) => (db.holidays || []).filter((h) => String(h.date).slice(0, 10) === iso);
  const holName = (h) => (window.I18N && I18N.lang === "km" && h.name_km) || h.name;
  const evAttendees = (e) => (Array.isArray(e.attendees) ? e.attendees : []);
  // Admins of the diary: they see and manage every event
  const seesAllEvents = (u) => hasTag(u, "MD") || isSysAdmin(u) || hasTag(u, "BACKUPADMIN");
  const canHolidays = (u) => hasTag(u, "HR") || isSysAdmin(u) || hasTag(u, "BACKUPADMIN");
  const canAddEvent = (u) => can(u, "schedule", "own");
  // A person "belongs" to a project when they are its PM or on its team
  const belongsTo = (u, pid) => { const p = byId("projects", pid); return !!pid && ((p && p.pm_id === u.id) || db.project_members.some((m) => m.project_id === pid && m.staff_id === u.id)); };
  function canSeeEvent(u, e) {
    if (!u || !e) return false;
    return seesAllEvents(u) || e.organiser_id === u.id || e.created_by === u.id || evAttendees(e).includes(u.id) || belongsTo(u, e.project_id);
  }
  function canEditEvent(u, e) {
    if (!u || !e) return false;
    return e.organiser_id === u.id || e.created_by === u.id || can(u, "schedule", "admin") || (!!e.project_id && (byId("projects", e.project_id) || {}).pm_id === u.id && can(u, "schedule", "edit"));
  }
  // May this person open the record an event is linked to? Same rule as the record's own module (money modules need full view).
  function canOpenLink(u, tbl, r) {
    const mod = NOTE_MODULE[tbl]; if (!u || !r || !mod) return false;
    const pid = tbl === "projects" ? r.id : r.project_id;
    if (!navVisible(u, mod) || !inScope(u, pid)) return false;
    if (seesAll(u, mod)) return true;
    if (["cost", "finance", "vo", "subs"].includes(mod)) return false;
    return ["requester_id", "assignee_id", "author_id", "raised_by", "created_by", "owner_id", "inspector_id", "pm_id"].some((k) => r[k] === u.id);
  }
  const evTime = (e) => e.all_day || !e.start_time ? "All day" : e.start_time + (e.end_time ? "–" + e.end_time : "");

  // Every dated item the person may see, from the events table and from the other modules
  function linkedItems(u) {
    const out = [];
    const ok = (mod, pid, who) => navVisible(u, mod) && inScope(u, pid) && (seesAll(u, mod) || (who || []).includes(u.id));
    const add = (o) => { if (o.d && /^\d{4}-\d{2}-\d{2}/.test(String(o.d))) { o.d = String(o.d).slice(0, 10); out.push(o); } };
    const L = (mod, cls, type, label, title, pid, who, go, d, extra) => add(Object.assign({ kind: "link", mod, cls, type, label, title, pid: pid || "", mine: (who || []).includes(u.id), go, d }, extra || {}));
    for (const p of db.projects) {
      if (!navVisible(u, "projects") || !inScope(u, p.id)) continue;
      const w = [p.pm_id], g = () => openProject(p), x = { tbl: "projects", rid: p.id };
      L("projects", "m-proj", "Deadline", "Project start", projFull(p.id), p.id, w, g, p.start_date, x);
      L("projects", "m-proj", "Deadline", "Planned finish", projFull(p.id), p.id, w, g, p.end_date, x);
      if (p.handover_date) { L("projects", "m-proj", "Deadline", "Handover to client", projFull(p.id), p.id, w, g, p.handover_date, x);
        if (Number(p.dlp_months) > 0) L("projects", "m-proj", "Deadline", "Defects liability ends", projFull(p.id), p.id, w, g, isoAddMonths(p.handover_date, p.dlp_months), x); }
    }
    db.tasks.filter((t) => t.status !== "Done").forEach((t) => { const w = [t.assignee_id, t.created_by]; if (ok("projects", t.project_id, w) || isPMof(u, t.project_id) && navVisible(u, "projects") && inScope(u, t.project_id)) L("projects", "m-task", "Deadline", "Task due", t.title, t.project_id, [t.assignee_id], () => openTask(t), t.due_date, { tbl: "tasks", rid: t.id }); });
    db.documents.filter((x) => ["Draft", "In review"].includes(x.status)).forEach((x) => { if (ok("docs", x.project_id, [x.owner_id])) L("docs", "m-docs", "Deadline", "Drawing due", x.doc_no + " " + x.title, x.project_id, [x.owner_id], () => openDoc(x), x.due_date, { tbl: "documents", rid: x.id }); });
    db.claims.forEach((c) => { if (!ok("cost", c.project_id, [])) return; (c.history || []).forEach((h) => L("cost", "m-cost", "Progress claim", "IPC " + c.ipc_no + " · " + h.action, projFull(c.project_id) + " · " + (c.period || ""), c.project_id, [h.by], () => openClaim(c), dateInPP(h.at), { tbl: "claims", rid: c.id })); });
    db.invoices.filter((i) => i.status !== "Paid").forEach((i) => { if (ok("finance", i.project_id, [])) L("finance", "m-fin", "Deadline", i.direction === "Receivable" ? "Client payment due" : "Bill due", i.inv_no + " " + i.party, i.project_id, [], () => openInvoice(i), i.due_date); });
    db.inspections.forEach((i) => { if (ok("qaqc", i.project_id, [i.inspector_id])) L("qaqc", "m-qa", "Inspection", "QA/QC inspection", i.title, i.project_id, [i.inspector_id], () => openInspection(i), i.insp_date, { done: i.result !== "Open", tbl: "inspections", rid: i.id }); });
    db.defects.filter((f) => f.status === "Open").forEach((f) => { if (ok("qaqc", f.project_id, [f.assigned_to, f.raised_by])) L("qaqc", "m-qa", "Deadline", "Defect fix by", f.description, f.project_id, [f.assigned_to], () => openDefect(f), f.due_date, { tbl: "defects", rid: f.id }); });
    db.safety.forEach((x) => { if (ok("safety", x.project_id, [x.reported_by])) L("safety", "m-safe", "Other", "Safety · " + x.rec_type, x.description, x.project_id, [x.reported_by], () => openSafety(x), x.rec_date); });
    db.variations.forEach((v) => { if (!ok("vo", v.project_id, [v.raised_by])) return; L("vo", "m-vo", "Other", "Variation raised", v.vo_no + " " + v.title, v.project_id, [v.raised_by], () => openVO(v), v.asked_date, { tbl: "variations", rid: v.id });
      (v.history || []).filter((h) => ["Sent to client", "Client approved"].includes(h.action)).forEach((h) => L("vo", "m-vo", "Other", "Variation · " + h.action, v.vo_no + " " + v.title, v.project_id, [h.by], () => openVO(v), dateInPP(h.at), { tbl: "variations", rid: v.id })); });
    db.sub_payments.forEach((x) => { const k = byId("sub_contracts", x.contract_id); if (!k || !ok("subs", k.project_id, [])) return; L("subs", "m-subs", "Progress claim", "Subcontractor claim " + x.pc_no, ((byId("subcontractors", k.sub_id) || {}).name || ""), k.project_id, [], () => openPayment(x), x.period_to, { tbl: "sub_payments", rid: x.id }); });
    db.sub_contracts.forEach((k) => { if (!ok("subs", k.project_id, [])) return; const sc = byId("subcontractors", k.sub_id) || {}; L("subs", "m-subs", "Deadline", "Subcontract ends", (sc.name || "") + " · " + k.scope, k.project_id, [], () => openSub(sc), k.end_date); });
    db.subcontractors.filter((s) => s.status === "Active").forEach((s) => { if (ok("subs", "", [])) L("subs", "m-subs", "Deadline", "Insurance ends", s.name, "", [], () => openSub(s), s.insurance_until); });
    db.tests.forEach((t) => { if (!ok("handover", t.project_id, [t.tested_by])) return; L("handover", "m-hand", "Inspection", "Test " + t.test_no, t.system + " · " + (t.location || ""), t.project_id, [t.tested_by], () => openTest(t), t.test_date, { done: t.result !== "Open", tbl: "tests", rid: t.id });
      if (t.calib_until) L("handover", "m-hand", "Deadline", "Instrument calibration ends", (t.instrument || "") + " " + (t.instrument_sn || ""), t.project_id, [t.tested_by], () => openTest(t), t.calib_until); });
    db.handover_items.filter((h) => h.status === "Pending").forEach((h) => { if (ok("handover", h.project_id, [])) L("handover", "m-hand", "Deadline", "Handover item due", h.title, h.project_id, [], () => go("handover"), h.due_date); });
    db.warranties.forEach((w) => { if (ok("handover", w.project_id, [])) L("handover", "m-hand", "Deadline", "Warranty ends", w.item, w.project_id, [], () => go("handover"), w.end_date); });
    if (svrAccess(u)) db.site_visits.forEach((v) => { const w = split(v.visited_by).concat([v.author_id]);
      L("svr", "m-svr", "Site visit", "Site visit (SVR)", v.svr_no + " · " + v.client, v.project_id, w, () => openSvr(v), v.visit_date, { time: v.time_from || "", tbl: "site_visits", rid: v.id });
      if (["Lead", "Quoted"].includes(v.status)) { if (v.quote_due) L("svr", "m-svr", "Deadline", "Quotation due", v.svr_no + " · " + v.client, "", w, () => openSvr(v), v.quote_due);
        (v.actions || []).filter((a) => !a.done && a.by).forEach((a) => L("svr", "m-svr", "Deadline", "Site visit action", a.action, "", [a.who], () => openSvr(v), a.by)); } });
    db.purchase_orders.forEach((po) => { const rq = byId("requests", po.request_id), w = [rq && rq.requester_id, po.delivered_by].filter(Boolean); if (!ok("procurement", po.project_id, w)) return;
      if (po.delivered_at) L("procurement", "m-proc", "Other", "Delivered", po.po_no + " " + po.description, po.project_id, w, () => openPO(po), dateInPP(po.delivered_at));
      else if (po.status === "Ordered" && rq && rq.needed_by) L("procurement", "m-proc", "Deadline", "Delivery expected", po.po_no + " " + po.description, po.project_id, w, () => openPO(po), rq.needed_by); });
    db.requests.forEach((r) => {
      const who = [r.requester_id].concat(r.status === "Pending" ? approversFor(r) : []), mayOpen = who.includes(u.id) || hasTag(u, "HR") || seesAll(u, "requests") && inScope(u, r.project_id);
      if (r.type === "Leave" && ["Approved", "Pending"].includes(r.status)) {
        // who is away is shown to everyone (no reason); a leave still waiting only to the people concerned
        if (r.status === "Pending" && !mayOpen) return;
        const n = Math.max(1, Math.ceil(Number(r.leave_days) || 1));
        for (let i = 0, d = r.needed_by; i < n && d; i++, d = isoAdd(d, 1)) L("requests", "m-leave", "Other", r.status === "Approved" ? "On leave" : "Leave asked", staffName(r.requester_id), "", [r.requester_id], mayOpen ? () => openRequest(r) : null, d, { company: true });
      } else if (r.type === "Overtime" && r.status !== "Rejected") {
        if (mayOpen || isPMof(u, r.project_id) && navVisible(u, "requests")) L("requests", "m-req", "Other", r.status === "Approved" ? "Overtime" : "Overtime asked", staffName(r.requester_id) + (r.project_id ? " · " + projFull(r.project_id) : ""), r.project_id, [r.requester_id], () => openRequest(r), r.needed_by);
      } else if (r.status === "Pending" && r.needed_by && (who.includes(u.id) || seesAll(u, "requests") && inScope(u, r.project_id))) L("requests", "m-req", "Deadline", "Needed by", r.ref_no + " " + r.title, r.project_id, who, () => openRequest(r), r.needed_by);
    });
    return out;
  }
  function scheduleItems(u) {
    const ev = db.events.filter((e) => canSeeEvent(u, e)).map((e) => ({ kind: "event", ev: e, d: String(e.date || "").slice(0, 10), type: e.type, cls: "t-" + (EV_CLS[e.type] || "other"), label: e.type, title: e.title,
      pid: e.project_id || "", time: e.all_day ? "" : e.start_time || "", mine: e.organiser_id === u.id || e.created_by === u.id || evAttendees(e).includes(u.id), done: e.status !== "Planned", cancelled: e.status === "Cancelled", go: () => openEvent(e) }));
    // an event made from a record (link) already shows that record: the record's own date item on the same day is not repeated
    const linked = new Set(db.events.filter((e) => e.link_module && e.status !== "Cancelled" && canSeeEvent(u, e)).map((e) => e.link_module + ":" + e.link_id + ":" + String(e.date).slice(0, 10)));
    return ev.concat(linkedItems(u).filter((x) => !linked.has((x.tbl || "") + ":" + (x.rid || "") + ":" + x.d)));
  }
  function schedFilter(u, items) {
    const sc = state.tab.schedScope || "projects", ty = state.tab.schedType || "";
    return items.filter((x) => {
      if (state.project && x.pid !== state.project) return false;
      if (ty === "linked" ? x.kind !== "link" : ty && x.type !== ty) return false;
      if (sc === "mine") return x.mine;
      if (sc === "projects") return x.mine || x.company || (x.pid ? belongsTo(u, x.pid) : x.kind === "link");
      return true;
    }).sort((a, b) => a.d.localeCompare(b.d) || (a.kind === "event" ? 0 : 1) - (b.kind === "event" ? 0 : 1) || String(a.time || "").localeCompare(String(b.time || "")));
  }
  const schedItemHtml = (x) => `<li class="sch-it ${x.kind === "link" ? "lnk " + x.cls : x.cls}${x.cancelled ? " cxl" : ""}${x.done && !x.cancelled ? " done" : ""}" ${x.go ? `data-act="${act(x.go)}"` : ""}>
      <span class="sch-tm">${x.kind === "event" ? esc(evTime(x.ev)) : x.time ? esc(x.time) : ""}</span>
      <span class="sch-body"><span class="sch-k">${esc(x.label)}</span>${x.kind === "link" ? `<span class="sch-mod">${esc(MODULE_NAMES[x.mod] || "")}</span>` : ""}${x.cancelled ? `<span class="tag bad">Cancelled</span>` : x.kind === "event" && x.ev.status === "Done" ? `<span class="tag ok">Done</span>` : ""}
        <b>${esc(x.title)}</b><small>${esc([x.pid ? projFull(x.pid) : "", x.kind === "event" ? x.ev.location : "", x.kind === "event" && evAttendees(x.ev).length ? evAttendees(x.ev).length + " people" : ""].filter(Boolean).join(" · "))}</small></span></li>`;
  const holRow = (h) => `<li class="sch-it hol"><span class="sch-tm">All day</span><span class="sch-body"><span class="sch-k">Public holiday</span><b>${esc(holName(h))}</b></span></li>`;
  function dayList(u, iso, items, opts) {
    opts = opts || {};
    const hol = holidaysOn(iso), list = items.filter((x) => x.d === iso);
    const head = opts.head ? `<div class="sch-dh${hol.length ? " hol" : ""}${isSunday(iso) ? " sun" : ""}"><b>${esc(wdShort(iso))} · ${fmtDate(iso)}</b>${iso === today() ? `<span class="tag order">Today</span>` : ""}${opts.add && canAddEvent(u) ? btn("Add", () => eventForm(u, null, { date: iso }), "small") : ""}</div>` : "";
    if (!hol.length && !list.length && opts.skipEmpty) return "";
    return head + `<ul class="sch-list">${hol.map(holRow).join("")}${list.map(schedItemHtml).join("")}${!hol.length && !list.length ? `<li class="sch-none">Nothing planned.</li>` : ""}</ul>`;
  }
  const typeCount = (list, t) => list.filter((x) => x.type === t && !x.cancelled).length;
  function schedTodayCard(u, items) {
    const t = today(), list = items.filter((x) => x.d === t), hol = holidaysOn(t), tomHol = holidaysOn(isoAdd(t, 1));
    const c = (label, n, cls) => `<div class="sch-cnt ${cls}"><b>${n}</b><span>${label}</span></div>`;
    return `<section class="card sch-today"><div class="card-head"><h2>Today</h2><span class="muted">${esc(wdShort(t))} · ${fmtDate(t)}</span></div>
      ${hol.length ? `<div class="sch-holbar">${svgI("schedule")}<span><b>${esc(hol.map(holName).join(" · "))}</b><small>Public holiday</small></span></div>` : ""}
      ${!hol.length && tomHol.length ? `<div class="sch-holbar soon">${svgI("schedule")}<span><b>${esc(tomHol.map(holName).join(" · "))}</b><small>Tomorrow is a public holiday</small></span></div>` : ""}
      <div class="sch-cnts">${c("Meetings", typeCount(list, "Meeting"), "t-meet")}${c("Inspections", typeCount(list, "Inspection"), "t-insp")}${c("Site visits", typeCount(list, "Site visit"), "t-site")}${c("Deadlines", typeCount(list, "Deadline") + typeCount(list, "Progress claim"), "t-dead")}</div></section>`;
  }
  function monthView(u, items) {
    const t = today(), mon = state.tab.schedMonth || t.slice(0, 7), first = mon + "-01", sel = state.tab.schedDay || (t.slice(0, 7) === mon ? t : first);
    const start = weekStartOf(first), mStart = dOf(first), title = mStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const shift = (n) => { const d = dOf(first); d.setMonth(d.getMonth() + n); state.tab.schedMonth = isoOf(d).slice(0, 7); state.tab.schedDay = state.tab.schedMonth === t.slice(0, 7) ? t : state.tab.schedMonth + "-01"; renderKeep(); };
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = isoAdd(start, i); if (i === 35 && d.slice(0, 7) !== mon) break;
      const hol = holidaysOn(d), list = items.filter((x) => x.d === d), other = d.slice(0, 7) !== mon;
      const cls = ["cal-d", other ? "other" : "", d === t ? "today" : "", hol.length ? "hol" : "", isSunday(d) ? "sun" : "", d === sel ? "sel" : ""].filter(Boolean).join(" ");
      cells.push(`<button type="button" class="${cls}" data-date="${d}" aria-label="${esc(fmtDate(d))}${hol.length ? " · " + esc(hol[0].name) : ""}" data-act="${act(() => { state.tab.schedDay = d; if (other) state.tab.schedMonth = d.slice(0, 7); renderKeep(); const p = document.querySelector(".sch-day"); if (p && window.innerWidth <= 640) p.scrollIntoView({ block: "start", behavior: "smooth" }); })}">
        <span class="cal-n">${dOf(d).getDate()}</span>${hol.length ? `<span class="cal-h">${esc(holName(hol[0]))}</span>` : ""}
        <span class="cal-chips">${list.slice(0, 3).map((x) => `<i class="chip ${x.kind === "link" ? "lnk " + x.cls : x.cls}${x.cancelled ? " cxl" : ""}">${esc(x.title)}</i>`).join("")}${list.length > 3 ? `<i class="chip more">+${list.length - 3}</i>` : ""}</span></button>`);
    }
    const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return `<div class="sch-month"><section class="card sch-cal"><div class="cal-bar"><button type="button" class="icon" aria-label="Previous month" data-act="${act(() => shift(-1))}">‹</button><h2>${esc(title)}</h2><button type="button" class="icon" aria-label="Next month" data-act="${act(() => shift(1))}">›</button>
        <button type="button" class="btn small" data-act="${act(() => { state.tab.schedMonth = t.slice(0, 7); state.tab.schedDay = t; renderKeep(); })}">Today</button></div>
      <div class="cal-grid">${wd.map((w) => `<div class="cal-wd${w === "Sun" ? " sun" : ""}">${w}</div>`).join("")}${cells.join("")}</div>
      <div class="cal-key"><span><i class="k hol"></i>Public holiday</span><span><i class="k t-meet"></i>Meeting</span><span><i class="k t-insp"></i>Inspection</span><span><i class="k t-site"></i>Site visit</span><span><i class="k t-claim"></i>Progress claim</span><span><i class="k t-dead"></i>Deadline</span><span><i class="k lnk"></i>From other modules</span></div></section>
      <section class="card sch-day">${dayList(u, sel, items, { head: true, add: true })}</section></div>`;
  }
  function agendaView(u, items) {
    const t = today(), tom = isoAdd(t, 1), ws = weekStartOf(t), nextWs = isoAdd(ws, 7);
    const range = (a, b) => { const out = []; for (let d = a; d <= b; d = isoAdd(d, 1)) out.push(d); return out; };
    const sec = (title, days, skip) => { const html = days.map((d) => dayList(u, d, items, { head: true, add: true, skipEmpty: skip })).join(""); return `<section class="card sch-sec"><h2>${esc(title)}</h2>${html || `<p class="muted small">Nothing planned.</p>`}</section>`; };
    const rest = range(isoAdd(tom, 1), isoAdd(ws, 6));
    return sec("Today", [t]) + sec("Tomorrow", [tom]) + (rest.length ? sec("This week", rest, true) : "") + sec("Next week", range(rest.length ? nextWs : isoAdd(tom, 1), isoAdd(nextWs, 6)), true);
  }
  function holidaysView(u) {
    const years = [...new Set((db.holidays || []).map((h) => Number(h.year) || Number(String(h.date).slice(0, 4))))].sort();
    const rows = (y) => db.holidays.filter((h) => String(h.date).slice(0, 4) === String(y)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const add = canHolidays(u) ? btn("Add holiday", () => holidayForm(u), "primary") : "";
    return `<div class="sec-h"><p class="muted small" style="margin:0">Official public holidays of the Kingdom of Cambodia (shown in red on the calendar). Lunar dates can move: HR updates them when the government announces the year's list.</p><span class="grow"></span>${add}</div>
      ${years.map((y) => `<section class="card"><div class="card-head"><h2>${y}</h2><span class="count">${rows(y).length}</span></div><div class="tscroll">${table([{ label: "Date", get: (h) => `<b>${esc(wdShort(String(h.date).slice(0, 10)))} · ${fmtDate(h.date)}</b>` },
        { label: "Holiday", get: (h) => esc(h.name) }, { label: "Khmer", get: (h) => `<span class="km-txt">${esc(h.name_km || "")}</span>` }], rows(y), canHolidays(u) ? (h) => holidayForm(u, h) : null)}</div></section>`).join("") || empty("No public holidays yet.")}`;
  }
  function holidayForm(u, h) {
    const isNew = !h; h = h || {};
    formModal(isNew ? "Add public holiday" : "Edit public holiday", [
      { name: "date", label: "Date", type: "date", required: true, value: String(h.date || today()).slice(0, 10) },
      { name: "name", label: "Holiday name (English)", required: true, value: h.name || "" },
      { name: "name_km", label: "Holiday name (Khmer)", value: h.name_km || "" }
    ], async (v) => {
      if (db.holidays.some((x) => x.id !== h.id && String(x.date).slice(0, 10) === v.date && String(x.name).trim().toLowerCase() === v.name.trim().toLowerCase())) throw new Error("This holiday is already in the list for that date.");
      const row = { date: v.date, name: v.name.trim(), name_km: v.name_km.trim(), year: Number(v.date.slice(0, 4)) };
      if (!canHolidays(me())) throw new Error("Only HR or the System Admin can change public holidays."); if (isNew) await save("holidays", row, "Public holiday added: " + row.name + " · " + fmtDate(row.date)); else await patch("holidays", h.id, row, "Public holiday changed: " + row.name + " · " + fmtDate(row.date));
      toast("Saved");
    }, isNew ? "Add holiday" : "Save changes", { extraHtml: isNew ? "" : `<div class="form-actions" style="justify-content:flex-start;margin-top:0">${btn("Remove holiday", async () => { if (!canHolidays(me())) throw new Error("Only HR or the System Admin can change public holidays."); if (!confirm("Remove " + h.name + " (" + fmtDate(h.date) + ") from the public holidays?")) return; await Store.remove("holidays", h.id); await log("Removed", "holidays", h.id, "Public holiday removed: " + h.name + " · " + fmtDate(h.date)); closeModal(); render(); toast("Removed"); }, "danger")}</div>` });
  }

  // ----- attendee picker: search, grouped by department, select a whole department -----
  function peoplePicker(sel, label) {
    const people = staffNow(), deptOf = (s) => { const g = groupsOf(s)[0]; return DEPT_ORDER.includes(g) ? g : "ADMIN"; };
    const groups = DEPT_ORDER.map((g) => [g, people.filter((s) => deptOf(s) === g).sort((a, b) => a.name.localeCompare(b.name))]).filter((x) => x[1].length);
    const kmD = (g) => (window.I18N && I18N.km ? I18N.km(DEPT_NAME[g]) || "" : "");
    return `<div class="field pp" data-pp><span>${esc(label || "Attendees")}</span>
      <div class="pp-top"><b class="pp-count" aria-live="polite"></b><button type="button" class="link pp-clear">Clear all</button></div>
      <div class="pp-chips"></div>
      <input type="search" class="pp-q" placeholder="Type to search: name, job or department" aria-label="Search people" autocomplete="off">
      <div class="pp-list">${groups.map(([g, list]) => `<div class="pp-grp" data-g="${g}"><div class="pp-gh"><b>${esc(DEPT_NAME[g])}</b><small>${list.length}</small><button type="button" class="btn small pp-all" data-g="${g}">Select all</button></div>
        ${list.map((s) => `<label class="pp-row" data-q="${esc([s.name, s.short_name, s.title, DEPT_NAME[g], kmD(g)].filter(Boolean).join(" ").toLowerCase())}"><input type="checkbox" value="${esc(s.id)}" ${sel.includes(s.id) ? "checked" : ""}>${avatar(s, "av sm")}<span><b>${esc(s.name)}</b><small>${esc(s.title)}</small></span></label>`).join("")}</div>`).join("")}
        <p class="pp-none muted small" hidden>No one matches.</p></div>
      <input type="hidden" name="attendees" value="${esc(JSON.stringify(sel))}"></div>`;
  }
  function wirePeoplePicker(m) {
    const w = m.querySelector("[data-pp]"); if (!w) return;
    const hid = w.querySelector('input[name="attendees"]'), boxes = [...w.querySelectorAll(".pp-row input")], q = w.querySelector(".pp-q");
    const paint = () => {
      const ids = boxes.filter((b) => b.checked).map((b) => b.value); hid.value = JSON.stringify(ids);
      w.querySelector(".pp-count").textContent = ids.length === 1 ? "1 person selected" : ids.length + " people selected";
      w.querySelector(".pp-chips").innerHTML = ids.map((id) => `<span class="pp-chip">${esc((byId("staff", id) || {}).name || id)}<button type="button" data-rm="${esc(id)}" aria-label="Remove ${esc((byId("staff", id) || {}).name || "")}">×</button></span>`).join("");
      w.querySelectorAll(".pp-grp").forEach((g) => { const bs = [...g.querySelectorAll(".pp-row input")], all = bs.length && bs.every((b) => b.checked); const b = g.querySelector(".pp-all"); b.textContent = all ? "Clear" : "Select all"; b.classList.toggle("on", all); });
    };
    boxes.forEach((b) => b.addEventListener("change", paint));
    w.querySelector(".pp-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (!b) return; e.preventDefault(); const x = boxes.find((y) => y.value === b.dataset.rm); if (x) x.checked = false; paint(); });
    w.querySelectorAll(".pp-all").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); const bs = [...w.querySelectorAll(`.pp-grp[data-g="${b.dataset.g}"] .pp-row input`)], all = bs.every((x) => x.checked); bs.forEach((x) => { x.checked = !all; }); paint(); }));
    w.querySelector(".pp-clear").addEventListener("click", (e) => { e.preventDefault(); boxes.forEach((b) => { b.checked = false; }); paint(); });
    q.addEventListener("input", () => {
      const v = q.value.trim().toLowerCase(); let any = false;
      w.querySelectorAll(".pp-grp").forEach((g) => { let n = 0; g.querySelectorAll(".pp-row").forEach((r) => { const hit = !v || r.dataset.q.includes(v); r.hidden = !hit; if (hit) n++; }); g.hidden = !n; if (n) any = true; });
      w.querySelector(".pp-none").hidden = any;
    });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    paint();
  }

  // ----- create / edit an event -----
  function eventForm(u, ev, preset) {
    const isNew = !ev;
    const e = ev || Object.assign({ type: "Meeting", date: state.tab.schedDay && state.tab.schedDay >= today() ? state.tab.schedDay : today(), start_time: "09:00", end_time: "10:00", all_day: false, project_id: state.project || "", attendees: [], title: "", location: "", notes: "", link_module: "", link_id: "" }, preset || {});
    const projects = projectOptions(u); if (e.project_id && !projects.some((p) => p[0] === e.project_id)) projects.push([e.project_id, projLabel(e.project_id)]);
    const lk = e.link_module && byId(e.link_module, e.link_id);
    formModal(isNew ? "New event" : "Edit event", [
      { name: "title", label: "Title", required: true, value: e.title, help: "Example: Weekly site meeting, MEP inspection level 3, Submit IPC 4" },
      { name: "type", label: "Type", type: "select", options: EV_TYPES, value: e.type },
      { name: "date", label: "Date", type: "date", required: true, value: String(e.date || today()).slice(0, 10) },
      { name: "start_time", label: "Start time", type: "time", value: e.start_time || "" },
      { name: "end_time", label: "End time", type: "time", value: e.end_time || "" },
      { name: "project_id", label: "Project", type: "select", options: projects, blank: "No project (office)", value: e.project_id || "" },
      { name: "location", label: "Location", value: e.location || "", help: "Meeting room, site office, address or online link" },
      { name: "notes", label: "Notes / agenda", type: "textarea", value: e.notes || "" }
    ], async (v) => {
      let att = []; try { att = JSON.parse(v.attendees || "[]"); } catch (x) { att = []; }
      const allDay = v.all_day === "on";
      if (!allDay && !v.start_time) throw new Error("Set the start time, or tick All day.");
      if (!allDay && v.end_time && v.end_time < v.start_time) throw new Error("The end time is before the start time.");
      const row = { title: v.title.trim(), type: v.type, date: v.date, all_day: allDay, start_time: allDay ? "" : v.start_time, end_time: allDay ? "" : v.end_time || "", project_id: v.project_id || "",
        location: v.location || "", notes: v.notes || "", attendees: att.filter((id) => byId("staff", id)), link_module: v.link_module || "", link_id: v.link_id || "", updated_at: nowIso() };
      if (isNew) {
        const r = await save("events", Object.assign(row, { no: nextNo("events", "no", "EV-"), organiser_id: u.id, created_by: u.id, status: "Planned", minutes: "" }), "Invitation: " + row.title + " · " + fmtDate(row.date));
        toast(r.no + " saved" + (row.attendees.length ? " · " + row.attendees.length + " people invited" : ""));
      } else {
        const before = evAttendees(e), removed = before.filter((id) => !row.attendees.includes(id) && id !== u.id);
        if (!canEditEvent(me(), e)) throw new Error("You cannot change this event."); await patch("events", e.id, row, "Event changed: " + row.title + " · " + fmtDate(row.date));
        if (removed.length) await insertNotes(removed.map((id) => noteRow(id, u.id, "events", e.id, { kind: "reminder", ref: e.no || "", project: projFull(row.project_id), due: dLong(row.date), title: "You no longer need to attend: " + row.title, title_km: "អ្នកមិនចាំបាច់ចូលរួមទៀតទេ៖ " + row.title, body: "By " + staffName(u.id), body_km: "ដោយ " + staffName(u.id) }, nowIso())));
        toast("Saved");
      }
      state.tab.schedDay = row.date; state.tab.schedMonth = row.date.slice(0, 7);
    }, isNew ? "Save and invite" : "Save changes", {
      extraHtml: peoplePicker(evAttendees(e)) + `<input type="hidden" name="link_module" value="${esc(e.link_module || "")}"><input type="hidden" name="link_id" value="${esc(e.link_id || "")}">`
        + (lk && canOpenLink(me(), e.link_module, lk) ? `<p class="muted small">Linked to: ${esc(MODULE_NAMES[NOTE_MODULE[e.link_module]] || "")} · ${esc(linkLabel(e.link_module, lk))}</p>` : ""),
      onReady: (m) => {
        const f = m.querySelector("#mform"), dateIn = f.querySelector('input[name="date"]'), st = f.querySelector('input[name="start_time"]'), en = f.querySelector('input[name="end_time"]');
        const dateField = dateIn.closest(".field"), warn = document.createElement("p"); warn.className = "sch-warn"; warn.hidden = true; dateField.appendChild(warn);
        const ad = document.createElement("label"); ad.className = "chk sch-allday"; ad.innerHTML = `<input type="checkbox" name="all_day" ${e.all_day ? "checked" : ""}> <span>All day</span>`; dateField.after(ad);
        const cb = ad.querySelector("input");
        const sync = () => { [st, en].forEach((x) => { x.disabled = cb.checked; x.closest(".field").classList.toggle("off", cb.checked); }); };
        const check = () => { const d = dateIn.value, h = d ? holidaysOn(d) : []; const msg = h.length ? "Public holiday: " + h.map(holName).join(" · ") + ". You can still save." : d && isSunday(d) ? "This date is a Sunday. You can still save." : "";
          warn.textContent = msg; warn.hidden = !msg; };
        cb.addEventListener("change", sync); dateIn.addEventListener("change", check); dateIn.addEventListener("input", check); sync(); check();
        wirePeoplePicker(m);
      } });
  }
  function linkLabel(tbl, r) {
    if (!r) return "";
    const m = { claims: () => projFull(r.project_id) + " IPC " + r.ipc_no, variations: () => r.vo_no + " " + r.title, inspections: () => r.title, projects: () => projFull(r.id), tasks: () => r.title, documents: () => r.doc_no + " " + r.title,
      tests: () => r.test_no, sub_payments: () => r.pc_no, site_visits: () => r.svr_no, defects: () => r.description, requests: () => r.ref_no + " " + r.title };
    return (m[tbl] || (() => r.title || r.name || r.id))();
  }
  // Prefilled "Add to schedule" from a record (project, IPC, VO, inspection…)
  function scheduleFrom(u, tbl, r, preset) {
    eventForm(u, null, Object.assign({ project_id: r.project_id || (tbl === "projects" ? r.id : ""), link_module: tbl, link_id: r.id }, preset || {}));
  }
  const schedBtn = (u, tbl, r, preset) => canAddEvent(u) ? btn("Add to schedule", () => scheduleFrom(u, tbl, r, preset)) : "";

  function openEvent(e) {
    const u = me();
    if (!canSeeEvent(u, e)) { toast("This event is private to the people invited.", true); return; }
    markSeen("events", e.id);
    const att = evAttendees(e).map((id) => byId("staff", id)).filter(Boolean), hol = holidaysOn(String(e.date).slice(0, 10)), lk = e.link_module && byId(e.link_module, e.link_id);
    const acts = [];
    if (canEditEvent(u, e) && e.status === "Planned") {
      acts.push(btn("Cancel event", () => confirmAction("Cancel · " + e.title, [{ name: "reason", label: "Reason (sent to the people invited)", type: "textarea" }], async (v) => {
        if (!canEditEvent(me(), e)) throw new Error("You cannot change this event."); await patch("events", e.id, { status: "Cancelled", notes: [e.notes, v.reason ? "Cancelled: " + v.reason : ""].filter(Boolean).join("\n"), updated_at: nowIso() }, "Event cancelled: " + e.title + " · " + fmtDate(e.date)); }, "Cancel event"), "danger"));
      acts.push(btn("Edit", () => eventForm(u, e)));
      acts.push(btn(e.type === "Meeting" ? "Mark done and add minutes" : "Mark done", () => formModal((e.type === "Meeting" ? "Minutes · " : "Done · ") + e.title, [{ name: "minutes", label: e.type === "Meeting" ? "Meeting minutes (decisions, actions, who does what by when)" : "What happened (optional)", type: "textarea", required: e.type === "Meeting", value: e.minutes || "" }],
        async (v) => { if (!canEditEvent(me(), e)) throw new Error("You cannot change this event."); await patch("events", e.id, { status: "Done", minutes: v.minutes || "", updated_at: nowIso() }, "Event done: " + e.title + " · " + fmtDate(e.date)); toast("Saved"); }, "Save"), "primary"));
    } else if (canEditEvent(u, e) && e.status === "Done") {
      acts.push(btn("Edit minutes", () => formModal("Minutes · " + e.title, [{ name: "minutes", label: "Meeting minutes", type: "textarea", value: e.minutes || "" }], async (v) => { if (!canEditEvent(me(), e)) throw new Error("You cannot change this event."); await patch("events", e.id, { minutes: v.minutes || "", updated_at: nowIso() }, "Minutes updated: " + e.title); toast("Saved"); }, "Save")));
    }
    detail((e.no ? e.no + " · " : "") + e.title, [["Type", `<span class="tag sch-tag t-${EV_CLS[e.type] || "other"}">${esc(e.type)}</span>`], ["Status", badge(e.status)],
      ["Date", `${esc(wdShort(String(e.date).slice(0, 10)))} · ${fmtDate(e.date)}${hol.length ? ` <span class="tag bad">Public holiday</span> <small>${esc(hol.map(holName).join(" · "))}</small>` : isSunday(String(e.date).slice(0, 10)) ? ` <span class="tag order">Sunday</span>` : ""}`], ["Time", esc(evTime(e))],
      ["Project", e.project_id ? esc(projFull(e.project_id)) : "No project (office)"], ["Location", esc(e.location)], ["Organiser", esc(staffName(e.organiser_id))],
      lk && !canOpenLink(me(), e.link_module, lk) ? ["Linked record", esc("Linked to a record in " + (MODULE_NAMES[NOTE_MODULE[e.link_module]] || "another module"))] : lk ? ["Linked record", `<a href="#" data-act="${act(() => openRecord(e.link_module, e.link_id))}">${esc(MODULE_NAMES[NOTE_MODULE[e.link_module]] || "")} · ${esc(linkLabel(e.link_module, lk))}</a>`] : null,
      ["Notes", e.notes ? `<span class="sch-pre">${esc(e.notes)}</span>` : ""], e.minutes ? ["Minutes", `<span class="sch-pre">${esc(e.minutes)}</span>`] : null].filter(Boolean), acts.join(""),
      `<h4>Attendees · ${att.length}</h4>${att.length ? `<ul class="sch-att">${att.map((s) => `<li>${avatar(s, "av sm")}<span><b>${esc(s.name)}</b><small>${esc(s.title)} · ${esc(DEPT_NAME[groupsOf(s)[0]] || "")}</small></span></li>`).join("")}</ul>` : `<p class="muted small">No one invited.</p>`}`);
  }

  SCREENS.schedule = (u) => {
    if (!state.tab.schedule) state.tab.schedule = window.innerWidth <= 640 ? "agenda" : "month";
    const T = tabs("schedule", [["agenda", "Agenda"], ["month", "Month"], ["holidays", "Public holidays"]]);
    const all = scheduleItems(u), items = schedFilter(u, all);
    const sc = state.tab.schedScope || "projects";
    const seg = (k, label) => `<button type="button" class="${sc === k ? "on" : ""}" data-act="${act(() => { state.tab.schedScope = k; renderKeep(); })}">${esc(label)}</button>`;
    const ty = state.tab.schedType || "";
    const typeSel = `<select data-change-tab="schedType" aria-label="Type"><option value="">All types</option>${EV_TYPES.map((t) => `<option value="${esc(t)}" ${ty === t ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="linked" ${ty === "linked" ? "selected" : ""}>From other modules</option></select>`;
    const bar = T.cur === "holidays" ? "" : `<div class="toolbar sch-tools"><div class="seg">${seg("mine", "Mine")}${seg("projects", "My projects")}${seg("all", "Everyone")}</div>${projectFilter(u)}${typeSel}<span class="grow"></span>${canAddEvent(u) ? btn("New event", () => eventForm(u), "primary") : ""}</div>`;
    const body = T.cur === "holidays" ? holidaysView(u) : T.cur === "month" ? monthView(u, items) : agendaView(u, items);
    return `<h1>Schedule</h1><p class="muted">Meetings, inspections, site visits, claims and deadlines from every module, with Cambodia's public holidays in red.</p>
      ${T.cur === "holidays" ? "" : schedTodayCard(u, items)}${T.html}${bar}${body}`;
  };
  // Small "Today's schedule" card for My work and the Dashboard
  function todayScheduleCard(u, cls) {
    if (!navVisible(u, "schedule")) return "";
    const t = today(), mine = scheduleItems(u).filter((x) => x.mine && !x.cancelled && (x.d === t)).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const hol = holidaysOn(t), tom = holidaysOn(isoAdd(t, 1));
    return `<section class="card ${cls || ""} sch-mini"><div class="card-head"><h2>Today's schedule</h2><a class="link" href="#schedule">Open schedule</a></div>
      ${hol.length ? `<div class="sch-holbar">${svgI("schedule")}<span><b>${esc(hol.map(holName).join(" · "))}</b><small>Public holiday</small></span></div>` : tom.length ? `<div class="sch-holbar soon">${svgI("schedule")}<span><b>${esc(tom.map(holName).join(" · "))}</b><small>Tomorrow is a public holiday</small></span></div>` : ""}
      ${mine.length ? `<ul class="sch-list">${mine.slice(0, 6).map(schedItemHtml).join("")}</ul>${mine.length > 6 ? `<p class="muted small">+${mine.length - 6} more</p>` : ""}` : `<p class="muted small">Nothing planned for you today.</p>`}</section>`;
  }

  // ---------- STOCK ----------
  function canActStore(u, st) {
    const lv = level(u, "stock");
    if (lv === "admin") return true;
    if (lv === "approve") return !st.project_id || isPMof(u, st.project_id);
    if (lv === "edit") return !!st.project_id && inScope(u, st.project_id);
    return false;
  }
  const actStores = (u) => db.stores.filter((s) => canActStore(u, s));
  const onOrder = (itemId) => sum(db.purchase_orders.filter((p) => p.status === "Ordered"), (p) => sum((p.items || []).filter((x) => x.item_id === itemId), (x) => x.qty));
  const storeShort = (s) => (s.project_id ? projLabel(s.project_id).replace("DEMO-", "") : "Main");
  function stockMove(u, kind, it, preset) {
    const stores = actStores(u);
    if (!stores.length) { toast("You can't move stock in any store.", true); return; }
    const so = stores.map((s) => [s.id, s.name + " (" + stockQty(it.id, s.id) + " " + it.unit + ")"]);
    const fields = [{ name: "store_id", label: kind === "Transfer" ? "From store" : "Store", type: "select", options: so, required: true, value: preset && preset.store_id }];
    if (kind === "Transfer") fields.push({ name: "to_store_id", label: "To store", type: "select", options: db.stores.map((s) => [s.id, s.name]), required: true });
    if (kind === "Issue") fields.push({ name: "project_id", label: "Used on project", type: "select", options: projectOptions(u).length ? projectOptions(u) : db.projects.map((p) => [p.id, p.code + " " + p.name]), required: true });
    fields.push({ name: "qty", label: kind === "Adjust" ? "Counted quantity (" + it.unit + ")" : "Quantity (" + it.unit + ")", type: "number", required: true });
    if (kind === "Receive") fields.push({ name: "ref", label: "Delivery reference (PO number)" });
    fields.push({ name: "note", label: "Note", type: "textarea" });
    formModal({ Issue: "Issue to project", Receive: "Receive", Transfer: "Transfer", Adjust: "Stock count" }[kind] + " · " + it.name, fields, async (v) => {
      const q = Number(v.qty), have = stockQty(it.id, v.store_id), date = today();
      if (!(q >= 0) || (kind !== "Adjust" && !(q > 0))) throw new Error("Enter a quantity above zero.");
      const base = { move_date: date, item_id: it.id, by_id: u.id, note: v.note || "", ref: v.ref || "", project_id: v.project_id || "", to_store_id: "" };
      if (kind === "Receive") await save("stock_moves", Object.assign(base, { store_id: v.store_id, qty: q, move_type: "Receive" }), "Received " + q + " " + it.unit + " " + it.name);
      if (kind === "Issue") {
        if (q > have) throw new Error("Only " + have + " " + it.unit + " in that store. Use a Material request to order the rest.");
        await save("stock_moves", Object.assign(base, { store_id: v.store_id, qty: -q, move_type: "Issue" }), "Issued " + q + " " + it.unit + " " + it.name + " to " + projLabel(v.project_id));
      }
      if (kind === "Transfer") {
        if (v.to_store_id === v.store_id) throw new Error("Choose a different store to send to.");
        if (q > have) throw new Error("Only " + have + " " + it.unit + " in that store.");
        await save("stock_moves", Object.assign({}, base, { store_id: v.store_id, to_store_id: v.to_store_id, qty: -q, move_type: "Transfer" }), "Transfer out " + it.name);
        await save("stock_moves", Object.assign({}, base, { store_id: v.to_store_id, qty: q, move_type: "Transfer" }), "Transfer in " + it.name);
      }
      if (kind === "Adjust") await save("stock_moves", Object.assign(base, { store_id: v.store_id, qty: q - have, move_type: "Adjust", note: (v.note || "") + " (count " + q + ", was " + have + ")" }), "Stock count " + it.name);
      toast("Saved. " + it.name + " now " + stockQty(it.id) + " " + it.unit + " in total.");
    }, "Save");
  }
  const reorderQty = (it) => Math.max(1, Math.ceil(Number(it.min_qty) * 2 - stockQty(it.id) - onOrder(it.id)));
  function openItem(it) {
    const u = me(); const q = stockQty(it.id), st = stockStatus(it, q), oo = onOrder(it.id);
    const lv = level(u, "stock");
    const acts = [];
    if (actStores(u).length) {
      acts.push(btn("Issue to project", () => stockMove(u, "Issue", it), "primary"));
      acts.push(btn("Receive", () => stockMove(u, "Receive", it)));
      acts.push(btn("Transfer", () => stockMove(u, "Transfer", it)));
      if (lv === "admin") acts.push(btn("Stock count", () => stockMove(u, "Adjust", it)));
    }
    acts.push(btn(st === "OK" ? "Request this item" : "Reorder", () => materialRequest(u, { project_id: st === "OK" ? undefined : "", lines: [{ item_id: it.id, qty: st === "OK" ? "" : reorderQty(it), name: "", cost: "" }] })));
    const moves = db.stock_moves.filter((m) => m.item_id === it.id).slice().sort((a, b) => String(b.move_date).localeCompare(String(a.move_date)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8);
    const pos = db.purchase_orders.filter((p) => p.status === "Ordered" && (p.items || []).some((x) => x.item_id === it.id));
    detail(it.code + " · " + it.name, [["Category", esc(it.category)], ["In stock", `<b>${q.toLocaleString()} ${esc(it.unit)}</b> ${badge(st)}`], ["On order", oo ? `<b>${oo}</b> ${esc(it.unit)}` : "None"],
      ["Minimum", esc(it.min_qty) + " " + esc(it.unit)], ["Unit cost", money(it.unit_cost)], ["Stock value", money(q * it.unit_cost)]], acts.join(""),
      `<h4>By store</h4><div class="storebars">${db.stores.map((s) => { const v = stockQty(it.id, s.id); return `<div><span>${esc(s.name)}</span><b>${v} ${esc(it.unit)}</b></div>`; }).join("")}</div>
       ${pos.length ? `<h4>On order</h4><ul class="hist">${pos.map((p) => `<li><a href="#" data-act="${act(() => openPO(p))}">${esc(p.po_no)}</a> · ${esc(supplierName(p.supplier_id))} · ${sum((p.items || []).filter((x) => x.item_id === it.id), (x) => x.qty)} ${esc(it.unit)}</li>`).join("")}</ul>` : ""}
       <h4>Recent movements</h4><ul class="hist">${moves.map((m) => `<li>${fmtDate(m.move_date)} · ${badge(m.move_type)} <b>${m.qty > 0 ? "+" : ""}${m.qty}</b> · ${esc((byId("stores", m.store_id) || {}).name || "")}${m.project_id ? " · " + esc(projLabel(m.project_id)) : ""}${m.ref ? " · " + esc(m.ref) : ""} · ${esc(staffName(m.by_id))}</li>`).join("")}</ul>`);
  }
  SCREENS.stock = (u) => {
    const T = tabs("stock", [["list", "Stock list"], ["moves", "Movements"], ["stores", "Stores"]]);
    const lv = level(u, "stock");
    const head = `<h1>Stock</h1><p class="muted">What we have in each store, what is on order, and what is running low. Tap an item to issue, receive, transfer or reorder.</p>`;
    const all = db.stock_items.map((i) => ({ it: i, q: stockQty(i.id), oo: onOrder(i.id) }));
    const low = all.filter((x) => x.q < Number(x.it.min_qty));
    const tiles = `<div class="tiles"><div class="tile"><small>STOCK VALUE</small><b>${money(sum(all, (x) => x.q * x.it.unit_cost))}</b><span>${db.stock_items.length} items · ${db.stores.length} stores</span></div>
      <button class="tile ${low.length ? "warn" : ""} tbtn" data-act="${act(() => { state.tab.stock = "list"; state.tab.stockF = "low"; render(); })}"><small>BELOW MINIMUM</small><b>${low.length}</b><span>${low.filter((x) => x.q <= 0).length} out of stock · tap to see</span></button>
      <div class="tile"><small>ON ORDER</small><b>${all.filter((x) => x.oo > 0).length}</b><span>items on open POs</span></div>
      <div class="tile"><small>ISSUED TO SITES (30 DAYS)</small><b>${db.stock_moves.filter((m) => m.move_type === "Issue" && daysSince(m.move_date) <= 30).length}</b><span>movements</span></div></div>`;
    const quick = `${btn("Material request", () => materialRequest(u), "primary")}${lv === "admin" ? btn("New item", () => formModal("New stock item", [
      { name: "code", label: "Code", required: true }, { name: "name", label: "Name", required: true },
      { name: "category", label: "Category", type: "select", options: [...new Set(db.stock_items.map((i) => i.category))], required: true },
      { name: "unit", label: "Unit", value: "pc", required: true }, { name: "min_qty", label: "Minimum level", type: "number", required: true }, { name: "unit_cost", label: "Unit cost (USD)", type: "number", required: true }
    ], async (v) => { await save("stock_items", v, "New stock item " + v.name); })) : ""}`;
    if (T.cur === "list") {
      const cats = [...new Set(db.stock_items.map((i) => i.category))];
      const cf = state.tab.stockCat || "", f = state.tab.stockF || "all";
      let rows = all.filter((x) => (!cf || x.it.category === cf) && matchSearch(x.it, ["code", "name", "category"]));
      if (f === "low") rows = rows.filter((x) => x.q < Number(x.it.min_qty)); if (f === "order") rows = rows.filter((x) => x.oo > 0);
      const stores = db.stores;
      const chip = (val, label) => `<button class="tab ${f === val ? "on" : ""}" data-act="${act(() => { state.tab.stockF = val; render(); })}">${label}</button>`;
      const groups = cats.filter((c) => rows.some((x) => x.it.category === c));
      return `${head}${T.html}${tiles}
        <div class="toolbar"><input class="search" data-change="search" placeholder="Search item or code" value="${esc(state.search)}">
          <select data-change-tab="stockCat"><option value="">All categories</option>${cats.map((c) => `<option ${cf === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
          <div class="tabs">${chip("all", "All")}${chip("low", "Below minimum (" + low.length + ")")}${chip("order", "On order")}</div><span class="grow"></span>${quick}</div>
        ${rows.length ? `<div class="card" style="padding:6px 10px"><div class="scroll"><table class="stock-list"><thead><tr><th>Item</th>${stores.map((s) => `<th class="n" title="${esc(s.name)}">${esc(storeShort(s))}</th>`).join("")}<th class="n">Total</th><th class="n">On order</th><th class="n">Min</th><th>Status</th><th></th></tr></thead>
          <tbody>${groups.map((c) => `<tr class="grp"><td colspan="${stores.length + 6}">${svgI(c)}${esc(c)}</td></tr>` + rows.filter((x) => x.it.category === c).map((x) => {
            const stt = stockStatus(x.it, x.q), pctv = Math.min(100, Math.round((x.q / (2 * (Number(x.it.min_qty) || 1))) * 100));
            return `<tr class="click" data-act="${act(() => openItem(x.it))}"><td><b>${esc(x.it.name)}</b><small>${esc(x.it.code)} · ${esc(x.it.unit)} · ${money(x.it.unit_cost)}</small></td>
              ${stores.map((s) => { const v = stockQty(x.it.id, s.id); return `<td class="n ${v ? "" : "zero"}" data-label="${esc(storeShort(s))}">${v || "–"}</td>`; }).join("")}
              <td class="n" data-label="Total"><b>${x.q}</b><div class="bar ${stt !== "OK" ? "bad" : ""}" style="min-width:60px"><span style="width:${pctv}%"></span></div></td><td class="n" data-label="On order">${x.oo || "–"}</td><td class="n" data-label="Min">${esc(x.it.min_qty)}</td><td>${badge(stt)}</td>
              <td class="n">${actStores(u).length ? `<button class="btn small" data-act="${act(() => stockMove(u, "Issue", x.it))}">Issue</button>` : ""}${stt !== "OK" ? `<button class="btn small" data-act="${act(() => materialRequest(u, { project_id: "", lines: [{ item_id: x.it.id, qty: reorderQty(x.it), name: "", cost: "" }] }))}">Reorder</button>` : ""}</td></tr>`; }).join("")).join("")}</tbody></table></div></div>
          <p class="muted small">Store columns: ${stores.map((s) => `<b>${esc(storeShort(s))}</b> = ${esc(s.name)}`).join(" · ")}. Green bar = level against twice the minimum.</p>` : empty("No items match.")}`;
    }
    if (T.cur === "moves") {
      const rows = db.stock_moves.slice().filter((m) => { const it = byId("stock_items", m.item_id) || {}; return matchSearch(it, ["name", "code"]) || matchSearch(m, ["ref", "note"]); })
        .sort((a, b) => String(b.move_date).localeCompare(String(a.move_date)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 200);
      return `${head}${T.html}<div class="toolbar"><input class="search" data-change="search" placeholder="Search item, PO or request number" value="${esc(state.search)}"></div>
        ${table([{ label: "Date", get: (m) => fmtDate(m.move_date) }, { label: "Item", get: (m) => `<b>${esc((byId("stock_items", m.item_id) || {}).name)}</b>` }, { label: "Type", get: (m) => badge(m.move_type) },
          { label: "Qty", get: (m) => `<b class="${m.qty < 0 ? "dn" : "up"}">${m.qty > 0 ? "+" : ""}${m.qty}</b> ${esc((byId("stock_items", m.item_id) || {}).unit || "")}` }, { label: "Store", get: (m) => esc((byId("stores", m.store_id) || {}).name) },
          { label: "Project / ref", get: (m) => esc([projLabel(m.project_id), m.ref, m.to_store_id ? "to " + (byId("stores", m.to_store_id) || {}).name : ""].filter(Boolean).join(" · ")) }, { label: "By", get: (m) => esc(staffName(m.by_id)) }], rows, (m) => openItem(byId("stock_items", m.item_id)))}`;
    }
    return `${head}${T.html}<div class="toolbar"><span class="grow"></span>${lv === "admin" ? btn("New store", () => formModal("New store", [
      { name: "name", label: "Name", required: true }, { name: "store_type", label: "Type", type: "select", options: ["Site", "Main"] },
      { name: "project_id", label: "Project (site stores)", type: "select", options: db.projects.map((p) => [p.id, p.code + " " + p.name]), blank: "None (main store)" }, { name: "location", label: "Location" }
    ], async (v) => { await save("stores", v, "New store " + v.name); }), "primary") : ""}</div>
      <div class="pcards">${db.stores.map((s) => { const its = db.stock_items.map((i) => ({ it: i, q: stockQty(i.id, s.id) })).filter((x) => x.q > 0);
        return `<button class="pcard" data-act="${act(() => { state.tab.stock = "list"; render(); })}"><span class="code">${esc(s.store_type)} store · ${esc(s.location || "")}</span><h3>${esc(s.name)}</h3><div class="kv"><span>Items held</span><b>${its.length}</b></div><div class="kv"><span>Value</span><b>${money(sum(its, (x) => x.q * x.it.unit_cost))}</b></div><div class="kv" style="border:0"><span>Project</span><b>${esc(projLabel(s.project_id) || "All projects")}</b></div></button>`; }).join("")}</div>`;
  };

  // ---------- SYSTEM ADMIN ----------
  // Permission editor: only the MD and the system administrator can change it; every change is logged
  let permDraft = null;
  function permEditor(u) {
    const cur = PERMS_NOW(), editable = canManagePerms(u);
    if (!permDraft) permDraft = JSON.parse(JSON.stringify(cur));
    const changed = [];
    for (const m of Object.keys(cur)) for (const g of Object.keys(GROUPS)) if (permDraft[m][g] !== cur[m][g]) changed.push([m, g, cur[m][g], permDraft[m][g]]);
    const diffStd = Object.keys(cur).reduce((n, m) => n + Object.keys(GROUPS).filter((g) => cur[m][g] !== PERMS_STANDARD[m][g]).length, 0);
    const ps = permSetting();
    const cell = (m, g) => {
      const v = permDraft[m][g], dirty = v !== cur[m][g], custom = cur[m][g] !== PERMS_STANDARD[m][g];
      if (!editable) return `<td class="lv-${v}">${esc(v)}</td>`;
      return `<td class="pcell ${dirty ? "dirty" : custom ? "custom" : ""}"><select class="lv-${v}" data-perm="${m}|${g}" aria-label="${esc(MODULE_NAMES[m] + ", " + GROUPS[g])}">${LEVELS.map((l) => `<option value="${l}" ${l === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>`;
    };
    // (v22) a change redraws only this card (not the whole page), keeping the table's sideways place and the chosen box
    AFTER.push(() => document.querySelectorAll("[data-perm]").forEach((el) => el.addEventListener("change", () => {
      const [m, g] = el.dataset.perm.split("|"); permDraft[m][g] = el.value;
      const box = $(".main .permwrap"), sl = box ? box.scrollLeft : 0, st = box ? box.scrollTop : 0, y = window.scrollY;
      swapCard(".permcard", () => permEditor(me()), true);
      const nb = $(".main .permwrap"); if (nb) { nb.scrollLeft = sl; nb.scrollTop = st; }
      window.scrollTo(window.scrollX, y);
      const f = document.querySelector('[data-perm="' + el.dataset.perm + '"]'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    })));
    return `<section class="card permcard"><div class="card-head"><h2>Permissions by user group</h2>${editable ? `<div class="quick">
        ${changed.length ? btn("Undo", () => { permDraft = null; render(); }) + btn("Save " + changed.length + " change" + (changed.length > 1 ? "s" : ""), () => savePerms(u, changed), "primary") : ""}
        ${!changed.length && diffStd ? btn("Back to standard", () => confirmAction("Back to the standard permissions", [{ name: "ok", label: "Type STANDARD to undo all " + diffStd + " custom settings", required: true }], async (v) => { if (String(v.ok).trim().toUpperCase() !== "STANDARD") throw new Error("Type STANDARD to confirm."); permDraft = JSON.parse(JSON.stringify(PERMS_STANDARD)); const ch = []; for (const m of Object.keys(cur)) for (const g of Object.keys(GROUPS)) if (permDraft[m][g] !== cur[m][g]) ch.push([m, g, cur[m][g], permDraft[m][g]]); await savePerms(u, ch, true); }, "Reset"), "danger") : ""}</div>` : ""}</div>
      <p class="muted small">${editable ? "Choose what each group can do in each module, then save. Changes apply to everyone straight away and are recorded in the activity log." : "Only the MD and the system administrator can change these."}
        ${ps ? " Last changed by " + esc(staffName(ps.updated_by)) + " on " + fmtDate(ps.updated_at) + "." : ""} ${diffStd ? `<b>${diffStd}</b> setting${diffStd > 1 ? "s differ" : " differs"} from the standard (outlined).` : "All settings are standard."}</p>
      <div class="scroll permwrap"><table class="list matrix perm"><thead><tr><th>Module</th>${Object.keys(GROUPS).map((g) => `<th>${esc(GROUPS[g])}</th>`).join("")}</tr></thead><tbody>
        ${Object.keys(cur).map((m) => `<tr><td><b>${esc(MODULE_NAMES[m] || m)}</b></td>${Object.keys(GROUPS).map((g) => cell(m, g)).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="lvkey">${LEVELS.map((l) => `<span><b class="lv-${l}">${l}</b> ${esc(LEVEL_HELP[l])}</span>`).join("")}</div>
      <p class="muted small">Special roles set on a person in People still apply on top of the group (for example HR, Procurement, Document Engineer, QA/QC). The system administrator always has full access. Approval routes follow the job roles (PM, QS, MD, Procurement, Finance).</p></section>`;
  }
  async function savePerms(u, changed, reset) {
    const value = JSON.parse(JSON.stringify(permDraft)), ps = permSetting();
    const row = { key: "permissions", value, updated_by: u.id, updated_at: nowIso() };
    if (ps) await Store.update("app_settings", ps.id, row); else await Store.insert("app_settings", Object.assign({ id: "permissions" }, row));
    for (const [m, g, a, b] of changed) await log("Permission change", "app_settings", "permissions", (reset ? "Reset to standard · " : "") + (MODULE_NAMES[m] || m) + " · " + GROUPS[g] + ": " + (LEVEL_PLAIN[a] || a) + " → " + (LEVEL_PLAIN[b] || b));
    permDraft = null; render(); toast(changed.length + " permission change" + (changed.length > 1 ? "s" : "") + " saved");
  }
  // Reset the demo: one clear dialog, then the starting data comes back for everyone using this link
  function resetDemo() {
    const shared = Store.mode === "supabase";
    openModal("Reset demo data", `<div class="reset-box">
      <p><b>Everything entered during testing is replaced by the starting demo data:</b> 40 staff, 5 demo projects, sample requests, reports, drawings, POs and stock.</p>
      <p class="warnline">${shared ? "This resets the shared database, so it changes the demo for <b>everyone</b> using the link." : "This resets the demo on <b>this device only</b>."}</p>
      <label class="chk"><input type="checkbox" id="rk-tg" checked> Keep everyone's Telegram link</label>
      <label class="chk"><input type="checkbox" id="rk-set" checked> Keep permission settings and alert choices</label>
      <label class="chk"><input type="checkbox" id="rk-ok"> I understand that test records will be deleted</label>
      <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button>
        <button type="button" class="btn danger-solid" id="rk-go" disabled data-act="${act(async (e, el) => {
          el.disabled = true; el.textContent = "Resetting…";
          try {
            await Store.reset({ telegram: $("#rk-tg").checked, settings: $("#rk-set").checked });
            permDraft = null; tgStatus.checked = false; tgLast = {};
            closeAllModals(); toast("Demo data reset. Everything is back to the starting point.");
            go(can(me(), "dashboard", "view") ? "dashboard" : "home"); render();
          } catch (err) { el.disabled = false; el.textContent = "Reset to demo data"; toast("Reset failed: " + err.message, true); }
        })}">Reset to demo data</button></div></div>`, (m) => {
      const ok = m.querySelector("#rk-ok"), go_ = m.querySelector("#rk-go");
      ok.addEventListener("change", () => { go_.disabled = !ok.checked; });
    });
  }
  // System health for the admin: database, Telegram bot, who has linked Telegram
  function healthCard() {
    const db_ = Store.mode === "supabase";
    if (db_ && !tgStatus.checked && !healthCard.busy) AFTER.push(() => { healthCard.busy = true; loadTelegramStatus().finally(() => { healthCard.busy = false; if (state.route === "admin") swapCard(".health", healthCard); }); });
    const linkedN = staffNow().filter((s) => String(s.telegram_chat_id || "").trim()).length;
    const notLinked = staffNow().filter((s) => !String(s.telegram_chat_id || "").trim()).map((s) => s.name);
    const row = (ok, t, sub) => `<li class="${ok === true ? "ok" : ok === false ? "no" : "wait"}"><i>${ok === true ? "✓" : ok === false ? "✕" : "…"}</i><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</span></li>`;
    return `<section class="card health"><div class="card-head"><h2>System health</h2>${db_ ? btn("Check again", async () => { tgStatus.checked = false; await loadTelegramStatus(); swapCard(".health", healthCard); }) : ""}</div><ul class="tg-check">
      ${row(db_, db_ ? "Shared database connected" : "Shared database not connected", db_ ? "Everyone using this link sees the same data." : "config.js has no Supabase details, so data stays on each device and Telegram cannot send. SETUP.md, Steps 1 to 4.")}
      ${!db_ ? row(null, "Telegram bot", "Checked after the database is connected") : !tgStatus.checked ? row(null, "Telegram bot", "Checking…") : tgStatus.late ? row(null, "Telegram bot did not answer", "Check the internet connection, then press Check again.") : tgStatus.missing ? row(false, "Telegram part missing in the database", "Run the new supabase/schema.sql, then telegram-setup.sql.") : tgStatus.ready ? row(true, "Telegram bot ready", "@" + esc(String(tgStatus.bot || "").replace(/^@/, ""))) : row(false, "Telegram bot not set up", "Run supabase/telegram-setup.sql with the token from @BotFather (SETUP.md, Step 5).")}
      ${row(linkedN ? (linkedN === staffNow().length ? true : null) : false, linkedN + " of " + staffNow().length + " staff linked to Telegram", notLinked.length ? "Not linked yet: " + esc(notLinked.slice(0, 12).join(", ")) + (notLinked.length > 12 ? " and " + (notLinked.length - 12) + " more" : "") : "Everyone is linked.")}
    </ul></section>`;
  }
  // ---------- DEVICES (Settings) ----------
  // Every phone or computer that unlocks the app gets its own ID on that device. It reports in every minute while the app is open.
  // The System Admin can sign a device out: next time it reports in, the app locks and asks for the passkey again.
  const DEV_ID_KEY = "gid-device-id", DEV_LOCAL = "gid-devices", ONLINE_MIN = 3;
  const DEV = { list: [], loaded: 0, missing: false, loading: false };
  function deviceId() {
    let id = null; try { id = localStorage.getItem(DEV_ID_KEY); } catch (e) { /* ignore */ }
    if (!id) { id = uid(); try { localStorage.setItem(DEV_ID_KEY, id); } catch (e) { /* ignore */ } }
    return id;
  }
  function deviceInfo() {
    const ua = navigator.userAgent || "", touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || touchMac ? "iPad" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
      : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "Chromebook" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Other";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Telegram/.test(ua) ? "Telegram" : /FBAN|FBAV/.test(ua) ? "Facebook"
      : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
    const kind = /iPhone|Android phone/.test(os) ? "Phone" : /iPad|tablet/.test(os) ? "Tablet" : "Computer";
    let app = false; try { app = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { /* ignore */ }
    return { os, browser: app ? browser + " (app)" : browser, kind, name: os + " · " + browser + (app ? " app" : "") };
  }
  function devLocal() { try { return JSON.parse(localStorage.getItem(DEV_LOCAL) || "[]"); } catch (e) { return []; } }
  function devLocalSave(list) { try { localStorage.setItem(DEV_LOCAL, JSON.stringify(list)); } catch (e) { /* ignore */ } }
  // One call: register or refresh this device. Returns its status ("active", "signed out" or "terminated").
  async function devBeat() {
    if (!state.user) return "active";
    const i = deviceInfo(), id = deviceId(), now = nowIso();
    if (Store.mode === "supabase") {
      const { data, error } = await Store.client.rpc("device_beat", { p_id: id, p_staff: state.user, p_name: i.name, p_os: i.os, p_browser: i.browser, p_kind: i.kind, p_ua: (navigator.userAgent || "").slice(0, 300) });
      if (error) { if (/device_beat|device_sessions|schema cache|does not exist/i.test(error.message)) DEV.missing = true; throw new Error(error.message); }
      DEV.missing = false; return data || "active";
    }
    const list = devLocal(); let r = list.find((x) => x.id === id);
    if (r && r.status !== "active") return r.status;
    if (!r) { r = { id, first_seen: now, status: "active" }; list.push(r); }
    Object.assign(r, { staff_id: state.user, device_name: r.label ? r.device_name : i.name, os: i.os, browser: i.browser, kind: i.kind, last_seen: now });
    devLocalSave(list); return "active";
  }
  async function devLoad(force) {
    if (DEV.loading || (!force && Date.now() - DEV.loaded < 20000)) return;
    DEV.loading = true;
    try {
      if (Store.mode === "supabase") {
        const { data, error } = await Store.client.from("device_sessions").select("*").order("last_seen", { ascending: false }).limit(1000);
        if (error) { DEV.missing = true; DEV.list = []; } else { DEV.missing = false; DEV.list = data || []; }
      } else DEV.list = devLocal();
      DEV.loaded = Date.now();
    } finally { DEV.loading = false; }
  }
  async function devUpdate(id, p) {
    if (Store.mode === "supabase") { const { error } = await Store.client.from("device_sessions").update(p).eq("id", id); if (error) throw new Error(error.message); }
    else { const list = devLocal(); const r = list.find((x) => x.id === id); if (r) Object.assign(r, p); devLocalSave(list); }
    const r = DEV.list.find((x) => x.id === id); if (r) Object.assign(r, p);
  }
  // This device was signed out: forget it, lock the app and tell the person why on the passkey screen
  async function devKick(status) {
    if (devKick.done) return; devKick.done = true;
    const acc = accountMode();
    try {
      localStorage.removeItem(DEV_ID_KEY);
      sessionStorage.setItem("gid-kicked", acc ? (status === "terminated" ? "This device was signed out by the System Admin. Sign in again." : "This device was signed out. Sign in again.")
        : status === "terminated" ? "This device was signed out by the System Admin. Enter the passkey to sign in again." : "This device was signed out. Enter the passkey to sign in again.");
    } catch (e) { /* ignore */ }
    await endAccountSession(); // also end the account sign-in on this device
    if (window.GID_LOCK) window.GID_LOCK(); else location.reload();
  }
  async function devCheck() {
    if (document.visibilityState === "hidden" || offlineNow()) return;
    try { const st = await devBeat(); if (st && st !== "active") devKick(st); } catch (e) { /* no internet or table missing: try again later */ }
  }
  // The lock button: mark this device as signed out by its own user, then lock
  async function lockThisDevice() {
    try { await devUpdate(deviceId(), { status: "signed out", ended_at: nowIso(), ended_by: state.user }); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(DEV_ID_KEY); } catch (e) { /* ignore */ }
    await endAccountSession();
    if (window.GID_LOCK) window.GID_LOCK();
  }
  const canEndDevices = (u) => hasTag(u, "SYSADMIN") || hasTag(u, "BACKUPADMIN");
  const minsAgo = (iso) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 1e9;
  function agoTxt(iso) {
    const m = minsAgo(iso);
    if (m >= 1e9) return "never"; if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    const h = Math.round(m / 60); if (h < 24) return h + " h ago"; const d = Math.round(h / 24); return d + (d === 1 ? " day ago" : " days ago");
  }
  function devState(d) {
    if (d.status === "terminated") return ["Signed out by admin", "r"];
    if (d.status === "signed out") return ["Signed out", "n"];
    const m = minsAgo(d.last_seen);
    if (m <= ONLINE_MIN) return ["Online now", "g"];
    if (m > 30 * 1440) return ["Not used 30+ days", "n"];
    return ["Signed in", "w"];
  }
  const devIcon = (d) => d.kind === "Computer" ? "🖥️" : d.kind === "Tablet" ? "📱" : "📱";
  function endDevice(d) {
    const who = staffName(d.staff_id);
    formModal("Sign out device", [{ name: "why", label: "Reason (optional, for the activity log)", help: "For example: phone lost, staff left, shared computer" }], async (v) => {
      await devUpdate(d.id, { status: "terminated", ended_at: nowIso(), ended_by: state.user, ended_note: v.why || "" });
      try { await Store.insert("audit_log", { at: nowIso(), actor_id: state.user, action: "Signed out device", tbl: "device_sessions", record_id: d.id, summary: (d.label || d.device_name) + " · " + who + (v.why ? " · " + v.why : "") }); } catch (e) { /* ignore */ }
      toast("Signed out. The device will lock within a minute if it is open.");
    }, "Sign out device", { extraHtml: `<p><b>${esc(d.label || d.device_name)}</b> · ${esc(who)}</p><p class="muted small">The app on that device locks and asks for the passkey again. Its data on the server is not changed.</p>` });
  }
  function endOthers(list) {
    formModal("Sign out all other devices", [{ name: "why", label: "Reason (optional, for the activity log)" }], async (v) => {
      for (const d of list) await devUpdate(d.id, { status: "terminated", ended_at: nowIso(), ended_by: state.user, ended_note: v.why || "" });
      try { await Store.insert("audit_log", { at: nowIso(), actor_id: state.user, action: "Signed out device", tbl: "device_sessions", record_id: "", summary: list.length + " devices signed out" + (v.why ? " · " + v.why : "") }); } catch (e) { /* ignore */ }
      toast(list.length + " devices signed out.");
    }, "Sign out " + list.length + " devices", { extraHtml: `<p class="muted small">Every device except this one locks and asks for the passkey again (${list.length} devices).</p>` });
  }
  function renameDevice(d) {
    formModal("Name this device", [{ name: "label", label: "Name", value: d.label || "", help: "For example: Site office laptop, Sophea's iPhone" }], async (v) => {
      await devUpdate(d.id, { label: v.label || null });
    }, "Save");
  }
  function openDevice(d) {
    const st = devState(d), mine = d.id === deviceId(), can_ = canEndDevices(me());
    detail(d.label || d.device_name, [["Status", chip(st[0], st[1])], ["Device", esc(devIcon(d) + " " + d.kind + " · " + d.os + " · " + d.browser)], ["Used by", esc(staffName(d.staff_id))],
      ["First signed in", d.first_seen ? fmtDate(d.first_seen) + " " + rTime(d.first_seen) : ""], ["Last active", d.last_seen ? fmtDate(d.last_seen) + " " + rTime(d.last_seen) + " · " + esc(agoTxt(d.last_seen)) : ""],
      d.status !== "active" ? ["Signed out", (d.ended_at ? fmtDate(d.ended_at) + " " + rTime(d.ended_at) : "") + (d.ended_by ? " · " + esc(staffName(d.ended_by)) : "") + (d.ended_note ? " · " + esc(d.ended_note) : "")] : null],
      (can_ ? btn("Rename", () => renameDevice(d)) : "") + (can_ && !mine && d.status === "active" ? btn("Sign out device", () => endDevice(d), "danger") : ""),
      mine ? '<p class="muted small">This is the device you are using now. Use the lock button in the menu to sign it out.</p>' : "");
  }
  function devicesCard(u) {
    if (!DEV.loaded && !DEV.tried) AFTER.push(() => { DEV.tried = true; devLoad().then(() => { if (state.route === "admin") swapCard(".devices", () => devicesCard(me())); }, () => { /* offline: the minute timer tries again */ }); });
    if (DEV.missing) return `<section class="card devices"><h2>Devices</h2><p class="warnline">The devices table is not in the database yet. Paste supabase/update-v18.sql into Supabase → SQL Editor and press Run.</p></section>`;
    const can_ = canEndDevices(u), me_ = deviceId();
    const all = DEV.list.slice().sort((a, b) => String(b.last_seen || "").localeCompare(String(a.last_seen || "")));
    const act_ = all.filter((d) => d.status === "active"), online = act_.filter((d) => minsAgo(d.last_seen) <= ONLINE_MIN);
    const phones = act_.filter((d) => d.kind !== "Computer").length, people = new Set(act_.map((d) => d.staff_id)).size;
    const ended30 = all.filter((d) => d.status !== "active" && minsAgo(d.ended_at || d.last_seen) <= 30 * 1440).length;
    const T = tabs("devices", [["on", "Signed in (" + act_.length + ")"], ["live", "Online now (" + online.length + ")"], ["off", "Signed out"]]);
    const q = String(state.search || "").toLowerCase();
    const rows = (T.cur === "on" ? act_ : T.cur === "live" ? online : all.filter((d) => d.status !== "active"))
      .filter((d) => !q || [d.label, d.device_name, staffName(d.staff_id)].join(" ").toLowerCase().includes(q));
    const others = act_.filter((d) => d.id !== me_);
    return `<section class="card devices"><div class="card-head"><h2>Devices</h2><div class="quick">${btn("Refresh", async () => { await devLoad(true); swapCard(".devices", () => devicesCard(me()), true); })}${can_ && others.length ? btn("Sign out all other devices", () => endOthers(others), "danger") : ""}</div></div>
      <p class="muted small">Every phone or computer that unlocked the app. Online now = used in the last ${ONLINE_MIN} minutes. ${can_ ? "Tap a device to rename it or sign it out." : "Only the System Admin can sign devices out."}</p>
      ${kpis5([["Signed-in devices", String(act_.length), people + " people"], ["Online now", String(online.length), "", online.length ? "g" : ""], ["Phones & tablets", String(phones), (act_.length - phones) + " computers"], ["Signed out (30 days)", String(ended30)]])}
      ${T.html}
      ${table([{ label: "Device", get: (d) => `<b>${devIcon(d)} ${esc(d.label || d.device_name)}</b>${d.id === me_ ? ' <span class="chip g">This device</span>' : ""}${d.label ? `<br><small class="muted">${esc(d.device_name)}</small>` : ""}` },
        { label: "Used by", get: (d) => esc(staffName(d.staff_id)) },
        { label: "Last active", get: (d) => esc(agoTxt(d.last_seen)) },
        { label: "Since", get: (d) => d.first_seen ? fmtDate(d.first_seen) : "" },
        { label: "Status", get: (d) => { const s = devState(d); return chip(s[0], s[1]); } },
        { label: "", get: (d) => can_ && d.id !== me_ && d.status === "active" ? `<button class="btn danger small" data-act="${act(() => endDevice(d))}">Sign out</button>` : "" }], rows, openDevice)}</section>`;
  }
  // report in now, every minute, and whenever the app comes back to the screen
  function devStart() {
    devCheck(); setInterval(devCheck, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") devCheck(); });
    // Settings open: refresh only the Devices card, and never while the person is using the page
    setInterval(() => { if (state.route === "admin" && document.visibilityState === "visible" && !$("#modal") && !handsOn()) devLoad(true).then(() => { if (state.route === "admin") swapCard(".devices", () => devicesCard(me())); }); }, 60000);
  }
  // Replace one card on the page with fresh HTML (no full redraw: scroll, open lists and focus stay as they are)
  // (v22) If the person is busy (finger on the screen, scrolling, a window open, or working inside this card), try again a moment later
  // instead of giving up, so "Checking…" and the devices list always finish updating.
  const SWAP_WAIT = {};
  function swapCard(sel, make, force) {
    const old = document.querySelector(".main " + sel); if (!old) return;
    clearTimeout(SWAP_WAIT[sel]);
    if (!force && ($("#modal") || $("#lightbox") || $("#badges") || handsOn() || old.contains(document.activeElement))) {
      const route = state.route, tries = (SWAP_WAIT[sel + "#n"] || 0) + 1;
      SWAP_WAIT[sel + "#n"] = tries;
      if (tries < 400) SWAP_WAIT[sel] = setTimeout(() => { if (state.route === route) swapCard(sel, make); }, 1500);
      return;
    }
    SWAP_WAIT[sel + "#n"] = 0;
    const keepAfter = AFTER.splice(0);
    const tmp = document.createElement("div"); tmp.innerHTML = make();
    const fresh = tmp.firstElementChild; if (!fresh) { AFTER.push(...keepAfter); return; }
    old.replaceWith(fresh);
    AFTER.splice(0).forEach((f) => f()); AFTER.push(...keepAfter);
    if (typeof translateNow === "function") translateNow(fresh);
  }

  // ================= v23 Announcements: a message from the System Admin to everyone or to chosen departments / people =================
  // Only the System Admin and the backup admin write them. Each person gets one alert (and Telegram message through the
  // notifications trigger); unread ones show as a banner on Dashboard and My work until the person taps "Got it".
  const canAnnounce = (u) => !!u && (isSysAdmin(u) || hasTag(u, "BACKUPADMIN"));
  const trTxt = (x) => (window.I18N && I18N.t && I18N.t(x)) || x; // Khmer for a browser confirm() question
  const ANN_MAX = 2000;
  const annDept = (s) => { const g = groupsOf(s)[0]; return DEPT_ORDER.includes(g) ? g : "ADMIN"; };
  const annRecipients = (a) => (Array.isArray(a && a.recipients) ? a.recipients : []);
  const annNotes = (a, to) => db.notifications.filter((n) => n.tbl === "announcements" && n.record_id === a.id && (!to || n.to_id === to));
  const annReadCount = (a) => new Set(annNotes(a).filter((n) => n.read).map((n) => n.to_id)).size;
  const annImportant = (a) => a.importance === "Important";
  function annAudienceHtml(a) {
    const au = (a && a.audience) || {};
    if (au.all) return "<span>Everyone</span>";
    const parts = (au.groups || []).map((g) => DEPT_NAME[g] || g), n = (au.staff || []).length;
    if (n) parts.push(n === 1 ? "1 person" : n + " people");
    return parts.length ? parts.map((p) => `<span>${esc(p)}</span>`).join(" · ") : "—";
  }
  // Announcements this person has not read yet and that still belong on the home screens
  function annForMe(u) {
    const t = today();
    return (db.announcements || []).filter((a) => a.status === "Sent" && annRecipients(a).includes(u.id) && annNotes(a, u.id).some((n) => !n.read)
      && (annImportant(a) || (a.pin_until && String(a.pin_until).slice(0, 10) >= t)))
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  }
  // The banner (also used for the preview while writing; preview = no working buttons)
  function annBannerHtml(a, preview) {
    const msg = String(a.message || ""), long = !preview && msg.length > 280;
    const gotIt = preview ? `<button type="button" class="btn small primary" tabindex="-1">Got it</button>` : `<button class="btn small primary" data-act="${act(() => annGotIt(a))}">Got it</button>`;
    return `<section class="annc${annImportant(a) ? " imp" : ""}" role="status" aria-label="Announcement"><span class="annc-ic">${svgI("megaphone")}</span>
      <div class="annc-b"><div class="annc-h">${annImportant(a) ? chip("Important", "r") : ""}<b class="notr">${esc(a.title || "")}</b></div>
        <p class="annc-m notr">${esc(long ? msg.slice(0, 270).replace(/\s+\S*$/, "") + "…" : msg)}</p>
        <small class="annc-f"><span>Sent by</span> ${esc(staffName(a.sent_by))} · ${a.sent_at ? fmtDate(a.sent_at) + " " + timeOf(a.sent_at) : ""}</small></div>
      <div class="annc-a">${long ? `<button class="btn small" data-act="${act(() => openAnnouncement(a))}">Read all</button>` : ""}${gotIt}</div></section>`;
  }
  function annBanners(u) {
    const list = annForMe(u); if (!list.length) return "";
    return `<div class="annc-list">${list.slice(0, 3).map((a) => annBannerHtml(a)).join("")}${list.length > 3 ? `<p class="muted small">${list.length - 3} more announcements in Alerts.</p>` : ""}</div>`;
  }
  async function annGotIt(a) { await markSeen("announcements", a.id); renderKeep(); }
  function openAnnouncement(a) {
    if (!a) return;
    const u = me(), admin = canAnnounce(u), gone = a.status === "Withdrawn";
    if (!admin && !isAdminPage(u) && a.sent_by !== u.id && !annRecipients(a).includes(u.id)) { toast("This announcement was not sent to you.", true); return; }
    if (annNotes(a, u.id).some((n) => !n.read)) markSeen("announcements", a.id);
    annNotes(a, u.id).forEach((n) => { n.read = true; }); // (saved by markSeen) so the banner behind the window goes away now
    if (["home", "dashboard"].includes(state.route)) renderKeep();
    const n = annRecipients(a).length;
    detail("Announcement", [
      ["Title", `<b class="notr">${esc(a.title)}</b>`],
      gone && !admin ? ["Message", "This announcement was withdrawn."] : ["Message", `<div class="annc-m notr">${esc(a.message)}</div>`],
      ["Importance", annImportant(a) ? chip("Important", "r") : chip("Normal", "n")],
      ["Sent by", esc(staffName(a.sent_by))], ["Sent", a.sent_at ? fmtDate(a.sent_at) + " " + timeOf(a.sent_at) : ""],
      admin ? ["Sent to", annAudienceHtml(a) + ` <small class="muted">(${n})</small>`] : null,
      admin ? ["Read by", `${annReadCount(a)} / ${n}`] : null,
      ["Status", gone ? chip("Withdrawn", "n") : chip("Sent", "g")]],
      admin && !gone ? btn("Withdraw", () => annWithdraw(a), "danger") : "");
  }
  async function annWithdraw(a) {
    if (!canAnnounce(me())) { toast("Only the System Admin can do this.", true); return; }
    if (!confirm(trTxt("Withdraw this announcement? It disappears from everyone's Dashboard and My work. It stays in the history."))) return;
    try {
      await patch("announcements", a.id, { status: "Withdrawn" }, "Announcement withdrawn: " + a.title);
      // the alerts of a withdrawn message no longer count as unread (one request for everyone)
      if (Store.mode === "supabase") { const { error } = await Store.client.from("notifications").update({ read: true }).eq("tbl", "announcements").eq("record_id", a.id).eq("read", false); if (error) throw new Error(error.message); }
      annNotes(a).forEach((x) => { x.read = true; }); if (Store.mode === "local") Store.writeLocal();
    } catch (e) { toast(e.message || String(e), true); return; }
    closeAllModals(); render(); updateBell(); toast("Announcement withdrawn");
  }
  function annCompose(u) {
    if (!canAnnounce(u)) return;
    formModal("New announcement", [
      { name: "title", label: "Title", required: true, help: "Short, for example: Office closed on Friday" },
      { name: "message", label: "Message", type: "textarea", required: true, help: "Line breaks are kept. Up to 2000 characters." },
      { name: "importance", label: "Importance", type: "select", options: ["Normal", "Important"], help: "Important stays at the top of Dashboard and My work until each person taps Got it. Normal shows there until it is read or until the date below." },
      { name: "pin_until", label: "Show on Dashboard and My work until", type: "date", value: isoAdd(today(), 3) },
      { name: "audience", label: "Send to", type: "select", options: [["all", "Everyone"], ["some", "Chosen departments or people"]] }
    ], async (v) => {
      const title = String(v.title || "").trim(), msg = String(v.message || "").replace(/\r\n?/g, "\n").trim();
      if (!title || !msg) throw new Error("Write a title and a message.");
      if (msg.length > ANN_MAX) throw new Error("The message is too long: up to 2000 characters.");
      const now_ = staffNow(); let ids, audience;
      if (v.audience === "some") {
        let sel = []; try { sel = JSON.parse(v.attendees || "[]"); } catch (x) { sel = []; }
        const live = new Set(now_.map((s) => s.id)); sel = sel.filter((id) => live.has(id));
        // a whole department ticked is saved as that department (the people list is fixed when the message is sent)
        const groups = DEPT_ORDER.filter((g) => { const mem = now_.filter((s) => annDept(s) === g); return mem.length && mem.every((s) => sel.includes(s.id)); });
        const inGroups = new Set(now_.filter((s) => groups.includes(annDept(s))).map((s) => s.id));
        audience = { groups, staff: sel.filter((id) => !inGroups.has(id)) }; ids = sel;
      } else { audience = { all: true }; ids = now_.map((s) => s.id); }
      ids = [...new Set(ids)].filter((id) => id !== u.id);
      if (!ids.length) throw new Error("Choose at least one person (other than you).");
      if (!confirm(trTxt(ids.length === 1 ? "Send to 1 person?" : "Send to " + ids.length + " people?"))) return false;
      const row = await save("announcements", { title: title.slice(0, 150), message: msg, importance: v.importance === "Important" ? "Important" : "Normal", audience, recipients: ids,
        sent_by: u.id, sent_at: nowIso(), pin_until: v.pin_until || "", status: "Sent" }, "Announcement sent: " + title.slice(0, 150));
      const at = nowIso();
      const sent = await insertNotes(ids.map((to) => Object.assign(noteRow(to, u.id, "announcements", row.id, { kind: "announcement", title: row.title, title_km: row.title }, at), { body: msg, module: "announcements" })));
      if (sent.length < ids.length) { toast("The announcement was saved, but the alerts could not be sent: " + (sent.length + " / " + ids.length), true); return; }
      updateBell(); toast(ids.length === 1 ? "Sent to 1 person" : "Sent to " + ids.length + " people");
    }, "Send", {
      extraHtml: `<div class="ann-pick" hidden>${peoplePicker([], "Departments and people")}</div>
        <div class="ann-prev"><span class="ann-prev-h">Preview: how people will see it</span><div class="ann-prev-b"></div></div>`,
      onReady: (m) => {
        wirePeoplePicker(m);
        const f = m.querySelector("#mform"), ta = f.querySelector('textarea[name="message"]'); ta.rows = 6; ta.maxLength = ANN_MAX; const ti = f.querySelector('input[name="title"]'), imp = f.querySelector('select[name="importance"]'); ti.maxLength = 150;
        const pick = m.querySelector(".ann-pick"), aud = f.querySelector('select[name="audience"]'), prev = m.querySelector(".ann-prev-b");
        const paint = () => {
          pick.hidden = aud.value !== "some";
          prev.innerHTML = annBannerHtml({ title: ti.value.trim() || "Title", message: ta.value.replace(/\r\n?/g, "\n").trim() || "Message", importance: imp.value, sent_by: u.id, sent_at: nowIso() }, true);
          if (typeof translateNow === "function") translateNow(prev);
        };
        f.addEventListener("input", paint); f.addEventListener("change", paint); paint();
      }
    });
  }
  function annCard(u) {
    const list = (db.announcements || []).slice().sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at))).slice(0, 40);
    const missing = (Store.missing || []).includes("announcements");
    return `<section class="card ann"><div class="card-head"><h2>Announcements</h2><div class="quick">${missing ? "" : btn("New announcement", () => annCompose(me()), "primary")}</div></div>
      <p class="muted small">Write a message to everyone, or to chosen departments or people. It shows at the top of their Dashboard and My work, in Alerts, and on Telegram.</p>
      ${missing ? '<p class="warnline">The announcements table is not in the database yet. Paste supabase/update-v23.sql into Supabase → SQL Editor and press Run.</p>' : ""}
      <div class="tscroll">${table([
        { label: "Sent", get: (a) => a.sent_at ? fmtDate(a.sent_at) + ` <small>${timeOf(a.sent_at)}</small>` : "" },
        { label: "Title", get: (a) => `<b class="notr">${esc(a.title)}</b>${annImportant(a) ? " " + chip("Important", "r") : ""}` },
        { label: "Sent by", get: (a) => esc(staffName(a.sent_by)) },
        { label: "Sent to", get: (a) => annAudienceHtml(a) },
        { label: "Read by", get: (a) => `${annReadCount(a)} / ${annRecipients(a).length}` },
        { label: "Status", get: (a) => a.status === "Withdrawn" ? chip("Withdrawn", "n") : chip("Sent", "g") },
        { label: "", get: (a) => a.status === "Sent" ? `<button class="btn danger small" data-act="${act(() => annWithdraw(a))}">Withdraw</button>` : "" }], list, openAnnouncement)}</div></section>`;
  }

  SCREENS.admin = (u) => {
    const audit = db.audit_log.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    const sys = isAdminPage(u);
    return `<h1>Settings</h1><p class="muted">${canManagePerms(u) ? "Control who can see and do what, and check the activity log." : "System settings and activity log."}</p>
      ${canAnnounce(u) ? annCard(u) : ""}
      ${isAdminPage(u) ? healthCard() : ""}
      ${isAdminPage(u) ? devicesCard(u) : ""}
      ${permEditor(u)}
      ${sys ? `<section class="card"><h2>Data</h2><p>${Store.mode === "supabase" ? "Connected to Supabase. Every change is saved in the online database and everyone using this link sees it." : "Browser demo: data is saved only in this browser on this device. Connect Supabase (see SETUP.md) to share data between people."}</p>
        <div class="quick">${btn("Reset demo data", resetDemo, "danger")}
        ${btn("Download all data (JSON)", () => { const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gid-demo-data-" + today() + ".json"; a.click(); })}</div></section>` : ""}
      <section class="card"><h2>Activity log</h2>${table([{ label: "When", get: (a) => fmtDate(a.at) + ` <small>${new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small>` },
        { label: "Who", get: (a) => esc(staffName(a.actor_id)) }, { label: "Action", get: (a) => esc(a.action) }, { label: "Details", get: (a) => esc(a.summary) }], audit)}</section>`;
  };

  // From inside a window or panel: take the place of its Back step, so Back returns to the screen before
  function go(route) { if (history.state && history.state.gidModal && location.hash !== "#" + route) location.replace("#" + route); else location.hash = "#" + route; }
  function routeFromHash() {
    const u = me(); const def = can(u, "dashboard", "view") ? "dashboard" : "home"; let r = (location.hash || "").replace(/^#\/?/, "") || def;
    // a project page: #projects/<id>
    const pm = /^projects\/(.+)$/.exec(r); state.pid = pm ? decodeURIComponent(pm[1]) : ""; if (pm) r = "projects";
    return SCREENS[r] ? r : def;
  }

  // ================= accounts: sign in with phone/email + password (v20) =================
  // window.GID_AUTH (set by index.html) says how this person came in: "account" (own sign-in, fixed to one staff profile)
  // or "passkey" (demo: switch person works). Every call to the database sign-in functions goes through authRpc,
  // so tests can answer the requests to /rest/v1/rpc/gid_* without a real database.
  const AUTH = () => window.GID_AUTH || { mode: "passkey" };
  const accountMode = () => AUTH().mode === "account";
  const NET_MSG = "Can't reach the server. Check the internet and try again.", SERVER_MSG = "The server could not do this right now. Try again later.";
  const SIGNED_OUT_MSG = "You were signed out. Please sign in again.";
  const strongPw = (p) => String(p || "").length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
  const PW_RULE = "At least 8 characters, with a letter and a number.";
  function authErr(code, detail) { const e = new Error(code === "server" ? SERVER_MSG : NET_MSG); e.code = code; e.detail = detail; return e; }
  async function authRpc(name, args) {
    if (!Store.client) { try { Store.connect(); } catch (e) { /* no library: treated as no internet */ } }
    if (!Store.client) throw authErr("network");
    let res;
    try { res = await Promise.race([Store.client.rpc(name, args || {}), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))]); }
    catch (e) { throw authErr("network", e && e.message); }
    if (res.error) throw authErr(res.status ? "server" : "network", res.error.message);
    let d = res.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { /* keep */ } }
    return d && typeof d === "object" ? d : { ok: false, error: "server" };
  }
  window.GID_AUTH_API = { rpc: authRpc };
  try { window.dispatchEvent(new CustomEvent("gid:auth-ready")); } catch (e) { /* ignore */ }

  function dropSession() { if (window.GID_DROP_SESSION) window.GID_DROP_SESSION(); else { try { localStorage.removeItem("gid-session"); sessionStorage.removeItem("gid-session"); } catch (e) { /* ignore */ } } }
  // End the account session on the server (best effort) and go back to the sign-in screen
  async function endAccountSession() {
    const A = AUTH();
    if (A.mode === "account" && A.token) { try { await authRpc("gid_sign_out", { p_token: A.token }); } catch (e) { /* no internet: the token is dropped on this device anyway */ } }
    dropSession();
  }
  async function signOut(msg) {
    if (signOut.busy) return; signOut.busy = true;
    try { if (msg) sessionStorage.setItem("gid-kicked", msg); } catch (e) { /* ignore */ }
    try { await devUpdate(deviceId(), { status: "signed out", ended_at: nowIso(), ended_by: state.user }); } catch (e) { /* ignore */ }
    await endAccountSession();
    if (window.GID_LOCK) window.GID_LOCK(); else location.reload();
  }
  // Full-page message with a Retry button (used before the app opens)
  function netScreen(msg) {
    return new Promise((res) => {
      $("#app").innerHTML = `<main class="gate"><div class="gate-card"><img class="gate-logo" src="img/logo-square.png" alt="Green In Design · Interior &amp; Exterior"><h1>Management System</h1>
        <p class="gate-err" role="alert">${esc(msg || NET_MSG)}</p><button class="btn primary gate-go" id="retry" type="button">Retry</button>
        ${accountMode() ? '<button class="btn gate-go gate-alt" id="outbtn" type="button">Sign out</button>' : ""}</div></main>`;
      $("#retry").onclick = () => { $("#app").innerHTML = '<div class="setup card"><p>Loading…</p></div>'; res(true); };
      const o = $("#outbtn"); if (o) o.onclick = () => { dropSession(); if (window.GID_LOCK) window.GID_LOCK(); else location.reload(); };
      translateNow();
    });
  }
  // The new-password form. temp=true: shown before the app opens (after a password reset)
  function pwFormHtml(temp) {
    const f = (id, label, ac, help) => `<label class="gate-field"><span>${label}</span><span class="gate-in"><input id="${id}" type="password" autocomplete="${ac}" required><button type="button" class="gate-eye" data-eye="${id}" aria-label="Show password">Show</button></span>${help ? `<small class="gate-help">${help}</small>` : ""}</label>`;
    return f("cp0", temp ? "Temporary password" : "Current password", "current-password") + f("cp1", "New password", "new-password", PW_RULE) + f("cp2", "Confirm new password", "new-password") + '<div class="gate-err" id="cperr" role="alert"></div>';
  }
  function wirePwForm(root, onDone) {
    root.addEventListener("click", (e) => { const eye = e.target.closest("[data-eye]"); if (!eye) return; const inp = root.querySelector("#" + eye.dataset.eye), show = inp.type === "password"; inp.type = show ? "text" : "password"; eye.textContent = show ? "Hide" : "Show"; eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); translateNow(eye); });
    const form = root.querySelector("form"), err = root.querySelector("#cperr"), go = form.querySelector("button[type=submit]");
    const say = (t) => { err.textContent = t; translateNow(err); };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const o = root.querySelector("#cp0").value, n1 = root.querySelector("#cp1").value, n2 = root.querySelector("#cp2").value;
      if (!o || !n1) return say("Fill in every box.");
      if (!strongPw(n1)) return say(PW_RULE);
      if (n1 !== n2) return say("The two passwords are not the same.");
      if (n1 === o) return say("Choose a new password that is different from the old one.");
      const label = go.textContent; go.disabled = true; go.textContent = "Saving…";
      let r;
      try { r = await authRpc("gid_change_password", { p_token: AUTH().token, p_old: o, p_new: n1 }); }
      catch (x) { go.disabled = false; go.textContent = label; return say(x.message); }
      go.disabled = false; go.textContent = label;
      if (r.ok) return onDone();
      if (r.error === "no_session") return signOut(SIGNED_OUT_MSG);
      say(r.error === "wrong" ? "The current password is wrong." : r.error === "weak_password" ? PW_RULE : SERVER_MSG);
    });
  }
  function mustChangeScreen() {
    return new Promise((res) => {
      const A = AUTH();
      $("#app").innerHTML = `<main class="gate"><div class="gate-card" id="cpcard"><img class="gate-logo" src="img/logo-square.png" alt="Green In Design · Interior &amp; Exterior">
        <h1>Choose a new password</h1><p class="gate-sub">${esc(A.name || "")}${A.name ? " · " : ""}Your password was reset. Choose your own new password to continue.</p>
        <form id="cpform" novalidate>${pwFormHtml(true)}<button class="btn primary gate-go" type="submit">Save new password</button></form>
        <button class="btn gate-go gate-alt" id="cpout" type="button">Sign out</button></div></main>`;
      const card = $("#cpcard");
      wirePwForm(card, () => { A.must_change_password = false; $("#app").innerHTML = '<div class="setup card"><p>Loading…</p></div>'; res(true); });
      $("#cpout").onclick = () => signOut();
      translateNow(); const f = $("#cp0"); if (f) f.focus();
    });
  }
  function openChangePassword() {
    openModal("Change password", `<form id="cpm" class="cpm" novalidate>${pwFormHtml(false)}<p class="muted small">Your other phones and computers will be signed out.</p><div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="submit" class="btn primary">Save new password</button></div></form>`, (m) => {
      wirePwForm(m, () => { closeAllModals(); toast("Password changed. Your other devices were signed out."); });
    });
  }
  // The header name button in account mode: own profile, change password, sign out
  function openAccountMenu() {
    const u = me(), A = AUTH();
    openModal("My account", `<div class="acct-me">${avatar(u, "av lg")}<span><b>${esc(u.name)}</b><small>${esc(u.title)}</small>${A.login ? `<small class="notr">${esc(A.login)}</small>` : ""}</span></div>
      ${untilTxt() ? `<p class="acct-until">${svgI("clock")}<span>${esc(untilTxt())}</span></p>` : ""}
      <div class="acct-menu">${btn("My profile", () => { closeAllModals(); openPerson(u); })}${btn("Change password", openChangePassword)}${btn("Sign out", () => signOut(), "danger")}</div>`);
  }
  // Before the app opens: check a saved sign-in, and ask for a new password when needed.
  async function authGate() {
    for (;;) {
      await gateOpen();
      const A = AUTH();
      if (A.mode !== "account") return;
      if (!A.verified) {
        let r;
        try { r = await authRpc("gid_session", { p_token: A.token }); }
        catch (e) { await netScreen(e.message); continue; }
        if (!r.ok) { if (window.GID_SHOW_GATE) { window.GID_SHOW_GATE(r.error === "no_session" ? SIGNED_OUT_MSG : r.error === "disabled" || r.error === "rejected" ? "This account cannot sign in. Ask HR." : SIGNED_OUT_MSG); continue; } dropSession(); location.reload(); return new Promise(() => {}); }
        Object.assign(A, { staff_id: r.staff_id, name: r.name, account_id: r.account_id, login: r.login, must_change_password: !!r.must_change_password, verified: true });
        if (r.expires_at) A.expires_at = r.expires_at;
      }
      if (A.must_change_password) await mustChangeScreen();
      return;
    }
  }
  // ---------- v23: sign in every day ----------
  // A sign-in (account or demo passkey) lasts until 03:00 the next morning, Phnom Penh time. index.html keeps the day stamp
  // (window.GID_SESSION_END); the server also refuses account sessions after that time. The offline report queue is kept.
  const DAILY_MSG = "Everyone signs in again each day after 3:00 am. Please sign in.";
  const signInEnds = () => { try { return window.GID_SESSION_END ? Number(window.GID_SESSION_END()) || 0 : 0; } catch (e) { return 0; } };
  const dayOver = () => { const e = signInEnds(); return !!e && Date.now() >= e; };
  function untilTxt() { const e = signInEnds(); if (!e) return ""; return "Signed in until " + timeOf(e) + (dateInPP(e) === dateInPP(Date.now()) ? " today" : " tomorrow"); }
  // A window with a form is open: warn first and give the person time to save (up to 30 minutes), then sign out
  const formOpen = () => { const m = $("#modal"); return !!(m && m.querySelector("form, textarea")); };
  let dayEndWarned = 0;
  function endForToday() {
    if (signOut.busy) return;
    clearTimeout(endForToday.t);
    if (formOpen() && (!dayEndWarned || Date.now() - dayEndWarned < 30 * 60000)) {
      if (!dayEndWarned) { dayEndWarned = Date.now(); dayEndBar(); }
      endForToday.t = setTimeout(endForToday, 20000);
      return;
    }
    signOut(DAILY_MSG);
  }
  function dayEndBar() {
    if ($("#dayend")) return;
    const d = document.createElement("div"); d.id = "dayend"; d.className = "dayend"; d.setAttribute("role", "alert");
    d.innerHTML = `${svgI("clock")}<span><b>Your sign-in for today has ended.</b> <span>Save your work now. You will be asked to sign in again when you close this window.</span></span>`;
    document.body.appendChild(d); if (typeof translateNow === "function") translateNow(d);
  }
  // true when the day is over (the person is being signed out, or will be once the internet is back)
  function dayCheck() {
    if (!dayOver()) return false;
    // account mode with no internet: signing in again is impossible, so wait until the signal is back (the report queue keeps working)
    if (!(accountMode() && !navigator.onLine)) endForToday();
    return true;
  }
  // While the app is open: check the day every minute, and the account sign-in every 5 minutes and when the app comes back to the screen
  function sessionWatch() {
    let last = Date.now();
    const check = async () => {
      if (dayCheck()) return;
      if (!accountMode() || offlineNow()) return; last = Date.now();
      let r; try { r = await authRpc("gid_session", { p_token: AUTH().token }); } catch (e) { return; /* no internet: try again later */ }
      if (r.ok && r.expires_at) AUTH().expires_at = r.expires_at;
      // the server ended the day's session (its clock may be a little ahead of this phone)
      if (!r.ok && (r.error === "expired" || (r.error === "no_session" && signInEnds() && Date.now() >= signInEnds() - 15 * 60000))) endForToday();
      else if (!r.ok || (r.staff_id && r.staff_id !== state.user)) signOut(SIGNED_OUT_MSG);
      else if (r.must_change_password) { AUTH().must_change_password = true; closeAllModals(); await mustChangeScreen(); render(); }
    };
    setInterval(check, 5 * 60000);
    setInterval(dayCheck, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return; if (dayCheck()) return; if (Date.now() - last > 30000) check(); });
    window.addEventListener("online", () => setTimeout(check, 2000));
    window.addEventListener("pageshow", () => dayCheck());
  }

  // ---------- People → Accounts (HR, System Admin, backup admin, MD) ----------
  const canAccounts = (u) => ["HR", "SYSADMIN", "BACKUPADMIN", "MD"].some((t) => hasTag(u, t));
  const ACC = { list: [], loaded: false, loading: false, err: "" };
  async function accLoad() {
    if (ACC.loading) return; ACC.loading = true;
    try {
      const r = await authRpc("gid_accounts", { p_token: AUTH().token });
      if (r.ok) { ACC.list = r.accounts || []; ACC.err = ""; }
      else if (r.error === "no_session") { ACC.loading = false; return signOut(SIGNED_OUT_MSG); }
      else ACC.err = r.error === "not_allowed" ? "Only HR, the System Admin and the MD can manage accounts." : SERVER_MSG;
    } catch (e) { ACC.err = e.message; }
    ACC.loaded = true; ACC.loading = false;
    if (state.route === "people" && state.tab.people === "accounts" && !$("#modal")) render();
  }
  function accReload() { ACC.loaded = false; accLoad(); }
  const accLogin = (a) => [a.login_phone, a.login_email].filter(Boolean).join(" · ");
  const accWhen = (iso) => iso ? fmtDate(iso) + " " + timeOf(iso) : "";
  async function accDecide(a, action, staffId) {
    const r = await authRpc("gid_decide_account", { p_token: AUTH().token, p_account_id: a.id, p_action: action, p_staff_id: staffId || null });
    if (r.ok) return true;
    if (r.error === "no_session") { signOut(SIGNED_OUT_MSG); return false; }
    throw new Error(r.error === "exists" ? "This staff profile is already used by another active account." : r.error === "not_found" ? "This account or staff profile was not found. Press Refresh." : r.error === "not_allowed" ? "Only HR, the System Admin and the MD can manage accounts." : SERVER_MSG);
  }
  function accApprove(a) {
    const used = new Set(ACC.list.filter((x) => x.status === "active" && x.id !== a.id && x.staff_id).map((x) => x.staff_id));
    const opts = staffOptions(staffNow().filter((s) => !used.has(s.id)));
    const sug = a.suggested_staff_id && !used.has(a.suggested_staff_id) && byId("staff", a.suggested_staff_id) ? a.suggested_staff_id : "";
    formModal("Approve account", [{ name: "staff_id", label: "Staff profile", type: "select", options: opts, blank: "Choose a person", value: sug, required: true, help: "The staff profile sets what this person can see and do." }], async (v) => {
      if (!v.staff_id) throw new Error("Choose the staff profile for this person.");
      if (await accDecide(a, "approve", v.staff_id)) {
        // (v23) tell the new user on Telegram (if their Telegram is saved on the staff profile) that the account is ready
        const login = a.login_email || (a.login_phone ? "0" + String(a.login_phone).replace(/^855/, "") : "");
        if (v.staff_id) await insertNotes([noteRow(v.staff_id, state.user, "staff", v.staff_id, { kind: "welcome", title: "Your GID account is ready", title_km: "គណនី GID របស់អ្នករួចរាល់ហើយ",
          body: (login ? "Sign in with " + login + ". " : "") + "Sign in again every day after 3:00 am.", body_km: (login ? "ចូលប្រើដោយ " + login + "។ " : "") + "សូមចូលប្រើម្តងទៀតជារៀងរាល់ថ្ងៃ បន្ទាប់ពីម៉ោង 3:00 ព្រឹក។" }, nowIso())]);
        toast("Account approved. " + a.full_name + " can sign in now."); accReload();
      }
    }, "Approve", { extraHtml: `<p class="muted small"><b class="notr">${esc(a.full_name)}</b> · <span class="notr">${esc(accLogin(a))}</span>${a.note ? `<br>${esc(a.note)}` : ""}</p>` });
  }
  function accSimple(a, action, title, label, text, done, danger) {
    formModal(title, [], async () => { if (await accDecide(a, action, a.staff_id)) { toast(done); accReload(); } }, label, { extraHtml: `<p><b class="notr">${esc(a.full_name)}</b> · <span class="notr">${esc(accLogin(a))}</span></p><p class="muted small">${text}</p>`, onReady: danger ? (m) => { const b = m.querySelector("button[type=submit]"); if (b) b.classList.add("danger"); } : null });
  }
  function accReset(a) {
    let temp = "";
    formModal("Reset password", [], async () => {
      const r = await authRpc("gid_reset_password", { p_token: AUTH().token, p_account_id: a.id });
      if (r.error === "no_session") { signOut(SIGNED_OUT_MSG); return false; }
      if (!r.ok || !r.temp_password) throw new Error(r.error === "not_allowed" ? "Only HR, the System Admin and the MD can manage accounts." : r.error === "not_found" ? "This account or staff profile was not found. Press Refresh." : SERVER_MSG);
      temp = r.temp_password; setTimeout(() => accShowTemp(a, temp), 0);
    }, "Reset password", { extraHtml: `<p><b class="notr">${esc(a.full_name)}</b> · <span class="notr">${esc(accLogin(a))}</span></p><p class="muted small">This makes a new temporary password and signs the person out on every device.</p>` });
  }
  function accShowTemp(a, temp) {
    openModal("Temporary password", `<p><b class="notr">${esc(a.full_name)}</b></p><div class="temppw"><code class="notr" id="tpw">${esc(temp)}</code><button type="button" class="btn primary" id="tpcopy">Copy</button></div>
      <p class="muted small">Give this to the person in person. They must change it when they sign in.</p><div class="form-actions"><button type="button" class="btn" data-act="${act(closeAllModals)}">Done</button></div>`, (m) => {
      m.querySelector("#tpcopy").onclick = async () => {
        try { await navigator.clipboard.writeText(temp); toast("Copied"); }
        catch (e) { const r = document.createRange(); r.selectNodeContents(m.querySelector("#tpw")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Select and copy the password by hand.", true); }
      };
    });
    accReload();
  }
  function accountsTab(u) {
    if (Store.mode !== "supabase") return `<section class="card"><h2>Accounts</h2><p class="muted">Accounts need the shared database.</p></section>`;
    if (!accountMode()) return `<section class="card"><h2>Accounts</h2><p class="muted">Sign in with your own account (not the demo passkey) to approve and manage accounts.</p></section>`;
    if (!ACC.loaded) { AFTER.push(accLoad); return `<section class="card"><h2>Accounts</h2><p class="muted">Loading accounts…</p></section>`; }
    const head = `<div class="card-head"><h2>Accounts</h2><div class="quick">${btn("Refresh", accReload)}</div></div>`;
    if (ACC.err) return `<section class="card accounts">${head}<p class="warnline">${esc(ACC.err)}</p>${btn("Retry", accReload, "primary")}</section>`;
    const q = String(state.search || "").toLowerCase();
    const list = ACC.list.filter((a) => !q || [a.full_name, a.login_phone, a.login_email, a.note, staffName(a.staff_id)].join(" ").toLowerCase().includes(q));
    const pend = list.filter((a) => a.status === "pending").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const active = list.filter((a) => a.status === "active").sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
    const off = list.filter((a) => a.status === "disabled" || a.status === "rejected");
    const isMe = (a) => a.id === AUTH().account_id || (!!a.staff_id && a.staff_id === state.user); // nobody decides on their own account
    const who = (a) => `<b class="notr">${esc(a.full_name)}</b>`;
    const prof = (id) => { const s = byId("staff", id); return s ? `<span class="notr">${esc(s.name)}</span><br><small class="muted">${esc(s.title)}</small>` : ""; };
    const actions = (h) => `<div class="acc-acts">${h}</div>`;
    const sec = (title, rows, cols, emptyMsg) => `<h3 class="acc-h">${esc(title)} <span class="count">${rows.length}</span></h3>${rows.length ? `<div class="tscroll">${table(cols, rows)}</div>` : empty(emptyMsg)}`;
    return `<section class="card accounts">${head}<p class="muted small">People who created an account wait here until you link them to their staff profile. The profile sets what they can see and do.</p>
      ${sec("Waiting for approval", pend, [{ label: "Name", get: who }, { label: "Login", get: (a) => `<span class="notr">${esc(accLogin(a))}</span>` }, { label: "Job / team", get: (a) => `<span class="notr">${esc(a.note || "")}</span>` },
        { label: "Signed up", get: (a) => esc(accWhen(a.created_at)) }, { label: "Suggested profile", get: (a) => prof(a.suggested_staff_id) || '<span class="muted">No match</span>' },
        { label: "", get: (a) => isMe(a) ? '<span class="chip g">You</span>' : actions(btn("Approve", () => accApprove(a), "primary small") + btn("Reject", () => accSimple(a, "reject", "Reject account", "Reject", "This person will not be able to sign in.", "Account rejected.", true), "small")) }], "No one is waiting.")}
      ${sec("Active accounts", active, [{ label: "Name", get: who }, { label: "Login", get: (a) => `<span class="notr">${esc(accLogin(a))}</span>` }, { label: "Staff profile", get: (a) => prof(a.staff_id) },
        { label: "Last sign-in", get: (a) => a.last_sign_in ? esc(accWhen(a.last_sign_in)) : '<span class="muted">Never</span>' },
        { label: "", get: (a) => isMe(a) ? '<span class="chip g">You</span>' : actions(btn("Reset password", () => accReset(a), "small") + btn("Disable", () => accSimple(a, "disable", "Disable account", "Disable", "This person is signed out everywhere and cannot sign in until the account is enabled again.", "Account disabled.", true), "danger small")) }], "No active accounts yet.")}
      ${sec("Disabled / rejected", off, [{ label: "Name", get: who }, { label: "Login", get: (a) => `<span class="notr">${esc(accLogin(a))}</span>` }, { label: "Status", get: (a) => badge(a.status === "rejected" ? "Rejected" : "Disabled") },
        { label: "Decided", get: (a) => esc([accWhen(a.decided_at), staffName(a.decided_by) || ""].filter(Boolean).join(" · ")) },
        { label: "", get: (a) => isMe(a) ? '<span class="chip g">You</span>' : actions(a.staff_id ? btn("Enable", () => accSimple(a, "enable", "Enable account", "Enable", "This person can sign in again with the same staff profile.", "Account enabled.")) : btn("Enable", () => accSimple(a, "enable", "Enable account", "Enable", "The request goes back to Waiting for approval, so you can link it to a staff profile.", "Request moved back to Waiting for approval."), "small")) }], "None.")}
    </section>`;
  }

  // Switch person (demo): a window with everyone in org chart order, photos and a search box.
  // (The phone's own drop-down list cannot be coloured reliably, so it is not used.)
  function switchUser(id) {
    if (accountMode()) { toast("You are signed in with your own account. Switching person only works with the demo passkey.", true); return; }
    state.user = id; setTimeout(devCheck, 50); try { localStorage.setItem(LS_KEY + "-user", state.user); } catch (x) { /* ignore */ } state.project = ""; state.search = ""; state.showAll = false; permDraft = null; closeDrawer(); closeAllModals(); render(); }
  function openUserPicker() {
    if (accountMode()) return openAccountMenu();
    const u = me();
    const sections = [["EXEC", "Executive"]].concat(ORG_DEPTS).map(([k, label]) => {
      const list = staffNow().filter((s) => orgDeptOf(s) === k); const ordered = k === "EXEC" ? list.sort(orgSort) : [].concat(...orgRows(list, k));
      return ordered.length ? `<h5 class="upk-h">${esc(label)}</h5>${ordered.map((s) => `<button type="button" class="upk${s.id === u.id ? " on" : ""}" data-name="${esc((s.name + " " + s.title).toLowerCase())}" data-act="${act(() => switchUser(s.id))}">${avatar(s)}<span><b>${esc(s.name)}</b><small>${esc(s.title)}</small></span>${s.id === u.id ? '<i class="upk-tick" aria-label="Current person">✓</i>' : ""}</button>`).join("")}` : "";
    }).join("");
    openModal("Switch person", `<p class="muted small">Demo only: choose a person to see the system as they see it.</p><input class="search upk-q" placeholder="Search name or title" aria-label="Search name or title"><div class="upk-list">${sections}</div>`, (m) => {
      const q = m.querySelector(".upk-q");
      q.addEventListener("input", () => { const t = q.value.trim().toLowerCase(); m.querySelectorAll(".upk").forEach((b) => { b.hidden = !!t && !b.dataset.name.includes(t); }); m.querySelectorAll(".upk-h").forEach((h) => { let n = h.nextElementSibling, any = false; while (n && n.classList.contains("upk")) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; }); });
      const on = m.querySelector(".upk.on"); if (on) on.scrollIntoView({ block: "center" });
    });
  }

  function globalSearch(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const u = me(), hit = (o, f) => f.some((k) => String(o[k] || "").toLowerCase().includes(q)), out = [];
    myProjects(u).filter((p) => hit(p, ["code", "name", "client", "location"])).forEach((p) => out.push(["Project", p.code + " " + p.name, () => openProject(p)]));
    if (navVisible(u, "requests")) db.requests.filter((r) => (r.requester_id === u.id || seesAll(u, "requests") || approversFor(r).includes(u.id)) && hit(r, ["ref_no", "title"])).forEach((r) => out.push(["Request", r.ref_no + " " + r.title, () => openRequest(r)]));
    if (navVisible(u, "procurement")) db.purchase_orders.filter((p) => inScope(u, p.project_id) && hit(p, ["po_no", "description"])).forEach((p) => out.push(["PO", p.po_no + " " + p.description, () => openPO(p)]));
    if (navVisible(u, "docs")) db.documents.filter((d) => inScope(u, d.project_id) && hit(d, ["doc_no", "title"])).forEach((d) => out.push(["Document", d.doc_no + " rev " + d.revision + " " + d.title, () => openDoc(d)]));
    if (navVisible(u, "stock")) db.stock_items.filter((i) => hit(i, ["code", "name", "category"])).forEach((i) => out.push(["Stock", i.code + " " + i.name, () => openItem(i)]));
    staffNow().filter((s) => hit(s, ["name", "title"])).forEach((s) => out.push(["Person", s.name + " · " + s.title, () => openPerson(s)]));
    return out.slice(0, 12);
  }

  // ================= display: theme and language, saved for each person =================
  const UI_LS = "gid-ui";
  function uiPref(u) {
    const sv = u && (db.app_settings || []).find((x) => x.key === "ui:" + u.id);
    let local = {}; try { local = JSON.parse(localStorage.getItem(UI_LS) || "{}"); } catch (e) { /* ignore */ }
    const v = Object.assign({ theme: "system", lang: "en" }, local, sv && sv.value ? sv.value : {});
    if (!["light", "dark", "system"].includes(v.theme)) v.theme = "system";
    if (!["en", "km"].includes(v.lang)) v.lang = "en";
    return v;
  }
  const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyUI(v) {
    const dark = v.theme === "dark" || (v.theme === "system" && darkMQ && darkMQ.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = v.lang === "km" ? "km" : "en";
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = dark ? "#0e1912" : "#dcefdf";
    try { localStorage.setItem(UI_LS, JSON.stringify({ theme: v.theme, lang: v.lang })); } catch (e) { /* ignore */ }
    I18N.lang = v.lang;
  }
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", () => applyUI(uiPref(me())));
  async function setUI(patch) {
    const u = me(), v = Object.assign(uiPref(u), patch), key = "ui:" + u.id;
    const row = { key, value: { theme: v.theme, lang: v.lang }, updated_by: u.id, updated_at: nowIso() };
    const sv = (db.app_settings || []).find((x) => x.key === key);
    // Change the saved copy on this device first, so the screen uses the new choice straight away (one tap)
    if (sv) sv.value = row.value; // (a new person has no saved row yet: the device copy written by applyUI is used)
    applyUI(v); closeAllModals(); render();
    try { if (sv) await Store.update("app_settings", sv.id, row); else await Store.insert("app_settings", Object.assign({ id: "ui-" + u.id }, row)); } catch (e) { /* the choice still applies on this device */ }
  }
  function openDisplay() {
    const v = uiPref(me());
    const b = (k, val, icon, label) => `<button type="button" class="${v[k] === val ? "on" : ""}" data-act="${act(() => setUI({ [k]: val }))}">${icon ? svgI(icon) : ""}<span>${label}</span></button>`;
    openModal("Display", `<div class="uimenu"><h5>Theme</h5><div class="uiseg">${b("theme", "light", "sun", "Light")}${b("theme", "dark", "moon", "Dark")}${b("theme", "system", "dashboard", "System")}</div>
      <h5>Language</h5><div class="uiseg two">${b("lang", "en", "globe", "English")}${b("lang", "km", "globe", "ខ្មែរ")}</div>
      <p class="muted small">Saved for ${esc(me().name)} and used on every phone or computer. System follows the phone's light or dark setting.</p></div>`);
  }

  // Redraw the page but keep where the person was: page scroll, sideways scroll of tables, and the focused control
  function renderKeep(focusSel) {
    const boxes = () => [...document.querySelectorAll(".main .scroll, .main .tscroll, .main .week-scroll")];
    const sx = boxes().map((e) => [e.scrollLeft, e.scrollTop]), y = window.scrollY;
    render();
    boxes().forEach((e, i) => { if (sx[i]) { e.scrollLeft = sx[i][0]; e.scrollTop = sx[i][1]; } });
    window.scrollTo(window.scrollX, y);
    if (focusSel) { const f = document.querySelector(focusSel); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function render() {
    if (!state.user) return; // (v23) nobody signed in yet (sign-in screen showing): never draw the app behind it
    // keep the buttons of an open window or the alerts panel working when the page behind is redrawn
    const keepActs = new Map(); document.querySelectorAll("#modal [data-act], #drawer [data-act], #badges [data-act]").forEach((el) => { const f = ACTS.get(el.dataset.act); if (f) keepActs.set(el.dataset.act, f); });
    MSTACK.forEach((x) => x.acts.forEach((f, k) => keepActs.set(k, f)));
    ACTS = keepActs; AFTER.length = 0;
    applyUI(uiPref(me()));
    const u = me(), acc = accountMode();
    let route = routeFromHash();
    const mod = (NAV.find((n) => n[0] === route) || [])[2];
    if (route !== "home" && !navVisible(u, mod === undefined ? null : mod)) route = "home";
    state.route = route;
    const pendN = myApprovals(u).length, mods = unreadByModule(u), unread = unreadCount(u);
    const nb = (k, v) => v ? `<span class="nb">${badgeTxt(v)}</span>` : "";
    const navItems = NAV.filter(([, , m]) => navVisible(u, m));
    let lastGroup = "";
    const nav = navItems.map(([r, label, , grp]) => (grp && grp !== lastGroup ? `<div class="ngroup">${esc((lastGroup = grp))}</div>` : "") +
      `<a href="#${r}" class="${r === route ? "on" : ""}${mods[r] ? " has-nb" : ""}" data-badge="${r}">${svgI(r)}<span class="nl">${esc(label)}</span>${r === "requests" && pendN && !mods[r] ? `<span class="pill-n" title="Waiting for your approval">${pendN}</span>` : ""}${nb(r, mods[r])}</a>`).join("");
    let body = SCREENS[route](u);
    let title = "", sub = "";
    const m = body.match(/^\s*<h1>([\s\S]*?)<\/h1>(\s*<p class="muted">([\s\S]*?)<\/p>)?/);
    if (m) { title = m[1]; sub = m[3] || ""; body = body.slice(m[0].length); }
    // Phone tab bar: the four most used places plus the full menu
    const has = (r) => navItems.some((n) => n[0] === r);
    const tabs = [has("dashboard") ? ["dashboard", "Dashboard"] : ["home", "My work"], has("requests") ? ["requests", "Requests"] : ["projects", "Projects"], has("daily") ? ["daily", "Reports"] : has("docs") ? ["docs", "Drawings"] : has("schedule") ? ["schedule", "Schedule"] : ["home", "My work"]];
    const tabbar = `<nav class="tabbar" aria-label="Quick menu">${tabs.slice(0, 3).map(([r, l]) => `<a href="#${r}" class="${r === route ? "on" : ""}" data-badge="${r}">${svgI(r)}<span>${l}</span>${nb(r, mods[r])}</a>`).join("")}
      <button class="bell-ring" data-badge="all" data-act="${act(() => openDrawer("mine"))}" aria-label="Notifications">${svgI("bell")}<span>Alerts</span>${nb("all", unread)}</button>
      <button data-act="${act(() => document.body.classList.toggle("nav-open"))}" aria-label="Open full menu">${svgI("menu")}<span>Menu</span></button></nav>`;
    $("#app").innerHTML = `<div class="app">
      <aside class="rail" aria-label="Main menu"><a class="logo" href="#" aria-label="GID home"><img src="img/logo-landscape.png" alt="Green In Design · Interior &amp; Exterior"></a>
        <div class="rail-sub"><span class="demo">DEMO</span>${isAdminPage(u) ? `<button class="resetbtn" title="Put the demo back to its starting data" data-act="${act(resetDemo)}">${svgI("reset")}<span>Reset demo</span></button>` : `<span class="rs-name">Management system</span>`}${accountMode() ? `<button class="lockbtn" title="Sign out" aria-label="Sign out" data-act="${act(() => signOut())}">${svgI("lock")}</button>` : `<button class="lockbtn" title="Lock the demo on this device" aria-label="Lock the demo on this device" data-act="${act(lockThisDevice)}">${svgI("lock")}</button>`}</div>
        <div class="rail-label">Menu</div>
        <nav class="nav">${nav}</nav>
        <button class="me-card" data-act="${act(() => openPerson(u))}" aria-label="My profile">${avatar(u, "av lg")}<span><b>${esc(u.name)}</b><small>${esc(u.title)}</small></span></button>
        ${untilTxt() ? `<p class="rail-until">${svgI("clock")}<span>${esc(untilTxt())}</span></p>` : ""}</aside>
      <div class="scrim" data-act="${act(() => document.body.classList.remove("nav-open"))}"></div>
      <main class="main">
        <header class="head"><button class="icon menu-btn" aria-label="Open menu" data-act="${act(() => document.body.classList.toggle("nav-open"))}">${svgI("menu")}</button>
          <img class="mlogo" src="img/logo-mark.png" alt="GID">
          <div class="htitle"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
          <div class="tools">
            <div class="gsearch"><label>${svgI("search")}<input id="gq" placeholder="Search projects, POs, drawings, stock" aria-label="Search everything" autocomplete="off"></label><div class="gresults" id="gres" hidden></div></div>
            <button class="icon uibtn" id="uibtn" aria-label="Display: theme and language" title="Theme and language" data-act="${act(openDisplay)}">${svgI(document.documentElement.dataset.theme === "dark" ? "moon" : "sun")}</button>
            <button class="icon bell-ring" id="bell" data-badge="all" aria-label="${unread} unread notifications" data-act="${act(() => openDrawer("mine"))}">${svgI("bell")}${nb("all", unread)}</button>
            ${acc ? "" : '<span class="modechip" title="Signed in with the demo passkey: you can switch between sample people">Demo mode</span>'}
            <button type="button" class="who${acc ? " acct" : ""}" id="who" ${acc ? `title="My account" aria-label="${esc(u.name)}. My account"` : `title="Demo: switch person to test each role" aria-label="Acting as ${esc(u.name)}. Switch person"`} data-act="${act(acc ? openAccountMenu : openUserPicker)}">${avatar(u)}<span class="who-t"><b>${esc(u.name)}</b><small>${esc(u.title)}</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
          </div></header>
        ${acc ? "" : '<div class="banner"><b>Demo:</b> tap your name at the top to switch person and test each role</div>'}
        ${body}
      </main>${tabbar}${outboxBar()}</div>`;
    const gq = $("#gq"), gres = $("#gres");
    gq.addEventListener("input", () => {
      const res = globalSearch(gq.value);
      gres.hidden = gq.value.trim().length < 2;
      gres.innerHTML = res.length ? res.map(([k, t, fn]) => `<button data-act="${act(() => { gres.hidden = true; gq.value = ""; fn(); })}"><small>${esc(k)}</small><span>${esc(t)}</span></button>`).join("") : '<div class="empty">No matches</div>';
    });
    gq.addEventListener("keydown", (e) => { if (e.key === "Escape") { gres.hidden = true; gq.blur(); } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".gsearch")) gres.hidden = true; }, { once: true });
    $("#app").querySelectorAll("[data-change]").forEach((el) => {
      const key = el.dataset.change;
      const handler = () => { state[key] = el.type === "checkbox" ? el.checked : el.value; if (key === "search") { clearTimeout(render.t); render.t = setTimeout(() => { render(); const s = $(".main .search"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250); } else render(); };
      el.addEventListener(el.tagName === "INPUT" && el.type !== "checkbox" ? "input" : "change", handler);
    });
    $("#app").querySelectorAll("[data-change-tab]").forEach((el) => el.addEventListener("change", () => { state.tab[el.dataset.changeTab] = el.value; render(); }));
    document.body.classList.remove("nav-open");
    syncLayers();
    setTabBadge(unread);
    AFTER.forEach((f) => f());
    translateNow();
  }
  document.documentElement.dataset.skin = "glass";

  window.addEventListener("hashchange", () => { state.search = ""; closeLightbox(); closeBadges(true); closeDrawer(); closeAllModals(); render(); });

  // The app and its data load in the background while the sign-in screen is open; screens appear once the person is in
  const gateOpen = () => window.GID_GATE || Promise.resolve();
  async function start() {
    // Start reading the data now (in the background) while the sign-in screen is open
    let loadErr = null, loaded = false;
    const loading = Store.init().then(() => { loaded = true; }, (e) => { loadErr = e; });
    try {
      await authGate();
      await Promise.race([loading, new Promise((res) => setTimeout(() => { if (!loaded && Store.mode === "supabase") loadErr = loadErr || authErr("network"); res(); }, 45000))]);
      if (loadErr) throw loadErr;
      if (Store.mode === "supabase" && !db.staff.length) {
        $("#app").innerHTML = `<div class="setup card"><h1>Database is ready</h1><p>Your Supabase tables are empty. Load the demo data (40 staff, 3 demo projects and sample records) to start testing.</p><button class="btn primary" id="load">Load demo data</button></div>`;
        $("#load").onclick = async () => { $("#load").disabled = true; try { await Store.reset(); start(); } catch (e) { toast(e.message, true); $("#load").disabled = false; } };
        return;
      }
      if (accountMode()) {
        // Signed in with an account: always this person, never switched
        const A = AUTH(), st = byId("staff", A.staff_id);
        if (!st || st.left_on) {
          $("#app").innerHTML = `<main class="gate"><div class="gate-card"><img class="gate-logo" src="img/logo-square.png" alt="Green In Design · Interior &amp; Exterior"><h1>Management System</h1><p class="gate-err" role="alert">Your account is not linked to a current staff profile. Ask HR.</p><button class="btn gate-go" id="outbtn" type="button">Sign out</button></div></main>`;
          $("#outbtn").onclick = () => signOut(); translateNow(); return;
        }
        state.user = st.id;
      } else {
        let saved = null; try { saved = localStorage.getItem(LS_KEY + "-user"); } catch (e) { /* ignore */ }
        state.user = byId("staff", saved) ? saved : "s01";
      }
      sessionWatch();
      const deep = /^#open=([a-z_]+):(.+)$/.exec(location.hash || "");
      if (deep) { history.replaceState(null, "", location.pathname + location.search); render(); devStart(); setTimeout(() => flushOutbox(true), 1500); openRecord(deep[1], decodeURIComponent(deep[2])); return; }
      render();
      devStart();
      setTimeout(() => flushOutbox(true), 1500); // reports saved on this phone without internet (or before signing in again) are sent now
    } catch (e) {
      await gateOpen();
      if (e.code === "network" || /fetch|network|load failed|timeout/i.test(e.message || "")) { await netScreen(NET_MSG); location.reload(); return; }
      $("#app").innerHTML = `<div class="setup card"><h1>Could not start</h1><p>${esc(e.message)}</p><p class="muted">Check config.js and SETUP.md step 3.</p></div>`;
    }
  }
  start();
})();
