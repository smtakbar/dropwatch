# Backlog (prioritised)

Priority: P0 must do before the application link is shared; P1 next; P2 only with enough data. Status as of 5 Nov 2026.

## P0
| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Fix bugs from the first live test (mobile overflow, duplicate Track button, input label, console 404, missing repo link, no sample data) | Done | See VALIDATION.md for the before and after |
| 2 | First-run experience with sample products | Done | Real sample products from the public log, not invented data |
| 3 | Public repo with README | Done | Repo was already public |
| 4 | Start logging prices for a fixed seed list | Done, running every 6 hours | 12 products seeded; 10 return prices. Replace the 2 that do not |
| 5 | Keep logging until at least 24 Nov so the page shows history | In progress | Each day adds about 4 readings per product |

## P1
| # | Item | Status |
|---|---|---|
| 6 | Deal check rule (price vs 30-day low and median), labelled as a rule | Done |
| 7 | One-page PRD in the repo | Done (`PRD.md`) |
| 8 | Public per-product history chart for seed products (from `data/prices.csv`) | To do |
| 9 | Privacy-safe usage counts (products tracked, return visits) | To do: needs an aggregate-only counter, owner to create one (for example GoatCounter). Not faked. |
| 10 | One-tap feedback on the verdict | Partly: footer link opens a GitHub issue. A one-tap prompt needs the counter above. |
| 11 | Replace public relays with an owned endpoint | To do: needs a small server |
| 12 | Add a licence file | To do: owner decision |

## P2 (gated by data)
| # | Item | Gate | Status |
|---|---|---|---|
| 13 | Monte Carlo "chance of reaching target by date" | 14+ days, 40+ readings | Script and daily job exist; results will appear in `data/analysis.json`; UI not wired; not validated |
| 14 | K-Means or Fuzzy C-Means price-behaviour clusters | 30+ days, 20+ products | Not started |
| 15 | DBSCAN for fake "was" prices and outliers | 60+ days | Not started |
| 16 | Random forest or logistic regression for "drop in 7 days", time-based validation, permutation importance, compared to the rule | 60+ days | Not started. With the 24 Nov deadline, 60 days of history cannot exist yet. |
| 17 | Pricing and business case with measured inputs | Needs usage data | Structure in `PRD.md` section 10 |

## Added 5 Nov 2026 (regions and trackers)
| # | Item | Status | Notes |
|---|---|---|---|
| 13 | Region switch changes samples, search stores, currency, list | Done | Live tests G1 to G5, G8 in VALIDATION.md |
| 14 | Logged samples for US, GB, CA, DE, NZ, AE | Blocked | Tested retailers refuse bots. Options: find retailers that allow it, or use official affiliate or product feeds (needs the owner's accounts) |
| 15 | Third-party history import | Partly done | pricehistory.app (India) read automatically; others are links. Buyhatke and CamelCamelCamel cannot be read legitimately |
| 16 | Replace public relays with an owned endpoint | To do | Only r.jina.ai worked reliably in the last diagnostic; corsproxy.io now needs an API key |
| 17 | Fix layout shift (CLS 0.37 mobile) | To do | Cause not found yet |
