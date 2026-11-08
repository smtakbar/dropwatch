import fs from "node:fs";
import { parseHtml } from "./lib.mjs";
const UA = "DropWatchResearchBot/1.0 (+https://github.com/smtakbar/dropwatch)";
const out = [];
async function tryFetch(label, url, opt = {}) {
  const row = { label, url: url.slice(0, 110) };
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000), ...opt });
    const h = await r.text();
    row.status = r.status; row.final = r.url.slice(0, 160); row.len = h.length; row.ms = Date.now() - t;
    const p = parseHtml(h, "AU", r.url); row.price = p.price; row.name = (p.name || "").slice(0, 60); row.via = p.via;
    row.head = h.slice(0, 160).replace(/\s+/g, " ");
    row.hasLD = /application\/ld\+json/.test(h); row.challenge = /cf-chl|Just a moment|captcha|Access Denied|_Incapsula_|akamai/i.test(h);
  } catch (e) { row.err = String(e.name); row.ms = Date.now() - t; }
  out.push(row); console.log(JSON.stringify(row));
}
const share = "https://share.google/Tny9b1kWTMk21j4O2";
await tryFetch("share-direct", share, { headers: { "User-Agent": "Mozilla/5.0" } });
const cw = ["https://www.chemistwarehouse.com.au/buy/109778/jimmy-choo-i-want-choo-eau-de-parfum-100ml", "https://www.chemistwarehouse.com.au/buy/64974/jimmy-choo-eau-de-parfum-spray-100ml"];
for (const u of cw) {
  const enc = encodeURIComponent(u);
  await tryFetch("cw-honest-ua", u, { headers: { "User-Agent": UA } });
  await tryFetch("cw-allorigins", `https://api.allorigins.win/raw?url=${enc}`);
  await tryFetch("cw-jina", `https://r.jina.ai/${u}`, { headers: { "x-return-format": "html" } });
}
await tryFetch("share-jina", `https://r.jina.ai/${share}`, { headers: { "x-return-format": "html" } });
fs.writeFileSync("reports/probe4.json", JSON.stringify(out, null, 1));
