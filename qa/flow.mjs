// Whole flow against the local fake services: customer orders -> tracks -> staff work the order -> stock, archive, merge.
import { launch } from "./lib.mjs";
const BASE = "http://localhost:8080", API = "http://localhost:8787";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const typ = async (p, sel, text) => { await p.bringToFront(); await p.type(sel, text); };
const clk = (p, sel) => p.$eval(sel, e => e.click());
const results = [];
const check = (name, ok, extra = "") => { results.push(!!ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };

const shop = await (await fetch(BASE + "/data/shop.json")).json();
const [A, B, C] = shop.products.filter(p => p.stock >= 5);
const day = new Date().toISOString().slice(0, 10);
const browser = await launch();
const errors = [];
const mk = async (w, h) => { const p = await browser.newPage(); await p.setViewport({ width: w, height: h }); p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); return p; };

/* staff session first, to read stock */
const staff = await mk(1280, 900);
await staff.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await typ(staff, "#u", "owner"); await typ(staff, "#pw", "owner-password-1");
await clk(staff, "#loginBtn"); await staff.waitForSelector("#panel .arow");
const stockInput = id => staff.$eval(`[data-stock="${id}"]`, e => +e.value);
const startA = await stockInput(A.id);
check("starting stock read from the staff area", startA === A.stock, `${startA}`);

/* customer orders 2 of A through the real page */
const shopper = await mk(390, 844);
await shopper.goto(BASE + "/", { waitUntil: "networkidle0" });
check("track links are shown when ordering is live", await shopper.$$eval("[data-track]", b => b.some(x => !x.hidden)));
await shopper.evaluate(() => localStorage.clear());
await shopper.reload({ waitUntil: "networkidle0" });
await shopper.$eval(`[data-add="${A.id}"]`, b => { b.click(); b.click(); }); await sleep(300);
await shopper.$eval("#cartBtn", b => b.click()); await sleep(300);
await shopper.$eval("#checkoutBtn", b => b.click()); await sleep(300);
await typ(shopper, "#f-name", "Flow Tester"); await typ(shopper, "#f-phone", "555 0177");
await shopper.$eval("#f-date", el => { el.value = el.min; el.dispatchEvent(new Event("input", { bubbles: true })); });
await shopper.$eval("#payBtn", b => b.click());
await shopper.waitForSelector(".ticket strong", { timeout: 15000 });
const id1 = await shopper.$eval(".ticket strong", e => e.textContent);
check("order placed", /^FC-[A-Z2-9]{6}$/.test(id1), id1);
check("stock in the staff area dropped by 2 after refreshing", await (async () => { await clk(staff, "#aRefresh"); await sleep(600); return (await stockInput(A.id)) === startA - 2; })(), `${await stockInput(A.id)}`);

/* customer tracks it from the confirmation */
await shopper.$eval("[data-track-this]", b => b.click());
await shopper.waitForSelector("#trackStatus", { timeout: 10000 });
check("tracking shows New", (await shopper.$eval("#trackStatus", e => e.textContent)) === "New");
check("progress steps shown, first current", (await shopper.$$eval(".steps li", l => l.map(x => x.className).join("|"))) === "is-current||");
const trackText = await shopper.$eval("#trackResult", e => e.textContent);
check("tracking shows items but no address or name", trackText.includes(A.title) && !/Flow Tester|555/.test(trackText));

/* staff marks it ready, then paid, customer sees Ready */
await clk(staff, '[data-tab="orders"]'); await staff.waitForSelector(".order");
await staff.$eval(`[data-oid="${id1}"][data-status="ready"]`, b => b.click()); await sleep(700);
check("staff sees Ready", (await staff.$eval(`[data-order="${id1}"] summary`, e => e.textContent)).includes("Ready"));
await shopper.$eval("[data-track-again]", b => b.click());
await typ(shopper, "#t-id", id1.toLowerCase()); await typ(shopper, "#t-phone", "5550177");
await shopper.$eval("#trackBtn", b => b.click());
await shopper.waitForSelector("#trackStatus", { timeout: 10000 });
check("customer sees Ready to collect", (await shopper.$eval("#trackStatus", e => e.textContent)) === "Ready to collect");
check("ready message tells them where to go", (await shopper.$eval(".track-msg", e => e.textContent)).includes("counter"));
await shopper.$eval("[data-track-again]", b => b.click());
await typ(shopper, "#t-id", id1); await typ(shopper, "#t-phone", "5559999");
await shopper.$eval("#trackBtn", b => b.click()); await sleep(700);
check("wrong phone gives a clear error", (await shopper.$eval("#trackError", e => e.textContent)).includes("couldn't find"));

