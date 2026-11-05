import fs from "node:fs";
import { parseHtml } from "./lib.mjs";
const T = { vs: "https://www.vijaysales.com/p/P206834/206834/sony-wh-1000xm5-wireless-industry-leading-noise-canceling-headphones-with-auto-noise-canceling-up-to-30-hours-battery-life-black", ccc: "https://camelcamelcamel.com/product/B09XSDMT4F" };
const out = [];
for (const [k, u] of Object.entries(T)) {
  const enc = encodeURIComponent(u);
  const relays = { allorigins: [`https://api.allorigins.win/raw?url=${enc}`, {}], corsproxy: [`https://corsproxy.io/?url=${enc}`, {}], jina: [`https://r.jina.ai/${u}`, { headers: { "x-return-format": "html" } }] };
  for (const [n, [url, opt]] of Object.entries(relays)) {
    const t = Date.now(); const row = { page: k, relay: n };
    try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(30000) }); row.status = r.status; const h = await r.text(); row.len = h.length; row.ms = Date.now() - t; row.hasTable = /Lowest Ever/.test(h); row.hasPrice = !!parseHtml(h, "IN", u).price; row.head = h.slice(0, 120).replace(/\s+/g, " "); } catch (e) { row.err = String(e.name); row.ms = Date.now() - t; }
    out.push(row); console.log(JSON.stringify(row));
  }
}
fs.writeFileSync("reports/probe3.json", JSON.stringify(out, null, 1));
