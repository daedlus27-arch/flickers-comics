/* Builds the static site into dist/.
   Reads data/*.json and assets/, writes pre-rendered HTML, resized covers, fonts, css and js.
   Run with: npm run build */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fullTitle, coverName } from "../src/shared.mjs";
import { page, homePage, comicPage, notFoundPage, DEFAULT_DESC } from "./templates.mjs";
import { adminPage } from "./admin-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const rd = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const wr = (p, data) => { const f = path.join(DIST, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const cp = (from, to) => { const f = path.join(DIST, to); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(path.join(ROOT, from), f); };

/* ---------- data ---------- */
const cfg = JSON.parse(rd("data/config.json"));
const products = JSON.parse(rd("data/products.json"));
const featuredRaw = JSON.parse(rd("data/featured.json"));
if (process.env.ADMIN_API) cfg.adminApi = process.env.ADMIN_API; // lets you point a local build at a local or test staff API
const cats = cfg.categories;

function validate() {
  const errs = [], ids = new Set();
  const keys = new Set(cats.map(c => c.key));
  products.forEach((p, i) => {
    const where = `products[${i}] (${p.id || "no id"})`;
    if (!p.id || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) errs.push(`${where}: id must be lowercase letters, numbers and dashes`);
    if (ids.has(p.id)) errs.push(`${where}: duplicate id`);
    ids.add(p.id);
    if (!keys.has(p.cat)) errs.push(`${where}: unknown category "${p.cat}"`);
    if (!p.title) errs.push(`${where}: missing title`);
    if (!Number.isFinite(p.price) || p.price < 0) errs.push(`${where}: bad price`);
    if (!Number.isInteger(p.stock) || p.stock < 0) errs.push(`${where}: bad stock`);
    if (p.image && !fs.existsSync(path.join(ROOT, p.image))) errs.push(`${where}: image not found: ${p.image}`);
  });
  featuredRaw.forEach(id => { if (!ids.has(id)) errs.push(`featured.json: unknown id "${id}"`); });
  if (!cfg.siteUrl) errs.push("config.json: siteUrl is required");
  if (errs.length) { console.error("Data problems:\n - " + errs.join("\n - ")); process.exit(1); }
}
validate();

