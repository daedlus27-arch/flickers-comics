/* The deal: buy two, get one free (the cheapest is the free one), worked out by the Worker and shown the same way in the browser. */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { dealDiscount, dealName, dealOn } from "../src/shared.mjs";
import { FakeKV, caller, j } from "./helpers.mjs";

const DEAL = { enabled: true, buy: 2, free: 1 };
const lines = (...prices) => prices.map(price => ({ price, qty: 1 }));

test("every third comic, the cheapest of each three, is free", () => {
  assert.deepEqual(dealDiscount(lines(500, 400), DEAL), { discount: 0, freeUnits: 0, toGo: 1 }, "two comics: one more to go");
  assert.equal(dealDiscount(lines(500, 400, 300), DEAL).discount, 300, "the cheapest of three");
  assert.equal(dealDiscount(lines(300, 500, 400), DEAL).discount, 300, "order in the cart doesn't matter");
  assert.equal(dealDiscount(lines(500, 500, 400, 100), DEAL).discount, 400, "a fourth comic doesn't change which three are grouped");
  assert.equal(dealDiscount(lines(600, 500, 400, 300, 200, 100), DEAL).discount, 400 + 100, "six comics: the cheapest of each group of three");
  assert.equal(dealDiscount([{ price: 400, qty: 3 }], DEAL).discount, 400, "quantities count as separate copies");
  assert.equal(dealDiscount([], DEAL).toGo, 3);
  assert.equal(dealDiscount(lines(500), DEAL).toGo, 2);
  assert.equal(dealDiscount(lines(500, 400, 300), DEAL).toGo, 3, "once a free one is earned, three more for the next");
  assert.equal(dealDiscount(lines(100, 100, 100, 100), DEAL).toGo, 2, "four comics: two more make the next three");
});

test("the deal can be switched off or changed in the config", () => {
  assert.equal(dealDiscount(lines(500, 400, 300), { ...DEAL, enabled: false }).discount, 0);
  assert.equal(dealDiscount(lines(500, 400, 300), null).discount, 0);
  assert.equal(dealDiscount(lines(500, 400, 300, 200), { enabled: true, buy: 3, free: 1 }).discount, 200, "buy three, get one free");
  assert.equal(dealName(DEAL), "Buy 2, get 1 free");
  assert.equal(dealName({ enabled: true, buy: 3, free: 2 }), "Buy 3, get 2 free");
  assert.ok(!dealOn({ enabled: true, buy: 0, free: 1 }) && !dealOn(undefined));
});

/* ---- through the Worker ---- */
const ORIGIN = "https://shop.example", HOOK = "https://discord.test/api/webhooks/1/secret-token";
const call = caller(worker, ORIGIN);
const SHOP = {
  config: { postage: 1000, openHour: 20, closeHour: 22, collectDaysAhead: 14, deal: DEAL },
  products: [
    { id: "a", cat: "issues", title: "Alpha", num: "#1", price: 500, stock: 5 },
    { id: "b", cat: "issues", title: "Bravo", num: "#2", price: 400, stock: 5 },
    { id: "c", cat: "issues", title: "Charlie", num: "#3", price: 300, stock: 5 }
  ]
};
const env = () => ({ USERS: new FakeKV(), SESSION_SECRET: "test-secret-0123456789", SETUP_KEY: "k", ALLOWED_ORIGINS: ORIGIN, SITE_URL: ORIGIN, ORDERS_ENABLED: "true", DISCORD_WEBHOOK_URL: HOOK });
const order = items => ({ name: "Jamie Reyes", phone: "5550142", method: "post", address: "12 Vinewood Blvd, Downtown", items });

test("the Worker applies the deal itself, shows it in Discord and to the customer, and ignores a browser's own total", async () => {
  const posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === `${ORIGIN}/data/shop.json`) return new Response(JSON.stringify(SHOP));
    if (u.startsWith(HOOK)) { posts.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ id: "1" })); }
    return new Response("{}", { status: 404 });
  };
  const e = env();
  const r = await j(call(e, "POST", "/orders", { ...order([{ id: "a", qty: 1 }, { id: "b", qty: 1 }, { id: "c", qty: 1 }]), total: 1, discount: 99999 }));
  assert.equal(r.status, 200);
  assert.equal(r.subtotal, 1200);
  assert.equal(r.discount, 300, "the cheapest of the three is free");
  assert.equal(r.total, 1200 - 300 + 1000, "postage is not discounted");
  const fields = Object.fromEntries(posts[0].embeds[0].fields.map(f => [f.name, f.value]));
  assert.equal(fields["Buy 2, get 1 free"], "−$300");
  assert.match(fields.Total, /\$1,900/);

  const look = await j(call(e, "POST", "/orders/lookup", { id: r.orderId, phone: "5550142" }));
  assert.equal(look.discount, 300);
  assert.equal(look.total, 1900);

  const two = await j(call(e, "POST", "/orders", order([{ id: "a", qty: 1 }, { id: "b", qty: 1 }]), null, "5.5.5.5"));
  assert.equal(two.discount, 0, "two comics earn nothing yet");
  assert.equal(two.total, 900 + 1000);
});
