/* Tools for staff: orders keyed in at the counter or on the phone, and the reorder data. */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { FakeKV, caller, j } from "./helpers.mjs";

const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const call = caller(worker, ORIGIN);
const COMICS = () => [
  { id: "a", cat: "issues", title: "Alpha", num: "#1", price: 500, stock: 5, blurb: "x" },
  { id: "b", cat: "issues", title: "Bravo", num: "#2", price: 400, stock: 1, blurb: "x" },
  { id: "c", cat: "issues", title: "Charlie", num: "#3", price: 300, stock: 0, blurb: "x" }
];
const CONFIG = { postage: 1000, openHour: 20, closeHour: 22, collectDaysAhead: 14, deal: { enabled: true, buy: 2, free: 1 } };
const baseEnv = (over = {}) => ({
  USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", GITHUB_TOKEN: "x", GITHUB_REPO: "o/r", GITHUB_BRANCH: "main",
  ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "false", DISCORD_WEBHOOK_URL: HOOK, ...over
});
async function owner(env) {
  await call(env, "POST", "/setup", { key: "k", username: "owner", password: "correct horse battery" });
  return (await j(call(env, "POST", "/login", { username: "owner", password: "correct horse battery" }))).token;
}
/* the real stock in GitHub starts as `fresh`; the published site shows `published` (the same, a minute behind) */
function world({ fresh = COMICS(), published = COMICS() } = {}) {
  const st = { products: fresh, head: 1, blobs: {}, n: 0, posts: [], tree: null, commits: [] };
  const b64 = s => Buffer.from(s).toString("base64"), ok = d => new Response(JSON.stringify(d));
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || "GET";
    if (u === `${ORIGIN}/data/shop.json`) return ok({ config: CONFIG, products: published });
    if (u.startsWith(HOOK)) { st.posts.push(JSON.parse(opts.body)); return ok({ id: String(1000 + st.posts.length) }); }
    const path = new URL(u).pathname.replace("/repos/o/r", "");
    if (path.startsWith("/git/ref/heads/") && method === "GET") return ok({ object: { sha: "h" + st.head } });
    if (path === "/contents/data/products.json") return ok({ sha: "v" + st.head, content: b64(JSON.stringify(st.products)) });
    if (path === "/contents/data/featured.json") return ok({ sha: "f", content: b64("[]") });
    if (path.startsWith("/git/commits/") && method === "GET") return ok({ tree: { sha: "t0" } });
    if (path === "/git/blobs") { const sha = "b" + (++st.n); st.blobs[sha] = JSON.parse(opts.body); return ok({ sha }); }
    if (path === "/git/trees") { st.tree = JSON.parse(opts.body).tree; return ok({ sha: "t1" }); }
    if (path === "/git/commits" && method === "POST") { st.commits.push(JSON.parse(opts.body).message); return ok({ sha: "c" + st.n }); }
    if (path.startsWith("/git/refs/heads/") && method === "PATCH") { st.products = JSON.parse(st.blobs[st.tree.find(t => t.path === "data/products.json").sha].content); st.head++; return ok({}); }
    return new Response("{}", { status: 404 });
  };
  return st;
}
const orderPosts = st => st.posts.filter(p => p.embeds && /^Order /.test(p.embeds[0].title));

test("staff can key in an order for a customer: priced from the live stock, taken off the shelf, logged quietly, listed with who entered it", async () => {
  const st = world(), env = baseEnv({ DISCORD_PING_ROLE: "123456789012345678" }), token = await owner(env);
  const r = await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "post", address: "12 Vinewood Blvd, Downtown", items: [{ id: "a", qty: 1 }, { id: "b", qty: 1 }], notes: "Phoned in" }, token));
  assert.equal(r.status, 200);
  assert.equal(r.order.source, "staff");
  assert.equal(r.order.enteredBy, "owner");
  assert.equal(r.order.status, "new");
  assert.equal(r.order.history[0].change, "entered");
  assert.equal(r.total, 900 + 1000, "900 of comics, postage on top (two comics: no deal yet)");
  assert.equal(st.products.find(p => p.id === "a").stock, 4, "the shelf is updated in GitHub");
  assert.equal(st.products.find(p => p.id === "b").stock, 0);
  const post = orderPosts(st)[0];
  assert.ok(!post.content, "no role ping for an order staff keyed in themselves");
  assert.deepEqual(post.allowed_mentions.roles, []);
  assert.match(post.embeds[0].footer.text, /Entered by owner/);
  const list = await j(call(env, "GET", "/orders", null, token));
  assert.equal(list.orders[0].id, r.orderId);
  assert.ok(env.USERS.meta.has(`sale:${r.orderId}`), "and it counts in the sales report");
});

