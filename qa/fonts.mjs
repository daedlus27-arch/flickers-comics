/* The self-hosted fonts load and every weight used on the pages is really drawn (not a browser's fake bold or a fallback face). */
import { launch } from "./lib.mjs";
const BASE = process.argv[2] || "http://localhost:8080";
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); };
const browser = await launch();
for (const path of ["/", "/comic/batman-14/", "/admin/"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const failed = [];
  page.on("requestfailed", r => { if (/\.woff2/.test(r.url())) failed.push(r.url()); });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() => [...document.fonts].map(f => `${f.family}|${f.weight}|${f.status}`));
  const loaded = faces.filter(f => f.endsWith("|loaded")).map(f => f.split("|")[0]);
  check(`${path}: Anton and Archivo are loaded`, loaded.includes("Anton") && loaded.includes("Archivo"), faces.join(", "));
  check(`${path}: no font file failed`, failed.length === 0, failed.join(", "));
  if (path !== "/admin/") {
    const weights = await page.evaluate(async () => {
      const probe = w => { const s = document.createElement("span"); s.textContent = "Hamburgefonstiv 0123"; s.style.cssText = `position:absolute;visibility:hidden;font:${w} 24px Archivo, monospace`; document.body.appendChild(s); const width = s.getBoundingClientRect().width; s.remove(); return width; };
      return [400, 500, 600, 700, 800].map(probe);
    });
    check(`${path}: each Archivo weight is a different drawing`, new Set(weights.map(w => w.toFixed(2))).size === 5, weights.map(w => w.toFixed(1)).join(", "));
  }
  await page.close();
}
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
