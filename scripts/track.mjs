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

const MAX_PER_USER = 10, MAX_TOTAL = 150;
const usersOf = (i, owner) => (Array.isArray(i.users) && i.users.length ? i.users : owner ? [owner] : []);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** ctx = { author, owner }. Anyone with a GitHub account can track; each item remembers who follows it. */
export function apply(title, body, list, ctx = {}) {
  const { author = "", owner = "" } = ctx;
  if (!author) return { list, reply: "Could not tell who you are.", changed: false };
  const f = parseForm(body);
  if (/(github_pat_|ghp_|gho_|ghs_)/i.test(body)) return { list, reply: "Rejected: that looked like a secret token.", changed: false };
  if (/^remove:/i.test(title)) {
    const id = (f["item id"] || title.replace(/^remove:\s*/i, "")).trim();
    const it = list.find((i) => i.id === id);
    if (!it) return { list, reply: `No item with id \`${id}\`.`, changed: false };
    const users = usersOf(it, owner);
    const isOwner = owner && same(author, owner);
    if (!isOwner && !users.some((u) => same(u, author))) return { list, reply: "That item is not on your list.", changed: false };
    const left = isOwner ? [] : users.filter((u) => !same(u, author));
    const next = left.length ? list.map((i) => (i.id === id ? { ...i, users: left } : i)) : list.filter((i) => i.id !== id);
    return { list: next, reply: `Removed \`${id}\` from your list.`, changed: true };
  }
  const mine = list.filter((i) => usersOf(i, owner).some((u) => same(u, author))).length;
  if (mine >= MAX_PER_USER && !(owner && same(author, owner))) return { list, reply: `Limit reached: ${MAX_PER_USER} products per person.`, changed: false };
  const name = (f["name"] || "").trim();
  const country = /^[A-Z]{2}$/.test((f["country"] || "").trim()) ? f["country"].trim() : "AU";
  const d = detectFromUrl(f["product link"] ?? "");
  if (!d && name.length < 3) return { list, reply: "Enter a product link or a product name. Nothing was added.", changed: false };
  const id = d
    ? crypto.createHash("sha1").update(d.url).digest("hex").slice(0, 8)
    : crypto.createHash("sha1").update("name:" + name.toLowerCase() + country).digest("hex").slice(0, 8);
  const existing = list.find((i) => i.id === id);
  if (existing) {
    const users = usersOf(existing, owner);
    if (users.some((u) => same(u, author))) return { list, reply: "Already on your list.", changed: false };
    return { list: list.map((i) => (i.id === id ? { ...i, users: [...users, author] } : i)), reply: "Added to your list (already tracked).", changed: true };
  }
  if (list.length >= MAX_TOTAL) return { list, reply: "The tracker is full right now.", changed: false };
  const target = parseFloat(f["target price"]);
  const item = d
    ? { id, url: d.url, name: name.slice(0, 120), country: d.country ?? country, users: [author], target: target > 0 ? target : null, currency: target > 0 ? (f["target currency"] || "USD") : null }
    : { id, url: "", name: name.slice(0, 120), country, users: [author], target: null, currency: null };
  return { list: [...list, item], reply: d ? `Now tracking a **${d.retailer}** link.` : `Tracking "${name}" across stores in ${country}.`, changed: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = JSON.parse(fs.readFileSync(WATCH, "utf8"));
  const r = apply(process.env.ISSUE_TITLE ?? "", process.env.ISSUE_BODY ?? "", list, { author: process.env.ISSUE_AUTHOR ?? "", owner: process.env.OWNER ?? "" });
  if (r.changed) fs.writeFileSync(WATCH, JSON.stringify(r.list, null, 2) + "\n");
  fs.writeFileSync(REPLY, r.reply);
  console.log(r.reply);
}
