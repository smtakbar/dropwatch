# DropWatch: product requirements

Status: living document. Last updated 5 Nov 2026. Everything marked **[assumption]** is a belief to test, not a finding. Everything marked **[not measured]** has no data yet.

## 1. Problem
People who want to buy a specific product check store pages by hand, again and again, and still cannot tell whether today's price is good. Sale seasons (Black Friday, Boxing Day, end of financial year) make this worse: banners say "sale", but the shopper has no price history to check the claim against.

## 2. Target user **[assumption]**
An Australian online shopper planning a purchase of one to five specific items (electronics, computer parts, appliances) within weeks, who does not want another account. Persona is a hypothesis; no interviews have been run yet **[not measured]**.

## 3. Job to be done
"When I have chosen a product, tell me whether to buy it now or wait, and where it is cheapest, without making me sign up or check every day."

## 4. Value proposition
1. One paste (link or name) gives a price, a picture, a price chart and a clear buy or wait verdict.
2. The verdict rule is printed on the card, so the user can check it. It is a rule, not a forecast.
3. No sign-in. The list stays in the browser. Prices come from established retailers only.

## 5. Scope and decisions
| Decision | Chosen | Alternative | Why, and the cost |
|---|---|---|---|
| Where the user's list lives | Browser storage | Accounts and a database | No sign-in was a hard user requirement. Cost: no tracking while the page is closed, no sync across devices. |
| How prices reach the browser | Public read-only relays | Own server | Free, no account. Cost: relays can fail or be slow. Measured: see VALIDATION.md. |
| History for the verdict | Public CSV logged by a scheduled GitHub Action for a fixed seed list | Per-user history only | Per-user history is thin because it only grows on visits. The public log gives real history from day one for seed products. Cost: only seed products benefit. |
| Verdict method | Transparent rule (price vs 30-day low and median) | Model | Fewer than 60 days of data exist. A rule can be audited. A model cannot yet be validated. |
| Which stores are shown | Allowlist of established retailers | Everything a search returns | An early version showed an ad-aggregator and a store that sold a different pack size. Trust matters more than coverage. |
| Logger identity | Honest bot name, robots.txt obeyed, one request per product per run | Browser-like disguise | Terms-of-service and ethics. Cost: several stores refuse (see risks). |
| Region behaviour | The selector switches currency, search stores, samples and list filter | Currency only | A visitor in India should see Indian stores and products, not Australian ones. Cost: public sample logs exist for 7 of 13 regions only, because many retailers refuse bots. |
| Third-party history | Read one tracker that allows it (pricehistory.app, India); link out to the rest | Scrape Buyhatke, CamelCamelCamel, PriceSpy | Buyhatke blocks bots and disallows its API in robots.txt; CamelCamelCamel is behind a bot check. Cost: imported history is summary numbers for Indian products only. |
| Match strictness | 80% title match and sizes must agree | Looser match | A 30-pack was once shown for a 24-pack. |

## 6. Metrics (definitions)
- **Activation:** share of visits where a product is added **[not measured]**.
- **Return rate:** share of browsers that come back within 7 days **[not measured]**.
- **Useful verdict:** thumbs up on the verdict prompt **[not measured]**.
- **Data reliability:** share of logged fetches that return a price. Computed from `data/fetch-log.csv`; current snapshot in VALIDATION.md.
- **Privacy rule:** no personal data. Any counter must be aggregate only. No analytics service is connected yet, so usage metrics do not exist. Planned option: a cookie-free counter (for example GoatCounter), set up by the owner.

