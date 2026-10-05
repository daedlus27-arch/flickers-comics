/* Flickers Comics staff area.
   Staff sign in with a username and password. Stock is loaded from and published to the staff API
   (the Cloudflare Worker in worker/), which does the GitHub commit. No GitHub token is ever in the browser.
   This file signs people in and switches between the tabs; each tab lives in its own file in this folder. */
import { esc } from "../shared.mjs";
import { app, API, $, S, hooks, sessionStore, api, say } from "./core.js";
import { changeList, loadStock, renderStock, initCoverDrops } from "./stock.js";
import { renderOrders } from "./orders.js";
import { renderWanted } from "./wanted.js";
import { renderStaff, renderAccount } from "./staff.js";

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

const TABS = [["stock", "Stock"], ["orders", "Orders"], ["wanted", "Wanted"], ["staff", "Staff"], ["account", "My password"]];
async function showTab(key) {
  S.tab = key;
  if (S.tab === "stock" && S.draft.length && changeList().count === 0) { try { await loadStock(); } catch (e) { /* show what we already have */ } } // pick up stock that orders have used
  renderShell();
}
function renderShell() {
  const owner = S.user.role === "owner";
  app.innerHTML = `<div class="adm-wrap">
    <div class="adm-top">
      <h1>Shop manager</h1>
      <div class="adm-who"><span>Signed in as <b>${esc(S.user.username)}</b>${owner ? " (owner)" : ""}</span><button type="button" class="link-btn" id="signOut">Sign out</button></div>
    </div>
    <div class="adm-tabs" role="tablist" aria-label="Staff area">
      ${TABS.filter(([key]) => key !== "staff" || owner).map(([key, name]) => `<button type="button" class="adm-tab" role="tab" id="tab-${key}" data-tab="${key}" aria-selected="${S.tab === key}" aria-controls="panel" tabindex="${S.tab === key ? 0 : -1}">${name}</button>`).join("")}
    </div>
    <div class="adm-panel" id="panel" role="tabpanel" aria-labelledby="tab-${S.tab}"></div>
  </div>
  <dialog class="editor" id="editDlg" aria-labelledby="edTitle"></dialog>
  <dialog class="prompt" id="bulkDlg" aria-labelledby="bulkTitle"></dialog>`;
  $("signOut").addEventListener("click", askSignOut);
  const tabs = [...app.querySelectorAll("[data-tab]")];
  tabs.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("panel").previousElementSibling.addEventListener("keydown", async ev => { // arrow keys move between tabs, as screen reader users expect from a tab list
    const at = tabs.indexOf(document.activeElement), step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    const to = ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1 : step && at >= 0 ? (at + step + tabs.length) % tabs.length : -1;
    if (to < 0) return;
    ev.preventDefault();
    await showTab(tabs[to].dataset.tab);
    $("tab-" + tabs[to].dataset.tab).focus();
  });
  $("editDlg").addEventListener("click", ev => { if (ev.target === $("editDlg")) $("editDlg").close(); });
  initCoverDrops();
  if (S.tab === "stock") renderStock();
  else if (S.tab === "orders") renderOrders();
  else if (S.tab === "wanted") renderWanted();
  else if (S.tab === "staff" && owner) renderStaff();
  else { S.tab = "account"; renderAccount(); }
}
function askSignOut() {
  if (changeList().count > 0 && S.tab === "stock") {
    say("You have unpublished changes. Signing out throws them away.", "error", [{ label: "Sign out anyway", danger: true, fn: () => endSession("Signed out.") }, { label: "Keep editing", fn: () => say("") }]);
  } else endSession("Signed out.");
}

/* ---------- start ---------- */
hooks.hasUnpublished = () => S.draft.length > 0 && changeList().count > 0;
hooks.endSession = endSession;
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
