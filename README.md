# DropWatch

A no-sign-in price tracker for Australian online shoppers. Paste a product link or type its name. DropWatch reads the price, shows a chart, compares a few established retailers, and says **buy now** or **wait**, with the rule written on the card.

Live: https://smtakbar.github.io/dropwatch/

![First load on desktop](reports/screenshots/01-first-load-desktop.png)
![After tracking products](reports/screenshots/02-after-tracking-desktop.png)
![Mobile](reports/screenshots/03-first-load-mobile.png)

*Screenshots are produced by the automated test run against the live site.*

## What it is, and is not
- It is a small, honest, open-data demonstration. It does not match the coverage of Google Shopping, Keepa or PriceSpy (see `PRD.md` section 8).
- It is **browser-only**. There is no database and no accounts. Your list is saved in your own browser (`localStorage`). Another person, device or browser starts empty.
- It cannot notify you while the page is closed. Browser notifications fire only when the page is open.

## Architecture
```
Visitor's browser (docs/index.html + docs/engine.js)
  - reads product pages through public read-only relays (first one that answers)
  - parses schema.org JSON-LD, meta tags and page data for price, image, stock
  - keeps the list and history in localStorage
  - computes the deal-check rule and the buy or wait advice
  - loads the public price log from data/ on GitHub

GitHub Actions
  - log-prices.yml  every 6 hours: fetches a fixed seed list (data/seed.json), appends data/prices.csv and data/fetch-log.csv
  - analysis.yml    daily: Monte Carlo script, writes data/analysis.json only for products with enough history
  - validate.yml    on test changes: Playwright end-to-end run, axe, Lighthouse on the live site, writes reports/
```
Key files: `docs/engine.js` (parsing, rule, advice), `scripts/log-prices.mjs` (logger), `analysis/monte-carlo.mjs`, `tests/e2e.mjs`.

## How the verdict works
- **Deal check (rule):** Good deal if today's price is within 3% of the 30-day low; Fair if at or below the 30-day median; otherwise Above usual. It needs 3 or more readings. It is a rule, not a forecast.
- **Buy or wait advice:** combines the deal rule, whether another trusted store is at least 5% cheaper, whether a usual sale month (November, December and January, July) is within two months, and stock status. Until about 60 days of history exist, the "likely low" figure is a seasonal estimate and is labelled as one.

## Constraints and honest limits
- **Data reliability.** Many stores refuse automated requests. The logger identifies itself (`DropWatchResearchBot`), obeys `robots.txt`, makes one request per product per run, and records every outcome in `data/fetch-log.csv`. It does not disguise itself. The seed list only contains products from stores that allowed this.
- **Relays.** Browsers cannot read other sites directly, so pages go through free public relays. They can be slow or unavailable. Timings from the last test run are in `VALIDATION.md`.
- **Retailer allowlist.** Only established retailers are shown. A store missing from the list in `scripts/trusted.mjs` is never shown.
- **Privacy.** No personal data is collected or stored by this project. The page asks an IP-location service which country you are in, only to pick a currency.
- **Usage metrics.** None exist yet. See `PRD.md` section 6.
- **Machine learning.** Not built yet. It needs more history (`PRD.md` section 9).

## Data
`data/prices.csv` (timestamp, id, store, price, currency, in_stock) and `data/fetch-log.csv` are public. Prices belong to the retailers; the log is for research and demonstration.

## Run the tests
`validate.yml` runs on GitHub. To run locally: `npm i playwright-core axe-core lighthouse chrome-launcher`, then `node tests/e2e.mjs` and `node tests/lighthouse.mjs`.

## Documents
`PRD.md` (problem, decisions, metrics, roadmap, changelog), `VALIDATION.md` (test report), `BACKLOG.md` (prioritised work).

## Licence
No licence file has been added yet **[owner to choose]**.
