/* Flickers Comics storefront. Stock and settings are in shop-data.js. */
(() => {
"use strict";

/* Settings and stock live in shop-data.js */
const CONFIG = window.FLICKERS_CONFIG;
const CATEGORIES = window.FLICKERS_CATEGORIES;
const PRODUCTS = window.FLICKERS_PRODUCTS;
const HERO_IDS = (window.FLICKERS_NEW_THIS_WEEK || []).filter(id => PRODUCTS.some(p => p.id === id)).slice(0, 3);
const GRADES = { "NM+": "Near Mint+", "NM": "Near Mint", "NM−": "Near Mint−", "VF": "Very Fine" };

/* ===================== helpers ===================== */
const $ = id => document.getElementById(id);
PRODUCTS.forEach(p => { p.stock = Math.max(0, Math.floor(Number(p.stock) || 0)); p.price = Math.max(0, Number(p.price) || 0); });
const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const escLines = s => esc(s).replace(/\r?\n/g, "<br>");
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const f1 = n => Math.round(n * 10) / 10;
const catOf = key => CATEGORIES.find(c => c.key === key) || { key, label: "Other", one: "Item" };
const firstName = s => String(s).trim().split(/\s+/)[0] || "";
const focusFirst = (root, ...sels) => { for (const s of sels) { const el = root.querySelector(s); if (el) { el.focus(); return; } } };

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

function fullTitle(p) {
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
function metaLine(p) {
  const join = (...xs) => xs.filter(Boolean).join(" · ");
  const pages = p.pages ? `${Number(p.pages).toLocaleString("en-US")} pages` : "";
  switch (p.cat) {
    case "issues": return join("Single issue", p.grade);
    case "graphic": return join("Graphic novel", pages);
    case "tpb": return join("Trade paperback", p.vol);
    case "omnibus": return join("Omnibus", pages);
    case "manga": return join("Manga", p.vol);
    case "funko": return join("Funko Pop", p.num);
    default: return catOf(p.cat).one;
  }
}
function stockWord(p) {
  if (p.stock <= 0) return "Sold out";
  if (p.stock <= 2) return `Only ${p.stock} left`;
  return `${p.stock} in stock`;
}

/* ===================== hours ===================== */
const hLabel = h => `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`;
const hoursText = () => `${hLabel(CONFIG.openHour)} – ${hLabel(CONFIG.closeHour)}`;
const hoursShort = () => `${CONFIG.openHour % 12 || 12}–${hLabel(CONFIG.closeHour)}`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
function ymdAdd(o, n) { const t = new Date(Date.UTC(o.y, o.m - 1, o.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
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
  $("hoursStatus").classList.toggle("is-open", st.open);
  $("hoursStatusText").textContent = st.text;
  const today = shopNow().wd;
  $("week").innerHTML = DAYS.map(d => `<li class="day${d === today ? " is-today" : ""}"><b>${d}</b><span>${hoursShort()}</span>${d === today ? `<em class="sr-only">today</em>` : ""}</li>`).join("");
}

/* ===================== cover art (generated, swap for real photos via image:) ===================== */
const PAL = [
  { bg: "#F2C200", bg2: "#F7DC2D", a: "#D3156C", b: "#0B7FB0", ink: "#161918", light: "#FFF8E6" },
  { bg: "#0B7FB0", bg2: "#1497CF", a: "#F7DC2D", b: "#D3156C", ink: "#0D1B2A", light: "#EAF7FF" },
  { bg: "#C8135F", bg2: "#E5307A", a: "#F7DC2D", b: "#45BEEF", ink: "#1A0710", light: "#FFF0F6" },
  { bg: "#16213D", bg2: "#2A3D69", a: "#F7DC2D", b: "#F2643A", ink: "#080C18", light: "#F3F1E8" },
  { bg: "#E2412B", bg2: "#F2643A", a: "#F7DC2D", b: "#16213D", ink: "#1B0A06", light: "#FFF4E8" },
  { bg: "#245E4A", bg2: "#2F7A5F", a: "#F7DC2D", b: "#EDE6D3", ink: "#0B1F18", light: "#F2EEE2" },
  { bg: "#E9E2CF", bg2: "#F6F1E3", a: "#D3156C", b: "#16213D", ink: "#161918", light: "#FFFDF6" },
  { bg: "#3B2160", bg2: "#563187", a: "#45BEEF", b: "#FF4D9B", ink: "#120A1F", light: "#F4EEFF" }
];
const F_COMIC = "Bangers, Anton, Impact, sans-serif";
const F_DISPLAY = "Anton, Impact, sans-serif";
const F_BODY = "Archivo, Arial, sans-serif";

function rng(seed) {
  let a = 0;
  for (const ch of seed) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sky = (U, top, bottom) => `<defs><linearGradient id="sky${U}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="200" height="300" fill="url(#sky${U})"/>`;
function stars(r, n, color, maxY) { let s = ""; for (let i = 0; i < n; i++) s += `<circle cx="${f1(r() * 200)}" cy="${f1(r() * maxY)}" r="${f1(.6 + r() * 1.1)}" fill="${color}" opacity="${f1(.5 + r() * .5)}"/>`; return s; }
function buildings(c, r, { base = 300, minH = 60, maxH = 170, windows = true } = {}) {
  let s = "", x = -6;
  while (x < 206) {
    const w = 16 + r() * 20, h = minH + r() * (maxH - minH), y = base - h;
    s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h + 2)}" fill="${c.ink}"/>`;
    if (windows) for (let wy = y + 8; wy < base - 8; wy += 11) for (let wx = x + 4; wx < x + w - 5; wx += 7) if (r() < .28) s += `<rect x="${f1(wx)}" y="${f1(wy)}" width="3" height="5" fill="${c.a}"/>`;
    x += w + 1 + r() * 3;
  }
  return s;
}
function wavePath(y0, amp, freq, ph) { let d = `M0,${f1(y0 + Math.sin(ph) * amp)}`; for (let x = 8; x <= 200; x += 8) d += ` L${x},${f1(y0 + Math.sin(x / freq + ph) * amp)}`; return d + " L200,300 L0,300 Z"; }
function bez(p0, p1, p2, p3, t) { const u = 1 - t; return [0, 1].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); }
function hexPts(cx, cy, R) { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); p.push(`${f1(cx + R * Math.cos(a))},${f1(cy + R * Math.sin(a))}`); } return p.join(" "); }
function burstPts(cx, cy, rIn, rOut, n, rot = 0) { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + Math.PI * i / n; const R = i % 2 ? rIn : rOut; p.push(`${f1(cx + R * Math.cos(a))},${f1(cy + R * Math.sin(a))}`); } return p.join(" "); }

