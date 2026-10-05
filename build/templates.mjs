/* HTML templates for the pre-rendered site. Everything here runs at build time. */
import { esc, money, fullTitle, metaLine, catOf, coverHTML, hoursText, DAYS, hoursShort, stockWord, GRADES } from "../src/shared.mjs";

const X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
export const SITE_NAME = "Flickers Comics";
export const BUILD_ID = Date.now().toString(36);
export const DEFAULT_DESC = "Independent comic shop. Order online, then collect at the counter or have it posted to you.";

/* ---------- page shell ---------- */
export function page({ title, desc, root = "", canonical, ogImage, ogType = "website", body, jsonld, cfg, css = ["css/styles.css"], script = "js/site.js", noindex = false, extraHead = "", csp, fontPreload = [], fontCss = "" }) {
  const orderOrigin = cfg.orderApi ? ` ${new URL(cfg.orderApi).origin}` : "";
  const policy = csp || `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'${orderOrigin}; base-uri 'self'; form-action 'self'${orderOrigin}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${esc(policy)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0E1211">
<meta name="color-scheme" content="light dark">
${noindex ? '<meta name="robots" content="noindex">' : ""}${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(ogImage)}">` : ""}
<link rel="icon" type="image/png" href="${root}assets/favicon.png">
<link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
${fontPreload.map(f => `<link rel="preload" href="${root}${f}" as="font" type="font/woff2" crossorigin>`).join("\n")}
${fontCss ? `<style>${fontCss.split("__ROOT__").join(root)}</style>` : ""}
${css.map(c => `<link rel="stylesheet" href="${root}${c}">`).join("\n")}
${script === "js/site.js" ? `<link rel="preload" href="${root}data/shop.json?v=${BUILD_ID}" as="fetch" crossorigin>` : ""}
${extraHead}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body data-root="${root}" data-build="${BUILD_ID}">
${body}
${script ? `<script type="module" src="${root}${script}"></script>` : ""}
</body>
</html>
`;
}

/* ---------- chrome ---------- */
export function topStrip(cfg) {
  return `<section class="topstrip" aria-label="Opening hours and postage">
  <div class="wrap topstrip-in">
    <span class="status" id="stripStatus"><span class="status-dot" aria-hidden="true"></span><span id="stripStatusText">Open every day, ${hoursText(cfg)}</span></span>
    <span class="strip-extra"><span>Collect in store for free</span><span>Postage ${money(cfg.postage)}</span></span>
  </div>
</section>`;
}

export function header(root, { logo = "assets/flickers-logo.png" } = {}) {
  return `<header class="site-header">
  <div class="wrap header-in">
    <a class="logo-link" href="${root || "./"}"><img class="logo" src="${root}${logo}" alt="Flickers Comics" width="640" height="104"></a>
    <div class="header-actions">
      <nav class="nav" aria-label="Main"><a href="${root}#shop">Shop</a><a href="${root}#how">How ordering works</a><a href="${root}#hours">Hours</a></nav>
      <button type="button" class="cart-btn" id="cartBtn" aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>
        <span class="cart-word">Cart</span>
        <span class="cart-count" id="cartCount">0</span>
        <span class="cart-total" id="cartTotal">$0</span>
      </button>
    </div>
  </div>
</header>
<nav class="subnav" aria-label="Main (small screens)"><a href="${root}#shop">Shop</a><a href="${root}#how">How ordering works</a><a href="${root}#hours">Hours</a></nav>`;
}

export function footer(root, cfg) {
  return `<footer class="site-footer">
  <div class="wrap footer-in">
    <img class="footer-logo" src="${root}assets/flickers-logo.png" alt="Flickers Comics" width="640" height="104" loading="lazy">
    <div class="footer-cols">
      <div><h2>Hours</h2><p>Every day, ${hoursText(cfg)}</p></div>
      <div><h2>Orders</h2><p>Collect in store: free<br>Postage: ${money(cfg.postage)}</p></div>
      <div><h2>Payment</h2><p>${cfg.payOnline ? "Pay from your bank account<br>through Fleeca" : "Online payment through<br>Fleeca is coming soon"}</p></div>
    </div>
    <p class="fine">© Flickers Comics. All prices in dollars. <a class="footer-link" href="${root}admin/">Staff login</a></p>
  </div>
