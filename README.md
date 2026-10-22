# DropWatch

Price tracker that runs entirely in the visitor's browser. No sign-in, no accounts, no server.

- Each person's list is saved only in their own browser (`localStorage`), so every visitor sees their own products.
- Country and currency are guessed from the visitor's location and can be changed.
- Prices are read through public read-only relays while the page is open; the page then compares trusted retailers and advises buy or wait.
- Files: `docs/index.html` (page) and `docs/engine.js` (price reading, history, advice). Hosted by GitHub Pages from `/docs`.
- `scripts/` and `.github/workflows/check.yml` are the older server-side checker (manual run only).