await staff.$eval(`[data-oid="${id1}"][data-paid="yes"]`, b => b.click()); await sleep(600);
await staff.$eval(`[data-oid="${id1}"][data-status="done"]`, b => b.click()); await sleep(700);
const filters = await staff.$$eval("#ordersFilter .btn", bs => bs.map(x => x.textContent).join(" | "));
check("collected order leaves Open and joins the Archive", filters === "Open (0) | Archive (1)", filters);
check("message says it moved to the Archive", (await staff.$eval("#aMsg", e => e.textContent)).includes("Archive"));
await clk(staff, '[data-filter="archive"]'); await sleep(200);
check("archive explains the 2 week rule", (await staff.$eval("#ordersFilter", e => e.textContent)).includes("two weeks"));
await staff.$eval(".order summary", s => s.click()); await sleep(100);
const orderText = await staff.$eval(".order", e => e.textContent);
check("archived order shows when it will be deleted", /Kept until/.test(orderText) && /then deleted/.test(orderText));
check("stock note says it was taken automatically", orderText.includes("Taken off the shelf automatically"));
await shopper.$eval("#t-id", e => { e.value = ""; }); await shopper.$eval("#t-phone", e => { e.value = ""; });
await typ(shopper, "#t-id", id1); await typ(shopper, "#t-phone", "5550177");
await shopper.$eval("#trackBtn", b => b.click());
await shopper.waitForSelector("#trackStatus");
check("customer still sees the finished order", (await shopper.$eval("#trackStatus", e => e.textContent)) === "Collected" && (await shopper.$$eval(".steps li.is-done", l => l.length)) === 3);

/* cancelling puts stock back */
const r2 = await (await fetch(API + "/orders", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ name: "Cancel Tester", phone: "5550188", method: "collect", collectDate: day, items: [{ id: B.id, qty: 3 }] }) })).json();
await clk(staff, '[data-tab="stock"]'); await staff.waitForSelector("#panel .arow"); await sleep(300);
const afterOrderB = await stockInput(B.id);
check("second order took 3 off", afterOrderB === B.stock - 3, `${afterOrderB}`);
await clk(staff, '[data-tab="orders"]'); await staff.waitForSelector(".order");
await staff.$eval(`[data-oid="${r2.orderId}"][data-status="cancelled"]`, b => b.click()); await sleep(300);
check("cancel mentions the shelf", (await staff.$eval("#aMsg", e => e.textContent)).includes("go back on the shelf"));
await staff.$eval("#aMsg .btn-danger", b => b.click()); await sleep(900);
await clk(staff, '[data-tab="stock"]'); await staff.waitForSelector("#panel .arow"); await sleep(300);
check("cancelling put the 3 comics back", (await stockInput(B.id)) === B.stock, `${await stockInput(B.id)}`);

/* a stale publish is merged, not refused */
const startC = await stockInput(C.id);
await staff.$eval(`[data-price="${A.id}"]`, el => { el.value = String(+el.value + 25); el.dispatchEvent(new Event("change", { bubbles: true })); });
await fetch(API + "/orders", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ name: "Merge Tester", phone: "5550199", method: "collect", collectDate: day, items: [{ id: C.id, qty: 1 }] }) }); // stock moves while staff are editing
await clk(staff, "#aPublish"); await sleep(1200);
const msg = await staff.$eval("#aMsg", e => e.textContent);
check("publish went through and mentions new orders", msg.startsWith("Published") && msg.includes("New orders"), msg.slice(0, 80));
check("screen now shows the order's stock change", (await stockInput(C.id)) === startC - 1, `${await stockInput(C.id)} vs ${startC - 1}`);
check("and the staff price edit stuck", (await staff.$eval(`[data-price="${A.id}"]`, e => +e.value)) === A.price + 25);

check("no script errors", errors.length === 0, errors.join(" | "));
await browser.close();
const bad = results.filter(x => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
