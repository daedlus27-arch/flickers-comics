/* Staff area: the Sales tab (owner only). Figures come from the Worker's sales report, which keeps a small record of every order
   (what was bought, when, for how much, never who by) long after the order itself has been deleted. */
import { esc, money } from "../shared.mjs";
import { $, api, say } from "./core.js";

const WEEK_CHOICES = [[4, "Last 4 weeks"], [8, "Last 8 weeks"], [12, "Last 12 weeks"], [26, "Last 6 months"], [52, "Last year"]];
const weekOf = iso => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lasted = h => {
  if (h < 1) return count(Math.max(1, Math.round(h * 60)), "minute");
  if (h < 48) return h < 10 && Math.round(h * 10) % 10 ? `${h.toFixed(1)} hours` : count(Math.round(h), "hour");
  return `${(h / 24).toFixed(1)} days`;
};
const stat = (label, value, note = "") => `<div class="stat"><span class="stat-label">${esc(label)}</span><b>${esc(value)}</b>${note ? `<span class="stat-note">${esc(note)}</span>` : ""}</div>`;

function reportHTML(r) {
  const t = r.totals, top = Math.max(1, ...r.weeks.map(w => w.revenue));
  if (!t.orders && !t.cancelled) return `<p class="admin-empty">No orders in this period yet. Sales appear here as customers order.</p>`;
  const rows = r.weeks.map(w => `<tr><th scope="row">${weekOf(w.start)}</th>
      <td class="sales-bar"><span class="track" aria-hidden="true">${w.revenue ? `<span class="bar" style="width:${Math.max(2, Math.round(w.revenue / top * 100))}%"></span>` : ""}</span><span>${money(w.revenue)}</span></td>
      <td>${w.orders}</td><td>${w.units}</td><td>${w.discount ? money(w.discount) : "–"}</td></tr>`).join("");
  const best = r.best.length ? `<table class="sales-table"><caption>Best sellers (copies sold)</caption>
      <thead><tr><th scope="col">Comic</th><th scope="col">Copies</th><th scope="col">Takings</th></tr></thead>
      <tbody>${r.best.map(b => `<tr><th scope="row">${esc(b.title)}</th><td>${b.units}</td><td>${money(b.revenue)}</td></tr>`).join("")}</tbody></table>` : "";
  const timing = r.timing.count
    ? `${r.timing.count} order${r.timing.count === 1 ? " was" : "s were"} collected or posted. On average that took ${lasted(r.timing.averageHours)} from order to hand-over; half took ${lasted(r.timing.medianHours)} or less.`
    : "No order has been collected or posted in this period yet, so there's no hand-over time to show.";
  return `<div class="stats">
      ${stat("Takings", money(t.revenue), "postage included")}
      ${stat("Orders", String(t.orders), `${t.collect} to collect, ${t.post} posted`)}
      ${stat("Copies sold", String(t.units))}
      ${stat("Average order", money(t.average))}
      ${stat("Paid so far", money(t.paid), t.revenue ? `${Math.round(t.paid / t.revenue * 100)}% of takings` : "")}
      ${stat("Saved by the deal", money(t.discount), "given away as free comics")}
      ${stat("Still open", String(t.open), "not yet collected or posted")}
      ${stat("Cancelled", String(t.cancelled), "not counted above")}
    </div>
    <table class="sales-table"><caption>Takings by week (weeks start on Monday)</caption>
      <thead><tr><th scope="col">Week of</th><th scope="col">Takings</th><th scope="col">Orders</th><th scope="col">Copies</th><th scope="col">Deal savings</th></tr></thead>
      <tbody>${rows}</tbody></table>
    ${best}
    <p class="hint sales-timing">${esc(timing)}</p>
    <p class="hint">Figures count orders by the week they were placed and leave out cancelled ones. Customer details are never kept in this history.</p>`;
}

export async function renderSales() {
  $("panel").innerHTML = `<div class="admin-msg" id="aMsg" role="status"></div>
    <div class="sales-top"><label class="list-pick">Show <select id="salesWeeks" class="admin-select">${WEEK_CHOICES.map(([n, name]) => `<option value="${n}"${n === 12 ? " selected" : ""}>${name}</option>`).join("")}</select></label></div>
    <div id="salesBody" aria-live="polite"><p class="hint">Loading…</p></div>`;
  const load = async () => {
    $("salesBody").innerHTML = `<p class="hint">Loading…</p>`;
    try { $("salesBody").innerHTML = reportHTML(await api(`/report?weeks=${$("salesWeeks").value}`)); }
    catch (e) { $("salesBody").innerHTML = ""; say(e.message, "error"); }
  };
  $("salesWeeks").addEventListener("change", load);
  await load();
}
