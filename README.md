# DropWatch (GitHub-only)

No Supabase, no Vercel, no other accounts. Only GitHub.

- **Page:** GitHub Pages serves `docs/index.html`.
- **Price checks:** GitHub Actions runs hourly, reads `watchlist.json`, writes `docs/data.json`.
- **Alerts:** when a target is hit, the bot opens an issue that @mentions you. GitHub emails you.
- **Add/remove products:** the page's buttons open GitHub issue forms. A workflow updates `watchlist.json`. Only the repo owner's issues are accepted.

## Setup (browser only, ~10 min)

1. github.com -> **New repository** -> name `dropwatch` -> **Public** -> Create.
   (Free GitHub Pages needs a public repo. Your watchlist will be publicly visible.)
2. Unzip this project. On the repo page click **uploading an existing file** and drag in the **contents** of the folder, including `.github`.
   - Mac: the `.github` folder is hidden in Finder. Press **Cmd+Shift+.** to show it, then drag it in.
   - If `.github` won't upload: **Add file -> Create new file**, type `.github/workflows/check.yml` as the name, paste the file's contents, commit. Repeat for the other 5 files in `.github/`.
3. **Settings -> Pages** -> Source: **Deploy from a branch** -> Branch `main`, folder `/docs` -> Save.
4. **Settings -> Actions -> General -> Workflow permissions** -> **Read and write permissions** -> Save.
5. **Actions** tab -> if asked, click to enable workflows -> **Check prices** -> **Run workflow**. Wait ~1 min for the green tick.
6. Open `https://<your-username>.github.io/dropwatch/`.
7. **Email alerts:** GitHub avatar -> Settings -> Notifications -> make sure Email is ticked for "Participating, @mentions and custom".

## Use
- **+ Track product** -> fill the form -> Submit new issue. In ~1 min the item appears on the page.
- **Remove** on a card -> Submit new issue.
- Region selector (top right) converts every price into your currency. Rates refresh each run.

## Limits
- **Not tested on GitHub itself or against live stores** (build environment can't reach either). Scripts are tested locally against fixtures.
- Price reading uses plain page fetches (JSON-LD / meta tags). Stores that block bots or render prices with JavaScript, Amazon especially, show "Could not find a price" on the card.
- Hourly schedule can run late on GitHub. Scheduled workflows in public repos pause after 60 days without repo activity; if that happens, click **Enable** in the Actions tab.
- Single user. No login. Anyone can see the page and `watchlist.json`.
