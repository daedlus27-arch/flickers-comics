/* Flickers Comics: staff stock manager.
   Staff sign in with a GitHub access token. Edits are previewed on the page, then
   "Publish changes" commits shop-data.js (and any new cover photos) to the repo in one commit. */
(() => {
"use strict";
const shop = window.FlickersShop;
if (!shop) return;

const DATA_PATH = "shop-data.js";
const COVER_DIR = "assets/covers/";
const TOKEN_KEY = "flickers-admin-token";
const GUIDE = "/* Flickers Comics: shop settings and stock\n   ------------------------------------------------------------------\n   The easy way to change stock is on the site itself: click \"Staff login\" at the\n   bottom of the page. Saving from there rewrites this whole file, so any comments\n   you add below this guide are not kept.\n\n   You can also edit this file on GitHub. After you commit, the site updates in a\n   minute or two.\n\n   FLICKERS_CONFIG: postage (dollars), openHour / closeHour (24-hour clock),\n   timeZone (for the \"Open now\" badge), collectDaysAhead, testMode, orderEndpoint,\n   and github (the repository the stock manager saves to).\n\n   Each item in FLICKERS_PRODUCTS:\n     id         unique, no spaces (e.g. \"batman-1\")\n     cat        issues | graphic | tpb | omnibus | manga | funko\n     title      the series or figure name\n     price      dollars, numbers only (750, not \"$750\")\n     stock      copies in the shop (0 shows it as sold out)\n     publisher  shown on the cover and in the details\n     blurb      one or two sentences for the details panel\n   Optional:\n     num        issue or figure number, e.g. \"#1\" or \"No. 01\"\n     vol        e.g. \"Vol. 1\" (trade paperbacks, manga)\n     subtitle   e.g. \"Boardwalk Justice\" or \"Omnibus Vol. 1\"\n     collects   e.g. \"Collects #1-6\"\n     pages      page count\n     grade      condition of single issues, e.g. \"NM 9.4\"\n     variant    e.g. \"Variant cover\" or \"Glow in the dark\"\n     tagline    short line printed on a single-issue cover\n     badges     any of [\"new\"], [\"variant\"], [\"exclusive\"]\n     staff      a staff pick note, e.g. \"Read it in one sitting.\"\n     image      a photo instead of the drawn cover, e.g. \"assets/covers/batman-1.jpg\"\n     art        look of the drawn cover: { motif: \"skyline\", pal: 3 }\n                motifs: skyline beam lightning waves tentacle ghost saints sunset\n                        diner mountains hex atom blade bowl mecha torii\n                pal: 0 to 7 (colour scheme)\n*/\n\n";
const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=public_repo&description=Flickers%20Comics%20stock%20manager";
const FIELD_ORDER = ["id", "cat", "title", "num", "vol", "subtitle", "variant", "collects", "pages", "grade", "publisher", "price", "stock", "blurb", "tagline", "badges", "staff", "image", "art"];
const GRADE_OPTIONS = ["NM+ 9.6", "NM 9.4", "NM− 9.2", "VF 8.0", "FN 6.0", "VG 4.0", "GD 2.0"];
const MOTIF_LABELS = { skyline: "City at night", beam: "Pier and searchlights", lightning: "Lightning storm", waves: "Lake at night", tentacle: "Sea monster", ghost: "Ghost in the woods", saints: "Halo over the city", sunset: "Retro sunset", diner: "Roadside diner", mountains: "Desert mountains", hex: "Space station", atom: "Atomic", blade: "Neon and rain", bowl: "Ramen bowl", mecha: "Robot", torii: "Shrine gate" };
const PAL_LABELS = ["Yellow", "Blue", "Pink", "Midnight", "Red", "Green", "Newsprint", "Purple"];

const GH = Object.assign({ branch: "main" }, shop.CONFIG.github || {});
if (!GH.owner || !GH.repo) {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (m) { GH.owner = GH.owner || m[1]; GH.repo = GH.repo || location.pathname.split("/").filter(Boolean)[0] || `${m[1]}.github.io`; }
}

const $ = id => document.getElementById(id);
const esc = shop.esc;
const money = shop.money;
const clone = o => JSON.parse(JSON.stringify(o));
const canon = v => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}`
  : JSON.stringify(v);
const catLabel = key => (shop.CATEGORIES.find(c => c.key === key) || {}).one || "Item";

/* ---------- session ---------- */
let memToken = "";
const tokenStore = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || memToken; } catch (e) { return memToken; } },
  set(t, remember) {
    memToken = t;
    try { sessionStorage.setItem(TOKEN_KEY, t); if (remember) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* memory only */ }
  },
  clear() { memToken = ""; try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
};
const S = { token: "", login: "", dataSha: "", config: null, categories: null, orig: [], draft: [], origNew: [], draftNew: [], ready: false, busy: false };

/* ---------- GitHub API ---------- */
const repoPath = p => `/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}${p}`;
function friendly(message) { const e = new Error(message); e.friendly = true; return e; }
async function gh(path, opts = {}) {
  let res;
  try {
    res = await fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: Object.assign({ Accept: "application/vnd.github+json", Authorization: `Bearer ${S.token}`, "X-GitHub-Api-Version": "2022-11-28" }, opts.body ? { "Content-Type": "application/json" } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    });
  } catch (e) {
    throw friendly("Couldn't reach GitHub. Check your connection and try again. (The stock manager only works on the live site.)");
  }
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json()).message || ""; } catch (e) { /* no body */ }
    if (res.status === 401) throw friendly("GitHub didn't accept that token. Check you copied all of it and that it hasn't expired.");
    if (res.status === 403 || res.status === 404) throw friendly(`GitHub refused: ${msg || res.status}. Make sure the token has the public_repo box ticked and your account can edit ${GH.owner}/${GH.repo}.`);
    if (res.status === 409 || res.status === 422) throw friendly(`GitHub couldn't save: ${msg || res.status}. Reload the stock and try again.`);
    throw friendly(`GitHub answered ${res.status}${msg ? ": " + msg : ""}.`);
  }
  return res.status === 204 ? null : res.json();
}
const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), c => c.charCodeAt(0)));
function parseShopData(text) {
  const w = {};
  new Function("window", text)(w);
  if (!Array.isArray(w.FLICKERS_PRODUCTS)) throw friendly("shop-data.js in the repo doesn't list any products, so it can't be edited here.");
  return w;
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
  Object.keys(p).forEach(k => { if (!(k in out) && !FIELD_ORDER.includes(k) && p[k] !== "" && p[k] != null) out[k] = p[k]; });
  return out;
}
function buildDataFile(products, newIds) {
  return GUIDE
    + `window.FLICKERS_CONFIG = ${JSON.stringify(S.config, null, 2)};\n\n`
    + `window.FLICKERS_CATEGORIES = ${JSON.stringify(S.categories, null, 2)};\n\n`
    + `window.FLICKERS_PRODUCTS = [\n${products.map(p => "  " + JSON.stringify(cleanProduct(p))).join(",\n")}\n];\n\n`
    + `window.FLICKERS_NEW_THIS_WEEK = ${JSON.stringify(newIds)};\n`;
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
  const weekChanged = canon(S.origNew.slice(0, 3)) !== canon(S.draftNew.slice(0, 3));
  return { edited, added, removed, weekChanged, count: edited.size + added.size + removed.length + (weekChanged ? 1 : 0) };
}
function slug(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item"; }
function uniqueId(base) { let id = base, n = 2; while (S.draft.some(p => p.id === id)) id = `${base}-${n++}`; return id; }

/* ---------- UI scaffolding ---------- */
const X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
document.body.insertAdjacentHTML("beforeend", `
<dialog class="login" id="loginDlg" aria-labelledby="loginTitle">
  <form id="loginForm" novalidate>
    <div class="co-head"><h2 class="dialog-title" id="loginTitle">Staff login</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close">${X}</button></div>
    <div class="login-body">
      <p>Staff sign in with a GitHub access token. Your GitHub account needs edit access to <b>${esc(GH.owner)}/${esc(GH.repo)}</b>.</p>
      <ol class="login-steps">
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a token on GitHub</a>. The link fills in the settings for you. Pick an expiry date, then click <b>Generate token</b>.</li>
        <li>Copy the token and paste it below.</li>
      </ol>
      <div class="field"><label for="tokenInput">Access token</label><input id="tokenInput" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…"></div>
      <label class="check"><input type="checkbox" id="rememberMe"> Keep me signed in on this computer</label>
      <p class="hint">The token stays in this browser and is only ever sent to GitHub. Leave the box unticked on a shared computer.</p>
      <p class="form-error" id="loginError" role="alert"></p>
    </div>
    <div class="co-foot"><span></span><button type="submit" class="btn btn-yellow" id="loginBtn">Sign in</button></div>
  </form>
</dialog>

<dialog class="admin" id="adminDlg" aria-labelledby="adminTitle">
  <div class="co-head">
    <div class="admin-head-text"><h2 class="dialog-title" id="adminTitle">Stock manager</h2><span class="admin-who" id="adminWho"></span></div>
    <div class="admin-head-actions"><button type="button" class="link-btn on-dark-link" id="adminSignOut">Sign out</button><button type="button" class="icon-btn on-dark" data-close aria-label="Close stock manager">${X}</button></div>
  </div>
  <div class="admin-bar">
    <label class="search"><span class="sr-only">Search stock</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="aQ" placeholder="Search stock" autocomplete="off"></label>
    <label><span class="sr-only">Category</span><select class="admin-select" id="aCat"><option value="all">All categories</option>${shop.CATEGORIES.filter(c => c.key !== "all").map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("")}</select></label>
    <button type="button" class="btn btn-small" id="aAdd">+ Add item</button>
    <div class="admin-publish">
      <span class="admin-changes" id="aChanges">No unpublished changes</span>
      <button type="button" class="link-btn" id="aDiscard" hidden>Discard</button>
      <button type="button" class="btn btn-yellow btn-small" id="aPublish" disabled>Publish changes</button>
    </div>
  </div>
  <div class="admin-msg" id="aMsg" role="status"></div>
  <div class="admin-list" id="aList"></div>
</dialog>

<dialog class="editor" id="editDlg" aria-labelledby="edTitle">
  <form id="edForm" novalidate>
    <div class="co-head"><h2 class="dialog-title" id="edTitle">Edit item</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close without saving">${X}</button></div>
    <div class="ed-grid">
      <div class="ed-cover">
        <div class="ed-preview" id="edPreview"></div>
        <label class="btn btn-small file-btn">Upload cover photo<input type="file" accept="image/*" id="edFile" class="sr-only"></label>
        <button type="button" class="link-btn" id="edRemoveImg" hidden>Use a drawn cover instead</button>
        <div id="edArt">
          <div class="field"><label for="ed-motif">Drawn cover picture</label><select id="ed-motif">${shop.MOTIFS.map(m => `<option value="${m}">${esc(MOTIF_LABELS[m] || m)}</option>`).join("")}</select></div>
          <div class="field"><label for="ed-pal">Drawn cover colours</label><select id="ed-pal">${Array.from({ length: shop.PALETTES }, (_, i) => `<option value="${i}">${esc(PAL_LABELS[i] || "Colours " + (i + 1))}</option>`).join("")}</select></div>
        </div>
        <p class="hint" id="edImgHint">Photos are resized to 600px wide before they're saved.</p>
      </div>
      <div class="ed-fields">
        <div class="two">
          <div class="field"><label for="ed-cat">Category</label><select id="ed-cat">${shop.CATEGORIES.filter(c => c.key !== "all").map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("")}</select></div>
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
          <div class="field" data-for="issues"><label for="ed-tagline">Cover tagline</label><input id="ed-tagline" autocomplete="off" maxlength="34" placeholder="Short line printed on the drawn cover"></div>
        </div>
        <div class="two">
          <div class="field"><label for="ed-price">Price ($)</label><input id="ed-price" type="number" min="0" step="1" inputmode="numeric"><p class="error" id="e-ed-price" hidden></p></div>
          <div class="field"><label for="ed-stock">Copies in stock</label><input id="ed-stock" type="number" min="0" step="1" inputmode="numeric"><p class="error" id="e-ed-stock" hidden></p></div>
        </div>
        <div class="field"><label for="ed-blurb">Description</label><textarea id="ed-blurb" rows="3" placeholder="One or two sentences shown in the details panel"></textarea></div>
        <div class="field"><label for="ed-staff">Staff pick note <span class="opt">(optional)</span></label><input id="ed-staff" autocomplete="off" placeholder="Leave empty if it isn't a staff pick"></div>
        <p class="group-label">Labels</p>
        <div class="checks">
          <label class="check"><input type="checkbox" id="ed-b-new"> New</label>
          <label class="check"><input type="checkbox" id="ed-b-variant"> Variant</label>
          <label class="check"><input type="checkbox" id="ed-b-exclusive"> Exclusive</label>
          <label class="check"><input type="checkbox" id="ed-week"> Show in “New this week”</label>
        </div>
        <p class="hint" id="ed-week-hint">The first three items marked for “New this week” appear at the top of the shop.</p>
      </div>
    </div>
    <div class="co-foot ed-foot">
      <div id="edDeleteWrap"><button type="button" class="link-btn danger-link" id="edDelete">Delete item</button></div>
      <p class="form-error" id="edError" role="alert"></p>
      <div class="ed-actions"><button type="button" class="btn btn-small" data-close>Cancel</button><button type="submit" class="btn btn-yellow btn-small" id="edSave">Save item</button></div>
    </div>
  </form>
</dialog>`);

const loginDlg = $("loginDlg"), adminDlg = $("adminDlg"), editDlg = $("editDlg");
[loginDlg, adminDlg, editDlg].forEach(d => d.addEventListener("click", ev => { if (ev.target === d) d.close(); }));

/* ---------- messages ---------- */
function say(text, kind = "", actions = []) {
  const el = $("aMsg");
  el.className = "admin-msg" + (kind ? " " + kind : "");
  el.innerHTML = text ? `<span>${esc(text)}</span>` : "";
  actions.forEach(a => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-small" + (a.danger ? " btn-danger" : ""); b.textContent = a.label;
    b.addEventListener("click", a.fn);
    el.appendChild(b);
  });
}

