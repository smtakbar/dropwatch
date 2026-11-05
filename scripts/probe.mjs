// One-off feasibility probe, run on a GitHub runner. Honest UA, obeys robots.txt, one request per URL.
import fs from "node:fs";
import { parseHtml } from "./lib.mjs";
import { robotsAllows } from "./log-prices.mjs";
const UA = "DropWatchResearchBot/1.0 (+https://github.com/smtakbar/dropwatch)";
const C = JSON.parse(fs.readFileSync("scripts/probe-candidates.json", "utf8"));
const robots = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robots.has(u.origin)) { let t = ""; try { const r = await fetch(u.origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (r.ok) t = await r.text(); } catch {} robots.set(u.origin, t); }
  return robotsAllows(robots.get(u.origin), u.pathname + u.search);
}
const out = [];
for (const c of C) {
  const row = { region: c.region, kind: c.kind, store: c.store, url: c.url };
  try {
    row.robots = await allowed(c.url);
    if (row.robots) {
      const r = await fetch(c.url, { headers: { "User-Agent": UA, "Accept-Language": "en", Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
      row.status = r.status;
      if (r.ok) {
        const h = await r.text(); row.bytes = h.length;
        const p = parseHtml(h, c.region, c.url); row.price = p.price; row.currency = p.currency; row.title = (p.name || "").slice(0, 70);
        if (c.kind === "tracker") row.historyMarkers = ["priceHistory", "price_history", "pricehistory", "chartData", "\"history\"", "dataPoints", "highcharts", "lowestPrice", "lowest price", "Lowest", "all time low"].filter((m) => h.includes(m));
      }
    }
  } catch (e) { row.error = String(e?.name ?? e); }
  out.push(row); console.log(JSON.stringify(row));
  await new Promise((r) => setTimeout(r, 2000));
}
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/probe.json", JSON.stringify(out, null, 1));
