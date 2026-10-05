/* Screenshots of a customer's whole journey (not a pass/fail check): quick view, cart, checkout, confirmation, tracking, saved and request dialogs.
   Usage: node journey.mjs [light|dark] [width]   Pictures land in the flickers-qa folder in your temp directory. */
import { launch, OUT, BASE } from "./lib.mjs";
const scheme = process.argv[2] || "light", width = Number(process.argv[3]) || 390;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch({ args: ["--no-sandbox", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: width < 500 ? 2 : 1, isMobile: width < 500, hasTouch: width < 500 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
const shot = async name => { await sleep(350); await page.screenshot({ path: `${OUT}/journey-${scheme}-${width}-${name}.png` }); console.log("saved", name); };
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.$eval("#shop", e => e.scrollIntoView()); await shot("1-shelf");
await page.$eval(".card .cover-btn", b => b.click()); await shot("2-quick-view");
await page.$eval('[data-qv="add"]', b => b.click()); await sleep(300);
await page.$eval("#cartBtn", b => b.click()); await shot("3-cart");
await page.$eval("#checkoutBtn", b => b.click()); await shot("4-checkout");
await page.$eval("#payBtn", b => b.click()); await shot("5-checkout-errors");
await page.type("#f-name", "Jamie Reyes"); await page.type("#f-phone", "5550142");
await page.$eval("#f-date", el => { el.value = el.min; el.dispatchEvent(new Event("input", { bubbles: true })); });
await page.$eval("#payBtn", b => b.click()); await sleep(900); await shot("6-confirmation");
await page.$eval("[data-track-this]", b => b.click()); await sleep(900); await shot("7-tracking");
await page.keyboard.press("Escape");
await page.$eval(".card [data-save]", b => b.click()); await page.$eval("#savedBtn", b => b.click()); await shot("8-saved");
await page.keyboard.press("Escape");
await page.$eval("footer [data-want]", b => b.click()); await shot("9-request");
await browser.close();
