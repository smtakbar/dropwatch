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
  [/flipkart/, "Flipkart"], [/myntra/, "Myntra"], [/nykaa/, "Nykaa"], [/tatacliq/, "Tata CLiQ"], [/ajio/, "Ajio"], [/lazada/, "Lazada"], [/coupang/, "Coupang"], [/noon\./, "Noon"],
  [/mercadolivre/, "Mercado Livre"], [/yodobashi/, "Yodobashi"], [/fnac/, "Fnac"], [/mediamarkt/, "MediaMarkt"],
  [/ebgames/, "EB Games"], [/vijaysales/, "Vijay Sales"], [/croma/, "Croma"], [/reliancedigital/, "Reliance Digital"],
  [/courts\.com\.sg/, "Courts"], [/challenger\.sg/, "Challenger"], [/ldlc/, "LDLC"], [/kabum/, "KaBuM"],
  [/memoryexpress/, "Memory Express"], [/canadacomputers/, "Canada Computers"], [/pbtech/, "PB Tech"],
  [/kakaku/, "Kakaku.com"], [/danawa/, "Danawa"], [/scorptec/, "Scorptec"], [/umart/, "Umart"],
];

function detectFromUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|fbclid|gclid|msclkid|tag$|linkcode|th$|psc$|smid|sprefix|cid$)/i.test(k)) u.searchParams.delete(k);
  const host = u.hostname.replace(/^www\./, "");
  const DOM = [[/(^|\.)(ldlc|fnac|darty|boulanger|cdiscount)\.com$/, "FR"], [/(^|\.)kakaku\.com$/, "JP"], [/(^|\.)danawa\.com$/, "KR"], [/(^|\.)(memoryexpress|canadacomputers)\.com$/, "CA"], [/(^|\.)(noon|sharafdg)\.com$/, "AE"], [/(^|\.)(vijaysales|myntra|flipkart|nykaa|tatacliq|croma|ajio|bigbasket|snapdeal|jiomart|meesho|firstcry|pepperfry|lenskart)\.com$/, "IN"], [/(^|\.)(courts|challenger)\.com\.sg$/, "SG"]];
  // Country comes only from explicit signals: known store, country domain, a locale in the path or subdomain, or the US store list.
  // A bare .com is NOT assumed to be American (global shops such as zara.com serve every country from one domain).
  const CC = { au: "AU", us: "US", gb: "GB", uk: "GB", ca: "CA", de: "DE", fr: "FR", jp: "JP", in: "IN", sg: "SG", nz: "NZ", ae: "AE", br: "BR", kr: "KR" };
  const pathLocale = () => {
    const seg = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    let m = seg.match(/^([a-z]{2})$/); if (m && CC[m[1]]) return CC[m[1]];
    m = seg.match(/^[a-z]{2}[-_]([a-z]{2})$/); if (m && CC[m[1]]) return CC[m[1]];
    m = seg.match(/^([a-z]{2})[-_][a-z]{2}$/); if (m && CC[m[1]]) return CC[m[1]];
    return null;
  };
  const subLocale = () => { const parts = host.split("."); return parts.length > 2 && CC[parts[0].toLowerCase()] ? CC[parts[0].toLowerCase()] : null; };
  const explicit = DOM.find(([re]) => re.test(host))?.[1] ?? TLD.find(([re]) => re.test(host))?.[1] ?? pathLocale() ?? subLocale() ?? null;
  const country = explicit ?? (isTrusted(u.toString(), "US") && !isTrusted(u.toString(), "AU") ? "US" : null);
  const retailer = RETAILERS.find(([re]) => re.test(host))?.[1] ?? host;
  return { url: u.toString(), retailer, country, explicit: !!explicit };
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

