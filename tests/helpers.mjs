/* Shared fakes for the Worker tests. */

/* An in-memory Workers KV that behaves like the real one where it matters here: sorted keys, paging with limit and cursor,
   key metadata, expiry times, and a count of operations (every KV call counts towards a Worker's subrequest limit). */
export class FakeKV {
  constructor() { this.m = new Map(); this.ttl = new Map(); this.meta = new Map(); this.ops = 0; }
  async get(k) { this.ops++; return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v, o) {
    this.ops++;
    this.m.set(k, String(v)); this.ttl.set(k, o && o.expirationTtl);
    if (o && o.metadata) this.meta.set(k, o.metadata); else this.meta.delete(k);
  }
  async delete(k) { this.ops++; this.m.delete(k); this.ttl.delete(k); this.meta.delete(k); }
  async list({ prefix = "", limit = 1000, cursor } = {}) {
    this.ops++;
    const all = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort(), start = cursor ? Number(cursor) : 0;
    const keys = all.slice(start, start + limit).map(name => ({ name, ...(this.meta.has(name) ? { metadata: this.meta.get(name) } : {}) }));
    const done = start + limit >= all.length;
    return done ? { keys, list_complete: true } : { keys, list_complete: false, cursor: String(start + limit) };
  }
}

/* Runs a request through the Worker and parses the JSON answer together with its status. */
export const caller = (worker, origin, ip = "1.2.3.4") => (env, method, path, body, token, ipOverride) => worker.fetch(new Request("https://api.test" + path, {
  method, headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": ipOverride || ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined
}), env);
export const j = async pending => { const res = await pending; return { status: res.status, ...(await res.json()) }; };
