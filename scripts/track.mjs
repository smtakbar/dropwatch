// Handles "track:" / "remove:" issues opened by the repo owner. Edits watchlist.json and writes a reply.
import fs from "node:fs";
import crypto from "node:crypto";
import { detectFromUrl } from "./lib.mjs";

const WATCH = process.env.WATCHLIST ?? "watchlist.json";
const REPLY = process.env.REPLY_FILE ?? "reply.md";

/** Issue-form bodies look like "### Label\n\nvalue". Returns {label: value}. */
export function parseForm(body = "") {
  const out = {};
  for (const m of body.matchAll(/^###\s+(.+?)\s*\n+([\s\S]*?)(?=^###\s|\s*$(?![\s\S]))/gm)) {
    const v = m[2].trim();
    out[m[1].trim().toLowerCase()] = v === "_No response_" ? "" : v;
  }
  return out;
}

export function apply(title, body, list) {
  const f = parseForm(body);
  if (/^remove:/i.test(title)) {
    const id = (f["item id"] || title.replace(/^remove:\s*/i, "")).trim();
    const next = list.filter((i) => i.id !== id);
    return { list: next, reply: next.length < list.length ? `Removed \`${id}\`.` : `No item with id \`${id}\`.`, changed: next.length < list.length };
  }
  const name = (f["name"] || "").trim();
  const country = /^[A-Z]{2}$/.test((f["country"] || "").trim()) ? f["country"].trim() : "AU";
  const d = detectFromUrl(f["product link"] ?? "");
  if (!d && name.length < 3) return { list, reply: "Enter a product link or a product name. Nothing was added.", changed: false };
  if (!d) {
    const id = crypto.createHash("sha1").update("name:" + name.toLowerCase() + country).digest("hex").slice(0, 8);
    if (list.some((i) => i.id === id)) return { list, reply: "Already tracking that product.", changed: false };
    return { list: [...list, { id, url: "", name: name.slice(0, 120), country, target: null, currency: null }], reply: `Tracking "${name}" across stores in ${country}.`, changed: true };
  }
  const id = crypto.createHash("sha1").update(d.url).digest("hex").slice(0, 8);
  if (list.some((i) => i.id === id)) return { list, reply: "Already tracking that link.", changed: false };
  const target = parseFloat(f["target price"]);
  const item = { id, url: d.url, name: name.slice(0, 120), country: d.country ?? country, target: target > 0 ? target : null, currency: target > 0 ? (f["target currency"] || "USD") : null };
  return { list: [...list, item], reply: `Now tracking **${d.retailer}** link (\`${id}\`). First price check is running.`, changed: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = JSON.parse(fs.readFileSync(WATCH, "utf8"));
  const r = apply(process.env.ISSUE_TITLE ?? "", process.env.ISSUE_BODY ?? "", list);
  if (r.changed) fs.writeFileSync(WATCH, JSON.stringify(r.list, null, 2) + "\n");
  fs.writeFileSync(REPLY, r.reply);
  console.log(r.reply);
}
