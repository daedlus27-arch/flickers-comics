/* Ready-to-send texts for staff to copy: customers are contacted by hand, so the wording is written once, here. */
import { money, hLabel } from "../shared.mjs";

const first = name => String(name || "").trim().split(/\s+/)[0] || "there";
const day = iso => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return y ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d))) : "";
};
const hours = cfg => (cfg && cfg.openHour != null ? `${hLabel(cfg.openHour)} to ${hLabel(cfg.closeHour)}` : "");

export function orderMessage(o, cfg = {}) {
  const who = first(o.name), when = hours(cfg);
  switch (o.status || "new") {
    case "ready":
      return o.method === "post"
        ? `Hi ${who}, it's Flickers Comics. Your order ${o.id} is packed and on its way to you.`
        : `Hi ${who}, it's Flickers Comics. Your order ${o.id} is ready to collect${o.collectDate ? " on " + day(o.collectDate) : ""}${when ? ` (we're open ${when} every day)` : ""}. ${o.paid ? "It's paid for." : `The total is ${money(o.total)}.`}`;
    case "done":
      return `Hi ${who}, thanks for shopping at Flickers Comics! Order ${o.id} is all done. See you next time.`;
    case "cancelled":
      return `Hi ${who}, it's Flickers Comics. Your order ${o.id} has been cancelled. Message us if that's a surprise.`;
    default:
      return `Hi ${who}, it's Flickers Comics. We've got your order ${o.id} and we're getting it ready. We'll message you as soon as it's done.`;
  }
}

export function wantMessage(w) {
  const who = first(w.name);
  if (w.kind === "restock") return `Hi ${who}, it's Flickers Comics. ${w.title} ${w.backAt ? "is back in stock" : "isn't back yet, but we haven't forgotten you"}. ${w.backAt ? "Want us to set one aside for you?" : "We'll message you the moment it is."}`;
  if (w.kind === "series") return `Hi ${who}, it's Flickers Comics. ${w.latest ? `A new issue of ${w.series} just arrived (${w.latest.title}). Want us to set one aside for you?` : `We'll message you when the next issue of ${w.series} arrives.`}`;
  return `Hi ${who}, it's Flickers Comics. About the comic you asked for (${w.text}): we're checking whether we can get it in and will message you either way.`;
}
