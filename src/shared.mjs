/* Helpers shared by the build script (Node), the storefront and the staff manager (browser).
   Keep this file free of DOM and Node APIs. */

export const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
export const escLines = s => esc(s).replace(/\r?\n/g, "<br>");
export const money = n => "$" + Math.round(n).toLocaleString("en-US");

export const GRADES = { "NM+": "Near Mint+", "NM": "Near Mint", "NM−": "Near Mint−", "VF": "Very Fine", "FN": "Fine", "VG": "Very Good", "GD": "Good" };

export const catOf = (cats, key) => (cats || []).find(c => c.key === key) || { key, label: "Other", one: "Item" };

/* ---------- names ---------- */
export function fullTitle(p) {
  const v = p.variant ? ` (${p.variant})` : "", sp = x => (x ? " " + x : "");
  switch (p.cat) {
    case "issues": return `${p.title}${sp(p.num)}${v}`;
    case "tpb": return `${p.title}${sp(p.vol)}${p.subtitle ? ": " + p.subtitle : ""}`;
    case "omnibus": return `${p.title}${p.subtitle ? ": " + p.subtitle : ""}`;
    case "manga": return `${p.title}${sp(p.vol)}`;
    case "funko": return `${p.title}${v}`;
    default: return String(p.title || "");
  }
}
export function metaLine(p, cats) {
  const join = (...xs) => xs.filter(Boolean).join(" · ");
  const pages = p.pages ? `${Number(p.pages).toLocaleString("en-US")} pages` : "";
  switch (p.cat) {
    case "issues": return join("Single issue", p.grade);
    case "graphic": return join("Graphic novel", pages);
    case "tpb": return join("Trade paperback", p.vol);
    case "omnibus": return join("Omnibus", pages);
    case "manga": return join("Manga", p.vol);
    case "funko": return join("Funko Pop", p.num);
    default: return catOf(cats, p.cat).one;
  }
}
export function stockWord(p) {
  if (p.stock <= 0) return "Sold out";
  if (p.stock <= 2) return `Only ${p.stock} left`;
  return `${p.stock} in stock`;
}
export function slug(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
}

/* ---------- search ----------
   "bat 14" finds Batman #14, "#14" and "14" match issue numbers exactly, and a typo like "batmn" still finds Batman
   (only when nothing matches exactly). Works on plain data so it can be tested in Node. */
export const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const wordsOf = s => norm(s).split(" ").filter(Boolean);
export const seriesKey = p => norm(p.title) + (p.vol ? "|" + norm(p.vol) : "");
export const isVariant = p => !!p.variant || (p.badges || []).includes("variant");
/* the words a comic can be found by, for searchItems */
export const searchWords = (p, cats) => [...new Set(wordsOf([fullTitle(p), p.title, p.num, p.vol, p.subtitle, p.variant, p.publisher, catOf(cats, p.cat).label].join(" ")))];