const MOTIFS = {
  skyline(c, r, U) {
    return sky(U, c.ink, c.bg) + stars(r, 26, c.light, 150) + `<circle cx="${f1(130 + r() * 40)}" cy="${f1(118 + r() * 20)}" r="24" fill="${c.light}" opacity=".92"/>` + buildings(c, r, { minH: 70, maxH: 175 });
  },
  beam(c, r, U) {
    let s = sky(U, c.ink, c.bg2) + stars(r, 20, c.light, 140);
    s += `<polygon points="52,262 4,0 60,0" fill="${c.light}" opacity=".16"/><polygon points="64,262 96,0 152,0" fill="${c.light}" opacity=".12"/>`;
    const cx = 140, cy = 194, R = 42;
    s += `<line x1="${cx}" y1="${cy}" x2="${cx - 30}" y2="262" stroke="${c.ink}" stroke-width="4"/><line x1="${cx}" y1="${cy}" x2="${cx + 30}" y2="262" stroke="${c.ink}" stroke-width="4"/>`;
    const rim = [];
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; rim.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    rim.forEach(([x, y]) => { s += `<line x1="${cx}" y1="${cy}" x2="${f1(x)}" y2="${f1(y)}" stroke="${c.a}" stroke-width="1.5"/>`; });
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${c.a}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="5" fill="${c.a}"/>`;
    rim.forEach(([x, y]) => { s += `<rect x="${f1(x - 4)}" y="${f1(y - 3)}" width="8" height="7" rx="1.5" fill="${c.b}" stroke="${c.ink}" stroke-width="1"/>`; });
    s += `<rect y="258" width="200" height="7" fill="${c.ink}"/>`;
    for (let x = 4; x < 200; x += 17) s += `<rect x="${x}" y="264" width="3" height="36" fill="${c.ink}"/>`;
    s += `<rect y="272" width="200" height="28" fill="${c.ink}" opacity=".55"/>`;
    return s;
  },
  lightning(c, r, U) {
    let s = sky(U, c.bg2, c.bg);
    for (let i = 0; i < 5; i++) s += `<ellipse cx="${f1(r() * 200)}" cy="${f1(110 + r() * 40)}" rx="${f1(34 + r() * 24)}" ry="${f1(12 + r() * 6)}" fill="${c.ink}" opacity=".3"/>`;
    s += `<polygon points="0,236 34,196 62,214 104,168 140,206 168,190 200,214 200,300 0,300" fill="${c.ink}" opacity=".8"/>`;
    s += `<rect y="252" width="200" height="48" fill="${c.ink}"/>`;
    s += `<polygon points="126,96 88,176 112,176 80,256 150,154 122,154 150,96" fill="${c.a}" stroke="${c.ink}" stroke-width="3.5" stroke-linejoin="round"/>`;
    return s;
  },
  waves(c, r, U) {
    let s = sky(U, c.ink, c.bg) + stars(r, 22, c.light, 150) + `<circle cx="58" cy="132" r="18" fill="${c.light}" opacity=".9"/>`;
    s += `<circle cx="112" cy="250" r="46" fill="${c.a}" opacity=".55"/>`;
    const cols = [c.b, c.bg2, c.b, c.bg2, c.b, c.bg2];
    for (let i = 0; i < 6; i++) s += `<path d="${wavePath(188 + i * 18, 3 + r() * 4, 14 + r() * 8, r() * 6)}" fill="${cols[i]}" opacity="${f1(.55 + i * .07)}"/>`;
    return s;
  },
  tentacle(c, r, U) {
    let s = sky(U, c.bg2, c.bg) + `<circle cx="150" cy="128" r="30" fill="${c.a}" opacity=".9"/>`;
    s += `<path d="${wavePath(226, 3, 12, 1)}" fill="${c.ink}" opacity=".55"/>`;
    [[36, 1], [104, -1], [166, 1]].forEach(([x0, dir], i) => {
      const top = 120 + r() * 40 + i * 6;
      const p0 = [x0, 300], p1 = [x0 + dir * 40, 240], p2 = [x0 - dir * 36, 190], p3 = [f1(x0 + dir * 20), f1(top)];
      s += `<path d="M${p0} C${p1} ${p2} ${p3}" fill="none" stroke="${c.b}" stroke-width="${16 - i * 2}" stroke-linecap="round"/>`;
      for (let t = .15; t < .92; t += .11) { const [x, y] = bez(p0, p1, p2, p3, t); s += `<circle cx="${f1(x + dir * 3)}" cy="${f1(y)}" r="2.4" fill="${c.light}"/>`; }
    });
    s += `<path d="${wavePath(262, 3, 10, 2)}" fill="${c.ink}" opacity=".8"/>`;
    return s;
  },
  ghost(c, r, U) {
    let s = sky(U, c.ink, c.bg) + stars(r, 18, c.light, 130) + `<circle cx="134" cy="128" r="40" fill="${c.light}" opacity=".9"/>`;
    for (let i = 0; i < 14; i++) { const x = i * 15 - 4 + r() * 6, h = 40 + r() * 40; s += `<polygon points="${f1(x)},${f1(250 - h)} ${f1(x - 12)},250 ${f1(x + 12)},250" fill="${c.ink}" opacity=".55"/>`; }
    s += `<rect y="236" width="200" height="16" fill="${c.light}" opacity=".16"/>`;
    s += `<g transform="translate(62 150)" opacity=".92"><path d="M0,42 C0,16 12,0 28,0 C44,0 56,16 56,42 L56,80 L49,73 L42,80 L35,73 L28,80 L21,73 L14,80 L7,73 L0,80 Z" fill="${c.light}"/><circle cx="20" cy="34" r="4.5" fill="${c.ink}"/><circle cx="36" cy="34" r="4.5" fill="${c.ink}"/><ellipse cx="28" cy="50" rx="4" ry="6" fill="${c.ink}"/></g>`;
    for (let i = 0; i < 12; i++) { const x = i * 18 - 6 + r() * 6, h = 60 + r() * 50; s += `<polygon points="${f1(x)},${f1(300 - h)} ${f1(x - 16)},300 ${f1(x + 16)},300" fill="${c.ink}"/>`; }
    s += `<rect y="270" width="200" height="12" fill="${c.light}" opacity=".12"/>`;
    return s;
  },
  saints(c, r) {
    let s = `<rect width="200" height="300" fill="${c.bg}"/><polygon points="${burstPts(100, 150, 40, 230, 18)}" fill="${c.bg2}"/>`;
    s += `<circle cx="100" cy="150" r="50" fill="${c.a}"/><circle cx="100" cy="150" r="38" fill="${c.bg}"/><circle cx="100" cy="150" r="30" fill="${c.a}" opacity=".35"/>`;
    return s + buildings(c, r, { minH: 50, maxH: 140 });
  },
  sunset(c, r, U) {
    let s = sky(U, c.bg2, c.bg);
    const cx = 100, cy = 178, R = 64;
    s += `<clipPath id="sun${U}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><g clip-path="url(#sun${U})"><rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" fill="${c.a}"/>`;
    for (let k = 0; k < 6; k++) s += `<rect x="${cx - R}" y="${f1(cy + 4 + k * 10)}" width="${2 * R}" height="${f1(2 + k * 1.4)}" fill="${c.bg}"/>`;
    s += `</g><rect y="206" width="200" height="94" fill="${c.b}"/>`;
    for (let k = 0; k < 7; k++) { const w = 120 - k * 14; s += `<rect x="${f1(100 - w / 2)}" y="${214 + k * 11}" width="${f1(w)}" height="3" fill="${c.a}" opacity="${f1(.7 - k * .08)}"/>`; }
    s += `<path d="M40,300 C46,252 36,214 56,176" fill="none" stroke="${c.ink}" stroke-width="7" stroke-linecap="round"/>`;
    [[18, 166], [24, 146], [56, 140], [86, 152], [90, 176], [28, 188]].forEach(([x, y]) => { s += `<path d="M56,176 Q${f1((56 + x) / 2)},${f1(Math.min(y, 176) - 14)} ${x},${y}" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`; });
    return s;
  },
  diner(c, r, U) {
    let s = sky(U, c.ink, c.bg) + stars(r, 30, c.light, 170);
    s += `<rect y="206" width="200" height="94" fill="${c.bg2}"/><polygon points="94,206 106,206 196,300 4,300" fill="${c.ink}"/>`;
    for (let k = 0; k < 6; k++) { const y = 212 + k * k * 3.2, h = 3 + k * 2.2, w = 1.5 + k * .9; s += `<rect x="${f1(100 - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${c.a}"/>`; }
    s += `<rect x="16" y="176" width="70" height="32" fill="${c.light}" stroke="${c.ink}" stroke-width="2"/><rect x="12" y="170" width="78" height="8" fill="${c.b}" stroke="${c.ink}" stroke-width="2"/>`;
    for (let k = 0; k < 4; k++) s += `<rect x="${22 + k * 16}" y="184" width="11" height="12" fill="${c.a}" stroke="${c.ink}" stroke-width="1.5"/>`;
    s += `<rect x="150" y="128" width="4" height="80" fill="${c.ink}"/><rect x="120" y="102" width="64" height="34" rx="6" fill="${c.a}" stroke="${c.ink}" stroke-width="3"/><text x="152" y="128" text-anchor="middle" font-family="${F_COMIC}" font-size="26" fill="${c.ink}">EAT</text>`;
    return s;
  },
  mountains(c, r, U) {
    let s = sky(U, c.bg2, c.bg) + `<circle cx="62" cy="128" r="28" fill="${c.a}"/>`;
    s += `<polygon points="0,200 30,160 60,182 100,130 136,176 170,150 200,170 200,300 0,300" fill="${c.light}" opacity=".35"/>`;
    s += `<polygon points="0,232 40,196 76,220 118,182 160,222 200,204 200,300 0,300" fill="${c.b}"/><rect y="252" width="200" height="48" fill="${c.ink}"/>`;
    s += `<g fill="${c.ink}"><rect x="146" y="190" width="10" height="66" rx="5"/><rect x="134" y="206" width="8" height="24" rx="4"/><rect x="134" y="224" width="16" height="7" rx="3.5"/><rect x="160" y="200" width="8" height="22" rx="4"/><rect x="152" y="216" width="16" height="7" rx="3.5"/></g>`;
    return s;
  },
  hex(c, r, U) {
    let s = sky(U, c.ink, c.bg) + stars(r, 30, c.light, 300);
    for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) { const R = 13, cx = col * R * 1.732 + (row % 2 ? R * .866 : 0) - 4, cy = row * R * 1.5 + 6; s += `<polygon points="${hexPts(cx, cy, R - 1)}" fill="none" stroke="${c.light}" stroke-width=".8" opacity=".16"/>`; }
    s += `<circle cx="104" cy="176" r="46" fill="${c.b}"/><circle cx="90" cy="162" r="14" fill="${c.light}" opacity=".25"/>`;
    s += `<ellipse cx="104" cy="176" rx="78" ry="15" fill="none" stroke="${c.a}" stroke-width="4" transform="rotate(-14 104 176)"/>`;
    return s;
  },
  atom(c) {
    let s = `<rect width="200" height="300" fill="${c.bg}"/><polygon points="${burstPts(100, 170, 46, 210, 16, .2)}" fill="${c.bg2}"/>`;
    [0, 60, 120].forEach(a => { s += `<ellipse cx="100" cy="170" rx="74" ry="24" fill="none" stroke="${c.ink}" stroke-width="5" transform="rotate(${a} 100 170)"/>`; });
    s += `<circle cx="100" cy="170" r="15" fill="${c.a}" stroke="${c.ink}" stroke-width="3"/>`;
    [[174, 170], [63, 106], [63, 234]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="6" fill="${c.light}" stroke="${c.ink}" stroke-width="2"/>`; });
    return s;
  },
  blade(c, r, U) {
    let s = sky(U, c.ink, c.bg);
    for (let i = 0; i < 46; i++) { const x = r() * 220, y = r() * 300; s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - 5)}" y2="${f1(y + 16)}" stroke="${c.light}" stroke-width="1" opacity=".22"/>`; }
    s += `<circle cx="128" cy="150" r="48" fill="none" stroke="${c.a}" stroke-width="16" opacity=".22"/><circle cx="128" cy="150" r="48" fill="none" stroke="${c.a}" stroke-width="5"/>`;
    s += buildings(c, r, { minH: 30, maxH: 90 });
    s += `<g transform="rotate(-32 100 200)"><rect x="6" y="196" width="160" height="7" fill="${c.light}"/><rect x="6" y="196" width="160" height="2" fill="#fff" opacity=".7"/><rect x="164" y="190" width="6" height="19" rx="1" fill="${c.a}"/><rect x="170" y="196" width="44" height="7" fill="${c.ink}" stroke="${c.light}" stroke-width=".8"/></g>`;
    return s;
  },
  bowl(c) {
    let s = `<rect width="200" height="300" fill="${c.bg}"/><polygon points="${burstPts(100, 190, 60, 190, 14)}" fill="${c.bg2}"/>`;
    [70, 100, 130].forEach(x => { s += `<path d="M${x},196 C${x - 14},176 ${x + 14},158 ${x},138 S${x - 12},100 ${x + 4},80" fill="none" stroke="${c.light}" stroke-width="6" stroke-linecap="round" opacity=".8"/>`; });
    s += `<circle cx="95" cy="128" r="2.6" fill="${c.ink}"/><circle cx="106" cy="128" r="2.6" fill="${c.ink}"/>`;
    s += `<path d="M28,204 L172,204 C172,252 140,272 100,272 C60,272 28,252 28,204 Z" fill="${c.a}" stroke="${c.ink}" stroke-width="3"/>`;
    s += `<ellipse cx="100" cy="204" rx="72" ry="11" fill="${c.b}" stroke="${c.ink}" stroke-width="3"/><path d="M52,204 q12,-8 24,0 t24,0 t24,0 t24,0" fill="none" stroke="${c.light}" stroke-width="3"/>`;
    s += `<line x1="122" y1="200" x2="186" y2="118" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/><line x1="132" y1="202" x2="194" y2="128" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`;
    return s + `<rect y="272" width="200" height="28" fill="${c.ink}" opacity=".3"/>`;
  },
  mecha(c, r) {
    let s = `<rect width="200" height="300" fill="${c.bg}"/>`;
    for (let i = 0; i < 16; i++) { const y = 100 + r() * 190, w = 30 + r() * 90; s += `<rect x="0" y="${f1(y)}" width="${f1(w)}" height="3" fill="${c.light}" opacity=".35"/>`; }
    s += `<g stroke="${c.ink}" stroke-width="3" stroke-linejoin="round"><rect x="124" y="148" width="42" height="40" fill="#C9A06B"/><line x1="124" y1="168" x2="166" y2="168" stroke-width="2"/><rect x="78" y="208" width="14" height="40" rx="4" fill="${c.light}"/><rect x="108" y="208" width="14" height="40" rx="4" fill="${c.light}"/><rect x="70" y="156" width="60" height="58" rx="10" fill="${c.light}"/><rect x="84" y="170" width="32" height="20" rx="4" fill="${c.b}"/><rect x="54" y="160" width="14" height="40" rx="6" fill="${c.light}"/><rect x="76" y="110" width="48" height="42" rx="12" fill="${c.light}"/><rect x="82" y="122" width="36" height="13" rx="6.5" fill="${c.ink}"/><line x1="100" y1="110" x2="100" y2="96"/></g>`;
    s += `<rect x="88" y="125" width="10" height="7" rx="3" fill="${c.a}"/><circle cx="100" cy="94" r="5" fill="${c.a}" stroke="${c.ink}" stroke-width="2"/>`;
    return s + `<rect x="72" y="246" width="24" height="10" rx="3" fill="${c.ink}"/><rect x="104" y="246" width="24" height="10" rx="3" fill="${c.ink}"/>`;
  },
  torii(c, r, U) {
    let s = sky(U, c.bg, c.bg2) + stars(r, 20, c.light, 140) + `<circle cx="100" cy="118" r="52" fill="${c.light}" opacity=".92"/>`;
    s += `<g fill="${c.b}" stroke="${c.ink}" stroke-width="2.5" stroke-linejoin="round"><rect x="60" y="150" width="11" height="118"/><rect x="129" y="150" width="11" height="118"/><rect x="48" y="166" width="104" height="9"/><rect x="95" y="150" width="10" height="16"/><path d="M30,138 Q100,126 170,138 L168,152 Q100,142 32,152 Z"/></g>`;
    s += `<rect y="266" width="200" height="34" fill="${c.ink}"/><rect x="40" y="260" width="120" height="8" fill="${c.ink}"/><rect x="56" y="254" width="88" height="8" fill="${c.ink}"/>`;
    for (let i = 0; i < 10; i++) s += `<circle cx="${f1(r() * 200)}" cy="${f1(170 + r() * 80)}" r="1.8" fill="${c.a}"/>`;
    return s;
  }
};

