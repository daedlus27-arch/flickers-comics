/* Sales history for the owner's report. Orders themselves are deleted two weeks after they finish, so a small record with no
   customer details (what was bought, when, for how much) is kept for each one, much longer, as KV key metadata. Reading the
   report is then a handful of key listings instead of one read per order, which keeps it inside a free-plan Worker's limits. */
import { bad } from "./http.js";
import { loadShop } from "./shop.js";
import { fullTitle } from "../../src/shared.mjs";

const SALE_TTL = 800 * 24 * 3600;
const STATUS_CODE = { new: "n", ready: "r", done: "d", cancelled: "x" };
const DAY = 86400000;

/* The compact record. Short keys, because key metadata may be at most 1,024 bytes; a very long order loses its last lines (flag x). */
export function saleMeta(o) {
  const meta = {
    p: Date.parse(o.placedAt), c: o.completedAt ? Date.parse(o.completedAt) : 0, s: STATUS_CODE[o.status || "new"] || "n",
    v: o.total, b: o.subtotal, d: o.discount || 0, o: o.postage || 0, m: o.method === "post" ? "p" : "c", y: o.paid ? 1 : 0,
    i: o.items.map(i => [i.id, i.qty, i.price])
  };
  while (JSON.stringify(meta).length > 950 && meta.i.length > 1) { meta.i.pop(); meta.x = 1; }
  return meta;
}
export const recordSale = (env, order) => env.USERS.put(`sale:${order.id}`, "1", { expirationTtl: SALE_TTL, metadata: saleMeta(order) });

/* Orders placed before sales records existed: copy the newest page of them in, once. */
async function backfill(env) {
  if (await env.USERS.get("stats:backfilled")) return 0;
  const page = await env.USERS.list({ prefix: "order:", limit: 40 });
  const rows = await Promise.all(page.keys.map(k => env.USERS.get(k.name)));
  let n = 0;
  for (const raw of rows) { if (!raw) continue; const o = JSON.parse(raw); if (!o.test) { await recordSale(env, o); n++; } }
  await env.USERS.put("stats:backfilled", "1");
  return n;
}

export async function allSales(env) {
  const out = [];
  let cursor;
  for (let pages = 0; pages < 8; pages++) { // up to 8,000 sales
    const page = await env.USERS.list({ prefix: "sale:", cursor });
    for (const k of page.keys) if (k.metadata && k.metadata.p) out.push({ id: k.name.slice(5), ...k.metadata });
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return out;
}

const mondayOf = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); };
const iso = ms => new Date(ms).toISOString().slice(0, 10);

/* weeks: how many weeks back to report on, this one included. */
export async function salesReport(env, weeksBack) {
  const weeks = Math.min(52, Math.max(1, Math.floor(Number(weeksBack)) || 12));
  const backfilled = await backfill(env);
  const sales = await allSales(env);
  const thisMonday = mondayOf(Date.now()), since = thisMonday - (weeks - 1) * 7 * DAY;
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: iso(since + i * 7 * DAY), orders: 0, units: 0, revenue: 0, discount: 0, cancelled: 0 }));
  const totals = { orders: 0, units: 0, revenue: 0, paid: 0, discount: 0, postage: 0, cancelled: 0, open: 0, collect: 0, post: 0 };
  const items = new Map(), hours = [];
  for (const s of sales) {
    if (s.p < since) continue;
    const b = buckets[Math.min(weeks - 1, Math.floor((mondayOf(s.p) - since) / (7 * DAY)))];
    if (s.s === "x") { b.cancelled++; totals.cancelled++; continue; }
    const units = s.i.reduce((n, [, q]) => n + q, 0);
    b.orders++; b.units += units; b.revenue += s.v; b.discount += s.d;
    totals.orders++; totals.units += units; totals.revenue += s.v; totals.discount += s.d; totals.postage += s.o;
    if (s.y) totals.paid += s.v;
    if (s.s === "n" || s.s === "r") totals.open++;
    if (s.m === "p") totals.post++; else totals.collect++;
    if (s.s === "d" && s.c > s.p) hours.push((s.c - s.p) / 3600000);
    for (const [id, qty, price] of s.i) { const e = items.get(id) || { id, units: 0, revenue: 0 }; e.units += qty; e.revenue += qty * price; items.set(id, e); }
  }
  let shop = null;
  try { shop = await loadShop(env); } catch (e) { /* titles fall back to ids */ }
  const titles = new Map(((shop && shop.products) || []).map(p => [p.id, fullTitle(p)]));
  const best = [...items.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 10).map(e => ({ ...e, title: titles.get(e.id) || e.id }));
  hours.sort((a, b) => a - b);
  const timing = hours.length ? { count: hours.length, averageHours: hours.reduce((a, c) => a + c, 0) / hours.length, medianHours: hours[Math.floor(hours.length / 2)] } : { count: 0 };
  return { weeks: buckets, totals: { ...totals, average: totals.orders ? Math.round(totals.revenue / totals.orders) : 0 }, best, timing, since: iso(since), weeksBack: weeks, backfilled };
}

export const reportParams = url => { const w = url.searchParams.get("weeks"); if (w !== null && !/^\d{1,2}$/.test(w)) throw bad(400, "That isn't a number of weeks."); return w; };
