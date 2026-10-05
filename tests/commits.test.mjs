import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage } from "../.github/scripts/discord-commits.mjs";

const commit = (n, message, extra = {}) => ({ id: String(n).repeat(40).slice(0, 40), url: `https://github.com/o/r/commit/${n}`, message, author: { username: "owner" }, timestamp: "2026-10-05T10:00:00Z", ...extra });

test("a push becomes one tidy Discord message", () => {
  const m = buildMessage({ ref: "refs/heads/main", repository: { full_name: "o/r" }, compare: "https://github.com/o/r/compare/a...b", commits: [commit(1, "Update stock (owner): 2 edited\n\nlong body"), commit(2, "Order FC-ABC234: 2 comics taken off the shelf")] });
  const e = m.embeds[0];
  assert.equal(e.title, "2 new commits to main");
  assert.equal(e.url, "https://github.com/o/r/compare/a...b");
  assert.match(e.description, /\[`1111111`\]\(https:\/\/github.com\/o\/r\/commit\/1\) Update stock \(owner\): 2 edited · owner/);
  assert.ok(!e.description.includes("long body"), "only the first line of each message");
  assert.equal(e.footer.text, "o/r");
});

test("commit text can't ping anyone or inject formatting, and long pushes are trimmed", () => {
  const m = buildMessage({ commits: [commit(3, "@everyone <@123> **bold** [x](http://evil)")] });
  assert.deepEqual(m.allowed_mentions.parse, []);
  assert.ok(!m.embeds[0].description.includes("@everyone"), "mentions are broken up");
  assert.ok(!m.embeds[0].description.includes("](http://evil)") || m.embeds[0].description.includes("\\]"), "links in commit text are escaped");
  const many = buildMessage({ commits: Array.from({ length: 40 }, (_, i) => commit(i % 9 + 1, "x".repeat(500))) });
  assert.ok(many.embeds[0].description.length <= 4000);
  assert.match(many.embeds[0].description, /and 25 more/);
});

test("a manual run with no commits sends a connection message", () => {
  const m = buildMessage({}, { GITHUB_REPOSITORY: "o/r" });
  assert.equal(m.embeds[0].title, "Connected");
});
