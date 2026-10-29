# BidGrid

BidGrid is a Caltrans construction cost explorer. It lets you browse historical
highway construction contracts on a map, dig into how unit prices for specific
work items have moved over time and across regions, and build a preliminary bid
item estimate for a new location with help from an AI assistant.

The app is built with Next.js (App Router), React, TypeScript, Tailwind CSS,
MapLibre GL for the map, and the Vercel AI SDK with Anthropic's Claude for the
estimating assistant.

## What you can do

- **Explore contracts on a map.** Every contract is a marker colored by its work
  category. Filter by district, bid year, and item family.
- **Study an item family.** Open any family to see a unit price trend over time
  (quarterly weighted average with a P25 to P75 band), per unit statistics, a map
  of where the work was bid, and a sortable table of individual line item bids.
  The table shows how each bid ranked on its item and on the overall contract,
  which quantity band it falls in, and how its price compares to what is typical
  for that quantity.
- **Inspect a contract or a bidder.** Drill into a single contract's bidders and
  line items, or into a bidder's history across contracts.
- **Build an estimate.** Drop a pin anywhere, describe the work in plain language,
  and the assistant maps it to catalog items, pulls comparable historical prices
  near the pin, and assembles a bid item list with quantities and prices you can
  edit. Estimates can be saved as drafts in the browser.

## The data is real

BidGrid runs on **real California DOT (Caltrans) bid data**, scraped from the
public bid-summary PDFs. For every contract, the full bid tab is parsed — each
bidder's unit price on each line item — geocoded to the project's location, and
loaded into a SQLite database the app queries.

The current dataset is a recent slice (the scraper is built to backfill more):

- **142 contracts** across **all 12 Caltrans districts**, bid **Jan–Apr 2026**, in 47 counties.
- **44,951 line-item bids** — every bidder on every item — spanning **1,267 item
  codes** in 36 families.
- **213 distinct contractors**, averaging ~6 bidders per contract.
- **137 of 142 contracts geocoded** to a mappable location; ~$0.89B in winning bids.

### Pipeline

`scraper/` (Python) turns the public records into the app's database in four
resumable stages:

1. **Summaries** — pull per-weekday bid summaries from the Caltrans portal.
2. **Line items** — download each bid-summary PDF and parse the full all-bidder bid
   tab (validated against the PDF's own stated totals).
3. **Locations** — parse each project's postmile range and geocode it against the
   Caltrans postmile GIS service.
4. **Build** — classify item families, then write the SQLite DB (`cli.build_db`) and
   the explorer's JSON bundle (`cli.export_app`).

See **Data & database** below and `scraper/README.md` for how to run it.

### Derived analytics

On top of the real contracts, `lib/bidgrid/family.ts` and `lib/bidgrid/estimate.ts`
compute the numbers the UI shows — all from actual bids:

- **Escalation factor** per item and quarter, used to restate older prices in
  current dollars so different quarters are comparable.
- **Comparables** for a pin: bids for an item code within 50 miles and the last few
  years, with prices escalated to now (used by the estimate assistant).
- **Quantity bands** (Small, Medium, Large) from the 33rd and 67th percentiles of an
  item code's bid quantities.
- **Vs. typical** price, from a log-log regression of price on quantity, which flags
  bids that are unusually high or low for their size.

The same band and vs-typical logic powers both the item-family table and the
estimate's comparable rows, so the two views always agree. (With only a few months
of data today, the cross-quarter analytics are thin — they get meaningful as the
scrape backfills more history.)

## Running locally

The committed database and JSON bundle mean the app runs straight from a clone:

```bash
npm install
npm run dev
```

The estimate assistant calls Anthropic's API. Set `ANTHROPIC_API_KEY` in a
`.env.local` file at the project root before using the build-estimate feature.

```
ANTHROPIC_API_KEY=your_key_here
```

## Data & database

The explorer runs on real California DOT bid data, scraped from Caltrans and stored
in SQLite. Two generated artifacts are **committed** so the app builds and runs
straight from a clone — no scraping required:

- `scraper/data/bidgrid.db` — the SQLite database the API reads.
- `lib/bidgrid/contracts.generated.json` — the bundle the explorer imports.

To (re)build them from the scraper — e.g. after collecting more dates — run from the
`scraper/` directory:

```bash
cd scraper
python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

python -m cli.pull_summaries 2026-01-01 2026-12-31   # stage 1: bid summaries
python -m cli.ingest_pdfs                            # stage 2: all-bidder line items
python -m cli.locate                                 # stage 3: geocode project locations
python -m cli.build_db                               # -> data/bidgrid.db
python -m cli.export_app                             # -> ../lib/bidgrid/contracts.generated.json
```

The raw scrape (PDFs, intermediate CSVs, progress logs) is gitignored. See
`scraper/README.md` for full pipeline details.

## Project layout

- `scraper/` Python pipeline that scrapes Caltrans, builds `bidgrid.db`, and exports the app JSON.
- `app/` Next.js routes, including the `api/` endpoints (contracts, bidders, stats) and `api/build` for the assistant.
- `components/bidgrid/` the explorer, map, filters, detail views, and build drawer.
- `lib/bidgrid/data.ts` the data types/taxonomy and the real-data `CONTRACTS` loader.
- `lib/bidgrid/db.ts` + `lib/bidgrid/contract-types.ts` the SQLite access layer behind the API.
- `lib/bidgrid/estimate.ts` pricing, comparables, bands, and the price curve.
- `lib/bidgrid/family.ts` item-family statistics and trend series.
- `lib/bidgrid/classify.ts` maps item codes to families (mirrors `scraper/caltrans/classify.py`).
- `lib/bidgrid/build-tools.ts` the tool definitions the assistant uses.
