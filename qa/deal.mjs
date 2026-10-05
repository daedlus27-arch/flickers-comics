/* Buy two, get one free: the nudge, the cart, checkout, the confirmation, and the order the shop receives. */
import { launch, BASE } from "./lib.mjs";
import { dealDiscount } from "../src/shared.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };
const shop = await (await fetch(BASE + "/data/shop.json")).json();
const deal = shop.config.deal, byId = Object.fromEntries(shop.products.map(p => [p.id, p]));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "networkidle0" });
check("the deal is announced in the strip and the hero", /Buy 2, get 1 free/.test(await page.$eval(".topstrip", e => e.textContent)) && /Buy 2, get 1 free/.test(await page.$eval(".hero-facts", e => e.textContent)));

const ids = await page.$$eval(".card:not([hidden])", c => c.map(x => x.dataset.id));
const picks = ids.filter(id => byId[id].stock > 1).slice(0, 3);
const add = async id => { await page.$eval(`.card[data-id="${id}"] .add`, b => b.click()); await sleep(250); };
const money = n => "$" + n.toLocaleString("en-US");
const drawer = async () => { await page.$eval("#cartBtn", b => b.click()); await sleep(300); };

await add(picks[0]); await add(picks[1]);
await drawer();
check("two comics: no deal line yet", await page.$eval("#drawerDealLine", e => e.hidden));
check("a nudge says one more earns a free comic", /Add 1 more comic and the cheapest one is free/.test(await page.$eval("#drawerNudge", e => e.textContent)));
await page.keyboard.press("Escape");

await add(picks[2]);
await drawer();
const expected = dealDiscount(picks.map(id => ({ price: byId[id].price, qty: 1 })), deal).discount;
const sub = picks.reduce((s, id) => s + byId[id].price, 0);
check("three comics: the deal line takes off the cheapest", (await page.$eval("#drawerDeal", e => e.textContent)) === "−" + money(expected) && expected === Math.min(...picks.map(id => byId[id].price)), `${expected}`);
check("the nudge now points at the next free one", /Add 3 more/.test(await page.$eval("#drawerNudge", e => e.textContent)));
check("the cart button shows the price after the deal", (await page.$eval("#cartTotal", e => e.textContent)) === money(sub - expected), await page.$eval("#cartTotal", e => e.textContent));

await page.$eval("#checkoutBtn", b => b.click()); await sleep(300);
check("checkout summary shows the deal", (await page.$eval("#sumDeal", e => e.textContent)) === "−" + money(expected) && !(await page.$eval("#sumDealLine", e => e.hidden)));
check("checkout total is after the deal", (await page.$eval("#sumTotal", e => e.textContent)) === money(sub - expected));
await page.type("#f-name", "Deal Tester"); await page.type("#f-phone", "5550177");
await page.$eval("#f-date", el => { el.value = el.min; el.dispatchEvent(new Event("input", { bubbles: true })); });
await page.$eval("#payBtn", b => b.click()); await sleep(1200);
const done = await page.$eval("#coDoneView", e => e.textContent);
check("the confirmation lists the deal and the real total", done.includes("Buy 2, get 1 free") && done.includes(money(sub - expected)), done.replace(/\s+/g, " ").slice(0, 160));
check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
