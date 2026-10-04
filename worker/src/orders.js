/* Orders: validate what a customer sends, re-price it from the real catalog, keep a record,
   and log it to a Discord channel through a webhook.

   Nothing the browser says about prices or titles is trusted. It only names comics (by id) and quantities;
   everything else is looked up from the published data/shop.json.

   Bindings used here (see docs/DISCORD.md):
     ORDERS_ENABLED       "true" to accept orders. Anything else keeps the public endpoint closed.
     DISCORD_WEBHOOK_URL  secret, the channel webhook. Without it orders are still stored, just not posted.
     DISCORD_PING_ROLE    optional role id to ping on each new order
     SITE_URL             the public address of the shop, e.g. https://flickerscomics.github.io
     USERS                the KV namespace (orders are kept for 90 days under "order:" keys) */
import { bad } from "./http.js";
import { fullTitle, money, hoursText } from "../../src/shared.mjs";

const ORDER_TTL = 90 * 24 * 3600;
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, 32 symbols so the byte mapping is unbiased
const MAX_LINES = 40, MAX_QTY = 99, ORDERS_PER_WINDOW = 5, WINDOW_SECONDS = 600;

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const siteBase = env => String(env.SITE_URL || "").replace(/\/+$/, "");

export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "FC-" + [...bytes].map(b => ID_ALPHABET[b % 32]).join("");
}

/* ---------- the catalog, as customers see it ---------- */
export async function loadShop(env) {
  const base = siteBase(env);
  if (!base) throw bad(503, "Online ordering isn't set up yet.");
  let res;
  try { res = await fetch(`${base}/data/shop.json`, { headers: { Accept: "application/json" } }); }
  catch (e) { throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment."); }
  if (!res.ok) throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment.");
  try { return await res.json(); } catch (e) { throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment."); }
}

/* ---------- validating an order ---------- */
function dateInRange(iso, daysAhead) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(t)) return false;
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const day = 86400000;
  return t >= today - day && t <= today + (daysAhead + 1) * day; // a day of slack either side for time zones
}

