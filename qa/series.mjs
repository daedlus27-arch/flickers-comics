/* Series pages: every issue of a title in one place, reachable from the menu and from each issue. */
import { launch, BASE } from "./lib.mjs";
import { seriesKey } from "../src/shared.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };
const shop = await (await fetch(BASE + "/data/shop.json")).json();
const groups = new Map();
shop.products.forEach(p => groups.set(seriesKey(p), [...(groups.get(seriesKey(p)) || []), p]));
const multi = [...groups.values()].filter(g => g.length > 1);
const target = multi.find(g => g.some(p => p.stock > 0)) || multi[0];
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const errors = []; page.on("pageerror", e => errors.push(e.message));

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
check("the menu has a Series link", await page.$eval(".nav", n => [...n.querySelectorAll("a")].some(a => a.textContent === "Series")));
await page.$eval('.nav a[href$="series/"]', a => a.click()); await page.waitForSelector("h1");
check("the series list shows every multi-issue title", (await page.$$eval(".grid .card", c => c.length)) === multi.length, String(multi.length));

await page.goto(BASE + `/comic/${target[0].id}/`, { waitUntil: "networkidle0" });
check("an issue says it belongs to a series and links to it", /See the whole series/.test(await page.$eval(".series-link", e => e.textContent)));
await page.$eval(".series-link a", a => a.click()); await page.waitForSelector(".series-head");
check("the series page names the title", (await page.$eval("h1", h => h.textContent)) === target[0].title);
const ids = await page.$$eval(".grid .card", c => c.map(x => x.dataset.id));
check("it lists every issue", target.every(p => ids.includes(p.id)) && ids.length === target.length, ids.join(","));
check("issues are in number order", ids.join() === [...target].sort((a, b) => (parseFloat(String(a.num).replace(/\D/g, "")) || 1e9) - (parseFloat(String(b.num).replace(/\D/g, "")) || 1e9)).map(p => p.id).join());
const buyable = target.find(p => p.stock > 0);
await page.$eval(`.card[data-id="${buyable.id}"] .add`, b => b.click()); await sleep(300);
check("Add works on the series page", (await page.$eval("#cartCount", e => e.textContent)) === "1");
check("Follow this series is offered", await page.$eval('[data-want="series"]', b => !b.hidden));
await page.$eval('[data-want="series"]', b => b.click()); await sleep(300);
check("it opens the follow dialog for the series", /Follow/.test(await page.$eval("#wantTitle", e => e.textContent)));
await page.keyboard.press("Escape");

const single = shop.products.find(p => groups.get(seriesKey(p)).length === 1);
await page.goto(BASE + `/comic/${single.id}/`, { waitUntil: "networkidle0" });
check("a single-issue comic has no series link", (await page.$(".series-link")) === null);
check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
