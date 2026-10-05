/* Staff area: what every part shares (state, the staff API, messages). */
import { esc } from "../shared.mjs";

export const app = document.getElementById("app");
export const API = (app.dataset.api || "").replace(/\/+$/, "");
const SESSION_KEY = "flickers-staff-session";
export const $ = id => document.getElementById(id);
export const clone = o => JSON.parse(JSON.stringify(o));
export const canon = v => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}`
  : JSON.stringify(v);
export const X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

export const S = { token: "", exp: 0, user: null, tab: "stock", version: "", orig: [], draft: [], origFeat: [], draftFeat: [], uploads: {}, previews: {}, busy: false, users: [], selected: new Set() };

/* The entry point fills these in, so this file doesn't depend on the stock list or the sign-in screens. */
export const hooks = { hasUnpublished: () => false, endSession: () => {} };

/* ---------- session ---------- */
export const sessionStore = {
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
export async function api(path, opts = {}, retried = false) {
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
      if (!retried && S.user && hooks.hasUnpublished() && await reauth()) return api(path, opts, true);
      hooks.endSession("Your session has ended. Sign in again.");
    }
    throw new ApiError(data.error || `The staff service answered ${res.status}.`, res.status);
  }
  return data;
}

/* ---------- messages ---------- */
export function say(text, kind = "", actions = []) {
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

export const orderWhen = iso => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/* Orders and requests arrive a page at a time (newest first). This keeps the loaded items, and a button that fetches the next page. */
export function pager(path, key, first) {
  const items = [...first[key]], state = { items, cursor: first.cursor || null };
  state.more = async () => {
    const r = await api(`${path}?cursor=${encodeURIComponent(state.cursor)}`);
    const have = new Set(items.map(x => x.id));
    r[key].forEach(x => { if (!have.has(x.id)) items.push(x); });
    state.cursor = r.cursor || null;
  };
  state.html = (what) => state.cursor ? `<p class="hint orders-more">Showing the newest ${items.length} ${what}. <button type="button" class="btn btn-small" data-more>Show older ${what}</button></p>` : "";
  return state;
}