// Text on the covers is measured with whichever font actually loaded, so titles always fit.
const measureCtx = (() => { try { return document.createElement("canvas").getContext("2d"); } catch (e) { return null; } })();
function textW(str, size, family, weight = "400", style = "normal") {
  if (!measureCtx) return str.length * size * .6;
  measureCtx.font = `${style} ${weight} ${size}px ${family}`;
  return measureCtx.measureText(str).width;
}
function shrink(str, size, maxW, family, weight = "400", ls = 0, style = "normal") {
  const w = textW(str, size, family, weight, style) + ls * str.length;
  return w > maxW ? Math.floor(size * maxW / w * 10) / 10 : size;
}
function fit(text, maxW, maxSize, family, two = true, ls = 0) {
  const T = text.toUpperCase();
  const sizeFor = s => Math.min(maxSize, (maxW - ls * s.length) / (textW(s, 100, family) / 100));
  let lines = [T], size = sizeFor(T);
  const words = T.split(" ");
  if (two && words.length > 1 && size < maxSize * .66) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" "), s2 = Math.min(sizeFor(a), sizeFor(b));
      if (!best || s2 > best.s) best = { a, b, s: s2 };
    }
    if (best.s > size) { lines = [best.a, best.b]; size = best.s; }
  }
  return { lines, size: Math.floor(size * 10) / 10 };
}
function txt(str, x, y, size, o) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${o.family}" font-size="${size}" fill="${o.fill}" text-anchor="${o.anchor || "middle"}"` +
    (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw}" paint-order="stroke" stroke-linejoin="round"` : "") +
    (o.ls ? ` letter-spacing="${o.ls}"` : "") + (o.weight ? ` font-weight="${o.weight}"` : "") + (o.style ? ` font-style="${o.style}"` : "") +
    (o.op ? ` opacity="${o.op}"` : "") + (o.transform ? ` transform="${o.transform}"` : "") + `>${esc(str)}</text>`;
}
const initials = s => s.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
function halftone(U, c, op) {
  return `<defs><pattern id="ht${U}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="${c.ink}"/></pattern><linearGradient id="hf${U}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="hm${U}"><rect width="200" height="300" fill="url(#hf${U})"/></mask></defs><rect width="200" height="300" fill="url(#ht${U})" mask="url(#hm${U})" opacity="${op}"/>`;
}
function barcode(c, r, x, y, label) {
  let s = `<rect x="${x}" y="${y}" width="40" height="34" fill="#fff" stroke="${c.ink}" stroke-width="1"/>` + txt(label, x + 4, y + 9, 8, { family: F_BODY, fill: "#161918", weight: 800, anchor: "start" });
  let bx = x + 4;
  while (bx < x + 35) { const w = r() < .5 ? 1 : 2; s += `<rect x="${bx}" y="${y + 12}" width="${w}" height="15" fill="#161918"/>`; bx += w + (r() < .5 ? 1 : 2); }
  return s + `<rect x="${x + 4}" y="${y + 29}" width="31" height="1.5" fill="#161918" opacity=".5"/>`;
}

