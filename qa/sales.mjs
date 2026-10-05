/* The owner's Sales tab: takings, orders, best sellers, hand-over time, and that regular staff don't see it. */
import { launch, BASE, API } from "./lib.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };
const json = async (route, body, token, ip = "9.9.9.9") => { const r = await fetch(API + route, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: BASE, "CF-Connecting-IP": ip, ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...(await r.json()) }; };
const shop = await (await fetch(BASE + "/data/shop.json")).json();
const ids = shop.products.filter(p => p.stock > 3).map(p => p.id);
const byId = Object.fromEntries(shop.products.map(p => [p.id, p]));
const day = new Date().toISOString().slice(0, 10);
const place = (items, ip) => json("/orders", { name: "Sales Tester", phone: "5550166", method: "collect", collectDate: day, items }, null, ip);

const a = await place([{ id: ids[0], qty: 2 }], "3.3.3.1");
const b = await place([{ id: ids[1], qty: 1 }, { id: ids[2], qty: 1 }, { id: ids[3], qty: 1 }], "3.3.3.2");
const c = await place([{ id: ids[4], qty: 1 }], "3.3.3.3");
const owner = (await json("/login", { username: "owner", password: "owner-password-1" })).token;
await json(`/orders/${a.orderId}`, { status: "done", paid: true }, owner);
await json(`/orders/${c.orderId}`, { status: "cancelled" }, owner);
await json("/users", { username: "clerk", password: "shelf-stacker-77", role: "staff" }, owner);

const live = a.total + b.total;
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await page.type("#u", "owner"); await page.type("#pw", "owner-password-1"); await page.click("#loginBtn");
await page.waitForSelector("#panel .arow");
await page.$eval('[data-tab="sales"]', t => t.click()); await page.waitForSelector(".stats"); await sleep(300);
const stats = await page.$$eval(".stat", els => Object.fromEntries(els.map(e => [e.querySelector(".stat-label").textContent, e.querySelector("b").textContent])));
const money = n => "$" + n.toLocaleString("en-US");
check("takings add up the two live orders, not the cancelled one", stats.Takings === money(live), JSON.stringify(stats));
check("order count leaves out the cancelled order", stats.Orders === "2" && stats.Cancelled === "1");
check("copies sold counts every copy", stats["Copies sold"] === "5");
check("the deal's savings are shown", stats["Saved by the deal"] === money(Math.min(byId[ids[1]].price, byId[ids[2]].price, byId[ids[3]].price)), stats["Saved by the deal"]);
check("paid so far is the paid order only", stats["Paid so far"] === money(a.total));
const weekRows = await page.$$eval(".sales-table:nth-of-type(1) tbody tr", r => r.length);
check("twelve weeks are listed by default", weekRows === 12, String(weekRows));
const cells = await page.$$eval(".sales-table tbody tr", r => [...r[11].querySelectorAll("th, td")].map(c => c.textContent.trim()));
check("this week holds the takings, orders and copies", cells[1] === money(live) && cells[2] === "2" && cells[3] === "5", cells.join(" | "));
const best = await page.$$eval(".sales-table:nth-of-type(2) tbody tr", r => r.map(x => x.textContent.replace(/\s+/g, " ")));
check("best sellers lead with the two-copy comic and show its title", best[0].includes("2") && best[0].includes(byId[ids[0]].title), best[0]);
check("hand-over time is reported for the collected order", /1 order was collected or posted/.test(await page.$eval(".sales-timing", e => e.textContent)));
await page.select("#salesWeeks", "4"); await sleep(600);
check("changing the period reloads the figures", (await page.$$eval(".sales-table:nth-of-type(1) tbody tr", r => r.length)) === 4);
await page.$eval("#salesWeeks", s => s.focus());
check("no page errors", errors.length === 0, errors.join(" | "));

// regular staff don't get the tab
const staff = await browser.newPage();
await staff.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await staff.type("#u", "clerk"); await staff.type("#pw", "shelf-stacker-77"); await staff.click("#loginBtn");
await staff.waitForSelector("#panel .arow");
check("staff without the owner role see no Sales tab", (await staff.$('[data-tab="sales"]')) === null);
check("and the Worker refuses them the report", (await json("/report", null, (await json("/login", { username: "clerk", password: "shelf-stacker-77" })).token)).status === 403);
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
