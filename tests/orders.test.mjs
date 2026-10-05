import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { buildOrder, orderEmbed } from "../worker/src/orders.js";
import { FakeKV } from "./helpers.mjs";

const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const SHOP = {
  config: { postage: 1000, openHour: 20, closeHour: 22, collectDaysAhead: 14 },
  products: [
    { id: "batman-1", cat: "issues", title: "Batman", num: "#1", price: 400, stock: 3 },
    { id: "sold-1", cat: "issues", title: "Gone", num: "#9", price: 500, stock: 0 },
    { id: "bulk-1", cat: "issues", title: "Plenty", num: "#2", price: 300, stock: 50 }
  ]
};
const today = () => new Date().toISOString().slice(0, 10);
const baseEnv = (over = {}) => ({
  USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", GITHUB_TOKEN: "x", GITHUB_REPO: "o/r",
  ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "true", DISCORD_WEBHOOK_URL: HOOK, ...over
});
const order = (over = {}) => ({ name: "Jamie Reyes", phone: "5550142", method: "collect", collectDate: today(), notes: "", items: [{ id: "batman-1", qty: 2 }], ...over });
const call = (env, method, path, body, token) => worker.fetch(new Request("https://api.test" + path, {
  method, headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined
}), env);
const j = async res => ({ status: res.status, ...(await res.json()) });

/* fake outside world: the shop's published data, and Discord */
function world({ discord = 200 } = {}) {
  const seen = { discord: [] };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === `${ORIGIN}/data/shop.json`) return new Response(JSON.stringify(SHOP), { status: 200 });
    if (u.startsWith(HOOK)) { seen.discord.push(JSON.parse(opts.body)); return new Response(discord === 200 ? "{}" : JSON.stringify({ message: "nope" }), { status: discord }); }
    return new Response("{}", { status: 404 });
  };
  return seen;
}

test("the public order endpoint is closed unless switched on", async () => {
  world();
  const r = await j(await call(baseEnv({ ORDERS_ENABLED: "false" }), "POST", "/orders", order()));
  assert.equal(r.status, 503);
  assert.equal((await j(await call(baseEnv({ ORDERS_ENABLED: undefined }), "POST", "/orders", order()))).status, 503);
});

test("a valid order is re-priced from the catalog, saved, and logged to Discord", async () => {
  const seen = world(), env = baseEnv();
  const r = await j(await call(env, "POST", "/orders", order({ items: [{ id: "batman-1", qty: 2, price: 1, title: "Free comic" }], total: 0 })));
  assert.equal(r.status, 200);
  assert.match(r.orderId, /^FC-[A-Z2-9]{6}$/);
  assert.equal(r.total, 800, "the browser's own price and total are ignored");
  assert.equal(seen.discord.length, 1);
  const embed = seen.discord[0].embeds[0];
  assert.match(embed.title, new RegExp(`Order ${r.orderId} · \\$800`));
  assert.ok(embed.fields.find(f => f.name === "Items").value.includes("2 × Batman #1 · $800"));
  assert.equal(embed.footer.text, "Payment pending");
  assert.ok(!JSON.stringify(r).includes("secret-token"), "the webhook URL never leaves the Worker");
  const stored = [...env.USERS.m.entries()].filter(([k]) => k.startsWith("order:"));
  assert.equal(stored.length, 1);
  assert.equal(JSON.parse(stored[0][1]).discord, "sent");
});

test("postage is added for posted orders", async () => {
  world();
  const r = await j(await call(baseEnv(), "POST", "/orders", order({ method: "post", collectDate: null, address: "12 Vinewood Blvd, Downtown" })));
  assert.equal(r.status, 200);
  assert.equal(r.postage, 1000);
  assert.equal(r.total, 1800);
});

test("bad orders are refused with a useful message", async () => {
  world();
  const cases = [
    [order({ items: [{ id: "nope", qty: 1 }] }), 409],
    [order({ items: [{ id: "sold-1", qty: 1 }] }), 409],
    [order({ items: [{ id: "batman-1", qty: 4 }] }), 409],
    [order({ items: [{ id: "batman-1", qty: 1 }, { id: "batman-1", qty: 3 }] }), 409],
    [order({ items: [{ id: "batman-1", qty: 1.5 }] }), 400],
    [order({ items: [{ id: "batman-1", qty: 0 }] }), 400],
    [order({ items: [] }), 400],
    [order({ name: "Al" }), 400],
    [order({ phone: "call me maybe" }), 400],
    [order({ method: "teleport" }), 400],
    [order({ collectDate: "2001-01-01" }), 400],
    [order({ collectDate: "next tuesday" }), 400],
    [order({ method: "post", collectDate: null, address: "home" }), 400]
  ];
  for (const [body, status] of cases) {
    const env = baseEnv();
    assert.equal((await j(await call(env, "POST", "/orders", body))).status, status, JSON.stringify(body));
  }
});

test("customer text can't ping anyone or break the message", async () => {
  const seen = world(), env = baseEnv({ DISCORD_PING_ROLE: "123456789012345678" });
  await call(env, "POST", "/orders", order({ name: "@everyone **hi**", notes: "<@123456789> look at `this`" }));
  const msg = seen.discord[0];
  assert.deepEqual(msg.allowed_mentions.parse, []);
  assert.deepEqual(msg.allowed_mentions.roles, ["123456789012345678"], "only the configured staff role may be pinged");
  const fields = JSON.stringify(msg.embeds[0].fields);
  assert.ok(fields.includes("\\\\*\\\\*hi\\\\*\\\\*") || fields.includes("\\*\\*hi\\*\\*"), "markdown is escaped");
  assert.ok(!msg.embeds[0].fields.some(f => /(^|[^\\])<@/.test(f.value)), "raw mention syntax is escaped so it shows as plain text");
});

