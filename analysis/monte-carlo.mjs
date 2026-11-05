// Monte Carlo price-path simulation on the project's own public price log.
// It refuses to run on thin data and says so. Assumptions are written into the output file.
import fs from "node:fs";

const PRICES = process.env.PRICES ?? "data/prices.csv";
const OUT = process.env.OUT ?? "data/analysis.json";
const MIN_DAYS = Number(process.env.MIN_DAYS ?? 14), MIN_READINGS = Number(process.env.MIN_READINGS ?? 40);
const HORIZON_DAYS = 14, DROP = 0.10, PATHS = 10000, SEED = 20261105;

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function simulate(series, { horizonDays = HORIZON_DAYS, drop = DROP, paths = PATHS, seed = SEED } = {}) {
  const pts = series.map(([t, p]) => [Date.parse(t), p]).sort((a, b) => a[0] - b[0]);
  const spanDays = (pts.at(-1)[0] - pts[0][0]) / 864e5;
  const stepHours = (pts.at(-1)[0] - pts[0][0]) / 36e5 / Math.max(1, pts.length - 1);
  const rets = []; for (let i = 1; i < pts.length; i++) rets.push(Math.log(pts[i][1] / pts[i - 1][1]));
  const steps = Math.max(1, Math.round((horizonDays * 24) / stepHours));
  const r = rng(seed), now = pts.at(-1)[1], target = now * (1 - drop);
  let hit = 0;
  for (let k = 0; k < paths; k++) {
    let p = now;
    for (let s = 0; s < steps; s++) { p *= Math.exp(rets[Math.floor(r() * rets.length)]); if (p <= target) { hit++; break; } }
  }
  return { probability: +(hit / paths).toFixed(3), current: now, target: +target.toFixed(2), horizonDays, steps, readings: pts.length, spanDays: +spanDays.toFixed(1), nonzeroChanges: rets.filter((x) => x !== 0).length };
}

export function run() {
  const rows = fs.readFileSync(PRICES, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const by = {};
  for (const [ts, id, , price] of rows) if (+price > 0) (by[id] ??= []).push([ts, +price]);
  const out = {
    generatedAt: new Date().toISOString(),
    method: "Bootstrap Monte Carlo. Each simulated path resamples this product's own observed log price changes between consecutive readings, with replacement, for the horizon. We report the share of paths that touch a price at least 10% below the latest price within 14 days.",
    assumptions: ["Future price changes look like past ones for the same product (stationary, independent of time of year).", "Readings are roughly evenly spaced (every 6 hours).", "Sale events such as Black Friday are not modelled separately, so results understate drop risk during sales if the history has none.", "Seeded random numbers: results are reproducible."],
    validation: "Not yet validated. Calibration check planned: compare predicted probabilities with what happened over the following 14 days once at least 60 days of history exist.",
    minimumData: { days: MIN_DAYS, readings: MIN_READINGS },
    products: {},
  };
  for (const [id, s] of Object.entries(by)) {
    const days = (Date.parse(s.at(-1)[0]) - Date.parse(s[0][0])) / 864e5;
    if (days < MIN_DAYS || s.length < MIN_READINGS) { out.products[id] = { status: "insufficient_data", readings: s.length, spanDays: +days.toFixed(1) }; continue; }
    if (new Set(s.map((x) => x[1])).size < 2) { out.products[id] = { status: "no_price_changes_observed", readings: s.length, spanDays: +days.toFixed(1) }; continue; }
    out.products[id] = { status: "ok", ...simulate(s) };
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const ok = Object.values(out.products).filter((p) => p.status === "ok").length;
  console.log(`Monte Carlo: ${ok}/${Object.keys(out.products).length} products had enough data`);
}

if (import.meta.url === `file://${process.argv[1]}`) run();
