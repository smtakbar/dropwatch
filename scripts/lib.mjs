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
// Keys that hold OTHER products/sizes (variants, recommendations); never read prices from inside them.
const SKIP = /^(variations|bySizes|related\w*|similar\w*|recommend\w*|carousel\w*|upsell\w*|crossSell\w*)$/i;
function* walk(n, depth = 0, skip = false) {
  if (depth > 40) return;
  if (Array.isArray(n)) { for (const x of n) yield* walk(x, depth + 1, skip); return; }
  if (n && typeof n === "object") { yield n; for (const k of Object.keys(n)) if (!(skip && SKIP.test(k))) yield* walk(n[k], depth + 1, skip); }
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
export function parseHtml(html, country, base = "https://example.com") {
  let name, price, currency, via, image;
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const n of walk(JSON.parse(b[1].trim()))) {
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          name ??= typeof n.name === "string" ? n.name : undefined;
          image ??= [].concat(n.image ?? []).map((x) => (typeof x === "string" ? x : x?.url)).find(Boolean);
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
      for (const n of walk(JSON.parse(nd), 0, true)) {
        const v = typeof n.pricing?.now === "number" ? n.pricing.now : typeof n.currentPrice === "number" ? n.currentPrice : typeof n.salePrice === "number" ? n.salePrice : undefined;
        if (v > 0) { price = v; name ??= typeof n.name === "string" ? n.name : undefined; via = "next-data"; break; }
      }
    } catch {}
  }
  image ??= meta("og:image") ?? meta("twitter:image");
  if (image) { try { image = new URL(image.replace(/&amp;/g, "&"), base).toString(); } catch { image = undefined; } }
  name ??= meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  currency ??= CUR[country];
  return { name, price, currency, via, image, diag: { bytes: html.length, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60), jsonld: /ld\+json/i.test(html), nextData: !!nd } };
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
  let r = f.html ? parseHtml(f.html, country, url) : null;
  if (r?.price) return { name: r.name, price: r.price, currency: r.currency, image: r.image, via: "fetch:" + r.via };

  const b = await browserPage(url);
  const rb = b.html ? parseHtml(b.html, country, url) : null;
  if (rb?.price) return { name: rb.name ?? r?.name, price: rb.price, currency: rb.currency, image: rb.image ?? r?.image, via: "browser:" + rb.via };

  const d = (rb ?? r)?.diag;
  const fetchNote = f.err ? `fetch failed (${f.err})` : f.status !== 200 ? `fetch HTTP ${f.status}` : "fetch HTTP 200";
  const pageNote = d ? `, page "${d.title ?? "no title"}", ${Math.round(d.bytes / 1024)}kB, json-ld ${d.jsonld ? "yes" : "no"}, next-data ${d.nextData ? "yes" : "no"}` : "";
  return { name: rb?.name ?? r?.name, image: rb?.image ?? r?.image, error: `No price found. ${fetchNote}${pageNote}${b.note ? "; " + b.note : ""}` };
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

// ---- Price insight: history + seasonal sale calendar -> "buy now or wait" and predicted lowest month ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Typical extra discount vs. a normal month, by calendar month (0 = Jan). Southern-hemisphere EOFY (Jun) and Prime Day (Jul) included.
const SEASON = { AU: [0.08, 0.02, 0, 0, 0, 0.07, 0.07, 0, 0, 0.02, 0.15, 0.1], DEFAULT: [0.08, 0.02, 0, 0, 0, 0.02, 0.07, 0, 0, 0.02, 0.15, 0.1] };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function insight(history, price, country, now = new Date()) {
  const pts = (history ?? []).map(([t, p]) => [Date.parse(t), p]).filter(([t, p]) => Number.isFinite(t) && p > 0);
  if (!price || pts.length < 1) return null;
  const vals = pts.map((x) => x[1]);
  const lowest = Math.min(...vals), highest = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spanDays = (pts.at(-1)[0] - pts[0][0]) / 864e5;
  const cal = SEASON[country] ?? SEASON.DEFAULT;
  const baseline = median(vals);
  const cm = now.getUTCMonth();
  // Observed lowest month only counts once we have >= 60 days of data.
  let bestMonth, basis;
  if (spanDays >= 60) {
    const byMonth = {};
    for (const [t, p] of pts) { const m = new Date(t).getUTCMonth(); byMonth[m] = Math.min(byMonth[m] ?? Infinity, p); }
    const [m] = Object.entries(byMonth).sort((a, b) => a[1] - b[1])[0];
    bestMonth = +m; basis = "observed";
  } else {
    let m = 0; for (let i = 1; i < 12; i++) if (cal[i] > cal[m]) m = i;
    // Choose the next big sale month at/after now.
    const order = Array.from({ length: 12 }, (_, i) => (cm + i) % 12);
    bestMonth = order.sort((a, b) => cal[b] - cal[a] || order.indexOf(a) - order.indexOf(b))[0]; basis = "seasonal";
  }
  const predictedLow = +Math.min(lowest, baseline * (1 - Math.max(...cal))).toFixed(2);
  const vsLow = price / lowest - 1;
  const monthsAway = (bestMonth - cm + 12) % 12;
  let verdict;
  if (vsLow <= 0.01 && pts.length >= 3) verdict = "Lowest price seen: good time to buy";
  else if (vsLow <= 0.05) verdict = "Close to its lowest price";
  else if (monthsAway <= 1 && cal[bestMonth] > 0.05) verdict = `Wait: ${MONTHS[bestMonth]} sales are near`;
  else verdict = `Usually cheaper around ${MONTHS[bestMonth]}`;
  const confidence = spanDays >= 90 ? "high" : spanDays >= 30 ? "medium" : "low";
  return { lowest, highest, avg: +avg.toFixed(2), points: pts.length, days: Math.round(spanDays), bestMonth: MONTHS[bestMonth], predictedLow, verdict, confidence, basis };
}
