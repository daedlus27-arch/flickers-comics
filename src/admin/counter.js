/* Staff area: take an order for someone at the counter or on the phone. It becomes a normal order: stock comes off the shelf,
   the deal applies, Discord is told, and it counts in the sales report. Opened from the Orders tab. */
import { esc, money, fullTitle, searchItems, searchWords, dealDiscount, dealName, dealOn } from "../shared.mjs";
import { $, api, X, shopConfig, shopToday } from "./core.js";

const RESULTS_SHOWN = 8;

function dialogHTML(cfg) {
  const today = shopToday(cfg);
  return `<form id="ctForm" novalidate>
    <div class="co-head"><h2 class="dialog-title" id="ctTitle">Take an order</h2><button type="button" class="icon-btn on-dark" data-close aria-label="Close without saving">${X}</button></div>
    <div class="ct-grid">
      <div class="ct-pick">
        <div class="field"><label for="ct-q">Find a comic</label><input id="ct-q" type="search" autocomplete="off" placeholder="Title, issue number or publisher"><p class="hint">Press Enter to add the first result.</p></div>
        <ul class="ct-results" id="ctResults" aria-label="Matching comics"></ul>
      </div>
      <div class="ct-order">
        <h3 class="group-label" id="ctLinesHead">In this order</h3>
        <ul class="ct-lines" id="ctLines" aria-labelledby="ctLinesHead"></ul>
        <div class="ct-sums" id="ctSums" aria-live="polite"></div>
        <fieldset class="ct-how"><legend>How is it going out?</legend>
          <label class="check"><input type="radio" name="ct-method" value="handed" checked> Counter sale: handed over now</label>
          <label class="check"><input type="radio" name="ct-method" value="collect"> Collect later</label>
          <label class="check"><input type="radio" name="ct-method" value="post"> Post it</label>
        </fieldset>
        <div class="field" id="ct-dateWrap" hidden><label for="ct-date">Collection day</label><input id="ct-date" type="date" value="${esc(today)}" min="${esc(today)}"></div>
        <div class="field" id="ct-addrWrap" hidden><label for="ct-addr">Address to post to</label><textarea id="ct-addr" rows="2" placeholder="House or apartment number, street, area"></textarea></div>
        <div class="two">
          <div class="field"><label for="ct-name">Customer's name</label><input id="ct-name" autocomplete="off" placeholder="e.g. Jamie Reyes, or Walk-in"></div>
          <div class="field"><label for="ct-phone">Phone <span class="opt">(optional)</span></label><input id="ct-phone" inputmode="tel" autocomplete="off" placeholder="e.g. 5550142"></div>
        </div>
        <div class="field"><label for="ct-notes">Notes <span class="opt">(optional)</span></label><input id="ct-notes" autocomplete="off"></div>
        <label class="check"><input type="checkbox" id="ct-paid" checked> Paid</label>
      </div>
    </div>
    <div class="co-foot ed-foot"><p class="form-error" id="ctError" role="alert"></p><div class="ed-actions"><button type="button" class="btn btn-small" data-close>Cancel</button><button type="submit" class="btn btn-yellow btn-small" id="ctGo">Create order</button></div></div>
  </form>`;
}

