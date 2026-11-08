# My Computer Build

A 3D PC builder website. Start with an empty case, add parts, and watch each one fly in and seat itself. Every change re-runs compatibility checks and updates price (new and used), power draw and FPS estimates for seven popular games.

## Run it

```bash
npm install
npm start            # http://localhost:4030  (PORT=8080 npm start to change)
npm run dev          # restarts on file changes
npm test             # estimate-engine tests
npm run validate     # checks data/ for missing fields, duplicate ids, missing prices
```

Needs Node 20 or newer. The only runtime dependencies are Express and three.js; three.js is served from `node_modules`, so nothing loads from a CDN except the Google Fonts stylesheet.

## Updating a running copy

On the machine that runs the site, from the project folder:

```bash
./update.sh            # pull latest main, npm ci, run tests, restart the server
./update.sh --no-test  # same, without the test run
```

It stops before touching anything if you have uncommitted changes to tracked files, and it doesn't restart if the tests fail, so the old version keeps serving. To restart, it uses a pm2 process or systemd service named `my-computer-build` if one exists; otherwise it runs `node server.js` in the background itself, with the PID in `.server.pid` and output in `server.log`. Set `BRANCH=other ./update.sh` to follow another branch. Your `.env` is never touched.

## What's in it

- **3D view** (`public/js/scene.js`, `public/js/models.js`): procedural low-poly models, one per category, sized from real specs (GPU length and slot width, cooler height, radiator size, case dimensions, board form factor). Parts that have nowhere to mount yet (a CPU with no motherboard) wait on a "bench" in front of the case and fly in when their mount appears. Incompatible parts glow red. When the build is complete and has no errors, the LEDs come on and the fans spin. Rendering is on demand: when nothing moves, nothing is drawn.
- **Estimate engine** (`shared/engine.js`): pure functions shared by the browser and the server. Compatibility rules, power, price totals, FPS model.
- **Several of the same part**: memory kits, graphics cards and drives have a quantity stepper. The board and case set the limit: memory slots and the board's capacity, full-length x16 slots and how far apart they sit compared with the card's thickness, the case's expansion slots, M.2 slots, SATA ports and drive bays. When the limit is reached, the + button explains why. Each stick, card and drive is its own 3D model and animates in and out separately; memory fills the slots in the order boards recommend (A2 and B2 first). A second graphics card adds price and power but not FPS, because games use one card.
- **Saved builds**: `localStorage` in the browser (`public/js/store.js`). Share links encode the build in the URL hash, with `q=r2g2` for two memory kits and two graphics cards.
- **API** (`server.js`): `GET /api/catalog`, `GET /api/parts/:category?q=`, `GET /api/parts/:category/:id`, `GET /api/games`, `POST /api/evaluate` with `{ "build": {...}, "resolution": "1440p" }`. A build may carry `"qty": { "ram": 2, "gpu": 2 }`; repeat a drive id in `storage` for several identical drives.

## The numbers are estimates

- **Prices** in `data/prices.json` are hand-compiled street-price estimates in USD (mid-2026), not live quotes. `new: null` means the part is no longer sold new; the retail total then falls back to its used price. EUR and CZK use fixed approximate rates from `data/meta.json`.
- **FPS** comes from a model, not from benchmarks of the exact build. `data/games.json` holds, per game, the average FPS of a fully GPU-bound and a fully CPU-bound reference system (RTX 4090 = GPU index 100, Ryzen 7 9800X3D = CPU index 100). A build's GPU `perfIndex` and CPU `gameIndex` scale those, and the two are combined as a soft bottleneck. VRAM shortfall, single-channel memory and low RAM apply penalties. Treat results as ±15% or wider.
- **Power** adds typical gaming and peak draw for CPU and GPU plus board, memory, drives and fans. The recommended PSU adds 30% headroom.

## Updating the data

Specs and prices live in separate files so prices can be refreshed without touching specs.

- **Add a part**: append an object to `data/parts/<category>.json` (copy a neighbour for the fields), add its price to `data/prices.json`, run `npm run validate`.
- **Slot layout fields** (optional, with defaults): motherboards have `gpuSlots` (full-length x16 slots a graphics card can use; Mini-ITX defaults to 1, others to 2), `gpuSlotGap` (expansion-slot positions between them, default 3) and `gpuSlot2Lanes` (lanes wired to the second slot, default 4). Cases have `expansionSlots` (default 7 for ATX cases, 5 for mATX, 3 for Mini-ITX). The seeded values follow each board's usual layout and are approximate; check the manual before relying on them.
- **Refresh prices from a spreadsheet, scraper or feed**: export a CSV with `id,new,used` columns and run
  ```bash
  npm run import-prices -- path/to/prices.csv --source "my-feed" --as-of 2026-11
  ```
  Empty cells leave a value unchanged; `null` or `-` marks "not sold new" or "no used market". Add `--dry-run` to preview.
- **Add a game**: append to `data/games.json`. Pick the reference GPU-bound FPS at each resolution and the CPU-bound FPS for the reference system; `alpha` below 1 flattens GPU scaling (good for esports titles), `cap` is an engine frame cap.

## Live prices (US): Best Buy + eBay

With API keys, the server pulls live prices every 6 hours and caches them in `.cache/live-prices.json`. Any part without a fresh, plausible live price keeps its estimate, so the site always works. Live prices show a green dot in the UI and link back to the store.

| Source | Gives | What you need |
| --- | --- | --- |
| [Best Buy Products API](https://bestbuyapis.github.io/api-documentation/) | Current new price (`salePrice`) | Free key from [developer.bestbuy.com](https://developer.bestbuy.com). Best Buy has asked for a company email address since 2016, not Gmail-type addresses. |
| [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html) | Typical asking price of active used Buy It Now listings | Free [eBay developer account](https://developer.ebay.com/my/keys) keyset. Production use of the Buy APIs needs eBay's approval, through the eBay Partner Network. |

Setup:

1. `cp .env.example .env` and fill in `BESTBUY_API_KEY` and/or `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`.
2. `npm start`. The first refresh runs on startup (about a minute for both sources) and is logged as `[prices] Best Buy: 61/119 matched`.
3. Optional: `npm run map-bestbuy` prints the Best Buy product each part matched; `npm run map-bestbuy -- --write` pins those SKUs in `data/price-sources.json`, so later refreshes track the exact product.
4. Check `GET /api/prices/status` for match counts and errors. `POST /api/prices/refresh` with `Authorization: Bearer $ADMIN_TOKEN` forces a refresh.

How matching works (`lib/prices/match.js`): graphics cards are searched by chip, so the live new price is the cheapest in-stock card of that chip from any brand. Other parts must match brand and model words. Listings for the wrong variant (Ti, Super, XT), empty boxes, broken cards and bundles are filtered out. A live price below 0.4× or above 2.5× the estimate is treated as a mismatch and ignored (`plausibleRange` in `data/price-sources.json`). Per-part overrides, such as a fixed SKU, a custom query, extra exclude words, or turning a source off, also go in `data/price-sources.json`.

Rules to keep: eBay's API licence requires listing data shown to users to be under 6 hours old (hence the 6-hour refresh) and restricts using its data to model prices. This app shows the asking price with a link to the listings. Read the [eBay API License Agreement](https://developer.ebay.com/develop/apis/api-license-agreement) before launching publicly. Best Buy allows only temporary caching of its data.

Not covered: Amazon's old Product Advertising API is shut down, and its replacement (Creators API) needs an Amazon Associates account with sales. Czech and EU stores have no free public price API. For those markets, the CSV importer above is the way in: feed it from an affiliate network's product feed or your own tracking.
