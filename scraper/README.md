# Caltrans scraper

Two-stage pipeline that pulls California DOT bid data into CSVs for the explorer app.

```
Stage 1  portal page API   → data/bid_summaries.csv       (1 row / contract, top-3 bidders + pdf_url)
Stage 2  bid-summary PDFs   → data/line_items.csv          (1 row / line item / bidder, all bidders)
Stage 3  PDF Location + GIS → data/contract_locations.csv  (1 row / project postmile segment, geocoded)
```

Stages 2 and 3 both read stage 1's output (the `pdf_url` column), so run stage 1
first. Stage 3 reuses the PDFs cached by stage 2 (and downloads any that are missing).

## Layout

```
caltrans/            importable package (no side effects, no CLI)
  config.py          endpoints, USER_AGENT, all on-disk paths
  schema.py          CSV column definitions (single source of truth)
  session.py         portal HTTP session + token
  summaries.py       stage-1 fetch (fetch_day, weekdays, find_data)
  io.py              resumable CSV append + done-set helpers (shared)
  location.py        parse Location strings + geocode via Caltrans postmile service
  pdf/
    download.py      pdf_url → cached file in data/pdfs/
    parse.py         PDF → line-item rows (pdfplumber)
    header.py        PDF → contract header fields (Location, …)
cli/                 entry points (thin; orchestration only)
  pull_summaries.py  stage 1
  ingest_pdfs.py     stage 2
  locate.py          stage 3
  build_db.py        join all stages -> SQLite DB (the app's API reads this)
  export_app.py      join all stages -> app JSON (the explorer imports this)
data/                bidgrid.db (committed) + CSV outputs & pdfs/ cache (gitignored)
state/               resume logs (summaries_done.txt, pdfs_done.txt) — gitignored
```

The split is by responsibility: **network** (`session`, `summaries`, `pdf/download`),
**parsing** (`pdf/parse`), **persistence** (`io`, `schema`, `config`). Both CLIs reuse
the same resume-and-append logic from `io.py`.

## Setup

```sh
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Put a real contact email in `caltrans/config.py` (`USER_AGENT`) so the site owner can reach you.

## Running

Run **from this `scraper/` directory** (the `-m` form puts it on the import path):

```sh
# Stage 1 — pull summaries for a date range (weekdays only)
python -m cli.pull_summaries 2026-04-27 2026-05-01          # test one week first
python -m cli.pull_summaries 2025-01-01 2025-12-31 --delay 5

# Stage 2 — download PDFs and parse line items
python -m cli.ingest_pdfs --limit 5                          # smoke-test on 5 contracts
python -m cli.ingest_pdfs --delay 3                          # process everything new

# Stage 3 — parse project locations and geocode them
python -m cli.locate --limit 10                              # smoke-test on 10 contracts
python -m cli.locate                                         # geocode everything new
```

## Building the database

The app reads a SQLite database (`data/bidgrid.db`) through its API, and the
explorer imports a JSON bundle (`../lib/bidgrid/contracts.generated.json`). Both
are built from the three stage CSVs — so after running stages 1–3, build them:

```sh
python -m cli.build_db        # -> data/bidgrid.db  (contracts, bidders, line_items, locations)
python -m cli.export_app      # -> ../lib/bidgrid/contracts.generated.json
```

`build_db` classifies item families (`caltrans/classify.py`, kept in sync with the
app's `lib/bidgrid/classify.ts`) and writes the normalized tables + indexes.
**See [DATABASE.md](DATABASE.md)** for the full schema and the ingestion data flow.

Both `bidgrid.db` and `contracts.generated.json` are **committed to the repo** so a
fresh clone builds and runs without re-scraping. The raw/intermediate data (PDFs,
CSVs, progress logs) is gitignored — re-run the pipeline above, then `build_db` and
`export_app`, to refresh everything after scraping more dates.

### From a fresh clone (data already committed)

```sh
cd scraper && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
# the DB + JSON are already present; just run the app from the repo root:
#   npm install && npm run dev
```

Both stages are resumable: progress is flushed after every unit of work, so Ctrl+C
and rerunning the same command picks up where it left off. The `--delay` throttle is
there to be polite to the server.

## Notes on the PDF data

- The PDFs itemize **every bidder**: the winner from the "Contract Proposal of Low
  Bidder" section (rank 1) and the rest from the "Summary of Remaining Bidders" table
  (ranks 2..N), joined on item number. So `line_items.csv` has one row per (item,
  bidder) — `bidder_rank` is the bid-total rank, and expect `items × bidders` rows per
  contract. This is the same all-bidders grain as the root `Caltrans Real Bid Data.csv`.
- `item_flag` captures the federal-aid marker (`F`) that appears on some items.
- `is_lump_sum = True` rows have no `quantity`; `unit_price_usd == total_item_bid_usd`.
- Parsing strategy: the low-bidder section has fixed columns and is read with a regex;
  the wide "Summary of Remaining Bidders" table is read by **column geometry** — each
  number is bound to a bidder by its x-coordinate (ordinal-header positions define the
  column boundaries). This tolerates many bidders (the table paginates to a few columns
  per page) and, crucially, a bidder who didn't bid an item leaves one empty cell rather
  than shifting the whole row.
- Validated against all 144 contracts of the 2026 sample: item counts match the PDF's
  stated "Number of Items", and per-bidder sums of line-item amounts reconcile to each
  bidder's header total (3–11 bidders, both header formats). `parse_pdf` returns anything
  it couldn't resolve cleanly as an `unparsed` list and `ingest_pdfs` prints the count —
  watch that number when widening to new years/districts.

## Notes on the location data (stage 3)

- `contract_locations.csv` has one row per project postmile segment (or per route, for the
  coarse fallback). A contract with multiple ranges (e.g. `0.0/3.4,3.7/6.8`) produces several
  rows. Every geocoded row carries extent endpoints (`begin_lon/lat`, `end_lon/lat`), a
  `centroid_lon/lat` (the right single map pin), and the vertex count (`n_points`).
- `geocode_level` records precision:
  - `segment` — a specific postmile range was range-queried (every vertex in the span).
    County codes come from the Location string (uppercased to the service's 58 codes);
    single-postmile projects are searched within ±0.1 mi.
  - `route` — no specific postmiles given (`Var`), so the whole route-within-county is used.
    Multi-county/route strings produce one row per valid (county, route) pair; invalid pairs
    return no vertices and are dropped.
  - `none` — ungeocodable: no county, no numeric route (e.g. `CR 29`), or blank. The parsed
    county/route are kept for reference.
- With the route-level fallback, ~95% of contracts get at least a coarse location.
- Postmile *prefixes* (`R`, `T`, `M`, …) are parsed into `pm_prefix` but the range query
  currently matches on the numeric postmile only, so a prefixed segment may include nearby
  unprefixed vertices. Good enough for mapping; tighten with a `PMPrefix` filter if needed.
```
