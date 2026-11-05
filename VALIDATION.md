# DropWatch validation report

Run: 2026-11-05T05:25:37.937Z against https://smtakbar.github.io/dropwatch/ (headless Chrome on a GitHub Actions runner, Playwright, axe-core, Lighthouse). Raw files: `reports/`. Re-run any time with the "Validate live site" workflow.

## Result

30 of 30 checks pass. This is one run, not a guarantee: store pages and the public relays change, so price fetch can fail on another day. Tests used 6 real products from 4 Australian retailers (JB Hi-Fi, Scorptec, The Good Guys, Umart).

## Before and after (same suite)

| Run | Passed | Main failures |
|---|---|---|
| First live run | 19 of 27 | duplicate Track CTA, missing label, no sample data, no repo link, 404 console error, mobile overflow (scrollWidth 519 at 375px), small tap targets, history not accumulating |
| This run | 30 of 30 | none |

Between the two runs, the relay problem was worse before it was better: in one intermediate run only 1 of 6 products returned a price, and in another 5 of 6 failed. Fix: the three public relays are now raced in parallel with one retry.

## Price fetch (browser only, via public relays)

| Store | Price read | Time |
|---|---|---|
| JB Hi-Fi | yes | 2s |
| Scorptec | yes | 33s |
| The Good Guys | yes | 20s |
| Umart | yes | 25s |
| JB Hi-Fi (2) | yes | 15s |
| Scorptec (2) | yes | 36s |

Median 25s. The relays are free third-party services with no guarantee. This is the weakest part of the product (see Risks in PRD.md).

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
| B1 | Price fetch | Track JB Hi-Fi product and read a price | PASS | 2s |
| B2 | Price fetch | Track Scorptec product and read a price | PASS | 33s |
| B3 | Price fetch | Track The Good Guys product and read a price | PASS | 20s |
| B4 | Price fetch | Track Umart product and read a price | PASS | 25s |
| B5 | Price fetch | Track JB Hi-Fi (2) product and read a price | PASS | 15s |
| B6 | Price fetch | Track Scorptec (2) product and read a price | PASS | 36s |
| B0 | Price fetch | At least 5 of 6 real products return a price in the browser | PASS | 6/6 succeeded; median 25s |
| B6b | Features | Cards show the transparent deal-check rule line | PASS |  |
| B7 | Features | Cards show a buy/wait verdict | PASS | 6/6 cards |
| B8 | Features | Cards show a product image | PASS | 6/6 cards |
| B9 | Features | Cross-store comparison found at least one other store | PASS | 3/6 cards |
| C1 | Persistence | List survives a reload | PASS | 6 before, 6 after |
| C2 | Privacy | A fresh visitor does not see another visitor's list | PASS |  |
| D0 | Alerts | Test setup: fresh context starts empty | PASS |  |
| D1 | Alerts | Stale item refreshes on reopen and fires a drop notification when price fell 10%+ | PASS | 1 notification(s): ["Price drop: Remington All-in","$29.00 at JB Hi-Fi"] |
| D2 | History | Price history accumulates across refreshes | PASS | 6 point(s) |
| E1 | Mobile | No horizontal scroll at 375px | PASS | scrollWidth 375 vs 375 |
| E2 | Mobile | Tap targets at least 40px tall | PASS | [] |
| F1 | A11y | No critical or serious axe violations | PASS |  |

## Mobile, accessibility, Lighthouse

- Mobile (375px): no horizontal scroll, tap targets at least 40px (E1, E2 pass).
- axe-core: no critical or serious violations (F1).
- Lighthouse, mobile: performance 83, accessibility 100, best practices 100, SEO 100.
- Lighthouse, desktop: performance 79, accessibility 100, best practices 100, SEO 100.

## Known open issue

Cumulative layout shift is 0.363 on mobile and 0.272 on desktop (Lighthouse target is 0.1 or lower). The shifting node is `body > div.wrap`. I could not reproduce it locally and a first-paint change did not move the number, so the cause is not yet found. It is the reason performance is below 90. Next step: record a performance trace on the runner and bisect by section.

## Limits of this report

- Tested from a datacenter, not from a phone on a home network.
- Alerts (D1) were tested by simulating the browser Notification API; real push delivery is not tested.
- Only Australian retailers were tested. Other countries are untested.
- No user data exists yet. No usage, retention or accuracy figures are claimed anywhere.
