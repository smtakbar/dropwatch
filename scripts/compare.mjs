// Finds the same product at other stores: searches each store in a real Chrome, opens the top results,
// reads their price, and keeps only results whose title closely matches the tracked product.
import { parseHtml, detectFromUrl } from "./lib.mjs";
import { isTrusted, trustedStoreName } from "./trusted.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const S = (name, search, link) => ({ name, search, link: new RegExp(link) });
export const STORES = {
  AU: [
    S("Amazon AU", "https://www.amazon.com.au/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"),
    S("JB Hi-Fi", "https://www.jbhifi.com.au/search?query={q}", "/products/[a-z0-9-]+"),
    S("Officeworks", "https://www.officeworks.com.au/shop/officeworks/search?q={q}", "/shop/officeworks/p/[a-z0-9-]+"),
    S("Harvey Norman", "https://www.harveynorman.com.au/catalogsearch/result/?q={q}", "harveynorman\\.com\\.au/[a-z0-9-]+\\.html"),
    S("The Good Guys", "https://www.thegoodguys.com.au/SearchDisplay?searchTerm={q}", "thegoodguys\\.com\\.au/[a-z0-9-]{12,}"),
    S("Big W", "https://www.bigw.com.au/search?q={q}", "/product/[a-z0-9-]+/p/\\d+"),
    S("Kmart", "https://www.kmart.com.au/search/?searchTerm={q}", "/product/[a-z0-9-]+-\\d+"),
    S("Woolworths", "https://www.woolworths.com.au/shop/search/products?searchTerm={q}", "/shop/productdetails/\\d+"),
    S("Coles", "https://www.coles.com.au/search/products?q={q}", "/product/[a-z0-9-]+-\\d+"),
    S("eBay AU", "https://www.ebay.com.au/sch/i.html?_nkw={q}", "/itm/\\d+"),
    S("Chemist Warehouse", "https://www.chemistwarehouse.com.au/search?searchtext={q}&searchmode=allwords", "/buy/\\d+/[a-z0-9-]+"),
    S("Priceline", "https://www.priceline.com.au/search?q={q}", "priceline\\.com\\.au/[a-z0-9-]+-\\d{4,}"),
    S("Catch", "https://www.catch.com.au/search?query={q}", "/product/[a-z0-9-]+-\\d+"),
    S("Bing Lee", "https://www.binglee.com.au/search?q={q}", "binglee\\.com\\.au/products/[a-z0-9-]+"),
    S("MyDeal", "https://www.mydeal.com.au/search?q={q}", "mydeal\\.com\\.au/[a-z0-9-]+-\\d+"),
  ],
  US: [
    S("Amazon US", "https://www.amazon.com/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"),
    S("Best Buy", "https://www.bestbuy.com/site/searchpage.jsp?st={q}", "/site/[a-z0-9-]+/\\d+\\.p"),
    S("Walmart", "https://www.walmart.com/search?q={q}", "/ip/[a-z0-9-]+/\\d+"),
    S("Target", "https://www.target.com/s?searchTerm={q}", "/p/[a-z0-9-]+/-/A-\\d+"),
    S("Newegg", "https://www.newegg.com/p/pl?d={q}", "newegg\\.com/[a-z0-9-]+/p/[A-Z0-9-]+"),
    S("eBay US", "https://www.ebay.com/sch/i.html?_nkw={q}", "/itm/\\d+"),
  ],
  GB: [
    S("Amazon UK", "https://www.amazon.co.uk/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"),
    S("Argos", "https://www.argos.co.uk/search/{q}/", "/product/\\d+"),
    S("Currys", "https://www.currys.co.uk/search?q={q}", "currys\\.co\\.uk/[a-z0-9-/]+\\.html"),
    S("John Lewis", "https://www.johnlewis.com/search?search-term={q}", "/[a-z0-9-]+/p\\d+"),
    S("eBay UK", "https://www.ebay.co.uk/sch/i.html?_nkw={q}", "/itm/\\d+"),
  ],
  CA: [S("Amazon CA", "https://www.amazon.ca/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"), S("Best Buy CA", "https://www.bestbuy.ca/en-ca/search?search={q}", "/en-ca/product/[a-z0-9-]+/\\d+"), S("Walmart CA", "https://www.walmart.ca/en/search?q={q}", "/en/ip/[a-z0-9-]+/\\d+")],
  IN: [S("Amazon IN", "https://www.amazon.in/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"), S("Flipkart", "https://www.flipkart.com/search?q={q}", "/[a-z0-9-]+/p/itm[a-z0-9]+")],
  DE: [S("Amazon DE", "https://www.amazon.de/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"), S("MediaMarkt", "https://www.mediamarkt.de/de/search.html?query={q}", "/de/product/[a-z0-9-_]+")],
  NZ: [S("Amazon AU (ships NZ)", "https://www.amazon.com.au/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}")],
};
for (const c of ["FR", "JP", "SG", "AE", "BR", "KR"]) STORES[c] ??= [];
STORES.JP.push(S("Amazon JP", "https://www.amazon.co.jp/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"));
STORES.FR.push(S("Amazon FR", "https://www.amazon.fr/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"));
STORES.SG.push(S("Amazon SG", "https://www.amazon.sg/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"));
STORES.AE.push(S("Amazon AE", "https://www.amazon.ae/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"));
STORES.BR.push(S("Amazon BR", "https://www.amazon.com.br/s?k={q}", "/(?:[^/\"?]+/)?dp/[A-Z0-9]{10}"));