/* ---------- sign in / out ---------- */
async function signIn(token, remember, quiet) {
  S.token = token.trim();
  if (!S.token) throw friendly("Paste your access token first.");
  if (!GH.owner || !GH.repo) throw friendly("The shop's GitHub repository isn't set in shop-data.js (CONFIG.github).");
  const user = await gh("/user");
  const repo = await gh(repoPath(""));
  if (!repo.permissions || !repo.permissions.push) throw friendly(`@${user.login} can't edit ${GH.owner}/${GH.repo}. Ask the shop owner to add you as a collaborator in the repo's settings.`);
  S.login = user.login;
  if (!quiet || remember !== undefined) tokenStore.set(S.token, remember);
  await loadStock();
  $("adminWho").textContent = "@" + S.login;
  $("adminBtn").hidden = false;
  updateCounts();
}
async function loadStock() {
  const ref = await gh(repoPath(`/git/ref/heads/${encodeURIComponent(GH.branch)}`));
  const file = await gh(repoPath(`/contents/${DATA_PATH}?ref=${ref.object.sha}`));
  const data = parseShopData(b64ToText(file.content));
  S.dataSha = file.sha;
  S.config = data.FLICKERS_CONFIG || shop.CONFIG;
  S.categories = data.FLICKERS_CATEGORIES || shop.CATEGORIES;
  S.orig = clone(data.FLICKERS_PRODUCTS);
  S.draft = clone(data.FLICKERS_PRODUCTS);
  S.origNew = (data.FLICKERS_NEW_THIS_WEEK || []).slice();
  S.draftNew = S.origNew.slice();
  S.ready = true;
  preview();
}
function signOut() {
  tokenStore.clear();
  const hadChanges = S.ready && changeList().count > 0;
  Object.assign(S, { token: "", login: "", ready: false });
  $("adminBtn").hidden = true;
  if (hadChanges) shop.apply(clone(S.orig), S.origNew);
  if (editDlg.open) editDlg.close();
  if (adminDlg.open) adminDlg.close();
  shop.toast("Signed out of the stock manager.");
}
function askSignOut() {
  if (S.ready && changeList().count > 0) {
    say("You have unpublished changes. Signing out throws them away.", "error", [{ label: "Sign out anyway", danger: true, fn: signOut }, { label: "Keep editing", fn: () => say("") }]);
  } else signOut();
}

