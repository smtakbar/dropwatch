// Shared helpers: URL detection, price scraping (JSON-LD / meta tags), FX.

const TLD = [
  [/\.com\.au$/, "AU"], [/\.co\.uk$/, "GB"], [/\.ca$/, "CA"], [/\.de$/, "DE"], [/\.fr$/, "FR"],
  [/\.co\.jp$|\.jp$/, "JP"], [/\.in$/, "IN"], [/\.sg$/, "SG"], [/\.co\.nz$/, "NZ"], [/\.ae$/, "AE"],
  [/\.com\.br$/, "BR"], [/\.kr$/, "KR"],
];
const RETAILERS = [
  [/amazon\./, "Amazon"], [/jbhifi/, "JB Hi-Fi"], [/harveynorman/, "Harvey Norman"], [/thegoodguys/, "The Good Guys"],
  [/officeworks/, "Officeworks"], [/kmart/, "Kmart"], [/bestbuy/, "Best Buy"], [/walmart/, "Walmart"],
  [/target\./, "Target"], [/newegg/, "Newegg"], [/currys/, "Currys"], [/argos/, "Argos"], [/johnlewis/, "John Lewis"],
  [/flipkart/, "Flipkart"], [/lazada/, "Lazada"], [/coupang/, "Coupang"], [/noon\./, "Noon"],
  [/mercadolivre/, "Mercado Livre"], [/yodobashi/, "Yodobashi"], [/fnac/, "Fnac"], [/mediamarkt/, "MediaMarkt"],
  [/ebgames/, "EB Games"],
];

export function detectFromUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|fbclid|gclid|msclkid|tag$|linkcode|th$|psc$|smid|sprefix|cid$)/i.test(k)) u.searchParams.delete(k);
  const host = u.hostname.replace(/^www\./, "");
  let country = TLD.find(([re]) => re.test(host))?.[1] ?? (/\.com$/.test(host) ? "US" : null);
  const retailer = RETAILERS.find(([re]) => re.test(host))?.[1] ?? host;
  return { url: u.toString(), retailer, country };
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CUR = { AU: "AUD", US: "USD", GB: "GBP", CA: "CAD", DE: "EUR", FR: "EUR", JP: "JPY", IN: "INR", SG: "SGD", NZ: "NZD", AE: "AED", BR: "BRL", KR: "KRW" };
const num = (v) => { if (v == null) return; const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : undefined; };
function* walk(n, depth = 0) {
  if (depth > 40) return;
  if (Array.isArray(n)) { for (const x of n) yield* walk(x, depth + 1); return; }
  if (n && typeof n === "object") { yield n; for (const k of Object.keys(n)) yield* walk(n[k], depth + 1); }
}
function fromOffers(offers) {
  for (const o of Array.isArray(offers) ? offers : [offers]) {
    if (!o) continue;
    const price = num(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
    if (price) return { price, currency: o.priceCurrency ?? o.priceSpecification?.priceCurrency };
  }
  return {};
}

/** Extract name/price/currency from HTML. Order: JSON-LD, meta tags, __NEXT_DATA__ JSON. */
export function parseHtml(html, country) {
  let name, price, currency, via;
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const n of walk(JSON.parse(b[1].trim()))) {
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          name ??= typeof n.name === "string" ? n.name : undefined;
          if (!price) { const r = fromOffers(n.offers); price = r.price; currency = r.currency; if (price) via = "json-ld"; }
        }
      }
    } catch {}
    if (price) break;
  }
  const meta = (p) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, "i"))?.[1];
  if (!price) {
    price = num(meta("product:price:amount") ?? meta("og:price:amount"));
    if (price) { currency ??= meta("product:price:currency") ?? meta("og:price:currency"); via = "meta"; }
  }
  const nd = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!price && nd) {
    try {
      for (const n of walk(JSON.parse(nd))) {
        const v = typeof n.pricing?.now === "number" ? n.pricing.now : typeof n.currentPrice === "number" ? n.currentPrice : typeof n.salePrice === "number" ? n.salePrice : undefined;
        if (v > 0) { price = v; name ??= typeof n.name === "string" ? n.name : undefined; via = "next-data"; break; }
      }
    } catch {}
  }
  name ??= meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  currency ??= CUR[country];
  return { name, price, currency, via, diag: { bytes: html.length, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60), jsonld: /ld\+json/i.test(html), nextData: !!nd } };
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow", signal: AbortSignal.timeout(15000),
    });
    return { status: res.status, html: res.ok ? await res.text() : "" };
  } catch (e) { return { status: 0, html: "", err: e?.message ?? "network error" }; }
}

/** Real-browser fallback (Chrome is preinstalled on GitHub runners). Needs `npm i playwright-core`. */
async function browserPage(url) {
  let pw;
  try { pw = await import("playwright-core"); } catch { return { html: "", note: "browser fallback not installed" }; }
  let browser;
  try {
    browser = await pw.chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({ userAgent: UA, locale: "en-AU" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { html: await page.content() };
  } catch (e) { return { html: "", note: `browser failed: ${String(e?.message ?? e).split("\n")[0].slice(0, 90)}` }; }
  finally { await browser?.close().catch(() => {}); }
}

export async function scrapeProduct(url) {
  const country = detectFromUrl(url)?.country;
  const f = await fetchPage(url);
  let r = f.html ? parseHtml(f.html, country) : null;
  if (r?.price) return { name: r.name, price: r.price, currency: r.currency, via: "fetch:" + r.via };

  const b = await browserPage(url);
  const rb = b.html ? parseHtml(b.html, country) : null;
  if (rb?.price) return { name: rb.name ?? r?.name, price: rb.price, currency: rb.currency, via: "browser:" + rb.via };

  const d = (rb ?? r)?.diag;
  const fetchNote = f.err ? `fetch failed (${f.err})` : f.status !== 200 ? `fetch HTTP ${f.status}` : "fetch HTTP 200";
  const pageNote = d ? `, page "${d.title ?? "no title"}", ${Math.round(d.bytes / 1024)}kB, json-ld ${d.jsonld ? "yes" : "no"}, next-data ${d.nextData ? "yes" : "no"}` : "";
  return { name: rb?.name ?? r?.name, error: `No price found. ${fetchNote}${pageNote}${b.note ? "; " + b.note : ""}` };
}

/** rates = units per 1 USD */
export async function getRates(previous) {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j?.rates?.USD) return j.rates;
  } catch {}
  return previous ?? { USD: 1, AUD: 1.53, GBP: 0.79, EUR: 0.92, JPY: 150, CAD: 1.36, INR: 83, SGD: 1.34, NZD: 1.65, AED: 3.67, BRL: 5, KRW: 1350 };
}
export const convert = (a, from, to, rates) => (from === to || !rates[from] || !rates[to] ? a : (a / rates[from]) * rates[to]);
export const fmt = (a, c) => {
  const z = c === "JPY" || c === "KRW";
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: c, minimumFractionDigits: z ? 0 : 2, maximumFractionDigits: z ? 0 : 2 }).format(a); }
  catch { return `${c} ${a.toFixed(z ? 0 : 2)}`; }
};