const STOP = new Set(["buy", "the", "and", "with", "for", "online", "pack", "new", "from", "at", "in", "of", "a", "an", "product", "products", "coles", "jb", "hi", "fi", "amazon", "au", "com"]);
export const tokens = (s = "") => (String(s).toLowerCase().replace(/\|.*$/, "").replace(/(\d)\s+(ml|g|kg|l|oz|mg)\b/g, "$1$2").match(/[a-z0-9]+/g) ?? []).map((t) => t.replace(/ise(d|s)?$/, "ize$1")).filter((t) => !STOP.has(t));
export const queryFor = (name) => tokens(name).slice(0, 7).join(" ");

/** How much of the tracked product's title (incl. numbers like 375ml/24) appears in the candidate. 0..1 */
export function similarity(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  if (!A.length) return 0;
  // Sizes and counts (75ml, 375ml, 24...) must all match, otherwise it is a different product.
  if (A.filter((t) => /\d/.test(t)).some((t) => !B.has(t))) return 0;
  return A.filter((t) => B.has(t)).length / A.length;
}

/** Product links without search/tracking junk, so they open the product page cleanly. */
export function cleanUrl(u) {
  try {
    const x = new URL(u);
    if (/\/itm\/\d+|\/dp\/[A-Z0-9]{10}|\/gp\/product\/[A-Z0-9]{10}/.test(x.pathname)) return x.origin + x.pathname;
    return detectFromUrl(u)?.url ?? u;
  } catch { return u; }
}

/** Plain-words product title for matching: scraped page title, else words from the link. Size/pack numbers matter. */
export function matchTitle(item) {
  const fromUrl = (() => { try { return decodeURIComponent(new URL(item.url).pathname).replace(/[-_/+]+/g, " ").replace(/\b\d{5,}\b/g, " "); } catch { return ""; } })();
  const t = item.matchName || item.name || "";
  // Keep size/pack words from the link if the stored title lacks them (e.g. user typed just "Mountain Dew").
  return /\d/.test(t) ? t : `${t} ${fromUrl}`.trim();
}

function candidates(html, base, re, max = 3) {
  const seen = new Set(), out = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, "&"), base).toString(); } catch { continue; }
    if (!re.test(u)) continue;
    const key = u.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key); out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

async function render(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return await page.content();
  } finally { await page.close().catch(() => {}); }
}

/** Returns { offers: [{store,url,price,currency,title,similarity}], log: [string] } */
export async function compareItem(ctx, item, { minSim = 0.8, perStore = 2, maxStores = 99, discover = false } = {}) {
  const country = item.storeCountry ?? "US";
  const own = detectFromUrl(item.url)?.retailer;
  const ref = matchTitle(item);
  const q = encodeURIComponent(queryFor(ref));
  const offers = [], log = [];
  for (const store of (STORES[country] ?? STORES.US).slice(0, maxStores)) {
    if (own && store.name.toLowerCase().replace(/[^a-z]/g, "").includes(own.toLowerCase().replace(/[^a-z]/g, ""))) continue;
    try {
      const sUrl = store.search.replace("{q}", q);
      const html = await render(ctx, sUrl);
      const links = candidates(html, sUrl, store.link, perStore);
      if (!links.length) { const t = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim().slice(0, 50); log.push(`${store.name}: no result links (page "${t ?? "no title"}", ${Math.round(html.length / 1024)}kB)`); continue; }
      let best = null;
      for (const l of links) {
        const r = parseHtml(await render(ctx, l), country, l);
        if (!r.price) continue;
        const sim = similarity(ref, r.name);
        if (sim >= minSim && (!best || sim > best.similarity || (sim === best.similarity && r.price < best.price)))
          best = { store: store.name, url: cleanUrl(l), price: r.price, currency: r.currency, title: (r.name ?? "").slice(0, 120), image: r.image ?? null, similarity: +sim.toFixed(2) };
      }
      if (best) { offers.push(best); log.push(`${store.name}: ${best.price} ${best.currency} (sim ${best.similarity})`); }
      else log.push(`${store.name}: ${links.length} result(s), none matched with a readable price`);
    } catch (e) { log.push(`${store.name}: ${String(e?.message ?? e).split("\n")[0].slice(0, 80)}`); }
  }
  if (discover) {
    const known = [...offers.map((o) => new URL(o.url).hostname), ...(item.url ? [new URL(item.url).hostname] : [])];
    const d = await discoverOffers(ctx, item, known, { minSim });
    offers.push(...d.offers); log.push(...d.log);
    const g = await serpOffers(item, { minSim });
    for (const o of g.offers) if (!offers.some((x) => x.store === o.store)) offers.push(o);
    log.push(...g.log);
  }
  return { offers, log };
}

