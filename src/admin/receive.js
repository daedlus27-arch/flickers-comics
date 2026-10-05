/* Staff area: receiving a shipment. Search and tap, or paste a list (or a spreadsheet's rows) of what arrived; matched comics get their
   copies added to the stock list as ordinary unpublished changes. Opened from the Stock tab. */
import { esc, fullTitle, searchItems, searchWords, parseReceiving, matchComic } from "../shared.mjs";
import { $, X } from "./core.js";

const RESULTS_SHOWN = 6;

function dialogHTML() {
  return `<form id="rvForm" novalidate>
    <div class="co-head"><h2 class="dialog-title" id="rvTitle">Receive a shipment</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close without adding anything">${X}</button></div>
    <div class="rv-grid">
      <div class="rv-in">
        <div class="field"><label for="rv-q">Find a comic that arrived</label><input id="rv-q" type="search" autocomplete="off" placeholder="Title, issue number or publisher"><p class="hint">Press Enter to add one copy of the first result.</p></div>
        <ul class="ct-results" id="rvResults" aria-label="Matching comics"></ul>
        <div class="field"><label for="rv-paste">Or paste a list</label>
          <textarea id="rv-paste" rows="6" placeholder="Batman #14, 5&#10;Flash #2 x3&#10;5 x Saga #1&#10;Superman #7"></textarea>
          <p class="hint">One comic per line with the number that arrived (no number means one). Rows copied from a spreadsheet work too.</p>
        </div>
        <div class="rv-paste-btns"><button type="button" class="btn btn-small" id="rvAddList">Add these to the list</button><label class="btn btn-small file-btn">Read a file<input type="file" accept=".csv,.tsv,.txt,text/*" id="rvFile" class="sr-only"></label></div>
      </div>
      <div class="rv-list">
        <h3 class="group-label" id="rvListHead">Arriving</h3>
        <div id="rvUnmatched"></div>
        <ul class="ct-lines" id="rvLines" aria-labelledby="rvListHead"></ul>
        <p class="hint" id="rvSummary" aria-live="polite"></p>
        <label class="check"><input type="checkbox" id="rv-new"> Mark these as New</label>
      </div>
    </div>
    <div class="co-foot ed-foot"><p class="form-error" id="rvError" role="alert"></p><div class="ed-actions"><button type="button" class="btn btn-small" data-close>Cancel</button><button type="submit" class="btn btn-yellow btn-small" id="rvGo" disabled>Add to stock</button></div></div>
  </form>`;
}

