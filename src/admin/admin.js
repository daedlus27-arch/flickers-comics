/* Flickers Comics staff area.
   Staff sign in with a username and password. Stock is loaded from and published to the staff API
   (the Cloudflare Worker in worker/), which does the GitHub commit. No GitHub token is ever in the browser. */
import { esc, escLines, money, fullTitle, metaLine, slug, coverHTML } from "../shared.mjs";

const app = document.getElementById("app");
const API = (app.dataset.api || "").replace(/\/+$/, "");
const SESSION_KEY = "flickers-staff-session";
const CATEGORIES = [
  { key: "issues", label: "Single Issues", one: "Single issue" },
  { key: "graphic", label: "Graphic Novels", one: "Graphic novel" },
  { key: "tpb", label: "Trade Paperbacks", one: "Trade paperback" },
  { key: "omnibus", label: "Omnibus", one: "Omnibus" },
  { key: "manga", label: "Manga", one: "Manga" },
  { key: "funko", label: "Funko Pops", one: "Funko Pop" }
];
const GRADE_OPTIONS = ["NM+ 9.6", "NM 9.4", "NM− 9.2", "VF 8.0", "FN 6.0", "VG 4.0", "GD 2.0"];
const FIELD_ORDER = ["id", "cat", "title", "num", "vol", "subtitle", "variant", "collects", "pages", "grade", "publisher", "price", "stock", "blurb", "tagline", "badges", "staff", "image"];

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const canon = v => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}`
  : JSON.stringify(v);
const X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

const S = { token: "", exp: 0, user: null, tab: "stock", version: "", orig: [], draft: [], origFeat: [], draftFeat: [], uploads: {}, previews: {}, busy: false, users: [], selected: new Set() };

/* ---------- session ---------- */
const sessionStore = {
  load() { for (const st of [sessionStorage, localStorage]) { try { const v = JSON.parse(st.getItem(SESSION_KEY) || "null"); if (v && v.exp > Date.now() / 1000) return v; } catch (e) { /* none */ } } return null; },
  save(s, remember) { this.clear(); try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* memory only */ } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
};

/* ---------- API ---------- */
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
/* If the session ends while there are unpublished edits, ask for the password again right here
   instead of dropping to the sign in screen and losing the edits. Resolves true once signed back in. */
function reauth() {
  return new Promise(resolve => {
    const dlg = document.createElement("dialog");
    dlg.className = "prompt";
    dlg.setAttribute("aria-labelledby", "reTitle");
    dlg.innerHTML = `<form novalidate><div class="co-head"><h2 class="dialog-title" id="reTitle">Sign in again</h2></div>
      <div class="adm-card-body"><p>Your session ended. Sign in again as <b>${esc(S.user.username)}</b> to keep your unpublished changes.</p>
      <div class="field"><label for="re-pw">Password</label><input id="re-pw" type="password" autocomplete="current-password"></div>
      <p class="form-error" id="re-err" role="alert"></p>
      <div class="ed-actions"><button type="button" class="btn btn-small" id="re-cancel">Give up and sign out</button><button type="submit" class="btn btn-yellow btn-small">Sign in</button></div></div></form>`;
    document.body.appendChild(dlg);
    let done = false;
    const finish = ok => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(ok); };
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); }); // Esc does nothing: the choice must be explicit
    dlg.querySelector("#re-cancel").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault();
      try {
        const res = await fetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: S.user.username, password: dlg.querySelector("#re-pw").value }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { dlg.querySelector("#re-err").textContent = data.error || "That didn't work. Try again."; return; }
        Object.assign(S, { token: data.token, exp: data.exp, user: data.user });
        sessionStore.save({ token: data.token, exp: data.exp, user: data.user }, false);
        finish(true);
      } catch (e) { dlg.querySelector("#re-err").textContent = "Couldn't reach the staff service. Try again."; }
    });
    dlg.showModal();
    dlg.querySelector("#re-pw").focus();
  });
}
async function api(path, opts = {}, retried = false) {
  const { method = "GET", body } = opts;
  let res;
  try {
    res = await fetch(API + path, {
      method, cache: "no-store",
      headers: { ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new ApiError("Couldn't reach the staff service. Check your connection and try again.", 0); }
  let data = {}; try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && S.token) {
      if (!retried && S.user && S.draft.length && changeList().count > 0 && await reauth()) return api(path, opts, true);
      endSession("Your session has ended. Sign in again.");
    }
    throw new ApiError(data.error || `The staff service answered ${res.status}.`, res.status);
  }
  return data;
}

/* ---------- product helpers ---------- */
function cleanProduct(p) {
  const out = {};
  FIELD_ORDER.forEach(k => {
    let v = p[k];
    if (v === undefined || v === null || v === "") return;
    if (k === "badges" && (!Array.isArray(v) || !v.length)) return;
    if (k === "pages") { v = Math.floor(Number(v)); if (!v) return; }
    out[k] = v;
  });
  return out;
}
function changeList() {
  const orig = new Map(S.orig.map(p => [p.id, canon(cleanProduct(p))]));
  const edited = new Set(), added = new Set(), seen = new Set();
  S.draft.forEach(p => {
    seen.add(p.id);
    if (!orig.has(p.id)) added.add(p.id);
    else if (orig.get(p.id) !== canon(cleanProduct(p))) edited.add(p.id);
  });
  const removed = [...orig.keys()].filter(id => !seen.has(id));
  const weekChanged = canon(S.origFeat.slice(0, 3)) !== canon(S.draftFeat.slice(0, 3));
  return { edited, added, removed, weekChanged, count: edited.size + added.size + removed.length + (weekChanged ? 1 : 0) };
}
const uniqueId = base => { let id = base, n = 2; while (S.draft.some(p => p.id === id)) id = `${base}-${n++}`; return id; };
const label = p => fullTitle(p);
function thumb(p) {
  const url = p.image && S.previews[p.image];
  if (url) return `<span class="cover${p.stock <= 0 ? " is-sold" : ""}"><img src="${esc(url)}" alt=""></span>`;
  return coverHTML(p, { imgBase: "../" });
}

/* ---------- screens ---------- */
function say(text, kind = "", actions = []) {
  const el = $("aMsg"); if (!el) return;
  el.className = "admin-msg" + (kind ? " " + kind : "");
  el.innerHTML = text ? `<span>${esc(text)}</span>` : "";
  actions.forEach(a => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-small" + (a.danger ? " btn-danger" : ""); b.textContent = a.label;
    b.addEventListener("click", a.fn);
    el.appendChild(b);
  });
}

function showLogin(message = "") {
  app.innerHTML = `<div class="adm-wrap"><form class="adm-card" id="loginForm" novalidate>
    <h1>Staff sign in</h1>
    <div class="adm-card-body">
      <div class="field"><label for="u">Username</label><input id="u" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
      <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"></div>
      <label class="check"><input type="checkbox" id="remember"> Keep me signed in on this computer</label>
      <p class="hint">Leave this unticked on a shared computer. Ask the shop owner if you need an account or a new password.</p>
      <p class="form-error" id="loginError" role="alert">${esc(message)}</p>
      <button type="submit" class="btn btn-yellow" id="loginBtn">Sign in</button>
    </div></form></div>`;
  $("u").focus();
  $("loginForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const btn = $("loginBtn"); $("loginError").textContent = "";
    if (!$("u").value.trim() || !$("pw").value) { $("loginError").textContent = "Enter your username and password."; return; }
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const r = await api("/login", { method: "POST", body: { username: $("u").value, password: $("pw").value, remember: $("remember").checked } });
      Object.assign(S, { token: r.token, exp: r.exp, user: r.user });
      sessionStore.save({ token: r.token, exp: r.exp, user: r.user }, $("remember").checked);
      await startApp();
    } catch (e) {
      $("loginError").textContent = e.message;
      btn.disabled = false; btn.textContent = "Sign in";
      $("pw").value = ""; $("pw").focus();
    }
  });
}

function showNotConfigured() {
  app.innerHTML = `<div class="adm-wrap"><div class="adm-card"><h1>Not set up yet</h1><div class="adm-card-body">
    <p>Staff logins aren't switched on for this site yet. The shop owner needs to deploy the staff service and put its address in <code>data/config.json</code> (<code>adminApi</code>).</p>
    <p class="hint">Step by step instructions are in <code>docs/SETUP.md</code> in the repository.</p></div></div></div>`;
}

function endSession(message) {
  sessionStore.clear();
  Object.assign(S, { token: "", user: null, orig: [], draft: [], origFeat: [], draftFeat: [], uploads: {}, previews: {} });
  showLogin(message || "");
}

async function startApp() {
  await loadStock();
  renderShell();
}
async function loadStock() {
  const s = await api("/stock");
  S.version = s.version;
  S.orig = clone(s.products); S.draft = clone(s.products);
  S.origFeat = s.featured.slice(); S.draftFeat = s.featured.slice();
  S.selected = new Set();
}

function renderShell() {
  const owner = S.user.role === "owner";
  app.innerHTML = `<div class="adm-wrap">
    <div class="adm-top">
      <h1>Shop manager</h1>
      <div class="adm-who"><span>Signed in as <b>${esc(S.user.username)}</b>${owner ? " (owner)" : ""}</span><button type="button" class="link-btn" id="signOut">Sign out</button></div>
    </div>
    <div class="adm-tabs" role="tablist" aria-label="Staff area">
      <button type="button" class="adm-tab" role="tab" data-tab="stock" aria-selected="${S.tab === "stock"}">Stock</button>
      <button type="button" class="adm-tab" role="tab" data-tab="orders" aria-selected="${S.tab === "orders"}">Orders</button>
      ${owner ? `<button type="button" class="adm-tab" role="tab" data-tab="staff" aria-selected="${S.tab === "staff"}">Staff</button>` : ""}
      <button type="button" class="adm-tab" role="tab" data-tab="account" aria-selected="${S.tab === "account"}">My password</button>
    </div>
    <div class="adm-panel" id="panel" role="tabpanel"></div>
  </div>
  <dialog class="editor" id="editDlg" aria-labelledby="edTitle"></dialog>
  <dialog class="prompt" id="bulkDlg" aria-labelledby="bulkTitle"></dialog>`;
  $("signOut").addEventListener("click", askSignOut);
  app.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", async () => {
    S.tab = b.dataset.tab;
    if (S.tab === "stock" && S.draft.length && changeList().count === 0) { try { await loadStock(); } catch (e) { /* show what we already have */ } } // pick up stock that orders have used
    renderShell();
  }));
  $("editDlg").addEventListener("click", ev => { if (ev.target === $("editDlg")) $("editDlg").close(); });
  if (S.tab === "stock") renderStock();
  else if (S.tab === "orders") renderOrders();
  else if (S.tab === "staff" && owner) renderStaff();
  else { S.tab = "account"; renderAccount(); }
}
function askSignOut() {
  if (changeList().count > 0 && S.tab === "stock") {
    say("You have unpublished changes. Signing out throws them away.", "error", [{ label: "Sign out anyway", danger: true, fn: () => endSession("Signed out.") }, { label: "Keep editing", fn: () => say("") }]);
  } else endSession("Signed out.");
}

/* ---------- stock tab ---------- */
function renderStock() {
  $("panel").innerHTML = `
    <div class="admin-bar">
      <label class="search"><span class="sr-only">Search stock</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="aQ" placeholder="Search stock" autocomplete="off"></label>
      <button type="button" class="btn btn-small" id="aAdd">+ Add item</button>
      <div class="admin-publish">
        <span class="admin-changes" id="aChanges">No unpublished changes</span>
        <button type="button" class="link-btn" id="aDiscard" hidden>Discard</button>
        <button type="button" class="link-btn" id="aRefresh">Refresh stock</button>
        <button type="button" class="btn btn-yellow btn-small" id="aPublish" disabled>Publish changes</button>
      </div>
    </div>
    <div class="admin-msg" id="aMsg" role="status"></div>
    <div class="bulk-bar" id="bulkBar" role="region" aria-label="Edit the selected comics" hidden>
      <b id="bulkCount">0 selected</b>
      <button type="button" class="btn btn-small" data-bulk="price">Set price</button>
      <button type="button" class="btn btn-small" data-bulk="adjust">Raise or lower price</button>
      <button type="button" class="btn btn-small" data-bulk="stock">Set stock</button>
      <button type="button" class="btn btn-small btn-danger" data-bulk="delete">Delete</button>
      <button type="button" class="link-btn" data-bulk="clear">Clear selection</button>
    </div>
    <div class="list-head">
      <label class="check"><input type="checkbox" id="selAll"><span id="selAllLabel">Select all</span></label>
      <label class="list-pick">Show <select id="aFilter" class="admin-select">
        <option value="all">Everything</option><option value="low">Low stock (1 or 2 left)</option><option value="sold">Sold out</option><option value="changed">Unpublished changes</option>
      </select></label>
      <label class="list-pick">Sort <select id="aSort" class="admin-select">
        <option value="shop">Shop order</option><option value="title">Title A to Z</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="stock-asc">Stock, fewest first</option>
      </select></label>
      <span class="hint" id="aShowing" aria-live="polite"></span>
    </div>
    <p class="hint list-tip">Tip: tick one comic, then hold Shift and tick another to select everything between.</p>
    <div id="aList"></div>`;
  $("aQ").addEventListener("input", renderList);
  $("aFilter").addEventListener("change", renderList);
  $("aSort").addEventListener("change", renderList);
  $("selAll").addEventListener("change", () => {
    const vis = visibleList();
    if ($("selAll").checked) vis.forEach(p => S.selected.add(p.id)); else vis.forEach(p => S.selected.delete(p.id));
    updateSelection();
  });
  $("bulkBar").addEventListener("click", ev => { const b = ev.target.closest("[data-bulk]"); if (b) openBulk(b.dataset.bulk); });
  $("aList").addEventListener("change", ev => {
    const t = ev.target, id = t.dataset.price || t.dataset.stock;
    if (!id) return;
    const p = S.draft.find(x => x.id === id); if (!p) return;
    const n = Number(t.value);
    if (t.value === "" || !Number.isFinite(n) || n < 0 || (t.dataset.stock && !Number.isInteger(n))) {
      t.value = t.dataset.price ? p.price : p.stock;
      say(t.dataset.price ? "Prices must be 0 or more." : "Stock must be a whole number, 0 or more.", "error");
      return;
    }
    if (t.dataset.price) p.price = n; else p.stock = n;
    say(""); updateCounts(); refreshRow(id);
  });
  let anchorId = null; // last ticked comic, for Shift-click ranges
  $("aList").addEventListener("click", ev => {
    const cb = ev.target.closest("[data-sel]");
    if (cb) {
      const id = cb.dataset.sel, on = cb.checked;
      if (ev.shiftKey && anchorId && anchorId !== id) {
        const ids = visibleList().map(p => p.id), a = ids.indexOf(anchorId), z = ids.indexOf(id);
        if (a >= 0 && z >= 0) ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(i => (on ? S.selected.add(i) : S.selected.delete(i)));
      } else if (on) S.selected.add(id); else S.selected.delete(id);
      anchorId = id;
      updateSelection();
      return;
    }
    const b = ev.target.closest("[data-edit]"); if (b) openEditor(b.dataset.edit);
  });
  $("aAdd").addEventListener("click", () => openEditor(null));
  $("aDiscard").addEventListener("click", () => say("Throw away all unpublished changes?", "error", [
    { label: "Discard changes", danger: true, fn: () => { S.draft = clone(S.orig); S.draftFeat = S.origFeat.slice(); S.selected.clear(); renderList(); say("Changes discarded.", "ok"); } },
    { label: "Keep them", fn: () => say("") }
  ]));
  $("aPublish").addEventListener("click", publish);
  $("aRefresh").addEventListener("click", async () => {
    try { await loadStock(); renderList(); say("Stock refreshed. Orders take comics off the shelf automatically.", "ok"); } catch (e) { say(e.message, "error"); }
  });
  renderList();
}
function updateCounts() {
  const c = changeList();
  if (!$("aChanges")) return c;
  $("aChanges").textContent = c.count ? `${c.count} unpublished change${c.count === 1 ? "" : "s"}` : "No unpublished changes";
  $("aChanges").classList.toggle("has", c.count > 0);
  $("aPublish").disabled = c.count === 0 || S.busy;
  $("aDiscard").hidden = c.count === 0;
  if ($("aRefresh")) $("aRefresh").hidden = c.count > 0; // refreshing would throw away unpublished edits
  return c;
}
function rowPills(p, c) {
  const pills = [];
  if (c.added.has(p.id)) pills.push(`<span class="pill pill-added">Added</span>`);
  else if (c.edited.has(p.id)) pills.push(`<span class="pill pill-edit">Edited</span>`);
  if (S.draftFeat.slice(0, 3).includes(p.id)) pills.push(`<span class="pill pill-week">New this week</span>`);
  if (p.stock <= 0) pills.push(`<span class="pill">Sold out</span>`);
  return pills.join("");
}
const STOCK_SORTS = {
  title: (a, b) => label(a).localeCompare(label(b), "en", { numeric: true, sensitivity: "base" }),
  "price-asc": (a, b) => a.price - b.price || label(a).localeCompare(label(b)),
  "price-desc": (a, b) => b.price - a.price || label(a).localeCompare(label(b)),
  "stock-asc": (a, b) => a.stock - b.stock || label(a).localeCompare(label(b))
};
function visibleList() {
  const q = ($("aQ").value || "").trim().toLowerCase(), filter = $("aFilter").value;
  const c = filter === "changed" ? changeList() : null;
  const list = S.draft.filter(p => {
    if (q && ![label(p), p.publisher].join(" ").toLowerCase().includes(q)) return false;
    if (filter === "low") return p.stock >= 1 && p.stock <= 2;
    if (filter === "sold") return p.stock <= 0;
    if (filter === "changed") return c.edited.has(p.id) || c.added.has(p.id);
    return true;
  });
  const sorter = STOCK_SORTS[$("aSort").value];
  return sorter ? list.sort(sorter) : list;
}
function renderList() {
  const c = updateCounts();
  const list = visibleList();
  $("aList").innerHTML = list.length ? list.map(p => {
    const t = label(p);
    return `<div class="arow${S.selected.has(p.id) ? " is-selected" : ""}" data-row="${esc(p.id)}">
      <input type="checkbox" class="arow-sel" data-sel="${esc(p.id)}" aria-label="Select ${esc(t)}"${S.selected.has(p.id) ? " checked" : ""}>
      <div class="arow-thumb">${thumb(p)}</div>
      <div class="arow-info"><p class="arow-title">${esc(t)}</p><p class="arow-meta"><span>${esc(metaLine(p, CATEGORIES))}</span><span class="arow-pills">${rowPills(p, c)}</span></p></div>
      <label class="arow-field arow-price">Price ($)<input type="number" min="0" step="1" inputmode="numeric" data-price="${esc(p.id)}" value="${esc(p.price)}" aria-label="Price of ${esc(t)}"></label>
      <label class="arow-field arow-stock">Stock<input type="number" min="0" step="1" inputmode="numeric" data-stock="${esc(p.id)}" value="${esc(p.stock)}" aria-label="Copies of ${esc(t)} in stock"></label>
      <button type="button" class="btn btn-small arow-edit" data-edit="${esc(p.id)}" aria-label="Edit ${esc(t)}">Edit</button>
    </div>`;
  }).join("") : `<p class="admin-empty">${S.draft.length ? "Nothing matches that search or filter." : "No stock yet. Click “+ Add item” to add the first one."}</p>`;
  const narrowed = list.length !== S.draft.length;
  $("aShowing").textContent = S.draft.length ? (narrowed ? `Showing ${list.length} of ${S.draft.length}` : `${S.draft.length} in stock list`) : "";
  updateSelection();
}

/* ---------- selecting several comics, and editing them together ---------- */
function updateSelection() {
  const have = new Set(S.draft.map(p => p.id));
  S.selected.forEach(id => { if (!have.has(id)) S.selected.delete(id); });
  const vis = visibleList(), ticked = vis.filter(p => S.selected.has(p.id)).length;
  const all = $("selAll");
  all.checked = vis.length > 0 && ticked === vis.length;
  all.indeterminate = ticked > 0 && ticked < vis.length;
  all.disabled = vis.length === 0;
  const narrowed = ($("aQ").value || "").trim() !== "" || $("aFilter").value !== "all";
  $("selAllLabel").textContent = narrowed ? `Select all ${vis.length} matching` : `Select all ${vis.length}`;
  const n = S.selected.size;
  $("bulkBar").hidden = n === 0;
  $("bulkCount").textContent = `${n} selected`;
  $("aList").querySelectorAll(".arow").forEach(row => {
    const on = S.selected.has(row.dataset.row);
    row.classList.toggle("is-selected", on);
    row.querySelector("[data-sel]").checked = on;
  });
}
const selectedItems = () => S.draft.filter(p => S.selected.has(p.id));
const plural = n => `${n} comic${n === 1 ? "" : "s"}`;
const roundPrice = n => Math.max(0, Math.round(n));

function openBulk(mode) {
  if (mode === "clear") { S.selected.clear(); updateSelection(); return; }
  const items = selectedItems(), n = items.length;
  if (!n) return;
  const dlg = $("bulkDlg");
  const head = title => `<div class="co-head"><h2 class="dialog-title" id="bulkTitle">${title}</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close">${X}</button></div>`;
  const foot = (label, danger) => `<p class="form-error" id="bulkError" role="alert"></p><button type="submit" class="btn ${danger ? "btn-danger" : "btn-yellow"} btn-small">${label}</button>`;
  let html, apply;

  if (mode === "price") {
    html = `${head("Set price")}<div class="adm-card-body"><p>Give all <b>${plural(n)}</b> the same price.</p>
      <div class="field"><label for="b-price">New price ($)</label><input id="b-price" type="number" min="0" step="1" inputmode="numeric"></div>${foot("Set price")}</div>`;
    apply = () => {
      const v = Number($("b-price").value);
      if ($("b-price").value === "" || !Number.isFinite(v) || v < 0 || v > 10000000) return { error: "Enter a price of 0 or more." };
      items.forEach(p => { p.price = roundPrice(v); });
      return { done: `Set the price of ${plural(n)} to ${money(roundPrice(v))}.` };
    };
  } else if (mode === "adjust") {
    html = `${head("Raise or lower price")}<div class="adm-card-body"><p>Change the price of <b>${plural(n)}</b>. Results are rounded to whole dollars.</p>
      <div class="two"><div class="field"><label for="b-dir">Change</label><select id="b-dir"><option value="up">Raise by</option><option value="down">Lower by</option></select></div>
      <div class="field"><label for="b-amt">Amount</label><input id="b-amt" type="number" min="0" step="any" inputmode="decimal"></div></div>
      <div class="field"><label for="b-unit">In</label><select id="b-unit"><option value="pct">Percent (%)</option><option value="usd">Dollars ($)</option></select></div>
      <p class="hint" id="b-preview" aria-live="polite"></p>${foot("Change prices")}</div>`;
    const next = p => {
      const a = Number($("b-amt").value) || 0, sign = $("b-dir").value === "up" ? 1 : -1;
      return roundPrice($("b-unit").value === "pct" ? p.price * (1 + sign * a / 100) : p.price + sign * a);
    };
    const preview = () => {
      const p = items[0], a = $("b-amt").value;
      $("b-preview").textContent = a === "" ? "" : `For example, ${label(p)}: ${money(p.price)} → ${money(next(p))}`;
    };
    apply = () => {
      const a = Number($("b-amt").value);
      if ($("b-amt").value === "" || !Number.isFinite(a) || a < 0) return { error: "Enter an amount of 0 or more." };
      if ($("b-unit").value === "pct" && $("b-dir").value === "down" && a > 100) return { error: "You can't lower prices by more than 100%." };
      items.forEach(p => { p.price = next(p); });
      return { done: `${$("b-dir").value === "up" ? "Raised" : "Lowered"} the price of ${plural(n)} by ${$("b-unit").value === "pct" ? a + "%" : money(a)}.` };
    };
    dlg.oninput = preview;
  } else if (mode === "stock") {
    html = `${head("Set stock")}<div class="adm-card-body"><p>Set the copies in stock for all <b>${plural(n)}</b>. Use 0 to mark them sold out.</p>
      <div class="field"><label for="b-stock">Copies in stock</label><input id="b-stock" type="number" min="0" step="1" inputmode="numeric"></div>${foot("Set stock")}</div>`;
    apply = () => {
      const v = Number($("b-stock").value);
      if ($("b-stock").value === "" || !Number.isInteger(v) || v < 0 || v > 100000) return { error: "Enter a whole number of copies, 0 or more." };
      items.forEach(p => { p.stock = v; });
      return { done: `Set stock to ${v} for ${plural(n)}.` };
    };
  } else if (mode === "delete") {
    const names = items.slice(0, 5).map(p => `<li>${esc(label(p))}</li>`).join("");
    html = `${head(`Delete ${plural(n)}?`)}<div class="adm-card-body"><p>These will leave the shop when you publish. You can still discard the change before then.</p>
      <ul class="bulk-names">${names}${n > 5 ? `<li>…and ${n - 5} more</li>` : ""}</ul>${foot(`Delete ${plural(n)}`, true)}</div>`;
    apply = () => {
      const gone = new Set(S.selected);
      S.draft = S.draft.filter(p => !gone.has(p.id));
      S.draftFeat = S.draftFeat.filter(id => !gone.has(id));
      S.selected.clear();
      return { done: `Deleted ${plural(n)}. They leave the shop when you publish.` };
    };
  } else return;

  dlg.innerHTML = `<form id="bulkForm" novalidate>${html}</form>`;
  if (mode !== "adjust") dlg.oninput = null;
  dlg.onclick = ev => { if (ev.target === dlg || ev.target.closest("[data-close]")) dlg.close(); };
  $("bulkForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const result = apply();
    if (result.error) { $("bulkError").textContent = result.error; return; }
    dlg.close();
    renderList();
    say(`${result.done} Click “Publish changes” when you're ready for customers to see it.`, "ok");
  });
  dlg.showModal();
  const first = dlg.querySelector("input, select");
  if (first) first.focus(); else dlg.querySelector('button[type="submit"]').focus();
}
function refreshRow(id) {
  const row = $("aList").querySelector(`[data-row="${CSS.escape(id)}"]`);
  const p = S.draft.find(x => x.id === id);
  if (!row || !p) return;
  row.querySelector(".arow-pills").innerHTML = rowPills(p, changeList());
  row.querySelector(".arow-thumb").innerHTML = thumb(p);
}

