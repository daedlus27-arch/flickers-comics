/* Stock, Discord edits, the archive, order lookup and merged publishing. Uses a fake GitHub and a fake Discord that remember what happens to them. */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { mergeStock } from "../worker/src/github.js";

class FakeKV {
  constructor() { this.m = new Map(); this.ttl = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v, o) { this.m.set(k, String(v)); this.ttl.set(k, o && o.expirationTtl); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = "" } = {}) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true }; }
}
const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const COMICS = () => [
  { id: "batman-1", cat: "issues", title: "Batman", num: "#1", price: 400, stock: 3, blurb: "x" },
  { id: "flash-2", cat: "issues", title: "Flash", num: "#2", price: 500, stock: 5, blurb: "x" },
  { id: "one-left", cat: "issues", title: "Rare", num: "#9", price: 900, stock: 1, blurb: "x" }
];
const CONFIG = { postage: 1000, openHour: 20, closeHour: 22, collectDaysAhead: 14 };
const today = () => new Date().toISOString().slice(0, 10);
const baseEnv = (over = {}) => ({
  USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", GITHUB_TOKEN: "x", GITHUB_REPO: "o/r", GITHUB_BRANCH: "main",
  ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "true", DISCORD_WEBHOOK_URL: HOOK, ...over
});
const order = (over = {}) => ({ name: "Jamie Reyes", phone: "555 0142", method: "collect", collectDate: today(), notes: "", items: [{ id: "batman-1", qty: 2 }], ...over });
const call = (env, method, path, body, token, ip = "1.2.3.4") => worker.fetch(new Request("https://api.test" + path, {
  method, headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined
}), env);
const j = async res => ({ status: res.status, ...(await res.json()) });
async function staff(env) {
  await call(env, "POST", "/setup", { key: "k", username: "owner", password: "correct horse battery" });
  return (await j(await call(env, "POST", "/login", { username: "owner", password: "correct horse battery" }))).token;
}
const place = async (env, over, ip) => j(await call(env, "POST", "/orders", order(over), null, ip));
const stored = env => [...env.USERS.m.entries()].filter(([k]) => k.startsWith("order:")).map(([, v]) => JSON.parse(v));

/* in-memory GitHub + Discord */
function world({ githubDown = false, raceOnce = false, discord = 200 } = {}) {
  const st = { products: COMICS(), featured: [], head: 1, blobs: {}, n: 0, commits: [], discord: [], edits: [], notes: [], raced: false, lastTree: null };
  const b64 = s => Buffer.from(s).toString("base64");
  const ok = d => new Response(JSON.stringify(d), { status: 200 });
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || "GET";
    if (u === `${ORIGIN}/data/shop.json`) return ok({ config: CONFIG, products: COMICS() }); // the published site: always the original stock, i.e. possibly stale
    if (u.startsWith(HOOK)) {
      if (discord !== 200) return new Response("{}", { status: discord });
      const body = JSON.parse(opts.body);
      if (method === "PATCH") { st.edits.push({ url: u, body }); return ok({}); }
      if (body.embeds) { const id = String(1000 + st.discord.length); st.discord.push(body); return ok({ id }); }
      st.notes.push(body); return ok({});
    }
    if (u.startsWith("https://api.github.com/repos/o/r")) {
      if (githubDown) return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      const path = new URL(u).pathname.replace("/repos/o/r", "");
      if (path.startsWith("/git/ref/heads/") && method === "GET") return ok({ object: { sha: "head" + st.head } });
      if (path === "/contents/data/products.json") return ok({ sha: "v" + st.head, content: b64(JSON.stringify(st.products)) });
      if (path === "/contents/data/featured.json") return ok({ sha: "f", content: b64(JSON.stringify(st.featured)) });
      if (path.startsWith("/git/commits/") && method === "GET") return ok({ tree: { sha: "t0" } });
      if (path === "/git/blobs") { const sha = "b" + (++st.n); st.blobs[sha] = JSON.parse(opts.body); return ok({ sha }); }
      if (path === "/git/trees") { st.lastTree = JSON.parse(opts.body).tree; return ok({ sha: "t1" }); }
      if (path === "/git/commits" && method === "POST") { st.commits.push(JSON.parse(opts.body).message); return ok({ sha: "c" + st.n }); }
      if (path.startsWith("/git/refs/heads/") && method === "PATCH") {
        if (raceOnce && !st.raced) { st.raced = true; st.head++; return new Response(JSON.stringify({ message: "Update is not a fast forward" }), { status: 422 }); }
        const entry = st.lastTree.find(t => t.path === "data/products.json");
        st.products = JSON.parse(st.blobs[entry.sha].content);
        st.head++;
        return ok({});
      }
    }
    return new Response("{}", { status: 404 });
  };
  return st;
}
const stockOf = (st, id) => st.products.find(p => p.id === id).stock;

