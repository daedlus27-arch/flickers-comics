import { launch, OUT, BASE as SHOP } from "./lib.mjs";
import fs from "node:fs";
const BASE = "http://localhost:8080";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : "")); };
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto(BASE + "/admin/", { waitUntil: "networkidle0" });
await page.type("#u", "owner"); await page.type("#pw", "owner-password-1");
await page.click("#loginBtn"); await page.waitForSelector("#panel .arow", { timeout: 8000 });


// the stock list points out items that have no cover picture
{
  const shop = await (await fetch(SHOP + "/data/shop.json")).json(), missing = shop.products.filter(p => !p.image).length;
  await page.select("#aFilter", "nocover"); await sleep(150);
  const rows = await page.$$eval(".arow", r => r.map(x => /No cover/.test(x.querySelector(".arow-pills").textContent)));
  check("'No cover picture' lists exactly the items without a cover", rows.length === missing && rows.every(Boolean), rows.length + " vs " + missing);
  await page.select("#aFilter", "all"); await sleep(150);
}

await page.evaluate(() => {
  window.mk = kind => new Promise(res => {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 1800; const g = c.getContext("2d");
    g.fillStyle = "#c0392b"; g.fillRect(0, 0, 1200, 1800); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText("TEST COVER", 100, 900);
    const dt = new DataTransfer();
    if (kind === "txt") { dt.items.add(new File(["hello"], "a.txt", { type: "text/plain" })); res(dt); return; }
    c.toBlob(b => { dt.items.add(new File([b], "cover.png", { type: "image/png" })); res(dt); }, "image/png");
  });
});

await page.$eval("[data-edit]", b => b.click()); await page.waitForSelector("#editDlg[open]");
const before = await page.$eval("#edPreview", e => e.innerHTML);
await page.evaluate(async () => {
  const dt = await window.mk("png"); const dlg = document.getElementById("editDlg");
  dlg.querySelector("#edDrop").dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  window.__over = document.getElementById("edDrop").classList.contains("is-over");
  dlg.querySelector("#edDrop").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForFunction(() => /Cover added/.test(document.getElementById("edCoverMsg").textContent), { timeout: 5000 });
check("dragover highlights the cover", await page.evaluate(() => window.__over));
check("highlight cleared after drop", await page.$eval("#edDrop", e => !e.classList.contains("is-over")));
const after = await page.$eval("#edPreview", e => e.innerHTML);
check("preview now shows the dropped image", /<img src="data:image\/jpeg/.test(after) && after !== before);
const dim = await page.$eval("#edPreview img", i => new Promise(r => { const t = new Image(); t.onload = () => r([t.naturalWidth, t.naturalHeight]); t.src = i.src; }));
check("image resized to 600x900", dim[0] === 600 && dim[1] === 900, dim.join("x"));
check("Remove button appears", await page.$eval("#edRemoveImg", b => !b.hidden));

await page.$eval("#edRemoveImg", b => b.click());
check("remove clears the cover", await page.$eval("#edRemoveImg", b => b.hidden));
await page.focus("#ed-blurb");
const pasted = await page.evaluate(async () => {
  const dt = await window.mk("png"); const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
  document.getElementById("ed-blurb").dispatchEvent(ev); return ev.defaultPrevented;
});
await page.waitForFunction(() => /Cover added/.test(document.getElementById("edCoverMsg").textContent), { timeout: 5000 });
check("image paste handled", pasted);
const textPaste = await page.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", "words"); const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }); document.getElementById("ed-blurb").dispatchEvent(ev); return ev.defaultPrevented; });
check("text paste is left alone", textPaste === false);
await page.evaluate(async () => { const dt = await window.mk("txt"); document.getElementById("editDlg").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); });
check("non-image file gets a friendly message", /isn.t an image/.test(await page.$eval("#edCoverMsg", e => e.textContent)));
await page.$eval("#edPaste", b => b.click()); await sleep(400);
const pm = await page.$eval("#edCoverMsg", e => e.textContent);
check("Paste button explains itself when it can't read the clipboard", /Ctrl\+V|no image/.test(pm), pm);
await page.evaluate(async () => { const dt = await window.mk("png"); document.getElementById("ed-blurb").dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })); });
await page.waitForFunction(() => /Cover added/.test(document.getElementById("edCoverMsg").textContent));
await page.$eval("#edForm button[type=submit]", b => b.click()); await sleep(300);
check("editor saved", await page.$eval("#editDlg", d => !d.open));
check("row thumbnail shows the new cover", await page.$eval(".arow .arow-thumb", t => !!t.querySelector('img[src^="data:image/jpeg"]')));
check("row flagged as edited", await page.$eval(".arow .arow-pills", t => /Edited/.test(t.textContent)));

const row2 = await page.$$eval(".arow", rs => rs[1].dataset.row);
await page.evaluate(async id => {
  const dt = await window.mk("png"); const row = document.querySelector(`[data-row="${id}"]`);
  row.querySelector(".arow-title").dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  window.__rowOver = row.classList.contains("is-over");
  row.querySelector(".arow-title").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
}, row2);
await page.waitForFunction(id => document.querySelector(`[data-row="${id}"] .arow-thumb img[src^="data:"]`), { timeout: 5000 }, row2);
check("row highlights on dragover", await page.evaluate(() => window.__rowOver));
check("dropping on a row sets its cover", true);
const ch = await page.$eval("#aChanges", e => e.textContent);
check("2 unpublished changes", /2 unpublished/.test(ch), ch);

const stayed = await page.evaluate(async () => { const dt = await window.mk("png"); const ev = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }); document.getElementById("aMsg").dispatchEvent(ev); return ev.defaultPrevented; });
check("stray drops don't open the file", stayed);

await page.click("#aPublish"); await page.waitForFunction(() => /ublished/i.test(document.getElementById("aMsg").textContent) && !/Click/.test(document.getElementById("aMsg").textContent), { timeout: 15000 });
const msg = await page.$eval("#aMsg", e => e.textContent); check("published", true, msg.slice(0, 90));
const log = fs.readFileSync(OUT + "/dev.log", "utf8");
check("server committed", /commit:/.test(log), log.split("\n").filter(l => /commit:/.test(l)).slice(-1)[0]);
await page.screenshot({ path: OUT + "/covers-after.png" });
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(results.every(Boolean) ? "ALL PASS" : "SOME FAILED");
await browser.close();