test("a counter sale can be handed over and paid in one go", async () => {
  const st = world(), env = baseEnv(), token = await owner(env);
  const r = await j(call(env, "POST", "/staff/orders", { name: "Counter sale", method: "collect", items: [{ id: "a", qty: 1 }], handedOver: true, paid: true }, token));
  assert.equal(r.status, 200);
  assert.equal(r.order.status, "done");
  assert.ok(r.order.completedAt);
  assert.equal(r.order.paid, true);
  assert.equal(r.order.collectDate, new Date().toISOString().slice(0, 10), "collection day defaults to today");
  assert.equal(r.order.phone, "", "no phone number needed");
  assert.deepEqual(r.order.history.map(h => h.change), ["entered", "done"]);
  assert.equal(env.USERS.meta.get(`sale:${r.orderId}`).s, "d");
  assert.ok(env.USERS.ttl.get(`order:${[...env.USERS.m.keys()].find(k => k.startsWith("order:")).split(":")[1]}:${r.orderId}`) <= 14 * 24 * 3600, "it goes straight to the 14-day archive");
  assert.equal(st.products.find(p => p.id === "a").stock, 4);
});

test("it uses the live stock, not the published list, and still refuses what really isn't there", async () => {
  // the shelf was restocked a moment ago: GitHub has 4 of Charlie, the published site still says sold out
  world({ fresh: COMICS().map(p => (p.id === "c" ? { ...p, stock: 4 } : p)) });
  const env = baseEnv(), token = await owner(env);
  assert.equal((await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "c", qty: 2 }] }, token))).status, 200);
  world();
  const none = await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "c", qty: 1 }] }, token));
  assert.equal(none.status, 409);
  assert.match(none.error, /sold out/);
  const tooMany = await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "a", qty: 9 }] }, token));
  assert.equal(tooMany.status, 409);
});

test("the staff route needs a sign-in, checks the details, and isn't rate limited or tied to online ordering", async () => {
  world();
  const env = baseEnv(), token = await owner(env);
  assert.equal((await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "a", qty: 1 }] }))).status, 401);
  assert.equal((await j(call(env, "POST", "/staff/orders", { name: "W", method: "collect", items: [{ id: "a", qty: 1 }] }, token))).status, 400, "a name is needed");
  assert.equal((await j(call(env, "POST", "/staff/orders", { name: "Walk-in", phone: "abc", method: "collect", items: [{ id: "a", qty: 1 }] }, token))).status, 400, "a phone number, if given, must be valid");
  assert.equal((await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "post", address: "x", items: [{ id: "a", qty: 1 }] }, token))).status, 400, "posting needs an address");
  for (let i = 0; i < 8; i++) {
    world();
    assert.equal((await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "a", qty: 1 }] }, token))).status, 200, `order ${i + 1} of 8 goes through`);
  }
});

test("the deal applies to staff orders too", async () => {
  world();
  const env = baseEnv(), token = await owner(env);
  const r = await j(call(env, "POST", "/staff/orders", { name: "Walk-in", method: "collect", items: [{ id: "a", qty: 3 }] }, token));
  assert.equal(r.discount, 500);
  assert.equal(r.total, 1000);
});

test("reorder data counts who is waiting, what sold lately and what customers asked for, from key listings only", async () => {
  world();
  const env = baseEnv({ ORDERS_ENABLED: "true" }), token = await owner(env);
  const want = (body, ip) => j(call(env, "POST", "/wants", { name: "Jamie Reyes", phone: "555" + ip.replace(/\D/g, "").padEnd(4, "0"), ...body }, null, ip));
  await want({ kind: "restock", productId: "c" }, "1.1.1.1");
  await want({ kind: "restock", productId: "c" }, "1.1.1.2");
  await want({ kind: "series", productId: "a" }, "1.1.1.3");
  await want({ kind: "request", text: "Saga #1 first print" }, "1.1.1.4");
  await want({ kind: "request", text: "saga #1  FIRST print" }, "1.1.1.5");
  await j(call(env, "POST", "/orders", { name: "Jamie Reyes", phone: "5550142", method: "post", address: "12 Vinewood Blvd, Downtown", items: [{ id: "a", qty: 2 }] }, null, "2.2.2.2"));
  env.USERS.ops = 0;
  const r = await j(call(env, "GET", "/reorder", null, token));
  assert.equal(r.status, 200);
  assert.deepEqual(r.waiting, { c: 2 });
  assert.equal(Object.values(r.followers)[0], 1);
  assert.deepEqual(r.sold, { a: 2 });
  assert.equal(r.requests.length, 1, "the same request typed two ways is one line");
  assert.equal(r.requests[0].people, 2);
  assert.ok(env.USERS.ops <= 10, `used ${env.USERS.ops} KV calls`);
  assert.equal((await j(call(env, "GET", "/reorder"))).status, 401);
});