</footer>`;
}

/* Quick view, cart drawer, checkout and toast. Filled in by js/site.js. */
export function dialogs(cfg) {
  return `<dialog class="qv" id="qv" aria-labelledby="qvTitle"><div id="qvBody"></div></dialog>

<dialog class="drawer" id="drawer" aria-labelledby="drawerTitle">
  <div class="drawer-head">
    <h2 class="dialog-title" id="drawerTitle">Your cart</h2>
    <button type="button" class="icon-btn on-dark" data-close aria-label="Close cart">${X}</button>
  </div>
  <div class="drawer-body">
    <ul class="lines" id="lines"></ul>
    <div class="cart-empty" id="cartEmpty" hidden>
      <p class="empty-title">Your cart is empty</p>
      <p class="hint">Add something from the shelves and it shows up here.</p>
      <button type="button" class="btn btn-yellow" data-close data-goto="shop">Browse the shelves</button>
    </div>
  </div>
  <div class="drawer-foot" id="drawerFoot">
    <div class="r-line"><span>Subtotal</span><strong id="drawerSub">$0</strong></div>
    <p class="hint">Choose collection or postage at checkout.</p>
    <button type="button" class="btn btn-yellow btn-block" id="checkoutBtn">Checkout</button>
  </div>
</dialog>

<dialog class="checkout" id="co" aria-labelledby="coTitle">
  <div class="co-head">
    <h2 class="dialog-title" id="coTitle">Checkout</h2>
    <button type="button" class="icon-btn on-dark" data-close aria-label="Close checkout">${X}</button>
  </div>
  <div id="coFormView">
    <p class="test-note" id="testNote"><strong>Test mode.</strong> Payments aren't connected yet, so test orders aren't charged and the shop isn't notified.</p>
    <form id="coForm" novalidate>
      <div class="co-grid">
        <div class="co-fields">
          <fieldset>
            <legend>Your details</legend>
            <div class="two">
              <div class="field">
                <label for="f-name">Full name</label>
                <input id="f-name" name="name" autocomplete="name" placeholder="e.g. Jamie Reyes" aria-describedby="e-name">
                <p class="error" id="e-name" hidden></p>
              </div>
              <div class="field">
                <label for="f-phone">Phone number</label>
                <input id="f-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="e.g. 5550142" aria-describedby="h-phone e-phone">
                <p class="hint" id="h-phone">So we can text you about your order.</p>
                <p class="error" id="e-phone" hidden></p>
              </div>
            </div>
          </fieldset>
          <fieldset>
            <legend>How do you want it?</legend>
            <div class="methods">
              <label class="method"><input type="radio" name="method" value="collect" id="m-collect" checked>
                <span class="method-text"><span class="method-name">Collect in store</span><span class="method-price">Free</span><span class="hint">Pick it up at the counter.</span></span></label>
              <label class="method"><input type="radio" name="method" value="post" id="m-post">
                <span class="method-text"><span class="method-name">Post it to me</span><span class="method-price">${money(cfg.postage)}</span><span class="hint">Sent to your address.</span></span></label>
            </div>
            <div class="field" id="collectPanel">
              <label for="f-date">When can you collect?</label>
              <input type="date" id="f-date" name="date" aria-describedby="h-date e-date">
              <p class="hint" id="h-date">We're open ${hoursText(cfg)} every day.</p>
              <p class="error" id="e-date" hidden></p>
            </div>
            <div class="field" id="postPanel" hidden>
              <label for="f-address">Delivery address</label>
              <textarea id="f-address" name="address" rows="3" autocomplete="street-address" placeholder="House or apartment number, street, area" aria-describedby="e-address"></textarea>
              <p class="error" id="e-address" hidden></p>
            </div>
          </fieldset>
          <div class="field">
            <label for="f-notes">Notes <span class="opt">(optional)</span></label>
            <textarea id="f-notes" name="notes" rows="2" placeholder="Anything we should know?"></textarea>
          </div>
        </div>
        <aside class="receipt" aria-labelledby="sumTitle">
          <h3 id="sumTitle">Order summary</h3>
          <ul class="sum-list" id="sumList"></ul>
          <div class="r-line"><span>Subtotal</span><span id="sumSub">$0</span></div>
          <div class="r-line"><span id="sumShipLabel">Collection</span><span id="sumShip">Free</span></div>
          <div class="r-line r-total"><span>Total</span><span id="sumTotal">$0</span></div>
        </aside>
      </div>
      <div class="co-foot">
        <div class="foot-total"><span>Total</span><strong id="footTotal">$0</strong><span class="hint" id="payHint"></span></div>
        <p class="form-error" id="formError" role="alert"></p>
        <button type="submit" class="btn btn-yellow" id="payBtn">Place test order</button>
      </div>
    </form>
  </div>
  <div id="coDoneView" hidden></div>
