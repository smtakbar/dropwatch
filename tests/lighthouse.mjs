import fs from "node:fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
const SITE = process.env.SITE ?? "https://smtakbar.github.io/dropwatch/";
const OUT = process.env.OUT ?? "reports";
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
const out = {};
for (const form of ["mobile", "desktop"]) {
  const r = await lighthouse(`${SITE}?cb=${Date.now()}`, { port: chrome.port, output: "json", logLevel: "error", formFactor: form, screenEmulation: form === "desktop" ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } : undefined, throttlingMethod: "simulate", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
  const lhr = r.lhr;
  out[form] = {
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    metrics: { fcp_ms: Math.round(lhr.audits["first-contentful-paint"].numericValue), lcp_ms: Math.round(lhr.audits["largest-contentful-paint"].numericValue), cls: +lhr.audits["cumulative-layout-shift"].numericValue.toFixed(3), tbt_ms: Math.round(lhr.audits["total-blocking-time"].numericValue) },
    layoutShifts: (lhr.audits["layout-shifts"]?.details?.items ?? []).slice(0, 6).map((i) => ({ score: +(i.score ?? 0).toFixed(3), node: i.node?.selector ?? i.node?.nodeLabel ?? "?" })),
    failedAudits: Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary").map((a) => a.id),
  };
}
await chrome.kill();
fs.writeFileSync(`${OUT}/lighthouse-summary.json`, JSON.stringify({ site: SITE, ranAt: new Date().toISOString(), ...out }, null, 1));
console.log(JSON.stringify(out, null, 1));