const normGtin = (v) => { const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, ""); return d.length >= 8 ? d : undefined; };
const normMpn = (v) => { const m = String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); return m.length >= 4 ? m : undefined; };
/** Does a candidate listing sell the same product? Barcode first, then manufacturer part number, then strict title match. */
function matchOffer(ids, cand, ref, title) {
  if (ids.gtin && cand.gtin) return ids.gtin === cand.gtin && similarity(ref, title) >= 0.4 ? "gtin" : null;
  if (ids.mpn && cand.mpn) return ids.mpn === cand.mpn && similarity(ref, title) >= 0.4 ? "mpn" : null;
  return similarity(ref, title) >= 0.8 ? "title" : null;
}
/** Extract name/price/currency from HTML. Order: JSON-LD, meta tags, __NEXT_DATA__ JSON. */
function parseHtml(html, country, base = "https://example.com") {
  let name, price, currency, via, image, inStock, gtin, mpn;
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const n of walk(JSON.parse(b[1].trim()))) {
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          name ??= typeof n.name === "string" ? n.name : undefined;
          gtin ??= normGtin(n.gtin13 ?? n.gtin14 ?? n.gtin12 ?? n.gtin8 ?? n.gtin ?? n.isbn);
          mpn ??= normMpn(n.mpn);
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
  return { name, price, currency, via, image, inStock, gtin, mpn, diag: { bytes: html.length, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60), jsonld: /ld\+json/i.test(html), nextData: !!nd } };
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
  US: ["amazon.com", "ebay.com", "walmart.com", "target.com", "bestbuy.com", "costco.com", "homedepot.com", "lowes.com", "newegg.com", "macys.com", "kohls.com", "nordstrom.com", "cvs.com", "walgreens.com", "kroger.com", "samsclub.com", "bhphotovideo.com", "adorama.com", "ulta.com", "sephora.com", "apple.com", "dell.com", "staples.com", "officedepot.com", "chewy.com", "wayfair.com", "gamestop.com", "microcenter.com", "bhphotovideo.com", "adorama.com"],
  GB: ["amazon.co.uk", "ebay.co.uk", "argos.co.uk", "currys.co.uk", "johnlewis.com", "tesco.com", "sainsburys.co.uk", "asda.com", "boots.com", "superdrug.com", "very.co.uk", "ao.com", "screwfix.com", "diy.com", "next.co.uk", "marksandspencer.com", "lookfantastic.com", "apple.com", "scan.co.uk", "overclockers.co.uk", "box.co.uk", "ebuyer.com", "very.co.uk"],
  CA: ["amazon.ca", "ebay.ca", "bestbuy.ca", "walmart.ca", "canadiantire.ca", "costco.ca", "shoppersdrugmart.ca", "londondrugs.com", "homedepot.ca", "staples.ca", "apple.com", "memoryexpress.com", "canadacomputers.com", "newegg.ca", "bestbuy.ca", "thesource.ca"],
  IN: ["amazon.in", "flipkart.com", "croma.com", "reliancedigital.in", "tatacliq.com", "myntra.com", "nykaa.com", "bigbasket.com", "apple.com", "vijaysales.com", "croma.com", "ajio.com", "snapdeal.com", "jiomart.com", "meesho.com", "firstcry.com", "lenskart.com"],
  DE: ["amazon.de", "ebay.de", "mediamarkt.de", "saturn.de", "otto.de", "dm.de", "rossmann.de", "apple.com", "notebooksbilliger.de", "alternate.de", "cyberport.de", "mindfactory.de", "conrad.de", "expert.de"],
  FR: ["amazon.fr", "fnac.com", "darty.com", "cdiscount.com", "boulanger.com", "carrefour.fr", "apple.com", "ldlc.com", "materiel.net", "rueducommerce.fr", "leclerc.fr"],
  JP: ["amazon.co.jp", "rakuten.co.jp", "yodobashi.com", "biccamera.com", "apple.com", "kakaku.com", "joshin.co.jp", "nojima.co.jp", "ksdenki.com", "kojima.net"],
  SG: ["amazon.sg", "lazada.sg", "shopee.sg", "courts.com.sg", "harveynorman.com.sg", "apple.com", "challenger.sg", "qoo10.sg", "lazada.sg"],
  NZ: ["amazon.com.au", "mightyape.co.nz", "pbtech.co.nz", "noelleeming.co.nz", "countdown.co.nz", "thewarehouse.co.nz", "harveynorman.co.nz", "chemistwarehouse.co.nz", "apple.com", "pbtech.co.nz", "mightyape.co.nz", "jbhifi.co.nz", "warehousestationery.co.nz", "bunnings.co.nz"],
  AE: ["amazon.ae", "noon.com", "sharafdg.com", "carrefouruae.com", "apple.com", "jumbo.ae", "lulu.ae", "eros.ae", "emaxme.com"],
  BR: ["amazon.com.br", "mercadolivre.com.br", "magazineluiza.com.br", "americanas.com.br", "apple.com", "kabum.com.br", "casasbahia.com.br", "pontofrio.com.br", "extra.com.br", "shoptime.com.br"],
  KR: ["amazon.co.kr", "coupang.com", "gmarket.co.kr", "11st.co.kr", "apple.com", "danawa.com", "auction.co.kr", "ssg.com", "lotteon.com"],
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
// At most 3 relay requests at once, so the free relays do not rate-limit us when several pages load together.
const _blocked = new Set();
const hostBlocked = (u) => { try { return _blocked.has(new URL(u).hostname.replace(/^www\d?\./, "")); } catch { return false; } };
let _active = 0; const _wait = [];
const _slot = () => new Promise((res) => { const go = () => { _active++; res(); }; _active < 3 ? go() : _wait.push(go); });
const _free = () => { _active--; const n = _wait.shift(); if (n) n(); };
async function fetchHtml(url) {
  await _slot();
  try { return await fetchHtmlInner(url); } finally { _free(); }
}
async function fetchHtmlInner(url) {
  const enc = encodeURIComponent(url);
  const tries = [
    [`https://api.allorigins.win/raw?url=${enc}`, {}],
    [`https://r.jina.ai/${url}`, { headers: { "x-return-format": "html" } }],
  ];
  // Race all relays in parallel; the first usable page wins. One retry after a short pause.
  const one = async ([u, opt]) => {
    const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error("bad status");
    const h = await r.text();
    if (h.length <= 800) throw new Error("too short");
    // A bot-check page is not the product page. Say so instead of pretending the store is just slow.
    if (h.length < 30000 && /<title>\s*(Just a moment|Attention Required|Access Denied|Robot or human|Pardon Our Interruption)|cf-chl-|_Incapsula_Resource|px-captcha/i.test(h)) { try { _blocked.add(new URL(url).hostname.replace(/^www\d?\./, "")); } catch {} throw new Error("blocked"); }
    return h;
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await Promise.any(tries.map(one)); } catch {}
    await new Promise((r) => setTimeout(r, 3000));
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
  // A country stated by the link (store, country domain, /au/ in the path) always wins. Otherwise assume the visitor pasted it from their own region.
  if (d && !d.explicit && region && (d.country == null || isTrusted(d.url, region))) d.country = region;
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
  const kl = { AU: "au-en", US: "us-en", GB: "uk-en", CA: "ca-en", IN: "in-en", DE: "de-de", FR: "fr-fr", JP: "jp-jp", SG: "sg-en", NZ: "nz-en", AE: "xa-en", BR: "br-pt", KR: "kr-kr" }[country] ?? "wt-wt";
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
    if (!r.price) return null;
    const how = matchOffer({ gtin: it.gtin, mpn: it.mpn }, r, ref, r.name);
    if (!how) return null;
    return { match: how, store: new URL(u).hostname.replace(/^www\./, ""), url: cleanUrl(u), price: r.price, currency: r.currency, title: String(r.name ?? "").slice(0, 120), image: r.image ?? null };
  }));
  return out.filter(Boolean);
}

