// Price logger for the public dataset in data/. One polite request per product per run.
// Identifies itself honestly, obeys robots.txt, never retries around a block, and records every outcome.
import fs from "node:fs";
import { parseHtml } from "./lib.mjs";

const SEED = process.env.SEED ?? "data/seed.json";
const PRICES = process.env.PRICES ?? "data/prices.csv";
const FETCHLOG = process.env.FETCHLOG ?? "data/fetch-log.csv";
const UA = "DropWatchResearchBot/1.0 (+https://github.com/smtakbar/dropwatch)";
const DELAY_MS = Number(process.env.DELAY_MS ?? 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Minimal robots.txt check: groups for our UA or *, longest matching rule wins, Allow beats Disallow on ties. */
export function robotsAllows(txt, path) {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push([k, v]);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && "dropwatchresearchbot".includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const g of use) for (const [k, v] of g.rules) {
    if (!v) continue;
    const re = new RegExp("^" + v.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || v.length > best.len || (v.length === best.len && k === "allow"))) best = { len: v.length, k };
  }
  return !best || best.k === "allow";
}

const robotsCache = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let txt = "";
    try { const r = await fetch(u.origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (r.ok) txt = await r.text(); } catch {}
    robotsCache.set(u.origin, txt);
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
}

export async function runOnce() {
  const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
  if (!fs.existsSync(PRICES)) fs.writeFileSync(PRICES, "timestamp,id,store,price,currency,in_stock\n");
  if (!fs.existsSync(FETCHLOG)) fs.writeFileSync(FETCHLOG, "timestamp,id,store,outcome\n");
  const ts = new Date().toISOString();
  const rows = [], logs = [];
  for (const p of seed) {
    let outcome = "ok";
    try {
      if (!(await allowed(p.url))) outcome = "robots_disallow";
      else {
        const res = await fetch(p.url, { headers: { "User-Agent": UA, "Accept-Language": "en-AU,en;q=0.8", Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!res.ok) outcome = `http_${res.status}`;
        else {
          const r = parseHtml(await res.text(), p.country, p.url);
          if (!r.price) outcome = "no_price";
          else rows.push([ts, p.id, p.store, r.price, r.currency ?? "AUD", r.inStock === undefined ? "" : r.inStock ? 1 : 0].map(csv).join(","));
        }
      }
    } catch (e) { outcome = "error_" + String(e?.name ?? "fetch").toLowerCase(); }
    logs.push([ts, p.id, p.store, outcome].map(csv).join(","));
    console.log(p.id, outcome);
    await sleep(DELAY_MS);
  }
  if (rows.length) fs.appendFileSync(PRICES, rows.join("\n") + "\n");
  fs.appendFileSync(FETCHLOG, logs.join("\n") + "\n");
  console.log(`${rows.length}/${seed.length} prices logged`);
}

if (import.meta.url === `file://${process.argv[1]}`) await runOnce();
