/* Free-plan Workers may make only ~50 subrequests per request, and every KV call counts. These tests keep the busy paths well under that
   however many orders and requests have piled up. */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { FakeKV, caller, j } from "./helpers.mjs";

const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const call = caller(worker, ORIGIN);
const COMICS = () => [
  { id: "gone-5", cat: "issues", title: "Gone Girl", num: "#5", price: 500, stock: 0, blurb: "x" },
  { id: "batman-1", cat: "issues", title: "Batman", num: "#1", price: 400, stock: 3, blurb: "x" }
];
const baseEnv = () => ({
  USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", GITHUB_TOKEN: "x", GITHUB_REPO: "o/r", GITHUB_BRANCH: "main",
  ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "true", DISCORD_WEBHOOK_URL: HOOK
});
async function staff(env) {
  await call(env, "POST", "/setup", { key: "k", username: "owner", password: "correct horse battery" });
  return (await j(call(env, "POST", "/login", { username: "owner", password: "correct horse battery" }))).token;
}
const world = () => {
  const posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === `${ORIGIN}/data/shop.json`) return new Response(JSON.stringify({ config: { postage: 1000 }, products: COMICS() }));
    if (u.startsWith(HOOK)) { posts.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ id: "1" })); }
    return new Response("{}", { status: 404 });
  };
  return posts;
};

test("the order list comes in pages, and a page costs far fewer KV calls than the free plan allows", async () => {
  world();
  const env = baseEnv(), token = await staff(env);
  for (let i = 0; i < 95; i++) {
    const placedAt = new Date(Date.now() - i * 60000).toISOString();
    const id = "FC-" + String(100000 + i).replace(/0/g, "A").replace(/1/g, "B");
    await env.USERS.put(`order:${String(9e15 - Date.parse(placedAt)).padStart(16, "0")}:${id}`, JSON.stringify({ id, placedAt, status: "new", items: [], name: "N", phone: "5550142" }));
  }
  env.USERS.ops = 0;
  const first = await j(call(env, "GET", "/orders", null, token));
  assert.equal(first.orders.length, 40);
  assert.ok(first.cursor, "there are more to load");
  assert.ok(env.USERS.ops <= 45, `a page used ${env.USERS.ops} KV calls`);
  const second = await j(call(env, "GET", "/orders?cursor=" + encodeURIComponent(first.cursor), null, token));
  const third = await j(call(env, "GET", "/orders?cursor=" + encodeURIComponent(second.cursor), null, token));
  assert.equal(second.orders.length, 40);
  assert.equal(third.orders.length, 15);
  assert.equal(third.cursor, null);
  const ids = [...first.orders, ...second.orders, ...third.orders].map(o => o.id);
  assert.equal(new Set(ids).size, 95, "no order is listed twice or missed");
  assert.ok(Date.parse(first.orders[0].placedAt) > Date.parse(third.orders[14].placedAt), "newest first");
});

test("the wanted list pages too, and restock alerts read only the people who asked", async () => {
  const posts = world();
  const env = baseEnv(), token = await staff(env);
  for (let i = 0; i < 70; i++) {
    const r = await j(call(env, "POST", "/wants", { kind: "series", productId: "batman-1", name: "Fan Number" + i, phone: "555" + String(1000 + i) }, null, "9.9.9." + i));
    assert.equal(r.status, 200);
  }
  await j(call(env, "POST", "/wants", { kind: "restock", productId: "gone-5", name: "Jamie Reyes", phone: "5550142" }, null, "8.8.8.8"));

  const page1 = await j(call(env, "GET", "/wants", null, token));
  assert.equal(page1.wants.length, 40);
  assert.ok(page1.cursor);
  const page2 = await j(call(env, "GET", "/wants?cursor=" + encodeURIComponent(page1.cursor), null, token));
  assert.equal(page2.wants.length, 31);
  assert.equal(page2.cursor, null);

  // a new customer joining a long list is cheap
  env.USERS.ops = 0;
  await j(call(env, "POST", "/wants", { kind: "request", text: "Spawn #1", name: "Casey Moore", phone: "5550999" }, null, "7.7.7.7"));
  assert.ok(env.USERS.ops <= 12, `joining used ${env.USERS.ops} KV calls`);

  // restocking the one sold-out comic reads just the one person waiting for it, not all 70 followers
  const { announceRestocks } = await import("../worker/src/wants.js");
  env.USERS.ops = 0; posts.length = 0;
  await announceRestocks(env, [{ id: "gone-5", stock: 0 }, { id: "batman-1", stock: 3 }], [{ id: "gone-5", title: "Gone Girl", num: "#5", stock: 2 }, { id: "batman-1", stock: 3 }]);
  assert.ok(env.USERS.ops <= 8, `a restock alert used ${env.USERS.ops} KV calls`);
  assert.equal(posts.length, 1);
  assert.match(posts[0].embeds[0].description, /Jamie Reyes/);
});

test("a publish with the most new photos allowed stays within a free-plan Worker's subrequests", async () => {
  const env = baseEnv(), token = await staff(env);
  const calls = [];
  const b64 = s => Buffer.from(s).toString("base64");
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]).toString("base64");
  const products = Array.from({ length: 30 }, (_, i) => ({ id: "c" + i, cat: "issues", title: "Comic " + i, price: 100, stock: 1, blurb: "x", image: `assets/covers/c${i}.jpg` }));
  const uploads = Object.fromEntries(products.map(p => [p.image, jpeg]));
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || "GET";
    if (u.startsWith(HOOK)) return new Response("{}");
    calls.push(method + " " + new URL(u).pathname);
    const path = new URL(u).pathname.replace("/repos/o/r", ""), ok = d => new Response(JSON.stringify(d));
    if (path.startsWith("/git/ref/heads/") && method === "GET") return ok({ object: { sha: "h" } });
    if (path === "/contents/data/products.json") return ok({ sha: "v1", content: b64("[]") });
    if (path === "/contents/data/featured.json") return ok({ sha: "f", content: b64("[]") });
    if (path.startsWith("/git/commits/") && method === "GET") return ok({ tree: { sha: "t0" } });
    if (path === "/git/blobs") return ok({ sha: "b" + calls.length });
    if (path === "/git/trees") return ok({ sha: "t1" });
    if (path === "/git/commits") return ok({ sha: "c1" });
    return ok({});
  };
  const r = await j(call(env, "POST", "/publish", { version: "v1", products, uploads }, token));
  assert.equal(r.status, 200);
  assert.ok(calls.length + env.USERS.ops <= 50, `${calls.length} GitHub calls and ${env.USERS.ops} KV calls`);

  const tooMany = { ...uploads, ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`assets/covers/x${i}.jpg`, jpeg])) };
  const refused = await j(call(env, "POST", "/publish", { version: "v1", products, uploads: tooMany }, token));
  assert.equal(refused.status, 400);
  assert.match(refused.error, /limit is 30/);
});
