/* Flickers Comics storefront.
   The shelves and comic pages are rendered at build time (see build/). This script adds the cart,
   quick view, checkout, search and filters on top. Stock and prices come from data/shop.json. */
import { esc, escLines, money, GRADES, catOf, fullTitle, stockWord, hLabel, hoursText, hoursShort, DAYS, coverHTML } from "./shared.js";

const root = document.body.dataset.root || "";
const $ = id => document.getElementById(id);
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const focusFirst = (rootEl, ...sels) => { for (const s of sels) { const el = rootEl.querySelector(s); if (el) { el.focus(); return; } } };
const firstName = s => String(s).trim().split(/\s+/)[0] || "";
const comicUrl = id => `${root}comic/${id}/`;

let CONFIG, CATEGORIES, PRODUCTS = [], byId = {};
const cover = (p, opts) => coverHTML(p, { imgBase: root, ...opts });
const statusReady = fetch(`${root}data/shop.json?v=${document.body.dataset.build || ""}`).then(r => { if (!r.ok) throw new Error("shop.json " + r.status); return r.json(); });

/* ===================== hours ===================== */
function shopNow() {
  const d = new Date();
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: CONFIG.timeZone, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23"
    }).formatToParts(d).map(x => [x.type, x.value]));
    return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour % 24, wd: parts.weekday };
  } catch (e) {
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), wd: DAYS[(d.getDay() + 6) % 7] };
  }
}
const ymdAdd = (o, n) => { const t = new Date(Date.UTC(o.y, o.m - 1, o.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const isoDate = o => `${o.y}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
function fmtDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function hoursStatus() {
  const n = shopNow();
  if (n.h >= CONFIG.openHour && n.h < CONFIG.closeHour) return { open: true, text: `Open now · closes at ${hLabel(CONFIG.closeHour)}` };
  if (n.h < CONFIG.openHour) return { open: false, text: `Closed · opens today at ${hLabel(CONFIG.openHour)}` };
  return { open: false, text: `Closed · opens tomorrow at ${hLabel(CONFIG.openHour)}` };
}
function renderHours() {
  const st = hoursStatus();
  $("stripStatus").classList.toggle("is-open", st.open);
  $("stripStatusText").textContent = st.text;
  const pill = $("hoursStatus");
  if (pill) { pill.classList.toggle("is-open", st.open); $("hoursStatusText").textContent = st.text; }
  const week = $("week");
  if (week) {
    const today = shopNow().wd;
    week.innerHTML = DAYS.map(d => `<li class="day${d === today ? " is-today" : ""}"><b>${d}</b><span>${hoursShort(CONFIG)}</span>${d === today ? `<em class="sr-only">today</em>` : ""}</li>`).join("");
  }
}

/* ===================== cart state ===================== */
const CART_KEY = "flickers-cart-v1";
let cart = {};
const sanitizeCart = raw => {
  const out = {};
  if (raw && typeof raw === "object") for (const [id, q] of Object.entries(raw)) {
    const p = byId[id], n = Math.floor(Number(q));
    if (p && p.stock > 0 && n > 0) out[id] = Math.min(n, p.stock);
  }
  return out;
};
const saveCart = () => store.set(CART_KEY, cart);
const cartQty = id => cart[id] || 0;
const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
const cartSubtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + byId[id].price * q, 0);
function addToCart(id, n = 1) {
  const p = byId[id];
  if (!p || p.stock <= 0) return false;
  const next = Math.min(p.stock, cartQty(id) + n);
  if (next === cartQty(id)) return false;
  cart[id] = next; saveCart(); renderCartUI();
  return true;
}
function setQty(id, n) {
  const p = byId[id]; if (!p) return;
  n = Math.max(0, Math.min(p.stock, n));
  if (n === 0) delete cart[id]; else cart[id] = n;
  saveCart(); renderCartUI();
}

/* ===================== shelves ===================== */
const grid = $("grid");
const filters = { group: "all", q: "", sort: "featured" };

function applyFilters() {
  if (!grid) return;
  const cards = [...grid.querySelectorAll(".card")];
  const q = filters.q.trim().toLowerCase();
  const num = c => Number(c.dataset.index), price = c => Number(c.dataset.price);
  const sorters = {
    featured: (a, b) => ((Number(b.dataset.stock) > 0) - (Number(a.dataset.stock) > 0)) || num(a) - num(b),
    "price-asc": (a, b) => price(a) - price(b) || num(a) - num(b),
    "price-desc": (a, b) => price(b) - price(a) || num(a) - num(b),
    title: (a, b) => a.dataset.title.localeCompare(b.dataset.title) || num(a) - num(b)
  };
  cards.sort(sorters[filters.sort] || sorters.featured);
  let shown = 0;
  cards.forEach(c => {
    const ok = (filters.group === "all" || c.dataset.group === filters.group) && (!q || c.dataset.q.includes(q));
    c.hidden = !ok;
    if (ok) shown++;
    grid.appendChild(c);
  });
  $("empty").hidden = shown > 0;
  const tab = filters.group === "all" ? null : document.querySelector(`.divider[data-group="${CSS.escape(filters.group)}"]`);
  const label = filters.group === "all" ? "" : ` in ${tab && tab.firstChild ? tab.firstChild.textContent : filters.group}`;
  $("results").textContent = shown ? `${shown} ${shown === 1 ? "item" : "items"}${label}${q ? ` matching “${filters.q.trim()}”` : ""}` : "";
}
function setGroup(g) {
  filters.group = g;
  document.querySelectorAll(".divider").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.group === g)));
  applyFilters();
}

function stockHTML(p) {
  const parts = [], n = cartQty(p.id);
  if (p.stock <= 0) parts.push(`<span class="low">Sold out</span>`);
  else if (p.stock <= 2) parts.push(`<span class="low">Only ${p.stock} left</span>`);
  if (n) parts.push(`<span class="incart">${n} in your cart</span>`);
  return parts.join(" · ");
}
function addState(p) {
  if (p.stock <= 0) return { off: true, label: "Sold out" };
  if (cartQty(p.id) >= p.stock) return { off: true, label: "All in cart" };
  return { off: false, label: "Add" };
}
function refreshCards() {
  document.querySelectorAll(".card").forEach(card => {
    const p = byId[card.dataset.id]; if (!p) return;
    const btn = card.querySelector(".add"), st = addState(p), t = fullTitle(p);
    card.querySelector(".stock").innerHTML = stockHTML(p);
    btn.setAttribute("aria-disabled", String(st.off));
    btn.setAttribute("aria-label", (st.off ? st.label + ": " : "Add to cart: ") + t);
    if (!btn.classList.contains("added")) btn.textContent = st.label;
  });
}

/* ===================== buy box (quick view and comic page) ===================== */
const qv = $("qv");
let qvState = { id: null, qty: 1 };
const pageBuyEl = document.querySelector("[data-buy]");
let pageState = pageBuyEl ? { id: pageBuyEl.dataset.buy, qty: 1 } : null;
const buyMax = p => Math.max(0, p.stock - cartQty(p.id));

function buyHTML(p, st) {
  const max = buyMax(p);
  st.qty = Math.min(Math.max(1, st.qty), Math.max(1, max));
  if (p.stock <= 0) return `<p class="qv-limit">This one is sold out.</p>`;
  if (max <= 0) return `<p class="qv-limit">Every copy we have is already in your cart.</p><button type="button" class="btn" data-qv="cart">View cart</button>`;
  return `<div class="qty" role="group" aria-label="Quantity">
      <button type="button" data-qv="dec" aria-label="One fewer" ${st.qty <= 1 ? "disabled" : ""}>−</button>
      <span class="qty-n" aria-live="polite">${st.qty}</span>
      <button type="button" data-qv="inc" aria-label="One more" ${st.qty >= max ? "disabled" : ""}>+</button>
    </div>
    <button type="button" class="btn btn-yellow" data-qv="add">Add to cart · ${money(p.price * st.qty)}</button>`;
}
function renderPageBuy() { if (pageBuyEl && byId[pageState.id]) pageBuyEl.innerHTML = buyHTML(byId[pageState.id], pageState); }

function renderQV() {
  const p = byId[qvState.id]; if (!p) return;
  const rows = [["Format", catOf(CATEGORIES, p.cat).one]];
  if (p.publisher) rows.push(["Publisher", p.publisher]);
  if (p.grade) { const code = p.grade.split(" ")[0]; rows.push(["Condition", `${p.grade} (${GRADES[code] || code})`]); }
  if (p.variant) rows.push([p.cat === "funko" ? "Finish" : "Edition", p.variant]);
  if (p.collects) rows.push(["Contents", p.collects]);
  if (p.pages) rows.push(["Pages", p.pages.toLocaleString("en-US")]);
  if (p.cat === "funko") rows.push(["Figure", p.num]);
  rows.push(["Stock", stockWord(p)]);
  const sticker = (p.stock > 0 && (p.badges || []).includes("new")) ? `<span class="sticker sticker-new" aria-hidden="true">New!</span>` : "";
  $("qvBody").innerHTML = `<div class="qv-in">
    <button type="button" class="icon-btn qv-close" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="qv-cover">${cover(p, { lazy: false, sizes: "220px" })}${sticker}</div>
    <div class="qv-info">
      <p class="eyebrow">${esc(catOf(CATEGORIES, p.cat).one)}</p>
      <h2 class="qv-title" id="qvTitle">${esc(fullTitle(p))}</h2>
      <p class="qv-price">${money(p.price)}</p>
      ${p.blurb ? `<p class="qv-blurb">${esc(p.blurb)}</p>` : ""}
      ${p.staff ? `<p class="qv-talker">“${esc(p.staff)}”<small>Staff pick</small></p>` : ""}
      <dl class="specs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <div class="qv-buy">${buyHTML(p, qvState)}</div>
      <p class="hint"><a href="${comicUrl(p.id)}">Open the full page</a></p>
    </div>
  </div>`;
}
function openQuickView(id) {
  qvState = { id, qty: 1 };
  renderQV();
  if (!qv.open) qv.showModal();
  (qv.querySelector('[data-qv="add"]') || qv.querySelector("[data-close]"))?.focus();
}

/* ===================== cart drawer ===================== */
const drawer = $("drawer");
function renderLines() {
  const entries = Object.entries(cart);
  $("cartEmpty").hidden = entries.length > 0;
  $("drawerFoot").hidden = entries.length === 0;
  $("drawerSub").textContent = money(cartSubtotal());
  $("lines").innerHTML = entries.map(([id, q]) => {
    const p = byId[id], t = fullTitle(p);
    return `<li class="line">
      <div class="line-thumb">${cover(p, { lazy: false, sizes: "54px" })}</div>
      <div>
        <p class="line-title">${esc(t)}</p>
        <p class="line-meta">${money(p.price)} each</p>
        <div class="qty small" role="group" aria-label="Quantity of ${esc(t)}">
          <button type="button" data-dec="${id}" aria-label="One fewer ${esc(t)}">−</button>
          <span class="qty-n">${q}</span>
          <button type="button" data-inc="${id}" aria-label="One more ${esc(t)}" ${q >= p.stock ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div class="line-right"><span class="line-price">${money(p.price * q)}</span><button type="button" class="link-btn" data-remove="${id}" aria-label="Remove ${esc(t)}">Remove</button></div>
    </li>`;
  }).join("");
}
function renderCartUI() {
  const n = cartCount(), sub = cartSubtotal();
  $("cartCount").textContent = n;
  $("cartTotal").textContent = money(sub);
  $("cartBtn").setAttribute("aria-label", `Cart: ${n} ${n === 1 ? "item" : "items"}, ${money(sub)}`);
  $("checkoutBtn").disabled = n === 0;
  if (drawer.open) {
    const a = document.activeElement, key = a && ["inc", "dec", "remove"].find(k => a.dataset && a.dataset[k]);
    const id = key ? a.dataset[key] : null;
    renderLines();
    if (key) {
      const again = drawer.querySelector(`[data-${key}="${id}"]:not(:disabled)`) || drawer.querySelector(`[data-dec="${id}"]`);
      (again || drawer.querySelector("#checkoutBtn:not(:disabled)") || drawer.querySelector(".cart-empty .btn") || drawer.querySelector("[data-close]")).focus();
    }
  }
  refreshCards();
  if (qv.open && qvState.id) { const keep = document.activeElement; renderQV(); if (keep && keep.dataset && keep.dataset.qv) focusFirst(qv, `[data-qv="${keep.dataset.qv}"]:not(:disabled)`, '[data-qv="add"]'); }
  if (pageBuyEl) renderPageBuy();
  if (co.open && !$("coFormView").hidden) renderSummary();
}
function openDrawer() {
  if (qv.open) qv.close();
  renderLines();
  drawer.showModal();
}
function bumpCart() { const b = $("cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

/* ===================== checkout ===================== */
const co = $("co"), form = $("coForm");
const F = { name: $("f-name"), phone: $("f-phone"), date: $("f-date"), address: $("f-address"), notes: $("f-notes") };
const getMethod = () => (form.querySelector('input[name="method"]:checked') || {}).value || "collect";
function totals() { const sub = cartSubtotal(), post = getMethod() === "post" ? CONFIG.postage : 0; return { sub, post, total: sub + post }; }
function renderSummary() {
  $("sumList").innerHTML = Object.entries(cart).map(([id, q]) => { const p = byId[id]; return `<li class="sum-item"><span><b>${q}×</b> ${esc(fullTitle(p))}</span><span>${money(p.price * q)}</span></li>`; }).join("");
  const t = totals(), post = getMethod() === "post";
  $("sumSub").textContent = money(t.sub);
  $("sumShipLabel").textContent = post ? "Postage" : "Collection";
  $("sumShip").textContent = post ? money(CONFIG.postage) : "Free";
  $("sumTotal").textContent = money(t.total);
  $("footTotal").textContent = money(t.total);
  $("payBtn").textContent = CONFIG.testMode ? "Place test order" : `Pay ${money(t.total)} with Fleeca`;
  $("payHint").textContent = CONFIG.testMode ? "Test mode: nothing is charged" : "You'll go to Fleeca to pay from your bank account";
}
function syncMethod() {
  const post = getMethod() === "post";
  $("collectPanel").hidden = post;
  $("postPanel").hidden = !post;
  renderSummary();
}
function setDateBounds() {
  const n = shopNow();
  const start = n.h >= CONFIG.closeHour ? ymdAdd(n, 1) : { y: n.y, m: n.m, d: n.d };
  const end = ymdAdd(start, CONFIG.collectDaysAhead);
  F.date.min = isoDate(start); F.date.max = isoDate(end);
  if (F.date.value && (F.date.value < F.date.min || F.date.value > F.date.max)) F.date.value = "";
  $("h-date").textContent = `Any day up to two weeks ahead. We're open ${hoursText(CONFIG)} every day.`;
}
function validate() {
  const e = {}, method = getMethod();
  if (F.name.value.trim().length < 3) e.name = "Enter your full name.";
  const raw = F.phone.value.trim(), digits = raw.replace(/\D/g, "");
  if (!raw) e.phone = "Enter a phone number so we can reach you.";
  else if (/[^\d\s()+\-#]/.test(raw) || digits.length < 4 || digits.length > 15) e.phone = "Enter your phone number using digits only.";
  if (method === "collect") {
    const d = F.date.value;
    if (!d) e.date = "Pick the day you can collect.";
    else if (d < F.date.min || d > F.date.max) e.date = `Pick a day between ${fmtDate(F.date.min)} and ${fmtDate(F.date.max)}.`;
  } else if (F.address.value.trim().length < 8) e.address = "Enter the full address we should post to.";
  return e;
}
function showErrors(errs) {
  ["name", "phone", "date", "address"].forEach(k => {
    const el = F[k], msg = $("e-" + k);
    if (errs[k]) { el.setAttribute("aria-invalid", "true"); msg.textContent = errs[k]; msg.hidden = false; }
    else { el.removeAttribute("aria-invalid"); msg.textContent = ""; msg.hidden = true; }
  });
  const first = ["name", "phone", "date", "address"].find(k => errs[k]);
  if (first) F[first].focus();
}
function buildOrder() {
  const t = totals(), method = getMethod();
  return {
    id: "FC-" + String(Math.floor(1000 + Math.random() * 9000)),
    placedAt: new Date().toISOString(),
    name: F.name.value.trim(),
    phone: F.phone.value.trim(),
    method,
    collectDate: method === "collect" ? F.date.value : null,
    address: method === "post" ? F.address.value.trim() : null,
    notes: F.notes.value.trim(),
    items: Object.entries(cart).map(([id, q]) => ({ id, title: fullTitle(byId[id]), qty: q, price: byId[id].price })),
    subtotal: t.sub, postage: t.post, total: t.total,
    test: CONFIG.testMode
  };
}
function openCheckout() {
  if (!cartCount()) return;
  if (drawer.open) drawer.close();
  $("coFormView").hidden = false;
  $("coDoneView").hidden = true;
  $("coDoneView").innerHTML = "";
  $("testNote").hidden = !CONFIG.testMode;
  $("formError").textContent = "";
  setDateBounds();
  syncMethod();
  co.showModal();
  co.scrollTop = 0;
  F.name.focus();
}
async function placeOrder(ev) {
  ev.preventDefault();
  $("formError").textContent = "";
  const errs = validate();
  showErrors(errs);
  if (Object.keys(errs).length) return;
  const order = buildOrder();
  if (CONFIG.testMode || !CONFIG.orderApi) {
    cart = {}; saveCart(); renderCartUI();
    showDone(order);
    return;
  }
  // Live mode: the order service re-prices the cart from its own price list, stores the order,
  // and returns the Fleeca payment link. Discord is pinged by the service once payment clears.
  const btn = $("payBtn");
  btn.disabled = true; btn.textContent = "Connecting to Fleeca…";
  try {
    const res = await fetch(CONFIG.orderApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    if (!data.paymentUrl) throw new Error("no payment link");
    store.set("flickers-pending-order", { ...order, id: data.orderId || order.id });
    window.location.href = data.paymentUrl;
  } catch (e) {
    $("formError").textContent = "We couldn't start the payment. Check your connection and try again.";
    btn.disabled = false; renderSummary();
  }
}
function discordPreview(o) {
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const items = o.items.map(i => `${i.qty} × ${esc(i.title)} · ${money(i.price * i.qty)}`).join("<br>");
  return `<section class="dc-wrap" aria-labelledby="dcTitle">
    <h3 id="dcTitle">Staff notification preview</h3>
    <p class="hint">Shown in test mode only. Once Discord is connected, this posts in your orders channel when a payment clears.</p>
    <div class="dc">
      <div class="dc-avatar" aria-hidden="true">FC</div>
      <div class="dc-msg">
        <div class="dc-head"><span class="dc-name">Flickers Orders</span><span class="dc-tag">App</span><span class="dc-time">Today at ${time}</span></div>
        <p class="dc-text"><span class="dc-mention">@Staff</span> New order to ${o.method === "collect" ? "collect" : "post"}.</p>
        <div class="dc-embed">
          <div class="dc-title">Order ${esc(o.id)} · ${money(o.total)}</div>
          <div class="dc-fields">
            <div class="dc-field"><b>Customer</b>${esc(o.name)}</div>
            <div class="dc-field"><b>Phone</b>${esc(o.phone)}</div>
            ${o.method === "collect" ? `<div class="dc-field wide"><b>Collect on</b>${esc(fmtDate(o.collectDate))}, ${hoursText(CONFIG)}</div>` : `<div class="dc-field wide"><b>Post to</b>${escLines(o.address)}</div>`}
            <div class="dc-field wide"><b>Items</b>${items}</div>
            <div class="dc-field"><b>Subtotal</b>${money(o.subtotal)}</div>
            <div class="dc-field"><b>${o.method === "post" ? "Postage" : "Collection"}</b>${o.postage ? money(o.postage) : "Free"}</div>
            ${o.notes ? `<div class="dc-field wide"><b>Notes</b>${escLines(o.notes)}</div>` : ""}
          </div>
          <div class="dc-foot">Paid through Fleeca · ${o.test ? "test order, not charged" : "payment confirmed"}</div>
        </div>
      </div>
    </div>
  </section>`;
}
function showDone(o) {
  const collect = o.method === "collect";
  $("coFormView").hidden = true;
  const view = $("coDoneView");
  view.hidden = false;
  view.innerHTML = `<div class="done">
    <div class="done-top">
      <p class="eyebrow">${o.test ? "Test order" : "Payment received"}</p>
      <h2 class="done-title" id="doneTitle" tabindex="-1">Thanks, ${esc(firstName(o.name))}. Order received.</h2>
      <p class="ticket">Order <strong>${esc(o.id)}</strong></p>
      <p class="done-note">${o.test ? "This was a test, so nothing was charged and the shop wasn't notified." : "Your payment went through and the shop has your order."}</p>
    </div>
    <div class="done-grid">
      <dl class="done-dl">
        <dt>Name</dt><dd>${esc(o.name)}</dd>
        <dt>Phone</dt><dd>${esc(o.phone)}</dd>
        ${collect ? `<dt>Collect</dt><dd>${esc(fmtDate(o.collectDate))}, ${hoursText(CONFIG)}</dd>` : `<dt>Post to</dt><dd>${escLines(o.address)}</dd>`}
        <dt>Items</dt><dd>${o.items.map(i => `${i.qty} × ${esc(i.title)}`).join("<br>")}</dd>
        <dt>Total</dt><dd><strong>${money(o.total)}</strong>${o.postage ? ` <span class="hint">incl. ${money(o.postage)} postage</span>` : ""}</dd>
      </dl>
      <div class="next">
        <h3>What happens next</h3>
        <p>${collect
          ? `Come to the counter on ${esc(fmtDate(o.collectDate))} between ${hLabel(CONFIG.openHour)} and ${hLabel(CONFIG.closeHour)} and give your order number.`
          : "We post your order to the address you gave and text you when it's on its way."}</p>
        <p>We'll text ${esc(o.phone)} if anything changes.</p>
      </div>
    </div>
    ${o.test ? discordPreview(o) : ""}
    <div><button type="button" class="btn btn-yellow" data-close>Back to the shop</button></div>
  </div>`;
  co.scrollTop = 0;
  $("doneTitle").focus();
}
function resetCheckout() {
  form.reset();
  ["name", "phone", "date", "address"].forEach(k => { F[k].removeAttribute("aria-invalid"); $("e-" + k).hidden = true; });
  $("coFormView").hidden = false;
  $("coDoneView").hidden = true;
  $("coDoneView").innerHTML = "";
}
function handlePaymentReturn() {
  // Live mode only: the order service sends shoppers back to  ?order=FC-1234&status=paid  (or failed).
  let params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  const id = params.get("order"), status = params.get("status");
  if (!id || !status) return;
  try { history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) { /* ignore */ }
  const pending = store.get("flickers-pending-order", null);
  if (status === "paid" && pending && pending.id === id) {
    cart = {}; saveCart(); renderCartUI();
    store.set("flickers-pending-order", null);
    co.showModal();
    showDone({ ...pending, test: false });
  } else if (status !== "paid") {
    toast("Your payment didn't go through, so nothing was charged. Your cart is still here.");
  }
}

/* ===================== toast ===================== */
const toastEl = $("toast");
let toastTimer = 0;
function hideToast() { toastEl.hidden = true; toastEl.innerHTML = ""; }
function toast(msg, action) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-btn">${esc(action.label)}</button>` : ""}`;
  if (action) toastEl.querySelector(".toast-btn").addEventListener("click", () => { hideToast(); action.fn(); });
  toastEl.hidden = false;
  toastEl.classList.remove("show"); void toastEl.offsetWidth; toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4500);
}

/* ===================== events ===================== */
function handleAdd(id, btn) {
  const p = byId[id]; if (!p) return;
  if (!addToCart(id, 1)) { toast(p.stock <= 0 ? "That one is sold out." : "Every copy we have is already in your cart."); return; }
  bumpCart();
  if (btn) {
    btn.classList.add("added"); btn.textContent = "Added";
    setTimeout(() => { btn.classList.remove("added"); refreshCards(); }, 1100);
  }
  toast(`Added ${fullTitle(p)}`, { label: "View cart", fn: openDrawer });
}
function buyAction(action, st, rerender, inDialog) {
  const p = byId[st.id]; if (!p) return;
  const scope = inDialog ? qv : pageBuyEl;
  if (action === "inc") { st.qty = Math.min(buyMax(p), st.qty + 1); rerender(); focusFirst(scope, '[data-qv="inc"]:not(:disabled)', '[data-qv="dec"]'); }
  else if (action === "dec") { st.qty = Math.max(1, st.qty - 1); rerender(); focusFirst(scope, '[data-qv="dec"]:not(:disabled)', '[data-qv="inc"]'); }
  else if (action === "add") {
    const n = st.qty;
    if (addToCart(p.id, n)) { if (inDialog) qv.close(); st.qty = 1; bumpCart(); toast(`Added ${n > 1 ? n + " × " : ""}${fullTitle(p)}`, { label: "View cart", fn: openDrawer }); renderPageBuy(); }
  } else if (action === "cart") { if (inDialog) qv.close(); openDrawer(); }
}

document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-open],[data-add],.divider[data-group],[data-inc],[data-dec],[data-remove],[data-qv],[data-close]");
  if (!t) return;
  const d = t.dataset;
  if (d.open) {
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button) return; // let the link open normally
    ev.preventDefault(); openQuickView(d.open); return;
  }
  if (d.add) { if (t.getAttribute("aria-disabled") === "true") { const p = byId[d.add]; toast(p.stock <= 0 ? "That one is sold out." : "Every copy we have is already in your cart."); } else handleAdd(d.add, t); return; }
  if (d.group) { setGroup(d.group); return; }
  if (d.inc) { setQty(d.inc, cartQty(d.inc) + 1); return; }
  if (d.dec) { setQty(d.dec, cartQty(d.dec) - 1); return; }
  if (d.remove) { setQty(d.remove, 0); return; }
  if (d.qv) {
    if (t.closest("dialog") === qv) buyAction(d.qv, qvState, renderQV, true);
    else if (pageState) buyAction(d.qv, pageState, renderPageBuy, false);
    return;
  }
  if ("close" in d) {
    const dlg = t.closest("dialog");
    if (dlg) dlg.close();
    if (d.goto) { const target = document.getElementById(d.goto); if (target) target.scrollIntoView({ block: "start" }); else location.href = `${root}#${d.goto}`; }
  }
});

