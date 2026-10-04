/* Flickers Comics staff area.
   Staff sign in with a username and password. Stock is loaded from and published to the staff API
   (the Cloudflare Worker in worker/), which does the GitHub commit. No GitHub token is ever in the browser. */
import { esc, money, fullTitle, metaLine, slug, coverHTML, placeholderCover } from "../js/shared.js";

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

const S = { token: "", exp: 0, user: null, tab: "stock", version: "", orig: [], draft: [], origFeat: [], draftFeat: [], uploads: {}, previews: {}, busy: false, users: [] };

/* ---------- session ---------- */
const sessionStore = {
  load() { for (const st of [sessionStorage, localStorage]) { try { const v = JSON.parse(st.getItem(SESSION_KEY) || "null"); if (v && v.exp > Date.now() / 1000) return v; } catch (e) { /* none */ } } return null; },
  save(s, remember) { this.clear(); try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* memory only */ } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
};

/* ---------- API ---------- */
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(path, { method = "GET", body } = {}) {
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
    if (res.status === 401 && S.token) { endSession("Your session has ended. Sign in again."); }
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
}

function renderShell() {
  const owner = S.user.role === "owner";
  app.innerHTML = `<div class="adm-wrap">
    <div class="adm-top">
      <h1>Stock manager</h1>
      <div class="adm-who"><span>Signed in as <b>${esc(S.user.username)}</b>${owner ? " (owner)" : ""}</span><button type="button" class="link-btn" id="signOut">Sign out</button></div>
    </div>
    <div class="adm-tabs" role="tablist" aria-label="Staff area">
      <button type="button" class="adm-tab" role="tab" data-tab="stock" aria-selected="${S.tab === "stock"}">Stock</button>
      ${owner ? `<button type="button" class="adm-tab" role="tab" data-tab="staff" aria-selected="${S.tab === "staff"}">Staff</button>` : ""}
      <button type="button" class="adm-tab" role="tab" data-tab="account" aria-selected="${S.tab === "account"}">My password</button>
    </div>
    <div class="adm-panel" id="panel" role="tabpanel"></div>
  </div>
  <dialog class="editor" id="editDlg" aria-labelledby="edTitle"></dialog>`;
  $("signOut").addEventListener("click", askSignOut);
  app.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderShell(); }));
  $("editDlg").addEventListener("click", ev => { if (ev.target === $("editDlg")) $("editDlg").close(); });
  if (S.tab === "stock") renderStock();
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
        <button type="button" class="btn btn-yellow btn-small" id="aPublish" disabled>Publish changes</button>
      </div>
    </div>
    <div class="admin-msg" id="aMsg" role="status"></div>
    <div id="aList"></div>`;
  $("aQ").addEventListener("input", renderList);
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
  $("aList").addEventListener("click", ev => { const b = ev.target.closest("[data-edit]"); if (b) openEditor(b.dataset.edit); });
  $("aAdd").addEventListener("click", () => openEditor(null));
  $("aDiscard").addEventListener("click", () => say("Throw away all unpublished changes?", "error", [
    { label: "Discard changes", danger: true, fn: () => { S.draft = clone(S.orig); S.draftFeat = S.origFeat.slice(); renderList(); say("Changes discarded.", "ok"); } },
    { label: "Keep them", fn: () => say("") }
  ]));
  $("aPublish").addEventListener("click", publish);
  renderList();
}
function updateCounts() {
  const c = changeList();
  if (!$("aChanges")) return c;
  $("aChanges").textContent = c.count ? `${c.count} unpublished change${c.count === 1 ? "" : "s"}` : "No unpublished changes";
  $("aChanges").classList.toggle("has", c.count > 0);
  $("aPublish").disabled = c.count === 0 || S.busy;
  $("aDiscard").hidden = c.count === 0;
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
function renderList() {
  const c = updateCounts();
  const q = ($("aQ").value || "").trim().toLowerCase();
  const list = S.draft.filter(p => !q || [label(p), p.publisher].join(" ").toLowerCase().includes(q));
  $("aList").innerHTML = list.length ? list.map(p => {
    const t = label(p);
    return `<div class="arow" data-row="${esc(p.id)}">
      <div class="arow-thumb">${thumb(p)}</div>
      <div class="arow-info"><p class="arow-title">${esc(t)}</p><p class="arow-meta"><span>${esc(metaLine(p, CATEGORIES))}</span><span class="arow-pills">${rowPills(p, c)}</span></p></div>
      <label class="arow-field arow-price">Price ($)<input type="number" min="0" step="1" inputmode="numeric" data-price="${esc(p.id)}" value="${esc(p.price)}" aria-label="Price of ${esc(t)}"></label>
      <label class="arow-field arow-stock">Stock<input type="number" min="0" step="1" inputmode="numeric" data-stock="${esc(p.id)}" value="${esc(p.stock)}" aria-label="Copies of ${esc(t)} in stock"></label>
      <button type="button" class="btn btn-small arow-edit" data-edit="${esc(p.id)}" aria-label="Edit ${esc(t)}">Edit</button>
    </div>`;
  }).join("") : `<p class="admin-empty">${S.draft.length ? "Nothing matches that search." : "No stock yet. Click “+ Add item” to add the first one."}</p>`;
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
  const dlg = $("editDlg"), vis = k => !F(k).closest("[data-for]") || !F(k).closest("[data-for]").hidden;
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
    const r = await api("/publish", { method: "POST", body: { version: S.version, products, featured: S.draftFeat.slice(0, 3), uploads } });
    S.version = r.version;
    S.orig = clone(S.draft); S.origFeat = S.draftFeat.slice(); S.uploads = {};
    S.busy = false;
    if ($("aList")) renderList();
    say("Published. The shop updates in a minute or two, once the site has rebuilt.", "ok");
  } catch (e) {
    S.busy = false; updateCounts();
    const actions = e.status === 409 ? [{ label: "Reload stock", danger: true, fn: async () => { try { await loadStock(); renderList(); say("Stock reloaded.", "ok"); } catch (err) { say(err.message, "error"); } } }] : [];
    say(e.message, "error", actions);
  }
  if ($("aPublish")) $("aPublish").textContent = "Publish changes";
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