</dialog>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

const NOSCRIPT = `<noscript><style>.add,.cart-btn,.qv-buy,.tools,.dividers{display:none!important}</style></noscript>`;

/* ---------- product pieces ---------- */
export function stickerHTML(p) {
  const b = p.badges || [];
  if (p.stock <= 0) return "";
  if (b.includes("variant")) return `<span class="sticker sticker-variant" aria-hidden="true">Variant</span>`;
  if (b.includes("exclusive")) return `<span class="sticker sticker-exclusive" aria-hidden="true">Exclusive</span>`;
  if (b.includes("new")) return `<span class="sticker sticker-new" aria-hidden="true">New!</span>`;
  return "";
}
export const comicUrl = (root, p) => `${root}comic/${p.id}/`;

export function cardHTML(p, ctx, i) {
  const { root, cats, groupKey } = ctx;
  const t = fullTitle(p), url = comicUrl(root, p);
  const extras = [];
  if ((p.badges || []).includes("new") && p.stock > 0) extras.push("new");
  if (p.staff) extras.push("staff pick");
  if (p.stock <= 0) extras.push("sold out");
  const low = p.stock <= 0 ? `<span class="low">Sold out</span>` : p.stock <= 2 ? `<span class="low">Only ${p.stock} left</span>` : "";
  const q = [t, p.publisher, catOf(cats, p.cat).label, p.blurb].join(" ").toLowerCase();
  const soldOff = p.stock <= 0;
  return `<article class="card" data-id="${esc(p.id)}" data-group="${esc(groupKey(p))}" data-price="${p.price}" data-stock="${p.stock}" data-title="${esc(t.toLowerCase())}" data-index="${i}" data-q="${esc(q)}">
    <a class="cover-btn" href="${url}" data-open="${esc(p.id)}" aria-label="${esc(t)}${extras.length ? ", " + extras.join(", ") : ""}. View details">
      ${coverHTML(p, { imgBase: root })}${stickerHTML(p)}${p.staff ? `<span class="talker" aria-hidden="true">Staff pick!</span>` : ""}
    </a>
    <div class="card-body">
      <p class="meta">${esc(metaLine(p, cats))}</p>
      <h3 class="title"><a href="${url}" data-open="${esc(p.id)}"><span class="clamp">${esc(t)}</span></a></h3>
      <p class="stock">${low}</p>
      <div class="buy">
        <span class="price-tag">${money(p.price)}</span>
        <button type="button" class="add" data-add="${esc(p.id)}" aria-disabled="${soldOff}" aria-label="${soldOff ? "Sold out: " : "Add to cart: "}${esc(t)}">${soldOff ? "Sold out" : "Add"}</button>
      </div>
    </div>
  </article>`;
}

export function detailHTML(p, cats, root) {
  const t = fullTitle(p);
  const rows = [["Format", catOf(cats, p.cat).one]];
  if (p.publisher) rows.push(["Publisher", p.publisher]);
  if (p.grade) { const code = p.grade.split(" ")[0]; rows.push(["Condition", `${p.grade} (${GRADES[code] || code})`]); }
  if (p.variant) rows.push([p.cat === "funko" ? "Finish" : "Edition", p.variant]);
  if (p.collects) rows.push(["Contents", p.collects]);
  if (p.pages) rows.push(["Pages", Number(p.pages).toLocaleString("en-US")]);
  if (p.cat === "funko") rows.push(["Figure", p.num]);
  rows.push(["Stock", stockWord(p)]);
  return `<div class="qv-in">
    <div class="qv-cover">${coverHTML(p, { imgBase: root, priority: true, sizes: "(min-width: 640px) 340px, 260px" })}${stickerHTML(p)}</div>
    <div class="qv-info">
      <p class="eyebrow">${esc(catOf(cats, p.cat).one)}</p>
      <h1 class="qv-title">${esc(t)}</h1>
      <p class="qv-price">${money(p.price)}</p>
      ${p.blurb ? `<p class="qv-blurb">${esc(p.blurb)}</p>` : ""}
      ${p.staff ? `<p class="qv-talker">“${esc(p.staff)}”<small>Staff pick</small></p>` : ""}
      <dl class="specs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <div class="qv-buy" data-buy="${esc(p.id)}">${p.stock <= 0 ? `<p class="qv-limit">This one is sold out.</p>` : ""}</div>
    </div>
  </div>`;
}

