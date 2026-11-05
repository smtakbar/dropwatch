// Live end-to-end validation against the deployed site. Run on a GitHub runner (real network, real Chrome).
import fs from "node:fs";
import { chromium } from "playwright-core";
import axe from "axe-core";

const SITE = process.env.SITE ?? "https://smtakbar.github.io/dropwatch/";
const OUT = process.env.OUT ?? "reports";
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
const results = [];
const rec = (id, area, check, pass, severity, detail = "") => { results.push({ id, area, check, pass, severity: pass ? "-" : severity, detail }); console.log(pass ? "PASS" : "FAIL", id, check, detail); };

const PRODUCTS = [
  ["JB Hi-Fi", "https://www.jbhifi.com.au/products/remington-all-in-1-titanium-grooming-system"],
  ["Scorptec", "https://www.scorptec.com.au/product/hard-drives-&-ssds/solid-state-drives-(ssd)/100601-mz-v9p1t0bw"],
  ["The Good Guys", "https://www.thegoodguys.com.au/sony-premium-noise-cancelling-headphones-pink-wh1000xm5p"],
  ["Umart", "https://www.umart.com.au/product/logitech-g502-lightspeed-wireless-gaming-mouse-910-005569-51898"],
  ["JB Hi-Fi (2)", "https://www.jbhifi.com.au/products/ps5-playstation-5-slim-console"],
  ["Scorptec (2)", "https://www.scorptec.com.au/product/memory/ddr5-desktop-memory/103569-cmk32gx5m2e6000c36"],
];

