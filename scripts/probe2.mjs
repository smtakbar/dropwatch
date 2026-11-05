import fs from "node:fs";
const UA = "DropWatchResearchBot/1.0 (+https://github.com/smtakbar/dropwatch)";
const pages = { ph: "https://pricehistory.app/p/sony-wh-1000xm5-best-active-noise-cancelling-1n4hLvyp", ccc: "https://camelcamelcamel.com/product/B09XSDMT4F", cccau: "https://au.camelcamelcamel.com/product/B09ZFD9CBB" };
const out = {};
for (const [k, u] of Object.entries(pages)) {
  const h = await (await fetch(u, { headers: { "User-Agent": UA } })).text();
  const strip = h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const i = strip.search(/Lowest/i);
  out[k] = { len: h.length, text: strip.slice(Math.max(0, i - 600), i + 2500) };
  const j = h.search(/Lowest/i); out[k].raw = h.slice(Math.max(0, j - 300), j + 900);
}
const q = "site:pricehistory.app sony wh-1000xm5";
const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=in-en", { headers: { "User-Agent": "Mozilla/5.0" } });
out.ddg = { status: r.status, text: (await r.text()).slice(0, 1500) };
fs.writeFileSync("reports/probe2.json", JSON.stringify(out, null, 1));
