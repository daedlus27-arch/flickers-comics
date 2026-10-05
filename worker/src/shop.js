/* The shop's published catalog (data/shop.json on the live site), as customers see it. */
import { bad } from "./http.js";

export const siteBase = env => String(env.SITE_URL || "").replace(/\/+$/, "");

export async function loadShop(env) {
  const base = siteBase(env);
  if (!base) throw bad(503, "Online ordering isn't set up yet.");
  let res;
  try { res = await fetch(`${base}/data/shop.json`, { headers: { Accept: "application/json" } }); }
  catch (e) { throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment."); }
  if (!res.ok) throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment.");
  try { return await res.json(); } catch (e) { throw bad(503, "Couldn't check the shop's stock just now. Try again in a moment."); }
}
export const shopConfig = async env => { try { return (await loadShop(env)).config || {}; } catch (e) { return {}; } };