// Wait until the live site serves the same engine version as this commit (GitHub Pages caches for minutes).
const want = fs.readFileSync("docs/index.html", "utf8").match(/engine\.js\?v=(\d+)/)?.[1];
for (let i = 0; i < 40 && want; i++) {
  try { const h = await (await fetch(`${SITE}?cb=${Date.now()}`)).text(); if (h.includes(`engine.js?v=${want}`)) break; } catch {}
  await new Promise((r) => setTimeout(r, 15000));
}
const SITEURL = `${SITE}?cb=${Date.now()}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-AU", permissions: [] });
await ctx.addInitScript(() => { try { if (!localStorage.getItem("region")) localStorage.setItem("region", "AU"); } catch {} });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 160)));

// ---- A. First load and page hygiene
const t0 = Date.now();
const resp = await page.goto(SITEURL, { waitUntil: "load", timeout: 45000 });
rec("A1", "Load", "Site returns HTTP 200", resp?.status() === 200, "blocker", `status ${resp?.status()}`);
await page.waitForTimeout(1500);
const title = await page.title();
rec("A2", "Hygiene", "Page has a sensible <title>", /dropwatch/i.test(title), "minor", `"${title}"`);
const bodyText = await page.evaluate(() => document.body.innerText);
rec("A3", "Hygiene", "No head tags visible as text", !/<\s*(meta|title|link)\b|name=["']viewport|charset=/i.test(bodyText), "major", bodyText.match(/<\s*(meta|title|link)[^\n]{0,60}|name=["']viewport[^\n]{0,40}/i)?.[0] ?? "");
const ctas = await page.evaluate(() => [...document.querySelectorAll("button,a")].filter((e) => /track/i.test(e.textContent) && e.offsetParent).map((e) => e.textContent.trim()));
rec("A4", "UX", "Single primary 'Track' call to action", ctas.length <= 1, "minor", `${ctas.length} found: ${JSON.stringify(ctas)}`);
const inputs = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => ({ id: i.id, ph: i.placeholder, label: !!(i.labels && i.labels.length) || !!i.getAttribute("aria-label") })));
rec("A5", "A11y", "Every input has a placeholder", inputs.every((i) => i.ph), "minor", JSON.stringify(inputs.filter((i) => !i.ph).map((i) => i.id)));
rec("A6", "A11y", "Every input has a label or aria-label", inputs.every((i) => i.label), "minor", JSON.stringify(inputs.filter((i) => !i.label).map((i) => i.id || "(no id)")));
const hasDemo = /demo|sample/i.test(bodyText);
rec("A7", "First run", "Demo mode or sample data offered on an empty list", hasDemo, "major", hasDemo ? "" : "empty list shows only a text prompt");
const repoLink = await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => /github\.com\/smtakbar\/dropwatch/.test(a.href)));
rec("A8", "Credibility", "Link to the source repository on the page", repoLink, "major");
rec("A9", "Hygiene", "No console errors on load", consoleErrors.length === 0, "minor", consoleErrors.slice(0, 3).join(" | "));
const pubN = await page.locator("#pubgrid .card").count();
rec("A10", "First run", "Public sample products listed with real logged prices", pubN >= 1, "major", `${pubN} sample product(s)`);
if (pubN) { await page.locator("#pubgrid button:not([disabled])").first().click(); let added = true; try { await page.waitForSelector(".grid#grid .card .price", { timeout: 75000 }); } catch { added = false; } rec("A11", "First run", "'Add to my list' on a sample product produces a priced card", added, "major"); await page.evaluate(() => localStorage.removeItem("dw_items")); await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800); }
await page.screenshot({ path: `${OUT}/screenshots/01-first-load-desktop.png` });

// ---- B. Track real products (price fetch)
const timings = [];
for (let i = 0; i < PRODUCTS.length; i++) {
  const [store, url] = PRODUCTS[i];
  const s = Date.now();
  await page.fill("#quick", url);
  await page.click("#quickGo");
  await page.click("#m-go");
  let ok = false, why = "";
  try { await page.waitForFunction((n) => document.querySelectorAll("#grid .card .price").length >= n, i + 1, { timeout: 75000 }); ok = true; } catch { why = "no price within 75s"; }
  const secs = Math.round((Date.now() - s) / 1000);
  const info = await page.evaluate(() => { const c = document.querySelector("#grid .card:not(.pend)"); return c ? { text: c.innerText.replace(/\n+/g, " | ").slice(0, 200) } : null; });
  timings.push({ store, ok, secs });
  rec(`B${i + 1}`, "Price fetch", `Track ${store} product and read a price`, ok, "major", ok ? `${secs}s` : why);
  await page.waitForTimeout(800);
}
const nOk = timings.filter((t) => t.ok).length;
rec("B0", "Price fetch", "At least 5 of 6 real products return a price in the browser", nOk >= 5, "blocker", `${nOk}/${PRODUCTS.length} succeeded; median ${timings.filter((t) => t.ok).map((t) => t.secs).sort((a, b) => a - b)[Math.floor(nOk / 2)] ?? "n/a"}s`);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/screenshots/02-after-tracking-desktop.png`, fullPage: true });
const cardInfo = await page.evaluate(() => [...document.querySelectorAll("#grid .card:not(.pend)")].map((c) => ({ hasImg: !!c.querySelector("img.thumb"), advice: c.querySelector(".advice b")?.textContent ?? null, offers: c.querySelectorAll("table tr").length - 1 })));
rec("B6b", "Features", "Cards show the transparent deal-check rule line", await page.locator("#grid .card .rule").count() > 0, "minor");
rec("B7", "Features", "Cards show a buy/wait verdict", cardInfo.some((c) => c.advice), "minor", `${cardInfo.filter((c) => c.advice).length}/${cardInfo.length} cards`);
rec("B8", "Features", "Cards show a product image", cardInfo.some((c) => c.hasImg), "minor", `${cardInfo.filter((c) => c.hasImg).length}/${cardInfo.length} cards`);
rec("B9", "Features", "Cross-store comparison found at least one other store", cardInfo.some((c) => c.offers >= 1), "minor", `${cardInfo.filter((c) => c.offers >= 1).length}/${cardInfo.length} cards`);