/* stock: the comics to choose from (id, title, price, stock). onPlaced(result) runs once the Worker has created the order. */
export async function openCounter({ stock, onPlaced }) {
  const cfg = await shopConfig();
  let dlg = $("counterDlg");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "editor"; dlg.id = "counterDlg"; dlg.setAttribute("aria-labelledby", "ctTitle"); document.body.appendChild(dlg); }
  dlg.innerHTML = dialogHTML(cfg);
  const byId = new Map(stock.map(p => [p.id, p])), lines = new Map();
  const index = stock.map(p => ({ words: searchWords(p, []), blurb: "" }));
  const method = () => dlg.querySelector('input[name="ct-method"]:checked').value;

  const paintResults = () => {
    const q = $("ct-q").value.trim(), found = searchItems(index, q).flags;
    const hits = stock.filter((p, i) => found[i]).sort((a, b) => (b.stock > 0) - (a.stock > 0)).slice(0, RESULTS_SHOWN);
    $("ctResults").innerHTML = q && !hits.length ? `<li class="hint">Nothing matches that.</li>` : hits.map(p => {
      const left = p.stock - (lines.get(p.id) || 0);
      return `<li class="ct-result"><span><b>${esc(fullTitle(p))}</b><br><span class="hint">${money(p.price)} · ${p.stock <= 0 ? "sold out" : `${p.stock} in stock`}</span></span>
        <button type="button" class="btn btn-small" data-add="${esc(p.id)}"${left <= 0 ? " disabled" : ""} aria-label="Add ${esc(fullTitle(p))} to the order">Add</button></li>`;
    }).join("");
  };
  const totals = () => {
    const rows = [...lines].map(([id, qty]) => ({ price: byId.get(id).price, qty }));
    const sub = rows.reduce((s, r) => s + r.price * r.qty, 0), deal = dealDiscount(rows, cfg.deal).discount, post = method() === "post" ? Number(cfg.postage) || 0 : 0;
    return { sub, deal, post, total: sub - deal + post };
  };
  const paintLines = () => {
    $("ctLines").innerHTML = lines.size ? [...lines].map(([id, qty]) => {
      const p = byId.get(id), t = fullTitle(p);
      return `<li class="ct-line"><span class="ct-line-t">${esc(t)}</span>
        <span class="qty small" role="group" aria-label="Quantity of ${esc(t)}"><button type="button" data-dec="${esc(id)}" aria-label="One fewer ${esc(t)}">−</button><span class="qty-n">${qty}</span><button type="button" data-inc="${esc(id)}" aria-label="One more ${esc(t)}"${qty >= p.stock ? " disabled" : ""}>+</button></span>
        <span class="ct-line-p">${money(p.price * qty)}</span><button type="button" class="link-btn" data-remove="${esc(id)}" aria-label="Remove ${esc(t)}">Remove</button></li>`;
    }).join("") : `<li class="hint">Nothing yet. Search for a comic and press Add.</li>`;
    const t = totals();
    $("ctSums").innerHTML = `<div class="r-line"><span>Subtotal</span><span>${money(t.sub)}</span></div>`
      + (t.deal ? `<div class="r-line deal-line"><span>${esc(dealName(cfg.deal))}</span><span>−${money(t.deal)}</span></div>` : "")
      + (t.post ? `<div class="r-line"><span>Postage</span><span>${money(t.post)}</span></div>` : "")
      + `<div class="r-line r-total"><span>Total</span><strong>${money(t.total)}</strong></div>`
      + (dealOn(cfg.deal) && lines.size && dealDiscount([...lines].map(([id, qty]) => ({ price: byId.get(id).price, qty })), cfg.deal).toGo === 1 ? `<p class="deal-nudge">One more comic and the cheapest is free.</p>` : "");
    paintResults();
  };
  const add = id => { const p = byId.get(id); if (p && p.stock > (lines.get(id) || 0)) { lines.set(id, (lines.get(id) || 0) + 1); paintLines(); } };
  const sync = () => {
    $("ct-dateWrap").hidden = method() !== "collect"; $("ct-addrWrap").hidden = method() !== "post";
    $("ct-paid").checked = method() === "handed";
    paintLines();
  };

  dlg.onclick = ev => {
    if (ev.target === dlg || ev.target.closest("[data-close]")) { dlg.close(); return; }
    const t = ev.target.closest("[data-add],[data-inc],[data-dec],[data-remove]"); if (!t) return;
    const d = t.dataset;
    if (d.add) add(d.add);
    else if (d.inc) add(d.inc);
    else if (d.dec) { const n = (lines.get(d.dec) || 1) - 1; if (n <= 0) lines.delete(d.dec); else lines.set(d.dec, n); paintLines(); }
    else if (d.remove) { lines.delete(d.remove); paintLines(); }
  };
  $("ct-q").addEventListener("input", paintResults);
  $("ct-q").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); const first = $("ctResults").querySelector("[data-add]:not(:disabled)"); if (first) { add(first.dataset.add); $("ct-q").select(); } } });
  dlg.querySelectorAll('input[name="ct-method"]').forEach(r => r.addEventListener("change", sync));

  $("ctForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const err = $("ctError"); err.textContent = "";
    const name = $("ct-name").value.trim(), m = method();
    if (!lines.size) { err.textContent = "Add at least one comic."; $("ct-q").focus(); return; }
    if (name.length < 2) { err.textContent = "Enter the customer's name (or Walk-in)."; $("ct-name").focus(); return; }
    if (m === "post" && $("ct-addr").value.trim().length < 8) { err.textContent = "Enter the full address to post to."; $("ct-addr").focus(); return; }
    if (m === "collect" && !$("ct-date").value) { err.textContent = "Pick the collection day."; $("ct-date").focus(); return; }
    const btn = $("ctGo"); btn.disabled = true; btn.textContent = "Creating…";
    try {
      const r = await api("/staff/orders", { method: "POST", body: {
        name, phone: $("ct-phone").value.trim(), notes: $("ct-notes").value.trim(), paid: $("ct-paid").checked,
        method: m === "post" ? "post" : "collect", handedOver: m === "handed",
        ...(m === "collect" ? { collectDate: $("ct-date").value } : {}), ...(m === "post" ? { address: $("ct-addr").value.trim() } : {}),
        items: [...lines].map(([id, qty]) => ({ id, qty }))
      } });
      dlg.close();
      onPlaced(r);
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = "Create order"; }
  });
  paintLines();
  dlg.showModal();
  $("ct-q").focus();
}
