// End-to-end check of the staff area against the local fake API (worker/dev.mjs).
import { launch } from "./lib.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const BASE = "http://localhost:8080", API = "http://localhost:8787";
const TOTAL = (await (await fetch(BASE + "/data/shop.json")).json()).products.length;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };

const shop = await (await fetch(BASE + "/data/shop.json")).json();
const inStock = shop.products.filter(p => p.stock > 0);
const day = new Date().toISOString().slice(0, 10);
async function place(over) {
  const r = await fetch(API + "/orders", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ name: "Jamie Reyes", phone: "5550142", method: "collect", collectDate: day, items: [{ id: inStock[0].id, qty: 1 }], ...over }) });
  return r.json();
}
const a = await place({});
const b = await place({ method: "post", collectDate: undefined, address: "12 Vinewood Blvd, Downtown", name: "=HYPERLINK(\"http://evil\")", notes: "Leave with the neighbour, \"quoted\"", items: [{ id: inStock[1].id, qty: 2 }] });
check("two test orders placed", a.orderId && b.orderId, `${a.orderId} ${b.orderId} ${JSON.stringify(a).slice(0, 80)}`);

const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "dl-"));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

await page.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await page.type("#u", "owner"); await page.type("#pw", "owner-password-1");
await page.click("#loginBtn"); await page.waitForSelector("#panel .arow", { timeout: 8000 });
check("signed in and stock loaded", true);

