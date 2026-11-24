// GID Management System - interface language (English / Khmer)
// The app is written in English. When a person chooses Khmer, every piece of interface text on the screen is
// replaced with its Khmer translation from the dictionary in i18n-km.js. Data people type (names, work done,
// project names) is never changed. To correct a translation, edit i18n-km.js.
(function () {
  const I18N = (window.I18N = window.I18N || {});
  I18N.lang = I18N.lang || "en";
  const KM = () => window.GID_KM || {};
  const PAT = () => window.GID_KM_PATTERNS || [];
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "svg"]);

  // Look a string up in the Khmer dictionary and patterns, whatever language the app is showing.
  // Returns null when there is no translation. Used by the screen translator and by the Khmer PDFs.
  function lookup(text) {
    if (!text) return null;
    const key = String(text).replace(/\s+/g, " ").trim();
    if (!key || !/[A-Za-z]/.test(key)) return null;
    const dict = KM();
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    for (const [re, fn] of PAT()) {
      const m = key.match(re);
      if (m) { const out = typeof fn === "function" ? fn(m, lookup) : key.replace(re, fn); if (out != null) return out; }
    }
    return null;
  }
  // Khmer for a string even when the app is in English (Khmer PDFs). Returns null when the dictionary has no entry.
  // (Some patterns call I18N.t themselves, so Khmer is switched on just for this lookup.)
  I18N.km = function (text) {
    const prev = I18N.lang; I18N.lang = "km";
    try { return lookup(text); } finally { I18N.lang = prev; }
  };
  // Translate one string for the screen. Returns null when there is no translation (the text is left as it is).
  I18N.t = function (text) {
    if (I18N.lang !== "km") return null;
    return lookup(text);
  };
  // Translate a key that may be a fragment ("Pending", "Approved") for use inside patterns
  I18N.tr = (x) => I18N.t(x) || x;

  function skip(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (SKIP.has(e.tagName) || (e.classList && (e.classList.contains("notr") || e.classList.contains("rp-host")))) return true;
      if (e.isContentEditable) return true;
    }
    return false;
  }
  const done = new WeakMap();
  function doText(node) {
    const p = node.parentElement; if (!p || skip(p)) return;
    const raw = node.nodeValue; if (!raw || !raw.trim()) return;
    if (done.get(node) === raw) return; // already translated: do not translate the Khmer result again
    const tr = I18N.t(raw); if (tr == null || tr === raw.trim()) return;
    if (p.tagName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", p.textContent); // keep the saved value in English
    const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + tr + tail; done.set(node, node.nodeValue);
  }
  const ATTRS = ["placeholder", "aria-label", "title", "data-label"];
  function doEl(el) {
    if (skip(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v) { const tr = I18N.t(v); if (tr != null && tr !== v) el.setAttribute(a, tr); } }
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit") && el.value) { const tr = I18N.t(el.value); if (tr != null) el.value = tr; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  let busy = false;
  window.translateNow = function (root) {
    if (I18N.lang !== "km" || busy) return;
    busy = true; try { walk(root || document.body); } finally { busy = false; }
  };
  // New content (pop-ups, messages, lists drawn later) is translated as it appears
  const mo = new MutationObserver((list) => {
    if (I18N.lang !== "km" || busy) return;
    busy = true;
    try { for (const m of list) { if (m.type === "characterData") doText(m.target); else m.addedNodes.forEach(walk); } } finally { busy = false; }
  });
  const start = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
