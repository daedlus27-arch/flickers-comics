/* What to reorder: how many people are waiting for each comic, how many copies sold lately, and what customers have asked for that
   the shop doesn't stock. The staff area joins this with the current stock. Everything here comes from key metadata, so it costs a
   few listings however long the lists are (a free-plan Worker may make only about 50 calls per request). */
import { allSales } from "./sales.js";
import { wantKeys, wantsFromKeys } from "./wants.js";
import { norm } from "../../src/shared.mjs";

const REQUESTS_SHOWN = 20;

export async function reorderData(env, weeksBack = 8) {
  const keys = await wantKeys(env);
  const waiting = {}, followers = {};
  for (const k of keys) {
    const m = k.metadata;
    if (!m) continue;
    if (m.k === "restock" && m.p) waiting[m.p] = (waiting[m.p] || 0) + 1;
    else if (m.k === "series" && m.s) followers[m.s] = (followers[m.s] || 0) + 1;
  }
  // requests ("can you get Saga #1 in?") only have their text in the record itself: read the newest few
  const asked = await wantsFromKeys(env, keys.filter(k => k.metadata && k.metadata.k === "request").slice(0, REQUESTS_SHOWN));
  const byText = new Map();
  for (const w of asked) { const key = norm(w.text); const e = byText.get(key) || { text: w.text, people: 0, ready: false }; e.people++; byText.set(key, e); }

  const since = Date.now() - weeksBack * 7 * 86400000, sold = {};
  for (const s of await allSales(env)) {
    if (s.s === "x" || s.p < since) continue;
    for (const [id, qty] of s.i) sold[id] = (sold[id] || 0) + qty;
  }
  return { waiting, followers, sold, requests: [...byText.values()].sort((a, b) => b.people - a.people), weeks: weeksBack };
}
