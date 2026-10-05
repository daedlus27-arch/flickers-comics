/* The owner's sales report: built from small customer-free records that outlive the orders themselves. */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { saleMeta } from "../worker/src/sales.js";
import { FakeKV, caller, j } from "./helpers.mjs";

const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const call = caller(worker, ORIGIN);
const SHOP = {
  config: { postage: 1000, openHour: 20, closeHour: 22, collectDaysAhead: 14, deal: { enabled: true, buy: 2, free: 1 } },
  products: [
    { id: "a", cat: "issues", title: "Alpha", num: "#1", price: 500, stock: 50 },
    { id: "b", cat: "issues", title: "Bravo", num: "#2", price: 400, stock: 50 },
    { id: "c", cat: "issues", title: "Charlie", num: "#3", price: 300, stock: 50 }
  ]
};
const baseEnv = () => ({ USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "true", DISCORD_WEBHOOK_URL: HOOK });
const world = () => { globalThis.fetch = async url => (String(url) === `${ORIGIN}/data/shop.json` ? new Response(JSON.stringify(SHOP)) : new Response(JSON.stringify({ id: "1" }))); };
async function owner(env) {
  await call(env, "POST", "/setup", { key: "k", username: "owner", password: "correct horse battery" });
  return (await j(call(env, "POST", "/login", { username: "owner", password: "correct horse battery" }))).token;
}
const place = (env, items, ip, over = {}) => j(call(env, "POST", "/orders", { name: "Jamie Reyes", phone: "5550142", method: "post", address: "12 Vinewood Blvd, Downtown", items, ...over }, null, ip));

test("each order leaves a sale record with no customer details", async () => {
  world();
  const env = baseEnv();
  const r = await place(env, [{ id: "a", qty: 2 }, { id: "b", qty: 1 }], "1.1.1.1");
  const meta = env.USERS.meta.get(`sale:${r.orderId}`);
  assert.ok(meta, "a record exists");
  assert.equal(meta.v, r.total);
  assert.deepEqual(meta.i, [["a", 2, 500], ["b", 1, 400]]);
  const text = JSON.stringify([...env.USERS.meta.entries()].filter(([k]) => k.startsWith("sale:")));
  assert.ok(!/Jamie|5550142|Vinewood/.test(text), "no name, phone or address is kept");
  assert.ok(env.USERS.ttl.get(`sale:${r.orderId}`) > 700 * 24 * 3600, "kept far longer than the order");
});

test("a very long order still fits in the 1 KB of key metadata", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: "comic-number-" + i + "-with-a-long-id", qty: 3, price: 1250 }));
  const meta = saleMeta({ placedAt: new Date().toISOString(), status: "new", total: 99999, subtotal: 99999, items, method: "collect" });
  assert.ok(JSON.stringify(meta).length <= 1000, "under the limit");
  assert.equal(meta.x, 1, "and says it was cut");
});

test("the report adds up orders, units, revenue, deals, best sellers and collection time, leaving out cancelled orders", async () => {
  world();
  const env = baseEnv(), token = await owner(env);
  const one = await place(env, [{ id: "a", qty: 1 }, { id: "b", qty: 1 }, { id: "c", qty: 1 }], "2.2.2.1"); // 1200 - 300 + 1000
  const two = await place(env, [{ id: "a", qty: 2 }], "2.2.2.2"); // 1000 + 1000
  const three = await place(env, [{ id: "b", qty: 5 }], "2.2.2.3"); // cancelled
  await j(call(env, "POST", `/orders/${one.orderId}`, { status: "done", paid: true }, token));
  await j(call(env, "POST", `/orders/${three.orderId}`, { status: "cancelled" }, token));

  const r = await j(call(env, "GET", "/report?weeks=4", null, token));
  assert.equal(r.status, 200);
  assert.equal(r.weeks.length, 4);
  assert.equal(r.totals.orders, 2, "cancelled orders aren't sales");
  assert.equal(r.totals.cancelled, 1);
  assert.equal(r.totals.units, 5);
  assert.equal(r.totals.revenue, one.total + two.total);
  assert.equal(r.totals.discount, 300);
  assert.equal(r.totals.paid, one.total, "only the paid order counts as paid");
  assert.equal(r.totals.open, 1, "the second order is still open");
  assert.equal(r.totals.average, Math.round((one.total + two.total) / 2));
  assert.equal(r.weeks[3].orders, 2, "this week is the last bucket");
  assert.equal(r.weeks[3].revenue, one.total + two.total);
  assert.deepEqual(r.best.map(b => [b.id, b.units, b.title]), [["a", 3, "Alpha #1"], ["b", 1, "Bravo #2"], ["c", 1, "Charlie #3"]], "best sellers by copies, with titles");
  assert.equal(r.timing.count, 1, "one order was collected or posted");
  assert.ok(r.timing.averageHours >= 0 && r.timing.averageHours < 1, "and it took moments in this test");

  // reopening a cancelled order puts it back into the figures
  await j(call(env, "POST", `/orders/${three.orderId}`, { status: "new" }, token));
  assert.equal((await j(call(env, "GET", "/report?weeks=4", null, token))).totals.orders, 3);
});

test("only the owner can read the report, and it copes with orders from before sales records existed", async () => {
  world();
  const env = baseEnv(), token = await owner(env);
  await j(call(env, "POST", "/users", { username: "clerk", password: "another long password", role: "staff" }, token));
  const clerk = (await j(call(env, "POST", "/login", { username: "clerk", password: "another long password" }))).token;
  assert.equal((await j(call(env, "GET", "/report", null, clerk))).status, 403);
  assert.equal((await j(call(env, "GET", "/report", null))).status, 401);
  assert.equal((await j(call(env, "GET", "/report?weeks=banana", null, token))).status, 400);

  // an order saved the old way, with no sale record
  const placedAt = new Date().toISOString();
  await env.USERS.put("order:0000000000000001:FC-OLDONE", JSON.stringify({ id: "FC-OLDONE", placedAt, status: "done", completedAt: placedAt, name: "Old Customer", phone: "5550100", method: "collect", items: [{ id: "c", title: "Charlie #3", qty: 2, price: 300 }], subtotal: 600, postage: 0, total: 600, paid: true }));
  const r = await j(call(env, "GET", "/report?weeks=2", null, token));
  assert.equal(r.backfilled, 1);
  assert.equal(r.totals.orders, 1);
  assert.equal(r.totals.revenue, 600);
  assert.equal((await j(call(env, "GET", "/report?weeks=2", null, token))).backfilled, 0, "the copy happens once");
});

test("the report stays well inside a free-plan Worker's limits however many sales there are", async () => {
  world();
  const env = baseEnv(), token = await owner(env);
  const meta = { p: Date.now() - 86400000, c: 0, s: "n", v: 500, b: 500, d: 0, o: 0, m: "c", y: 0, i: [["a", 1, 500]] };
  await env.USERS.put("stats:backfilled", "1");
  for (let i = 0; i < 1500; i++) await env.USERS.put("sale:FC-" + String(i).padStart(6, "0"), "1", { metadata: meta });
  env.USERS.ops = 0;
  const r = await j(call(env, "GET", "/report?weeks=4", null, token));
  assert.equal(r.totals.orders, 1500);
  assert.ok(env.USERS.ops <= 12, `the report used ${env.USERS.ops} KV calls`);
});
