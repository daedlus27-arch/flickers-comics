/* Posts new commits on main to a Discord channel. Run by .github/workflows/discord-commits.yml.
   The webhook address comes from the repository secret DISCORD_COMMITS_WEBHOOK and is never printed.
   Commit text is treated as untrusted: it's escaped, trimmed, and can't ping anyone. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const escMd = s => String(s).replace(/([\\*_~`|>\[\]])/g, "\\$1").replace(/</g, "\\<").replace(/@/g, "@\u200b");
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function buildMessage(event, env = {}) {
  const repo = (event.repository && event.repository.full_name) || env.GITHUB_REPOSITORY || "repository";
  const branch = String(event.ref || env.GITHUB_REF || "refs/heads/main").replace("refs/heads/", "");
  const commits = (event.commits || []).filter(c => c && c.id);
  if (!commits.length) {
    return { username: "Flickers Commits", allowed_mentions: { parse: [] }, embeds: [{ title: "Connected", description: `New commits to \`${branch}\` will appear here.`, color: 0x23A55A, footer: { text: repo } }] };
  }
  const lines = [];
  for (const c of commits.slice(0, 15)) {
    const first = escMd(String(c.message || "").split("\n")[0]);
    const who = escMd((c.author && (c.author.username || c.author.name)) || "someone");
    lines.push(`[\`${c.id.slice(0, 7)}\`](${c.url}) ${cut(first, 200)} · ${who}`);
  }
  if (commits.length > 15) lines.push(`…and ${commits.length - 15} more`);
  const head = event.head_commit || commits[commits.length - 1];
  return {
    username: "Flickers Commits",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${commits.length} new commit${commits.length === 1 ? "" : "s"} to ${branch}`,
      url: event.compare || undefined,
      description: cut(lines.join("\n"), 4000),
      color: 0xFFE912,
      footer: { text: repo },
      timestamp: head && head.timestamp ? new Date(head.timestamp).toISOString() : undefined
    }]
  };
}

async function main() {
  const url = String(process.env.DISCORD_COMMITS_WEBHOOK || "").trim();
  if (!url) { console.log("DISCORD_COMMITS_WEBHOOK isn't set, so nothing was posted. Add it under Settings > Secrets and variables > Actions."); return; }
  let event = {};
  try { event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")); } catch (e) { /* manual run: no commits, so a connection message is sent */ }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildMessage(event, process.env)) });
  if (!res.ok) { console.error(`Discord answered ${res.status}. Check that the webhook still exists.`); process.exit(1); } // never log the address
  console.log("Posted to Discord.");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
