// Finds the same product at other stores: searches each store in a real Chrome, opens the top results,
// reads their price, and keeps only results whose title closely matches the tracked product.
import { parseHtml, detectFromUrl } from "./lib.mjs";

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

const STOP = new Set(["buy", "the", "and", "with", "for", "online", "pack", "new", "from", "at", "in", "of", "a", "an", "coles", "jb", "hi", "fi", "amazon", "au", "com"]);
export const tokens = (s = "") => (String(s).toLowerCase().replace(/\|.*$/, "").match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP.has(t));
export const queryFor = (name) => tokens(name).slice(0, 7).join(" ");

/** How much of the tracked product's title (incl. numbers like 375ml/24) appears in the candidate. 0..1 */
export function similarity(a, b) {
  const A = tokens(a), B = new Set(tokens(b));
  if (!A.length) return 0;
  return A.filter((t) => B.has(t)).length / A.length;
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
export async function compareItem(ctx, item, { minSim = 0.6, perStore = 3 } = {}) {
  const country = item.storeCountry ?? "US";
  const own = detectFromUrl(item.url)?.retailer;
  const q = encodeURIComponent(queryFor(item.name));
  const offers = [], log = [];
  for (const store of STORES[country] ?? STORES.US) {
    if (own && store.name.toLowerCase().replace(/[^a-z]/g, "").includes(own.toLowerCase().replace(/[^a-z]/g, ""))) continue;
    try {
      const sUrl = store.search.replace("{q}", q);
      const html = await render(ctx, sUrl);
      const links = candidates(html, sUrl, store.link, perStore);
      if (!links.length) { const t = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim().slice(0, 50); log.push(`${store.name}: no result links (page "${t ?? "no title"}", ${Math.round(html.length / 1024)}kB)`); continue; }
      let best = null;
      for (const l of links) {
        const r = parseHtml(await render(ctx, l), country);
        if (!r.price) continue;
        const sim = similarity(item.name, r.name);
        if (sim >= minSim && (!best || sim > best.similarity || (sim === best.similarity && r.price < best.price)))
          best = { store: store.name, url: l, price: r.price, currency: r.currency, title: (r.name ?? "").slice(0, 120), similarity: +sim.toFixed(2) };
      }
      if (best) { offers.push(best); log.push(`${store.name}: ${best.price} ${best.currency} (sim ${best.similarity})`); }
      else log.push(`${store.name}: ${links.length} result(s), none matched with a readable price`);
    } catch (e) { log.push(`${store.name}: ${String(e?.message ?? e).split("\n")[0].slice(0, 80)}`); }
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
