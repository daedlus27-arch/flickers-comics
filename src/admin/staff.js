/* Staff area: managing staff accounts (owner) and changing your own password. */
import { esc } from "../shared.mjs";
import { $, X, S, sessionStore, api, say } from "./core.js";

/* ---------- staff tab (owner) ---------- */
export async function renderStaff() {
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
export function renderAccount() {
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
