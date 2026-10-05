/* Talking to GitHub: reading the published stock and committing changes to it.
   Used by the staff "publish" (index.js) and by orders, which take stock off the shelf when a comic is
   ordered and put it back if the order is cancelled (orders.js). */
import { HttpError, bad } from "./http.js";
import { fullTitle } from "../../src/shared.mjs";

const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const b64ToText = str => new TextDecoder().decode(unb64(str.replace(/\s/g, "")));

export async function gh(env, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    method: opts.method || "GET",
    headers: {
      Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "flickers-comics-worker",
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json()).message || ""; } catch (e) { /* no body */ }
    console.error("GitHub", res.status, path, msg);
    throw bad(502, `GitHub refused the request (${res.status}). ${res.status === 401 || res.status === 403 || res.status === 404 ? "The Worker's GitHub token may have expired or lack access to the repo." : "Try again in a moment."}`);
  }
  return res.status === 204 ? null : res.json();
}
export const branchName = env => encodeURIComponent(env.GITHUB_BRANCH || "main");
const branchRef = env => `/git/ref/heads/${branchName(env)}`;

export async function readStock(env) {
  const ref = await gh(env, branchRef(env));
  const head = ref.object.sha;
  const [products, featured] = await Promise.all([
    gh(env, `/contents/data/products.json?ref=${head}`),
    gh(env, `/contents/data/featured.json?ref=${head}`)
  ]);
  return { head, version: products.sha, products: JSON.parse(b64ToText(products.content)), featured: JSON.parse(b64ToText(featured.content)) };
}

/* products.json is kept one comic per line so changes read clearly in GitHub */
export const serializeProducts = products => "[\n" + products.map(p => " " + JSON.stringify(p)).join(",\n") + "\n]\n";

/* Add to or take from the stock of some comics in one commit. `changes` is a list of [id, delta].
   Reads the latest stock from GitHub every time (not the published site, which can be a minute behind), refuses to
   go below zero, and retries if someone else committed at the same moment. */
export async function adjustStock(env, changes, message) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw bad(502, "GitHub isn't connected.");
  const want = new Map();
  for (const [id, delta] of changes) want.set(id, (want.get(id) || 0) + delta);
  for (let attempt = 0; ; attempt++) {
    const cur = await readStock(env);
    const products = cur.products.map(p => ({ ...p }));
    for (const [id, delta] of want) {
      const p = products.find(x => x.id === id);
      if (!p) throw bad(409, "One of the comics in your cart isn't in the shop any more. Refresh the page and try again.");
      const next = p.stock + delta;
      if (next < 0) throw bad(409, p.stock <= 0 ? `${fullTitle(p)} has sold out.` : `We only have ${p.stock} of ${fullTitle(p)}.`);
      p.stock = next;
    }
    const commit = await gh(env, `/git/commits/${cur.head}`);
    const blob = await gh(env, "/git/blobs", { method: "POST", body: { content: serializeProducts(products), encoding: "utf-8" } });
    const tree = await gh(env, "/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: [{ path: "data/products.json", mode: "100644", type: "blob", sha: blob.sha }] } });
    const made = await gh(env, "/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [cur.head] } });
    try {
      await gh(env, `/git/refs/heads/${branchName(env)}`, { method: "PATCH", body: { sha: made.sha, force: false } });
    } catch (e) {
      if (attempt < 3 && e instanceof HttpError) continue; // somebody committed first: start again from the new head
      throw e;
    }
    return { products, before: cur.products };
  }
}

/* Staff edit a copy of the stock they loaded earlier. If orders have changed the stock since (or a colleague published),
   their changes are laid onto the latest stock instead of overwriting it: for each comic they edited, only the fields
   they changed are applied; comics they didn't touch keep their latest values. */
export function mergeStock(base, mine, latest) {
  const baseBy = new Map(base.map(p => [p.id, p])), mineBy = new Map(mine.map(p => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const lp of latest) {
    seen.add(lp.id);
    const b = baseBy.get(lp.id), m = mineBy.get(lp.id);
    if (b && !m) continue;                       // staff deleted it
    if (!b || !m) { out.push(lp); continue; }    // added by someone else since, or untouched
    const merged = { ...lp };
    for (const k of new Set([...Object.keys(b), ...Object.keys(m)])) {
      if (JSON.stringify(b[k]) !== JSON.stringify(m[k])) { if (m[k] === undefined) delete merged[k]; else merged[k] = m[k]; }
    }
    out.push(merged);
  }
  for (const m of mine) if (!seen.has(m.id)) out.push(m); // staff added it (or it was removed elsewhere but staff edited it)
  return out;
}