function openLogin() {
  if (S.ready) { openAdmin(); return; }
  $("loginError").textContent = "";
  $("tokenInput").value = "";
  loginDlg.showModal();
  $("tokenInput").focus();
}
$("loginForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const btn = $("loginBtn");
  $("loginError").textContent = "";
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    await signIn($("tokenInput").value, $("rememberMe").checked);
    $("tokenInput").value = "";
    loginDlg.close();
    openAdmin();
    shop.toast(`Signed in as @${S.login}.`);
  } catch (e) {
    S.token = "";
    $("loginError").textContent = e.friendly ? e.message : "Something went wrong signing in. Try again.";
  }
  btn.disabled = false; btn.textContent = "Sign in";
});

/* ---------- stock list ---------- */
function preview() { shop.apply(clone(S.draft), S.draftNew); updateCounts(); }
function updateCounts() {
  if (!S.ready) return;
  const c = changeList();
  const label = c.count ? `${c.count} unpublished change${c.count === 1 ? "" : "s"}` : "No unpublished changes";
  $("aChanges").textContent = label;
  $("aChanges").classList.toggle("has", c.count > 0);
  $("aPublish").disabled = c.count === 0 || S.busy;
  $("aDiscard").hidden = c.count === 0;
  $("adminCount").hidden = c.count === 0;
  $("adminCount").textContent = c.count;
  $("adminBtn").setAttribute("aria-label", `Manage stock${c.count ? `, ${label}` : ""}`);
  return c;
}
function rowPills(p, c) {
  const pills = [];
  if (c.added.has(p.id)) pills.push(`<span class="pill pill-added">Added</span>`);
  else if (c.edited.has(p.id)) pills.push(`<span class="pill pill-edit">Edited</span>`);
  if (S.draftNew.slice(0, 3).includes(p.id)) pills.push(`<span class="pill pill-week">New this week</span>`);
  if (p.stock <= 0) pills.push(`<span class="pill">Sold out</span>`);
  return pills.join("");
}
function renderList() {
  const c = updateCounts();
  const q = $("aQ").value.trim().toLowerCase(), cat = $("aCat").value;
  const list = S.draft.filter(p => (cat === "all" || p.cat === cat) && (!q || [shop.fullTitle(p), p.publisher].join(" ").toLowerCase().includes(q)));
  $("aList").innerHTML = list.length ? list.map(p => {
    const t = shop.fullTitle(p);
    return `<div class="arow" data-row="${esc(p.id)}">
      <div class="arow-thumb">${shop.coverHTML(p)}</div>
      <div class="arow-info"><p class="arow-title">${esc(t)}</p><p class="arow-meta"><span>${esc(shop.metaLine(p))}</span><span class="arow-pills">${rowPills(p, c)}</span></p></div>
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
  row.querySelector(".arow-thumb").innerHTML = shop.coverHTML(p);
}
function openAdmin() {
  if (!S.ready) { openLogin(); return; }
  say("");
  renderList();
  if (!adminDlg.open) adminDlg.showModal();
}
$("aQ").addEventListener("input", renderList);
$("aCat").addEventListener("change", renderList);
$("aList").addEventListener("change", ev => {
  const t = ev.target, id = t.dataset.price || t.dataset.stock;
  if (!id) return;
  const p = S.draft.find(x => x.id === id); if (!p) return;
  const n = Number(t.value);
  if (!Number.isFinite(n) || n < 0 || (t.dataset.stock && !Number.isInteger(n))) {
    t.value = t.dataset.price ? p.price : p.stock;
    say(t.dataset.price ? "Prices must be 0 or more." : "Stock must be a whole number, 0 or more.", "error");
    return;
  }
  if (t.dataset.price) p.price = n; else p.stock = n;
  say("");
  preview(); refreshRow(id);
});
$("aList").addEventListener("click", ev => { const b = ev.target.closest("[data-edit]"); if (b) openEditor(b.dataset.edit); });
$("aAdd").addEventListener("click", () => openEditor(null));
$("aDiscard").addEventListener("click", () => say("Throw away all unpublished changes?", "error", [
  { label: "Discard changes", danger: true, fn: () => { S.draft = clone(S.orig); S.draftNew = S.origNew.slice(); preview(); renderList(); say("Changes discarded.", "ok"); } },
  { label: "Keep them", fn: () => say("") }
]));
$("aPublish").addEventListener("click", publish);
$("adminSignOut").addEventListener("click", askSignOut);
$("adminBtn").addEventListener("click", openAdmin);
$("staffLogin").addEventListener("click", openLogin);

/* ---------- item editor ---------- */
const ED = { id: null, image: null, isNew: false };
const F = n => $("ed-" + n);
function fieldVisibility() {
  const cat = F("cat").value;
  editDlg.querySelectorAll("[data-for]").forEach(el => { el.hidden = !el.dataset.for.split(" ").includes(cat); });
  $("ed-num-label").textContent = cat === "funko" ? "Figure number" : "Issue number";
  F("num").placeholder = cat === "funko" ? "No. 01" : "#1";
  $("ed-variant-label").textContent = cat === "funko" ? "Finish" : "Variant";
}
function formProduct() {
  const cat = F("cat").value, vis = k => !editDlg.querySelector(`[data-for] #ed-${k}`) || !F(k).closest("[data-for]").hidden;
  const val = k => (vis(k) ? F(k).value.trim() : "");
  const base = ED.isNew ? {} : clone(S.draft.find(p => p.id === ED.id) || {});
  const badges = ["new", "variant", "exclusive"].filter(b => $("ed-b-" + b).checked);
  const p = Object.assign(base, {
    id: ED.id || "preview-item", cat, title: F("title").value.trim(),
    num: val("num"), vol: val("vol"), subtitle: val("subtitle"), variant: val("variant"), collects: val("collects"),
    pages: val("pages") ? Number(val("pages")) : "", grade: val("grade"), publisher: F("publisher").value.trim(),
    price: F("price").value === "" ? NaN : Number(F("price").value), stock: F("stock").value === "" ? NaN : Number(F("stock").value),
    blurb: F("blurb").value.trim(), tagline: val("tagline"), badges, staff: F("staff").value.trim(),
    image: ED.image || "", art: { motif: F("motif").value, pal: Number(F("pal").value) }
  });
  return p;
}
let previewTimer = 0;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const p = formProduct();
    const shown = Object.assign({}, p, { title: p.title || "Untitled", stock: Number.isFinite(p.stock) ? p.stock : 1, price: p.price || 0 });
    $("edPreview").innerHTML = shop.coverPreview(shown);
    $("edRemoveImg").hidden = !ED.image;
    $("edArt").hidden = !!ED.image;
  }, 120);
}
function openEditor(id) {
  const p = id ? S.draft.find(x => x.id === id) : null;
  ED.id = p ? p.id : null; ED.isNew = !p; ED.image = p && p.image ? p.image : null;
  $("edTitle").textContent = p ? "Edit item" : "Add item";
  $("edError").textContent = "";
  ["title", "price", "stock"].forEach(k => { $("e-ed-" + k).hidden = true; F(k).removeAttribute("aria-invalid"); });
  F("cat").value = p ? p.cat : ($("aCat").value !== "all" ? $("aCat").value : "issues");
  ["publisher", "title", "num", "vol", "grade", "pages", "subtitle", "collects", "variant", "tagline", "blurb", "staff"].forEach(k => { F(k).value = p && p[k] != null ? p[k] : ""; });
  F("price").value = p ? p.price : "";
  F("stock").value = p ? p.stock : 1;
  const art = (p && p.art) || { motif: shop.MOTIFS[Math.floor(Math.random() * shop.MOTIFS.length)], pal: Math.floor(Math.random() * shop.PALETTES) };
  F("motif").value = art.motif; F("pal").value = String(art.pal);
  ["new", "variant", "exclusive"].forEach(b => { $("ed-b-" + b).checked = !!(p && (p.badges || []).includes(b)); });
  F("week").checked = !!(p && S.draftNew.includes(p.id));
  $("edFile").value = "";
  $("edDeleteWrap").hidden = !p;
  resetDelete();
  fieldVisibility();
  updatePreview();
  editDlg.showModal();
  F("title").focus();
}
function resetDelete() {
  $("edDeleteWrap").innerHTML = `<button type="button" class="link-btn danger-link" id="edDelete">Delete item</button>`;
  $("edDelete").addEventListener("click", () => {
    const p = S.draft.find(x => x.id === ED.id);
    $("edDeleteWrap").innerHTML = `<span class="inline-confirm">Delete ${esc(p ? shop.fullTitle(p) : "this item")}?<button type="button" class="btn btn-small btn-danger" id="edDeleteYes">Delete</button><button type="button" class="btn btn-small" id="edDeleteNo">Keep</button></span>`;
    $("edDeleteYes").addEventListener("click", () => {
      S.draft = S.draft.filter(x => x.id !== ED.id);
      S.draftNew = S.draftNew.filter(x => x !== ED.id);
      editDlg.close();
      preview(); renderList();
      say(`Deleted ${p ? shop.fullTitle(p) : "the item"}. It leaves the shop when you publish.`, "ok");
    });
    $("edDeleteNo").addEventListener("click", () => { resetDelete(); $("edDelete").focus(); });
    $("edDeleteNo").focus();
  });
}
editDlg.addEventListener("input", ev => { if (ev.target.id !== "edFile") updatePreview(); });
F("cat").addEventListener("change", () => { fieldVisibility(); updatePreview(); });
$("edRemoveImg").addEventListener("click", () => { ED.image = null; $("edFile").value = ""; updatePreview(); F("motif").focus(); });
$("edFile").addEventListener("change", async () => {
  const file = $("edFile").files[0];
  if (!file) return;
  $("edError").textContent = "";
  try { ED.image = await shrinkImage(file); updatePreview(); }
  catch (e) { $("edError").textContent = e.message; }
});
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
$("edForm").addEventListener("submit", ev => {
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
  if (ED.isNew) {
    p.id = uniqueId(slug([p.title, p.num || p.vol].filter(Boolean).join(" ")));
    S.draft.unshift(p);
  } else {
    const i = S.draft.findIndex(x => x.id === ED.id);
    S.draft[i] = p;
  }
  const inWeek = S.draftNew.includes(p.id);
  if (F("week").checked && !inWeek) S.draftNew.push(p.id);
  if (!F("week").checked && inWeek) S.draftNew = S.draftNew.filter(x => x !== p.id);
  editDlg.close();
  preview(); renderList();
  const extra = F("week").checked && S.draftNew.indexOf(p.id) > 2 ? " Three other items are already in “New this week”, so untick one of those for it to show." : "";
  say(`${ED.isNew ? "Added" : "Saved"} ${shop.fullTitle(p)}. Click “Publish changes” when you're ready for customers to see it.${extra}`, "ok");
  const row = $("aList").querySelector(`[data-row="${CSS.escape(p.id)}"] [data-edit]`);
  if (row) row.focus();
});

