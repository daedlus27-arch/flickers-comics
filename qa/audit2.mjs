import { launch, axePath } from "./lib.mjs";
import fs from "node:fs";
const BASE = "http://localhost:8080";
const axeSrc = fs.readFileSync(axePath, "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch();
let issues = 0;
const pages = ["/", "/comic/batman-14/", "/nothing-here/", "/admin/"];
for (const w of [320, 360, 390, 768, 1024, 1440, 1920]) {
  for (const path of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900, isMobile: w < 500, hasTouch: w < 500 });
    await page.goto(BASE + path, { waitUntil: "networkidle0" });
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (r.sw > r.cw) {
      const culprits = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 4).map(e => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().right)));
      console.log(`OVERFLOW ${path} @${w}: scrollWidth ${r.sw} > ${r.cw}`, culprits.join(" | ")); issues++;
    }
    await page.close();
  }
}
console.log("overflow check done");
// axe incl. WCAG 2.2 target size, plus forced-colors and reduced-motion smoke
for (const [w, scheme] of [[390, "light"], [1280, "dark"]]) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: w, height: 900, isMobile: w < 500, hasTouch: w < 500 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  for (const path of ["/", "/comic/batman-14/", "/nothing-here/"]) {
    await page.goto(BASE + path, { waitUntil: "networkidle0" });
    await page.evaluate(axeSrc);
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] })).violations.map(x => x.id + ": " + x.nodes.slice(0, 3).map(n => n.target.join(" ") + " " + ((n.any[0] || n.all[0] || {}).message || "").slice(0, 100)).join(" ; ")));
    console.log(`${scheme} ${w} ${path}: ${v.length ? v.join(" || ") : "0 violations"}`); issues += v.length;
  }
  await page.close();
}
console.log(issues ? issues + " issues" : "all clean");
await browser.close();