function frameIssue(p, c, U, art, r) {
  let s = art + halftone(U, c, .45);
  const pub = String(p.publisher || "Flickers Comics").toUpperCase() + (p.variant ? " · VARIANT" : "");
  s += `<rect width="200" height="20" fill="${c.ink}" opacity=".88"/>` + txt(pub, 100, 13.5, shrink(pub, 7, 186, F_BODY, "800", 2), { family: F_BODY, fill: c.light, weight: 800, ls: 2 });
  const T = fit(p.title, 180, 46, F_COMIC, true, .5);
  let y = 22 + T.size * .84;
  T.lines.forEach(l => { s += txt(l, 100, y, T.size, { family: F_COMIC, fill: c.a, stroke: c.ink, sw: f1(Math.max(3, T.size * .13)), ls: .5 }); y += T.size * .9; });
  if (p.tagline) {
    const t = p.tagline.toUpperCase(), fs = shrink(t, 8, 166, F_BODY, "800", 0, "italic"), w = Math.min(182, textW(t, fs, F_BODY, "800", "italic") + 16);
    s += `<rect x="${f1(190 - w)}" y="232" width="${f1(w)}" height="18" fill="#F7DC2D" stroke="${c.ink}" stroke-width="1.5"/>`;
    s += `<text x="${f1(190 - w / 2)}" y="244" text-anchor="middle" font-family="${F_BODY}" font-weight="800" font-style="italic" font-size="${fs}" fill="#161918">${esc(t)}</text>`;
  }
  return s + barcode(c, r, 10, 256, p.num || "#1");
}
function frameTPB(p, c, U, art) {
  let s = art + halftone(U, c, .35);
  s += `<circle cx="20" cy="20" r="12" fill="${c.light}" stroke="${c.ink}" stroke-width="2"/>` + txt(initials(p.publisher || "Flickers Comics"), 20, 24, 10, { family: F_DISPLAY, fill: c.ink });
  s += `<rect y="218" width="200" height="82" fill="${c.ink}"/><rect y="218" width="200" height="4" fill="${c.a}"/>`;
  const T = fit(p.title, 182, 26, F_DISPLAY, false, .5);
  s += txt(T.lines[0], 100, 250, T.size, { family: F_DISPLAY, fill: c.light, ls: .5 });
  const sub = [p.vol, p.subtitle].filter(Boolean).join(" · ").toUpperCase(), col = String(p.collects || "").toUpperCase();
  s += txt(sub, 100, 268, shrink(sub, 8.5, 184, F_BODY, "800", 1.2), { family: F_BODY, fill: c.a, weight: 800, ls: 1.2 });
  return s + txt(col, 100, 285, shrink(col, 7, 184, F_BODY, "600", 1.5), { family: F_BODY, fill: c.light, weight: 600, ls: 1.5, op: .75 });
}
function frameGraphic(p, c, U, art) {
  let s = art + `<defs><linearGradient id="gn${U}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.ink}" stop-opacity="0"/><stop offset="1" stop-color="${c.ink}" stop-opacity=".92"/></linearGradient></defs><rect y="168" width="200" height="132" fill="url(#gn${U})"/>`;
  const T = fit(p.title, 168, 32, F_DISPLAY, true, .5), lh = T.size * 1.02;
  let y = 282 - (T.lines.length - 1) * lh;
  const pub = String(p.publisher || "Flickers Comics").toUpperCase();
  s += txt(pub, 16, y - T.size - 4, shrink(pub, 7, 168, F_BODY, "800", 2), { family: F_BODY, fill: c.a, weight: 800, ls: 2, anchor: "start" });
  T.lines.forEach(l => { s += txt(l, 16, y, T.size, { family: F_DISPLAY, fill: c.light, anchor: "start", ls: .5 }); y += lh; });
  return s + `<rect x="6" y="6" width="188" height="288" fill="none" stroke="${c.light}" stroke-width="2" opacity=".85"/>`;
}
function frameOmnibus(p, c, U, art) {
  let s = `<rect width="200" height="300" fill="#121413"/><rect x="10" y="10" width="180" height="280" fill="none" stroke="${c.a}" stroke-width="2"/><rect x="15" y="15" width="170" height="270" fill="none" stroke="${c.a}" stroke-width=".8"/>`;
  s += txt("OMNIBUS", 100, 42, 15, { family: F_DISPLAY, fill: c.a, ls: 6 });
  s += `<clipPath id="om${U}"><rect x="26" y="54" width="148" height="148"/></clipPath><g clip-path="url(#om${U})"><g transform="translate(26 17) scale(.74)">${art}</g></g><rect x="26" y="54" width="148" height="148" fill="none" stroke="${c.a}" stroke-width="2"/>`;
  const T = fit(p.title, 156, 22, F_DISPLAY, true, .5);
  let y = 230;
  T.lines.forEach(l => { s += txt(l, 100, y, T.size, { family: F_DISPLAY, fill: "#F3F1EA", ls: .5 }); y += T.size * 1.02; });
  if (p.subtitle && !/omnibus/i.test(p.subtitle)) { const sub = p.subtitle.toUpperCase(); s += txt(sub, 100, y + 2, shrink(sub, 8, 156, F_BODY, "700", 1.5), { family: F_BODY, fill: "#F3F1EA", weight: 700, ls: 1.5, op: .8 }); y += 12; }
  const col = (p.collects || "").toUpperCase();
  return s + txt(col, 100, Math.min(278, Math.max(y + 4, 272)), shrink(col, 7, 156, F_BODY, "800", 1.8), { family: F_BODY, fill: c.a, weight: 800, ls: 1.8 });
}
function frameManga(p, c, U, art) {
  let s = `<rect width="200" height="300" fill="#FBFAF5"/><clipPath id="mg${U}"><rect x="12" y="12" width="148" height="226"/></clipPath><g clip-path="url(#mg${U})"><g transform="translate(7 6.5) scale(.79)">${art}</g></g><rect x="12" y="12" width="148" height="226" fill="none" stroke="#161918" stroke-width="2"/>`;
  s += `<rect x="166" y="12" width="24" height="226" fill="${c.a}" stroke="#161918" stroke-width="2"/>`;
  const T = fit(p.title, 206, 17, F_DISPLAY, false, 1);
  s += txt(T.lines[0], 0, 0, T.size, { family: F_DISPLAY, fill: "#161918", ls: 1, transform: `translate(${f1(178 - T.size * .36)} 125) rotate(90)` });
  s += txt("VOL.", 14, 258, 8, { family: F_BODY, fill: "#161918", weight: 800, ls: 1.5, anchor: "start" });
  s += txt((p.vol || "").replace(/[^0-9]/g, ""), 13, 292, 40, { family: F_DISPLAY, fill: "#161918", anchor: "start" });
  const pub = String(p.publisher || "Flickers Comics").toUpperCase();
  return s + `<rect x="168" y="270" width="20" height="20" fill="${c.b}"/>` + txt(pub, 162, 286, shrink(pub, 6.5, 112, F_BODY, "800", 1), { family: F_BODY, fill: "#161918", weight: 800, ls: 1, anchor: "end" });
}
function frameFunko(p, c, U, art) {
  let s = `<rect width="200" height="300" fill="${c.bg}"/><rect width="12" height="300" fill="#000" opacity=".2"/><rect x="12" width="188" height="42" fill="${c.ink}"/>` + txt("VINYL FIGURE", 106, 26, 10.5, { family: F_BODY, fill: c.a, weight: 800, ls: 3 });
  s += `<clipPath id="fk${U}"><rect x="28" y="54" width="160" height="184" rx="18"/></clipPath><rect x="28" y="54" width="160" height="184" rx="18" fill="${c.light}"/><g clip-path="url(#fk${U})"><g transform="translate(28 26) scale(.8)">${art}</g><polygon points="28,54 92,54 28,170" fill="#fff" opacity=".16"/></g><rect x="28" y="54" width="160" height="184" rx="18" fill="none" stroke="${c.ink}" stroke-width="3"/>`;
  s += `<rect x="12" y="248" width="188" height="52" fill="${c.ink}"/>`;
  const T = fit(p.title, 164, 20, F_DISPLAY, false, .5);
  s += txt(T.lines[0], 106, 272, T.size, { family: F_DISPLAY, fill: "#F3F1EA", ls: .5 });
  const line = [p.num, p.variant].filter(Boolean).join(" · ").toUpperCase();
  return s + txt(line, 106, 290, shrink(line, 7.5, 170, F_BODY, "800", 1.5), { family: F_BODY, fill: c.a, weight: 800, ls: 1.5 });
}