test("ordering takes the comics off the shelf in GitHub, without putting customer details in the commit", async () => {
  const st = world(), env = baseEnv();
  const r = await place(env, { name: "Jamie Reyes", phone: "5550142" });
  assert.equal(r.status, 200);
  assert.equal(stockOf(st, "batman-1"), 1);
  assert.equal(st.commits.length, 1);
  assert.match(st.commits[0], new RegExp(r.orderId));
  assert.ok(!/Jamie|5550142/.test(st.commits[0]), "no personal details in the public repository history");
  assert.equal(stored(env)[0].stock, "held");
});

test("the real stock in GitHub wins over the (possibly out of date) published site", async () => {
  const st = world(), env = baseEnv();
  st.products.find(p => p.id === "batman-1").stock = 1; // the published site still says 3
  const r = await place(env, { items: [{ id: "batman-1", qty: 2 }] });
  assert.equal(r.status, 409);
  assert.match(r.error, /only have 1/);
  assert.equal(stockOf(st, "batman-1"), 1, "nothing was taken");
  assert.equal(stored(env).length, 0, "no order was saved");
  const last = await place(env, { items: [{ id: "one-left", qty: 1 }] });
  assert.equal(last.status, 200);
  assert.equal((await place(env, { items: [{ id: "one-left", qty: 1 }] })).status, 409, "the last copy can only be sold once");
});

test("if someone else commits at the same moment, the order retries and takes stock once", async () => {
  const st = world({ raceOnce: true }), env = baseEnv();
  const r = await place(env);
  assert.equal(r.status, 200);
  assert.equal(stockOf(st, "batman-1"), 1);
});

test("if GitHub can't be reached the order is still taken and flagged for staff", async () => {
  const st = world({ githubDown: true }), env = baseEnv();
  const r = await place(env);
  assert.equal(r.status, 200, "an expired token must never stop customers ordering");
  assert.equal(stored(env)[0].stock, "manual");
  assert.ok(st.discord[0].embeds[0].fields.some(f => f.name === "Stock" && /staff area/.test(f.value)), "the Discord post says stock needs adjusting by hand");
});

test("cancelling puts comics back, reopening takes them again, and a sold-out reopen is refused", async () => {
  const st = world(), env = baseEnv(), token = await staff(env);
  const { orderId } = await place(env, { items: [{ id: "batman-1", qty: 2 }] });
  assert.equal(stockOf(st, "batman-1"), 1);
  let r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "cancelled" }, token));
  assert.equal(r.order.stock, "released");
  assert.equal(stockOf(st, "batman-1"), 3);
  r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "new" }, token));
  assert.equal(r.order.stock, "held");
  assert.equal(stockOf(st, "batman-1"), 1);
  await call(env, "POST", `/orders/${orderId}`, { status: "cancelled" }, token);
  st.products.find(p => p.id === "batman-1").stock = 0; // sold elsewhere meanwhile
  r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "new" }, token));
  assert.equal(r.status, 409);
  assert.match(r.error, /Can't reopen/);
  assert.equal(stored(env)[0].status, "cancelled", "still cancelled");
});

