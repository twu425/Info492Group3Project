# BidGrid database

`data/bidgrid.db` is a SQLite database built from the scraper's CSV outputs by
`python -m cli.build_db`. The Next.js app reads it through its API layer
(`lib/bidgrid/db.ts`, via `better-sqlite3`). It is committed to the repo so the app
runs from a clone without re-scraping.

- **Engine:** SQLite (WAL mode at read time).
- **Built by:** `scraper/cli/build_db.py` — a full `DROP` + `CREATE` + `INSERT`, so
  every run recreates the database from scratch (idempotent).
- **Source of truth:** the three stage CSVs in `data/` (see below).

---

## How the database is populated (ingestion pipeline)

Data flows from three public Caltrans sources, through three resumable scraper
stages (each writing a CSV), and is then joined into the database:

```
 SOURCE                         STAGE                         OUTPUT
 ────────────────────────────   ──────────────────────────   ─────────────────────────────
 Caltrans bid portal (JSON API) ─ cli.pull_summaries ───────▶ data/bid_summaries.csv
                                                               1 row / contract
                                                               (district, date, top-3 bidders, pdf_url)

 Bid-summary PDFs (per contract) ─ cli.ingest_pdfs ─────────▶ data/line_items.csv
                                                               1 row / item / bidder
                                                               (the full all-bidder bid tab)

 Caltrans postmile GIS service  ─ cli.locate ──────────────▶ data/contract_locations.csv
                                                               1 row / postmile segment
                                                               (county, route, lat/lon, geocode level)
                                        │
                                        │   cli.build_db  — classify item families,
                                        ▼                   derive contract-level fields
                                 data/bidgrid.db
                                        │
                                        │   cli.export_app
                                        ▼
                          ../lib/bidgrid/contracts.generated.json   (explorer bundle)
```

`build_db` reads all three CSVs, keyed on the contract `ea`, and for each contract:

1. **Line items** — one DB row per (item, bidder). Item families are assigned by
   `caltrans/classify.py` (code-prefix rules + description keywords; kept in sync
   with the app's `lib/bidgrid/classify.ts`). Lump-sum quantities become `1.0`.
2. **Per-bidder totals** — summed from each bidder's line items (the winning
   bidder's sum is the contract's `low_total`).
3. **Representative location** — the geocoded segment with the most postmile points
   (segment-level preferred over route-level) supplies the contract's
   `county / route / postmiles / lat / lng`.
