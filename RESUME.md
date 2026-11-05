# Resume material for DropWatch

Fill every [bracket] with a real number from `data/` or from the test reports. Delete anything you cannot support. Do not add users, accuracy or revenue figures that were not measured.

## One bullet (choose one version)
**Short:** Built DropWatch, a no-sign-in price tracker (JavaScript, GitHub Actions): paste a product, get a price chart and a buy-or-wait verdict from a printed rule (price vs 30-day low and median); logging [N] products across [N] Australian stores every 6 hours since 5 Nov 2026 into an open dataset ([N] readings); live-site test suite passing [X] of [Y] checks, Lighthouse accessibility [score].

**Product-judgement version:** Shipped DropWatch, an open-data price tracker, and cut it down on evidence: dropped accounts after user feedback, replaced a wrong-pack match bug with strict size matching and a retailer allowlist, and chose a transparent rule over a model because only [N] days of history existed; PRD, test report and prioritised backlog in the repo.

## Link text
https://smtakbar.github.io/dropwatch/ (page) and https://github.com/smtakbar/dropwatch (PRD.md, VALIDATION.md, BACKLOG.md)

## Claims you can make today, and the evidence
| Claim | Evidence |
|---|---|
| Built and deployed a working app | Live URL; `reports/validation.json` |
| Automated price logging running on a schedule | `.github/workflows/log-prices.yml`, `data/prices.csv`, `data/fetch-log.csv` |
| Tested on real products in a real browser | `tests/e2e.mjs`, `reports/` |
| Wrote a PRD and a prioritised backlog | `PRD.md`, `BACKLOG.md` |
| Monte Carlo and ML skills applied to the product | **Not yet.** Script is written and gated; use this claim only after `data/analysis.json` has results you have checked |

## Claims to avoid
- Any user, retention or revenue number (none measured).
- Any prediction accuracy (no model exists; the verdict is a rule).
- "Tracks prices in the background for users" (it does not; only the public seed list is logged).