## 7. Risks and what was cut
| Risk | Evidence so far | Mitigation |
|---|---|---|
| Data reliability | In the first honest-bot probe, 3 of 12 seed products returned a price. After swapping blocked products for stores that allow polite fetching, 10 of 12 did. That figure is biased by the selection. | Show "could not read" plainly, never invent a price, keep the log public. |
| Store terms of service | Some stores return 403 or disallow bots in robots.txt. Terms were not reviewed clause by clause. | Obey robots.txt, identify the bot, low rate (about 12 requests per 6 hours). No evasion. A paid price API is the proper route for blocked stores. |
| Browser fetching relies on third-party relays | Worked for 6 of 6 products in one live run | Fallback relays; roadmap item to replace with an owned endpoint. |
| Privacy | Lists never leave the browser. The page calls an IP-location service to guess the country. | Location is only used to pick the currency. Can be changed by the user. |
| Wrong-product matches | Occurred twice in early builds | Strict size match, 80% title match, allowlist. |
**Cut:** accounts, GitHub-username lists, issue-based submissions, the hourly server cron for user items, the AI price-reading fallback (needs a secret key; not safe in client code) and the paid shopping API. Each can return on the roadmap with a server.

## 8. Comparison with existing tools
Sources checked on 5 Nov 2026 where noted. Unverified rows say so.
| Tool | What it does | Gap DropWatch targets |
|---|---|---|
| Google Shopping price tracking | Track a product, optional target price, push and email alerts. Requires sign-in. Available in US, Canada, Australia, Japan, India. (Google support page checked.) | No sign-in, visible rule behind the verdict, open price data. It is weaker at alerts: DropWatch cannot notify while the page is closed. |
| Keepa | Amazon only. Price history charts, price drop alerts, price watches. (keepa.com checked.) | Covers Australian electronics retailers instead of Amazon. Much smaller data set. |
| CamelCamelCamel | Described widely as Amazon price history and alerts. **Not verified in this session.** | Same as Keepa. |
| PriceSpy | Price comparison and history. **Not verified: its robots.txt blocked automated reading.** | Same positioning risk: comparison sites already do this at scale. |
The honest position: DropWatch is a small, transparent, open-data demonstration. It does not out-cover these tools.

## 9. Roadmap
**Now (shipped):** browser list, verdict rule, public log, test suite.
**Next:** per-product public history charts for seed products; feedback prompt; cookie-free usage counter.
**Needs data (do not build before):**
| Item | Gate | Validation method | Result |
|---|---|---|---|
| Monte Carlo "chance of reaching target by date" | 14+ days and 40+ readings per product (script is in `analysis/`, runs daily) | Calibration against the following 14 days once 60+ days exist | [not measured] |
| K-Means or Fuzzy C-Means on price behaviour (stable, volatile, sale-driven) to set check frequency | 30+ days across 20+ products | Silhouette score plus manual review of clusters | [not measured] |
| DBSCAN to flag suspicious "was" prices | 60+ days | Hand-labelled sample | [not measured] |
| Random forest or logistic regression for "drop within 7 days" | 60+ days of real history | Train on early dates, test on later dates only; permutation importance; error reported against the rule baseline | [not measured] |
No deep learning: the data will not justify it.

## 10. Pricing and business case (illustrative, assumptions labelled)
No revenue exists. A simple model for discussion only:
`monthly revenue = monthly active users x share who click through to a store x purchase rate x average order value x commission rate`
Every term is an **[assumption]** until measured: [MAU], [click-through share], [purchase rate], [average order value], [commission rate]. Replace each with a measured value or an affiliate program's published rate before quoting any figure. Costs today: hosting is free (GitHub Pages and Actions). Paid price APIs would be the main cost driver.

## 11. Changelog
| Date | Change |
|---|---|
| Oct 2026 | First version: server-side checker on GitHub Actions, issue forms, dashboard. |
| Oct 2026 | Added images, price chart, cross-store comparison, buy or wait advice. |
| Oct 2026 | Fixed wrong-pack matches; allowlist of established retailers. |
| Oct 2026 | Moved to browser-only, no sign-in, per-visitor lists. |
| 5 Nov 2026 | Public price log (every 6 hours), live-site test suite, fixes from the test report (mobile overflow, duplicate button, missing labels and repo link), deal-check rule, sample products, gated Monte Carlo script. |
| 5 Nov 2026 | Region switch for 13 countries (samples, search stores, currency, list filter), 22 seed products across India, Singapore, France, Brazil, Korea and Japan, "Price history on other trackers" panel, relay request limiter. |
