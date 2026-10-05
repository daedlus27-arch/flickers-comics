/* Orders: validate what a customer sends, re-price it from the real catalog, take the comics off the shelf,
   keep a record, and log it to a Discord channel through a webhook. Staff then work the order through
   ready, collected or posted, paid, or cancelled, and the Discord post is edited to match.

   Nothing the browser says about prices or titles is trusted. It only names comics (by id) and quantities;
   everything else is looked up from the published data/shop.json, and stock is checked against GitHub itself.

   Bindings used here (see docs/DISCORD.md):
     ORDERS_ENABLED       "true" to accept orders. Anything else keeps the public endpoint closed.
     DISCORD_WEBHOOK_URL  secret, the channel webhook. Without it orders are still stored, just not posted.
     DISCORD_PING_ROLE    optional role id to ping on each new order and when one is ready
     SITE_URL             the public address of the shop, e.g. https://flickerscomics.github.io
     USERS                the KV namespace. Orders are kept 90 days; finished ones (collected, posted or
                          cancelled) move to the archive and are deleted 14 days after they finish. */
import { HttpError, bad } from "./http.js";
import { adjustStock } from "./github.js";
import { loadShop, shopConfig, siteBase } from "./shop.js";
import { escMd, cut, pingRole, webhook } from "./discord.js";
import { announceRestocks } from "./wants.js";
import { fullTitle, money, hoursText } from "../../src/shared.mjs";

const ORDER_TTL = 90 * 24 * 3600;
const ARCHIVE_TTL = 14 * 24 * 3600;
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, 32 symbols so the byte mapping is unbiased
const ORDER_ID_RE = /^FC-[A-Z2-9]{6}$/;
const MAX_LINES = 40, MAX_QTY = 99, ORDERS_PER_WINDOW = 5, LOOKUPS_PER_WINDOW = 12, WINDOW_SECONDS = 600;

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const digitsOf = s => String(s || "").replace(/\D/g, "");

export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "FC-" + [...bytes].map(b => ID_ALPHABET[b % 32]).join("");
}

/* ---------- status ---------- */
export const STATUSES = ["new", "ready", "done", "cancelled"];
export const orderStatus = o => o.status || "new";
export const statusName = o => ({ new: "New", ready: "Ready", done: o.method === "post" ? "Posted" : "Collected", cancelled: "Cancelled" })[orderStatus(o)] || "New";
const isFinished = o => orderStatus(o) === "done" || orderStatus(o) === "cancelled";

/* When an order will be deleted: 14 days after it finished, and never later than 90 days after it was placed. */
function ttlSeconds(o) {
  const since = iso => (Date.now() - Date.parse(iso)) / 1000;
  let ttl = ORDER_TTL - since(o.placedAt);
  if (o.completedAt) ttl = Math.min(ttl, ARCHIVE_TTL - since(o.completedAt));
  return Math.max(60, Math.floor(ttl)); // Workers KV needs at least 60 seconds
}
const expired = o => !!o.completedAt && Date.now() - Date.parse(o.completedAt) > ARCHIVE_TTL * 1000;

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
  const phone = clean(raw.phone, 30), digits = digitsOf(phone);
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
const STATUS_COLOR = { new: 0xFFE912, ready: 0x1EA7E1, done: 0x23A55A, cancelled: 0x949BA4 };

export function orderEmbed(o, cfg = {}) {
  const status = orderStatus(o), collect = o.method === "collect";
  const lines = o.items.map(i => `${i.qty} × ${escMd(i.title)} · ${money(i.price * i.qty)}`);
  let items = "";
  for (let i = 0; i < lines.length; i++) {
    const next = (items ? items + "\n" : "") + lines[i];
    if (next.length > 940) { items += `\n…and ${lines.length - i} more`; break; }
    items = next;
  }
  const description = {
    new: collect ? "New order to **collect** in store." : "New order to **post**.",
    ready: collect ? "**Ready to collect** in store." : "**Packed**, ready to post.",
    done: `**${statusName(o)}.**`,
    cancelled: "**Cancelled.**"
  }[status] || "";
  const fields = [
    { name: "Customer", value: cut(escMd(o.name), 200), inline: true },
    { name: "Phone", value: cut(escMd(o.phone), 100), inline: true },
    { name: "Payment", value: o.paid ? "Paid" : "Not paid yet", inline: true },
    collect
      ? { name: "Collect on", value: `${o.collectDate}${cfg.openHour != null ? ", " + hoursText(cfg) : ""}` }
      : { name: "Post to", value: cut(escMd(o.address), 1000) },
    { name: "Items", value: items || "—" },
    { name: "Subtotal", value: money(o.subtotal), inline: true },
    { name: o.method === "post" ? "Postage" : "Collection", value: o.postage ? money(o.postage) : "Free", inline: true },
    { name: "Total", value: `**${money(o.total)}**`, inline: true }
  ];
  if (o.notes) fields.push({ name: "Notes", value: cut(escMd(o.notes), 1000) });
  if (o.stock === "manual") fields.push({ name: "Stock", value: "Not updated automatically. Adjust it in the staff area." });
  if (o.stock === "restore-failed") fields.push({ name: "Stock", value: "Cancelled, but the stock wasn't put back. Add the comics back in the staff area." });
  return {
    title: `${o.test ? "TEST · " : ""}Order ${o.id} · ${money(o.total)}${status === "new" ? "" : " · " + statusName(o).toUpperCase()}`,
    description,
    color: o.test ? 0x949BA4 : STATUS_COLOR[status],
    fields,
    footer: { text: o.test ? "Test message, not a real order" : o.paid ? "Paid" : "Payment pending" },
    timestamp: o.placedAt
  };
}

