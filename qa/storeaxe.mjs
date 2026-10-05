import { launch, axePath } from "./lib.mjs";
import fs from "node:fs";
const BASE = "http://localhost:8080";
const axeSrc = fs.readFileSync(axePath, "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch();
let bad = 0;
for (const [scheme, w, h] of [["light", 1280, 900], ["dark", 1280, 900], ["light", 390, 844], ["dark", 390, 844]]) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
  const run = async name => {
    const r = await page.evaluate(async () => { const res = await axe.run(document, { resultTypes: ["violations"] }); return res.violations.map(v => ({ id: v.id, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ") + " :: " + (n.any[0] && n.any[0].message || "").slice(0, 150)) })); });
    console.log(`${scheme} ${w} ${name}: ${r.length ? JSON.stringify(r, null, 1) : "0"}`); bad += r.length;
  };
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(axeSrc);
  await run("home");
  await page.goto(BASE + "/?shelf=Marvel%20Comics&q=a&sort=price-desc", { waitUntil: "networkidle0" });
  await page.evaluate(axeSrc);
  await run("home filtered");
  await page.$$eval(".add", b => { b[0].click(); b[1].click(); }); await sleep(300);
  await page.$eval("#cartBtn", b => b.click()); await sleep(400);
  await run("cart drawer");
  await page.$eval("#checkoutBtn", b => b.click()); await sleep(400);
  await run("checkout");
  await page.$eval("#payBtn", b => b.click()); await sleep(300);
  await run("checkout with errors");
  await page.goto(BASE + "/comic/batman-14/", { waitUntil: "networkidle0" });
  await page.evaluate(axeSrc);
  await run("comic page");
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} violation(s)` : "all clean");
process.exit(bad ? 1 : 0);