/* ---------- item editor ---------- */
const ED = { id: null, isNew: false, image: "", newUpload: null };
const F = n => $("ed-" + n);
function editorHTML() {
  return `<form id="edForm" novalidate>
    <div class="co-head"><h2 class="dialog-title" id="edTitle">Edit item</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close without saving">${X}</button></div>
    <div class="ed-grid">
      <div class="ed-cover">
        <div class="ed-preview" id="edPreview"></div>
        <label class="btn btn-small file-btn">Upload cover photo<input type="file" accept="image/*" id="edFile" class="sr-only"></label>
        <button type="button" class="link-btn" id="edRemoveImg" hidden>Remove the photo</button>
        <p class="hint">Photos are resized to 600px wide before they're saved. Without a photo, the shop shows a plain cover with the title.</p>
      </div>
      <div class="ed-fields">
        <div class="two">
          <div class="field"><label for="ed-cat">Category</label><select id="ed-cat">${CATEGORIES.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("")}</select></div>
          <div class="field"><label for="ed-publisher">Publisher</label><input id="ed-publisher" autocomplete="off"></div>
        </div>
        <div class="field"><label for="ed-title">Title</label><input id="ed-title" autocomplete="off" placeholder="e.g. Captain Senora"><p class="error" id="e-ed-title" hidden></p></div>
        <div class="three">
          <div class="field" data-for="issues funko"><label for="ed-num" id="ed-num-label">Issue number</label><input id="ed-num" autocomplete="off" placeholder="#1"></div>
          <div class="field" data-for="tpb manga"><label for="ed-vol">Volume</label><input id="ed-vol" autocomplete="off" placeholder="Vol. 1"></div>
          <div class="field" data-for="issues"><label for="ed-grade">Condition</label><input id="ed-grade" list="ed-grades" autocomplete="off" placeholder="NM 9.4"><datalist id="ed-grades">${GRADE_OPTIONS.map(g => `<option value="${g}"></option>`).join("")}</datalist></div>
          <div class="field" data-for="graphic tpb omnibus"><label for="ed-pages">Pages</label><input id="ed-pages" type="number" min="0" step="1" inputmode="numeric"></div>
        </div>
        <div class="two">
          <div class="field" data-for="tpb omnibus"><label for="ed-subtitle">Subtitle</label><input id="ed-subtitle" autocomplete="off" placeholder="e.g. Omnibus Vol. 1"></div>
          <div class="field" data-for="tpb omnibus"><label for="ed-collects">Collects</label><input id="ed-collects" autocomplete="off" placeholder="Collects #1–6"></div>
          <div class="field" data-for="issues funko"><label for="ed-variant" id="ed-variant-label">Variant</label><input id="ed-variant" autocomplete="off" placeholder="e.g. Variant cover"></div>
        </div>
        <div class="two">
          <div class="field"><label for="ed-price">Price ($)</label><input id="ed-price" type="number" min="0" step="1" inputmode="numeric"><p class="error" id="e-ed-price" hidden></p></div>
          <div class="field"><label for="ed-stock">Copies in stock</label><input id="ed-stock" type="number" min="0" step="1" inputmode="numeric"><p class="error" id="e-ed-stock" hidden></p></div>
        </div>
        <div class="field"><label for="ed-blurb">Description</label><textarea id="ed-blurb" rows="3" placeholder="One or two sentences shown on the comic's page"></textarea></div>
        <div class="field"><label for="ed-staff">Staff pick note <span class="opt">(optional)</span></label><input id="ed-staff" autocomplete="off" placeholder="Leave empty if it isn't a staff pick"></div>
        <p class="group-label">Labels</p>
        <div class="checks">
          <label class="check"><input type="checkbox" id="ed-b-new"> New</label>
          <label class="check"><input type="checkbox" id="ed-b-variant"> Variant</label>
          <label class="check"><input type="checkbox" id="ed-b-exclusive"> Exclusive</label>
          <label class="check"><input type="checkbox" id="ed-week"> Show in “New this week”</label>
        </div>
        <p class="hint">The first three items marked for “New this week” appear at the top of the shop.</p>
      </div>
    </div>
    <div class="co-foot ed-foot">
      <div id="edDeleteWrap"></div>
      <p class="form-error" id="edError" role="alert"></p>
      <div class="ed-actions"><button type="button" class="btn btn-small" data-close>Cancel</button><button type="submit" class="btn btn-yellow btn-small">Save item</button></div>
    </div>
  </form>`;
}
function fieldVisibility() {
  const cat = F("cat").value;
  $("editDlg").querySelectorAll("[data-for]").forEach(el => { el.hidden = !el.dataset.for.split(" ").includes(cat); });
  $("ed-num-label").textContent = cat === "funko" ? "Figure number" : "Issue number";
  F("num").placeholder = cat === "funko" ? "No. 01" : "#1";
  $("ed-variant-label").textContent = cat === "funko" ? "Finish" : "Variant";
}
function formProduct() {
  const vis = k => !F(k).closest("[data-for]") || !F(k).closest("[data-for]").hidden;
  const val = k => (vis(k) ? F(k).value.trim() : "");
  const base = ED.isNew ? {} : clone(S.draft.find(p => p.id === ED.id) || {});
  return Object.assign(base, {
    id: ED.id || "preview-item", cat: F("cat").value, title: F("title").value.trim(),
    num: val("num"), vol: val("vol"), subtitle: val("subtitle"), variant: val("variant"), collects: val("collects"),
    pages: val("pages") ? Number(val("pages")) : "", grade: val("grade"), publisher: F("publisher").value.trim(),
    price: F("price").value === "" ? NaN : Number(F("price").value), stock: F("stock").value === "" ? NaN : Number(F("stock").value),
    blurb: F("blurb").value.trim(), badges: ["new", "variant", "exclusive"].filter(b => $("ed-b-" + b).checked), staff: F("staff").value.trim(),
    image: ED.image || ""
  });
}
function updatePreview() {
  const p = formProduct();
  const shown = Object.assign({}, p, { title: p.title || "Untitled", stock: Number.isFinite(p.stock) ? p.stock : 1 });
  $("edPreview").innerHTML = thumb(shown);
  $("edRemoveImg").hidden = !ED.image;
}
function openEditor(id) {
  const dlg = $("editDlg");
  dlg.innerHTML = editorHTML();
  const p = id ? S.draft.find(x => x.id === id) : null;
  ED.id = p ? p.id : null; ED.isNew = !p; ED.image = p && p.image ? p.image : ""; ED.newUpload = null;
  $("edTitle").textContent = p ? "Edit item" : "Add item";
  F("cat").value = p ? p.cat : "issues";
  ["publisher", "title", "num", "vol", "grade", "pages", "subtitle", "collects", "variant", "blurb", "staff"].forEach(k => { F(k).value = p && p[k] != null ? p[k] : ""; });
  F("price").value = p ? p.price : "";
  F("stock").value = p ? p.stock : 1;
  ["new", "variant", "exclusive"].forEach(b => { $("ed-b-" + b).checked = !!(p && (p.badges || []).includes(b)); });
  F("week").checked = !!(p && S.draftFeat.includes(p.id));
  $("edDeleteWrap").hidden = !p;
  resetDelete();
  fieldVisibility();
  updatePreview();

  dlg.addEventListener("click", ev => { if (ev.target.closest("[data-close]")) dlg.close(); });
  dlg.addEventListener("input", ev => { if (ev.target.id !== "edFile") updatePreview(); });
  F("cat").addEventListener("change", () => { fieldVisibility(); updatePreview(); });
  $("edRemoveImg").addEventListener("click", () => { ED.image = ""; ED.newUpload = null; $("edFile").value = ""; updatePreview(); });
  $("edFile").addEventListener("change", async () => {
    const file = $("edFile").files[0]; if (!file) return;
    $("edError").textContent = "";
    try {
      const dataUrl = await shrinkImage(file);
      const path = `assets/covers/${slug(F("title").value || "cover")}-${Date.now().toString(36)}.jpg`;
      ED.image = path; ED.newUpload = { path, b64: dataUrl.split(",")[1], url: dataUrl };
      S.previews[path] = dataUrl;
      updatePreview();
    } catch (e) { $("edError").textContent = e.message; }
  });
  $("edForm").addEventListener("submit", saveItem);
  dlg.showModal();
  F("title").focus();
}
function resetDelete() {
  const wrap = $("edDeleteWrap"); if (!wrap) return;
  wrap.innerHTML = `<button type="button" class="link-btn danger-link" id="edDelete">Delete item</button>`;
  $("edDelete").addEventListener("click", () => {
    const p = S.draft.find(x => x.id === ED.id);
    wrap.innerHTML = `<span class="inline-confirm">Delete ${esc(p ? label(p) : "this item")}?<button type="button" class="btn btn-small btn-danger" id="edDeleteYes">Delete</button><button type="button" class="btn btn-small" id="edDeleteNo">Keep</button></span>`;
    $("edDeleteYes").addEventListener("click", () => {
      S.draft = S.draft.filter(x => x.id !== ED.id);
      S.draftFeat = S.draftFeat.filter(x => x !== ED.id);
      $("editDlg").close();
      renderList();
      say(`Deleted ${p ? label(p) : "the item"}. It leaves the shop when you publish.`, "ok");
    });
    $("edDeleteNo").addEventListener("click", () => { resetDelete(); $("edDelete").focus(); });
    $("edDeleteNo").focus();
  });
}
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error("That file isn't an image. Choose a JPG, PNG or WebP photo.")); return; }
    if (file.size > 20 * 1024 * 1024) { reject(new Error("That photo is over 20 MB. Choose a smaller one.")); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.naturalWidth, 900 / img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo couldn't be opened. Try a JPG or PNG.")); };
    img.src = url;
  });
}
function saveItem(ev) {
  ev.preventDefault();
  const p = formProduct(), errs = {};
  if (!p.title) errs.title = "Give the item a title.";
  if (!Number.isFinite(p.price) || p.price < 0) errs.price = "Enter a price of 0 or more.";
  if (!Number.isInteger(p.stock) || p.stock < 0) errs.stock = "Enter a whole number of copies, 0 or more.";
  ["title", "price", "stock"].forEach(k => {
    const e = $("e-ed-" + k);
    if (errs[k]) { e.textContent = errs[k]; e.hidden = false; F(k).setAttribute("aria-invalid", "true"); }
    else { e.hidden = true; F(k).removeAttribute("aria-invalid"); }
  });
  const first = ["title", "price", "stock"].find(k => errs[k]);
  if (first) { F(first).focus(); return; }
  if (ED.newUpload) S.uploads[ED.newUpload.path] = ED.newUpload.b64;
  if (ED.isNew) {
    p.id = uniqueId(slug([p.title, p.num || p.vol].filter(Boolean).join(" ")));
    S.draft.unshift(p);
  } else {
    S.draft[S.draft.findIndex(x => x.id === ED.id)] = p;
  }
  const inWeek = S.draftFeat.includes(p.id);
  if (F("week").checked && !inWeek) S.draftFeat.push(p.id);
  if (!F("week").checked && inWeek) S.draftFeat = S.draftFeat.filter(x => x !== p.id);
  $("editDlg").close();
  renderList();
  const extra = F("week").checked && S.draftFeat.indexOf(p.id) > 2 ? " Three other items are already in “New this week”, so untick one of those for it to show." : "";
  say(`${ED.isNew ? "Added" : "Saved"} ${label(p)}. Click “Publish changes” when you're ready for customers to see it.${extra}`, "ok");
  const row = $("aList").querySelector(`[data-row="${CSS.escape(p.id)}"] [data-edit]`);
  if (row) row.focus();
}