/* ---------- pages ---------- */
export function homePage(ctx) {
  const { cfg, cats, products, featured, groups, groupLabel, root = "" } = ctx;
  const byId = new Map(products.map(p => [p.id, p]));
  const hero = featured.map(id => byId.get(id)).filter(Boolean).slice(0, 3);
  const fan = hero.map((p, i) => `<a class="fan fan-${i + 1}" href="${comicUrl(root, p)}" data-open="${esc(p.id)}" aria-label="${esc(fullTitle(p))}. View details">${coverHTML(p, { imgBase: root, priority: i === 1, lazy: false, sizes: "(min-width: 860px) 200px, 40vw" })}</a>`).join("");
  const burst = `<svg class="burst" viewBox="-100 -100 200 200" aria-hidden="true"><polygon points="${burstPoints(0, 0, 66, 100, 22)}" fill="currentColor"/></svg>`;
  const total = products.length;
  const dividers = groups.length > 1
    ? `<button type="button" class="divider" data-group="all" aria-pressed="true">Everything<span class="n">${total}</span></button>` + groups.map(g => `<button type="button" class="divider" data-group="${esc(g.key)}" aria-pressed="false">${esc(g.label)}<span class="n">${g.count}</span></button>`).join("")
    : "";
  const cards = products.map((p, i) => cardHTML(p, ctx, i)).join("\n");
  return `${NOSCRIPT}
<a class="skip" href="#shop">Skip to the shelves</a>
${topStrip(cfg)}
${header(root)}
<main id="top">
  <section class="hero" aria-labelledby="heroTitle">
    <div class="wrap hero-in">
      <div class="hero-copy">
        <p class="eyebrow">Independent comic shop</p>
        <h1 id="heroTitle"><span class="mark">Comics</span> on the shelves now</h1>
        <p class="lede">Single issues in stock now. Order online, then collect at the counter or have it posted to you.</p>
        <div class="hero-actions">
          <a class="btn btn-yellow" href="#shop">Browse the shelves</a>
          <a class="btn btn-plain" href="#how">How ordering works</a>
        </div>
        <ul class="hero-facts">
          <li><strong>Open every day</strong> ${hoursText(cfg)}</li>
          <li><strong>Collect in store</strong> free</li>
          <li><strong>Postage</strong> ${money(cfg.postage)}</li>
        </ul>
      </div>
      ${hero.length ? `<div class="rack" id="rack" role="group" aria-label="New this week">${burst}${fan}<span class="rack-sticker" aria-hidden="true">New this week!</span></div>` : ""}
    </div>
  </section>

  <section class="shop" id="shop" aria-labelledby="shopTitle">
    <div class="wrap">
      <div class="section-head">
        <div>
          <h2 class="section-title" id="shopTitle">The shelves</h2>
          <p class="section-sub">Tap any cover for details.</p>
        </div>
        <div class="tools">
          <label class="search">
            <span class="sr-only">Search the shelves</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="q" placeholder="Search titles or publishers" autocomplete="off" aria-keyshortcuts="/">
          </label>
          <label class="sort"><span>Sort</span>
            <select id="sort">
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>
      </div>
      ${dividers ? `<div class="dividers" id="dividers" role="group" aria-label="Filter by ${ctx.groupBy === "cat" ? "category" : "publisher"}">${dividers}</div>` : ""}
      <p class="results" id="results" aria-live="polite">${total} ${total === 1 ? "item" : "items"}</p>
      <div class="grid" id="grid">
${cards}
      </div>
      <div class="empty" id="empty" hidden>
        <p class="empty-title">Nothing on this shelf</p>
        <p>Try a different word, or <button type="button" class="link-btn" id="clearSearch">show everything</button>.</p>
      </div>
    </div>
  </section>

  ${howSection(cfg)}
  ${hoursSection(cfg)}
</main>
${footer(root, cfg)}
${dialogs(cfg)}`;
}

