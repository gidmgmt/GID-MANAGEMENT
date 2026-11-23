/* GID Management System - DEMO
   data.js: table definitions, permissions and demo data.
   The same table list is used to generate supabase/schema.sql, so the app and the database always match. */
(function (root) {
  "use strict";

  // ---------- Tables (column: type). Every table also has id (text) and created_at. ----------
  const TABLES = {
    staff: { name: "text", title: "text", groups: "text", tags: "text", phone: "text", email: "text", telegram_chat_id: "text" },
    projects: { code: "text", name: "text", client: "text", location: "text", pm_id: "text", status: "text",
      start_date: "date", end_date: "date", contract_value: "numeric", budget: "numeric", progress: "numeric", lat: "numeric", lng: "numeric", scopes: "jsonb" },
    project_members: { project_id: "text", staff_id: "text", role: "text" },
    tasks: { project_id: "text", title: "text", assignee_id: "text", due_date: "date", status: "text", priority: "text", created_by: "text" },
    daily_reports: { project_id: "text", report_date: "date", author_id: "text", weather: "text", manpower: "int",
      work_done: "text", issues: "text", photo: "text", status: "text", reviewed_by: "text", kind: "text", photos: "jsonb", entries: "jsonb",
      session: "text", plan: "text", trades: "jsonb", captions: "jsonb", ot_start: "text", ot_end: "text", safety_note: "text", submitted_at: "timestamptz",
      lat: "numeric", lng: "numeric", loc_acc: "numeric", distance_m: "numeric", loc_status: "text", loc_note: "text", late: "boolean", late_minutes: "int" },
    requests: { ref_no: "text", type: "text", project_id: "text", requester_id: "text", title: "text", details: "text",
      amount: "numeric", leave_days: "numeric", needed_by: "date", status: "text", step_index: "int", steps: "jsonb", history: "jsonb", items: "jsonb" },
    suppliers: { name: "text", trade: "text", contact: "text", phone: "text" },
    purchase_orders: { po_no: "text", request_id: "text", project_id: "text", supplier_id: "text", description: "text",
      amount: "numeric", status: "text", delivered_note: "text", delivered_photo: "text", delivered_by: "text",
      delivered_at: "timestamptz", split_flag: "boolean", items: "jsonb" },
    documents: { project_id: "text", doc_no: "text", title: "text", discipline: "text", doc_type: "text", revision: "int",
      status: "text", owner_id: "text", due_date: "date", notes: "text", file_url: "text", file_name: "text", progress: "numeric" },
    cost_lines: { project_id: "text", category: "text", budget: "numeric", actual: "numeric" },
    claims: { project_id: "text", ipc_no: "int", period: "text", claimed: "numeric", certified: "numeric", status: "text", history: "jsonb" },
    invoices: { inv_no: "text", direction: "text", project_id: "text", party: "text", source_type: "text", source_id: "text",
      amount: "numeric", due_date: "date", status: "text", paid_at: "timestamptz" },
    inspections: { project_id: "text", title: "text", area: "text", discipline: "text", inspector_id: "text",
      insp_date: "date", result: "text", notes: "text", evidence: "jsonb", result_evidence: "jsonb", result_note: "text", checked_at: "timestamptz" },
    defects: { project_id: "text", location: "text", description: "text", assigned_to: "text", due_date: "date",
      status: "text", photo: "text", raised_by: "text", discipline: "text", priority: "text", evidence: "jsonb", close_evidence: "jsonb", correction: "text",
      fixed_by: "text", fixed_at: "timestamptz", closed_by: "text", closed_at: "timestamptz", verify_note: "text", inspection_id: "text" },
    safety: { project_id: "text", rec_type: "text", rec_date: "date", description: "text", severity: "text",
      reported_by: "text", status: "text", action: "text", area: "text", evidence: "jsonb", close_evidence: "jsonb", closed_by: "text", closed_at: "timestamptz", correction: "text",
      injury: "text", people_involved: "text", likelihood: "int", consequence: "int", root_cause: "text", preventive: "text", lessons: "text" },
    audit_log: { at: "timestamptz", actor_id: "text", action: "text", tbl: "text", record_id: "text", summary: "text" },
    stores: { name: "text", store_type: "text", project_id: "text", location: "text" },
    stock_items: { code: "text", name: "text", category: "text", unit: "text", min_qty: "numeric", unit_cost: "numeric" },
    stock_moves: { move_date: "date", item_id: "text", store_id: "text", to_store_id: "text", qty: "numeric", move_type: "text",
      project_id: "text", ref: "text", by_id: "text", note: "text" },
    monthly_costs: { project_id: "text", month: "text", spent: "numeric", billed: "numeric" },
    app_settings: { key: "text", value: "jsonb", updated_by: "text", updated_at: "timestamptz" },
    notifications: { to_id: "text", actor_id: "text", title: "text", body: "text", tbl: "text", record_id: "text", read: "boolean", at: "timestamptz" }
  };

  // ---------- User groups (from the 2026 org chart) ----------
  const GROUPS = {
    EXEC: "Executive", PM: "Project management", SITE: "Site team", DESIGN: "Architecture & design",
    ENG: "Engineering & technical", QS: "Quantity surveying", FIN: "Finance", ADMIN: "Administration"
  };

  // ---------- Permission matrix (levels: none, view, own, edit, approve, admin) ----------
  const PERMS = {
    requests:    { EXEC: "admin", PM: "approve", SITE: "own", DESIGN: "own", ENG: "own", QS: "admin", FIN: "approve", ADMIN: "admin" },
    people:      { EXEC: "view", PM: "view", SITE: "own", DESIGN: "own", ENG: "own", QS: "own", FIN: "own", ADMIN: "admin" },
    projects:    { EXEC: "view", PM: "admin", SITE: "edit", DESIGN: "edit", ENG: "edit", QS: "view", FIN: "view", ADMIN: "view" },
    daily:       { EXEC: "view", PM: "approve", SITE: "edit", DESIGN: "edit", ENG: "view", QS: "view", FIN: "none", ADMIN: "none" },
    docs:        { EXEC: "view", PM: "view", SITE: "view", DESIGN: "edit", ENG: "admin", QS: "view", FIN: "none", ADMIN: "none" },
    cost:        { EXEC: "approve", PM: "approve", SITE: "none", DESIGN: "none", ENG: "none", QS: "admin", FIN: "view", ADMIN: "view" },
    procurement: { EXEC: "approve", PM: "view", SITE: "own", DESIGN: "none", ENG: "none", QS: "admin", FIN: "view", ADMIN: "admin" },
    finance:     { EXEC: "approve", PM: "none", SITE: "none", DESIGN: "none", ENG: "none", QS: "view", FIN: "admin", ADMIN: "admin" },
    qaqc:        { EXEC: "view", PM: "approve", SITE: "edit", DESIGN: "view", ENG: "admin", QS: "view", FIN: "none", ADMIN: "none" },
    safety:      { EXEC: "view", PM: "approve", SITE: "edit", DESIGN: "none", ENG: "view", QS: "none", FIN: "none", ADMIN: "view" },
    dashboard:   { EXEC: "admin", PM: "view", SITE: "none", DESIGN: "none", ENG: "none", QS: "admin", FIN: "view", ADMIN: "view" },
    stock:       { EXEC: "view", PM: "approve", SITE: "edit", DESIGN: "none", ENG: "view", QS: "view", FIN: "view", ADMIN: "admin" }
  };

  const APPROVAL_LIMIT = 500; // USD per order: at or above this, the MD must also approve

  // ---------- Demo data ----------
  const day = 86400000;
  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  const ago = (n) => iso(Date.now() - n * day);
  const ahead = (n) => iso(Date.now() + n * day);
  const ts = (n) => new Date(Date.now() - n * day).toISOString();

  function seed() {
    const S = (id, name, title, groups, tags) => ({ id, name, title, groups, tags: tags || "", phone: "", email: "" });
    const staff = [
      S("s01", "Phan Vibol", "Managing Director", "EXEC", "MD"),
      S("s02", "Suos Piseth", "Project Manager", "PM"),
      S("s03", "Kum Sophea", "Project Manager", "PM"),
      S("s04", "Khy Sokhim", "Project Manager", "PM"),
      S("s05", "Chhun Chhay Piseth", "Project Manager", "PM"),
      S("s06", "Eng Phea", "Site Manager", "SITE", "SITEMGR"),
      S("s07", "Se Sothavan", "Senior Site Engineer", "SITE"),
      S("s08", "Kum Sovann", "Senior Site Engineer", "SITE"),
      S("s09", "Chiev Thuna", "Senior Site Engineer", "SITE"),
      S("s10", "Khaun Bunthann", "Senior Site Engineer", "SITE"),
      S("s11", "Chomreon Vathanak", "Site Engineer", "SITE"),
      S("s12", "Kim Keopichmonith", "Site Engineer", "SITE"),
      S("s13", "Yim Chomroen", "Site Engineer", "SITE"),
      S("s14", "Meas Oudom", "Site Engineer", "SITE"),
      S("s15", "Yin Sothearak", "Site Engineer", "SITE"),
      S("s16", "Vay Thuna", "Site Engineer", "SITE"),
      S("s17", "Boeurn Samros", "Site Engineer", "SITE"),
      S("s18", "Sean Pisal", "Senior Architect", "DESIGN", "HEAD"),
      S("s19", "Panha Sakvita", "Senior Architect", "DESIGN"),
      S("s20", "Seng Amatak", "Designer", "DESIGN"),
      S("s21", "Oung Russy", "Designer", "DESIGN"),
      S("s22", "Mach Sophannith", "Designer", "DESIGN"),
      S("s23", "Chhoeurn Sopheap", "Designer", "DESIGN"),
      S("s24", "Mon Bophavatey", "Designer", "DESIGN"),
      S("s25", "Tep Remy", "Designer", "DESIGN"),
      S("s26", "Heng Chhairong", "Intern", "DESIGN"),
      S("s27", "Kong Sreylen", "Intern", "DESIGN"),
      S("s28", "Channa Koemty", "Structural Engineer", "ENG"),
      S("s29", "So Chivo", "MEP Inspector", "ENG", "QAQC"),
      S("s30", "Kry Menglong", "Document Engineer", "ENG", "DOC,BACKUPADMIN"),
      S("s31", "Sovath Sopharith", "Senior Quantity Surveyor", "QS", "HEAD"),
      S("s32", "Roeurn Rada", "IPC Claim", "QS", "QAQC"),
      S("s33", "Hang Sokpanha", "Quantity Surveyor", "QS", "SYSADMIN"),
      S("s34", "Chan Sreypeov", "Finance Manager", "FIN", "HEAD,FINMGR"),
      S("s35", "Taing Sivgech", "Administration", "FIN,ADMIN", "HR"),
      S("s36", "Sou Sophea", "Accountant", "FIN"),
      S("s37", "Moeng Sopheakneath", "Ass. Accountant", "FIN"),
      S("s38", "Phorn Gekseang", "Book Keeping Officer", "FIN"),
      S("s39", "Park Vuthea", "Procurement", "ADMIN", "PROC"),
      S("s40", "Bo Bunheng", "Ass. Admin", "ADMIN")
    ];

    const projects = [
      { id: "p1", code: "DEMO-101", name: "Riverside Office Fit-out", client: "Demo Client A", location: "Phnom Penh",
        pm_id: "s03", status: "Active", start_date: ago(120), end_date: ahead(90), contract_value: 420000, budget: 360000, progress: 45, lat: 11.556, lng: 104.928,
        scopes: [{ scope: "Architecture", weight: 40, progress: 58 }, { scope: "Electrical", weight: 25, progress: 44 }, { scope: "Plumbing", weight: 10, progress: 30 }, { scope: "MVAC", weight: 10, progress: 40 }, { scope: "ELV", weight: 15, progress: 24 }] },
      { id: "p2", code: "DEMO-102", name: "Hotel MEP Upgrade", client: "Demo Client B", location: "Phnom Penh",
        pm_id: "s04", status: "Active", start_date: ago(80), end_date: ahead(160), contract_value: 680000, budget: 590000, progress: 30, lat: 11.575, lng: 104.895,
        scopes: [{ scope: "Electrical", weight: 40, progress: 35 }, { scope: "Plumbing", weight: 20, progress: 30 }, { scope: "HVAC", weight: 25, progress: 28 }, { scope: "ELV", weight: 15, progress: 20 }] },
      { id: "p3", code: "DEMO-103", name: "Bank Branch Renovation", client: "Demo Client C", location: "Siem Reap",
        pm_id: "s05", status: "Active", start_date: ago(150), end_date: ahead(40), contract_value: 250000, budget: 215000, progress: 70, lat: 13.363, lng: 103.856,
        scopes: [{ scope: "Structure", weight: 15, progress: 100 }, { scope: "Architecture", weight: 35, progress: 72 }, { scope: "Landscape", weight: 5, progress: 20 }, { scope: "Electrical", weight: 15, progress: 70 }, { scope: "Plumbing", weight: 10, progress: 75 }, { scope: "MVAC", weight: 5, progress: 60 }, { scope: "HVAC", weight: 10, progress: 55 }, { scope: "ELV", weight: 5, progress: 50 }] },
      { id: "p4", code: "DEMO-104", name: "Resort MEP Works", client: "Demo Client D", location: "Sihanoukville",
        pm_id: "s03", status: "Active", start_date: ago(40), end_date: ahead(240), contract_value: 540000, budget: 470000, progress: 14, lat: 10.627, lng: 103.522,
        scopes: [{ scope: "Electrical", weight: 35, progress: 18 }, { scope: "Plumbing", weight: 20, progress: 15 }, { scope: "MVAC", weight: 10, progress: 10 }, { scope: "HVAC", weight: 25, progress: 12 }, { scope: "ELV", weight: 10, progress: 10 }] },
      { id: "p5", code: "DEMO-105", name: "Warehouse ELV Installation", client: "Demo Client E", location: "Battambang",
        pm_id: "s04", status: "Active", start_date: ago(100), end_date: ahead(30), contract_value: 160000, budget: 138000, progress: 55, lat: 13.095, lng: 103.202,
        scopes: [{ scope: "ELV", weight: 100, progress: 55 }] }
    ];

    let m = 0;
    const M = (project_id, staff_id, role) => ({ id: "m" + (++m), project_id, staff_id, role });
    const project_members = [
      M("p1", "s30", "Document Engineer"), M("p2", "s29", "MEP Inspector"), M("p3", "s28", "Structural Engineer"),
      M("p1", "s07", "Senior Site Engineer"), M("p1", "s11", "Site Engineer"), M("p1", "s12", "Site Engineer"), M("p1", "s13", "Site Engineer"),
      M("p2", "s08", "Senior Site Engineer"), M("p2", "s09", "Senior Site Engineer"), M("p2", "s14", "Site Engineer"), M("p2", "s15", "Site Engineer"),
      M("p3", "s10", "Senior Site Engineer"), M("p3", "s16", "Site Engineer"), M("p3", "s17", "Site Engineer"),
      M("p4", "s13", "Site Engineer"), M("p5", "s15", "Site Engineer"),
      M("p1", "s20", "Designer"), M("p1", "s22", "Designer"), M("p1", "s26", "Intern"), M("p2", "s21", "Designer"), M("p2", "s24", "Designer"),
      M("p2", "s27", "Intern"), M("p3", "s23", "Designer"), M("p4", "s25", "Designer"), M("p5", "s21", "Designer")
    ];

    let t = 0;
    const T = (project_id, title, assignee_id, due, status, priority) =>
      ({ id: "t" + (++t), project_id, title, assignee_id, due_date: due, status, priority, created_by: "s02" });
    const tasks = [
      T("p1", "Ceiling grid level 3 complete", "s11", ahead(5), "In progress", "High"),
      T("p1", "Submit shop drawing for reception counter", "s20", ahead(3), "To do", "Normal"),
      T("p1", "Fire alarm loop test", "s12", ago(2), "To do", "High"),
      T("p2", "Chiller replacement method statement", "s29", ahead(7), "In progress", "High"),
      T("p2", "Riser cable tray installation", "s14", ahead(10), "To do", "Normal"),
      T("p2", "Update MS Project schedule", "s04", ahead(1), "To do", "Normal"),
      T("p3", "Snag walk with client", "s10", ahead(2), "To do", "High"),
      T("p3", "As-built drawings for electrical", "s30", ahead(14), "In progress", "Normal"),
      T("p3", "Signage installation", "s16", ago(5), "Done", "Normal")
    ];

    // Sample site photos (drawn, not real photographs) so the demo has pictures to show
    const photo = (label, v) => {
      const sky = ["#a9cbe8", "#c4dbee", "#f3cfa6", "#b9d6c9"][v % 4], wall = ["#d9d4cb", "#cfd8dc", "#e3d9c6", "#d7d2e0"][v % 4];
      const cols = Array.from({ length: 6 }, (_, i) => `<rect x="${120 + i * 70}" y="${150 - (v % 3) * 20}" width="10" height="${210 + (v % 3) * 20}" fill="#8d8a84"/>`).join("");
      const floors = Array.from({ length: 4 }, (_, i) => `<rect x="110" y="${170 + i * 55 - (v % 3) * 20}" width="370" height="8" fill="#9b968e"/>`).join("");
      const scaf = Array.from({ length: 8 }, (_, i) => `<line x1="${490 + (i % 2) * 30}" y1="${160 + i * 26}" x2="${520 - (i % 2) * 30}" y2="${186 + i * 26}" stroke="#e08a2c" stroke-width="3"/>`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#eef3f6"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><rect y="360" width="640" height="60" fill="#b59f86"/><rect x="100" y="${140 - (v % 3) * 20}" width="390" height="${225 + (v % 3) * 20}" fill="${wall}"/>${floors}${cols}<rect x="488" y="150" width="4" height="215" fill="#e08a2c"/><rect x="518" y="150" width="4" height="215" fill="#e08a2c"/>${scaf}<line x1="60" y1="365" x2="60" y2="40" stroke="#f2b01e" stroke-width="8"/><line x1="40" y1="48" x2="330" y2="48" stroke="#f2b01e" stroke-width="8"/><line x1="${200 + v * 20}" y1="48" x2="${200 + v * 20}" y2="130" stroke="#555" stroke-width="2"/><rect x="${185 + v * 20}" y="130" width="30" height="16" fill="#666"/><rect x="0" y="380" width="640" height="40" fill="rgba(0,0,0,.45)"/><text x="16" y="406" font-family="Arial" font-size="17" fill="#fff">Sample photo · ${label}</text></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    };

    let d = 0;
    const at = (n, hm) => { const x = new Date(Date.now() - n * day); const [h, mi] = hm.split(":"); x.setHours(+h, +mi, 0, 0); return x.toISOString(); };
    const D = (project_id, n, author_id, weather, manpower, work_done, issues, status, photos, extra) => {
      const ph = photos || [];
      return Object.assign({ id: "d" + (++d), kind: "Site", session: "End of day", project_id, report_date: ago(n), author_id, weather, manpower, work_done, issues, photo: "",
        photos: ph.map((x) => x[0]), captions: ph.map((x) => x[1]), entries: [], status, reviewed_by: status === "Reviewed" ? "s06" : "", plan: "", trades: [], ot_start: "", ot_end: "", safety_note: "",
        submitted_at: at(n, "17:05"), loc_status: "On site", distance_m: 18 + (d * 37) % 140, loc_note: "", late: false, late_minutes: 0 }, extra || {});
    };
    const P = (label, v, cap) => [photo(label, v), cap];
    const DS = (n, author_id, entries, note) =>
      ({ id: "d" + (++d), kind: "Design", project_id: "", report_date: ago(n), author_id, weather: "", manpower: 0, work_done: note || "", issues: "", photo: "", photos: [], entries, status: n === 0 ? "Submitted" : "Reviewed", reviewed_by: n === 0 ? "" : "s18" });
    const E = (ref_type, ref_id, label, project_id, hours, progress, note) => ({ ref_type, ref_id, label, project_id, hours, progress, note: note || "" });
    const daily_reports = [
      D("p1", 0, "s11", "Sunny", 24, "Toolbox talk done. Teams on ceiling grid L3 and east wing partitions.", "", "Reviewed", [P("DEMO-101 Morning start L3", 1, "Level 3 at start of work")],
        { session: "Morning", plan: "Ceiling grid level 3 grid lines A-D; start east wing boarding; fire alarm cable L3 corridor.", safety_note: "Toolbox talk 07:30: working at height on scaffold towers, 24 attended.",
          trades: [{ trade: "GID site staff", workers: 3 }, { trade: "Drywall and ceiling (sub.)", workers: 11 }, { trade: "Electrical (sub.)", workers: 7 }, { trade: "Fire alarm (sub.)", workers: 3 }], submitted_at: at(0, "07:42") }),
      D("p1", 0, "s11", "Sunny", 26, "Level 3 ceiling grid: grid lines A-D complete, about 75% of the floor.\nEast wing partition boarding started: 14 of 40 boards fixed.\nFire alarm cable pulling on L3 corridor completed.", "Gypsum board running short for the east wing: 120 more sheets needed by Wednesday.", "Submitted", [P("DEMO-101 Level 3 ceiling grid", 0, "Level 3 ceiling grid"), P("DEMO-101 East wing partitions", 1, "East wing partitions"), P("DEMO-101 Cable pulling", 2, "Fire alarm cable pulling, corridor L3")],
        { plan: "Finish ceiling grid D-F; east wing boarding second side; fire alarm device bases L3.", trades: [{ trade: "GID site staff", workers: 3 }, { trade: "Drywall and ceiling (sub.)", workers: 12 }, { trade: "Electrical (sub.)", workers: 8 }, { trade: "Fire alarm (sub.)", workers: 3 }] }),
      D("p1", 1, "s11", "Sunny", 24, "Level 3 ceiling grid 60% done. Partition boarding east wing.", "Gypsum board delivery late by 1 day.", "Reviewed", [P("DEMO-101 Ceiling grid", 3, "Ceiling grid")]),
      D("p1", 1, "s12", "Sunny", 6, "Fire alarm cable pulling level 3.", "", "Reviewed", []),
      D("p1", 3, "s12", "Rain (afternoon)", 18, "Cable pulling level 3.", "Work stopped 2 hours due to rain.", "Reviewed", []),
      D("p2", 0, "s14", "Cloudy", 33, "Chiller plinth concrete poured. Riser tray floors 6-7.", "Waiting for RFI-007 answer on plinth size.", "Submitted", [P("DEMO-102 Chiller plinth", 2, "Chiller plinth"), P("DEMO-102 Riser tray", 1, "Riser tray")]),
      D("p2", 1, "s14", "Cloudy", 31, "Chiller plinth formwork. Riser tray brackets floors 4-6.", "Need RFI answer on chiller plinth size.", "Reviewed", [P("DEMO-102 Plinth formwork", 0, "Plinth formwork")]),
      D("p2", 1, "s14", "Cloudy", 9, "Riser tray floors 6-7 completed to catch up with programme.", "", "Reviewed", [P("DEMO-102 Overtime riser", 3, "Riser tray floor 7 under work lights")],
        { session: "Overtime", ot_start: "17:30", ot_end: "21:00", plan: "Catch up riser tray before chiller delivery.", trades: [{ trade: "Electrical (sub.)", workers: 8 }, { trade: "GID site staff", workers: 1 }], submitted_at: at(1, "21:10") }),
      D("p2", 2, "s15", "Sunny", 29, "Riser tray brackets floors 2-4.", "", "Reviewed", []),
      D("p3", 0, "s16", "Sunny", 10, "Snag fixing banking hall. Paint touch-ups at columns.", "", "Submitted", [P("DEMO-103 Banking hall", 3, "Banking hall"), P("DEMO-103 Paint touch-up", 2, "Paint touch-up"), P("DEMO-103 ATM lobby", 1, "ATM lobby"), P("DEMO-103 Signage", 0, "Signage")]),
      D("p3", 1, "s16", "Sunny", 12, "Final painting banking hall. Signage fixed.", "", "Reviewed", []),
      D("p3", 2, "s17", "Sunny", 14, "Painting banking hall, ATM lobby lighting.", "", "Reviewed", [], { loc_status: "Away from site", distance_m: 1450, loc_note: "Wrote the report at the office after the site visit" }),
      D("p4", 0, "s13", "Sunny", 15, "", "", "Submitted", [], { session: "Morning", plan: "Plant room sleeves; start chilled water riser brackets.", trades: [{ trade: "GID site staff", workers: 2 }, { trade: "Mechanical (sub.)", workers: 13 }],
        submitted_at: at(0, "09:24"), late: true, late_minutes: 24 }),
      D("p4", 3, "s13", "Sunny", 14, "", "", "Reviewed", [], { session: "Morning", plan: "Setting out plant room.", submitted_at: at(3, "09:12"), late: true, late_minutes: 12 }),
      D("p4", 1, "s13", "Rain (morning)", 15, "Setting out plant room. Sleeves for chilled water pipes.", "Rain delayed start by 2 hours.", "Reviewed", [P("DEMO-104 Plant room setting out", 1, "Plant room setting out")]),
      D("p5", 0, "s15", "Sunny", 8, "CCTV cabling zone B. Access control door 3 and 4.", "", "Submitted", [P("DEMO-105 CCTV cabling", 0, "CCTV cabling")]),
      DS(0, "s20", [E("doc", "doc2", "A-101 rev 2 Level 3 floor plan (markups)", "p1", 3, 100), E("task", "t2", "Shop drawing for reception counter", "p1", 4, 60)], "Client markups on A-101 picked up."),
      DS(0, "s22", [E("doc", "doc3", "A-205 Reception counter details", "p1", 6, 80, "Waiting for review")], ""),
      DS(0, "s24", [E("doc", "doc5", "M-110 Chiller plant layout", "p2", 7, 45)], "Coordinating plinth size with structure."),
      DS(1, "s20", [E("task", "t2", "Shop drawing for reception counter", "p1", 7, 40)], ""),
      DS(1, "s23", [E("doc", "doc9", "SUB-012 Paint colour samples (as-built list)", "p3", 4, 100), E("other", "", "Office: material board update", "", 3, 0)], "")
    ];

    const H = (n, by, action, note) => ({ at: ts(n), by, action, note: note || "" });
    const requests = [
      { id: "r1", ref_no: "REQ-0001", type: "Material", project_id: "p1", requester_id: "s11", title: "Gypsum board 12mm x 120 sheets",
        details: "For level 3 partitions.", amount: 980, leave_days: 0, needed_by: ahead(4), status: "Pending", step_index: 1,
        steps: [{ role: "PM", label: "Project Manager approves" }, { role: "QS", label: "QS checks budget" }, { role: "MD", label: "MD approves (USD 500 or more)" }, { role: "PROC", label: "Procurement issues PO" }],
        history: [H(1, "s11", "Submitted"), H(0.8, "s03", "Approved", "Needed this week")] },
      { id: "r2", ref_no: "REQ-0002", type: "Material", project_id: "p2", requester_id: "s14", title: "Cable tray 300mm x 40 lengths",
        details: "Riser floors 6-9.", amount: 420, leave_days: 0, needed_by: ahead(6), status: "Pending", step_index: 0,
        steps: [{ role: "PM", label: "Project Manager approves" }, { role: "QS", label: "QS checks budget" }, { role: "PROC", label: "Procurement issues PO" }],
        history: [H(0.3, "s14", "Submitted")] },
      { id: "r3", ref_no: "REQ-0003", type: "Payment", project_id: "p3", requester_id: "s05", title: "Painting subcontractor progress payment 2",
        details: "Banking hall and ATM lobby.", amount: 3200, leave_days: 0, needed_by: ahead(3), status: "Pending", step_index: 2,
        steps: [{ role: "PM", label: "Project Manager approves" }, { role: "QS", label: "QS checks budget" }, { role: "MD", label: "MD approves (USD 500 or more)" }, { role: "FIN", label: "Finance pays" }],
        history: [H(3, "s05", "Submitted"), H(2.9, "s01", "Approved", "Requester is the PM, so the MD approved"), H(2, "s31", "Approved", "Within budget")] },
      { id: "r4", ref_no: "REQ-0004", type: "Leave", project_id: "", requester_id: "s21", title: "Annual leave 2 days",
        details: "Family event.", amount: 0, leave_days: 2, needed_by: ahead(9), status: "Pending", step_index: 0,
        steps: [{ role: "HEAD", label: "Line manager approves" }, { role: "HR", label: "HR records" }],
        history: [H(0.5, "s21", "Submitted")] },
      { id: "r5", ref_no: "REQ-0005", type: "Petty cash", project_id: "p1", requester_id: "s07", title: "Site consumables (tape, blades, gloves)",
        details: "", amount: 85, leave_days: 0, needed_by: ahead(1), status: "Approved", step_index: 2,
        steps: [{ role: "PM", label: "Project Manager approves" }, { role: "FIN", label: "Finance pays" }],
        history: [H(6, "s07", "Submitted"), H(5.8, "s03", "Approved"), H(5, "s36", "Approved", "Paid in cash")] },
      { id: "r6", ref_no: "REQ-0006", type: "Material", project_id: "p3", requester_id: "s16", title: "LED downlights x 30",
        details: "ATM lobby.", amount: 360, leave_days: 0, needed_by: ago(5), status: "Approved", step_index: 3,
        steps: [{ role: "PM", label: "Project Manager approves" }, { role: "QS", label: "QS checks budget" }, { role: "PROC", label: "Procurement issues PO" }],
        history: [H(12, "s16", "Submitted"), H(11.5, "s05", "Approved"), H(11, "s32", "Approved"), H(10, "s39", "Approved", "PO-0001 issued")] },
      { id: "r7", ref_no: "REQ-0007", type: "Overtime", project_id: "p2", requester_id: "s15", title: "Overtime Saturday 4 hours",
        details: "Riser tray catch-up.", amount: 0, leave_days: 0, needed_by: ahead(2), status: "Rejected", step_index: 0,
        steps: [{ role: "LINE", label: "Line manager approves (MD and HR informed)" }],
        history: [H(2, "s15", "Submitted"), H(1.5, "s04", "Rejected", "Not needed, tray delivery moved")] }
    ];

    const suppliers = [
      { id: "v1", name: "Demo Building Materials Co.", trade: "Drywall and ceiling", contact: "Sales desk", phone: "" },
      { id: "v2", name: "Demo Electrical Supply", trade: "Cable, tray, lighting", contact: "Sales desk", phone: "" },
      { id: "v3", name: "Demo HVAC Trading", trade: "Chillers, ducting", contact: "Sales desk", phone: "" },
      { id: "v4", name: "Demo Paint House", trade: "Paint and coatings", contact: "Sales desk", phone: "" },
      { id: "v5", name: "Demo Plumbing Parts", trade: "Pipes and fittings", contact: "Sales desk", phone: "" }
    ];

    const purchase_orders = [
      { id: "po1", po_no: "PO-0001", request_id: "r6", project_id: "p3", supplier_id: "v2", description: "LED downlights x 30", amount: 345,
        status: "Delivered", delivered_note: "All 30 received, 1 box dented but OK.", delivered_photo: "", delivered_by: "s16", delivered_at: ts(7), split_flag: false },
      { id: "po2", po_no: "PO-0002", request_id: "", project_id: "p1", supplier_id: "v1", description: "Ceiling grid main tee x 400", amount: 1450,
        status: "Ordered", delivered_note: "", delivered_photo: "", delivered_by: "", delivered_at: null, split_flag: false },
      { id: "po3", po_no: "PO-0003", request_id: "", project_id: "p2", supplier_id: "v3", description: "Flexible duct and clamps", amount: 470,
        status: "Paid", delivered_note: "Received complete.", delivered_photo: "", delivered_by: "s09", delivered_at: ts(20), split_flag: false }
    ];

    let doc = 0;
    const DOC = (project_id, doc_no, title, discipline, doc_type, revision, status, owner_id, due) =>
      ({ id: "doc" + (++doc), project_id, doc_no, title, discipline, doc_type, revision, status, owner_id, due_date: due, notes: "", file_url: "", file_name: "",
        progress: status === "Draft" ? 40 : status === "In review" ? 80 : 100 });
    const documents = [
      DOC("p1", "A-101", "Level 3 floor plan", "Architecture", "Drawing", 1, "Superseded", "s20", ago(30)),
      DOC("p1", "A-101", "Level 3 floor plan", "Architecture", "Drawing", 2, "Issued", "s20", ago(10)),
      DOC("p1", "A-205", "Reception counter details", "Interior", "Drawing", 0, "In review", "s22", ahead(3)),
      DOC("p1", "E-301", "Level 3 lighting layout", "Electrical", "Drawing", 1, "Issued", "s29", ago(12)),
      DOC("p2", "M-110", "Chiller plant layout", "Mechanical", "Drawing", 0, "Draft", "s24", ahead(6)),
      DOC("p2", "RFI-007", "Chiller plinth dimensions", "Mechanical", "RFI", 0, "In review", "s30", ahead(2)),
      DOC("p2", "S-020", "Chiller plinth reinforcement", "Structure", "Drawing", 0, "Approved", "s28", ago(1)),
      DOC("p3", "E-401", "As-built electrical", "Electrical", "Drawing", 0, "Draft", "s30", ahead(14)),
      DOC("p3", "SUB-012", "Paint colour samples", "Interior", "Submittal", 0, "Issued", "s23", ago(25))
    ];

    let c = 0;
    const CL = (project_id, category, budget, actual) => ({ id: "c" + (++c), project_id, category, budget, actual });
    const cost_lines = [
      CL("p1", "Drywall and ceiling", 95000, 51000), CL("p1", "Electrical", 82000, 30500), CL("p1", "Fire protection", 40000, 12000),
      CL("p1", "Finishes", 88000, 22000), CL("p1", "Labour and preliminaries", 55000, 31000),
      CL("p2", "Chillers and HVAC", 310000, 70000), CL("p2", "Electrical", 150000, 52000), CL("p2", "Plumbing", 70000, 21000),
      CL("p2", "Labour and preliminaries", 60000, 24000),
      CL("p3", "Civil and finishes", 90000, 79000), CL("p3", "Electrical", 60000, 51000), CL("p3", "Security and ELV", 35000, 28000),
      CL("p3", "Labour and preliminaries", 30000, 24500),
      CL("p4", "Chillers and HVAC", 220000, 28000), CL("p4", "Electrical", 150000, 21000), CL("p4", "Plumbing", 60000, 6500), CL("p4", "Labour and preliminaries", 40000, 9000),
      CL("p5", "Security and ELV", 70000, 41000), CL("p5", "Electrical", 45000, 26000), CL("p5", "Labour and preliminaries", 23000, 12500)
    ];

    // Monthly cost snapshots (entered by QS each month) for the line chart
    const monthly_costs = [];
    const monthKey = (back) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return d.toISOString().slice(0, 7); };
    projects.forEach((p, pi) => {
      const total = cost_lines.filter((c) => c.project_id === p.id).reduce((a, c) => a + c.actual, 0);
      const started = Math.max(1, Math.min(11, Math.ceil((Date.now() - new Date(p.start_date)) / (30 * day))));
      const weights = Array.from({ length: started }, (_, i) => 0.7 + ((i * 7 + pi * 3) % 5) * 0.15);
      const wsum = weights.reduce((a, b) => a + b, 0);
      weights.forEach((w, i) => {
        const back = started - 1 - i;
        const spent = Math.round((total * w) / wsum / 100) * 100;
        const billed = i % 2 === 1 ? Math.round((spent * 2.3) / 100) * 100 : 0;
        monthly_costs.push({ id: "mc" + p.id + "-" + back, project_id: p.id, month: monthKey(back), spent, billed });
      });
    });

    // Stock: stores, items and movements (stock level = sum of movements)
    const stores = [
      { id: "st1", name: "Main store, Phnom Penh", store_type: "Main", project_id: "", location: "Phnom Penh" },
      { id: "st2", name: "Site store DEMO-101", store_type: "Site", project_id: "p1", location: "Phnom Penh" },
      { id: "st3", name: "Site store DEMO-102", store_type: "Site", project_id: "p2", location: "Phnom Penh" },
      { id: "st4", name: "Site store DEMO-103", store_type: "Site", project_id: "p3", location: "Siem Reap" }
    ];
    const I = (id, code, name, category, unit, min_qty, unit_cost) => ({ id, code, name, category, unit, min_qty, unit_cost });
    const stock_items = [
      I("k1", "CW-025", "THHN wire 2.5 mm²", "Cable and wire", "roll", 20, 38), I("k2", "CW-060", "Earth cable 6 mm²", "Cable and wire", "roll", 10, 85),
      I("k3", "CW-CAT6", "CAT6 network cable", "Cable and wire", "box", 8, 120), I("k4", "CW-TRY3", "Cable tray 300 mm", "Cable and wire", "length", 20, 22),
      I("k5", "PF-PPR25", "PPR elbow 25 mm", "Pipes and fittings", "pc", 100, 0.8), I("k6", "PF-PVC110", "PVC pipe 110 mm", "Pipes and fittings", "length", 25, 14),
      I("k7", "DC-GB12", "Gypsum board 12 mm", "Drywall and ceiling", "sheet", 150, 7.5), I("k8", "DC-MT", "Ceiling main tee", "Drywall and ceiling", "pc", 300, 3.6),
      I("k9", "DC-CT6", "Cross tee 600", "Drywall and ceiling", "pc", 300, 1.4), I("k10", "DC-SCR25", "Drywall screws 25 mm", "Drywall and ceiling", "box", 30, 6),
      I("k11", "LD-DL12", "LED downlight 12 W", "Lighting and devices", "pc", 30, 11.5), I("k12", "LD-SW1", "1-gang switch", "Lighting and devices", "pc", 50, 2.2),
      I("k13", "FE-SD", "Smoke detector with base", "Fire and ELV", "pc", 25, 18), I("k14", "FE-CAM", "IP dome camera", "Fire and ELV", "pc", 6, 95),
      I("k15", "PT-EMW", "Emulsion paint white 18 L", "Paint and finishes", "bucket", 15, 42), I("k16", "PT-PRM", "Primer 18 L", "Paint and finishes", "bucket", 8, 36)
    ];
    let sm = 0;
    const MV = (n, item_id, store_id, qty, move_type, extra) => Object.assign({ id: "sm" + (++sm), move_date: ago(n), item_id, store_id, to_store_id: "", qty, move_type, project_id: "", ref: "", by_id: "s39", note: "" }, extra || {});
    const stock_moves = [
      MV(60, "k1", "st1", 40, "Receive", { ref: "Opening stock" }), MV(60, "k2", "st1", 18, "Receive", { ref: "Opening stock" }), MV(60, "k3", "st1", 14, "Receive", { ref: "Opening stock" }),
      MV(60, "k4", "st1", 80, "Receive", { ref: "Opening stock" }), MV(60, "k5", "st1", 260, "Receive", { ref: "Opening stock" }), MV(60, "k6", "st1", 60, "Receive", { ref: "Opening stock" }),
      MV(60, "k7", "st1", 300, "Receive", { ref: "Opening stock" }), MV(60, "k8", "st1", 500, "Receive", { ref: "Opening stock" }), MV(60, "k9", "st1", 900, "Receive", { ref: "Opening stock" }),
      MV(60, "k10", "st1", 70, "Receive", { ref: "Opening stock" }), MV(60, "k11", "st1", 60, "Receive", { ref: "Opening stock" }), MV(60, "k12", "st1", 120, "Receive", { ref: "Opening stock" }),
      MV(60, "k13", "st1", 40, "Receive", { ref: "Opening stock" }), MV(60, "k14", "st1", 10, "Receive", { ref: "Opening stock" }), MV(60, "k15", "st1", 30, "Receive", { ref: "Opening stock" }),
      MV(60, "k16", "st1", 14, "Receive", { ref: "Opening stock" }),
      MV(30, "k7", "st1", -180, "Transfer", { to_store_id: "st2", note: "Level 3 partitions" }), MV(30, "k7", "st2", 180, "Transfer", { note: "From main store" }),
      MV(20, "k7", "st2", -150, "Issue", { project_id: "p1", by_id: "s11", note: "Level 3 east wing" }),
      MV(25, "k8", "st1", -260, "Issue", { project_id: "p1", by_id: "s07" }), MV(25, "k9", "st1", -560, "Issue", { project_id: "p1", by_id: "s07" }),
      MV(18, "k1", "st1", -28, "Issue", { project_id: "p2", by_id: "s14", note: "Riser floors 2-6" }), MV(15, "k4", "st1", -55, "Issue", { project_id: "p2", by_id: "s14" }),
      MV(12, "k5", "st1", -190, "Issue", { project_id: "p2", by_id: "s15" }), MV(10, "k11", "st1", -30, "Transfer", { to_store_id: "st4" }), MV(10, "k11", "st4", 30, "Transfer", { note: "ATM lobby" }),
      MV(9, "k11", "st4", -18, "Issue", { project_id: "p3", by_id: "s16" }), MV(8, "k13", "st1", -22, "Issue", { project_id: "p1", by_id: "s12" }),
      MV(7, "k11", "st1", 30, "Receive", { ref: "PO-0001", by_id: "s16", note: "Delivered to site" }), MV(7, "k11", "st1", -30, "Transfer", { to_store_id: "st4" }), MV(7, "k11", "st4", 30, "Transfer"),
      MV(6, "k10", "st1", -38, "Issue", { project_id: "p1", by_id: "s11" }), MV(5, "k15", "st1", -12, "Issue", { project_id: "p3", by_id: "s17" }),
      MV(4, "k3", "st1", -9, "Issue", { project_id: "p2", by_id: "s09" }), MV(3, "k6", "st1", -14, "Issue", { project_id: "p2", by_id: "s14" })
    ];

    const claims = [
      { id: "ipc1", project_id: "p1", ipc_no: 1, period: "Aug 2026", claimed: 84000, certified: 80000, status: "Paid", history: [H(90, "s32", "Created")] },
      { id: "ipc2", project_id: "p1", ipc_no: 2, period: "Oct 2026", claimed: 105000, certified: 0, status: "QS checked", history: [H(10, "s32", "Created"), H(8, "s31", "QS checked")] },
      { id: "ipc3", project_id: "p2", ipc_no: 1, period: "Oct 2026", claimed: 150000, certified: 142000, status: "Invoiced", history: [H(25, "s32", "Created")] },
      { id: "ipc4", project_id: "p3", ipc_no: 3, period: "Oct 2026", claimed: 60000, certified: 0, status: "Draft", history: [H(3, "s32", "Created")] }
    ];

    const invoices = [
      { id: "inv1", inv_no: "AR-0001", direction: "Receivable", project_id: "p1", party: "Demo Client A", source_type: "claim", source_id: "ipc1",
        amount: 80000, due_date: ago(60), status: "Paid", paid_at: ts(55) },
      { id: "inv2", inv_no: "AR-0002", direction: "Receivable", project_id: "p2", party: "Demo Client B", source_type: "claim", source_id: "ipc3",
        amount: 142000, due_date: ahead(5), status: "Unpaid", paid_at: null },
      { id: "inv3", inv_no: "AP-0001", direction: "Payable", project_id: "p3", party: "Demo Electrical Supply", source_type: "po", source_id: "po1",
        amount: 345, due_date: ahead(7), status: "Unpaid", paid_at: null },
      { id: "inv4", inv_no: "AP-0002", direction: "Payable", project_id: "p2", party: "Demo HVAC Trading", source_type: "po", source_id: "po3",
        amount: 470, due_date: ago(10), status: "Paid", paid_at: ts(12) }
    ];

    const EV = (label, v) => [{ type: "image", name: label.replace(/\W+/g, "-").toLowerCase() + ".jpg", url: photo(label, v) }];
    const inspections = [
      { id: "i1", project_id: "p1", title: "Fire alarm devices level 3", area: "Level 3", discipline: "Fire", inspector_id: "s29", insp_date: ago(4), result: "Failed", notes: "Check detector bases, cabling and labels against drawing FA-301.",
        evidence: EV("Inspection · fire alarm L3", 0), result_note: "3 detectors missing bases. Defect raised.", result_evidence: EV("Missing detector bases", 1), checked_at: ts(4) },
      { id: "i2", project_id: "p2", title: "Riser tray supports floors 2-4", area: "Riser", discipline: "Electrical", inspector_id: "s32", insp_date: ago(2), result: "Passed", notes: "Support spacing 1.5 m max; earth bonding.",
        evidence: EV("Inspection · riser trays", 2), result_note: "All supports at spacing; bonding complete.", result_evidence: EV("Riser trays passed", 3), checked_at: ts(2) },
      { id: "i3", project_id: "p3", title: "Banking hall finishes", area: "Ground floor", discipline: "Architecture", inspector_id: "s31", insp_date: ahead(1), result: "Open", notes: "Pre-handover walk.", evidence: EV("Banking hall before walk", 0), result_evidence: [] }
    ];

    const defects = [
      { id: "f1", project_id: "p1", location: "Level 3 corridor", description: "Smoke detector base missing (3 nos)", discipline: "Fire", priority: "High", assigned_to: "s12", due_date: ahead(2), status: "Open", photo: "", raised_by: "s29", inspection_id: "i1",
        evidence: EV("Detector base missing", 1), close_evidence: [] },
      { id: "f2", project_id: "p3", location: "Banking hall", description: "Paint touch-up at column C4", discipline: "Architecture", priority: "Low", assigned_to: "s16", due_date: ahead(1), status: "Fixed", photo: "", raised_by: "s05",
        evidence: EV("Paint damage column C4", 2), correction: "Sanded, primed and two coats applied to match.", close_evidence: EV("Column C4 repainted", 3), fixed_by: "s16", fixed_at: ts(0.5) },
      { id: "f3", project_id: "p3", location: "ATM lobby", description: "Downlight flickering", discipline: "Electrical", priority: "Medium", assigned_to: "s17", due_date: ago(1), status: "Open", photo: "", raised_by: "s33",
        evidence: EV("Downlight flickering ATM lobby", 0), close_evidence: [] },
      { id: "f4", project_id: "p2", location: "Floor 4 riser", description: "Tray cover not fixed", discipline: "Electrical", priority: "Medium", assigned_to: "s14", due_date: ahead(4), status: "Closed", photo: "", raised_by: "s32",
        evidence: EV("Tray cover missing", 3), correction: "Covers fixed with all screws.", close_evidence: EV("Tray covers fixed", 2), fixed_by: "s14", fixed_at: ts(3), closed_by: "s32", closed_at: ts(2), verify_note: "Checked on site, OK." }
    ];

    const safety = [
      { id: "sf1", project_id: "p1", rec_type: "Toolbox talk", rec_date: ago(1), description: "Working at height on scaffold towers", severity: "Low", reported_by: "s07", status: "Closed", action: "24 workers attended", area: "Level 3", evidence: [{ type: "image", name: "toolbox-talk.jpg", url: photo("Toolbox talk 07:30 · 24 workers", 1) }] },
      { id: "sf2", project_id: "p2", rec_type: "Near miss", rec_date: ago(3), description: "Unsecured duct section fell from 2 m", severity: "High", reported_by: "s09", status: "Open", action: "Area barricaded; rigging crew stopped", area: "Plant room, level B1", injury: "None", people_involved: "2 riggers (MEP sub.)", likelihood: 3, consequence: 4, root_cause: "Temporary support removed before the permanent bracket was fixed", evidence: [{ type: "image", name: "near-miss.jpg", url: photo("Near miss · duct support missing", 2) }], correction: "" },
      { id: "sf3", project_id: "p3", rec_type: "Inspection", rec_date: ago(6), description: "Weekly PPE and housekeeping check", severity: "Low", reported_by: "s10", status: "Closed", action: "", area: "Whole site", evidence: [{ type: "image", name: "ppe-check.jpg", url: photo("Weekly PPE check", 3) }] }
    ];

    const audit_log = [
      { id: "a1", at: ts(4), actor_id: "s33", action: "Permission change", tbl: "staff", record_id: "s32", summary: "Added QA/QC tag to Roeurn Rada" }
    ];

    const all = { staff, projects, project_members, tasks, daily_reports, requests, suppliers, purchase_orders, documents,
      cost_lines, claims, invoices, inspections, defects, safety, audit_log, stores, stock_items, stock_moves, monthly_costs, app_settings: [], notifications: [] };
    // A few starting notifications so the bell is not empty in the demo
    let nn = 0;
    const N = (to_id, actor_id, hrs, title, body, tbl, record_id, read) => all.notifications.push({ id: "n" + (++nn), to_id, actor_id, title, body, tbl, record_id, read: !!read, at: new Date(Date.now() - hrs * 3600000).toISOString() });
    N("s01", "s05", 50, "REQ-0003 needs your approval", "Painting subcontractor progress payment 2 · USD 3,200 · DEMO-103", "requests", "r3");
    N("s01", "s11", 0.9, "DEMO-101 end of day report", "Chomreon Vathanak · 26 workers · 3 photos · issue: gypsum board running short", "daily_reports", "d2");
    N("s01", "s09", 70, "High severity near miss on DEMO-102", "Unsecured duct section fell from 2 m", "safety", "sf2");
    N("s01", "s33", 96, "Permission change", "Added QA/QC tag to Roeurn Rada", "staff", "s32", true);
    N("s03", "s11", 0.9, "DEMO-101 end of day report", "Chomreon Vathanak · 26 workers · 3 photos", "daily_reports", "d2");
    N("s03", "s11", 20, "REQ-0001 approved by you, now with QS", "Gypsum board 12mm x 120 sheets", "requests", "r1", true);
    N("s04", "s14", 7, "REQ-0002 needs your approval", "Cable tray 300mm x 40 lengths · USD 420 · DEMO-102", "requests", "r2");
    N("s11", "s03", 19, "REQ-0001 approved by Kum Sophea", "Now waiting for the QS budget check", "requests", "r1");
    N("s39", "s05", 2, "PO-0002 is waiting for delivery", "Ceiling grid main tee x 400 · Demo Building Materials Co.", "purchase_orders", "po2");
    N("s39", "s14", 3, "Stock below minimum: PPR elbow 25 mm", "70 pc left, minimum 100", "stock_items", "k5");
    N("s31", "s03", 19, "REQ-0001 needs your budget check", "Gypsum board 12mm x 120 sheets · USD 980 · DEMO-101", "requests", "r1");
    N("s36", "s16", 168, "PO-0001 delivered: supplier bill ready to pay", "Demo Electrical Supply · USD 345", "invoices", "inv3");
    for (const t of Object.keys(all)) for (const r of all[t]) r.created_at = r.created_at || (r.history && r.history[0] && r.history[0].at) || r.delivered_at || r.at || ts(30);
    return all;
  }

  root.GID = { TABLES, GROUPS, PERMS, APPROVAL_LIMIT, seed };
})(typeof window !== "undefined" ? window : globalThis);