/* ---------- publish ---------- */
async function publish() {
  if (S.busy || !S.ready) return;
  const changes = changeList();
  if (!changes.count) return;
  S.busy = true; updateCounts();
  const btn = $("aPublish"); btn.textContent = "Publishing…";
  say("Saving to GitHub…");
  try {
    const ref = await gh(repoPath(`/git/ref/heads/${encodeURIComponent(GH.branch)}`));
    const head = ref.object.sha;
    const current = await gh(repoPath(`/contents/${DATA_PATH}?ref=${head}`));
    if (current.sha !== S.dataSha) throw Object.assign(friendly("Someone else published stock changes after you loaded the stock. Reload to get their changes. Your unpublished edits will be lost, so note them down first."), { conflict: true });
    const commit = await gh(repoPath(`/git/commits/${head}`));
    const products = clone(S.draft), tree = [], overrides = {}, stamp = Date.now().toString(36);
    for (const p of products) {
      if (p.image && p.image.startsWith("data:")) {
        const blob = await gh(repoPath("/git/blobs"), { method: "POST", body: { content: p.image.split(",")[1], encoding: "base64" } });
        const path = `${COVER_DIR}${p.id}-${stamp}.jpg`;
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
        overrides[path] = p.image;
        p.image = path;
      }
    }
    const used = new Set(products.map(p => p.image).filter(Boolean));
    new Set(S.orig.map(p => p.image).filter(src => src && src.startsWith(COVER_DIR) && !used.has(src)))
      .forEach(path => tree.push({ path, mode: "100644", type: "blob", sha: null }));
    const text = buildDataFile(products, S.draftNew);
    const dataBlob = await gh(repoPath("/git/blobs"), { method: "POST", body: { content: text, encoding: "utf-8" } });
    tree.push({ path: DATA_PATH, mode: "100644", type: "blob", sha: dataBlob.sha });
    const newTree = await gh(repoPath("/git/trees"), { method: "POST", body: { base_tree: commit.tree.sha, tree } });
    const parts = [];
    if (changes.added.size) parts.push(`${changes.added.size} added`);
    if (changes.edited.size) parts.push(`${changes.edited.size} edited`);
    if (changes.removed.length) parts.push(`${changes.removed.length} removed`);
    if (changes.weekChanged) parts.push("new this week updated");
    const newCommit = await gh(repoPath("/git/commits"), { method: "POST", body: { message: `Update stock: ${parts.join(", ")}`, tree: newTree.sha, parents: [head] } });
    await gh(repoPath(`/git/refs/heads/${encodeURIComponent(GH.branch)}`), { method: "PATCH", body: { sha: newCommit.sha, force: false } });
    Object.assign(shop.imageOverride, overrides);
    S.dataSha = dataBlob.sha;
    S.orig = clone(products); S.draft = clone(products); S.origNew = S.draftNew.slice();
    S.busy = false;
    preview(); renderList();
    say("Published. Customers see the changes within a couple of minutes.", "ok");
    shop.toast("Stock published.");
  } catch (e) {
    S.busy = false; updateCounts();
    const actions = e.conflict ? [{ label: "Reload stock", danger: true, fn: async () => { try { await loadStock(); renderList(); say("Stock reloaded from GitHub.", "ok"); } catch (err) { say(err.friendly ? err.message : "Couldn't reload the stock.", "error"); } } }] : [];
    say(e.friendly ? e.message : "Publishing failed. Nothing was changed. Try again.", "error", actions);
  }
  btn.textContent = "Publish changes";
}

/* ---------- start ---------- */
window.addEventListener("beforeunload", ev => { if (S.ready && changeList().count > 0) { ev.preventDefault(); ev.returnValue = ""; } });
if (location.hash === "#admin") setTimeout(openLogin, 0);
window.addEventListener("hashchange", () => { if (location.hash === "#admin") openLogin(); });
const saved = tokenStore.get();
if (saved) signIn(saved, undefined, true).catch(() => { tokenStore.clear(); S.token = ""; });
})();
