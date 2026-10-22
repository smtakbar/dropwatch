// DropWatch browser engine: reads prices, predicts, advises. Runs entirely in your browser.
(function(){
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

function detectFromUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|fbclid|gclid|msclkid|tag$|linkcode|th$|psc$|smid|sprefix|cid$)/i.test(k)) u.searchParams.delete(k);
  const host = u.hostname.replace(/^www\./, "");
  let country = TLD.find(([re]) => re.test(host))?.[1] ?? (/\.com$/.test(host) ? "US" : null);
  const retailer = RETAILERS.find(([re]) => re.test(host))?.[1] ?? host;
  return { url: u.toString(), retailer, country };
}


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
    if (price) return { price, currency: o.priceCurrency ?? o.priceSpecification?.priceCurrency, inStock: o.availability == null ? undefined : !/OutOfStock|SoldOut|Discontinued/i.test(String(o.availability)) };
  }
  return {};
}

/** Extract name/price/currency from HTML. Order: JSON-LD, meta tags, __NEXT_DATA__ JSON. */
function parseHtml(html, country, base = "https://example.com") {
  let name, price, currency, via, image, inStock;
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const n of walk(JSON.parse(b[1].trim()))) {
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          name ??= typeof n.name === "string" ? n.name : undefined;
          image ??= [].concat(n.image ?? []).map((x) => (typeof x === "string" ? x : x?.url)).find(Boolean);
          if (!price) { const r = fromOffers(n.offers); price = r.price; currency = r.currency; inStock = r.inStock; if (price) via = "json-ld"; }
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
  return { name, price, currency, via, image, inStock, diag: { bytes: html.length, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60), jsonld: /ld\+json/i.test(html), nextData: !!nd } };
}


