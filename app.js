/* GID Management System - DEMO
   app.js: data store (browser or Supabase), permissions, approval engine and all screens. */
(function () {
  "use strict";
  const { TABLES, GROUPS, PERMS: PERMS_STANDARD, APPROVAL_LIMIT, seed } = window.GID;
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
  const daysSince = (d) => (Date.now() - new Date(d).getTime()) / 86400000;
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

  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (document.getElementById("modal")) modalBack(); else if (document.getElementById("drawer")) document.getElementById("drawer").remove(); });
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
    async init() {
      if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
        if (!window.supabase) throw new Error("The Supabase library did not load. Check your internet connection.");
        this.mode = "supabase";
        // Clean up common copy-paste mistakes: spaces, a trailing slash, or "/rest/v1" copied with the address
        const url = String(CFG.SUPABASE_URL).trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
        const key = String(CFG.SUPABASE_ANON_KEY).trim().replace(/^["']|["']$/g, "");
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error("The Supabase address in config.js looks wrong: \"" + CFG.SUPABASE_URL + "\". It should look like https://abcdefghijk.supabase.co with nothing after .co");
        this.client = window.supabase.createClient(url, key);
        await this.loadAllRemote();
      } else {
        this.mode = "local";
        const saved = this.readLocal();
        Object.assign(db, saved || seed());
        for (const t of Object.keys(TABLES)) db[t] = db[t] || [];
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
        if (error && names[i] === "site_visits") { console.warn("site_visits table missing: run supabase/update-v16.sql"); db[names[i]] = []; this.missing = (this.missing || []).concat(names[i]); return; }
        if (error) throw new Error("Could not read table '" + names[i] + "': " + error.message + ". Did you run schema.sql in Supabase?");
        db[names[i]] = data || [];
      });
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
  async function patch(t, id, p, summary) { const r = await Store.update(t, id, p); await log("Updated", t, id, summary); return r; }
  async function log(action, tbl, record_id, summary) {
    if (tbl === "audit_log") return;
    try { await Store.insert("audit_log", { at: nowIso(), actor_id: state.user, action, tbl, record_id, summary: summary || "" }); } catch (e) { /* logging never blocks work */ }
    queueNotify(action, tbl, record_id, summary);
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
  const canManageProject = (u) => hasTag(u, "MD") || isPMRole(u) || isSysAdmin(u);
  const isAdminPage = (u) => hasTag(u, "SYSADMIN") || hasTag(u, "BACKUPADMIN") || hasTag(u, "MD");

  // Permission matrix in use: the standard one, with the changes saved by the MD or system admin on top
  const LEVELS = ["none", "view", "own", "edit", "approve", "admin"];
  const MODULE_NAMES = { requests: "Requests & Approvals", people: "People", projects: "Projects & Tasks", daily: "Daily reports", docs: "Document Control", cost: "Cost & Claims",
    procurement: "Procurement", finance: "Finance", qaqc: "QA/QC & Snags", safety: "Safety", dashboard: "Management Dashboard", stock: "Stock" };
  const LEVEL_HELP = { none: "Hidden: the module is not in the menu", view: "See all records (in their projects), change nothing", own: "Create and see only their own records",
    edit: "Create and update records", approve: "Edit, plus approve or reject", admin: "Full control, including settings and deleting" };
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
  const isPMof = (u, pid) => { const p = byId("projects", pid); return (p && p.pm_id === u.id) || isPMRole(u); };

  // ================= approval engine =================
  const STEP_LABEL = { PM: "Project Manager approves", QS: "QS checks budget", MD: "MD approves (USD 500 or more)",
    PROC: "Procurement issues PO", FIN: "Finance pays", HEAD: "Line manager approves", HR: "HR records", STORE: "Store releases stock to site", LINE: "Line manager approves (MD and HR informed)" };
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
      case "PM": ids = p ? [p.pm_id] : headOf(req.requester_id); if (ids.includes(req.requester_id)) ids = [PD()]; break;
      case "QS": { const qsTeam = req.project_id ? db.project_members.filter((m) => m.project_id === req.project_id && groupsOf(byId("staff", m.staff_id) || { groups: "" }).includes("QS")).map((m) => m.staff_id) : [];
        ids = qsTeam.length ? qsTeam : inGroup("QS").map((s) => s.id); break; }
      case "MD": ids = [MD()]; break;
      case "PROC": case "STORE": ids = withTag("PROC").map((s) => s.id); break;
      case "FIN": ids = inGroup("FIN").map((s) => s.id); break;
      case "HEAD": ids = headOf(req.requester_id); break;
      case "LINE": ids = p ? [p.pm_id] : headOf(req.requester_id); if (ids.includes(req.requester_id)) ids = headOf(req.requester_id); break;
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
    if (flag) toast("Possible split order: this supplier has " + money(total) + " on this project in 7 days. Flagged for the MD.", true);
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
      sessions: { Morning: "ពេលព្រឹក", "End of day": "ចុងថ្ងៃ", Overtime: "ថែមម៉ោង" }, sessionLong: { Morning: "របាយការណ៍ពេលព្រឹក", "End of day": "របាយការណ៍ចុងថ្ងៃ (ម៉ោង ៥ ល្ងាច)", Overtime: "របាយការណ៍ថែមម៉ោង" },
      weatherMap: { "Sunny": "មេឃស្រឡះ", "Cloudy": "មេឃស្រទំ", "Rain (morning)": "ភ្លៀងពេលព្រឹក", "Rain (afternoon)": "ភ្លៀងពេលរសៀល", "Rain (all day)": "ភ្លៀងពេញមួយថ្ងៃ" }, unit: " នាក់",
      locCheck: "ពិនិត្យទីតាំង", locMap: { "On site": "នៅការដ្ឋាន", "Away from site": "ក្រៅការដ្ឋាន", "No location": "គ្មានទីតាំង", "No site pin": "គម្រោងមិនទាន់កំណត់ទីតាំង" }, late: "យឺត", fromPin: "ពីចំណុចការដ្ឋាន" }
  };
  const KM_DAYS = ["អាទិត្យ", "ចន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];
  const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
  const rDate = (iso, lang) => {
    const d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
    if (lang === "km") return "ថ្ងៃ" + KM_DAYS[d.getDay()] + " ទី " + d.getDate() + " ខែ" + KM_MONTHS[d.getMonth()] + " ឆ្នាំ " + d.getFullYear();
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };
  const rTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
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
    const blocks = [];
    blocks.push(`<div class="rp-info">
      <div><span>${L.project}</span><b>${esc(p.code)} ${esc(p.name)}</b></div><div><span>${L.date}</span><b>${esc(rDate(d.report_date, lang))}</b></div>
      <div><span>${L.client}</span>${esc(p.client)}</div><div><span>${L.session}</span>${esc(L.sessionLong[s])}${s === "Overtime" ? " · " + esc(d.ot_start) + "–" + esc(d.ot_end) : ""}</div>
      <div><span>${L.location}</span>${esc(p.location)}</div><div><span>${L.weather}</span>${w(d.weather)}</div>
      <div><span>${L.by}</span>${esc(who.name)}, ${esc(who.title)}</div><div><span>${L.pm}</span>${esc(staffName(p.pm_id))}</div>
      ${d.loc_status ? `<div class="wide"><span>${L.locCheck}</span><p><b class="${d.loc_status === "On site" ? "okc" : "badc"}">${esc(L.locMap[d.loc_status] || d.loc_status)}</b>${d.distance_m != null && d.distance_m !== "" ? " · " + esc(fmtDist(d.distance_m)) + " " + L.fromPin : ""}${d.late ? ` · <b class="badc">${L.late} ${rTime(d.submitted_at)}</b>` : ""}${d.loc_note ? " · " + esc(d.loc_note) : ""}</p></div>` : ""}</div>`);
    blocks.push(`<div class="rp-kpis"><div><small>${s === "Morning" ? L.workersM : s === "Overtime" ? L.workersO : L.workers}</small><b>${esc(d.manpower)}</b></div>
      <div><small>${L.progress}</small><b>${esc(p.progress)}%</b><div class="rp-bar"><i style="width:${Number(p.progress) || 0}%"></i></div></div>
      <div><small>${L.photos}</small><b>${ph.length}</b></div><div><small>${L.issuesK}</small><b class="${openIssues ? "red" : ""}">${openIssues}</b></div></div>`);
    const tradesT = (d.trades || []).length ? `<div><h2>${L.trades}</h2><table><thead><tr><th>${L.trade}</th><th class="n">${L.count}</th></tr></thead><tbody>${d.trades.map((t) => `<tr><td>${esc(t.trade)}</td><td class="n">${esc(t.workers)}</td></tr>`).join("")}<tr><td><b>${L.total}</b></td><td class="n"><b>${sum(d.trades, (t) => t.workers)}</b></td></tr></tbody></table></div>` : "";
    const side = s === "End of day" ? `<div><h2>${L.morning}</h2><table><tbody>${morning ? `<tr><td>${L.subm}</td><td class="n">${rTime(morning.submitted_at)}</td></tr><tr><td>${L.arrived}</td><td class="n">${esc(morning.manpower)}</td></tr><tr><td>${L.planned}</td><td>${esc(morning.plan)}</td></tr>` : `<tr><td colspan="2">${L.none}</td></tr>`}
        <tr><td>${L.otTonight}</td><td class="n">${ot ? esc(ot.ot_start) + "–" + esc(ot.ot_end) : L.no2}</td></tr></tbody></table></div>`
      : s === "Overtime" ? `<div><h2>${L.ot}</h2><table><tbody><tr><td>${L.otTime}</td><td class="n">${esc(d.ot_start)} – ${esc(d.ot_end)}</td></tr><tr><td>${L.workersO}</td><td class="n">${esc(d.manpower)}${L.unit}</td></tr></tbody></table></div>` : "";
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
    const mat = `<div><h2>${L.materials}</h2><table><tbody>${moves.length ? moves.map((m) => { const it = byId("stock_items", m.item_id) || {}; return `<tr><td>${m.move_type === "Issue" ? L.issued : L.received}</td><td>${esc(it.name)}${m.ref ? " (" + esc(m.ref) + ")" : ""}</td><td class="n">${Math.abs(m.qty)} ${esc(it.unit)}</td></tr>`; }).join("") : `<tr><td>${L.none}</td></tr>`}</tbody></table></div>`;
    if (s === "End of day") blocks.push(`<div class="rp-two"><div><h2>${L.planT}</h2>${d.plan ? `<ul>${lines(d.plan).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${L.none}</p>`}</div>${mat}</div>`);
    else blocks.push(mat);
    const sNote = d.safety_note || (morning && morning.safety_note) || "";
    blocks.push(`<h2>${L.safety}</h2><table><tbody>${sNote ? `<tr><td>${esc(sNote)}</td></tr>` : ""}${safety.map((x) => `<tr><td>${esc(x.rec_type)}: ${esc(x.description)}</td><td class="n">${esc(x.action || x.status)}</td></tr>`).join("")}${!sNote && !safety.length ? `<tr><td>${L.none}</td></tr>` : ""}</tbody></table>`);
    const rv = byId("staff", d.reviewed_by);
    blocks.push(`<div class="rp-sign"><div><span>${L.prepared}</span><b>${esc(who.name)}</b><br>${esc(who.title)} · ${esc(fmtDate(d.report_date))} ${rTime(d.submitted_at || d.created_at)}<em>${L.inSystem}</em></div>
      <div><span>${L.reviewed}</span>${rv ? `<b>${esc(rv.name)}</b><br>${esc(rv.title)}` : `<b>${esc((withTag("SITEMGR")[0] || {}).name || "")}</b><br><span class="pend">${L.waiting}</span>`}<em>${rv ? L.inSystem : L.fills}</em></div></div>`);
    return blocks;
  }

  let LOGO_DATA = "";
  try { fetch("img/logo-landscape.png").then((r) => r.ok ? r.blob() : null).then((b) => { if (!b) return; const fr = new FileReader(); fr.onload = () => { LOGO_DATA = fr.result; }; fr.readAsDataURL(b); }).catch(() => {}); } catch (e) { /* use the file path */ }
  const RP_CSS = `.rp-host{position:fixed;left:-12000px;top:0;width:794px;z-index:-1}
  .rp-page{width:794px;height:1123px;padding:53px 53px 60px;position:relative;background:#fff;color:#121a2c;font:13px/1.45 "Plus Jakarta Sans",Arial,sans-serif;overflow:hidden;box-sizing:border-box}
  .rp-page.km{font-family:"Noto Sans Khmer","Plus Jakarta Sans",Arial,sans-serif;line-height:1.5}.rp-page.km h2{margin:11px 0 4px}.rp-page.km .rp-kpis small{font-size:10.5px;font-weight:400}
  .rp-page *{box-sizing:border-box}.rp-top{display:flex;align-items:center;gap:12px;border-bottom:3px solid #2e8540;padding-bottom:10px}
  .rp-logo{height:44px;width:auto;display:block}.rp-co{border-left:1px solid #dfe3ea;padding-left:12px}.rp-mark{width:40px;height:40px;border-radius:9px;background:#1f4d2b;display:flex;align-items:center;justify-content:center}.rp-mark i{width:15px;height:15px;background:#2e8540;transform:rotate(45deg);border-radius:2px;display:block}
  .rp-co b{display:block;font-size:16px;letter-spacing:.5px}.rp-co small{color:#6b7488;font-size:11px}.rp-title{margin-left:auto;text-align:right}.rp-title h1{margin:0;font-size:20px;font-weight:800}
  .rp-title small{color:#6b7488;font-size:11px;display:block}.rp-sess{display:inline-block;background:#1f4d2b;color:#fff;font-weight:700;font-size:11px;padding:4px 11px;border-radius:999px;margin-top:4px}
  .rp-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe3ea;border-radius:7px;margin-top:12px}.rp-info div{padding:6px 11px;border-bottom:1px solid #eef0f4;display:grid;grid-template-columns:118px 1fr;font-size:12px}
  .rp-info div:nth-child(odd){border-right:1px solid #eef0f4}.rp-info div:nth-last-child(-n+2){border-bottom:0}.rp-info span{color:#6b7488}
  .rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:11px}.rp-kpis>div{background:#f1f7f1;border-radius:7px;padding:9px 11px}.rp-kpis small{display:block;color:#6b7488;font-size:10px;font-weight:700;letter-spacing:.4px}
  .rp-kpis b{font-size:21px}.rp-kpis b.red{color:#c0362c}.rp-bar{height:7px;background:#dfe3ea;border-radius:4px;margin-top:4px}.rp-bar i{display:block;height:7px;background:#2e8540;border-radius:4px}
  .rp-page h2{font-size:13px;margin:14px 0 5px;padding-bottom:4px;border-bottom:1px solid #dfe3ea;text-transform:uppercase;letter-spacing:.5px;color:#1f4d2b}.rp-page.km h2{text-transform:none;letter-spacing:0}
  .rp-page ul{margin:0;padding-left:18px}.rp-page li{margin:1px 0}.rp-page p{margin:0}.rp-page table{width:100%;border-collapse:collapse;font-size:12px}
  .rp-page th{text-align:left;font-size:10px;color:#6b7488;font-weight:700;padding:4px 7px;border-bottom:1px solid #dfe3ea;text-transform:uppercase}.rp-page td{padding:4px 7px;border-bottom:1px solid #eef0f4;vertical-align:top}.rp-two td:first-child{white-space:nowrap}
  .rp-page .n{text-align:right;white-space:nowrap}.rp-issue{background:#fdeceb;border-left:3px solid #c0362c;padding:8px 11px;border-radius:0 7px 7px 0;color:#7a1f18}
  .rp-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rp-sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
  .rp-sign>div{border:1px solid #dfe3ea;border-radius:7px;padding:8px 11px;height:84px;font-size:11.5px;position:relative}.rp-sign span{color:#6b7488;font-size:10px;text-transform:uppercase;font-weight:700;display:block}
  .rp-sign .pend{color:#a15c00;text-transform:none;font-size:11.5px}.rp-sign em{position:absolute;bottom:8px;left:11px;right:11px;border-top:1px dotted #b8bfcc;padding-top:3px;font-style:normal;color:#8a93a6;font-size:10px}
  .rp-foot{position:absolute;left:53px;right:53px;bottom:26px;display:flex;justify-content:space-between;font-size:10px;color:#8a93a6;border-top:1px solid #eef0f4;padding-top:5px}
  .rp-mini{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2e8540;padding-bottom:8px;font-size:12px}.rp-mini b{font-size:15px}
  .rp-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px 13px;margin-top:11px}.rp-fig{border:1px solid #dfe3ea;border-radius:7px;overflow:hidden}
  .rp-fig .img{width:100%;height:232px;background:#eef0f4 center/cover no-repeat}.rp-fig div.cap{display:grid;grid-template-columns:22px 1fr;gap:7px;padding:6px 9px;font-size:11.5px;min-height:34px}
  .rp-fig div.cap b{background:#2e8540;color:#fff;border-radius:4px;text-align:center;font-size:11px;height:18px;line-height:18px}
  .rp-info div.wide{grid-column:1/-1;border-right:0;border-top:1px solid #eef0f4}.okc{color:#1a7f42}.badc{color:#c0362c}
  .rp-page.km,.rp-page.km *{font-family:"Plus Jakarta Sans","GID Khmer",Arial,sans-serif!important;letter-spacing:0!important;text-transform:none!important;font-variant:normal!important}
  .rp-page.km{font-size:13.5px;line-height:1.75}.rp-page.km h1{font-size:21px;font-weight:700;line-height:1.6}.rp-page.km h2{font-size:14px;font-weight:700;line-height:1.7}
  .rp-page.km b,.rp-page.km strong,.rp-page.km th,.rp-page.km .rp-sess{font-weight:700}.rp-page.km .rp-kpis small{font-size:11.5px;font-weight:400;line-height:1.6}
  .rp-page.km .rp-info div{grid-template-columns:132px 1fr;line-height:1.75;padding:5px 11px}.rp-page.km td,.rp-page.km th{line-height:1.7}.rp-page.km th{font-size:11.5px}
  .rp-page.km .rp-sign span{font-size:11.5px}.rp-page.km .rp-sess{padding:3px 12px 5px;font-size:12px}.rp-page.km .rp-foot{font-size:10.5px}`;

  // Shared PDF maker: lays out A4 pages from HTML blocks, then draws each page with html2canvas and saves it with jsPDF.
  // Khmer needs care: the Khmer font is bundled with the app, weights are limited to regular and bold, and no letter
  // spacing or capitals are used, so every Khmer syllable is drawn as one piece and keeps its correct shape.
  async function makePdf(o) {
    const lang = o.lang, km = lang === "km";
    toast(km ? "កំពុងបង្កើត PDF…" : "Making the PDF…");
    const host = document.createElement("div"); host.className = "rp-host"; document.body.appendChild(host);
    try {
      await Promise.all(PDF_LIBS.map(loadScript));
      if (!document.getElementById("rp-css")) { const st = document.createElement("style"); st.id = "rp-css"; st.textContent = RP_CSS; document.head.appendChild(st); }
      const fontLoads = ['400 13px "GID Khmer"', '700 13px "GID Khmer"', '400 13px "Plus Jakarta Sans"', '700 13px "Plus Jakarta Sans"', '800 13px "Plus Jakarta Sans"'].map((f) => document.fonts.load(f, f.includes("Khmer") ? "កខគ" : "Ag"));
      await Promise.race([Promise.all(fontLoads).then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 6000))]).catch(() => {});
      const pages = [], cls = "rp-page" + (km ? " km" : "");
      const newPage = (first) => { const pg = document.createElement("div"); pg.className = cls; pg.innerHTML = (first ? o.head : o.mini(o.contTitle)) + '<div class="rp-body"></div><div class="rp-foot"></div>'; host.appendChild(pg); pages.push(pg); return pg.querySelector(".rp-body"); };
      let body = newPage(true); const limit = 1123 - 60 - 30;
      for (const b of o.blocks) {
        const el = document.createElement("div"); el.innerHTML = b; body.appendChild(el);
        if (el.getBoundingClientRect().bottom - body.parentElement.getBoundingClientRect().top > limit && body.children.length > 1) { el.remove(); body = newPage(false); body.appendChild(el); }
      }
      const ph = o.photos || [];
      for (let i = 0; i < ph.length; i += 6) {
        const pg = document.createElement("div"); pg.className = cls;
        pg.innerHTML = o.mini(o.photoTitle) + `<div class="rp-grid">${ph.slice(i, i + 6).map((x, j) => `<div class="rp-fig"><div class="img" style="background-image:url('${String(x.src).replace(/'/g, "%27")}')"></div><div class="cap"><b>${i + j + 1}</b><span>${esc(x.cap || "")}</span></div></div>`).join("")}</div><div class="rp-foot"></div>`;
        host.appendChild(pg); pages.push(pg);
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
      const url = URL.createObjectURL(pdf.output("blob"));
      openModal(o.fileName, `<iframe class="pdf" src="${url}" title="PDF preview"></iframe><div class="form-actions"><a class="btn primary" href="${url}" download="${esc(o.fileName)}">${km ? "ទាញយក" : "Download"} ${esc(o.fileName)}</a><button class="btn" data-act="${act(modalBack)}">${km ? "បិទ" : "Close"}</button></div>`);
      try { const a = document.createElement("a"); a.href = url; a.download = o.fileName; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* the button above still works */ }
    } catch (err) { host.remove(); toast(err.message || String(err), true); }
  }
  const pdfGenerated = () => new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const pdfLogo = () => `<img class="rp-logo" src="${LOGO_DATA || "img/logo-landscape.png"}" alt="Green In Design"><div class="rp-co"><small>Structure · Architecture · MEP · ELV</small></div>`;

  async function reportPdf(d, lang) {
    const L = RT[lang], s = d.session || "End of day", p = byId("projects", d.project_id) || {}, no = reportNo(d), ph = reportPhotos(d), caps = d.captions || [];
    await makePdf({ lang, no, fileName: no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1>${L.title}</h1><small>${L.no} ${esc(no)}</small><span class="rp-sess">${esc(L.sessions[s])} · ${L.submitted} ${rTime(d.submitted_at || d.created_at)}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} ${esc(p.name)} · ${esc(rDate(d.report_date, lang))} · ${esc(L.sessions[s])}</span><span>${esc(no)}</span></div>`,
      contTitle: L.title + " (" + L.cont + ")", photoTitle: L.sitePhotos, blocks: reportBlocks(d, L, lang),
      photos: ph.map((src, i) => ({ src, cap: caps[i] || "" })), footLeft: L.generated + " " + esc(pdfGenerated()), pageLabel: L.page });
  }

  // ================= notifications =================
  // Every save is logged. The people concerned by it get one notification per action (several saves from one tap are merged).
  const NOTE_MODULE = { requests: "requests", purchase_orders: "procurement", suppliers: "procurement", stock_moves: "stock", stock_items: "stock", stores: "stock", daily_reports: "daily",
    documents: "docs", tasks: "projects", projects: "projects", project_members: "projects", claims: "cost", cost_lines: "cost", monthly_costs: "cost", invoices: "finance",
    defects: "qaqc", inspections: "qaqc", safety: "safety", site_visits: "svr", staff: "people", app_settings: "admin" };
  const NOTE_ICON = { requests: "requests", purchase_orders: "procurement", suppliers: "procurement", stock_moves: "stock", stock_items: "stock", stores: "stock", daily_reports: "daily", documents: "docs",
    tasks: "projects", projects: "projects", project_members: "people", claims: "cost", cost_lines: "cost", monthly_costs: "cost", invoices: "finance", defects: "qaqc", inspections: "qaqc", safety: "safety", site_visits: "svr", staff: "people", app_settings: "admin" };
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
      case "requests": return [r.requester_id, pm(r.project_id)].concat(r.status === "Pending" ? approversFor(r) : [], r.status === "Approved" && r.type === "Leave" ? ids("HR") : [],
        r.type === "Overtime" && r.status !== "Pending" ? ids("HR").concat(ids("MD")) : []);
      case "purchase_orders": { const rq = byId("requests", r.request_id); return ids("PROC").concat([pm(pid), rq && rq.requester_id], team(pid, "SITE"), r.status !== "Ordered" ? grp("FIN") : []); }
      case "stock_moves": { const it = byId("stock_items", r.item_id), low = it && stockQty(it.id) < Number(it.min_qty); return ids("PROC").concat([pm(pid), r.by_id], team(pid, "SITE"), low ? grp("QS") : []); }
      case "stock_items": case "stores": case "suppliers": return ids("PROC").concat(grp("ADMIN"));
      case "daily_reports": return r.kind === "Design" ? inGroup("DESIGN").filter((s) => hasTag(s, "HEAD")).map((s) => s.id).concat((r.entries || []).map((e) => pm(e.project_id)))
        : [pm(pid)].concat(ids("SITEMGR"), r.late || r.loc_status === "Away from site" || r.loc_status === "No location" ? ids("MD") : [], r.issues ? team(pid, "SITE") : []);
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
      case "site_visits": return ids("MD").concat(inGroup("PM").map((s) => s.id), split(r.visited_by), (r.actions || []).map((a) => a.who), [r.author_id]);
      case "app_settings": return ids("MD").concat(ids("SYSADMIN"), ids("BACKUPADMIN"));
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
    if (tbl === "stock_moves") { const it = byId("stock_items", r.item_id) || {}; return (r.qty > 0 ? "+" : "") + r.qty + " " + it.unit + " · " + ((byId("stores", r.store_id) || {}).name || "") + (r.project_id ? " · " + projLabel(r.project_id) : "") + " · now " + stockQty(it.id) + " " + it.unit + " in total"; }
    return summary;
  }
  let noteQueue = [], noteTimer = null;
  function queueNotify(action, tbl, record_id, summary) {
    if (["audit_log", "notifications"].includes(tbl) || (tbl === "app_settings" && String(record_id).startsWith("notify-"))) return;
    noteQueue.push({ tbl, record_id, summary, actor: state.user });
    clearTimeout(noteTimer); noteTimer = setTimeout(flushNotify, 400);
  }
  async function flushNotify() {
    const q = noteQueue; noteQueue = []; if (!q.length) return;
    const byRec = new Map(); q.forEach((e) => byRec.set(e.tbl + ":" + e.record_id, e));
    const per = new Map();
    for (const e of byRec.values()) {
      const r = e.tbl === "app_settings" ? { id: e.record_id } : byId(e.tbl, e.record_id);
      for (const to of recipientsFor(e.tbl, r, e.actor)) { if (!per.has(to)) per.set(to, []); per.get(to).push({ e, r }); }
    }
    const at = nowIso(); let n = 0;
    for (const [to, list] of per) {
      const main = list.find((x) => x.e.tbl === "requests") || list[0];
      const title = noteTitle(main.e.tbl, main.r, main.e.summary) + (list.length > 1 ? " (+" + (list.length - 1) + " more)" : "");
      const body = [noteBody(main.e.tbl, main.r, main.e.summary)].concat(list.filter((x) => x !== main).slice(0, 3).map((x) => noteTitle(x.e.tbl, x.r, x.e.summary))).filter(Boolean).join(" · ");
      try { await Store.insert("notifications", { to_id: to, actor_id: main.e.actor, title, body: body.slice(0, 300), tbl: main.e.tbl, record_id: main.e.record_id, read: false, at }); n++; } catch (err) { /* never block the work */ }
    }
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
      inspections: openInspection, projects: openProject, staff: openPerson, stock_items: openItem, site_visits: openSvr };
    if (tbl === "welcome") { const st = byId("staff", id); if (st) return openPerson(st); }
    if (tbl === "stock_moves" && r) return openItem(byId("stock_items", r.item_id));
    if (tbl === "project_members" && r) return openProject(byId("projects", r.project_id));
    if (tbl === "invoices" && r) return openInvoice(r);
    if (map[tbl] && r) return map[tbl](r);
    const route = NOTE_MODULE[tbl]; if (route) go(route === "admin" ? "admin" : route);
  }
  function noteItem(n, unreadable) {
    return `<li class="${n.read || unreadable ? "" : "unread"}" data-act="${act(async () => { closeDrawer(); if (!n.read && !unreadable) { await Store.update("notifications", n.id, { read: true }); updateBell(); } openRecord(n.tbl, n.record_id); })}">
      <span class="nic">${svgI(NOTE_ICON[n.tbl] || "bell")}</span><span><b>${esc(n.title)}</b><small>${esc(n.body || "")}</small><em>${esc(staffName(n.actor_id))} · ${ago_(n.at)}</em></span></li>`;
  }
  // ---------- Telegram alerts ----------
  // The database sends each new notification to the person's Telegram (see supabase/schema.sql and telegram-setup.sql).
  // The bot token never comes to the browser; the app only saves each person's chat ID.
  let tgStatus = { checked: false, ready: false, bot: "" };
  async function loadTelegramStatus() {
    try { const { data, error } = await Store.client.rpc("telegram_status"); if (error) throw error; tgStatus = { checked: true, ready: !!(data && data.ready), bot: (data && data.bot) || "" }; }
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
          await Store.insert("notifications", { to_id: u.id, actor_id: u.id, title: "Telegram test from GID", body: "Alerts for " + u.name + " now arrive here.", tbl: "staff", record_id: u.id, read: true, at: nowIso() });
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
    const feed = db.audit_log.filter((a) => { const mod = NOTE_MODULE[a.tbl]; if (!mod || !navVisible(u, mod)) return false; const r = byId(a.tbl, a.record_id); return inScope(u, recordProject(a.tbl, r)); })
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
    try { const before = new Set(db.notifications.map((n) => n.id)); Object.assign(db, JSON.parse(e.newValue)); const fresh = db.notifications.filter((n) => n.to_id === state.user && !before.has(n.id)); if (!$("#modal")) render(); else updateBell(); announceNew(fresh); } catch (x) { /* ignore */ }
  });
  setInterval(async () => {
    if (Store.mode !== "supabase" || !state.user) return;
    try {
      const { data } = await Store.client.from("notifications").select("id").eq("to_id", state.user).gt("at", lastNoteCheck).limit(50);
      lastNoteCheck = nowIso();
      if (data && data.length) { const known = new Set(db.notifications.map((n) => n.id)); await Store.loadAllRemote(); const fresh = db.notifications.filter((n) => n.to_id === state.user && !known.has(n.id)); if (!$("#modal") && !$("#drawer")) render(); else updateBell(); announceNew(fresh); }
    } catch (e) { /* try again next time */ }
  }, 20000);

  // ================= UI building blocks =================
  const badge = (s) => `<span class="badge b-${esc(String(s || "").toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(s)}</span>`;
  const bar = (v, warn) => `<div class="bar ${warn ? "warn" : ""}"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></div>`;
  const btn = (label, fn, cls) => `<button class="btn ${cls || ""}" data-act="${act(fn)}">${esc(label)}</button>`;
  const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;

  function table(cols, rows, onOpen) {
    if (!rows.length) return empty("Nothing here yet.");
    return `<table class="list"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) =>
      `<tr ${onOpen ? `data-act="${act(() => onOpen(r))}" class="click"` : ""}>${cols.map((c) => `<td data-label="${esc(c.label)}">${c.get(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
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
  function closeAllModals() { MSTACK.length = 0; const m = $("#modal"); if (m) m.remove(); syncHistory(); }
  // Keep the phone's back button in step with the windows
  function syncHistory() {
    setTimeout(() => { if (!$("#modal") && history.state && history.state.gidModal) { POP_SKIP++; history.back(); } }, 0);
  }
  window.addEventListener("popstate", () => {
    if (POP_SKIP) { POP_SKIP--; return; }
    if ($("#modal")) {
      modalBack();
      if ($("#modal")) { try { history.pushState({ gidModal: true }, "", location.href); } catch (e) { /* ignore */ } }
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
  const NAV = [
    ["dashboard", "Dashboard", "dashboard"], ["home", "My work", null], ["requests", "Requests", "requests"], ["projects", "Projects", "projects"],
    ["daily", "Daily report", "daily"], ["svr", "Site visits", "svr"], ["docs", "Documents", "docs"], ["cost", "Cost & Claims", "cost"], ["procurement", "Procurement", "procurement"],
    ["stock", "Stock", "stock"], ["finance", "Finance", "finance"], ["qaqc", "QA/QC", "qaqc"], ["safety", "Safety", "safety"], ["people", "People", "people"], ["admin", "Settings", "admin"]
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
      </div>`;
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
  const historyHtml = (h) => `<h4>History</h4><ul class="hist">${(h || []).map((x) => `<li><b>${esc(x.action)}</b> · ${esc(staffName(x.by))} · ${fmtDate(x.at)}${x.note ? `<br><small>${esc(x.note)}</small>` : ""}</li>`).join("")}</ul>`;

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
    if (canManageProject(u) || isSysAdmin(u)) return true;
    const g = groupsOf(u), mine = db.project_members.some((m) => m.project_id === p.id && m.staff_id === u.id);
    if (g.includes("SITE")) return mine;
    if (g.includes("QS")) return mine || !teamOf(p.id, "QS").length;
    return false;
  }
  // Only the boss, PMs and QS change the scopes and their shares; site engineers enter progress only
  const canSetShares = (u) => canManageProject(u) || isSysAdmin(u) || groupsOf(u).includes("QS");
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
    const u = me(), shares = canSetShares(u), mgr = canManageProject(u);
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

  function openProject(p) {
    const u = me();
    const canEdit = canManageProject(u);
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

  function openTask(t) {
    const u = me(); const acts = [];
    const mineOrPM = t.assignee_id === u.id || isPMof(u, t.project_id) || isSysAdmin(u);
    if (mineOrPM && t.status === "To do") acts.push(btn("Start", async () => { await patch("tasks", t.id, { status: "In progress" }, "Task started: " + t.title); closeModal(); render(); }, "primary"));
    if (mineOrPM && t.status !== "Done") acts.push(btn("Mark done", async () => { await patch("tasks", t.id, { status: "Done" }, "Task done: " + t.title); closeModal(); render(); }, "primary"));
    detail(t.title, [["Project", esc(projLabel(t.project_id))], ["Assigned to", esc(staffName(t.assignee_id))], ["Due", fmtDate(t.due_date)], ["Priority", esc(t.priority)], ["Status", badge(t.status)]], acts.join(""));
  }

  function newTask(u) {
    formModal("New task", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: state.project },
      { name: "title", label: "Task", required: true },
      { name: "assignee_id", label: "Assign to", type: "select", options: staffOptions(), value: u.id, required: true },
      { name: "due_date", label: "Due", type: "date", value: today() }, { name: "priority", label: "Priority", type: "select", options: ["Normal", "High"] }
    ], async (v) => { await save("tasks", Object.assign(v, { status: "To do", created_by: u.id }), "New task: " + v.title); });
  }

  SCREENS.projects = (u) => {
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
        <div class="form-actions"><button type="button" class="btn" data-act="${act(modalBack)}">Cancel</button><button type="button" class="btn primary" id="sd-go">Send ${s.toLowerCase()} report</button></div>`;
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
          const photos = await storeFiles(f.photos, "site");
          const rec = await save("daily_reports", { kind: "Site", session: s, project_id: f.project_id, report_date: f.report_date, author_id: u.id, weather: f.weather, manpower: workers, trades,
            work_done: f.work_done.trim(), issues: s === "End of day" ? f.issues.trim() : "", plan: f.plan.trim(), safety_note: f.safety_note.trim(), ot_start: s === "Overtime" ? f.ot_start : "", ot_end: s === "Overtime" ? f.ot_end : "",
            photos, captions: f.photos.map((_, i) => (f.captions[i] || "").trim() || (f.times[i] ? "Photo taken " + f.times[i] : "")), photo: "", entries: [], status: "Submitted", reviewed_by: "", submitted_at: sentAt,
            lat: pos && !pos.error ? pos.lat : null, lng: pos && !pos.error ? pos.lng : null, loc_acc: pos && !pos.error ? pos.acc : null, distance_m: lc.distance_m, loc_status: lc.loc_status,
            loc_note: lc.loc_status === "On site" ? "" : String(f.loc_note || "").trim(),
            // With the shared database the server sets the send time and the late flag, so a wrong phone clock cannot change them
            late: Store.mode === "supabase" ? null : li.late, late_minutes: Store.mode === "supabase" ? -1 : li.late_minutes },
            (r) => projLabel(f.project_id) + " " + s.toLowerCase() + " report " + r.report_date + (r.late ? " · LATE, sent " + timeOf(r.submitted_at) : "") + (lc.loc_status === "Away from site" ? " · away from site " + fmtDist(lc.distance_m) : lc.loc_status === "No location" ? " · no location" : ""));
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
        rows.forEach((r, i) => { const h = Number($(`[data-h="${i}"]`, m).value) || 0, p = Math.min(100, Number($(`[data-p="${i}"]`, m).value) || 0); if (h > 0 || p !== r.cur) entries.push({ ref_type: r.ref_type, ref_id: r.ref_id, label: r.label, project_id: r.project_id, hours: h, progress: p, note: "" }); });
        const oh = Number($("#dd-oh", m).value) || 0, ot = $("#dd-other", m).value.trim();
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
      <div class="legend"><span><i class="lg ok"></i>Sent</span><span><i class="lg no"></i>Not sent yet</span><span><i class="lg late"></i>Late morning report (after ${LATE_AT})</span></div></div>
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
          { label: "Status", get: (d) => badge(d.status) + (reportPhotos(d).length ? " 📷" : "") }], rows, openDaily)}`;
    }
    const exp = siteExpected(u);
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
        { label: "Status", get: (d) => badge(d.status) + (d.issues ? ' <span class="late">issue</span>' : "") }], rows, openDaily)}`;
  };

  // ---------- DOCUMENT CONTROL ----------
  const canReviewDoc = (u) => hasTag(u, "HEAD") && groupsOf(u).includes("DESIGN") || groupsOf(u).includes("ENG") || isSysAdmin(u);
  const canIssueDoc = (u) => hasTag(u, "DOC") || isSysAdmin(u);
  const siteOnly = (u) => !can(u, "docs", "edit") && groupsOf(u).some((g) => ["SITE"].includes(g));
  const canEditDoc = (u, d) => can(u, "docs", "edit") && inScope(u, d.project_id);

  function openDoc(d) {
    const u = me(); const acts = []; const go2 = async (status, summary, extra) => { await patch("documents", d.id, Object.assign({ status }, extra || {}), summary); closeModal(); render(); toast("Saved"); };
    const edit = canEditDoc(u, d);
    if (edit && ["Draft", "In review"].includes(d.status)) {
      acts.push(btn(d.file_url ? "Replace PDF" : "Upload PDF", () => formModal("Upload PDF · " + d.doc_no + " rev " + d.revision, [{ name: "file", label: "Drawing PDF", type: "pdf", required: true }],
        async (v) => { const url = await storeFile(v.file, v.file_name || d.doc_no + ".pdf"); await patch("documents", d.id, { file_url: url, file_name: v.file_name }, "PDF uploaded for " + d.doc_no); toast("PDF uploaded"); })));
      acts.push(btn("Update progress", () => formModal("Progress · " + d.doc_no, [{ name: "progress", label: "Drawing progress (%)", type: "number", value: d.progress, required: true }],
        async (v) => { await patch("documents", d.id, { progress: Math.min(100, v.progress) }, d.doc_no + " progress " + v.progress + "%"); })));
    }
    if (d.status === "Draft" && edit) acts.push(btn("Send for review", () => { if (!d.file_url) return toast("Upload the PDF before sending for review.", true); go2("In review", d.doc_no + " sent for review", { progress: Math.max(80, Number(d.progress) || 0) }); }, "primary"));
    if (d.status === "In review" && canReviewDoc(u)) {
      acts.push(btn("Return with comments", () => confirmAction("Return " + d.doc_no, [{ name: "notes", label: "Comments", type: "textarea", required: true }], (v) => patch("documents", d.id, { status: "Draft", notes: v.notes }, d.doc_no + " returned"))));
      acts.push(btn("Approve", () => go2("Approved", d.doc_no + " approved", { progress: 100 }), "primary"));
    }
    if (d.status === "Approved" && canIssueDoc(u)) acts.push(btn("Issue to site", async () => {
      for (const o of db.documents.filter((x) => x.project_id === d.project_id && x.doc_no === d.doc_no && x.id !== d.id && x.status === "Issued")) await patch("documents", o.id, { status: "Superseded" }, o.doc_no + " rev " + o.revision + " superseded");
      await go2("Issued", d.doc_no + " rev " + d.revision + " issued");
    }, "primary"));
    if (d.status === "Issued" && edit) acts.push(btn("Start new revision", () => formModal("New revision · " + d.doc_no + " rev " + (Number(d.revision) + 1), [{ name: "file", label: "Revised drawing PDF (can add later)", type: "pdf" }, { name: "notes", label: "What changed", type: "textarea" }],
      async (v) => {
        const url = v.file ? await storeFile(v.file, v.file_name || d.doc_no + ".pdf") : "";
        await save("documents", { project_id: d.project_id, doc_no: d.doc_no, title: d.title, discipline: d.discipline, doc_type: d.doc_type, revision: Number(d.revision) + 1, status: "Draft", owner_id: u.id, due_date: today(), notes: v.notes || "", file_url: url, file_name: v.file_name || "", progress: url ? 60 : 20 }, d.doc_no + " new revision");
        toast("Revision " + (Number(d.revision) + 1) + " created as Draft");
      })));
    const href = fileHref(d.file_url);
    detail(d.doc_no + " rev " + d.revision + " · " + d.title, [["Project", esc(projLabel(d.project_id))], ["Type", esc(d.doc_type)], ["Discipline", esc(d.discipline)],
      ["Owner", esc(staffName(d.owner_id))], ["Due", fmtDate(d.due_date)], ["Progress", bar(d.progress) + " " + esc(d.progress || 0) + "%"], ["Status", badge(d.status)], ["Comments", esc(d.notes)],
      ["File", href ? `<a href="${esc(href)}" target="_blank" rel="noopener">📄 ${esc(d.file_name || "Open PDF")}</a>` : '<span class="muted small">No PDF yet</span>']], acts.join(""),
      href ? `<iframe class="pdf" src="${esc(href)}" title="PDF preview"></iframe>` : "");
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
    detail(projLabel(c.project_id) + " · IPC " + c.ipc_no, [["Period", esc(c.period)], ["Claimed", money(c.claimed)], ["Certified", c.certified ? money(c.certified) : ""], ["Status", badge(c.status)]],
      next ? btn(next === "Invoiced" ? "Raise invoice" : "Mark " + next, () => confirmAction(next + " · IPC " + c.ipc_no, fields, run), "primary") : "",
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
    const onSite = groupsOf(u).includes("SITE") && inScope(u, p.project_id) || isPMof(u, p.project_id) || isSysAdmin(u) || hasTag(u, "PROC");
    const stockLines = (p.items || []).filter((x) => x.item_id);
    const defStore = (projectStores(p.project_id)[0] || mainStores()[0] || {}).id;
    if (p.status === "Ordered" && onSite) acts.push(btn("Confirm delivery", () => formModal("Confirm delivery · " + p.po_no, [
      { name: "delivered_note", label: "What arrived? Any damage or shortage?", type: "textarea", required: true }, { name: "delivered_photo", label: "Photo of delivery", type: "photo" }]
      .concat(stockLines.length ? [{ name: "to_stock", label: "Put the " + stockLines.length + " stock item" + (stockLines.length > 1 ? "s" : "") + " into stock?", type: "select", options: [["yes", "Yes, receive into stock"], ["no", "No, used straight away"]], value: "yes" },
        { name: "stock_store", label: "Into store", type: "select", options: db.stores.map((s) => [s.id, s.name]), value: defStore }]
        : [{ name: "stock_item", label: "Add to stock (optional)", type: "select", options: db.stock_items.map((i) => [i.id, i.code + " " + i.name]), blank: "Not a stock item" },
          { name: "stock_qty", label: "Quantity received into stock", type: "number" }, { name: "stock_store", label: "Into store", type: "select", options: db.stores.map((s) => [s.id, s.name]), value: defStore }]),
      async (v) => {
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
          { label: "Orders", get: (s) => esc(db.purchase_orders.filter((p) => p.supplier_id === s.id).length) }], db.suppliers.filter((s) => matchSearch(s, ["name", "trade"])))}`;
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
    const canPay = i.status === "Unpaid" && can(u, "finance", "admin");
    detail(i.inv_no + " · " + i.party, [["Type", esc(i.direction)], ["Project", esc(projLabel(i.project_id))], ["Amount", money(i.amount)], ["Due", fmtDate(i.due_date)],
      ["Status", badge(i.status)], ["Paid on", i.paid_at ? fmtDate(i.paid_at) : ""], ["Source", esc(i.source_type === "po" ? (byId("purchase_orders", i.source_id) || {}).po_no : i.source_type === "claim" ? "IPC claim" : i.source_type)]],
      canPay ? btn(i.direction === "Payable" ? "Mark paid" : "Mark received", async () => {
        await patch("invoices", i.id, { status: "Paid", paid_at: nowIso() }, i.inv_no + (i.direction === "Payable" ? " paid" : " received"));
        if (i.source_type === "po") await patch("purchase_orders", i.source_id, { status: "Paid" }, "PO paid");
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
  const canRaiseQA = (u) => groupsOf(u).some((g) => ["EXEC", "PM", "QS"].includes(g)) || hasTag(u, "QAQC") || qaqcBoss(u);
  const QA_DISC = ["Architecture", "Structure", "Mechanical", "Electrical", "Plumbing", "Fire", "ELV"];
  const defectNo = (f) => "DEF-" + String(db.defects.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).indexOf(f) + 1).padStart(4, "0");
  const inspNo = (i) => "INS-" + String(db.inspections.slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).indexOf(i) + 1).padStart(4, "0");
  const qaEvidence = (f) => (f.evidence && f.evidence.length ? f.evidence : f.photo ? [{ type: "image", name: "defect.jpg", url: f.photo }] : []);
  function newDefect(u, preset) {
    preset = preset || {};
    const siteTeam = (pid) => { const t = pid ? teamOf(pid, "SITE").map((m) => byId("staff", m.staff_id)).filter(Boolean) : []; return t.length ? t : inGroup("SITE"); };
    formModal("Report a defect", [
      { name: "project_id", label: "Project", type: "select", options: projectOptions(u), required: true, value: preset.project_id || state.project },
      { name: "location", label: "Location", required: true, value: preset.location || "" }, { name: "discipline", label: "Discipline", type: "select", options: QA_DISC, value: preset.discipline || "" },
      { name: "description", label: "Defect", type: "textarea", required: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], value: "Medium" },
      { name: "assigned_to", label: "Who fixes it", type: "select", options: staffOptions(siteTeam(preset.project_id || state.project)), required: true },
      { name: "due_date", label: "Fix by", type: "date", value: today() },
      { name: "evidence", label: "Photos or files", type: "evidence", required: true, requiredMsg: "Attach at least one photo, image or PDF of the defect.", help: "Required. Take a photo with the camera, or attach images or a PDF." }
    ], async (v) => {
      v.evidence = await storeEvidence(v.evidence, "defect");
      await save("defects", Object.assign(v, { status: "Open", raised_by: u.id, photo: "", close_evidence: [], inspection_id: preset.inspection_id || "" }), "Defect: " + v.description);
    }, "Send defect");
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
      const ev = await storeEvidence(v.result_evidence, "inspection-result");
      await patch("inspections", i.id, { result, result_note: v.result_note, result_evidence: ev, checked_at: nowIso() }, "Inspection " + result.toLowerCase() + ": " + i.title);
    }, result === "Passed" ? "Save: passed" : "Save: failed");
  }
  function openInspection(i) {
    const u = me(); const acts = [];
    if (i.result === "Open" && (i.inspector_id === u.id || qaqcBoss(u) || canRaiseQA(u))) {
      acts.push(btn("Failed", () => inspectionResult(i, "Failed"), "danger"));
      acts.push(btn("Passed", () => inspectionResult(i, "Passed"), "primary"));
    }
    if (i.result === "Failed" && canRaiseQA(u)) acts.push(btn("Raise defect", () => newDefect(u, { project_id: i.project_id, location: i.area, discipline: i.discipline, inspection_id: i.id })));
    acts.push(btn("PDF English", () => qaPdf("insp", i, "en")) + btn("PDF ខ្មែរ", () => qaPdf("insp", i, "km")));
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
      async (v) => { await patch("defects", f.id, ok ? { status: "Closed", verify_note: v.verify_note, closed_by: me().id, closed_at: nowIso() } : { status: "Open", verify_note: v.verify_note }, "Defect " + (ok ? "closed" : "reopened") + ": " + f.description); },
      ok ? "Close defect" : "Reopen");
  }
  function openDefect(f) {
    const u = me(); const acts = [];
    if (f.status === "Open" && (f.assigned_to === u.id || can(u, "qaqc", "edit") || isPMof(u, f.project_id))) acts.push(btn("Send correction", () => fixDefect(f), "primary"));
    if (f.status === "Fixed" && (qaqcBoss(u) || isPMof(u, f.project_id) || f.raised_by === u.id || canRaiseQA(u))) { acts.push(btn("Reopen", () => verifyDefect(f, false))); acts.push(btn("Close", () => verifyDefect(f, true), "primary")); }
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
    const L = QAT[lang], p = byId("projects", r.project_id) || {}, T = (m, v) => esc((m && m[v]) || v || "");
    const imgs = (l) => (l || []).filter((x) => x.type !== "pdf"), pdfs = (l) => (l || []).filter((x) => x.type === "pdf");
    const ph = (x, empty) => x ? `<div class="img" style="background-image:url('${String(x.url).replace(/'/g, "%27")}')"></div>` : `<div class="img empty">${empty}</div>`;
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
          <tr><th>${L.raised}</th><td>${esc(rb.name || "")} · ${esc(rb.title || "")}</td><th>${L.date}</th><td>${esc(rDate((r.created_at || today()).slice(0, 10), lang))}</td></tr>
          <tr><th>${L.assigned}</th><td>${esc(person(r.assigned_to).name || "")}</td><th>${L.due}</th><td>${esc(rDate(r.due_date, lang))}</td></tr>
          ${insp ? `<tr><th>${L.from}</th><td colspan="3">${esc(inspNo(insp))} · ${esc(insp.title)}</td></tr>` : ""}</table>`,
        `<h2><i>2</i>${L.found}</h2><div class="sf-box">${esc(r.description || "")}</div>`,
        `<h2><i>3</i>${L.evidence}</h2><div class="sf-ba"><div class="bf"><div class="hd">${L.before}</div>${ph(imgs(before)[0], L.none)}<p>${esc(rb.name || "")}</p></div><div class="af"><div class="hd">${L.after}</div>${ph(imgs(after)[0], L.noAfter)}<p>${r.fixed_by ? esc(fx.name || "") + " · " + esc(fmtDate(r.fixed_at)) : "—"}</p></div></div>`,
        `<h2><i>4</i>${L.correction}</h2><table class="sf-t"><tr><th>${L.corrected}</th><td>${esc(r.correction || "—")}</td></tr><tr><th>${L.fixedBy}</th><td>${r.fixed_by ? esc(fx.name) + " · " + esc(fmtDate(r.fixed_at)) + " " + esc(timeOf(r.fixed_at)) : "—"}</td></tr>
          <tr><th>${L.verify}</th><td>${esc(r.verify_note || "—")}${r.closed_by ? " · " + esc(cl.name) + " · " + esc(fmtDate(r.closed_at)) : ""}</td></tr>
          <tr><th>${L.attachments}</th><td>${L.files(before.length + after.length)}${files.length ? " · " + files.map((f) => esc(f.name)).join(", ") : ""}</td></tr></table>`,
        `<h2><i>5</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.raiser}</small><b>${esc(rb.name || "—")}</b><em>${esc(rb.title || "")}</em></div><div><small>${L.fixer}</small><b>${r.fixed_by ? esc(fx.name) : "—"}</b><em>${L.sigLine}</em></div>
          <div><small>${L.checker}</small><b>${r.closed_by ? esc(cl.name) : "—"}</b><em>${L.sigLine}</em></div><div><small>${L.pm}</small><b>${esc(pm.name || "—")}</b><em>${L.sigLine}</em></div></div>`];
    } else {
      no = inspNo(r); title = L.titleI; form = L.formI; before = r.evidence || []; after = r.result_evidence || [];
      stamp = r.result === "Passed" ? L.passed : r.result === "Failed" ? L.failed : L.open;
      const ins = person(r.inspector_id), pm = person(p.pm_id), raised = db.defects.filter((f) => f.inspection_id === r.id);
      const tick = (on, t) => `<span class="sf-chk"><i class="${on ? "on" : ""}">${on ? "✓" : ""}</i>${t}</span>`;
      blocks = [
        `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.loc}</th><td>${esc(r.area || "")}</td></tr>
          <tr><th>${L.disc}</th><td>${T(L.discMap, r.discipline)}</td><th>${L.date}</th><td>${esc(rDate(r.insp_date, lang))}</td></tr><tr><th>${L.inspector}</th><td colspan="3">${esc(ins.name || "")} · ${esc(ins.title || "")}</td></tr></table>`,
        `<h2><i>2</i>${L.checklist}</h2><div class="sf-box">${esc(r.notes || "—")}</div>`,
        `<h2><i>3</i>${L.result}</h2><table class="sf-t"><tr><th>${L.result}</th><td>${tick(r.result === "Passed", L.passed)}${tick(r.result === "Failed", L.failed)}${tick(r.result === "Open", L.open)}</td></tr>
          <tr><th>${L.resultNote}</th><td>${esc(r.result_note || "—")}</td></tr><tr><th>${L.defectsRaised}</th><td>${raised.length ? raised.map((f) => esc(defectNo(f) + " · " + f.description)).join("<br>") : L.none}</td></tr></table>`,
        `<h2><i>4</i>${L.inspEv}</h2><div class="sf-ba"><div class="bf"><div class="hd">${L.inspPh}</div>${ph(imgs(before)[0], L.none)}<p>${esc(fmtDate(r.insp_date))}</p></div><div class="af"><div class="hd">${L.resPh}</div>${ph(imgs(after)[0], L.none)}<p>${r.checked_at ? esc(fmtDate(r.checked_at)) + " " + esc(timeOf(r.checked_at)) : "—"}</p></div></div>`,
        `<h2><i>5</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.inspector}</small><b>${esc(ins.name || "—")}</b><em>${L.sigLine}</em></div><div><small>${L.pm}</small><b>${esc(pm.name || "—")}</b><em>${L.sigLine}</em></div><div><small>&nbsp;</small><b>&nbsp;</b><em>${L.sigLine}</em></div><div><small>&nbsp;</small><b>&nbsp;</b><em>${L.sigLine}</em></div></div>`];
    }
    const more = imgs(before).concat(imgs(after));
    if (!document.getElementById("sf-css")) { const st = document.createElement("style"); st.id = "sf-css"; st.textContent = SF_CSS; document.head.appendChild(st); }
    await makePdf({ lang, no, fileName: no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${title}</h1><small>${esc(no)} · ${form}</small><span class="rp-sess ${/OPEN|FIXED|FAILED|មិន|រង់ចាំ/.test(stamp) ? "sf-open" : ""}">${stamp}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} · ${esc(no)}</span><span>${form}</span></div>`,
      contTitle: title + " (" + L.cont + ")", photoTitle: L.photos, blocks,
      photos: more.length > 2 ? more.map((x, i) => ({ src: x.url, cap: i < imgs(before).length ? (kind === "defect" ? L.before : L.inspPh) : (kind === "defect" ? L.after : L.resPh) })) : [],
      footLeft: L.generated + " " + esc(pdfGenerated()), pageLabel: L.page });
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
  const canCloseSafety = (u, s) => s.status === "Open" && (can(u, "safety", "approve") || hasTag(u, "SITEMGR") || (groupsOf(u).includes("SITE") && inScope(u, s.project_id)) || isPMRole(u));
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
    const T = (map, v) => esc((map && map[v]) || v || "");
    const imgs = (list) => (list || []).filter((x) => x.type !== "pdf"), pdfs = (list) => (list || []).filter((x) => x.type === "pdf");
    const b1 = imgs(s.evidence)[0], a1 = imgs(s.close_evidence)[0];
    const tick = (on, t) => `<span class="sf-chk"><i class="${on ? "on" : ""}">${on ? "✓" : ""}</i>${t}</span>`;
    const typeRow = ["Toolbox talk", "Inspection", "PPE check", "Near miss", "Incident"].map((t) => tick(s.rec_type === t, T(L.types, t))).join("");
    const sevRow = ["Low", "Medium", "High"].map((v) => `<span class="sf-sev ${s.severity === v ? "on " + v.toLowerCase() : ""}">${T(L.sevs, v)}</span>`).join("");
    const ba = `<div class="sf-ba"><div class="bf"><div class="hd">${L.before}</div>${b1 ? `<div class="img" style="background-image:url('${String(b1.url).replace(/'/g, "%27")}')"></div>` : `<div class="img empty">${L.none}</div>`}<p>${esc(who.name || "")} · ${esc(fmtDate(s.rec_date))}</p></div>
      <div class="af"><div class="hd">${L.after}</div>${a1 ? `<div class="img" style="background-image:url('${String(a1.url).replace(/'/g, "%27")}')"></div>` : `<div class="img empty">${L.noAfter}</div>`}<p>${closer ? esc(closer.name) + " · " + esc(fmtDate(s.closed_at)) + " " + esc(timeOf(s.closed_at)) : "—"}</p></div></div>`;
    const files = pdfs(s.evidence).concat(pdfs(s.close_evidence));
    const verifier = s.status === "Closed" ? (byId("staff", p.pm_id) || {}) : null;
    const sign = `<div class="sf-sign"><div><small>${L.reporter}</small><b>${esc(who.name || "")}</b><em>${esc(who.title || "")} · ${esc(fmtDate(s.rec_date))}</em></div>
      <div><small>${L.closer}</small><b>${closer ? esc(closer.name) : "—"}</b><em>${closer ? esc(closer.title) + " · " + esc(fmtDate(s.closed_at)) : L.sigLine}</em></div>
      <div><small>${L.verifier}</small><b>${verifier ? esc(verifier.name) : "—"}</b><em>${L.sigLine}</em></div><div><small>${L.officer}</small><b>${L.toAssign}</b><em>${L.sigLine}</em></div></div>`;
    const blocks = [];
    if (form === "A") {
      blocks.push(`<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.project}</th><td>${esc(p.code)} ${esc(p.name)}</td><th>${L.area}</th><td>${esc(s.area || "")}</td></tr>
        <tr><th>${L.dt}</th><td>${esc(rDate(s.rec_date, lang))}</td><th>${L.by}</th><td>${esc(who.name || "")} · ${esc(who.title || "")}</td></tr></table>`);
      blocks.push(`<h2><i>2</i>${L.type} · ${L.sev}</h2><table class="sf-t"><tr><th>${L.type}</th><td>${typeRow}</td></tr><tr><th>${L.sev}</th><td>${sevRow}</td></tr></table>`);
      blocks.push(`<h2><i>3</i>${L.found}</h2><div class="sf-box">${esc(s.description || "")}</div>`);
      blocks.push(`<h2><i>4</i>${L.evidence}</h2>${ba}`);
      blocks.push(`<h2><i>5</i>${L.action}</h2><table class="sf-t"><tr><th>${L.immediate}</th><td>${esc(s.action || L.none)}</td></tr><tr><th>${L.correction}</th><td>${esc(s.correction || "—")}</td></tr>
        ${s.preventive ? `<tr><th>${L.preventive}</th><td>${esc(s.preventive)}</td></tr>` : ""}<tr><th>${L.attachments}</th><td>${L.files((s.evidence || []).length + (s.close_evidence || []).length)}${files.length ? " · " + files.map((f) => esc(f.name)).join(", ") : ""}</td></tr></table>`);
      blocks.push(`<h2><i>6</i>${L.sign}</h2>${sign}`);
    } else {
      const lk = Number(s.likelihood) || 0, cq = Number(s.consequence) || 0, score = lk * cq;
      const cell = (l, c) => { const v = l * c, cls = v >= 15 ? "r" : v >= 8 ? "o" : v >= 4 ? "y" : "g"; return `<td class="${cls}${l === lk && c === cq ? " sel" : ""}">${v}</td>`; };
      const matrix = `<table class="sf-mx"><tbody>${[5, 4, 3, 2, 1].map((l) => `<tr><th>${esc(L.lik[l])} (${l})</th>${[1, 2, 3, 4, 5].map((c) => cell(l, c)).join("")}</tr>`).join("")}<tr><th></th>${[1, 2, 3, 4, 5].map((c) => `<th class="c">${esc(L.con[c])}</th>`).join("")}</tr></tbody></table>`;
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
      blocks.push(`<h2><i>G</i>${L.closure}</h2><table class="sf-t"><tr><th>${L.closedOn}</th><td>${s.closed_at ? esc(fmtDate(s.closed_at)) + " " + esc(timeOf(s.closed_at)) : "—"}</td><th>${L.timeOpen}</th><td>${openH != null ? openH + " h" : "—"}</td></tr><tr><th>${L.lessons}</th><td colspan="3">${esc(s.lessons || "—")}</td></tr></table>`);
      blocks.push(`<h2><i>H</i>${L.sign}</h2>${sign}`);
    }
    return blocks;
  }
  async function safetyPdf(s, lang) {
    const L = SFT[lang], form = safetyForm(s), no = safetyNo(s), p = byId("projects", s.project_id) || {};
    const title = form === "B" ? L.titleB : L.titleA;
    const more = (s.evidence || []).concat(s.close_evidence || []).filter((x) => x.type !== "pdf");
    if (!document.getElementById("sf-css")) { const st = document.createElement("style"); st.id = "sf-css"; st.textContent = SF_CSS; document.head.appendChild(st); }
    await makePdf({ lang, no, fileName: no + "-Form" + form + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${title}</h1><small>${esc(no)} · ${form === "B" ? L.formB : L.formA}</small><span class="rp-sess ${s.status === "Open" ? "sf-open" : ""}">${s.status === "Open" ? L.open : L.closed}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(p.code)} · ${esc(no)}</span><span>${form === "B" ? L.formB : L.formA}</span></div>`,
      contTitle: title + " (" + L.cont + ")", photoTitle: L.photos, blocks: safetyBlocks(s, form, L, lang),
      photos: more.length > 2 ? more.map((x, i) => ({ src: x.url, cap: (i < (s.evidence || []).filter((y) => y.type !== "pdf").length ? L.before : L.after) })) : [],
      footLeft: L.generated + " " + esc(pdfGenerated()), pageLabel: L.page });
  }
  const SF_CSS = `.rp-page .sf-h1{font-size:16px;max-width:430px;line-height:1.3}.rp-page.km .sf-h1{font-size:16px;line-height:1.6}
  .rp-page h2 i{font-style:normal;background:#2e8540;color:#fff;border-radius:4px;padding:0 6px;margin-right:6px;font-size:11px}
  .sf-t th{background:#eef6ef;width:20%;text-transform:none!important;font-size:11px!important;color:#3b4b41!important;border:1px solid #d5dfd6}.sf-t td{border:1px solid #d5dfd6}
  .sf-chk{display:inline-flex;align-items:center;gap:4px;margin:0 10px 2px 0;white-space:nowrap}.sf-chk i{width:12px;height:12px;border:1.4px solid #3b4b41;border-radius:2px;display:inline-block;font-style:normal;font-size:9px;line-height:10px;text-align:center;color:#fff}.sf-chk i.on{background:#2e8540;border-color:#2e8540}
  .sf-sev{display:inline-block;padding:1px 10px;border-radius:4px;margin-right:6px;border:1px solid #d5dfd6;color:#8a93a6}.sf-sev.on{color:#fff;font-weight:700}.sf-sev.on.low{background:#1a7f42;border-color:#1a7f42}.sf-sev.on.medium{background:#b97800;border-color:#b97800}.sf-sev.on.high{background:#c0362c;border-color:#c0362c}
  .sf-box{border:1px solid #d5dfd6;border-radius:6px;padding:8px 10px;min-height:44px;white-space:pre-wrap}
  .sf-ba{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sf-ba>div{border:1px solid #d5dfd6;border-radius:8px;overflow:hidden}.sf-ba .hd{display:block;width:auto;height:auto;border-radius:0;padding:5px 9px;color:#fff;font-weight:700;font-size:11.5px}.sf-ba .bf .hd{background:#c0362c}.sf-ba .af .hd{background:#1a7f42}
  .sf-ba .img{height:200px;background:#eef0f4 center/cover no-repeat}.sf-ba .img.empty{display:flex;align-items:center;justify-content:center;color:#8a93a6;font-size:12px}.sf-ba p{padding:5px 9px;font-size:11px;color:#4a5a50}
  .sf-sign{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sf-sign>div{border:1px solid #d5dfd6;border-radius:6px;padding:7px 9px;height:76px;position:relative;font-size:11.5px}.sf-sign small{display:block;color:#6b7488;font-size:10px}.sf-sign em{position:absolute;left:9px;right:9px;bottom:6px;border-top:1px dashed #9aa79f;padding-top:3px;font-style:normal;font-size:9.5px;color:#7d8c83}
  .sf-two{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.sf-mx{width:auto!important;border-collapse:separate!important;border-spacing:2px}.sf-mx td{width:34px;height:22px;text-align:center;font-weight:700;border:0!important;border-radius:3px;padding:0!important;font-size:10.5px}
  .sf-mx th{font-size:9.5px!important;padding:0 5px!important;border:0!important;text-transform:none!important;color:#5b6b61!important;white-space:nowrap}.sf-mx th.c{text-align:center;white-space:normal;line-height:1.2}
  .sf-mx .g{background:#cfe9d4}.sf-mx .y{background:#fbe7a6}.sf-mx .o{background:#f7c08a}.sf-mx .r{background:#f2a39c}.sf-mx td.sel{outline:2.5px solid #121a2c;outline-offset:-2px}
  .sf-note{background:#f4f8f2;border-left:3px solid #2e8540;padding:6px 9px;font-size:11.5px;margin-top:6px}.rp-sess.sf-open{background:#c0362c}`;
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
    if (can(u, "svr", "edit")) {
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
    const L = SVT[lang], T = (m, x) => esc((m && m[x]) || x || ""), vis = svrVisitors(v), qs = vis.find((s) => groupsOf(s).includes("QS")), md = withTag("MD")[0] || {};
    const tick = (on, t) => `<span class="sf-chk"><i class="${on ? "on" : ""}">${on ? "✓" : ""}</i>${t}</span>`;
    const proj = v.project_id ? byId("projects", v.project_id) : null;
    const blocks = [
      `<h2><i>1</i>${L.details}</h2><table class="sf-t"><tr><th>${L.client}</th><td>${esc(v.client)}</td><th>${L.contact}</th><td>${esc([v.contact_name, v.contact_phone, v.contact_telegram].filter(Boolean).join(" · "))}</td></tr>
        <tr><th>${L.address}</th><td>${esc(v.address)}</td><th>${L.gps}</th><td>${hasSitePin(v) ? esc(Number(v.lat).toFixed(5) + ", " + Number(v.lng).toFixed(5)) + " · " + L.recorded : L.none}</td></tr>
        <tr><th>${L.visit}</th><td>${esc(rDate(v.visit_date, lang))} · ${esc([v.time_from, v.time_to].filter(Boolean).join("–"))}</td><th>${L.by}</th><td>${esc(vis.map((s) => s.name).join(", "))}</td></tr>
        <tr><th>${L.source}</th><td>${esc(v.lead_source || L.none)}</td><th>${L.work}</th><td>${T(L.workMap, v.work_type)}</td></tr></table>`,
      `<h2><i>2</i>${L.req}</h2><table class="sf-t"><tr><th>${L.wants}</th><td colspan="3">${esc(v.requirements || "")}</td></tr>
        <tr><th>${L.budget}</th><td>${v.budget_min || v.budget_max ? esc(money(v.budget_min || 0) + " – " + money(v.budget_max || 0)) : L.none}</td><th>${L.timeline}</th><td>${esc(v.timeline || L.none)}</td></tr>
        <tr><th>${L.scope}</th><td colspan="3">${SCOPES.map((k) => tick((v.scopes || []).includes(k), lang === "km" ? esc(I18N.t(k) || k) : k)).join("")}</td></tr></table>`,
      `<h2><i>3</i>${L.cond}</h2><table class="sf-t"><tr><th>${L.cScope}</th><th>${L.cCond}</th><th style="width:auto">${L.cNote}</th></tr>${(v.conditions || []).map((c) => `<tr><td><b>${lang === "km" ? esc(I18N.t(c.scope) || c.scope) : esc(c.scope)}</b></td><td><span class="svc ${esc(String(c.cond).toLowerCase())}">${T(L.condMap, c.cond)}</span></td><td>${esc(c.note || "")}</td></tr>`).join("") || `<tr><td colspan="3">${L.none}</td></tr>`}</table>`,
      `<h2><i>4</i>${L.cons}</h2><div class="sf-box">${SVR_CONSTRAINTS.map(([k]) => tick((v.constraints || []).includes(k), esc(L.consMap[k]))).join("")}</div>`,
      `<h2><i>5</i>${L.meas}</h2><table class="sf-t"><tr><th>${L.plot}</th><td>${esc(v.plot_size || L.none)}</td><th>${L.floors}</th><td>${esc(v.floors || L.none)}</td></tr><tr><th>${L.height}</th><td>${esc(v.floor_height || L.none)}</td><th>${L.area}</th><td>${esc(v.floor_area || L.none)}</td></tr></table>`,
      `<h2><i>6</i>${L.risks}</h2><div class="sf-box"><b>${L.risk}:</b> ${esc(v.risks || L.none)}<br><b>${L.opp}:</b> ${esc(v.opportunities || L.none)}</div>`,
      `<h2><i>7</i>${L.rec}</h2><table class="sf-t"><tr><th>${L.go}</th><td>${SVR_DECISION.map(([k]) => tick(v.decision === k, esc(L.decMap[k]))).join("")}</td></tr><tr><th>${L.est}</th><td>${v.est_value ? esc(money(v.est_value)) : L.none}${v.quote_value ? " · " + esc(money(v.quote_value)) : ""}</td></tr>
        <tr><th>${L.team}</th><td>${esc(v.proposed_team || L.none)}</td></tr>${v.lost_reason ? `<tr><th>${L.lost}</th><td>${esc(v.lost_reason)}</td></tr>` : ""}</table>`,
      `<h2><i>8</i>${L.acts}</h2><table class="sf-t"><tr><th style="width:auto">${L.aAct}</th><th>${L.aWho}</th><th>${L.aBy}</th><th>${L.aSt}</th></tr>${(v.actions || []).map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(staffName(a.who))}</td><td>${esc(a.by ? rDate(a.by, lang) : "")}</td><td>${a.done ? L.done : L.open}</td></tr>`).join("") || `<tr><td colspan="4">${L.none}</td></tr>`}</table>
        <div class="svconv">${proj ? L.convDone(esc(proj.code + " " + proj.name)) : L.conv}</div>`,
      `<h2><i>9</i>${L.sign}</h2><div class="sf-sign"><div><small>${L.sVisit}</small><b>${esc((byId("staff", v.author_id) || vis[0] || {}).name || "")}</b><em>${L.sig}</em></div><div><small>${L.sQs}</small><b>${esc(qs ? qs.name : "")}</b><em>${L.sig}</em></div>
        <div><small>${L.sAppr}</small><b>${esc(v.approved_by ? staffName(v.approved_by) : md.name || "")}</b><em>${v.approved_at ? esc(fmtDate(v.approved_at)) : L.md}</em></div><div><small>${L.sClient}</small><b>${esc(v.contact_name || "")}</b><em>${L.sig}</em></div></div>`];
    if (!document.getElementById("sf-css")) { const st = document.createElement("style"); st.id = "sf-css"; st.textContent = SF_CSS; document.head.appendChild(st); }
    if (!document.getElementById("svr-css")) { const st = document.createElement("style"); st.id = "svr-css"; st.textContent = ".svc{font-weight:700;padding:1px 7px;border-radius:4px;font-size:11px}.svc.good{background:#e3f4e8;color:#1a7f42}.svc.fair{background:#fff4d6;color:#8a5a00}.svc.poor{background:#fdeceb;color:#c0362c}.svc.none{background:#eef1ef;color:#5b6b61}.svconv{border:1.5px dashed #2e8540;border-radius:8px;padding:7px 10px;margin-top:8px;background:#f4f8f2;font-size:12px}"; document.head.appendChild(st); }
    const stamp = (L.status[v.status] || v.status) + (v.status === "Lead" && v.quote_due ? " · " + L.due + " " + esc(fmtDate(v.quote_due)) : "");
    await makePdf({ lang, no: v.svr_no, fileName: v.svr_no + "-" + (lang === "km" ? "KH" : "EN") + ".pdf",
      head: `<div class="rp-top">${pdfLogo()}<div class="rp-title"><h1 class="sf-h1">${L.title}</h1><small>${esc(v.svr_no)} · ${L.form}</small><span class="rp-sess ${v.status === "Lost" ? "sf-open" : ""}">${stamp}</span></div></div>`,
      mini: (t) => `<div class="rp-mini"><span><b>${t}</b> · ${esc(v.svr_no)} · ${esc(v.client)}</span><span>${L.form}</span></div>`,
      contTitle: L.title + " (" + L.cont + ")", photoTitle: L.photos, blocks,
      photos: (v.photos || []).map((src, i) => ({ src, cap: (i + 1) + " · " + ((v.captions || [])[i] || "") })),
      footLeft: L.generated + " " + esc(pdfGenerated()), pageLabel: L.page });
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
        start_date: v.start_date || null, desk: v.desk || "", photo };
      if (admin) row.tags = v.tags || ""; else if (isNew) row.tags = "";
      if (!isNew) { await patch("staff", s.id, row, "Staff details updated: " + row.name + " · " + row.title); return; }
      if (db.staff.some((x) => !x.left_on && x.name.toLowerCase() === row.name.toLowerCase())) throw new Error(row.name + " is already in the staff list.");
      const r = await Store.insert("staff", row);
      try { await Store.insert("audit_log", { at: nowIso(), actor_id: u.id, action: "Created", tbl: "staff", record_id: r.id, summary: "New staff: " + row.name + " · " + row.title }); } catch (e) { /* ignore */ }
      if (document.getElementById("wl-send") ? document.getElementById("wl-send").checked : true) {
        const w = welcomeText(Object.assign({}, row, { dept: v.dept }), u); let n = 0; const at = nowIso();
        for (const t of staffNow()) { try { await Store.insert("notifications", { to_id: t.id, actor_id: u.id, title: w.title, body: w.body, tbl: "welcome", record_id: r.id, read: t.id === u.id, at }); n++; } catch (e) { /* never block */ } }
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

  function openPerson(s) {
    const u = me(); const full = seesAll(u, "people") || s.id === u.id;
    const projects = db.projects.filter((p) => p.pm_id === s.id || db.project_members.some((m) => m.project_id === p.id && m.staff_id === s.id)).map((p) => p.code).join(", ");
    const lates = db.daily_reports.filter((d) => d.author_id === s.id && d.late);
    const tel = String(s.phone || "").replace(/[^\d+]/g, ""), tg = String(s.telegram_user || "").replace(/^@/, "");
    detail(s.name, [["Title", esc(s.title)], ["Department", esc(groupsOf(s).map((g) => DEPT_NAME[g] || GROUPS[g]).join(", "))],
      ["Phone", s.phone ? `<a href="tel:${esc(tel)}">${esc(s.phone)}</a>` : '<span class="muted">Not set</span>'],
      tg ? ["Telegram", `<a href="https://t.me/${esc(tg)}" target="_blank" rel="noopener">@${esc(tg)}</a>`] : null, s.email ? ["Email", `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`] : null,
      s.start_date ? ["Start date", fmtDate(s.start_date)] : null, s.desk ? ["Desk / location", esc(s.desk)] : null, s.left_on ? ["Left on", '<span class="tag bad">' + esc(fmtDate(s.left_on)) + "</span>"] : null,
      ["Projects", esc(projects)],
      groupsOf(s).includes("SITE") ? ["Late morning reports", lates.length ? `<b class="late">${lates.length}</b> <small>(${lates.filter((d) => String(d.report_date).slice(0, 7) === today().slice(0, 7)).length} this month)</small>` : "0"] : null,
      full ? ["Leave taken (approved days)", esc(leaveTaken(s.id))] : null, full ? ["System tags", esc(s.tags)] : null, full ? ["Telegram alerts", String(s.telegram_chat_id || "").trim() ? '<span class="tag ok">Linked</span>' : '<span class="muted">Not linked</span>'] : null],
      canManageStaff(u) ? (s.left_on ? btn("Restore", () => restoreStaff(s), "primary") : btn("Remove", () => removeStaff(s), "danger") + btn("Edit", () => staffForm(s), "primary"))
        : s.id === u.id ? btn("Edit my phone and Telegram", () => formModal("My contact details", [{ name: "phone", label: "Phone number", value: s.phone || "", required: true }, { name: "telegram_user", label: "Telegram username", value: s.telegram_user || "" }], async (v) => { await patch("staff", s.id, v, "Contact details updated: " + s.name); }), "primary") : "");
  }
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
    const T = (t) => km ? (I18N.t(t) || t) : t;
    host.className = "oc-print" + (km ? " km" : "");
    host.innerHTML = `<div class="ocp-head">${pdfLogo()}<div class="ocp-title"><h1>${km ? "តារាងរចនាសម្ព័ន្ធគម្រោង" : "Project Organization Chart"}</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b> · ${esc(p.client || "")} · ${esc(p.location || "")}</p></div></div>`
      + orgChartHtml(data).replace(/data-act="[^"]*"/g, "").replace(/ loading="lazy"/g, ' loading="eager"') + `<div class="ocp-foot"><span>GID Management System · ${km ? "បង្កើតនៅ" : "generated"} ${esc(pdfGenerated())}</span><span>${esc(p.code)}</span></div>`;
    if (km) host.querySelectorAll(".oc-l, .oc-none").forEach((el) => { el.textContent = T(el.textContent); });
    host.querySelectorAll(".oc-l.top").forEach((el) => el.remove());
    toast(km ? "កំពុងបង្កើត PDF…" : "Making the PDF…");
    document.body.appendChild(host);
    try {
      await Promise.all(PDF_LIBS.map(loadScript));
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
      // photos in the hidden copy must load now (lazy photos off screen never load), and never wait more than 8 seconds
      await Promise.race([Promise.all([...host.querySelectorAll("img")].map((im) => im.complete && im.naturalWidth ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))), new Promise((r) => setTimeout(r, 8000))]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await window.html2canvas(host, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      const w = 297, h = Math.min(210, (canvas.height / canvas.width) * w), iw = h < 210 ? w : (canvas.width / canvas.height) * 210;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", (297 - iw) / 2, 0, iw, h);
      host.remove();
      const name = p.code + "-OrgChart-" + (km ? "KH" : "EN") + ".pdf", url = URL.createObjectURL(pdf.output("blob"));
      openModal(name, `<iframe class="pdf" src="${url}" title="PDF preview"></iframe><div class="form-actions"><a class="btn primary" href="${url}" download="${esc(name)}">${km ? "ទាញយក" : "Download"} ${esc(name)}</a><button class="btn" data-act="${act(modalBack)}">${km ? "បិទ" : "Close"}</button></div>`);
      try { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* the button above still works */ }
    } catch (err) { host.remove(); toast(err.message || String(err), true); }
  }
  function openProjectOrg(p) {
    openModal("Org chart · " + p.code, `<p class="muted small">${esc(p.name)} · made from the team assigned in Manage team. Tap a person to see details.</p>${orgChartHtml(projectOrgData(p))}
      <div class="form-actions">${canManageProject(me()) ? btn("Manage team", () => manageTeam(p)) : ""}${btn("PDF English", () => orgChartPdf(p, "en"), "primary")}${btn("PDF ខ្មែរ", () => orgChartPdf(p, "km"), "primary")}</div>`, (m) => m.querySelector(".modal").classList.add("wide"));
  }

  SCREENS.people = (u) => {
    const rows = staffNow().filter((s) => matchSearch(s, ["name", "title", "phone"]));
    const t = tabs("people", [["chart", "Org chart"], ["list", "List"]]);
    let content;
    if (t.cur === "chart") content = rows.length ? `<section class="card occard">${companyOrg((s) => rows.includes(s))}</section>` : '<div class="empty">No one matches.</div>';
    else {
      const top = rows.filter((s) => orgDeptOf(s) === "EXEC");
      const depts = [["EXEC", "Managing Director"]].concat(ORG_DEPTS).map(([k, label]) => { const list = (k === "EXEC" ? top : rows.filter((s) => orgDeptOf(s) === k)); const ordered = k === "EXEC" ? list : [].concat(...orgRows(list, k));
        return ordered.length ? `<section class="card"><h2>${esc(label)} <span class="count">${ordered.length}</span></h2><ul class="people">${ordered.map((s) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>${esc(s.title)}${groupsOf(s).length > 1 ? " · also " + esc(groupsOf(s).slice(1).map((x) => GROUPS[x]).join(", ")) : ""}</small></li>`).join("")}</ul></section>` : ""; }).join("");
      content = `<div class="grid2">${depts}</div>`;
    }
    const former = db.staff.filter((s) => s.left_on);
    if (t.cur === "list" && former.length && canManageStaff(u)) content += `<section class="card"><h2>Former staff <span class="count">${former.length}</span></h2><ul class="people">${former.map((s) => `<li data-act="${act(() => openPerson(s))}">${avatar(s)}<b>${esc(s.name)}</b><small>${esc(s.title)} · left ${esc(fmtDate(s.left_on))}</small></li>`).join("")}</ul></section>`;
    return `<h1>People</h1><p class="muted">${staffNow().length} staff. HR owner: ${esc(withTag("HR").map((s) => s.name).join(", "))}.</p>${t.html}${toolbar(u, { project: false, buttons: canManageStaff(u) ? btn("Add staff", () => staffForm(null), "primary") : "" })}${content}`;
  };

  // ---------- DASHBOARD ----------
  const SVGI = {
    back: '<path d="M15 18l-6-6 6-6"/>',
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

  const monthKeys = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i)); return d.toISOString().slice(0, 7); });
  const monthLabel = (k) => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" });

  SCREENS.dashboard = (u) => {
    const projs = myProjects(u), pids = new Set(projs.map((p) => p.id));
    const pend = db.requests.filter((r) => r.status === "Pending" && (!r.project_id || pids.has(r.project_id)));
    const aged = pend.filter((r) => waitDays(r) > 2);
    const mc = db.monthly_costs.filter((m) => pids.has(m.project_id));
    const keys = monthKeys(12), thisM = keys[11], lastM = keys[10];
    const spentM = (k) => sum(mc.filter((m) => m.month === k), (m) => m.spent);
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
    const sp = raw((m) => m.spent), bl = raw((m) => m.billed);
    const series = [{ name: "Spent", color: "var(--s1)", values: mode === "run" ? run(sp) : sp }, { name: "Billed to clients", color: "var(--s2)", values: mode === "run" ? run(bl) : bl }];
    AFTER.push(() => { const el = $("#dline"); if (el) lineChart(el, ks.map(monthLabel), series, money); });
    const segBtn = (key, val, label) => `<button class="${(state.tab[key] || (key === "dashLine" ? "run" : "6")) === val ? "on" : ""}" data-act="${act(() => { state.tab[key] = val; render(); })}">${label}</button>`;

    // Recent requests
    const recent = db.requests.filter((r) => !r.project_id || pids.has(r.project_id)).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const stCls = (r) => (r.status === "Pending" ? "st-wait" : r.status === "Approved" ? (db.purchase_orders.some((p) => p.request_id === r.id) ? "st-po" : "st-ok") : "st-bad");
    const stTxt = (r) => (r.status === "Pending" ? "Waiting · " + (r.steps[r.step_index] || {}).role : r.status === "Approved" && db.purchase_orders.some((p) => p.request_id === r.id) ? "PO " + db.purchase_orders.find((p) => p.request_id === r.id).status.toLowerCase() : r.status);
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
        <section class="card c8">${head("Projects", "projects")}${pcards}</section>
        ${svrAccess(u) ? svrDashCard() : ""}
        <section class="card c4">${head("Checks for the MD", null)}${checks}</section>
      </div>`;
  };

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
    AFTER.push(() => document.querySelectorAll("[data-perm]").forEach((el) => el.addEventListener("change", () => { const [m, g] = el.dataset.perm.split("|"); permDraft[m][g] = el.value; render(); })));
    return `<section class="card"><div class="card-head"><h2>Permissions by user group</h2>${editable ? `<div class="quick">
        ${changed.length ? btn("Undo", () => { permDraft = null; render(); }) + btn("Save " + changed.length + " change" + (changed.length > 1 ? "s" : ""), () => savePerms(u, changed), "primary") : ""}
        ${!changed.length && diffStd ? btn("Back to standard", () => confirmAction("Back to the standard permissions", [{ name: "ok", label: "Type STANDARD to undo all " + diffStd + " custom settings", required: true }], async (v) => { if (String(v.ok).trim().toUpperCase() !== "STANDARD") throw new Error("Type STANDARD to confirm."); permDraft = JSON.parse(JSON.stringify(PERMS_STANDARD)); const ch = []; for (const m of Object.keys(cur)) for (const g of Object.keys(GROUPS)) if (permDraft[m][g] !== cur[m][g]) ch.push([m, g, cur[m][g], permDraft[m][g]]); await savePerms(u, ch, true); }, "Reset"), "danger") : ""}</div>` : ""}</div>
      <p class="muted small">${editable ? "Choose what each group can do in each module, then save. Changes apply to everyone straight away and are recorded in the activity log." : "Only the MD and the system administrator can change these."}
        ${ps ? " Last changed by " + esc(staffName(ps.updated_by)) + " on " + fmtDate(ps.updated_at) + "." : ""} ${diffStd ? `<b>${diffStd}</b> setting${diffStd > 1 ? "s differ" : " differs"} from the standard (outlined).` : "All settings are standard."}</p>
      <div class="scroll"><table class="list matrix perm"><thead><tr><th>Module</th>${Object.keys(GROUPS).map((g) => `<th>${esc(GROUPS[g])}</th>`).join("")}</tr></thead><tbody>
        ${Object.keys(cur).map((m) => `<tr><td><b>${esc(MODULE_NAMES[m] || m)}</b></td>${Object.keys(GROUPS).map((g) => cell(m, g)).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="lvkey">${LEVELS.map((l) => `<span><b class="lv-${l}">${l}</b> ${esc(LEVEL_HELP[l])}</span>`).join("")}</div>
      <p class="muted small">Special roles set on a person in People still apply on top of the group (for example HR, Procurement, Document Engineer, QA/QC). The system administrator always has full access. Approval routes follow the job roles (PM, QS, MD, Procurement, Finance).</p></section>`;
  }
  async function savePerms(u, changed, reset) {
    const value = JSON.parse(JSON.stringify(permDraft)), ps = permSetting();
    const row = { key: "permissions", value, updated_by: u.id, updated_at: nowIso() };
    if (ps) await Store.update("app_settings", ps.id, row); else await Store.insert("app_settings", Object.assign({ id: "permissions" }, row));
    for (const [m, g, a, b] of changed) await log("Permission change", "app_settings", "permissions", (reset ? "Reset to standard · " : "") + (MODULE_NAMES[m] || m) + " · " + GROUPS[g] + ": " + a + " → " + b);
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
    if (db_ && !tgStatus.checked) AFTER.push(() => loadTelegramStatus().then(() => { if (state.route === "admin" && !$("#modal")) render(); }));
    const linkedN = staffNow().filter((s) => String(s.telegram_chat_id || "").trim()).length;
    const notLinked = staffNow().filter((s) => !String(s.telegram_chat_id || "").trim()).map((s) => s.name);
    const row = (ok, t, sub) => `<li class="${ok === true ? "ok" : ok === false ? "no" : "wait"}"><i>${ok === true ? "✓" : ok === false ? "✕" : "…"}</i><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</span></li>`;
    return `<section class="card"><div class="card-head"><h2>System health</h2>${db_ ? btn("Check again", async () => { tgStatus.checked = false; await loadTelegramStatus(); render(); }) : ""}</div><ul class="tg-check">
      ${row(db_, db_ ? "Shared database connected" : "Shared database not connected", db_ ? "Everyone using this link sees the same data." : "config.js has no Supabase details, so data stays on each device and Telegram cannot send. SETUP.md, Steps 1 to 4.")}
      ${!db_ ? row(null, "Telegram bot", "Checked after the database is connected") : !tgStatus.checked ? row(null, "Telegram bot", "Checking…") : tgStatus.missing ? row(false, "Telegram part missing in the database", "Run the new supabase/schema.sql, then telegram-setup.sql.") : tgStatus.ready ? row(true, "Telegram bot ready", "@" + esc(String(tgStatus.bot || "").replace(/^@/, ""))) : row(false, "Telegram bot not set up", "Run supabase/telegram-setup.sql with the token from @BotFather (SETUP.md, Step 5).")}
      ${row(linkedN ? (linkedN === staffNow().length ? true : null) : false, linkedN + " of " + staffNow().length + " staff linked to Telegram", notLinked.length ? "Not linked yet: " + esc(notLinked.slice(0, 12).join(", ")) + (notLinked.length > 12 ? " and " + (notLinked.length - 12) + " more" : "") : "Everyone is linked.")}
    </ul></section>`;
  }
  SCREENS.admin = (u) => {
    const audit = db.audit_log.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    const sys = isAdminPage(u);
    return `<h1>Settings</h1><p class="muted">${canManagePerms(u) ? "Control who can see and do what, and check the activity log." : "System settings and activity log."}</p>
      ${isAdminPage(u) ? healthCard() : ""}
      ${permEditor(u)}
      ${sys ? `<section class="card"><h2>Data</h2><p>${Store.mode === "supabase" ? "Connected to Supabase. Every change is saved in the online database and everyone using this link sees it." : "Browser demo: data is saved only in this browser on this device. Connect Supabase (see SETUP.md) to share data between people."}</p>
        <div class="quick">${btn("Reset demo data", resetDemo, "danger")}
        ${btn("Download all data (JSON)", () => { const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gid-demo-data-" + today() + ".json"; a.click(); })}</div></section>` : ""}
      <section class="card"><h2>Activity log</h2>${table([{ label: "When", get: (a) => fmtDate(a.at) + ` <small>${new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small>` },
        { label: "Who", get: (a) => esc(staffName(a.actor_id)) }, { label: "Action", get: (a) => esc(a.action) }, { label: "Details", get: (a) => esc(a.summary) }], audit)}</section>`;
  };

  function go(route) { location.hash = "#" + route; }
  function routeFromHash() { const u = me(); const def = can(u, "dashboard", "view") ? "dashboard" : "home"; const r = (location.hash || "").replace(/^#\/?/, "") || def; return SCREENS[r] ? r : def; }

  // Switch person (demo): a window with everyone in org chart order, photos and a search box.
  // (The phone's own drop-down list cannot be coloured reliably, so it is not used.)
  function switchUser(id) { state.user = id; try { localStorage.setItem(LS_KEY + "-user", state.user); } catch (x) { /* ignore */ } state.project = ""; state.search = ""; state.showAll = false; permDraft = null; closeDrawer(); closeAllModals(); render(); }
  function openUserPicker() {
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

  function render() {
    // keep the buttons of an open window or the alerts panel working when the page behind is redrawn
    const keepActs = new Map(); document.querySelectorAll("#modal [data-act], #drawer [data-act]").forEach((el) => { const f = ACTS.get(el.dataset.act); if (f) keepActs.set(el.dataset.act, f); });
    MSTACK.forEach((x) => x.acts.forEach((f, k) => keepActs.set(k, f)));
    ACTS = keepActs; AFTER.length = 0;
    applyUI(uiPref(me()));
    const u = me();
    let route = routeFromHash();
    const mod = (NAV.find((n) => n[0] === route) || [])[2];
    if (route !== "home" && !navVisible(u, mod === undefined ? null : mod)) route = "home";
    state.route = route;
    const pendN = myApprovals(u).length, mods = unreadByModule(u), unread = unreadCount(u);
    const nb = (k, v) => v ? `<span class="nb">${badgeTxt(v)}</span>` : "";
    const navItems = NAV.filter(([, , m]) => navVisible(u, m));
    const nav = navItems.map(([r, label]) =>
      `<a href="#${r}" class="${r === route ? "on" : ""}${mods[r] ? " has-nb" : ""}" data-badge="${r}">${svgI(r)}<span class="nl">${esc(label)}</span>${r === "requests" && pendN && !mods[r] ? `<span class="pill-n" title="Waiting for your approval">${pendN}</span>` : ""}${nb(r, mods[r])}</a>`).join("");
    let body = SCREENS[route](u);
    let title = "", sub = "";
    const m = body.match(/^\s*<h1>([\s\S]*?)<\/h1>(\s*<p class="muted">([\s\S]*?)<\/p>)?/);
    if (m) { title = m[1]; sub = m[3] || ""; body = body.slice(m[0].length); }
    // Phone tab bar: the four most used places plus the full menu
    const has = (r) => navItems.some((n) => n[0] === r);
    const tabs = [has("dashboard") ? ["dashboard", "Dashboard"] : ["home", "My work"], has("requests") ? ["requests", "Requests"] : ["projects", "Projects"], has("daily") ? ["daily", "Reports"] : has("docs") ? ["docs", "Drawings"] : ["home", "My work"]];
    const tabbar = `<nav class="tabbar" aria-label="Quick menu">${tabs.slice(0, 3).map(([r, l]) => `<a href="#${r}" class="${r === route ? "on" : ""}" data-badge="${r}">${svgI(r)}<span>${l}</span>${nb(r, mods[r])}</a>`).join("")}
      <button class="bell-ring" data-badge="all" data-act="${act(() => openDrawer("mine"))}" aria-label="Notifications">${svgI("bell")}<span>Alerts</span>${nb("all", unread)}</button>
      <button data-act="${act(() => document.body.classList.toggle("nav-open"))}" aria-label="Open full menu">${svgI("menu")}<span>Menu</span></button></nav>`;
    $("#app").innerHTML = `<div class="app">
      <aside class="rail" aria-label="Main menu"><a class="logo" href="#" aria-label="GID home"><img src="img/logo-landscape.png" alt="Green In Design · Interior &amp; Exterior"></a>
        <div class="rail-sub"><span class="demo">DEMO</span>${isAdminPage(u) ? `<button class="resetbtn" title="Put the demo back to its starting data" data-act="${act(resetDemo)}">${svgI("reset")}<span>Reset demo</span></button>` : `<span class="rs-name">Management system</span>`}<button class="lockbtn" title="Lock the demo on this device" aria-label="Lock the demo on this device" data-act="${act(() => { if (window.GID_LOCK) window.GID_LOCK(); })}">${svgI("lock")}</button></div>
        <div class="rail-label">Menu</div>
        <nav class="nav">${nav}</nav>
        <button class="me-card" data-act="${act(() => openPerson(u))}" aria-label="My profile">${avatar(u, "av lg")}<span><b>${esc(u.name)}</b><small>${esc(u.title)}</small></span></button></aside>
      <div class="scrim" data-act="${act(() => document.body.classList.remove("nav-open"))}"></div>
      <main class="main">
        <header class="head"><button class="icon menu-btn" aria-label="Open menu" data-act="${act(() => document.body.classList.toggle("nav-open"))}">${svgI("menu")}</button>
          <img class="mlogo" src="img/logo-mark.png" alt="GID">
          <div class="htitle"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
          <div class="tools">
            <div class="gsearch"><label>${svgI("search")}<input id="gq" placeholder="Search projects, POs, drawings, stock" aria-label="Search everything" autocomplete="off"></label><div class="gresults" id="gres" hidden></div></div>
            <button class="icon uibtn" id="uibtn" aria-label="Display: theme and language" title="Theme and language" data-act="${act(openDisplay)}">${svgI(document.documentElement.dataset.theme === "dark" ? "moon" : "sun")}</button>
            <button class="icon bell-ring" id="bell" data-badge="all" aria-label="${unread} unread notifications" data-act="${act(() => openDrawer("mine"))}">${svgI("bell")}${nb("all", unread)}</button>
            <button type="button" class="who" id="who" title="Demo: switch person to test each role" aria-label="Acting as ${esc(u.name)}. Switch person" data-act="${act(openUserPicker)}">${avatar(u)}<span class="who-t"><b>${esc(u.name)}</b><small>${esc(u.title)}</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
          </div></header>
        <div class="banner"><b>Demo:</b> tap your name at the top to switch person and test each role</div>
        ${body}
      </main>${tabbar}</div>`;
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
    setTabBadge(unread);
    AFTER.forEach((f) => f());
    translateNow();
  }
  document.documentElement.dataset.skin = "glass";

  window.addEventListener("hashchange", () => { state.search = ""; closeAllModals(); render(); });

  // The app and its data load in the background while the passkey screen is open; screens appear once it is unlocked
  const gateOpen = () => window.GID_GATE || Promise.resolve();
  async function start() {
    try {
      await Store.init();
      await gateOpen();
      if (Store.mode === "supabase" && !db.staff.length) {
        $("#app").innerHTML = `<div class="setup card"><h1>Database is ready</h1><p>Your Supabase tables are empty. Load the demo data (40 staff, 3 demo projects and sample records) to start testing.</p><button class="btn primary" id="load">Load demo data</button></div>`;
        $("#load").onclick = async () => { $("#load").disabled = true; try { await Store.reset(); start(); } catch (e) { toast(e.message, true); $("#load").disabled = false; } };
        return;
      }
      let saved = null; try { saved = localStorage.getItem(LS_KEY + "-user"); } catch (e) { /* ignore */ }
      state.user = byId("staff", saved) ? saved : "s01";
      const deep = /^#open=([a-z_]+):(.+)$/.exec(location.hash || "");
      if (deep) { history.replaceState(null, "", location.pathname + location.search); render(); openRecord(deep[1], decodeURIComponent(deep[2])); return; }
      render();
    } catch (e) {
      await gateOpen();
      $("#app").innerHTML = `<div class="setup card"><h1>Could not start</h1><p>${esc(e.message)}</p><p class="muted">Check config.js and SETUP.md step 3.</p></div>`;
    }
  }
  start();
})();