const siteUrl = cfg.siteUrl.replace(/\/+$/, "");
const realCats = cats.filter(c => c.key !== "all");
const usedCats = realCats.filter(c => products.some(p => p.cat === c.key));
const groupBy = usedCats.length > 1 ? "cat" : "publisher";
const groupKey = p => groupBy === "cat" ? p.cat : (p.publisher || "Other");
const counts = new Map();
products.forEach(p => counts.set(groupKey(p), (counts.get(groupKey(p)) || 0) + 1));
const groups = [...counts.entries()]
  .map(([key, count]) => ({ key, count, label: groupBy === "cat" ? (cats.find(c => c.key === key) || {}).label || key : key }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

/* ---------- start clean ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

/* ---------- fonts (self-hosted, latin subset) ---------- */
const FONTS = [
  ["anton", "Anton", [400]],
  ["archivo", "Archivo", [400, 500, 600, 700, 800]],
  ["bangers", "Bangers", [400]],
  ["permanent-marker", "Permanent Marker", [400]]
];
let fontCss = "";
for (const [pkg, family, weights] of FONTS) {
  for (const w of weights) {
    const file = `${pkg}-latin-${w}-normal.woff2`;
    const src = path.join(ROOT, "node_modules", "@fontsource", pkg, "files", file);
    if (!fs.existsSync(src)) { console.error(`Missing font file ${file}. Run npm install.`); process.exit(1); }
    wr(`fonts/${file}`, fs.readFileSync(src));
    fontCss += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(../fonts/${file}) format("woff2")}\n`;
  }
}
wr("css/fonts.css", fontCss);
const fontPreload = ["fonts/anton-latin-400-normal.woff2", "fonts/archivo-latin-400-normal.woff2", "fonts/archivo-latin-700-normal.woff2"];

/* ---------- css, js, static assets ---------- */
cp("src/css/styles.css", "css/styles.css");
cp("src/css/admin.css", "css/admin.css");
cp("src/shared.mjs", "js/shared.js");
cp("src/js/site.js", "js/site.js");
cp("src/admin/admin.js", "admin/admin.js");
for (const f of ["flickers-logo.png", "favicon.png", "apple-touch-icon.png"]) cp(`assets/${f}`, `assets/${f}`);
wr(".nojekyll", "");

/* ---------- covers: webp at two sizes ---------- */
const images = [...new Set(products.map(p => p.image).filter(Boolean))];
await Promise.all(images.flatMap(img => {
  const name = coverName(img), input = path.join(ROOT, img);
  return [[400, 78], [600, 80]].map(async ([w, q]) => {
    const out = path.join(DIST, "img", "covers", `${name}-${w}.webp`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(input).rotate().resize({ width: w, withoutEnlargement: false }).webp({ quality: q }).toFile(out);
  });
}));

/* ---------- social share image ---------- */
{
  const logo = await sharp(path.join(ROOT, "assets/flickers-logo.png")).resize({ width: 640 }).toBuffer();
  const fan = featuredRaw.map(id => products.find(p => p.id === id)).filter(p => p && p.image).slice(0, 3);
  const covers = await Promise.all(fan.map(p => sharp(path.join(ROOT, p.image)).resize({ width: 220, height: 330, fit: "cover" }).toBuffer()));
  const layers = [{ input: logo, left: 64, top: 240 }];
  covers.forEach((b, i) => layers.push({ input: b, left: 760 + i * 130, top: 150 + (i === 1 ? -30 : 20) }));
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0E1211"/><rect y="0" width="1200" height="24" fill="#FFE912"/><rect y="606" width="1200" height="24" fill="#FFE912"/></svg>`);
  await sharp(base).composite(layers).png().toFile(path.join(DIST, "assets", "og.png"));
}

/* ---------- pages ---------- */
const ctxFor = root => ({ root, cfg, cats, products, featured: featuredRaw, groups, groupBy, groupKey });
const ogDefault = `${siteUrl}/assets/og.png`;
const shell = (opts) => page({ cfg, fontPreload, ...opts });

// home
wr("index.html", shell({
  title: "Flickers Comics: independent comic shop",
  desc: DEFAULT_DESC,
  canonical: `${siteUrl}/`,
  ogImage: ogDefault,
  jsonld: { "@context": "https://schema.org", "@type": "Store", name: "Flickers Comics", url: `${siteUrl}/`, image: ogDefault, description: DEFAULT_DESC },
  body: homePage(ctxFor(""))
}));

// one page per comic
for (const p of products) {
  const root = "../../";
  const ctx = ctxFor(root);
  const related = products.filter(r => r.id !== p.id && r.stock > 0 && r.publisher === p.publisher).slice(0, 4);
  const t = fullTitle(p);
  const img = p.image ? `${siteUrl}/img/covers/${coverName(p.image)}-600.webp` : ogDefault;
  const desc = String(p.blurb || DEFAULT_DESC).replace(/\s+/g, " ").slice(0, 200);
  wr(`comic/${p.id}/index.html`, shell({
    title: `${t} | Flickers Comics`,
    desc,
    root,
    canonical: `${siteUrl}/comic/${p.id}/`,
    ogImage: img,
    ogType: "product",
    jsonld: {
      "@context": "https://schema.org", "@type": "Product", name: t, description: p.blurb || undefined, image: img, sku: p.id,
      brand: p.publisher ? { "@type": "Brand", name: p.publisher } : undefined,
      offers: { "@type": "Offer", url: `${siteUrl}/comic/${p.id}/`, price: p.price, availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" }
    },
    body: comicPage(p, ctx, related)
  }));
}

// 404 (GitHub Pages serves this for unknown URLs, from the site root, so it must not use relative links)
{
  const root = new URL(siteUrl + "/").pathname;
  wr("404.html", shell({
    title: "Page not found | Flickers Comics", desc: DEFAULT_DESC, root, noindex: true,
    css: ["css/fonts.css", "css/styles.css"], body: notFoundPage(ctxFor(root))
  }));
}

// staff manager
wr("admin/index.html", adminPage({ cfg }));

/* ---------- data for the browser, sitemap, robots ---------- */
wr("data/shop.json", JSON.stringify({
  config: { postage: cfg.postage, openHour: cfg.openHour, closeHour: cfg.closeHour, timeZone: cfg.timeZone, collectDaysAhead: cfg.collectDaysAhead, testMode: cfg.testMode, orderApi: cfg.orderApi || "" },
  categories: cats, featured: featuredRaw, groupBy, products
}));
const today = new Date().toISOString().slice(0, 10);
wr("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + [`${siteUrl}/`, ...products.map(p => `${siteUrl}/comic/${p.id}/`)].map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") + `\n</urlset>\n`);
wr("robots.txt", `User-agent: *\nAllow: /\nDisallow: ${new URL(siteUrl + "/").pathname}admin/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

console.log(`Built ${products.length} comics, ${images.length} covers, ${groups.length} shelves (by ${groupBy}) into dist/`);
