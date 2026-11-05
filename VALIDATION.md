# DropWatch validation report

Run: 2026-11-05T06:45:08.971Z against https://smtakbar.github.io/dropwatch/ (headless Chrome on a GitHub Actions runner, Playwright, axe-core, Lighthouse). Raw files: `reports/`. Re-run any time with the "Validate live site" workflow.

## Result

39 of 39 checks pass. This is one run, not a guarantee: store pages and the public relays change, so price fetch can fail on another day. Price tests used 6 real products from 4 Australian retailers plus one Indian retailer (Vijay Sales).

## History of this suite

| Run | Passed | Main failures |
|---|---|---|
| First live run | 19 of 27 | duplicate Track CTA, missing label, no sample data, no repo link, 404 console error, mobile overflow, small tap targets |
| After bug fixes | 30 of 30 | none |
| After adding region switching (39 checks) | 35 of 38, then 39 of 39 | first run: items from a store in another country were hidden by the new region filter (D1, G6, G7). Fix: adding an item switches to its store's region |

## Regions (checks G1 to G9)

- All 13 regions switch the heading, search hint, example text, store list and currency (G1 to G5).
- Only Australia, India, Singapore, France, Brazil, South Korea and Japan have logged sample products. US, UK, Canada, Germany, New Zealand and UAE show tap-to-search ideas, because the retailers tested refused automated requests (see `reports/probe.json`).
- Not covered: end-to-end price reads for every store in every region. Typed-name search was exercised on Australian stores and one Indian store only.

## Price history from other trackers (G7, G9)

- pricehistory.app is read automatically for Indian products (G9 passes: lowest, average and highest read for a Sony WH-1000XM5 search).
- Buyhatke returned HTTP 403 to the probe and disallows its API in `robots.txt`; CamelCamelCamel is behind a bot check the free relays cannot pass. Both are link-only. Probe data: `reports/probe.json`, `reports/probe3.json`.

## Price fetch (browser only, via public relays)

| Store | Price read | Time |
|---|---|---|
| JB Hi-Fi | yes | 3s |
| Scorptec | yes | 36s |
| The Good Guys | yes | 35s |
| Umart | yes | 46s |
| JB Hi-Fi (2) | yes | 34s |
| Scorptec (2) | yes | 38s |

A separate diagnostic on the runner found that only the r.jina.ai relay answered reliably; corsproxy.io now requires an API key, and allorigins timed out in several attempts. This is the weakest part of the product.

## All checks

| ID | Area | Check | Result | Detail |
|---|---|---|---|---|
| A1 | Load | Site returns HTTP 200 | PASS | status 200 |
| A2 | Hygiene | Page has a sensible <title> | PASS | "DropWatch" |
| A3 | Hygiene | No head tags visible as text | PASS |  |
| A4 | UX | Single primary 'Track' call to action | PASS | 1 found: ["Track this product"] |
| A5 | A11y | Every input has a placeholder | PASS | [] |
| A6 | A11y | Every input has a label or aria-label | PASS | [] |
| A7 | First run | Demo mode or sample data offered on an empty list | PASS |  |
| A8 | Credibility | Link to the source repository on the page | PASS |  |
| A9 | Hygiene | No console errors on load | PASS |  |
| A10 | First run | Public sample products listed with real logged prices | PASS | 12 sample product(s) |
| A11 | First run | 'Add to my list' on a sample product produces a priced card | PASS |  |
| B1 | Price fetch | Track JB Hi-Fi product and read a price | PASS | 3s |
| B2 | Price fetch | Track Scorptec product and read a price | PASS | 36s |
| B3 | Price fetch | Track The Good Guys product and read a price | PASS | 35s |
| B4 | Price fetch | Track Umart product and read a price | PASS | 46s |
| B5 | Price fetch | Track JB Hi-Fi (2) product and read a price | PASS | 34s |
| B6 | Price fetch | Track Scorptec (2) product and read a price | PASS | 38s |
| B0 | Price fetch | At least 5 of 6 real products return a price in the browser | PASS | 6/6 succeeded; median 36s |
| B6b | Features | Cards show the transparent deal-check rule line | PASS |  |
| B7 | Features | Cards show a buy/wait verdict | PASS | 6/6 cards |
| B8 | Features | Cards show a product image | PASS | 6/6 cards |
| B9 | Features | Cross-store comparison found at least one other store | PASS | 3/6 cards |
| C1 | Persistence | List survives a reload | PASS | 6 before, 6 after |
| C2 | Privacy | A fresh visitor does not see another visitor's list | PASS |  |
| D0 | Alerts | Test setup: fresh context starts empty | PASS |  |
| D1 | Alerts | Stale item refreshes on reopen and fires a drop notification when price fell 10%+ | PASS | 1 notification(s): ["Price drop: Remington All-in","$29.00 at JB Hi-Fi"] |
| D2 | History | Price history accumulates across refreshes | PASS | 10 point(s) |
| E1 | Mobile | No horizontal scroll at 375px | PASS | scrollWidth 375 vs 375 |
| E2 | Mobile | Tap targets at least 40px tall | PASS | [] |
| G1 | Regions | Region list has 13 countries | PASS | 13 |
| G2 | Regions | Switching region updates heading, search hint, example text and store list for all 13 | PASS |  |
| G3 | Regions | Regions with a readable retailer show only that region's logged products (no Australian leakage) | PASS |  |
| G4 | Regions | Every region offers tap-to-search product ideas | PASS |  |
| G5 | Regions | Prices shown in the region's own currency | PASS |  |
| G6 | Regions | India: add a Vijay Sales sample and read a price in rupees | PASS |  |
| G7 | History | Card has a 'Price history on other trackers' panel with lookup links | PASS |  |
| G8 | Regions | An India item is hidden in Australia, with a button to show other regions | PASS |  |
| G9 | History | pricehistory.app adapter finds and reads an Indian product by name | PASS | [{"s":"pricehistory.app","low":31490,"avg":51198,"high":61151}] |
| F1 | A11y | No critical or serious axe violations | PASS |  |

## Mobile, accessibility, Lighthouse

- Mobile (375px): no horizontal scroll, tap targets at least 40px (E1, E2).
- axe-core: no critical or serious violations (F1).
- Lighthouse mobile: performance 82, accessibility 100, best practices 100, SEO 100; layout shift 0.373.
- Lighthouse desktop: performance 92, accessibility 100, best practices 100, SEO 100; layout shift 0.008.

## Known open issue

Mobile layout shift is 0.373 (target 0.1 or lower) on `body > div.wrap`; cause not yet found. Desktop is fine.

## Limits of this report

- Tested from a datacenter, not a phone on a home network.
- Alerts were tested by simulating the browser Notification API, not real push delivery.
- No user data exists. No usage, retention or accuracy figures are claimed anywhere.