/** Refresh one item. Returns {item, dropped} where dropped is true when the price fell at least 10%. */
async function refreshItem(it, rates, { offers = false, pub = null } = {}) {
  const now = new Date().toISOString();
  const prev = it.price;
  it.checkedAt = now;
  if (it.url) {
    const html = await fetchHtml(it.url);
    if (!html && hostBlocked(it.url)) {
      it.blocked = true;
      it.error = `${it.retailer || "This store"} blocks automated price reads (it shows a bot check). DropWatch does not bypass that. You can type the price you see, and other stores are still compared.`;
    }
    else if (!html) it.error = "Could not reach this store right now. We will try again.";
    else {
      const r = parseHtml(html, it.storeCountry, it.url);
      if (r.name) it.matchName = String(r.name).replace(/^buy\s+/i, "").replace(/\s*[|\-–]\s*[^|\-–]*$/, "").trim() || it.matchName;
      if (r.image) it.image = r.image;
      if (r.gtin) it.gtin = r.gtin;
      if (r.mpn) it.mpn = r.mpn;
      if (r.inStock !== undefined) it.inStock = r.inStock;
      if (r.price) { it.price = r.price; it.currency = r.currency ?? it.currency ?? CUR[it.storeCountry] ?? "USD"; it.error = null; it.blocked = false; it.manual = false; it.priceFrom = null; pushHistory(it, r.price, now); }
      else it.error = "We could not read a price from this store.";
    }
  }
  if (offers || !it.offersAt || Date.now() - Date.parse(it.offersAt) > 12 * 3600e3) {
    try { it.offers = await findOffers(it); it.offersAt = now; } catch {}
    if (it.blocked && !it.manual && it.offers.length) {
      const best = [...it.offers].filter((o) => !o.own).sort((a, b) => convert(a.price, a.currency, "USD", rates) - convert(b.price, b.currency, "USD", rates))[0];
      if (best) { it.price = best.price; it.currency = best.currency; it.priceFrom = best.store; it.image = it.image ?? best.image; pushHistory(it, best.price, now); }
    }
    if (!it.url && it.offers.length) {
      const best = [...it.offers].sort((a, b) => convert(a.price, a.currency, "USD", rates) - convert(b.price, b.currency, "USD", rates))[0];
      it.retailer = best.store; it.price = best.price; it.currency = best.currency; it.image = it.image ?? best.image; it.error = null;
      pushHistory(it, best.price, now);
    } else if (!it.url && !it.price) it.error = "No matching listing found at trusted stores yet. A product link works best.";
    it.image = it.image ?? it.offers.find((o) => o.image)?.image ?? null;
  }
  if (pub) mergePublic(it, pub);
  if (it.price) { it.insight = insight(it.history, it.price, it.storeCountry); it.advice = advise(it, rates); }
  const dropped = prev != null && it.price != null && it.price <= prev * 0.9;
  return { item: it, dropped };
}

