// Reads watchlist.json, scrapes every item, updates docs/data.json,
// and opens a GitHub issue (which emails you) when a target price is hit.
import fs from "node:fs";
import { scrapeProduct, detectFromUrl, getRates, convert, fmt, insight, advise } from "./lib.mjs";
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
    const r = w.url ? await scrapeProduct(w.url) : { name: w.name, error: "Searching stores for this product…" };
    const it = {
      id: w.id, url: w.url, name: w.name || r.name || d?.retailer || w.url, url: w.url,
      users: Array.isArray(w.users) && w.users.length ? w.users : (process.env.GITHUB_REPOSITORY_OWNER ? [process.env.GITHUB_REPOSITORY_OWNER] : []),
      retailer: d?.retailer ?? p.retailer ?? null, storeCountry: d?.country ?? w.country ?? null, image: p.image ?? null,
      targetPrice: w.target ?? null, targetCurrency: w.currency ?? null,
      currency: p.currency ?? null, price: p.price ?? null, lowest: p.lowest ?? null,
      lastAlerted: p.lastAlerted ?? null, history: p.history ?? [], offers: p.offers ?? [], compareAt: p.compareAt ?? null, compareLog: p.compareLog ?? [], insight: null, advice: null, matchName: p.matchName ?? null, inStock: p.inStock ?? null, checkedAt: now, error: null, via: null,
    };
    if (r.name && r.name !== d?.retailer) it.matchName = String(r.name).replace(/^buy\s+/i, "").replace(/\s*[|\-–]\s*[^|\-–]*$/, "").trim() || it.matchName;
    if (r.image) it.image = r.image;
    if (r.inStock !== undefined) it.inStock = r.inStock;
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
      const dropHit = target == null && !autoHit && p.price != null && p.currency === it.currency && r.price <= p.price * 0.9;
      const hit = (target != null && r.price <= target) || autoHit || dropHit;
      if (hit && (it.lastAlerted == null || r.price < it.lastAlerted)) {
        alerts.push({ it, target: target ?? (dropHit ? p.price : prevLow), auto: autoHit, drop: dropHit });
        it.lastAlerted = r.price;
      } else if (!hit && target != null) it.lastAlerted = null;
      it.insight = insight(it.history, r.price, it.storeCountry);
    }
    // Same product at other stores (every 12h, or right after it is added).
    if (!it.compareAt || Date.parse(now) - Date.parse(it.compareAt) > COMPARE_EVERY_MS) {
      const quick = process.env.QUICK === "1";
      if (quick && w.url) { /* link items: price first, comparison runs in the follow-up full check */ }
      else {
        if (!brTried) { brTried = true; br = await openBrowser(); }
        if (br && (it.name || "").length > 3) {
          const c = await compareItem(br.ctx, it, { maxStores: quick ? 4 : 99, discover: !quick });
          it.offers = c.offers; it.compareLog = c.log; it.compareAt = quick ? null : now;
          if (!w.url && c.offers.length) {
            // Name-only item: its headline price is the cheapest store found.
            const best = [...c.offers].sort((a, b) => convert(a.price, a.currency, "USD", rates) - convert(b.price, b.currency, "USD", rates))[0];
            it.url = best.url; it.retailer = best.store; it.currency = best.currency; it.price = best.price; it.image = it.image ?? best.image;
            it.error = null; it.lowest = Math.min(p.lowest ?? best.price, best.price);
            const last = it.history.at(-1);
            if (!last || last[1] !== best.price || Date.parse(now) - Date.parse(last[0]) > 86400000) it.history.push([now, best.price]);
            it.insight = insight(it.history, best.price, it.storeCountry);
          } else if (!w.url) it.error = "No store results yet";
          it.image = it.image ?? c.offers.find((o) => o.image)?.image ?? null;
        } else it.compareLog = [br ? "no product name yet" : "browser unavailable"];
      }
    }
    it.advice = advise(it, rates);
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
  for (const { it, target, auto, drop } of alerts) {
    const title = `${auto ? "New low" : drop ? "Drop of 10%+" : "Price drop"}: ${it.name.slice(0, 80)} is now ${fmt(it.price, it.currency)}`;
    const who = (it.users?.length ? it.users : [owner ?? "you"]).map((u) => "@" + u).join(" ");
    const body = `${who} ${auto ? "this is a new lowest price." : drop ? "the price fell by 10% or more." : "your target was hit."}\n\n**${it.name}**\n- Now: **${fmt(it.price, it.currency)}** at ${it.retailer}\n- ${auto ? "Previous low" : drop ? "Previous price" : "Your target"}: ${fmt(target, it.currency)}\n- Lowest seen: ${fmt(it.lowest, it.currency)}\n\n[Buy now](${it.url})`;
    if (process.env.NTFY_TOPIC) await fetch(`https://ntfy.sh/${encodeURIComponent(process.env.NTFY_TOPIC)}`, { method: "POST", headers: { Title: title.slice(0, 120), Click: it.url ?? "" }, body: `${it.name}: ${fmt(it.price, it.currency)} at ${it.retailer}` }).catch(() => {});
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
