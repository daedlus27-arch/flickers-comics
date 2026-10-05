/* Staff area: the Orders tab. */
import { esc, escLines, money } from "../shared.mjs";
import { $, api, say, orderWhen, pager } from "./core.js";

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

/* A spreadsheet opens a cell that starts with = + - or @ as a formula, so typed text like that is defused with a leading quote. */
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function ordersCsv(orders) {
  const head = ["Order", "Placed", "Status", "Paid", "Customer", "Phone", "Method", "Collect on", "Address", "Items", "Subtotal", "Deal discount", "Postage", "Total", "Notes"];
  const rows = orders.map(o => [o.id, o.placedAt, STATUS_NAME(o), o.paid ? "Yes" : "No", o.name, o.phone, o.method === "post" ? "Post" : "Collect", o.collectDate || "", o.address || "",
    o.items.map(i => `${i.qty} x ${i.title}`).join("; "), o.subtotal, o.discount || 0, o.postage, o.total, o.notes || ""]);
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
      ${o.discount ? `<dt>Deal</dt><dd>${esc(o.deal || "Deal")}: −${money(o.discount)}</dd>` : ""}
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

export async function renderOrders() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div>
    <div class="orders-top" id="ordersTop"><p class="hint">Loading…</p></div>
    <div class="orders-filter" id="ordersFilter" role="group" aria-label="Show orders"></div>
    <div id="ordersList"></div>`;
  let data;
  try { data = await api("/orders"); } catch (e) { say(e.message, "error"); return; }
  const pg = pager("/orders", "orders", data), orders = pg.items, open = new Set();
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
    $("ordersList").insertAdjacentHTML("beforeend", pg.html("orders"));
    $("csvBtn").disabled = !orders.length;
  };
  $("ordersFilter").addEventListener("click", ev => {
    const b = ev.target.closest("[data-filter]"); if (!b) return;
    filter = b.dataset.filter; paint();
    $("ordersFilter").querySelector(`[data-filter="${filter}"]`).focus();
  });
  $("ordersList").addEventListener("toggle", ev => { const id = ev.target.dataset && ev.target.dataset.order; if (id) (ev.target.open ? open.add(id) : open.delete(id)); }, true);
  $("ordersList").addEventListener("click", async ev => {
    const more = ev.target.closest("[data-more]");
    if (more) { more.disabled = true; try { await pg.more(); paint(); } catch (e) { more.disabled = false; say(e.message, "error"); } return; }
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