test("too many orders from one connection are slowed down", async () => {
  world();
  const env = baseEnv();
  let last;
  for (let i = 0; i < 6; i++) last = await j(await call(env, "POST", "/orders", order()));
  assert.equal(last.status, 429);
});

test("if Discord is down the order is still accepted and kept", async () => {
  world({ discord: 500 });
  const env = baseEnv();
  const r = await j(await call(env, "POST", "/orders", order()));
  assert.equal(r.status, 200, "the customer isn't punished for our outage");
  const stored = JSON.parse([...env.USERS.m.entries()].find(([k]) => k.startsWith("order:"))[1]);
  assert.match(stored.discord, /^failed/);
});

test("with no webhook yet, orders are still stored", async () => {
  world();
  const env = baseEnv({ DISCORD_WEBHOOK_URL: undefined });
  assert.equal((await j(await call(env, "POST", "/orders", order()))).status, 200);
  assert.ok([...env.USERS.m.keys()].some(k => k.startsWith("order:")));
});

/* ---------- staff side ---------- */
async function staff(env) {
  await call(env, "POST", "/setup", { key: "k", username: "owner", password: "correct horse battery" });
  return (await j(await call(env, "POST", "/login", { username: "owner", password: "correct horse battery" }))).token;
}
test("only signed in staff can read the order log or send a test message", async () => {
  world();
  const env = baseEnv();
  assert.equal((await j(await call(env, "GET", "/orders"))).status, 401);
  assert.equal((await j(await call(env, "POST", "/orders/test"))).status, 401);
  const token = await staff(env);
  await call(env, "POST", "/orders", order());
  const list = await j(await call(env, "GET", "/orders", null, token));
  assert.equal(list.orders.length, 1);
  assert.equal(list.ordersOpen, true);
  assert.equal(list.discord, true);
  assert.ok(!JSON.stringify(list).includes("secret-token"));
});
test("the test message is labelled TEST, not stored, and needs a webhook", async () => {
  const seen = world(), env = baseEnv();
  const token = await staff(env);
  assert.equal((await j(await call(env, "POST", "/orders/test", null, token))).status, 200);
  assert.match(seen.discord[0].embeds[0].title, /^TEST · /);
  assert.equal(seen.discord[0].allowed_mentions.roles.length, 0);
  assert.ok(![...env.USERS.m.keys()].some(k => k.startsWith("order:")), "test messages aren't kept as orders");
  const env2 = baseEnv({ DISCORD_WEBHOOK_URL: undefined });
  const t2 = await staff(env2);
  assert.equal((await j(await call(env2, "POST", "/orders/test", null, t2))).status, 400);
});

test("staff can move an order along, mark it paid, and the change is recorded", async () => {
  world();
  const env = baseEnv();
  const token = await staff(env);
  const { orderId } = await j(await call(env, "POST", "/orders", order()));
  assert.equal((await j(await call(env, "POST", `/orders/${orderId}`, { status: "ready" }))).status, 401, "needs a sign-in");
  const r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "ready", paid: true }, token));
  assert.equal(r.status, 200);
  assert.equal(r.order.status, "ready");
  assert.equal(r.order.paid, true);
  assert.deepEqual(r.order.history.map(h => [h.by, h.change]), [["owner", "ready"], ["owner", "paid"]]);
  const again = await j(await call(env, "POST", `/orders/${orderId}`, { status: "ready" }, token));
  assert.equal(again.order.history.length, 2, "repeating the same status adds nothing");
  await call(env, "POST", `/orders/${orderId}`, { status: "done" }, token);
  const list = await j(await call(env, "GET", "/orders", null, token));
  assert.equal(list.orders[0].status, "done");
  assert.equal(list.orders[0].discord, "sent", "other details are untouched");
  assert.equal(list.orders[0].items[0].qty, 2);
});
test("order updates reject nonsense and unknown orders", async () => {
  world();
  const env = baseEnv();
  const token = await staff(env);
  const { orderId } = await j(await call(env, "POST", "/orders", order()));
  assert.equal((await j(await call(env, "POST", `/orders/${orderId}`, { status: "shipped-to-mars" }, token))).status, 400);
  assert.equal((await j(await call(env, "POST", `/orders/${orderId}`, { paid: "yes" }, token))).status, 400);
  assert.equal((await j(await call(env, "POST", "/orders/FC-AAAAAA", { status: "done" }, token))).status, 404);
  assert.equal((await j(await call(env, "POST", "/orders/not-an-order", { status: "done" }, token))).status, 400);
  assert.equal((await j(await call(env, "POST", `/orders/${orderId}`, { total: 0, items: [] }, token))).order.total, 800, "prices and items can't be edited here");
});

test("long item lists fit inside Discord's limits", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: "x" + i, title: "A fairly long comic title number " + i, qty: 1, price: 400 }));
  const e = orderEmbed({ id: "FC-AAAAAA", placedAt: new Date().toISOString(), name: "N", phone: "1", method: "collect", collectDate: today(), items, subtotal: 16000, postage: 0, total: 16000, notes: "x".repeat(2000) }, SHOP.config);
  for (const f of e.fields) assert.ok(f.value.length <= 1024, `${f.name} is ${f.value.length} chars`);
  assert.ok(JSON.stringify(e).length < 6000);
});
test("buildOrder merges duplicate lines and ignores client prices", () => {
  const o = buildOrder(order({ items: [{ id: "bulk-1", qty: 5, price: 1 }, { id: "bulk-1", qty: 5 }] }), SHOP);
  assert.equal(o.items.length, 1);
  assert.equal(o.items[0].qty, 10);
  assert.equal(o.total, 3000);
});