export function buildOrder(raw, shop, { test = false } = {}) {
  if (!raw || typeof raw !== "object") throw bad(400, "That order wasn't valid.");
  const cfg = shop.config || {}, byId = new Map((shop.products || []).map(p => [p.id, p]));

  const name = clean(raw.name, 80);
  if (name.length < 3) throw bad(400, "Enter your full name.");
  const phone = clean(raw.phone, 30), digits = phone.replace(/\D/g, "");
  if (/[^\d\s()+\-#]/.test(phone) || digits.length < 4 || digits.length > 15) throw bad(400, "Enter your phone number using digits only.");
  const method = raw.method === "post" ? "post" : raw.method === "collect" ? "collect" : null;
  if (!method) throw bad(400, "Choose collection or postage.");

  let collectDate = null, address = null;
  if (method === "collect") {
    collectDate = clean(raw.collectDate, 10);
    if (!dateInRange(collectDate, Number(cfg.collectDaysAhead) || 14)) throw bad(400, "Pick a collection day within the next two weeks.");
  } else {
    address = clean(raw.address, 300);
    if (address.length < 8) throw bad(400, "Enter the full address we should post to.");
  }

  if (!Array.isArray(raw.items) || !raw.items.length) throw bad(400, "Your cart is empty.");
  if (raw.items.length > MAX_LINES) throw bad(400, "That's too many different comics in one order.");
  const wanted = new Map();
  for (const it of raw.items) {
    const id = clean(it && it.id, 61), qty = Number(it && it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw bad(400, "One of the quantities isn't valid.");
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  const items = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (!p) throw bad(409, "One of the comics in your cart isn't in the shop any more. Refresh the page and try again.");
    if (p.stock <= 0) throw bad(409, `${fullTitle(p)} has sold out.`);
    if (qty > p.stock) throw bad(409, `We only have ${p.stock} of ${fullTitle(p)}.`);
    items.push({ id, title: fullTitle(p), qty, price: p.price });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const postage = method === "post" ? Number(cfg.postage) || 0 : 0;
  return {
    id: newOrderId(), placedAt: new Date().toISOString(), name, phone, method, collectDate, address,
    notes: clean(raw.notes, 500), items, subtotal, postage, total: subtotal + postage, paid: false, test
  };
}

/* ---------- Discord ---------- */
const escMd = s => String(s).replace(/([\\*_~`|>])/g, "\\$1").replace(/</g, "\\<");
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function orderEmbed(o, cfg = {}) {
  const lines = o.items.map(i => `${i.qty} × ${escMd(i.title)} · ${money(i.price * i.qty)}`);
  let items = "";
  for (let i = 0; i < lines.length; i++) {
    const next = (items ? items + "\n" : "") + lines[i];
    if (next.length > 940) { items += `\n…and ${lines.length - i} more`; break; }
    items = next;
  }
  const fields = [
    { name: "Customer", value: cut(escMd(o.name), 200), inline: true },
    { name: "Phone", value: cut(escMd(o.phone), 100), inline: true },
    o.method === "collect"
      ? { name: "Collect on", value: `${o.collectDate}${cfg.openHour != null ? ", " + hoursText(cfg) : ""}` }
      : { name: "Post to", value: cut(escMd(o.address), 1000) },
    { name: "Items", value: items || "—" },
    { name: "Subtotal", value: money(o.subtotal), inline: true },
    { name: o.method === "post" ? "Postage" : "Collection", value: o.postage ? money(o.postage) : "Free", inline: true },
    { name: "Total", value: `**${money(o.total)}**`, inline: true }
  ];
  if (o.notes) fields.push({ name: "Notes", value: cut(escMd(o.notes), 1000) });
  return {
    title: `${o.test ? "TEST · " : ""}Order ${o.id} · ${money(o.total)}`,
    description: o.method === "collect" ? "New order to **collect** in store." : "New order to **post**.",
    color: o.test ? 0x949BA4 : 0xFFE912,
    fields,
    footer: { text: o.test ? "Test message, not a real order" : o.paid ? "Paid through Fleeca" : "Payment pending" },
    timestamp: o.placedAt
  };
}

export async function postToDiscord(env, order, cfg) {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, reason: "not configured" };
  const role = /^\d{5,25}$/.test(String(env.DISCORD_PING_ROLE || "")) ? String(env.DISCORD_PING_ROLE) : null;
  const payload = {
    username: "Flickers Orders",
    ...(siteBase(env) ? { avatar_url: `${siteBase(env)}/assets/apple-touch-icon.png` } : {}),
    content: role && !order.test ? `<@&${role}> new order` : undefined,
    embeds: [orderEmbed(order, cfg)],
    // Customers type some of this text, so nothing in the message is ever allowed to ping anyone except the one role we choose.
    allowed_mentions: { parse: [], roles: role && !order.test ? [role] : [] }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try { res = await fetch(url + (url.includes("?") ? "&" : "?") + "wait=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
    catch (e) { console.error("Discord unreachable"); continue; }
    if (res.ok) return { ok: true };
    if (res.status === 429) {
      let wait = 1;
      try { wait = Math.min(3, Number((await res.json()).retry_after) || 1); } catch (e) { /* default */ }
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    console.error("Discord answered", res.status); // the status only: the webhook URL is a secret and is never logged
    return { ok: false, reason: `Discord answered ${res.status}` };
  }
  return { ok: false, reason: "Discord didn't answer" };
}

/* ---------- storing and listing ---------- */
const orderKey = o => `order:${String(9e15 - Date.parse(o.placedAt)).padStart(16, "0")}:${o.id}`; // newest sorts first

export async function placeOrder(env, raw, ip) {
  if (String(env.ORDERS_ENABLED) !== "true") throw bad(503, "Online ordering isn't open yet.");
  const rlKey = `rl:order:${ip}`;
  const n = Number(await env.USERS.get(rlKey)) || 0;
  if (n >= ORDERS_PER_WINDOW) throw bad(429, "That's a lot of orders from your connection. Wait a few minutes and try again.");
  await env.USERS.put(rlKey, String(n + 1), { expirationTtl: WINDOW_SECONDS });

  const shop = await loadShop(env);
  const order = buildOrder(raw, shop);
  for (let tries = 0; tries < 5 && await env.USERS.get(`oid:${order.id}`); tries++) order.id = newOrderId();
  await env.USERS.put(`oid:${order.id}`, "1", { expirationTtl: ORDER_TTL });

  const record = { ...order, discord: "pending" };
  await env.USERS.put(orderKey(order), JSON.stringify(record), { expirationTtl: ORDER_TTL }); // saved before Discord is tried
  const sent = await postToDiscord(env, order, shop.config);
  record.discord = sent.ok ? "sent" : `failed: ${sent.reason}`;
  await env.USERS.put(orderKey(order), JSON.stringify(record), { expirationTtl: ORDER_TTL });
  return { orderId: order.id, subtotal: order.subtotal, postage: order.postage, total: order.total, paid: false };
}

export async function listOrders(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.USERS.list({ prefix: "order:", cursor, limit: 100 - out.length });
    for (const k of page.keys) { const raw = await env.USERS.get(k.name); if (raw) out.push(JSON.parse(raw)); }
    cursor = page.list_complete || out.length >= 100 ? undefined : page.cursor;
  } while (cursor);
  return out.slice(0, 100);
}

/* A sample message so staff can check the channel is connected. Not stored, not a real order. */
export async function sendTestMessage(env, user) {
  if (!env.DISCORD_WEBHOOK_URL) throw bad(400, "Discord isn't connected yet. Add the webhook as described in docs/DISCORD.md.");
  let shop = null;
  try { shop = await loadShop(env); } catch (e) { /* fall back to a made-up sample */ }
  const p = shop && shop.products && shop.products[0];
  const order = {
    id: "FC-TEST00", placedAt: new Date().toISOString(), name: `Sample customer (sent by ${user.username})`, phone: "5550100", method: "collect",
    collectDate: new Date().toISOString().slice(0, 10), address: null, notes: "This is a test message from the staff area.",
    items: [{ id: p ? p.id : "sample", title: p ? fullTitle(p) : "Sample Comic #1", qty: 2, price: p ? p.price : 500 }],
    subtotal: 0, postage: 0, total: 0, paid: false, test: true
  };
  order.subtotal = order.total = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  const sent = await postToDiscord(env, order, shop && shop.config);
  if (!sent.ok) throw bad(502, `Couldn't post to Discord (${sent.reason}). Check the webhook is still valid.`);
  return { ok: true };
}