export async function postToDiscord(env, order, cfg) {
  const role = pingRole(env);
  return webhook(env, {
    wait: true,
    payload: {
      username: "Flickers Orders",
      ...(siteBase(env) ? { avatar_url: `${siteBase(env)}/assets/apple-touch-icon.png` } : {}),
      content: role && !order.test ? `<@&${role}> new order` : undefined,
      embeds: [orderEmbed(order, cfg)],
      // Customers type some of this text, so nothing in the message is ever allowed to ping anyone except the one role we choose.
      allowed_mentions: { parse: [], roles: role && !order.test ? [role] : [] }
    }
  });
}
/* Rewrites the order's original Discord post (status, payment, colour) after staff change it. */
const editDiscord = (env, order, cfg) => webhook(env, { method: "PATCH", messageId: order.discordId, payload: { embeds: [orderEmbed(order, cfg)], allowed_mentions: { parse: [] } } });
/* A short follow-up message, used when an order is ready, so staff are nudged to contact the customer. */
function announceReady(env, o) {
  const role = pingRole(env), who = `${escMd(o.name)} on ${escMd(o.phone)}`;
  const text = o.method === "collect" ? `Order ${o.id} is ready to collect. Let ${who} know.` : `Order ${o.id} is packed and ready to post. Let ${who} know it's on its way.`;
  return webhook(env, { payload: { username: "Flickers Orders", content: (role ? `<@&${role}> ` : "") + text, allowed_mentions: { parse: [], roles: role ? [role] : [] } } });
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

  // Take the comics off the shelf. This checks the real stock in GitHub, so two customers can't both get the last copy.
  // If GitHub can't be reached (say the Worker's token has expired) the order is still accepted and flagged for staff to adjust by hand.
  order.stock = "manual";
  try {
    await adjustStock(env, order.items.map(i => [i.id, -i.qty]), `Order ${order.id}: ${order.items.reduce((s, i) => s + i.qty, 0)} comic${order.items.reduce((s, i) => s + i.qty, 0) === 1 ? "" : "s"} taken off the shelf`);
    order.stock = "held";
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) throw e; // really out of stock
    console.error("Couldn't update the stock for an order");
  }

  const key = orderKey(order);
  await env.USERS.put(`oid:${order.id}`, key, { expirationTtl: ORDER_TTL }); // also how an order is found again
  const record = { ...order, status: "new", discord: "pending" };
  await env.USERS.put(key, JSON.stringify(record), { expirationTtl: ORDER_TTL }); // saved before Discord is tried
  const sent = await postToDiscord(env, record, shop.config);
  record.discord = sent.ok ? "sent" : `failed: ${sent.reason}`;
  if (sent.id) record.discordId = sent.id;
  await env.USERS.put(key, JSON.stringify(record), { expirationTtl: ORDER_TTL });
  return { orderId: order.id, subtotal: order.subtotal, postage: order.postage, total: order.total, paid: false };
}

export async function listOrders(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.USERS.list({ prefix: "order:", cursor, limit: 100 });
    for (const k of page.keys) { const raw = await env.USERS.get(k.name); if (raw) { const o = JSON.parse(raw); if (!expired(o)) out.push(o); } }
    cursor = page.list_complete || out.length >= 200 ? undefined : page.cursor;
  } while (cursor);
  return out.slice(0, 200);
}