/* products: the stock list being edited (read only here). onApply({ lines: [[id, copies]], markNew }) makes the changes. */
export function openReceive({ products, onApply }) {
  let dlg = $("recvDlg");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "editor"; dlg.id = "recvDlg"; dlg.setAttribute("aria-labelledby", "rvTitle"); document.body.appendChild(dlg); }
  dlg.innerHTML = dialogHTML();
  const byId = new Map(products.map(p => [p.id, p])), lines = new Map(), unmatched = [];
  const index = products.map(p => ({ words: searchWords(p, []), blurb: "" }));
  const copies = () => [...lines.values()].reduce((a, b) => a + b, 0);

  const paintResults = () => {
    const q = $("rv-q").value.trim(), found = searchItems(index, q).flags;
    const hits = q ? products.filter((p, i) => found[i]).slice(0, RESULTS_SHOWN) : [];
    $("rvResults").innerHTML = q && !hits.length ? `<li class="hint">Nothing matches that. If it's new, add it from the Stock tab first.</li>` : hits.map(p =>
      `<li class="ct-result"><span><b>${esc(fullTitle(p))}</b><br><span class="hint">${p.stock} in stock now</span></span>
        <span class="rv-add"><button type="button" class="btn btn-small" data-add="${esc(p.id)}" data-n="1" aria-label="Add one copy of ${esc(fullTitle(p))}">+1</button><button type="button" class="btn btn-small" data-add="${esc(p.id)}" data-n="5" aria-label="Add five copies of ${esc(fullTitle(p))}">+5</button></span></li>`).join("");
  };
  const paint = () => {
    $("rvLines").innerHTML = lines.size ? [...lines].map(([id, qty]) => {
      const p = byId.get(id), t = fullTitle(p);
      return `<li class="ct-line"><span class="ct-line-t">${esc(t)}<br><span class="hint">${p.stock} now → <b>${p.stock + qty}</b></span></span>
        <span class="qty small" role="group" aria-label="Copies of ${esc(t)}"><button type="button" data-dec="${esc(id)}" aria-label="One fewer ${esc(t)}">−</button><span class="qty-n">${qty}</span><button type="button" data-inc="${esc(id)}" aria-label="One more ${esc(t)}">+</button></span>
        <button type="button" class="link-btn" data-remove="${esc(id)}" aria-label="Remove ${esc(t)}">Remove</button></li>`;
    }).join("") : `<li class="hint">Nothing yet. Search for a comic or paste a list.</li>`;
    $("rvUnmatched").innerHTML = unmatched.length ? `<div class="rv-unmatched" role="group" aria-label="Lines to check">${unmatched.map((u, i) => u.candidates.length
      ? `<p class="rv-um"><b>“${esc(u.text)}”</b> × ${u.qty}: which one? <select data-pick="${i}" aria-label="Which comic is “${esc(u.text)}”?">${u.candidates.map(p => `<option value="${esc(p.id)}">${esc(fullTitle(p))}</option>`).join("")}</select> <button type="button" class="btn btn-small" data-use="${i}">Use it</button> <button type="button" class="link-btn" data-skip="${i}">Skip</button></p>`
      : `<p class="rv-um"><b>“${esc(u.text)}”</b> × ${u.qty}: no match. Add it from the Stock tab first. <button type="button" class="link-btn" data-skip="${i}">Dismiss</button></p>`).join("")}</div>` : "";
    $("rvSummary").textContent = lines.size ? `${copies()} cop${copies() === 1 ? "y" : "ies"} across ${lines.size} comic${lines.size === 1 ? "" : "s"}.` : "";
    $("rvGo").disabled = !lines.size;
    paintResults();
  };
  const add = (id, n = 1) => { lines.set(id, Math.min(999, (lines.get(id) || 0) + n)); paint(); };
  const readList = text => {
    const rows = parseReceiving(text);
    rows.forEach(r => {
      const m = matchComic(products, r.text);
      if (m.product) lines.set(m.product.id, Math.min(999, (lines.get(m.product.id) || 0) + r.qty));
      else unmatched.push({ text: r.text, qty: r.qty, candidates: m.candidates });
    });
    paint();
    $("rvError").textContent = rows.length ? "" : "I couldn't find any lines in that. Write one comic per line, like “Batman #14, 5”.";
    return rows.length;
  };

  dlg.onclick = ev => {
    if (ev.target === dlg || ev.target.closest("[data-close]")) { dlg.close(); return; }
    const t = ev.target.closest("[data-add],[data-inc],[data-dec],[data-remove],[data-use],[data-skip]"); if (!t) return;
    const d = t.dataset;
    if (d.add) add(d.add, Number(d.n) || 1);
    else if (d.inc) add(d.inc);
    else if (d.dec) { const n = (lines.get(d.dec) || 1) - 1; if (n <= 0) lines.delete(d.dec); else lines.set(d.dec, n); paint(); }
    else if (d.remove) { lines.delete(d.remove); paint(); }
    else if (d.use !== undefined) { const u = unmatched[Number(d.use)], pick = dlg.querySelector(`[data-pick="${d.use}"]`).value; unmatched.splice(Number(d.use), 1); add(pick, u.qty); }
    else if (d.skip !== undefined) { unmatched.splice(Number(d.skip), 1); paint(); }
  };
  $("rv-q").addEventListener("input", paintResults);
  $("rv-q").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); const first = $("rvResults").querySelector("[data-add]"); if (first) { add(first.dataset.add, 1); $("rv-q").select(); } } });
  $("rvAddList").addEventListener("click", () => { if (readList($("rv-paste").value)) $("rv-paste").value = ""; });
  $("rvFile").addEventListener("change", async () => {
    const file = $("rvFile").files[0]; if (!file) return;
    if (file.size > 500 * 1024) { $("rvError").textContent = "That file is too big. Use a plain text or CSV list."; return; }
    readList(await file.text()); $("rvFile").value = "";
  });
  $("rvForm").addEventListener("submit", ev => {
    ev.preventDefault();
    if (!lines.size) return;
    if (unmatched.length && !confirm(`${unmatched.length} line${unmatched.length === 1 ? "" : "s"} still can't be matched and will be left out. Add the rest?`)) return;
    const result = { lines: [...lines], markNew: $("rv-new").checked };
    dlg.close();
    onApply(result);
  });
  paint();
  dlg.showModal();
  $("rv-q").focus();
}