test("a cancel that can't return the stock still cancels, and says so", async () => {
  let st = world(), env = baseEnv(), token = await staff(env);
  const { orderId } = await place(env);
  st = world({ githubDown: true }); // GitHub goes away after the order
  const r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "cancelled" }, token));
  assert.equal(r.status, 200);
  assert.equal(r.order.status, "cancelled");
  assert.equal(r.order.stock, "restore-failed");
  assert.match(r.warnings[0], /Add them back under Stock/);
});

test("the Discord post is edited as the order moves, and staff are nudged when it's ready", async () => {
  const st = world(), env = baseEnv({ DISCORD_PING_ROLE: "123456789012345678" }), token = await staff(env);
  const { orderId } = await place(env, { name: "@everyone **Jamie**" });
  assert.equal(st.discord.length, 1);
  assert.equal(stored(env)[0].discordId, "1000");

  let r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "ready" }, token));
  assert.equal(r.discord, "updated");
  assert.equal(st.edits.length, 1);
  assert.ok(st.edits[0].url.endsWith("/messages/1000"), "edits the original message");
  assert.match(st.edits[0].body.embeds[0].title, /READY$/);
  assert.equal(st.notes.length, 1, "one follow-up message");
  assert.match(st.notes[0].content, /is ready to collect/);
  assert.deepEqual(st.notes[0].allowed_mentions.parse, []);
  assert.ok(!/@everyone/.test(st.notes[0].content.replace(/\\@/g, "")) || /\\\*\\\*/.test(st.notes[0].content), "customer text is escaped");

  r = await j(await call(env, "POST", `/orders/${orderId}`, { paid: true }, token));
  assert.equal(st.edits.length, 2);
  assert.equal(st.edits[1].body.embeds[0].footer.text, "Paid");
  assert.equal(st.edits[1].body.embeds[0].fields.find(f => f.name === "Payment").value, "Paid");
  assert.equal(st.notes.length, 1, "no new ping for payment");

  await call(env, "POST", `/orders/${orderId}`, { status: "done" }, token);
  assert.match(st.edits[2].body.embeds[0].title, /COLLECTED$/);
  assert.equal(st.edits[2].body.embeds[0].color, 0x23A55A);
  assert.equal(st.notes.length, 1);
});

test("orders placed before Discord posts were tracked just skip the edit", async () => {
  const st = world(), env = baseEnv(), token = await staff(env);
  const { orderId } = await place(env);
  const key = [...env.USERS.m.keys()].find(k => k.startsWith("order:"));
  const rec = JSON.parse(env.USERS.m.get(key)); delete rec.discordId; env.USERS.m.set(key, JSON.stringify(rec));
  const r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "done" }, token));
  assert.equal(r.status, 200);
  assert.equal(r.discord, "skipped");
  assert.equal(st.edits.length, 0);
});

test("finished orders go to the archive and are deleted 14 days after they finish", async () => {
  world();
  const env = baseEnv(), token = await staff(env);
  const { orderId } = await place(env);
  const key = [...env.USERS.m.keys()].find(k => k.startsWith("order:"));
  const day = 86400;
  assert.ok(env.USERS.ttl.get(key) > 80 * day, "open orders are kept up to 90 days");

  let r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "done" }, token));
  assert.ok(r.order.completedAt);
  assert.ok(env.USERS.ttl.get(key) <= 14 * day && env.USERS.ttl.get(key) > 13 * day, "finished orders expire after 14 days");
  await call(env, "POST", `/orders/${orderId}`, { paid: true }, token);
  assert.ok(env.USERS.ttl.get(key) <= 14 * day, "a later change doesn't extend the archive time");

  r = await j(await call(env, "POST", `/orders/${orderId}`, { status: "new" }, token));
  assert.equal(r.order.completedAt, undefined);
  assert.ok(env.USERS.ttl.get(key) > 80 * day, "reopened orders go back to the normal 90 days");

  await call(env, "POST", `/orders/${orderId}`, { status: "cancelled" }, token);
  assert.ok(env.USERS.ttl.get(key) <= 14 * day, "cancelled orders are archived too");

  const rec = JSON.parse(env.USERS.m.get(key)); rec.completedAt = new Date(Date.now() - 15 * day * 1000).toISOString(); env.USERS.m.set(key, JSON.stringify(rec));
  assert.equal((await j(await call(env, "GET", "/orders", null, token))).orders.length, 0, "anything past 14 days is gone from the list even before storage clears it");
});