[qv, drawer, co].forEach(dlg => dlg.addEventListener("click", ev => { if (ev.target === dlg) dlg.close(); }));
co.addEventListener("close", () => { if (!$("coDoneView").hidden) resetCheckout(); });
$("cartBtn").addEventListener("click", openDrawer);
$("checkoutBtn").addEventListener("click", openCheckout);
form.addEventListener("submit", placeOrder);
form.querySelectorAll('input[name="method"]').forEach(r => r.addEventListener("change", syncMethod));
["name", "phone", "date", "address"].forEach(k => F[k].addEventListener("input", () => {
  if (F[k].getAttribute("aria-invalid") === "true") { F[k].removeAttribute("aria-invalid"); $("e-" + k).hidden = true; }
}));
if ($("q")) {
  $("q").addEventListener("input", ev => { filters.q = ev.target.value; applyFilters(); });
  $("sort").addEventListener("change", ev => { filters.sort = ev.target.value; applyFilters(); });
  $("clearSearch").addEventListener("click", () => { filters.q = ""; $("q").value = ""; setGroup("all"); $("q").focus(); });
}
window.addEventListener("storage", ev => { if (ev.key === CART_KEY) { cart = sanitizeCart(store.get(CART_KEY, {})); renderCartUI(); } });

/* ===================== start ===================== */
try {
  const data = await statusReady;
  CONFIG = data.config; CATEGORIES = data.categories; PRODUCTS = data.products;
  PRODUCTS.forEach(p => { p.stock = Math.max(0, Math.floor(Number(p.stock) || 0)); p.price = Math.max(0, Number(p.price) || 0); });
  byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  cart = sanitizeCart(store.get(CART_KEY, {}));
  renderHours();
  setInterval(renderHours, 60000);
  renderCartUI();
  applyFilters();
  handlePaymentReturn();
} catch (e) {
  // The pre-rendered pages still read fine without it; only the cart is unavailable.
  const btn = $("cartBtn");
  if (btn) btn.disabled = true;
  document.querySelectorAll(".add").forEach(b => { b.disabled = true; });
  console.error("Flickers Comics: couldn't load shop data", e);
}