function howSection(cfg) {
  return `<section class="how" id="how" aria-labelledby="howTitle">
    <div class="wrap">
      <h2 class="section-title" id="howTitle">How ordering works</h2>
      <p class="section-sub">Four steps from the shelf to your hands.</p>
      <ol class="panels">
        <li class="panel"><span class="panel-n" aria-hidden="true">1</span><h3>Fill your cart</h3><p>Add what you want from the shelves. Each title shows when stock is running low.</p></li>
        <li class="panel"><span class="panel-n" aria-hidden="true">2</span><h3>Collect or post</h3><p>Pick a day to collect at the counter for free, or have it posted to you for ${money(cfg.postage)}.</p></li>
        ${cfg.payOnline
          ? `<li class="panel"><span class="panel-n" aria-hidden="true">3</span><h3>Pay from your bank</h3><p>Checkout takes you to Fleeca to pay from your bank account.</p></li>
        <li class="panel"><span class="panel-n" aria-hidden="true">4</span><h3>We get in touch</h3><p>We text you when your order is ready to collect or on its way.</p></li>`
          : `<li class="panel"><span class="panel-n" aria-hidden="true">3</span><h3>The shop gets it</h3><p>Your order reaches the shop straight away, with your details and what you chose.</p></li>
        <li class="panel"><span class="panel-n" aria-hidden="true">4</span><h3>We get in touch</h3><p>We text you about your order, including when it's ready to collect or on its way.</p></li>`}
      </ol>
    </div>
  </section>`;
}

function hoursSection(cfg) {
  const week = DAYS.map(d => `<li class="day"><b>${d}</b><span>${hoursShort(cfg)}</span></li>`).join("");
  return `<section class="hours" id="hours" aria-labelledby="hoursTitle">
    <div class="wrap hours-in">
      <div>
        <h2 class="section-title" id="hoursTitle">Opening hours</h2>
        <p class="big-hours">${hoursText(cfg)}</p>
        <p class="hours-note">Every day of the week. Collections happen during opening hours.</p>
        <p class="status-pill" id="hoursStatus"><span class="status-dot" aria-hidden="true"></span><span id="hoursStatusText">Open every day</span></p>
      </div>
      <ol class="week" id="week" aria-label="This week">${week}</ol>
    </div>
  </section>`;
}

export function comicPage(p, ctx, related) {
  const { cfg, cats, root } = ctx;
  const t = fullTitle(p);
  return `${NOSCRIPT}
<a class="skip" href="#item">Skip to the comic</a>
${topStrip(cfg)}
${header(root)}
<main id="item" class="item-page">
  <div class="wrap">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="${root}">Home</a></li><li><a href="${root}#shop">The shelves</a></li><li aria-current="page">${esc(t)}</li></ol></nav>
    ${detailHTML(p, cats, root)}
  </div>
</main>
${related.length ? `<section class="more" aria-labelledby="moreTitle"><div class="wrap">
  <h2 class="section-title" id="moreTitle">More from ${esc(p.publisher || "the shelves")}</h2>
  <div class="grid">${related.map((r, i) => cardHTML(r, ctx, i)).join("\n")}</div>
</div></section>` : ""}
${footer(root, cfg)}
${dialogs(cfg)}`;
}

export function notFoundPage(ctx) {
  const { cfg, root } = ctx;
  return `${NOSCRIPT}
${topStrip(cfg)}
${header(root)}
<main>
  <div class="wrap lost">
    <p class="eyebrow">Error 404</p>
    <h1>Not on the shelves</h1>
    <p class="lede">That page isn't here. The comic may have sold out and been taken down, or the link is wrong.</p>
    <a class="btn btn-yellow" href="${root}#shop">Browse the shelves</a>
  </div>
</main>
${footer(root, cfg)}
${dialogs(cfg)}`;
}

/* ---------- helpers ---------- */
function burstPoints(cx, cy, rIn, rOut, n, rot = 0) {
  const r1 = v => Math.round(v * 10) / 10, p = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + Math.PI * i / n, R = i % 2 ? rIn : rOut; p.push(`${r1(cx + R * Math.cos(a))},${r1(cy + R * Math.sin(a))}`); }
  return p.join(" ");
}