/** Transparent deal rule. Not a prediction: it only compares today's price with the last 30 days of readings. */
function dealRule(history, price, now = Date.now()) {
  const pts = (history ?? []).map(([t, p]) => [Date.parse(t), p]).filter(([t, p]) => now - t <= 30 * 864e5 && p > 0);
  const note = "Rule: Good deal if the price is within 3% of the 30-day low; Fair if at or below the 30-day median; otherwise Above usual. It needs 3 or more readings. This is a rule, not a forecast.";
  if (!price || pts.length < 3) return { level: "none", label: "Not enough history yet", n: pts.length, note };
  const v = pts.map((x) => x[1]), low = Math.min(...v), med = median(v);
  const level = price <= low * 1.03 ? "good" : price <= med ? "fair" : "above";
  return { level, label: { good: "Good deal", fair: "Fair price", above: "Above usual" }[level], low, median: med, n: pts.length, note };
}

const normUrl = (u) => { try { const x = new URL(u); return (x.origin + x.pathname).replace(/\/$/, "").toLowerCase(); } catch { return String(u).toLowerCase(); } };
const REPO = (typeof location !== "undefined" && location.hostname.endsWith(".github.io")) ? `${location.hostname.split(".")[0]}/${location.pathname.split("/")[1]}` : "smtakbar/dropwatch";

