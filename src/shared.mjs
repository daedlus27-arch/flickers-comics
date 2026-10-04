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
  return `<span class="cover cover-ph${p.stock <= 0 ? " is-sold" : ""}" style="${style}">`
    + `<span class="ph-pub">${esc(String(p.publisher || "Flickers Comics").toUpperCase())}</span>`
    + `<span class="ph-title">${esc(title)}</span>`
    + `<span class="ph-num">${esc(p.num || "")}</span>`
    + (p.stock <= 0 ? `<span class="sold-band" aria-hidden="true">Sold out</span>` : "")
    + extra + `</span>`;
}

/* A cover for the browser: `src` is the (relative) URL prefix for covers, `variants` the built sizes. */
export function coverHTML(p, { imgBase = "", lazy = true, sizes = "(min-width: 900px) 220px, 45vw", priority = false } = {}) {
  if (!p.image) return placeholderCover(p);
  const name = coverName(p.image);
  const src = `${imgBase}img/covers/${name}`;
  const sold = p.stock <= 0;
  return `<span class="cover${sold ? " is-sold" : ""}"><img src="${src}-400.webp" srcset="${src}-400.webp 400w, ${src}-600.webp 600w" sizes="${sizes}" width="400" height="600" alt=""${priority ? ' fetchpriority="high"' : lazy ? ' loading="lazy" decoding="async"' : ""}>${sold ? `<span class="sold-band" aria-hidden="true">Sold out</span>` : ""}</span>`;
}
/* "assets/covers/batman-423-muu6wx03.jpg" -> "batman-423-muu6wx03" */
export function coverName(path) { return String(path).split("/").pop().replace(/\.[a-z0-9]+$/i, ""); }