// ---- Price insight: history + seasonal sale calendar -> "buy now or wait" and predicted lowest month ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Typical extra discount vs. a normal month, by calendar month (0 = Jan). Southern-hemisphere EOFY (Jun) and Prime Day (Jul) included.
const SEASON = { AU: [0.08, 0.02, 0, 0, 0, 0.07, 0.07, 0, 0, 0.02, 0.15, 0.1], DEFAULT: [0.08, 0.02, 0, 0, 0, 0.02, 0.07, 0, 0, 0.02, 0.15, 0.1] };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function insight(history, price, country, now = new Date()) {
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


// ---- Buy / wait advice, including the cheapest store across everything we found ----
function advise(it, rates, now = new Date()) {
  const ins = it.insight;
  if (!it.price || !ins) return null;
  const cal = SEASON[it.storeCountry] ?? SEASON.DEFAULT, cm = now.getUTCMonth();
  const usd = (p, c) => convert(p, c ?? it.currency, "USD", rates);
  const all = [{ store: it.retailer, url: it.url, price: it.price, currency: it.currency, own: true }, ...(it.offers ?? [])].filter((o) => o.price > 0);
  const bestO = all.reduce((a, b) => (usd(b.price, b.currency) < usd(a.price, a.currency) ? b : a));
  const saving = 1 - usd(bestO.price, bestO.currency) / usd(it.price, it.currency);
  const best = { store: bestO.store, url: bestO.url, price: bestO.price, currency: bestO.currency, own: !!bestO.own, saving: +Math.max(0, saving).toFixed(3) };
  const vsLow = it.price / ins.lowest - 1;
  let saleIn = null;
  for (let k = 1; k <= 2; k++) if (cal[(cm + k) % 12] >= 0.07) { saleIn = k; break; }
  const nextSale = saleIn ? MONTHS[(cm + saleIn) % 12] : null;
  let action, headline, reason;
  if (it.inStock === false) { action = "wait"; headline = "Wait: out of stock"; reason = "The store lists it as unavailable right now."; }
  else if (ins.points >= 3 && vsLow <= 0.02) { action = "buy"; headline = "Buy now"; reason = "This is the lowest price we have seen for it."; }
  else if (saving >= 0.05) { action = "buy"; headline = `Buy now at ${best.store}`; reason = `${best.store} is ${Math.round(saving * 100)}% cheaper than your tracked store.`; }
  else if (saleIn && vsLow > 0.02) { action = "wait"; headline = `Wait for ${nextSale} sales`; reason = `Prices usually dip then. A likely low is around ${fmt(ins.predictedLow, it.currency)}.`; }
  else if (vsLow <= 0.06) { action = "buy"; headline = "Buy now"; reason = "It is within 6% of the lowest price we have seen."; }
  else if (ins.points >= 5) { action = "wait"; headline = "Wait for a drop"; reason = `It is ${Math.round(vsLow * 100)}% above its lowest price.`; }
  else { action = "maybe"; headline = "Buy if you need it now"; reason = "We have too little price history to say it will get cheaper."; }
  return { action, headline, reason, best };
}

const STOP = new Set(["buy", "the", "and", "with", "for", "online", "pack", "new", "from", "at", "in", "of", "a", "an", "product", "products", "coles", "jb", "hi", "fi", "amazon", "au", "com"]);
const tokens = (s = "") => (String(s).toLowerCase().replace(/\|.*$/, "").replace(/(\d)\s+(ml|g|kg|l|oz|mg)\b/g, "$1$2").match(/[a-z0-9]+/g) ?? []).map((t) => t.replace(/ise(d|s)?$/, "ize$1")).filter((t) => !STOP.has(t));
const queryFor = (name) => tokens(name).slice(0, 7).join(" ");

/** How much of the tracked product's title (incl. numbers like 375ml/24) appears in the candidate. 0..1 */
function similarity(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  if (!A.length) return 0;
  // Sizes and counts (75ml, 375ml, 24...) must all match, otherwise it is a different product.
  if (A.filter((t) => /\d/.test(t)).some((t) => !B.has(t))) return 0;
  return A.filter((t) => B.has(t)).length / A.length;
}

/** Product links without search/tracking junk, so they open the product page cleanly. */
function cleanUrl(u) {
  try {
    const x = new URL(u);
    if (/\/itm\/\d+|\/dp\/[A-Z0-9]{10}|\/gp\/product\/[A-Z0-9]{10}/.test(x.pathname)) return x.origin + x.pathname;
    return detectFromUrl(u)?.url ?? u;
  } catch { return u; }
}

/** Plain-words product title for matching: scraped page title, else words from the link. Size/pack numbers matter. */
function matchTitle(item) {
  const fromUrl = (() => { try { return decodeURIComponent(new URL(item.url).pathname).replace(/[-_/+]+/g, " ").replace(/\b\d{5,}\b/g, " "); } catch { return ""; } })();
  const t = item.matchName || item.name || "";
  // Keep size/pack words from the link if the stored title lacks them (e.g. user typed just "Mountain Dew").
  return /\d/.test(t) ? t : `${t} ${fromUrl}`.trim();
}



const G = ["amazon", "ebay"];
const LIST = {
  AU: ["amazon.com.au", "ebay.com.au", "officeworks.com.au", "jbhifi.com.au", "harveynorman.com.au", "thegoodguys.com.au", "binglee.com.au", "bigw.com.au", "kmart.com.au", "target.com.au", "woolworths.com.au", "coles.com.au", "aldi.com.au", "iga.com.au", "chemistwarehouse.com.au", "priceline.com.au", "amcal.com.au", "terrywhite.com.au", "bunnings.com.au", "myer.com.au", "davidjones.com", "catch.com.au", "danmurphys.com.au", "bws.com.au", "liquorland.com.au", "firstchoiceliquor.com.au", "jbhifi.com.au", "rebelsport.com.au", "supercheapauto.com.au", "repco.com.au", "bcf.com.au", "anacondastores.com", "petbarn.com.au", "petstock.com.au", "mightyape.com.au", "ikea.com", "apple.com", "mydeal.com.au", "kogan.com", "cexs.com.au", "scorptec.com.au", "pccasegear.com", "umart.com.au", "centrecom.com.au", "mwave.com.au", "msy.com.au", "ebgames.com.au", "dyson.com.au", "sephora.com.au", "mecca.com", "adorebeauty.com.au", "lookfantastic.com.au", "ozhairandbeauty.com", "allbeauty.com", "pharmacydirect.com.au", "discountdrugstores.com.au"],
  US: ["amazon.com", "ebay.com", "walmart.com", "target.com", "bestbuy.com", "costco.com", "homedepot.com", "lowes.com", "newegg.com", "macys.com", "kohls.com", "nordstrom.com", "cvs.com", "walgreens.com", "kroger.com", "samsclub.com", "bhphotovideo.com", "adorama.com", "ulta.com", "sephora.com", "apple.com", "dell.com", "staples.com", "officedepot.com", "chewy.com", "wayfair.com", "gamestop.com"],
  GB: ["amazon.co.uk", "ebay.co.uk", "argos.co.uk", "currys.co.uk", "johnlewis.com", "tesco.com", "sainsburys.co.uk", "asda.com", "boots.com", "superdrug.com", "very.co.uk", "ao.com", "screwfix.com", "diy.com", "next.co.uk", "marksandspencer.com", "lookfantastic.com", "apple.com"],
  CA: ["amazon.ca", "ebay.ca", "bestbuy.ca", "walmart.ca", "canadiantire.ca", "costco.ca", "shoppersdrugmart.ca", "londondrugs.com", "homedepot.ca", "staples.ca", "apple.com"],
  IN: ["amazon.in", "flipkart.com", "croma.com", "reliancedigital.in", "tatacliq.com", "myntra.com", "nykaa.com", "bigbasket.com", "apple.com"],
  DE: ["amazon.de", "ebay.de", "mediamarkt.de", "saturn.de", "otto.de", "dm.de", "rossmann.de", "apple.com"],
  FR: ["amazon.fr", "fnac.com", "darty.com", "cdiscount.com", "boulanger.com", "carrefour.fr", "apple.com"],
  JP: ["amazon.co.jp", "rakuten.co.jp", "yodobashi.com", "biccamera.com", "apple.com"],
  SG: ["amazon.sg", "lazada.sg", "shopee.sg", "courts.com.sg", "harveynorman.com.sg", "apple.com"],
  NZ: ["amazon.com.au", "mightyape.co.nz", "pbtech.co.nz", "noelleeming.co.nz", "countdown.co.nz", "thewarehouse.co.nz", "harveynorman.co.nz", "chemistwarehouse.co.nz", "apple.com"],
  AE: ["amazon.ae", "noon.com", "sharafdg.com", "carrefouruae.com", "apple.com"],
  BR: ["amazon.com.br", "mercadolivre.com.br", "magazineluiza.com.br", "americanas.com.br", "apple.com"],
  KR: ["amazon.co.kr", "coupang.com", "gmarket.co.kr", "11st.co.kr", "apple.com"],
};
const bare = (h) => String(h).toLowerCase().replace(/^www\./, "");
function isTrusted(url, country) {
  let h; try { h = bare(new URL(url).hostname); } catch { return false; }
  return (LIST[country] ?? []).some((d) => h === d || h.endsWith("." + d));
}

// ---------------- browser-only parts ----------------
const convert = (a, from, to, rates) => (from === to || !rates[from] || !rates[to] ? a : (a / rates[from]) * rates[to]);
const fmt = (a, c) => {
  const z = c === "JPY" || c === "KRW";
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: c, minimumFractionDigits: z ? 0 : 2, maximumFractionDigits: z ? 0 : 2 }).format(a); }
  catch { return `${c} ${a.toFixed(z ? 0 : 2)}`; }
};
const FALLBACK_RATES = { USD: 1, AUD: 1.53, GBP: 0.79, EUR: 0.92, JPY: 150, CAD: 1.36, INR: 83, SGD: 1.34, NZD: 1.65, AED: 3.67, BRL: 5, KRW: 1350 };

