# Ledger

A personal finance dashboard — cash flow, savings goals, and a gold/silver/crypto/stocks
asset tracker with live market prices. Plain HTML/CSS/JS, no build step, no framework.

Starts completely empty — no demo or placeholder numbers are baked in. Add your first
month of cash flow or your first asset and the dashboard fills in from there.

## Run it

Just open `index.html` in a browser to try it out. For anything beyond a quick look —
live price fetching and the offline/installable behavior below — serve it locally
instead of double-clicking the file, since `file://` pages can't register a service
worker and often restrict `fetch`:

```bash
cd ledger-webapp
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy it

Any static host works — drag the folder into [Netlify Drop](https://app.netlify.com/drop),
push it to a GitHub repo and enable **GitHub Pages**, or use `vercel deploy` / `surge`.
No server, database, or environment variables needed.

**This must be served over HTTPS** (any of the hosts above do this automatically) —
service workers refuse to register over plain HTTP or when opened directly as a
`file://` path, so installability and offline support only kick in once it's actually
hosted somewhere.

## Installing it as an app (PWA)

Ledger is a installable Progressive Web App — it can run in its own window with no
browser address bar, get its own icon, and load instantly (even offline) once installed.

- **Android / Desktop Chrome, Edge**: an install icon appears in the address bar, or use
  the browser menu → "Install Ledger" / "Add to Home screen".
- **iOS Safari**: tap the Share icon → **Add to Home Screen**. iOS doesn't support the
  automatic install prompt the other platforms use, so this is the only way there.

Once installed, the app shell (HTML/CSS/JS/fonts/icons) is cached by a service worker,
so it opens instantly and keeps working without a connection. Live prices still need a
real network hit when you tap "Refresh live prices" — those calls are deliberately never
cached, since a stale price is worse than no price.

When a new version is deployed, the app fetches it in the background and reloads itself
once automatically to pick it up — no stuck old version, no manual cache-clearing needed.

## Data & storage

All your data (cash flow entries, assets, goals) is saved to **localStorage in your
browser** — it stays on your device and isn't sent anywhere. This also means:

- Data is per-browser. Opening the app in a different browser or device starts fresh.
- Clearing your browser's site data / localStorage will erase it.
- There's no automatic cloud sync.

### Backing it up / moving it to another device

Use the **Export** and **Import** buttons in the top-right of the header:

- **Export** downloads a `ledger-backup-YYYY-MM-DD.json` file containing everything —
  cash flow, assets, goals, market price cache.
- **Import** reads a previously exported file back in. This **replaces everything**
  currently in the app on that device, so it asks for confirmation first.

To move your data to another device or browser: Export on the old one, copy the file
over (email it to yourself, put it in a cloud drive, AirDrop, USB stick — anything),
then Import on the new one. Do this periodically as a backup even if you're not
switching devices, since there's no other recovery path if the browser's storage gets
cleared.

If you want *real* automatic multi-device sync instead of manual export/import, that
requires wiring the app up to a backend (e.g. Firebase, Supabase, or your own small
API) — happy to help build that if you want to go that route.

## Live prices

Click **Refresh live prices** on the Assets tab. It calls:

- **[xaus.com](https://xaus.com/api/)** — free, no API key, no rate limit for reasonable
  use — for gold (XAU) and silver (XAG) spot prices converted to MYR, plus the live
  USD→MYR rate.
- **[CoinGecko](https://www.coingecko.com/en/api)** — free, no key — for any crypto asset
  where you've filled in a **Coingecko ID** (e.g. `bitcoin`, `ethereum`) and a **quantity**.

How each asset type updates:

| Category | What it needs | How value is computed |
|---|---|---|
| Gold / Silver | `Weight (g)` field | `grams × live price per gram` |
| Crypto (coin-based) | `Coingecko ID` + `Qty` | `qty × live coin price in MYR` |
| Crypto (balance-based) | `USD balance` | `usdValue × live USD/MYR rate` |
| Everything else | — | Edit `Current value` manually |

Prices are indicative mid-market rates, not tradable quotes — good for tracking net
worth, not for executing trades.

## Cash flow reordering

Grab the `⋮⋮` handle on the left of any row in the Cash flow tab and drag it to
wherever you want — new entries no longer have to sit at the bottom.