/* ---- stock filters & sort ---- */
const rows = () => page.$$eval("#aList .arow", r => r.length);
const total = await rows();
check("all comics listed", total === TOTAL, total);
await page.select("#aFilter", "sold"); await sleep(100);
const soldN = await rows(), expectSold = shop.products.filter(p => p.stock <= 0).length;
check("Sold out filter", soldN === expectSold, `${soldN} vs ${expectSold}`);
check("showing text", (await page.$eval("#aShowing", e => e.textContent)) === `Showing ${soldN} of ${TOTAL}`, await page.$eval("#aShowing", e => e.textContent));
check("select-all label says matching", (await page.$eval("#selAllLabel", e => e.textContent)).includes("matching"));
await page.select("#aFilter", "low"); await sleep(100);
const lowStocks = await page.$$eval("[data-stock]", els => els.map(e => +e.value));
check("Low stock filter shows only 1-2 copies", lowStocks.length > 0 && lowStocks.every(s => s === 1 || s === 2), lowStocks.join(","));
await page.select("#aFilter", "all"); await page.select("#aSort", "price-desc"); await sleep(100);
const prices = await page.$$eval("[data-price]", els => els.map(e => +e.value));
check("Sort by price high to low", prices.every((p, i) => i === 0 || p <= prices[i - 1]), prices.slice(0, 5).join(","));
await page.select("#aSort", "title"); await sleep(100);
const titles = await page.$$eval(".arow-title", els => els.map(e => e.textContent));
check("Sort A to Z", titles.every((t, i) => i === 0 || t.localeCompare(titles[i - 1], "en", { numeric: true, sensitivity: "base" }) >= 0), titles.slice(0, 3).join(" | "));
// edit a price then filter by changes
await page.select("#aSort", "shop");
await page.$eval("[data-price]", el => { el.value = String(+el.value + 50); el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.select("#aFilter", "changed"); await sleep(100);
check("Unpublished changes filter finds the edited comic", (await rows()) === 1);
await page.select("#aFilter", "all");

/* ---- orders ---- */
await page.click('[data-tab="orders"]'); await page.waitForSelector(".order", { timeout: 8000 });
const filterText = () => page.$$eval("#ordersFilter .btn", bs => bs.map(x => x.textContent + (x.getAttribute("aria-pressed") === "true" ? "*" : "")).join(" | "));
check("opens on the Open filter with counts", (await filterText()) === "Open (2)* | Archive (0)", await filterText());
check("both orders listed", (await page.$$eval(".order", o => o.length)) === 2);
// mark first order ready via keyboard-accessible button
await page.$eval(`[data-order="${a.orderId}"] summary`, s => s.click()); await sleep(100);
await page.$eval(`[data-oid="${a.orderId}"][data-status="ready"]`, b => b.click()); await sleep(500);
check("Mark ready shows Ready", (await page.$eval(`[data-order="${a.orderId}"] summary .pill-added`, e => e.textContent)) === "Ready");
check("details stayed open after the update", await page.$eval(`[data-order="${a.orderId}"]`, d => d.open));
check("history records who did it", (await page.$eval(`[data-order="${a.orderId}"]`, d => d.textContent)).includes("Marked ready by owner"));
await page.$eval(`[data-oid="${a.orderId}"][data-paid="yes"]`, b => b.click()); await sleep(500);
check("Mark paid shows Paid pill", !!(await page.$(`[data-order="${a.orderId}"] summary .pill-added:last-of-type`)) && (await page.$eval(`[data-order="${a.orderId}"]`, d => d.textContent)).includes("Marked paid"));
await page.$eval(`[data-oid="${a.orderId}"][data-status="done"]`, b => b.click()); await sleep(500);
check("Finished counts update and the order leaves Open", (await filterText()) === "Open (1)* | Archive (1)", await filterText());
// cancel needs a confirmation
await page.$eval(`[data-order="${b.orderId}"] summary`, s => s.click()); await sleep(100);
await page.$eval(`[data-oid="${b.orderId}"][data-status="cancelled"]`, bt => bt.click()); await sleep(200);
check("cancel asks first", (await page.$eval("#aMsg", e => e.textContent)).includes("Cancel order " + b.orderId));
check("nothing changed yet", (await filterText()).startsWith("Open (1)*"));
const [, confirmBtn] = await page.$$("#aMsg .btn");
await page.$eval("#aMsg .btn-danger", bt => bt.click()); await sleep(500);
check("cancelled", (await filterText()) === "Open (0)* | Archive (2)", await filterText());
await page.click('[data-filter="archive"]'); await sleep(100);
check("Archive shows both and cancelled is styled", (await page.$$eval(".order", o => o.length)) === 2 && await page.$eval(`[data-order="${b.orderId}"]`, d => d.classList.contains("is-cancelled")));
await page.$eval(`[data-oid="${b.orderId}"][data-status="new"]`, bt => bt.click()).catch(() => {});
// reload keeps status (server side)
let sawLeaveGuard = false;
page.on("dialog", d => { sawLeaveGuard = d.type() === "beforeunload"; d.accept(); });
await page.reload({ waitUntil: "networkidle0" });
check("unpublished edits trigger a leave-page warning", sawLeaveGuard);
await page.waitForSelector('[data-tab="orders"]'); await page.click('[data-tab="orders"]'); await page.waitForSelector(".order");
check("status survives a reload", (await filterText()).startsWith("Open (") && (await page.$$eval(".order", o => o.length)) >= 1);
await page.click('[data-filter="archive"]'); await sleep(100);

// CSV
await page.click("#csvBtn");
let file = null;
for (let i = 0; i < 30 && !file; i++) { await sleep(200); file = fs.readdirSync(downloads).find(f => f.endsWith(".csv")); }
check("CSV downloaded", !!file, file);
if (file) {
  const csv = fs.readFileSync(path.join(downloads, file), "utf8");
  const lines = csv.trim().split(/\r\n/);
  check("CSV has a header and one row per order", lines[0].replace("\ufeff", "").startsWith("Order,Placed,Status,Paid") && lines.length >= 3, lines.length + " lines");
  check("formula-looking customer name is defused", csv.includes(`"'=HYPERLINK(""http://evil"")"`), csv.split("\r\n")[1] && csv.split("\r\n").find(l => l.includes("HYPERLINK")));
  check("phone number is not mangled", csv.includes(",5550142,"));
}
check("no script errors in the staff area", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