/* ---------- publish ---------- */
async function publish() {
  if (S.busy) return;
  const changes = changeList();
  if (!changes.count) return;
  S.busy = true; updateCounts();
  const btn = $("aPublish"); btn.textContent = "Publishing…";
  say("Saving…");
  try {
    const products = clone(S.draft).map(cleanProduct);
    const used = new Set(products.map(p => p.image).filter(Boolean));
    const uploads = {};
    Object.keys(S.uploads).forEach(path => { if (used.has(path)) uploads[path] = S.uploads[path]; });
    const r = await api("/publish", { method: "POST", body: { version: S.version, base: S.orig.map(cleanProduct), products, featured: S.draftFeat.slice(0, 3), uploads } });
    S.version = r.version;
    if (r.merged) { S.draft = clone(r.products); S.orig = clone(r.products); } // orders took stock off the shelf since this was loaded
    else S.orig = clone(S.draft);
    S.origFeat = S.draftFeat.slice(); S.uploads = {};
    S.busy = false;
    if ($("aList")) renderList();
    say(r.merged ? "Published. New orders had changed some stock since you loaded it, so those numbers are updated on screen. The shop updates in a minute or two." : "Published. The shop updates in a minute or two, once the site has rebuilt.", "ok");
  } catch (e) {
    S.busy = false; updateCounts();
    const actions = e.status === 409 ? [{ label: "Reload stock", danger: true, fn: async () => { try { await loadStock(); renderList(); say("Stock reloaded.", "ok"); } catch (err) { say(err.message, "error"); } } }] : [];
    say(e.message, "error", actions);
  }
  if ($("aPublish")) $("aPublish").textContent = "Publish changes";
}

