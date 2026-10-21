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
const num = (v) => { if (v == null) return; const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : undefined; };
function* walk(n) {
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (n && typeof n === "object") { yield n; for (const k of Object.keys(n)) yield* walk(n[k]); }
}
function fromOffers(offers) {
  for (const o of Array.isArray(offers) ? offers : [offers]) {
    if (!o) continue;
    const price = num(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
    if (price) return { price, currency: o.priceCurrency ?? o.priceSpecification?.priceCurrency };
  }
  return {};
}

export async function scrapeProduct(url) {
  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow", signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `Store returned HTTP ${res.status} (likely blocks automated requests)` };
    html = await res.text();
  } catch (e) { return { error: `Could not load page: ${e?.message ?? "network error"}` }; }

  let name, price, currency;
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const n of walk(JSON.parse(b[1].trim()))) {
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          name ??= typeof n.name === "string" ? n.name : undefined;
          if (!price) { const r = fromOffers(n.offers); price = r.price; currency = r.currency; }
        }
      }
    } catch {}
    if (price) break;
  }
  const meta = (p) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, "i"))?.[1];
  if (!price) { price = num(meta("product:price:amount") ?? meta("og:price:amount")); currency ??= meta("product:price:currency") ?? meta("og:price:currency"); }
  name ??= meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!price) return { name, error: "Could not find a price on this page (store may render prices with JavaScript or block bots)" };
  return { name, price, currency };
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