const coverCache = new Map();
let uidCounter = 0;
function buildCover(p) {
  const r = rng(String(p.id)), U = "__U__", look = p.art || {};
  const palIndex = Number.isInteger(look.pal) ? look.pal : Math.floor(r() * PAL.length);
  const motifs = Object.keys(MOTIFS), c = PAL[Math.abs(palIndex) % PAL.length];
  const art = (MOTIFS[look.motif] || MOTIFS[motifs[Math.floor(r() * motifs.length)]])(c, r, U);
  const frames = { issues: frameIssue, tpb: frameTPB, graphic: frameGraphic, omnibus: frameOmnibus, manga: frameManga, funko: frameFunko };
  const body = (frames[p.cat] || frameGraphic)(p, c, U, art, r);
  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
}
function coverArt(p) {
  if (p.image) return `<img src="${esc(p.image)}" alt="" loading="lazy">`;
  if (!coverCache.has(p.id)) coverCache.set(p.id, buildCover(p));
  const uid = "c" + (++uidCounter);
  return coverCache.get(p.id).split("__U__").join(uid);
}
const coverHTML = (p, extra = "") => `<span class="cover${p.stock <= 0 ? " is-sold" : ""}">${coverArt(p)}${p.stock <= 0 ? `<span class="sold-band" aria-hidden="true">Sold out</span>` : ""}${extra}</span>`;

