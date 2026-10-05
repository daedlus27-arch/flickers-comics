/* Staff area: the Wanted tab (notify me, pull list, requests). */
import { esc } from "../shared.mjs";
import { $, api, say, orderWhen, pager, copyText } from "./core.js";
import { wantMessage } from "./messages.js";

/* ---------- wanted tab ---------- */
const WANT_KIND = { restock: "Back in stock", series: "Pull list", request: "Request" };
function wantSummary(w) {
  if (w.kind === "restock") return { target: w.title, line: w.backAt ? `Back in stock since ${orderWhen(w.backAt)}. Contact them.` : "Waiting for it to come back in stock." };
  if (w.kind === "series") return { target: `Follows ${w.series}`, line: w.latest ? `New issue: ${w.latest.title} (${orderWhen(w.latest.at)}). ${w.status === "contacted" ? "Contacted." : "Set one aside and contact them."}` : "Waiting for a new issue." };
  return { target: w.text, line: "Asked if we can get this in." };
}
const wantNeedsAction = w => w.status !== "contacted" && (w.kind === "request" || !!w.backAt || !!w.latest);
function wantHTML(w) {
  const s = wantSummary(w), act = wantNeedsAction(w);
  return `<li class="want${act ? " is-action" : ""}${w.status === "contacted" ? " is-done" : ""}" data-want="${esc(w.id)}">
    <div class="want-main">
      <p class="want-target"><span class="pill ${act ? "pill-edit" : ""}">${esc(WANT_KIND[w.kind])}</span> <b>${esc(s.target)}</b></p>
      <p class="want-line">${esc(s.line)}</p>
      <p class="want-who">${esc(w.name)} · <a href="tel:${esc(String(w.phone).replace(/[^\d+]/g, ""))}">${esc(w.phone)}</a> · asked ${esc(orderWhen(w.createdAt))}${w.contactedBy ? ` · contacted by ${esc(w.contactedBy)}` : ""}</p>
    </div>
    <div class="want-actions">
      <button type="button" class="btn btn-small${act ? " btn-yellow" : ""}" data-wstatus="${w.status === "contacted" ? "waiting" : "contacted"}" data-wid="${esc(w.id)}">${w.status === "contacted" ? "Back to waiting" : "Mark contacted"}</button>
      <button type="button" class="btn btn-small btn-quiet" data-wcopy="${esc(w.id)}">Copy message</button>
      <button type="button" class="link-btn danger-link" data-wdelete="${esc(w.id)}" aria-label="Remove ${esc(w.name)}'s request">Remove</button>
    </div>
  </li>`;
}
export async function renderWanted() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div>
    <div class="orders-top"><p class="hint">What customers have asked for: to be told when a sold-out comic is back, to follow a series (a pull list), or to request a comic you don't stock.
      When you restock something or add a new issue of a followed series, the people to contact are posted to Discord and flagged here. Requests are kept for 120 days.</p></div>
    <div id="wantedList"><p class="hint">Loading…</p></div>`;
  let data;
  try { data = await api("/wants"); } catch (e) { say(e.message, "error"); $("wantedList").innerHTML = ""; return; }
  const pg = pager("/wants", "wants", data), wants = pg.items;
  const paint = () => {
    const todo = wants.filter(wantNeedsAction), waiting = wants.filter(w => w.status !== "contacted" && !wantNeedsAction(w)), done = wants.filter(w => w.status === "contacted");
    const section = (title, list, empty) => `<h2 class="want-h">${title} <span class="pill">${list.length}</span></h2>${list.length ? `<ul class="wants">${list.map(wantHTML).join("")}</ul>` : `<p class="admin-empty">${empty}</p>`}`;
    $("wantedList").innerHTML = wants.length
      ? section("Ready to contact", todo, "Nobody to contact right now.") + section("Waiting", waiting, "Nobody waiting.") + section("Contacted", done, "No one contacted yet.")
      : `<p class="admin-empty">Nothing here yet. Requests appear when customers use Notify me, Follow, or Request a comic on the shop.</p>`;
    $("wantedList").insertAdjacentHTML("beforeend", pg.html("requests"));
  };
  $("wantedList").addEventListener("click", async ev => {
    const more = ev.target.closest("[data-more]"), s = ev.target.closest("[data-wid]"), d = ev.target.closest("[data-wdelete]"), c = ev.target.closest("[data-wcopy]");
    if (c) { const w = wants.find(x => x.id === c.dataset.wcopy); if (w) copyText(wantMessage(w), `Message for ${w.name} copied. Paste it into your text.`); return; }
    if (more) { more.disabled = true; try { await pg.more(); paint(); } catch (e) { more.disabled = false; say(e.message, "error"); } return; }
    if (s) {
      s.disabled = true;
      api(`/wants/${encodeURIComponent(s.dataset.wid)}`, { method: "POST", body: { status: s.dataset.wstatus } })
        .then(r => { Object.assign(wants.find(w => w.id === s.dataset.wid), r.want); say(""); paint(); })
        .catch(e => { s.disabled = false; say(e.message, "error"); });
    } else if (d) {
      const w = wants.find(x => x.id === d.dataset.wdelete);
      say(`Remove ${w.name}'s request? They won't be notified.`, "error", [
        { label: "Remove", danger: true, fn: async () => { try { await api(`/wants/${encodeURIComponent(w.id)}`, { method: "DELETE" }); wants.splice(wants.indexOf(w), 1); say("Removed.", "ok"); paint(); } catch (e) { say(e.message, "error"); } } },
        { label: "Keep it", fn: () => say("") }
      ]);
    }
  });
  paint();
}