/** Public, openly licensed price log kept by the project's scheduled job. */
async function loadPublic() {
  try {
    const base = `https://raw.githubusercontent.com/${REPO}/main/data/`;
    const [seed, csv] = await Promise.all([fetch(base + "seed.json").then((r) => r.json()), fetch(base + "prices.csv").then((r) => r.text())]);
    const hist = {};
    for (const line of csv.split("\n").slice(1)) {
      const [ts, id, store, price, cur, stock] = line.split(",");
      if (!id || !(+price > 0)) continue;
      (hist[id] ??= { currency: cur, rows: [] }).rows.push([ts, +price, stock]);
    }
    return seed.map((p) => ({ ...p, currency: hist[p.id]?.currency ?? "AUD", history: (hist[p.id]?.rows ?? []).map(([t, v]) => [t, v]), inStock: hist[p.id]?.rows.at(-1)?.[2] === "0" ? false : true, key: normUrl(p.url) }));
  } catch { return []; }
}
function mergePublic(it, pub) {
  const m = (pub ?? []).find((p) => p.key === normUrl(it.url));
  if (!m || !m.history.length) return;
  const seen = new Set(it.history.map((h) => h[0]));
  it.history = [...it.history, ...m.history.filter((h) => !seen.has(h[0]))].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).slice(-300);
  it.publicHistory = m.history.length;
}

/** Price protection: if the price falls after you bought, tell you while the store's adjustment window is still open. */
function protection(it, nowMs = Date.now()) {
  const b = it.bought; if (!b || !(b.price > 0) || it.price == null) return null;
  const cur = b.currency && it.currency && b.currency !== it.currency ? null : it.price;
  if (cur == null) return null;
  const end = Date.parse(b.date) + (b.days || 14) * 864e5, left = Math.ceil((end - nowMs) / 864e5);
  const diff = Math.round((b.price - cur) * 100) / 100;
  if (nowMs > end) return { state: "expired", left: 0, diff, until: new Date(end).toISOString(), paid: b.price };
  return { state: diff >= Math.max(0.01, b.price * 0.02) ? "claim" : "watching", left, diff, until: new Date(end).toISOString(), paid: b.price };
}