/* ===================== cart state ===================== */
const CART_KEY = "flickers-cart-v1";
function sanitizeCart(raw) {
  const out = {};
  if (raw && typeof raw === "object") for (const [id, q] of Object.entries(raw)) {
    const p = byId[id], n = Math.floor(Number(q));
    if (p && p.stock > 0 && n > 0) out[id] = Math.min(n, p.stock);
  }
  return out;
}
let cart = sanitizeCart(store.get(CART_KEY, {}));
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
const state = { cat: "all", q: "", sort: "featured" };
const gridEl = $("grid");

function visibleProducts() {
  let list = PRODUCTS.filter(p => state.cat === "all" || p.cat === state.cat);
  const q = state.q.trim().toLowerCase();
  if (q) list = list.filter(p => [fullTitle(p), p.publisher, catOf(p.cat).label, p.blurb].join(" ").toLowerCase().includes(q));
  if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (state.sort === "title") list.sort((a, b) => fullTitle(a).localeCompare(fullTitle(b)));
  else list.sort((a, b) => (b.stock > 0) - (a.stock > 0));
  return list;
}
function stickerHTML(p) {
  const b = p.badges || [];
  if (p.stock <= 0) return "";
  if (b.includes("variant")) return `<span class="sticker sticker-variant" aria-hidden="true">Variant</span>`;
  if (b.includes("exclusive")) return `<span class="sticker sticker-exclusive" aria-hidden="true">Exclusive</span>`;
  if (b.includes("new")) return `<span class="sticker sticker-new" aria-hidden="true">New!</span>`;
  return "";
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
function cardHTML(p) {
  const t = fullTitle(p), st = addState(p);
  const extras = [];
  if ((p.badges || []).includes("new") && p.stock > 0) extras.push("new");
  if (p.staff) extras.push("staff pick");
  return `<article class="card" data-id="${p.id}">
    <button type="button" class="cover-btn" data-open="${p.id}" aria-label="${esc(t)}${extras.length ? ", " + extras.join(", ") : ""}. View details">
      ${coverHTML(p)}${stickerHTML(p)}${p.staff ? `<span class="talker" aria-hidden="true">Staff pick!</span>` : ""}
    </button>
    <div class="card-body">
      <p class="meta">${esc(metaLine(p))}</p>
      <h3 class="title"><button type="button" data-open="${p.id}"><span class="clamp">${esc(t)}</span></button></h3>
      <p class="stock">${stockHTML(p)}</p>
      <div class="buy">
        <span class="price-tag">${money(p.price)}</span>
        <button type="button" class="add" data-add="${p.id}" aria-disabled="${st.off}" aria-label="${st.off ? esc(st.label) + ": " : "Add to cart: "}${esc(t)}">${st.label}</button>
      </div>
    </div>
  </article>`;
}
function renderDividers() {
  $("dividers").innerHTML = CATEGORIES.map(c => {
    const n = c.key === "all" ? PRODUCTS.length : PRODUCTS.filter(p => p.cat === c.key).length;
    return `<button type="button" class="divider" data-cat="${c.key}" aria-pressed="${state.cat === c.key}">${c.label}<span class="n">${n}</span></button>`;
  }).join("");
}
function renderGrid() {
  const list = visibleProducts();
  gridEl.innerHTML = list.map(cardHTML).join("");
  $("empty").hidden = list.length > 0;
  const cat = catOf(state.cat), q = state.q.trim();
  $("results").textContent = list.length
    ? `${list.length} ${list.length === 1 ? "item" : "items"}${state.cat !== "all" ? " in " + cat.label : ""}${q ? ` matching “${q}”` : ""}`
    : "";
}
function refreshCards() {
  gridEl.querySelectorAll(".card").forEach(card => {
    const p = byId[card.dataset.id], btn = card.querySelector(".add"), st = addState(p), t = fullTitle(p);
    card.querySelector(".stock").innerHTML = stockHTML(p);
    btn.setAttribute("aria-disabled", String(st.off));
    btn.setAttribute("aria-label", (st.off ? st.label + ": " : "Add to cart: ") + t);
    if (!btn.classList.contains("added")) btn.textContent = st.label;
  });
}
function renderRack() {
  const rack = $("rack");
  rack.insertAdjacentHTML("afterbegin", `<svg class="burst" viewBox="-100 -100 200 200" aria-hidden="true"><polygon points="${burstPts(0, 0, 66, 100, 22)}" fill="currentColor"/></svg>` +
    HERO_IDS.map((id, i) => { const p = byId[id]; return `<button type="button" class="fan fan-${i + 1}" data-open="${id}" aria-label="${esc(fullTitle(p))}. View details">${coverHTML(p)}</button>`; }).join(""));
}

/* ===================== quick view ===================== */
const qv = $("qv");
let qvState = { id: null, qty: 1 };
function qvMax(p) { return Math.max(0, p.stock - cartQty(p.id)); }
function renderQV() {
  const p = byId[qvState.id]; if (!p) return;
  const max = qvMax(p);
  qvState.qty = Math.min(Math.max(1, qvState.qty), Math.max(1, max));
  const rows = [["Format", catOf(p.cat).one]];
  if (p.publisher) rows.push(["Publisher", p.publisher]);
  if (p.grade) { const code = p.grade.split(" ")[0]; rows.push(["Condition", `${p.grade} (${GRADES[code] || code})`]); }
  if (p.variant) rows.push([p.cat === "funko" ? "Finish" : "Edition", p.variant]);
  if (p.collects) rows.push(["Contents", p.collects]);
  if (p.pages) rows.push(["Pages", p.pages.toLocaleString("en-US")]);
  if (p.cat === "funko") rows.push(["Figure", p.num]);
  rows.push(["Stock", stockWord(p)]);
  let buy;
  if (p.stock <= 0) buy = `<p class="qv-limit">This one is sold out.</p>`;
  else if (max <= 0) buy = `<p class="qv-limit">Every copy we have is already in your cart.</p><button type="button" class="btn" data-qv="cart">View cart</button>`;
  else buy = `<div class="qty" role="group" aria-label="Quantity">
        <button type="button" data-qv="dec" aria-label="One fewer" ${qvState.qty <= 1 ? "disabled" : ""}>−</button>
        <span class="qty-n" aria-live="polite">${qvState.qty}</span>
        <button type="button" data-qv="inc" aria-label="One more" ${qvState.qty >= max ? "disabled" : ""}>+</button>
      </div>
      <button type="button" class="btn btn-yellow" data-qv="add">Add to cart · ${money(p.price * qvState.qty)}</button>`;
  $("qvBody").innerHTML = `<div class="qv-in">
    <button type="button" class="icon-btn qv-close" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="qv-cover">${coverHTML(p)}${stickerHTML(p)}</div>
    <div class="qv-info">
      <p class="eyebrow">${esc(catOf(p.cat).one)}</p>
      <h2 class="qv-title" id="qvTitle">${esc(fullTitle(p))}</h2>
      <p class="qv-price">${money(p.price)}</p>
      <p class="qv-blurb">${esc(p.blurb)}</p>
      ${p.staff ? `<p class="qv-talker">“${esc(p.staff)}”<small>Staff pick</small></p>` : ""}
      <dl class="specs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <div class="qv-buy">${buy}</div>
    </div>
  </div>`;
}
function openQuickView(id) {
  qvState = { id, qty: 1 };
  renderQV();
  if (!qv.open) qv.showModal();
  const focusTarget = qv.querySelector('[data-qv="add"]') || qv.querySelector("[data-close]");
  if (focusTarget) focusTarget.focus();
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
      <div class="line-thumb">${coverHTML(p)}</div>
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
  $("h-date").textContent = `Any day up to two weeks ahead. We're open ${hoursText()} every day.`;
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
  if (CONFIG.testMode || !CONFIG.orderEndpoint) {
    cart = {}; saveCart(); renderCartUI();
    showDone(order);
    return;
  }
  // Live mode: the order worker re-prices the cart from its own price list, stores the order,
  // and returns the Fleeca payment link. Discord is pinged by the worker once payment clears.
  const btn = $("payBtn");
  btn.disabled = true; btn.textContent = "Connecting to Fleeca…";
  try {
    const res = await fetch(CONFIG.orderEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
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
            ${o.method === "collect" ? `<div class="dc-field wide"><b>Collect on</b>${esc(fmtDate(o.collectDate))}, ${hoursText()}</div>` : `<div class="dc-field wide"><b>Post to</b>${escLines(o.address)}</div>`}
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
        ${collect ? `<dt>Collect</dt><dd>${esc(fmtDate(o.collectDate))}, ${hoursText()}</dd>` : `<dt>Post to</dt><dd>${escLines(o.address)}</dd>`}
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
  // Live mode only: the worker sends shoppers back to  ?order=FC-1234&status=paid  (or failed).
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

document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-open],[data-add],[data-cat],[data-inc],[data-dec],[data-remove],[data-qv],[data-close]");
  if (!t) return;
  const d = t.dataset;
  if (d.open) { openQuickView(d.open); return; }
  if (d.add) { if (t.getAttribute("aria-disabled") === "true") { const p = byId[d.add]; toast(p.stock <= 0 ? "That one is sold out." : "Every copy we have is already in your cart."); } else handleAdd(d.add, t); return; }
  if (d.cat) { state.cat = d.cat; $("dividers").querySelectorAll(".divider").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat))); renderGrid(); return; }
  if (d.inc) { setQty(d.inc, cartQty(d.inc) + 1); return; }
  if (d.dec) { setQty(d.dec, cartQty(d.dec) - 1); return; }
  if (d.remove) { setQty(d.remove, 0); return; }
  if (d.qv) {
    const p = byId[qvState.id];
    if (d.qv === "inc") { qvState.qty = Math.min(qvMax(p), qvState.qty + 1); renderQV(); focusFirst(qv, '[data-qv="inc"]:not(:disabled)', '[data-qv="dec"]'); }
    else if (d.qv === "dec") { qvState.qty = Math.max(1, qvState.qty - 1); renderQV(); focusFirst(qv, '[data-qv="dec"]:not(:disabled)', '[data-qv="inc"]'); }
    else if (d.qv === "add") { const n = qvState.qty; if (addToCart(p.id, n)) { qv.close(); bumpCart(); toast(`Added ${n > 1 ? n + " × " : ""}${fullTitle(p)}`, { label: "View cart", fn: openDrawer }); } }
    else if (d.qv === "cart") { qv.close(); openDrawer(); }
    return;
  }
  if ("close" in d) {
    const dlg = t.closest("dialog");
    if (dlg) dlg.close();
    if (d.goto) { const target = document.getElementById(d.goto); if (target) target.scrollIntoView({ block: "start" }); }
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
$("q").addEventListener("input", ev => { state.q = ev.target.value; renderGrid(); });
$("sort").addEventListener("change", ev => { state.sort = ev.target.value; renderGrid(); });
$("clearSearch").addEventListener("click", () => {
  state.q = ""; state.cat = "all"; $("q").value = "";
  $("dividers").querySelectorAll(".divider").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === "all")));
  renderGrid(); $("q").focus();
});
window.addEventListener("storage", ev => { if (ev.key === CART_KEY) { cart = sanitizeCart(store.get(CART_KEY, {})); renderCartUI(); } });

