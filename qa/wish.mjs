import { launch } from "./lib.mjs";
const BASE = process.argv[2] || "http://localhost:8080";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(!!ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };
const shop = await (await fetch(BASE + "/data/shop.json")).json();
const [A, B, C] = shop.products.filter(p => p.stock >= 3);
const browser = await launch();
const errors = [];
async function fresh(w = 1280, h = 900) {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { window.__copied = null; Object.defineProperty(navigator, "clipboard", { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });
  return page;
}
const count = p => p.$eval("#savedCount", e => +e.textContent);
const toastText = p => p.$eval("#toast", e => (e.hidden ? "" : e.textContent));

const a = await fresh();
await a.goto(BASE + "/", { waitUntil: "networkidle0" });
check("hearts and Saved button appear once the script runs", (await a.$$eval(".heart", h => h.every(x => !x.hidden))) && !(await a.$eval("#savedBtn", b => b.hidden)));
check("hearts are accessible toggle buttons", await a.$eval(`.heart[data-save="${A.id}"]`, b => b.getAttribute("aria-pressed") === "false" && b.getAttribute("aria-label").startsWith("Save ")));
await a.$eval(`.heart[data-save="${A.id}"]`, b => b.click());
await a.$eval(`.heart[data-save="${B.id}"]`, b => b.click()); await sleep(200);
check("saving updates the count and the heart", (await count(a)) === 2 && (await a.$eval(`.heart[data-save="${A.id}"]`, b => b.getAttribute("aria-pressed"))) === "true");
check("toast offers View saved", (await toastText(a)).includes("Saved"));
await a.reload({ waitUntil: "networkidle0" });
check("saved list survives a reload", (await count(a)) === 2);

await a.$eval("#savedBtn", b => b.click()); await sleep(300);
check("saved dialog lists both", (await a.$$eval("#savedLines .line", l => l.length)) === 2);
await a.$eval(`#savedLines [data-add="${A.id}"]`, b => b.click()); await sleep(300);
check("Add to cart from the saved list works", (await a.$eval("#cartCount", e => +e.textContent)) === 1);
await a.$eval("#savedAddAll", b => b.click()); await sleep(300);
check("Add all adds the rest", (await a.$eval("#cartCount", e => +e.textContent)) === 3, `${await a.$eval("#cartCount", e => +e.textContent)}`);
await a.$eval("[data-share-saved]", b => b.click()); await sleep(200);
const link = await a.evaluate(() => window.__copied);
check("share link has the ids", link && link.includes(`wish=${A.id},${B.id}`), link);
await a.$eval(`#savedLines [data-save="${B.id}"]`, b => b.click()); await sleep(200);
check("Remove takes it out of the list and the count", (await count(a)) === 1 && (await a.$$eval("#savedLines .line", l => l.length)) === 1);
await a.$eval(`#savedLines [data-save="${A.id}"]`, b => b.click()); await sleep(200);
check("empty list shows the friendly message", !(await a.$eval("#savedEmpty", e => e.hidden)));

// friend opens a shared list
const b = await fresh();
await b.goto(link, { waitUntil: "networkidle0" }); await sleep(400);
check("shared list saves the comics for a friend", (await count(b)) === 2 && (await toastText(b)).includes("shared list"));
check("address is cleaned", !b.url().includes("wish="), b.url());

// back in stock flag: pretend C was saved while sold out
const c = await fresh();
await c.goto(BASE + "/", { waitUntil: "networkidle0" });
await c.evaluate(id => localStorage.setItem("flickers-saved-v1", JSON.stringify({ [id]: { s: 0 } })), C.id);
await c.reload({ waitUntil: "networkidle0" }); await sleep(300);
check("a comic saved while sold out is flagged when it's back", (await c.$eval("#savedBtn", e => e.classList.contains("has-news"))) && (await c.$eval("#savedBtn", e => e.getAttribute("aria-label"))).includes("back in stock"));
await c.$eval("#savedBtn", x => x.click()); await sleep(300);
check("the list says Back in stock", (await c.$eval("#savedLines", e => e.textContent)).includes("Back in stock"));
await c.$eval("#saved [data-close]", x => x.click()); await sleep(300);
check("the flag clears after they've seen it", !(await c.$eval("#savedBtn", e => e.classList.contains("has-news"))));

// comic page + quick view
const d = await fresh(390, 844);
await d.goto(`${BASE}/comic/${A.id}/`, { waitUntil: "networkidle0" }); await sleep(300);
check("comic page has a Save for later control", !!(await d.$("[data-buy] .save-link")));
await d.$eval("[data-buy] .save-link", x => x.click()); await sleep(200);
check("and it saves", (await count(d)) === 1 && (await d.$eval("[data-buy] .save-link", x => x.getAttribute("aria-pressed"))) === "true");
await d.goto(BASE + "/", { waitUntil: "networkidle0" });
await d.$eval(`.card[data-id="${A.id}"] .cover-btn`, x => x.click()); await sleep(400);
check("quick view shows it as saved", (await d.$eval("#qv .save-link", x => x.getAttribute("aria-pressed"))) === "true");

// junk
const e = await fresh();
await e.goto(`${BASE}/?wish=constructor,__proto__,nope,${A.id}`, { waitUntil: "networkidle0" }); await sleep(300);
check("junk ids in a shared list are ignored", (await count(e)) === 1);
check("no script errors", errors.length === 0, errors.join(" | "));
await browser.close();
const bad = results.filter(x => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