/* ---------- orders tab ---------- */
const orderStatus = o => o.status || "new";
const STATUS_NAME = o => ({ new: "New", ready: "Ready", done: o.method === "post" ? "Posted" : "Collected", cancelled: "Cancelled" })[orderStatus(o)];
const HISTORY_NAME = (change, o) => ({ new: "Reopened", ready: "Marked ready", done: o.method === "post" ? "Marked posted" : "Marked collected", cancelled: "Cancelled", paid: "Marked paid", unpaid: "Marked unpaid" })[change] || change;
const ORDER_FILTERS = [
  ["open", "Open", o => orderStatus(o) === "new" || orderStatus(o) === "ready"],
  ["archive", "Archive", o => orderStatus(o) === "done" || orderStatus(o) === "cancelled"]
];
const ARCHIVE_DAYS = 14;
const archiveEnd = o => new Date(Date.parse(o.completedAt) + ARCHIVE_DAYS * 86400000).toISOString();
const STOCK_NOTE = {
  held: "Taken off the shelf automatically",
  released: "Put back on the shelf automatically",
  manual: "Not adjusted automatically (GitHub couldn't be reached). Change it under Stock.",
  "restore-failed": "Cancelled, but not put back. Add the comics back under Stock."
};
const orderWhen = iso => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/* A spreadsheet opens a cell that starts with = + - or @ as a formula, so typed text like that is defused with a leading quote. */
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function ordersCsv(orders) {
  const head = ["Order", "Placed", "Status", "Paid", "Customer", "Phone", "Method", "Collect on", "Address", "Items", "Subtotal", "Postage", "Total", "Notes"];
  const rows = orders.map(o => [o.id, o.placedAt, STATUS_NAME(o), o.paid ? "Yes" : "No", o.name, o.phone, o.method === "post" ? "Post" : "Collect", o.collectDate || "", o.address || "",
    o.items.map(i => `${i.qty} x ${i.title}`).join("; "), o.subtotal, o.postage, o.total, o.notes || ""]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function orderHTML(o, isOpen) {
  const s = orderStatus(o), finish = o.method === "post" ? "Mark posted" : "Mark collected";
  const btn = (attrs, text, cls = "") => `<button type="button" class="btn btn-small ${cls}" data-oid="${esc(o.id)}" ${attrs}>${text}</button>`;
  const actions = [];
  if (s === "new") actions.push(btn('data-status="ready"', "Mark ready", "btn-yellow"), btn('data-status="done"', finish));
  if (s === "ready") actions.push(btn('data-status="done"', finish, "btn-yellow"), btn('data-status="new"', "Back to new"));
  if (s === "done" || s === "cancelled") actions.push(btn('data-status="new"', "Reopen"));
  actions.push(btn(`data-paid="${o.paid ? "no" : "yes"}"`, o.paid ? "Mark unpaid" : "Mark paid"));
  if (s === "new" || s === "ready") actions.push(btn('data-status="cancelled"', "Cancel order", "btn-danger"));
  const history = [`Placed by the customer · ${orderWhen(o.placedAt)}`, ...(o.history || []).map(h => `${HISTORY_NAME(h.change, o)} by ${h.by} · ${orderWhen(h.at)}`)];
  const pillClass = { new: "pill-edit", ready: "pill-added", done: "", cancelled: "pill-void" }[s];
  return `<details class="order${s === "cancelled" ? " is-cancelled" : ""}" data-order="${esc(o.id)}"${isOpen ? " open" : ""}>
    <summary><b>${esc(o.id)}</b> <span>${esc(orderWhen(o.placedAt))}</span> <span>${esc(o.name)}</span> <span class="pill">${o.method === "post" ? "Post" : "Collect"}</span> <span class="pill ${pillClass}">${esc(STATUS_NAME(o))}</span>${o.paid ? ' <span class="pill pill-added">Paid</span>' : ""}${o.stock === "manual" || o.stock === "restore-failed" ? ' <span class="pill pill-edit">Adjust stock</span>' : ""}${/^failed/.test(o.discord || "") ? ' <span class="pill pill-edit">Not posted to Discord</span>' : ""} <b class="order-total">${money(o.total)}</b></summary>
    <dl class="done-dl">
      <dt>Phone</dt><dd>${esc(o.phone)}</dd>
      ${o.method === "collect" ? `<dt>Collect on</dt><dd>${esc(o.collectDate)}</dd>` : `<dt>Post to</dt><dd>${escLines(o.address)}</dd>`}
      <dt>Items</dt><dd>${o.items.map(i => `${i.qty} × ${esc(i.title)} · ${money(i.price * i.qty)}`).join("<br>")}</dd>
      <dt>Total</dt><dd>${money(o.total)}${o.postage ? ` (incl. ${money(o.postage)} postage)` : ""}</dd>
      <dt>Payment</dt><dd>${o.paid ? "Paid" : "Not paid yet"}</dd>
      ${STOCK_NOTE[o.stock] ? `<dt>Stock</dt><dd>${STOCK_NOTE[o.stock]}</dd>` : ""}
      ${o.completedAt ? `<dt>Kept until</dt><dd>${esc(orderWhen(archiveEnd(o)))}, then deleted</dd>` : ""}
      ${o.notes ? `<dt>Notes</dt><dd>${escLines(o.notes)}</dd>` : ""}
      <dt>History</dt><dd>${history.map(esc).join("<br>")}</dd>
      <dt>Discord</dt><dd>${esc(o.discord || "")}</dd>
    </dl>
    <div class="order-actions">${actions.join("")}</div>
  </details>`;
}

async function renderOrders() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div>
    <div class="orders-top" id="ordersTop"><p class="hint">Loading…</p></div>
    <div class="orders-filter" id="ordersFilter" role="group" aria-label="Show orders"></div>
    <div id="ordersList"></div>`;
  let data;
  try { data = await api("/orders"); } catch (e) { say(e.message, "error"); return; }
  const orders = data.orders, open = new Set();
  let filter = "open";

  $("ordersTop").innerHTML = `<div class="orders-status">
      <span class="pill ${data.ordersOpen ? "pill-added" : ""}">Online ordering: ${data.ordersOpen ? "ON" : "OFF"}</span>
      <span class="pill ${data.discord ? "pill-added" : ""}">Discord: ${data.discord ? "connected" : "not connected"}</span>
      <button type="button" class="btn btn-small" id="dcTest"${data.discord ? "" : " disabled"}>Send a test message to Discord</button>
      <button type="button" class="btn btn-small" id="csvBtn"${orders.length ? "" : " disabled"}>Download as spreadsheet (CSV)</button>
    </div>
    <p class="hint">Every order is posted to the Discord channel, and the post is updated as you work the order. Orders take comics off the shelf automatically, and cancelling puts them back. Finished orders (collected, posted or cancelled) move to the Archive and are deleted after 14 days. ${data.ordersOpen ? "" : "Customers can't order online yet, so this list stays empty until ordering is switched on."}</p>`;
  $("dcTest").addEventListener("click", async () => {
    $("dcTest").disabled = true;
    try { await api("/orders/test", { method: "POST" }); say("Sent. Check the Discord channel for a message marked TEST.", "ok"); }
    catch (e) { say(e.message, "error"); }
    $("dcTest").disabled = false;
  });
  $("csvBtn").addEventListener("click", () => download(`flickers-orders-${new Date().toISOString().slice(0, 10)}.csv`, ordersCsv(orders), "text/csv;charset=utf-8"));

  const paint = () => {
    $("ordersFilter").innerHTML = (filter === "archive" ? '<p class="hint orders-note">Finished orders are kept here for two weeks, then deleted for good. Reopen one to move it back to Open.</p>' : "") + ORDER_FILTERS.map(([k, name, fn]) => `<button type="button" class="btn btn-small" data-filter="${k}" aria-pressed="${filter === k}">${name} (${orders.filter(fn).length})</button>`).join("");
    const list = orders.filter(ORDER_FILTERS.find(f => f[0] === filter)[2]);
    if (filter === "archive") list.sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0));
    $("ordersList").innerHTML = list.length ? list.map(o => orderHTML(o, open.has(o.id))).join("")
      : `<p class="admin-empty">${filter === "open" ? "No open orders." : "Nothing in the archive."}</p>`;
  };
  $("ordersFilter").addEventListener("click", ev => {
    const b = ev.target.closest("[data-filter]"); if (!b) return;
    filter = b.dataset.filter; paint();
    $("ordersFilter").querySelector(`[data-filter="${filter}"]`).focus();
  });
  $("ordersList").addEventListener("toggle", ev => { const id = ev.target.dataset && ev.target.dataset.order; if (id) (ev.target.open ? open.add(id) : open.delete(id)); }, true);
  $("ordersList").addEventListener("click", ev => {
    const b = ev.target.closest("[data-oid]"); if (!b) return;
    const id = b.dataset.oid, o = orders.find(x => x.id === id); if (!o) return;
    const body = b.dataset.status ? { status: b.dataset.status } : { paid: b.dataset.paid === "yes" };
    const go = async () => {
      b.disabled = true;
      try {
        const r = await api(`/orders/${encodeURIComponent(id)}`, { method: "POST", body });
        Object.assign(o, r.order);
        const what = body.status ? STATUS_NAME(o) + (body.status === "cancelled" || body.status === "done" ? " (moved to the Archive)" : "") : o.paid ? "marked paid" : "marked unpaid";
        const extra = [...(r.warnings || []), ...(r.discord === "failed" ? ["The Discord post couldn't be updated."] : [])];
        say(`${id}: ${what}.${extra.length ? " " + extra.join(" ") : ""}`, extra.length ? "error" : "ok");
        paint();
        const summary = $("ordersList").querySelector(`[data-order="${id}"] summary`); // keep the keyboard where it was
        if (summary) summary.focus(); else $("ordersFilter").querySelector(`[data-filter="${filter}"]`).focus();
      } catch (e) { b.disabled = false; say(e.message, "error"); }
    };
    if (body.status === "cancelled") say(`Cancel order ${id} for ${o.name}? ${o.stock === "held" ? "The comics go back on the shelf. " : ""}It moves to the Archive for two weeks.`, "error", [{ label: "Cancel order", danger: true, fn: go }, { label: "Keep order", fn: () => say("") }]);
    else go();
  });
  paint();
}

/* ---------- staff tab (owner) ---------- */
async function renderStaff() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div><ul class="users" id="users"><li class="admin-empty">Loading…</li></ul>
    <form class="adm-form" id="newUser" novalidate>
      <h2>Add someone</h2>
      <div class="field"><label for="nu">Username</label><input id="nu" autocomplete="off" autocapitalize="none" spellcheck="false"><p class="hint">3 to 24 characters: letters, numbers, dots, dashes and underscores.</p></div>
      <div class="field"><label for="np">Temporary password</label><input id="np" type="password" autocomplete="new-password"><p class="hint">At least 10 characters. Tell them to change it under “My password”.</p></div>
      <div class="field"><label for="nr">Role</label><select id="nr"><option value="staff">Staff: can edit and publish stock</option><option value="owner">Owner: can also manage staff</option></select></div>
      <div><button type="submit" class="btn btn-yellow btn-small">Add account</button></div>
    </form>
    <dialog class="prompt" id="pwDlg" aria-labelledby="pwTitle"></dialog>`;
  const refresh = async () => {
    try {
      S.users = (await api("/users")).users;
      $("users").innerHTML = S.users.map(u => `<li class="user-row"><b>${esc(u.username)}</b><span class="pill">${esc(u.role)}</span>
        <span class="user-actions"><button type="button" class="link-btn" data-reset="${esc(u.username)}">Reset password</button>${u.username === S.user.username ? "" : `<button type="button" class="link-btn danger-link" data-remove="${esc(u.username)}">Remove</button>`}</span></li>`).join("");
    } catch (e) { say(e.message, "error"); }
  };
  await refresh();
  $("users").addEventListener("click", ev => {
    const rm = ev.target.closest("[data-remove]"), rs = ev.target.closest("[data-reset]");
    if (rm) say(`Remove ${rm.dataset.remove}? They won't be able to sign in any more.`, "error", [
      { label: "Remove", danger: true, fn: async () => { try { await api(`/users/${encodeURIComponent(rm.dataset.remove)}`, { method: "DELETE" }); say(`${rm.dataset.remove} was removed.`, "ok"); refresh(); } catch (e) { say(e.message, "error"); } } },
      { label: "Keep", fn: () => say("") }]);
    if (rs) openResetDialog(rs.dataset.reset);
  });
  $("newUser").addEventListener("submit", async ev => {
    ev.preventDefault();
    try {
      await api("/users", { method: "POST", body: { username: $("nu").value, password: $("np").value, role: $("nr").value } });
      say(`Added ${$("nu").value.trim().toLowerCase()}.`, "ok");
      $("nu").value = ""; $("np").value = "";
      refresh();
    } catch (e) { say(e.message, "error"); }
  });
}
function openResetDialog(name) {
  const dlg = $("pwDlg");
  dlg.innerHTML = `<form id="pwForm" novalidate><div class="co-head"><h2 class="dialog-title" id="pwTitle">Reset password</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close">${X}</button></div>
    <div class="adm-card-body"><p>New password for <b>${esc(name)}</b>. They'll be signed out everywhere.</p>
    <div class="field"><label for="rp">New password</label><input id="rp" type="password" autocomplete="new-password"></div>
    <p class="form-error" id="rpError" role="alert"></p>
    <button type="submit" class="btn btn-yellow btn-small">Set password</button></div></form>`;
  dlg.addEventListener("click", ev => { if (ev.target === dlg || ev.target.closest("[data-close]")) dlg.close(); });
  $("pwForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    try { await api(`/users/${encodeURIComponent(name)}/password`, { method: "POST", body: { password: $("rp").value } }); dlg.close(); say(`Password changed for ${name}.`, "ok"); }
    catch (e) { $("rpError").textContent = e.message; }
  });
  dlg.showModal(); $("rp").focus();
}