// ---- C. Persistence and refresh
const before = await page.locator("#grid .card:not(.pend)").count();
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);
const after = await page.locator("#grid .card:not(.pend)").count();
rec("C1", "Persistence", "List survives a reload", after === before && after > 0, "blocker", `${before} before, ${after} after`);
const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await other.addInitScript(() => { try { if (!localStorage.getItem("region")) localStorage.setItem("region", "AU"); } catch {} });

const p2 = await other.newPage(); await p2.goto(SITEURL, { waitUntil: "load" }); await p2.waitForTimeout(1000);
rec("C2", "Privacy", "A fresh visitor does not see another visitor's list", (await p2.locator("#grid .card:not(.pend)").count()) === 0, "blocker");
await other.close();

// ---- D. Refresh and alerts (simulate a >10% drop by raising the stored previous price)
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["notifications"] });
const pA = await ctxA.newPage();
await pA.addInitScript(() => { window.__notes = []; window.Notification = class { constructor(t, o) { window.__notes.push([t, o && o.body]); } static get permission() { return "granted"; } static requestPermission() { return Promise.resolve("granted"); } }; });
await pA.goto(SITEURL, { waitUntil: "load" });
const items = await pA.evaluate(() => JSON.parse(localStorage.getItem("dw_items") || "[]"));
rec("D0", "Alerts", "Test setup: fresh context starts empty", items.length === 0, "minor");
await pA.fill("#quick", PRODUCTS[0][1]); await pA.click("#quickGo"); await pA.click("#m-go");
let readOk = true; try { await pA.waitForSelector("#grid .card .price", { timeout: 75000 }); } catch { readOk = false; }
if (readOk) {
  await pA.waitForTimeout(2500);
  await pA.evaluate(() => { const it = JSON.parse(localStorage.getItem("dw_items")); it[0].price = Math.round(it[0].price * 1.5 * 100) / 100; it[0].history = it[0].history.map(([t, p]) => [new Date(Date.parse(t) - 25 * 3600e3).toISOString(), p]); it[0].checkedAt = new Date(Date.now() - 2 * 3600e3).toISOString(); localStorage.setItem("dw_items", JSON.stringify(it)); });
  await pA.reload({ waitUntil: "load" });
  await pA.waitForTimeout(25000);
  const notes = await pA.evaluate(() => window.__notes);
  rec("D1", "Alerts", "Stale item refreshes on reopen and fires a drop notification when price fell 10%+", notes.length >= 1, "major", `${notes.length} notification(s): ${JSON.stringify(notes[0] ?? null)}`);
  const hist = await pA.evaluate(() => JSON.parse(localStorage.getItem("dw_items"))[0].history.length);
  rec("D2", "History", "Price history accumulates across refreshes", hist >= 2, "minor", `${hist} point(s)`);
} else rec("D1", "Alerts", "Alert test could not run (price fetch failed)", false, "major", "price not read in 75s");
await ctxA.close();

// ---- E. Mobile layout
const mob = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mob.addInitScript(() => { try { if (!localStorage.getItem("region")) localStorage.setItem("region", "AU"); } catch {} });
const pm = await mob.newPage(); await pm.goto(SITEURL, { waitUntil: "load" }); await pm.waitForTimeout(1200);
const m = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, small: [...document.querySelectorAll("button,a,select,input")].filter((e) => e.offsetParent && !e.closest("p")).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.id || e.tagName).trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h < 40) }));
rec("E1", "Mobile", "No horizontal scroll at 375px", m.sw <= m.cw + 1, "major", `scrollWidth ${m.sw} vs ${m.cw}`);
rec("E2", "Mobile", "Tap targets at least 40px tall", m.small.length === 0, "minor", JSON.stringify(m.small.slice(0, 5)));
await pm.screenshot({ path: `${OUT}/screenshots/03-first-load-mobile.png` });
await mob.close();