/* the save-for-later heart: drawn once per page (heartSprite) and referenced everywhere else */
export const HEART_PATH = "M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.7 3.7 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.3 0 5.4 3.2 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z";
export const heartSprite = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false"><symbol id="i-heart" viewBox="0 0 24 24"><path d="${HEART_PATH}"/></symbol></svg>`;
export const heartIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><use href="#i-heart"/></svg>`;

function closeEnough(a, b) { // edit distance of at most `limit`, counting a swapped pair of letters as one edit
  const limit = a.length <= 3 ? 0 : a.length <= 6 ? 1 : 2;
  if (Math.abs(a.length - b.length) > limit) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length] <= limit;
}
/* items: [{ words: string[], blurb: string }]. Returns { mode, flags } where flags[i] says whether item i matches.
   mode is "all" (no query), "exact", "blurb" (found in the description), "close" (typo-tolerant) or "none". */
export function searchItems(items, query) {
  const tokens = wordsOf(query);
  if (!tokens.length) return { mode: "all", flags: items.map(() => true) };
  const isNum = t => /^\d+$/.test(t);
  const strict = (it, t) => it.words.some(w => (isNum(t) ? w === t : w.startsWith(t)));
  const attempts = [
    ["exact", (it, t) => strict(it, t)],
    ["blurb", (it, t) => strict(it, t) || (!isNum(t) && it.blurb.includes(t))],
    ["close", (it, t) => strict(it, t) || (!isNum(t) && t.length >= 4 && it.words.some(w => w.length >= 4 && (closeEnough(t, w) || closeEnough(t, w.slice(0, t.length)))))]
  ];
  for (const [mode, test] of attempts) {
    const flags = items.map(it => tokens.every(t => test(it, t)));
    if (flags.some(Boolean)) return { mode, flags };
  }
  return { mode: "none", flags: items.map(() => false) };
}

/* ---------- opening hours ---------- */
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const hLabel = h => `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`;
export const hoursText = cfg => `${hLabel(cfg.openHour)} – ${hLabel(cfg.closeHour)}`;
export const hoursShort = cfg => `${cfg.openHour % 12 || 12}–${hLabel(cfg.closeHour)}`;

/* ---------- cover placeholder ----------
   Items without a photo get a typographic comic cover instead of a broken image. */
const PH_PALETTES = [
  { bg: "#F2C200", a: "#D3156C", ink: "#161918", light: "#FFF8E6" },
  { bg: "#0B7FB0", a: "#F7DC2D", ink: "#0D1B2A", light: "#EAF7FF" },
  { bg: "#C8135F", a: "#F7DC2D", ink: "#1A0710", light: "#FFF0F6" },
  { bg: "#16213D", a: "#F7DC2D", ink: "#080C18", light: "#F3F1E8" },
  { bg: "#E2412B", a: "#F7DC2D", ink: "#1B0A06", light: "#FFF4E8" },
  { bg: "#245E4A", a: "#F7DC2D", ink: "#0B1F18", light: "#F2EEE2" },
  { bg: "#3B2160", a: "#45BEEF", ink: "#120A1F", light: "#F4EEFF" }
];
function hash(str) { let h = 0; for (const ch of String(str)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return Math.abs(h); }

export function placeholderCover(p, extra = "") {
  const c = PH_PALETTES[hash(p.id || p.title) % PH_PALETTES.length];
  const title = String(p.title || "Untitled").toUpperCase();
  const style = `--ph-bg:${c.bg};--ph-a:${c.a};--ph-ink:${c.ink};--ph-light:${c.light};--ph-len:${Math.max(6, Math.min(title.length, 28))}`;
  // The words on a drawn cover are generated by CSS from data-t, like text printed on an image, so they
  // don't count as the link's own text (the link already has a full accessible name).
  const pub = esc(String(p.publisher || "Flickers Comics").toUpperCase());
  return `<span class="cover cover-ph${p.stock <= 0 ? " is-sold" : ""}" style="${style}">`
    + `<span class="ph-pub" data-t="${pub}"></span>`
    + `<span class="ph-title" data-t="${esc(title)}"></span>`
    + (p.num ? `<span class="ph-num" data-t="${esc(p.num)}"></span>` : "")
    + (p.stock <= 0 ? `<span class="sold-band" aria-hidden="true">Sold out</span>` : "")
    + extra + `</span>`;
}

/* A cover for the browser: `src` is the (relative) URL prefix for covers, `variants` the built sizes. */
export function coverHTML(p, { imgBase = "", lazy = true, sizes = "(min-width: 1100px) 200px, (min-width: 700px) 22vw, 45vw", priority = false } = {}) {
  if (!p.image) return placeholderCover(p);
  const name = coverName(p.image);
  const src = `${imgBase}img/covers/${name}`;
  const sold = p.stock <= 0;
  return `<span class="cover${sold ? " is-sold" : ""}"><img src="${src}-450.webp" srcset="${src}-300.webp 300w, ${src}-450.webp 450w, ${src}-600.webp 600w" sizes="${sizes}" width="300" height="450" alt=""${priority ? ' fetchpriority="high"' : lazy ? ' loading="lazy" decoding="async"' : ""}>${sold ? `<span class="sold-band" aria-hidden="true">Sold out</span>` : ""}</span>`;
}
/* "assets/covers/batman-423-muu6wx03.jpg" -> "batman-423-muu6wx03" */
export function coverName(path) { return String(path).split("/").pop().replace(/\.[a-z0-9]+$/i, ""); }