/* ===================== start ===================== */
$("footerLogo").src = $("logo").src;
document.querySelectorAll(".js-hours").forEach(el => { el.textContent = hoursText(); });
document.querySelectorAll(".js-postage").forEach(el => { el.textContent = money(CONFIG.postage); });
renderDividers();
renderGrid();
renderRack();
renderHours();
renderCartUI();
setInterval(renderHours, 60000);
handlePaymentReturn();

// Once the web fonts arrive, redraw the covers so titles are sized for the real typefaces.
function rebuildCovers() {
  coverCache.clear();
  renderGrid();
  $("rack").querySelectorAll(".fan").forEach(b => { b.innerHTML = coverHTML(byId[b.dataset.open]); });
  if (qv.open) renderQV();
  if (drawer.open) renderLines();
}
(function whenFontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  const specs = ["400 40px Bangers", "400 40px Anton", "800 10px Archivo", "600 10px Archivo", "700 10px Archivo"];
  const go = () => Promise.allSettled(specs.map(f => document.fonts.load(f))).then(rebuildCovers);
  const link = $("gfonts");
  let loaded = false;
  try { loaded = !!(link && link.sheet && link.sheet.cssRules); } catch (e) { loaded = !!(link && link.sheet); }
  if (!link || loaded) go(); else link.addEventListener("load", go, { once: true });
})();
})();