/** Browsers cannot read other sites directly, so pages are fetched through public read-only relays (first one that answers wins). */
async function fetchHtml(url) {
  const enc = encodeURIComponent(url);
  const tries = [
    [`https://api.allorigins.win/raw?url=${enc}`, {}],
    [`https://corsproxy.io/?url=${enc}`, {}],
    [`https://r.jina.ai/${url}`, { headers: { "x-return-format": "html" } }],
  ];
  for (const [u, opt] of tries) {
    try {
      const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const h = await r.text();
      if (h.length > 800) return h;
    } catch {}
  }
  return null;
}

async function getRates() {
  try { const j = await (await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) })).json(); if (j?.rates?.USD) return j.rates; } catch {}
  return FALLBACK_RATES;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Create a local item from what the person typed: a link, or a product name. */
function makeItem(input, name, region) {
  const v = input.trim();
  const d = /^https?:\/\//i.test(v) || (/^[^\s]+\.[a-z]{2,}(\/|$)/i.test(v) && !/\s/.test(v)) ? detectFromUrl(v) : null;
  if (d) return { id: uid(), url: d.url, name: (name || "").trim().slice(0, 120), retailer: d.retailer, storeCountry: d.country ?? region, country: d.country ?? region, history: [], offers: [], addedAt: new Date().toISOString() };
  return { id: uid(), url: "", name: v.slice(0, 120), retailer: null, storeCountry: region, country: region, history: [], offers: [], addedAt: new Date().toISOString() };
}

