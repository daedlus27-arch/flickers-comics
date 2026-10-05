/* Low-stock alerts: when an order takes a comic down to its last copy, or to none, say so in the staff Discord channel
   (pinging the staff role if one is set) so it can be reordered before customers find it gone. */
import { escMd, cut, pingRole, webhook } from "./discord.js";
import { fullTitle } from "../../src/shared.mjs";

/* before/after are the stock lists either side of the change. Only comics that crossed the line are mentioned, once each. */
export async function announceLowStock(env, before, after) {
  const was = new Map((before || []).map(p => [p.id, p.stock]));
  const gone = [], last = [];
  for (const p of after || []) {
    const b = was.get(p.id);
    if (b === undefined) continue;
    if (p.stock <= 0 && b > 0) gone.push(p);
    else if (p.stock === 1 && b > 1) last.push(p);
  }
  if (!gone.length && !last.length) return;
  const role = pingRole(env);
  const line = (p, text) => `• **${cut(escMd(fullTitle(p)), 120)}**: ${text}`;
  const lines = [...last.map(p => line(p, "last copy")), ...gone.map(p => line(p, "sold out"))];
  const shown = lines.slice(0, 20).join("\n") + (lines.length > 20 ? `\n…and ${lines.length - 20} more` : "");
  const sent = await webhook(env, { payload: {
    username: "Flickers Orders", content: role ? `<@&${role}> stock running out` : undefined,
    allowed_mentions: { parse: [], roles: role ? [role] : [] },
    embeds: [{ title: gone.length && !last.length ? "Sold out" : "Stock running out", description: shown, color: 0xF59E0B, footer: { text: "Reorder, or restock it in the staff area → Stock" } }]
  } });
  if (!sent.ok) console.error("Couldn't post a low-stock alert");
}
