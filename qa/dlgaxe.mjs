import { launch, axePath } from "./lib.mjs";
import fs from "node:fs";
const BASE = "http://localhost:8080";
const axeSrc = fs.readFileSync(axePath, "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch();
let bad = 0;
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1100, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
  await page.evaluate(axeSrc);
  const run = async name => {
    const r = await page.evaluate(async () => { const res = await axe.run(document, { resultTypes: ["violations"] }); return res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ") + " :: " + (n.any[0] && n.any[0].message || n.failureSummary || "").slice(0, 160)) })); });
    console.log(`${scheme} ${name}: ${r.length ? JSON.stringify(r, null, 1) : "0 violations"}`); bad += r.length;
  };
  await page.type("#u", "owner"); await page.type("#pw", "owner-password-1");
  await page.click("#loginBtn"); await page.waitForSelector("#panel .arow"); await sleep(400);
  await page.$eval(".arow-edit", b => b.click()); await sleep(500);
  await run("item editor");
  await page.keyboard.press("Escape"); await sleep(300);
  await page.$$eval("[data-sel]", cbs => { cbs[0].click(); cbs[1].click(); }); await sleep(200);
  await run("bulk bar");
  for (const mode of ["price", "adjust", "stock", "delete"]) {
    await page.$eval(`[data-bulk="${mode}"]`, b => b.click()); await sleep(300);
    await run("bulk " + mode);
    await page.keyboard.press("Escape"); await sleep(300);
  }
  await page.$eval("#aAdd", b => b.click()); await sleep(400);
  await run("add item");
  await page.keyboard.press("Escape"); await sleep(200);
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