function pushHistory(it, price, now) {
  const last = it.history.at(-1);
  if (!last || last[1] !== price || Date.parse(now) - Date.parse(last[0]) > 86400000) it.history.push([now, price]);
  it.history = it.history.slice(-300);
}

/** Search the web for the same product at established retailers in the person's country. */
async function findOffers(it, { max = 6 } = {}) {
  const country = it.storeCountry ?? "US";
  const ref = matchTitle(it);
  const kl = { AU: "au-en", US: "us-en", GB: "uk-en", CA: "ca-en", IN: "in-en", DE: "de-de", FR: "fr-fr", JP: "jp-jp", SG: "sg-en", NZ: "nz-en" }[country] ?? "wt-wt";
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryFor(ref) + " buy")}&kl=${kl}`);
  if (!html) return [];
  const own = it.url ? new URL(it.url).hostname.replace(/^www\./, "") : "";
  const seen = new Set([own]), urls = [];
  for (const m of html.matchAll(/href=["'][^"']*uddg=([^"'&]+)/gi)) {
    let u; try { u = decodeURIComponent(m[1]); new URL(u); } catch { continue; }
    const h = new URL(u).hostname.replace(/^www\./, "");
    if (seen.has(h) || !isTrusted(u, country)) continue;
    seen.add(h); urls.push(u);
    if (urls.length >= max) break;
  }
  const out = await Promise.all(urls.map(async (u) => {
    const page = await fetchHtml(u);
    if (!page) return null;
    const r = parseHtml(page, country, u);
    if (!r.price || similarity(ref, r.name) < 0.8) return null;
    return { store: new URL(u).hostname.replace(/^www\./, ""), url: cleanUrl(u), price: r.price, currency: r.currency, title: String(r.name ?? "").slice(0, 120), image: r.image ?? null };
  }));
  return out.filter(Boolean);
}

/** Refresh one item. Returns {item, dropped} where dropped is true when the price fell at least 10%. */
async function refreshItem(it, rates, { offers = false } = {}) {
  const now = new Date().toISOString();
  const prev = it.price;
  it.checkedAt = now;
  if (it.url) {
    const html = await fetchHtml(it.url);
    if (!html) it.error = "Could not reach this store right now. We will try again.";
    else {
      const r = parseHtml(html, it.storeCountry, it.url);
      if (r.name) it.matchName = String(r.name).replace(/^buy\s+/i, "").replace(/\s*[|\-–]\s*[^|\-–]*$/, "").trim() || it.matchName;
      if (r.image) it.image = r.image;
      if (r.inStock !== undefined) it.inStock = r.inStock;
      if (r.price) { it.price = r.price; it.currency = r.currency ?? it.currency ?? CUR[it.storeCountry] ?? "USD"; it.error = null; pushHistory(it, r.price, now); }
      else it.error = "We could not read a price from this store.";
    }
  }
  if (offers || !it.offersAt || Date.now() - Date.parse(it.offersAt) > 12 * 3600e3) {
    try { it.offers = await findOffers(it); it.offersAt = now; } catch {}
    if (!it.url && it.offers.length) {
      const best = [...it.offers].sort((a, b) => convert(a.price, a.currency, "USD", rates) - convert(b.price, b.currency, "USD", rates))[0];
      it.retailer = best.store; it.price = best.price; it.currency = best.currency; it.image = it.image ?? best.image; it.error = null;
      pushHistory(it, best.price, now);
    } else if (!it.url && !it.price) it.error = "No matching listing found at trusted stores yet. A product link works best.";
    it.image = it.image ?? it.offers.find((o) => o.image)?.image ?? null;
  }
  if (it.price) { it.insight = insight(it.history, it.price, it.storeCountry); it.advice = advise(it, rates); }
  const dropped = prev != null && it.price != null && it.price <= prev * 0.9;
  return { item: it, dropped };
}

window.DW = { CUR, detectFromUrl, parseHtml, insight, advise, similarity, matchTitle, isTrusted, convert, fmt, getRates, makeItem, refreshItem, findOffers, fetchHtml, tokens };
})();