/* ---------- my password ---------- */
function renderAccount() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div>
    <form class="adm-form" id="pwChange" novalidate>
      <h2>Change my password</h2>
      <div class="field"><label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="n1">New password</label><input id="n1" type="password" autocomplete="new-password"><p class="hint">At least 10 characters. A few random words is better than a clever one.</p></div>
      <div class="field"><label for="n2">New password again</label><input id="n2" type="password" autocomplete="new-password"></div>
      <div><button type="submit" class="btn btn-yellow btn-small">Change password</button></div>
    </form>`;
  $("pwChange").addEventListener("submit", async ev => {
    ev.preventDefault();
    if ($("n1").value !== $("n2").value) { say("The two new passwords don't match.", "error"); return; }
    try {
      const r = await api("/password", { method: "POST", body: { current: $("cp").value, next: $("n1").value } });
      S.token = r.token; S.exp = Math.floor(Date.now() / 1000) + 12 * 3600;
      sessionStore.save({ token: S.token, exp: S.exp, user: S.user }, false);
      ["cp", "n1", "n2"].forEach(id => { $(id).value = ""; });
      say("Password changed. Other devices have been signed out.", "ok");
    } catch (e) { say(e.message, "error"); }
  });
}

/* ---------- start ---------- */
window.addEventListener("beforeunload", ev => { if (S.user && changeList().count > 0) { ev.preventDefault(); ev.returnValue = ""; } });
(async () => {
  if (!API) { showNotConfigured(); return; }
  const saved = sessionStore.load();
  if (saved) {
    Object.assign(S, { token: saved.token, exp: saved.exp, user: saved.user });
    try { S.user = (await api("/me")).user; await startApp(); return; }
    catch (e) { if (S.token) endSession(""); return; }
  }
  showLogin();
})();