test("customers can check an order with its number and phone, and see nothing else", async () => {
  world();
  const env = baseEnv(), token = await staff(env);
  const { orderId } = await place(env, { method: "post", collectDate: null, address: "12 Vinewood Blvd, Downtown", notes: "secret note", phone: "(555) 0142" });
  const look = async (id, phone, ip) => j(await call(env, "POST", "/orders/lookup", { id, phone }, null, ip));
  let r = await look(orderId.toLowerCase(), "5550142");
  assert.equal(r.status, 200, "case and phone formatting don't matter");
  assert.equal(r.statusLabel, "New");
  assert.equal(r.items[0].title, "Batman #1");
  const text = JSON.stringify(r);
  assert.ok(!/Vinewood|secret note|Jamie|5550142|discord|history/i.test(text), "no address, notes, name, phone or internals");

  await call(env, "POST", `/orders/${orderId}`, { status: "ready" }, token);
  assert.equal((await look(orderId, "5550142")).statusLabel, "Ready");

  const wrongPhone = await look(orderId, "5559999"), unknown = await look("FC-AAAAAA", "5550142");
  assert.equal(wrongPhone.status, 404);
  assert.equal(wrongPhone.error, unknown.error, "the same answer for a wrong phone and an unknown order");
  assert.equal((await look("nonsense", "5550142")).status, 400);
  assert.equal((await look(orderId, "12")).status, 400);
});

test("order lookups are rate limited", async () => {
  world();
  const env = baseEnv();
  let last;
  for (let i = 0; i < 13; i++) last = await j(await call(env, "POST", "/orders/lookup", { id: "FC-AAAAAA", phone: "5550142" }, null, "9.9.9.9"));
  assert.equal(last.status, 429);
});

test("mergeStock lays staff edits onto the latest stock", () => {
  const base = COMICS(), latest = COMICS();
  latest[0].stock = 1;                                   // an order took 2 batman
  latest.push({ id: "new-by-colleague", cat: "issues", title: "Y", price: 1, stock: 1, blurb: "" });
  const mine = COMICS();
  mine[1].price = 650;                                   // staff repriced flash
  mine.splice(2, 1);                                     // staff deleted the rare one
  mine.push({ id: "staff-added", cat: "issues", title: "Z", price: 2, stock: 2, blurb: "" });
  const out = mergeStock(base, mine, latest);
  const by = Object.fromEntries(out.map(p => [p.id, p]));
  assert.equal(by["batman-1"].stock, 1, "the order's stock change is kept");
  assert.equal(by["flash-2"].price, 650, "the staff price edit is kept");
  assert.ok(!by["one-left"], "staff deletions are applied");
  assert.ok(by["new-by-colleague"] && by["staff-added"], "additions from both sides survive");
});

test("publishing from an out of date view merges instead of failing, and says so", async () => {
  const st = world(), env = baseEnv(), token = await staff(env);
  const loaded = await j(await call(env, "GET", "/stock", null, token));
  await place(env, { items: [{ id: "batman-1", qty: 2 }] });                 // stock moves on after staff loaded it
  const mine = loaded.products.map(p => ({ ...p })); mine.find(p => p.id === "flash-2").price = 650;

  const stale = await j(await call(env, "POST", "/publish", { version: loaded.version, products: mine, featured: [] }, token));
  assert.equal(stale.status, 409, "an old client with no base copy is still refused");

  const r = await j(await call(env, "POST", "/publish", { version: loaded.version, base: loaded.products, products: mine, featured: [] }, token));
  assert.equal(r.status, 200);
  assert.equal(r.merged, true);
  assert.equal(r.products.find(p => p.id === "batman-1").stock, 1, "the order's stock change survived");
  assert.equal(r.products.find(p => p.id === "flash-2").price, 650);
  assert.equal(stockOf(st, "batman-1"), 1);
  assert.equal(st.products.find(p => p.id === "flash-2").price, 650);
});