4. **Contract characterization** — `primary_family`, `type_of_work`, and
   `project_type` are derived (see [Derived fields](#derived-fields)).

The pipeline is resumable (progress logged in `state/`), so re-running only
processes new dates/contracts; `build_db` then rebuilds the whole DB from the
accumulated CSVs. See [README.md](README.md) for how to run each stage.

---

## Schema

Five tables, all keyed to a contract by its `ea` (the Caltrans contract /
"expenditure authorization" number). Foreign keys are logical, not enforced.

```
 contracts (ea) ──┬──< bidders            (contract_ea)   one row / bidder
                  ├──< line_items         (contract_ea)   one row / item / bidder
                  ├──< contract_families  (contract_ea)   one row / family touched
                  └──< locations          (contract_ea)   one row / geocoded segment
```

### `contracts` — one row per contract/project

| Column | Type | Notes |
|---|---|---|
| `ea` | TEXT PK | Caltrans contract number, e.g. `04-1Q2304`. |
| `district` | INTEGER | Caltrans district 1–12. |
| `bid_date` | TEXT | Bid-opening date, `YYYY-MM-DD`. |
| `county` | TEXT | Primary county code (from the representative location). |
| `route` | INTEGER | State route number (null if non-numeric / ungeocoded). |
| `postmile_start` / `postmile_end` | REAL | Project postmile extent. |
| `lat` / `lng` | REAL | Representative map point (centroid of the extent); null if ungeocoded. |
| `project_type` | TEXT | Category of `primary_family` (e.g. `Paving`). |
| `type_of_work` | TEXT | Top ≤3 material families by low-bid $, comma-joined. |
| `primary_family` | TEXT | Dominant **material** family — see [Derived fields](#derived-fields). |
| `num_bidders` | INTEGER | Number of bidders on the contract. |
| `num_items` | INTEGER | Distinct line-item numbers (bid-tab length). |
| `low_bidder` | TEXT | Winning (rank-1) bidder name. |
| `low_total` | REAL | Winning bidder's summed line-item total (their "Cost"). |
| `pdf_url` | TEXT | Link to the official Caltrans bid-summary PDF. |

### `bidders` — one row per (contract, rank)

| Column | Type | Notes |
|---|---|---|
| `contract_ea` | TEXT | → `contracts.ea`. |
| `rank` | INTEGER | Rank by total bid; **1 = low (winning) bidder**. |
| `name` | TEXT | Bidder (firm) name. |
| `total` | REAL | Firm's summed line-item total on this contract. |
| | | PK `(contract_ea, rank)`. |

### `line_items` — one row per (contract, item, bidder)

The full all-bidder bid tab — every bidder's unit price on every item.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Autoincrement surrogate key. |
| `contract_ea` | TEXT | → `contracts.ea`. |
| `bidder_rank` | INTEGER | Which bidder (1 = low bidder), joins to `bidders.rank`. |
| `bidder_name` | TEXT | Bidder name (denormalized for convenience). |
| `item_no` | TEXT | Position in the bid tab, e.g. `0012`. |
| `item_flag` | TEXT | Federal-aid marker (`F`) if present, else empty. |
| `item_code` | TEXT | Caltrans standard item code, e.g. `390132`. |
| `description` | TEXT | Item description (raw, uppercase). |
| `family` | TEXT | Classified item family (see `classify.py`). |
| `unit` | TEXT | Unit of measure (LS, EA, LF, CY, TON, …). |
| `quantity` | REAL | Engineer's estimated quantity (`1.0` for lump-sum items). |
| `unit_price` | REAL | This bidder's unit price for the item. |
| `total_price` | REAL | `unit_price × quantity` (the extended bid amount). |

### `contract_families` — one row per (contract, family)

Every item family the contract's **winning** bid touched, for fast family-filtering.

| Column | Type | Notes |
|---|---|---|
| `contract_ea` | TEXT | → `contracts.ea`. |
| `family` | TEXT | An item family present in the low bid. PK `(contract_ea, family)`. |

### `locations` — one row per geocoded postmile segment

A contract can span several segments (multiple routes / postmile ranges).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Autoincrement surrogate key. |
| `contract_ea` | TEXT | → `contracts.ea`. |
| `county` | TEXT | County code. |
| `route` | INTEGER | State route number. |
| `pm_prefix` | TEXT | Postmile prefix (`R`, `T`, `M`, …) if any. |
| `begin_pm` / `end_pm` | REAL | Segment postmile range. |
| `centroid_lon` / `centroid_lat` | REAL | Segment centroid (WGS84). |
| `n_points` | INTEGER | Postmile vertices the geocoder matched for this segment. |
| `geocode_level` | TEXT | `segment` (precise postmiles) or `route` (whole route-in-county fallback). |

---

## Derived fields

A few `contracts` columns are computed in `build_db`, not scraped directly:

- **`low_total`** — the winning bidder's summed line-item amounts. This is the
  bid-tab "Cost"; on contracts with a time-related overhead component it is slightly
  below the official award total.
- **`primary_family`** — the family with the largest low-bid dollar share, **excluding
  overhead-style families** (Mobilization, Traffic Control, Project Overhead, Water
  Pollution Control, and `Other`). Those appear on nearly every job and would mislabel
  the contract, so the label reflects the dominant *material* work.
- **`project_type`** — the category of `primary_family` (e.g. `Structural Concrete`
  → `Structures`).
- **`type_of_work`** — the top ≤3 material families by low-bid dollar, comma-joined.

Note: a bid's **item rank** (how a bidder's unit price ranked against others for a
single item) is *not* stored — it's computed in the app (`lib/bidgrid/family.ts`)
when needed, since it's cheap and view-specific.

---

## Indexes

Tuned for the API's access patterns (contract detail, family rollups, bidder
history, map/list filters):

| Index | Serves |
|---|---|
| `idx_li_contract` on `line_items(contract_ea)` | contract detail |
| `idx_li_family` on `line_items(family)` | family stats / rollups |
| `idx_li_code` on `line_items(item_code)` | per-item lookups |
| `idx_li_bidder` on `line_items(bidder_name)` | bidder history |
| `idx_li_rank` on `line_items(contract_ea, bidder_rank)` | low-bid-only aggregates |
| `idx_bidders_name` on `bidders(name)` | bidder detail |
| `idx_contracts_district` / `_family` / `_date` | explorer list & filters |
| `idx_locations_contract` on `locations(contract_ea)` | contract detail |

---

## Rebuilding

From the `scraper/` directory, after running the scrape stages:

```sh
python -m cli.build_db     # recreate data/bidgrid.db from the CSVs
python -m cli.export_app   # regenerate ../lib/bidgrid/contracts.generated.json
```

Both `bidgrid.db` and `contracts.generated.json` are committed, so re-commit them
after a rebuild.

## Quick queries

```sql
-- Low-bid unit-price distribution for an item code
SELECT unit_price FROM line_items WHERE item_code='390132' AND bidder_rank=1;

-- A bidder's win rate
SELECT COUNT(*) bids, SUM(rank=1) wins FROM bidders WHERE name='O.C. JONES & SONS, INC.';

-- Family spend across the winning bids
SELECT family, SUM(total_price) v FROM line_items WHERE bidder_rank=1 GROUP BY family ORDER BY v DESC;
```
