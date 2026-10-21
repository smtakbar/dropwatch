import { writeFileSync, readFileSync } from "node:fs";
const wl = JSON.parse(readFileSync("watchlist.json", "utf8"));
const out = [];
function* walk(n, path = "", d = 0) {
  if (d > 40) return;
  if (Array.isArray(n)) { for (let i = 0; i < n.length; i++) yield* walk(n[i], path + "[" + i + "]", d + 1); return; }
  if (n && typeof n === "object") { yield [n, path]; for (const k of Object.keys(n)) yield* walk(n[k], path + "." + k, d + 1); }
}
for (const w of wl) {
  const res = await fetch(w.url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept-Language": "en" } });
  const html = await res.text();
  const nd = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const hits = [];
  if (nd) for (const [n, p] of walk(JSON.parse(nd))) if (n.pricing || typeof n.currentPrice === "number" || typeof n.salePrice === "number") hits.push({ path: p, name: n.name, size: n.size, brand: n.brand, pricing: n.pricing, currentPrice: n.currentPrice });
  out.push({ url: w.url, status: res.status, hits: hits.slice(0, 12) });
}
writeFileSync("docs/debug.json", JSON.stringify(out, null, 1));