async function findOrderKey(env, id) {
  const direct = await env.USERS.get(`oid:${id}`);
  if (direct && direct.startsWith("order:")) return direct;
  let cursor; // orders placed before the key was recorded
  do {
    const page = await env.USERS.list({ prefix: "order:", cursor });
    const hit = page.keys.find(k => k.name.endsWith(":" + id));
    if (hit) return hit.name;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return null;
}

/* ---------- customers checking on their order ---------- */
export async function lookupOrder(env, raw, ip) {
  if (!raw || typeof raw !== "object") throw bad(400, "Enter your order number and phone number.");
  const id = clean(raw.id, 20).toUpperCase().replace(/\s+/g, ""), digits = digitsOf(raw.phone);
  if (!ORDER_ID_RE.test(id)) throw bad(400, "Enter your order number, like FC-7K3PQ2.");
  if (digits.length < 4) throw bad(400, "Enter the phone number you gave when you ordered.");
  const rlKey = `rl:lookup:${ip}`, n = Number(await env.USERS.get(rlKey)) || 0;
  if (n >= LOOKUPS_PER_WINDOW) throw bad(429, "That's a lot of lookups from your connection. Wait a few minutes and try again.");
  await env.USERS.put(rlKey, String(n + 1), { expirationTtl: WINDOW_SECONDS });

  const key = await findOrderKey(env, id), stored = key && await env.USERS.get(key);
  const o = stored && JSON.parse(stored);
  const same = o && !expired(o) && digitsOf(o.phone) === digits;
  if (!same) throw bad(404, "We couldn't find an order with that number and phone number. Check them and try again."); // the same answer whether the number or the phone is wrong
  return {
    id: o.id, state: orderStatus(o), statusLabel: statusName(o), method: o.method, collectDate: o.collectDate || null, paid: !!o.paid,
    total: o.total, postage: o.postage, placedAt: o.placedAt, items: o.items.map(i => ({ title: i.title, qty: i.qty }))
  };
}

/* ---------- working through an order ----------
   new → ready → done (collected or posted), or cancelled at any point; "paid" is tracked separately because
   until Fleeca is connected the shop and customer settle payment themselves. Every change is kept in the
   order's history so staff can see who did what. Cancelling puts the comics back on the shelf; reopening takes them off again.
   Finished orders (done or cancelled) form the archive and are deleted 14 days after they finished. */
export async function updateOrder(env, id, patch, user) {
  if (!ORDER_ID_RE.test(String(id))) throw bad(400, "That isn't an order number.");
  if (!patch || typeof patch !== "object") throw bad(400, "Nothing to change.");
  const key = await findOrderKey(env, id), raw = key && await env.USERS.get(key);
  if (!raw) throw bad(404, "That order wasn't found. Finished orders are deleted after 14 days.");
  const o = JSON.parse(raw), prev = orderStatus(o);

  if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw bad(400, "That isn't a valid status.");
  if (patch.paid !== undefined && typeof patch.paid !== "boolean") throw bad(400, "Paid must be yes or no.");
  const next = patch.status !== undefined ? patch.status : prev;
  const statusChanged = next !== prev, paidChanged = patch.paid !== undefined && patch.paid !== !!o.paid;
  if (!statusChanged && !paidChanged) return { order: o, warnings: [] };

  const warnings = [], changes = [], lines = o.items.map(i => [i.id, i.qty]);
  if (statusChanged) {
    if (next === "cancelled" && o.stock === "held") {
      try { const r = await adjustStock(env, lines, `Order ${o.id} cancelled: comics put back on the shelf`); o.stock = "released"; await announceRestocks(env, r.before, r.products).catch(() => {}); }
      catch (e) { o.stock = "restore-failed"; warnings.push("The order was cancelled, but the comics couldn't be put back in stock automatically. Add them back under Stock."); }
    } else if (prev === "cancelled" && next !== "cancelled" && o.stock === "released") {
      try { await adjustStock(env, lines.map(([i, q]) => [i, -q]), `Order ${o.id} reopened: comics taken off the shelf again`); o.stock = "held"; }
      catch (e) {
        if (e instanceof HttpError && e.status === 409) throw bad(409, `Can't reopen this order: ${e.message}`);
        throw bad(502, "Couldn't take the comics off the shelf again just now. Try again in a moment.");
      }
    }
    o.status = next; changes.push(next);
    if (isFinished(o)) o.completedAt = new Date().toISOString(); else delete o.completedAt;
  }
  if (paidChanged) { o.paid = patch.paid; changes.push(patch.paid ? "paid" : "unpaid"); }

  o.history = [...(o.history || []), ...changes.map(change => ({ at: new Date().toISOString(), by: user.username, change }))].slice(-30);
  await env.USERS.put(key, JSON.stringify(o), { expirationTtl: ttlSeconds(o) });

  // keep the Discord post in step, and nudge staff when an order is ready
  let discord = "skipped";
  const cfg = await shopConfig(env);
  if (o.discordId) discord = (await editDiscord(env, o, cfg)).ok ? "updated" : "failed";
  if (statusChanged && next === "ready") await announceReady(env, o);
  return { order: o, warnings, discord };
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