// ---- History from other trackers (read-only, only on request, public pages that robots.txt allows) ----
const CCC = { com: ["camelcamelcamel.com", "USD"], "com.au": ["au.camelcamelcamel.com", "AUD"], "co.uk": ["uk.camelcamelcamel.com", "GBP"], ca: ["ca.camelcamelcamel.com", "CAD"], de: ["de.camelcamelcamel.com", "EUR"], fr: ["fr.camelcamelcamel.com", "EUR"], es: ["es.camelcamelcamel.com", "EUR"], it: ["it.camelcamelcamel.com", "EUR"] };
const money = (t) => { const m = String(t ?? "").replace(/\s/g, "").match(/[\d.,]+/); if (!m) return; let v = m[0]; if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", "."); else v = v.replace(/,/g, ""); const n = parseFloat(v); return n > 0 ? n : undefined; };
const toks = (t) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1);
/** Share of the product's words found in a tracker page title; every model number must appear. */
function titleCover(ref, title) {
  const a = [...new Set(toks(ref))], b = new Set(toks(title));
  if (!a.length) return 0;
  const hit = a.filter((w) => b.has(w));
  if (a.some((w) => /\d/.test(w) && w.length >= 3 && !b.has(w))) return 0;
  return hit.length / a.length;
}
function asinOf(it) {
  const urls = [it.url, ...(it.offers || []).map((o) => o.url)].filter(Boolean);
  for (const u of urls) { const m = String(u).match(/^https?:\/\/(?:www\.)?amazon\.(com\.au|com|co\.uk|ca|de|fr|es|it)\/(?:.*?\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/); if (m) return { tld: m[1], asin: m[2] }; }
}
function parseCCC(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("tr.pt.amazon") || doc.querySelector("tr.pt");
  if (!row) return null;
  const c = [...row.querySelectorAll("td")].slice(1).map((td) => ({ v: money(td.textContent), d: td.querySelector("small")?.textContent.replace(/[()]/g, "").trim() }));
  if (c.length < 4 || !c[0].v) return null;
  const asOf = (doc.querySelector('th span[title^="Last checked"]')?.getAttribute("title") || "").replace(/^Last checked\s*/, "").replace(/\.$/, "");
  return { low: c[0].v, lowDate: c[0].d, high: c[1].v, highDate: c[1].d, current: c[2].v, avg: c[3].v, asOf, title: (doc.querySelector("h1,title")?.textContent || "").trim() };
}
function parsePH(html) {
  const d = html.match(/Lowest Price:\s*([^\s|]+)\s*\|\s*Average Price:\s*([^\s|]+)\s*\|\s*Highest Price:\s*([^\s|]+)/);
  if (!d) return null;
  const cur = html.match(/Price in India on (\d\d\/\d\d\/\d{4}):\s*([^\s.|<]+)/);
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").replace(/\s*-\s*Price History\s*$/i, "");
  return { low: money(d[1]), avg: money(d[2]), high: money(d[3]), current: money(cur?.[2]), asOf: cur?.[1], title };
}
/** Good / okay / wait by comparing the price you see now with the tracker's own low, average and high. A rule, not a forecast. */
function trackerVerdict(s, now) {
  if (!s || now == null || !s.low || !s.avg) return null;
  if (now <= s.low * 1.03) return { level: "good", label: "At or near its lowest price on record" };
  if (now <= s.avg * 0.9) return { level: "good", label: "Well below its usual price" };
  if (now <= s.avg * 1.05) return { level: "ok", label: "Around its usual price" };
  return { level: "wait", label: "Above its usual price" };
}
async function trackerHistory(it) {
  const out = [], ref = matchTitle(it);
  if ((it.storeCountry ?? it.country) === "IN" && ref) {
    const q = `site:pricehistory.app ${ref.split(/\s+/).slice(0, 12).join(" ")}`;
    const res = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=in-en`);
    const links = res ? [...res.matchAll(/href=["'][^"']*uddg=([^"'&]+)/gi)].map((m) => { try { return decodeURIComponent(m[1]); } catch { return ""; } }).filter((u) => /^https:\/\/pricehistory\.app\/p\//.test(u)) : [];
    for (const url of links.slice(0, 2)) {
      const html = await fetchHtml(url);
      const s = html && parsePH(html);
      if (s && titleCover(ref, s.title) >= 0.6) { out.push({ source: "pricehistory.app", url, currency: "INR", ...s, note: "Amazon India and Flipkart history, as reported by pricehistory.app." }); break; }
    }
  }
  it.trackers = out; it.trackersAt = new Date().toISOString();
  return out;
}

function setManualPrice(it, price) {
  const v = parseFloat(price); if (!(v > 0)) return false;
  it.price = v; it.currency = it.currency || CUR[it.storeCountry] || "USD"; it.manual = true; it.priceFrom = null; it.error = null;
  pushHistory(it, v, new Date().toISOString()); return true;
}
window.DW = { setManualPrice, protection, matchOffer, normGtin, normMpn, trackerHistory, trackerVerdict, titleCover, parseCCC, parsePH, money, normKey: normUrl, dealRule, loadPublic, mergePublic, CUR, detectFromUrl, parseHtml, insight, advise, similarity, matchTitle, isTrusted, convert, fmt, getRates, makeItem, refreshItem, findOffers, fetchHtml, tokens };
})();