// ---- G. Region switching: the whole page follows the chosen country
const gctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-AU" });
await gctx.addInitScript(() => { try { if (!localStorage.getItem("region")) localStorage.setItem("region", "AU"); } catch {} });
const gp = await gctx.newPage();
await gp.goto(SITEURL, { waitUntil: "load" }); await gp.waitForTimeout(2500);
const regions = await gp.$$eval("#region option", (os) => os.map((o) => [o.value, o.textContent.replace(/^\W+/, "").replace(/\s*\(.*$/, "").trim()]));
rec("G1", "Regions", "Region list has 13 countries", regions.length === 13, "major", String(regions.length));
const SEEDED = { AU: "", IN: "₹", SG: "$", FR: "€", BR: "R$", KR: "₩", JP: "¥" };
const bad = [], badSample = [], badIdeas = [], badCur = [];
for (const [code, name] of regions) {
  await gp.selectOption("#region", code); await gp.waitForTimeout(400);
  const st = await gp.evaluate(() => ({ line: document.getElementById("regionline").textContent, ph: document.getElementById("quick").placeholder, h: document.getElementById("pubh").textContent, cards: [...document.querySelectorAll("#pubgrid .card")].map((c) => c.innerText), chips: document.querySelectorAll("#pubgrid [data-idea]").length, lang: document.documentElement.lang }));
  if (!st.line.includes(name.replace(/^\W+/, "")) || !/e\.g\./.test(st.ph) || !st.h.includes(name)) bad.push(code);
  const isSeeded = code in SEEDED;
  if (isSeeded && st.cards.length < 1) badSample.push(code + ":none");
  if (!isSeeded && st.cards.length !== 0) badSample.push(code + ":unexpected " + st.cards.length);
  if (code !== "AU" && st.cards.some((t) => /JB Hi-Fi|Scorptec|Umart|The Good Guys|Centrecom/.test(t))) badSample.push(code + ":AU stores leaked");
  if (st.chips < 4) badIdeas.push(code);
  if (isSeeded && SEEDED[code] && st.cards.length && !st.cards.some((t) => t.includes(SEEDED[code]) || (code === "JP" && /[¥￥]/.test(t)))) badCur.push(code + ":no " + SEEDED[code]);
}
rec("G2", "Regions", "Switching region updates heading, search hint, example text and store list for all 13", bad.length === 0, "major", bad.join(","));
rec("G3", "Regions", "Regions with a readable retailer show only that region's logged products (no Australian leakage)", badSample.length === 0, "major", badSample.join(" | "));
rec("G4", "Regions", "Every region offers tap-to-search product ideas", badIdeas.length === 0, "minor", badIdeas.join(","));
rec("G5", "Regions", "Prices shown in the region's own currency", badCur.length === 0, "major", badCur.join(" | "));
// Track a product in India, then check it is hidden when the region changes and the trackers panel is present.
await gp.selectOption("#region", "IN"); await gp.waitForTimeout(500);
const inBtn = gp.locator("#pubgrid button:not([disabled])", { hasText: "Add to my list" }).first();
await inBtn.click();
let inOk = true; try { await gp.waitForSelector("#grid .card .price", { timeout: 90000 }); } catch { inOk = false; }
rec("G6", "Regions", "India: add a Vijay Sales sample and read a price in rupees", inOk && /₹/.test(await gp.locator("#grid .card .price").first().innerText().catch(() => "")), "major");
await gp.waitForTimeout(8000);
const trk = await gp.locator("#grid details.d", { hasText: "Price history on other trackers" }).count();
rec("G7", "History", "Card has a 'Price history on other trackers' panel with lookup links", trk >= 1, "major");
await gp.selectOption("#region", "AU"); await gp.waitForTimeout(500);
const hidden = (await gp.locator("#grid .card:not(.pend)").count()) === 0 && (await gp.locator("#showall").isVisible());
rec("G8", "Regions", "An India item is hidden in Australia, with a button to show other regions", hidden, "major");
await gp.screenshot({ path: `${OUT}/screenshots/04-region-au.png` });
await gp.selectOption("#region", "IN"); await gp.waitForTimeout(500);
await gp.screenshot({ path: `${OUT}/screenshots/05-region-in.png` });
// Tracker adapters (live pages through the public relays)
const th = await gp.evaluate(async () => {
  const out = {};
  out.ccc = "link only";
  try { const r = await DW.trackerHistory({ url: "", matchName: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", name: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", offers: [], storeCountry: "IN" }); out.ph = r.map((x) => ({ s: x.source, low: x.low, avg: x.avg, high: x.high })); } catch (e) { out.ph = "error " + e.message; }
  return out;
});
rec("G9", "History", "pricehistory.app adapter finds and reads an Indian product by name", Array.isArray(th.ph) && th.ph.some((x) => x.low > 0 && x.high >= x.low), "minor", JSON.stringify(th.ph));
await gctx.close();

// ---- H. Indian .com store link is classified as India; mini game while waiting
const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-AU" });
await hctx.addInitScript(() => { try { if (!localStorage.getItem("region")) localStorage.setItem("region", "AU"); } catch {} });
const hp = await hctx.newPage();
await hp.goto(SITEURL, { waitUntil: "load" }); await hp.waitForTimeout(2000);
await hp.fill("#quick", "https://www.myntra.com/perfume/prada/prada-men-luna-rossa-black-eau-de-parfum-spray---100ml/21596686/buy"); await hp.click("#quickGo"); await hp.click("#m-go");
await hp.waitForTimeout(1500);
const my = await hp.evaluate(() => ({ it: JSON.parse(localStorage.getItem("dw_items") || "[]")[0], region: document.getElementById("region").value }));
rec("H1", "Regions", "A Myntra link is classified as an Indian store and the page switches to India", my.it?.country === "IN" && my.it?.storeCountry === "IN" && my.region === "IN", "major", JSON.stringify({ c: my.it?.country, s: my.it?.storeCountry, r: my.region }));
const play = hp.locator("#pend button", { hasText: "Play" });
const canPlay = (await play.count()) > 0;
rec("H2", "Engagement", "A game is offered while the price is being read", canPlay, "minor");
if (canPlay) {
  await play.first().click();
  const tiles = await hp.locator("#game .gt").count();
  let scored = false;
  for (let i = 0; i < 40 && !scored; i++) {
    const d = hp.locator("#game .gt.drop");
    if (await d.count()) { await d.first().click(); scored = /Score [1-9]/.test(await hp.locator("#gs").innerText()); }
    else await hp.waitForTimeout(150);
  }
  rec("H3", "Engagement", "Game shows 9 tiles and tapping a green drop scores a point", tiles === 9 && scored, "minor", `${tiles} tiles, scored=${scored}`);
  await hp.screenshot({ path: `${OUT}/screenshots/06-game.png` });
}
await hctx.close();

// ---- F. Accessibility (axe-core) on the populated desktop page
await page.addScriptTag({ content: axe.source });
const ax = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })); });
const serious = ax.filter((v) => v.impact === "critical" || v.impact === "serious");
rec("F1", "A11y", "No critical or serious axe violations", serious.length === 0, "major", serious.map((v) => `${v.id}(${v.nodes})`).join(", "));
fs.writeFileSync(`${OUT}/axe.json`, JSON.stringify(ax, null, 1));

await browser.close();
const summary = { site: SITE, ranAt: new Date().toISOString(), totalChecks: results.length, passed: results.filter((r) => r.pass).length, fetchTimings: timings, results };
fs.writeFileSync(`${OUT}/validation.json`, JSON.stringify(summary, null, 1));
console.log(`\n${summary.passed}/${summary.totalChecks} checks passed`);