export async function openBrowser() {
  let pw;
  try { pw = await import("playwright-core"); } catch { return null; }
  try {
    const browser = await pw.chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({ userAgent: UA, locale: "en-AU", viewport: { width: 1366, height: 900 } });
    return { browser, ctx };
  } catch { return null; }
}

/** Any store on the web: searches the open web for the product, then reads each result page. */
export async function discoverOffers(ctx, item, known, { minSim = 0.8, max = 8 } = {}) {
  const country = item.storeCountry ?? "US", offers = [], log = [];
  const skip = new Set(known.map((h) => h.replace(/^www\./, "")));
  const q = encodeURIComponent(queryFor(matchTitle(item)) + " buy price") + "&kl=" + ({ AU: "au-en", US: "us-en", GB: "uk-en", CA: "ca-en", IN: "in-en", DE: "de-de", FR: "fr-fr", JP: "jp-jp", SG: "sg-en", NZ: "nz-en" }[country] ?? "wt-wt");
  let html = "";
  try { html = await render(ctx, `https://html.duckduckgo.com/html/?q=${q}`); } catch (e) { return { offers, log: [`web search: ${String(e?.message ?? e).split("\n")[0].slice(0, 70)}`] }; }
  const urls = [];
  for (const m of html.matchAll(/href=["'][^"']*uddg=([^"'&]+)/gi)) {
    let u; try { u = decodeURIComponent(m[1]); new URL(u); } catch { continue; }
    const host = new URL(u).hostname.replace(/^www\./, "");
    if (skip.has(host) || /google|bing|facebook|youtube|reddit|pinterest|wikipedia|pricespy|idealo/i.test(host)) continue;
    if (!isTrusted(u, country)) continue;
    skip.add(host); urls.push(u);
    if (urls.length >= max) break;
  }
  if (!urls.length) return { offers, log: [`web search: no trusted retailer links (${Math.round(html.length / 1024)}kB page)`] };
  for (const u of urls) {
    try {
      const r = parseHtml(await render(ctx, u), country, u);
      const sim = similarity(matchTitle(item), r.name);
      const host = new URL(u).hostname.replace(/^www\./, "");
      if (r.price && sim >= minSim) { offers.push({ store: host, url: cleanUrl(u), price: r.price, currency: r.currency, title: (r.name ?? "").slice(0, 120), image: r.image ?? null, similarity: +sim.toFixed(2) }); log.push(`web: ${host} ${r.price} ${r.currency}`); }
      else log.push(`web: ${host} ${r.price ? "title did not match" : "no readable price"}`);
    } catch (e) { log.push(`web: ${String(e?.message ?? e).split("\n")[0].slice(0, 60)}`); }
  }
  return { offers, log };
}

/** Optional: Google Shopping results through SerpApi (set SERPAPI_KEY). Trusted retailers only. */
export async function serpOffers(item, { minSim = 0.8 } = {}) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { offers: [], log: [] };
  const country = item.storeCountry ?? "AU", ref = matchTitle(item);
  const CUR = { AU: "AUD", US: "USD", GB: "GBP", CA: "CAD", DE: "EUR", FR: "EUR", JP: "JPY", IN: "INR", SG: "SGD", NZ: "NZD", AE: "AED", BR: "BRL", KR: "KRW" };
  try {
    const u = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(queryFor(ref))}&gl=${country.toLowerCase()}&hl=en&api_key=${key}`;
    const j = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json();
    const offers = [];
    for (const r of j.shopping_results ?? []) {
      const link = r.link ?? r.product_link;
      if (!r.extracted_price || !link || !trustedStoreName(r.source, country)) continue;
      if (similarity(ref, r.title) < minSim) continue;
      offers.push({ store: r.source, url: link, price: r.extracted_price, currency: CUR[country], title: String(r.title).slice(0, 120), image: r.thumbnail ?? null, similarity: +similarity(ref, r.title).toFixed(2) });
    }
    return { offers, log: [`google shopping: ${offers.length} trusted match(es) of ${(j.shopping_results ?? []).length}`] };
  } catch (e) { return { offers: [], log: [`google shopping: ${String(e?.message ?? e).slice(0, 60)}`] }; }
}
