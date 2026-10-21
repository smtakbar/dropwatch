// Reads watchlist.json, scrapes every item, updates docs/data.json,
// and opens a GitHub issue (which emails you) when a target price is hit.
import fs from "node:fs";
import { scrapeProduct, detectFromUrl, getRates, convert, fmt, insight } from "./lib.mjs";
import { compareItem, openBrowser } from "./compare.mjs";

const WATCH = process.env.WATCHLIST ?? "watchlist.json";
const DATA = process.env.DATAFILE ?? "docs/data.json";
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

export async function run() {
  const watch = read(WATCH, []);
  const prev = read(DATA, { items: [] });
  const prevById = Object.fromEntries((prev.items ?? []).map((i) => [i.id, i]));
  const rates = await getRates(prev.rates);
  const now = new Date().toISOString();
  const alerts = [];
  const items = [];
  const COMPARE_EVERY_MS = 12 * 3600e3;
  let br = null, brTried = false;

  for (const w of watch) {
    const p = prevById[w.id] ?? {};
    const d = detectFromUrl(w.url);
    const r = await scrapeProduct(w.url);
    const it = {
      id: w.id, url: w.url, name: w.name || r.name || d?.retailer || w.url,
      retailer: d?.retailer ?? null, storeCountry: d?.country ?? null,
      targetPrice: w.target ?? null, targetCurrency: w.currency ?? null,
      currency: p.currency ?? null, price: p.price ?? null, lowest: p.lowest ?? null,
      lastAlerted: p.lastAlerted ?? null, history: p.history ?? [], offers: p.offers ?? [], compareAt: p.compareAt ?? null, compareLog: p.compareLog ?? [], insight: null, checkedAt: now, error: null, via: null,
    };
    if (!r.price) {
      it.error = r.error ?? "Unknown error";
    } else {
      it.via = r.via ?? null;
      it.currency = r.currency ?? p.currency ?? "USD";
      it.price = r.price;
      it.lowest = p.lowest == null ? r.price : Math.min(p.lowest, r.price);
      const last = it.history.at(-1);
      if (!last || last[1] !== r.price || Date.parse(now) - Date.parse(last[0]) > 86400000) it.history.push([now, r.price]);
      it.history = it.history.slice(-300);

      const target = it.targetPrice != null ? convert(it.targetPrice, it.targetCurrency ?? it.currency, it.currency, rates) : null;
      // No target set: alert on a new all-time low (>=3% under the previous low, once there is some history).
      const prevLow = p.lowest ?? null;
      const autoHit = target == null && prevLow != null && it.history.length >= 3 && r.price <= prevLow * 0.97;
      const hit = (target != null && r.price <= target) || autoHit;
      if (hit && (it.lastAlerted == null || r.price < it.lastAlerted)) {
        alerts.push({ it, target: target ?? prevLow, auto: autoHit });
        it.lastAlerted = r.price;
      } else if (!hit && target != null) it.lastAlerted = null;
      it.insight = insight(it.history, r.price, it.storeCountry);
    }
    // Same product at other stores (every 12h, or right after it is added).
    if (!it.compareAt || Date.parse(now) - Date.parse(it.compareAt) > COMPARE_EVERY_MS) {
      if (!brTried) { brTried = true; br = await openBrowser(); }
      if (br && (it.name || "").length > 3) {
        const c = await compareItem(br.ctx, it);
        it.offers = c.offers; it.compareLog = c.log; it.compareAt = now;
      } else it.compareLog = [br ? "no product name yet" : "browser unavailable"];
    }
    items.push(it);
  }

  await br?.browser.close().catch(() => {});
  fs.writeFileSync(DATA, JSON.stringify({ updated: now, rates, items }, null, 1));
  await notify(alerts);
  const failed = items.filter((i) => i.error).length;
  console.log(`Checked ${items.length} item(s): ${items.length - failed} ok, ${failed} failed, ${alerts.length} alert(s).`);
  return { items, alerts };
}

async function notify(alerts) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, owner = process.env.GITHUB_REPOSITORY_OWNER;
  for (const { it, target, auto } of alerts) {
    const title = `${auto ? "New low" : "Price drop"}: ${it.name.slice(0, 80)} is now ${fmt(it.price, it.currency)}`;
    const body = `@${owner ?? "you"} ${auto ? "this is a new lowest price." : "your target was hit."}\n\n**${it.name}**\n- Now: **${fmt(it.price, it.currency)}** at ${it.retailer}\n- ${auto ? "Previous low" : "Your target"}: ${fmt(target, it.currency)}\n- Lowest seen: ${fmt(it.lowest, it.currency)}\n\n[Buy now](${it.url})`;
    if (!repo || !token) { console.log("[alert]", title); continue; }
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) console.error("Could not create alert issue:", res.status, await res.text());
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
