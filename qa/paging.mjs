import { launch } from "./lib.mjs";
const BASE = "http://localhost:8080", API = "http://localhost:8787";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : "")); };
const shop = await (await fetch(BASE + "/data/shop.json")).json();
const ids = shop.products.filter(p => p.stock > 0).map(p => p.id);
const day = new Date().toISOString().slice(0, 10);
let placed = 0;
for (let i = 0; i < 46; i++) {
  const r = await fetch(API + "/orders", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, "CF-Connecting-IP": "10.0.0." + i }, body: JSON.stringify({ name: "Paging Tester " + i, phone: "555" + (1000 + i), method: "collect", collectDate: day, items: [{ id: ids[i % ids.length], qty: 1 }] }) });
  if (r.ok) placed++;
}
for (let i = 0; i < 45; i++) {
  await fetch(API + "/wants", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, "CF-Connecting-IP": "11.0.0." + i }, body: JSON.stringify({ kind: "request", text: "Some rare comic number " + i, name: "Want Tester " + i, phone: "556" + (1000 + i) }) });
}
check("46 orders placed", placed === 46, String(placed));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await page.type("#u", "owner"); await page.type("#pw", "owner-password-1");
await page.click("#loginBtn"); await page.waitForSelector("#panel .arow");
await page.$eval('[data-tab="orders"]', b => b.click()); await page.waitForSelector("#ordersList");
await sleep(600);
const n1 = await page.$$eval("#ordersList details.order", d => d.length);
check("first page shows 40 orders", n1 === 40, String(n1));
check("a 'show older' button is offered", await page.$eval("[data-more]", b => /Show older orders/.test(b.textContent)));
check("note says how many are showing", /newest 40 orders/.test(await page.$eval(".orders-more", e => e.textContent)));
await page.$eval("[data-more]", b => b.click()); await sleep(600);
const n2 = await page.$$eval("#ordersList details.order", d => d.length);
check("older orders load into the list", n2 === 46, String(n2));
check("button disappears when everything is loaded", (await page.$("[data-more]")) === null);
check("filter counts cover everything loaded", /Open \(46\)/.test(await page.$eval("#ordersFilter", e => e.textContent)));
await page.$eval('[data-tab="wanted"]', b => b.click()); await page.waitForSelector("#wantedList .want, #wantedList .admin-empty"); await sleep(600);
const w1 = await page.$$eval("#wantedList .want", d => d.length);
check("wanted tab: first page 40", w1 === 40, String(w1));
await page.$eval("[data-more]", b => b.click()); await sleep(600);
const w2 = await page.$$eval("#wantedList .want", d => d.length);
check("wanted tab: older ones load", w2 === 45, String(w2));
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(results.every(Boolean) ? "ALL PASS" : "SOME FAILED");
await browser.close();
