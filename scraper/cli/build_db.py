"""Build a SQLite relational database from the three stage outputs.

Reads data/{bid_summaries,line_items,contract_locations}.csv and writes a
normalized DB at data/bidgrid.db with tables: contracts, bidders, line_items,
contract_families, locations. Item families are classified here so `family` is a
queryable column. The Next.js API layer reads this DB.

Usage (from the scraper/ directory):
    python -m cli.build_db
"""

import csv
import sqlite3
from collections import defaultdict

from caltrans import config
from caltrans.classify import classify_family

DB_PATH = config.DATA_DIR / "bidgrid.db"

SCHEMA = """
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS bidders;
DROP TABLE IF EXISTS line_items;
DROP TABLE IF EXISTS contract_families;
DROP TABLE IF EXISTS locations;

CREATE TABLE contracts (
  ea TEXT PRIMARY KEY,
  district INTEGER,
  bid_date TEXT,
  county TEXT,
  route INTEGER,
  postmile_start REAL,
  postmile_end REAL,
  lat REAL,
  lng REAL,
  project_type TEXT,
  type_of_work TEXT,
  primary_family TEXT,
  num_bidders INTEGER,
  num_items INTEGER,
  low_bidder TEXT,
  low_total REAL,
  pdf_url TEXT
);
CREATE TABLE bidders (
  contract_ea TEXT, rank INTEGER, name TEXT, total REAL,
  PRIMARY KEY (contract_ea, rank)
);
CREATE TABLE line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_ea TEXT, bidder_rank INTEGER, bidder_name TEXT,
  item_no TEXT, item_flag TEXT, item_code TEXT, description TEXT,
  family TEXT, unit TEXT, quantity REAL, unit_price REAL, total_price REAL
);
CREATE TABLE contract_families (contract_ea TEXT, family TEXT, PRIMARY KEY (contract_ea, family));
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_ea TEXT, county TEXT, route INTEGER, pm_prefix TEXT,
  begin_pm REAL, end_pm REAL, centroid_lon REAL, centroid_lat REAL,
  n_points INTEGER, geocode_level TEXT
);

CREATE INDEX idx_li_contract ON line_items(contract_ea);
CREATE INDEX idx_li_family ON line_items(family);
CREATE INDEX idx_li_code ON line_items(item_code);
CREATE INDEX idx_li_bidder ON line_items(bidder_name);
CREATE INDEX idx_li_rank ON line_items(contract_ea, bidder_rank);
CREATE INDEX idx_bidders_name ON bidders(name);
CREATE INDEX idx_contracts_district ON contracts(district);
CREATE INDEX idx_contracts_family ON contracts(primary_family);
CREATE INDEX idx_contracts_date ON contracts(bid_date);
CREATE INDEX idx_locations_contract ON locations(contract_ea);
"""

# Category per family — mirrors CATEGORY_FAMILIES in lib/bidgrid/data.ts.
FAMILY_CATEGORY = {
    "Minor Concrete": "Concrete", "Structural Concrete": "Concrete",
    "Concrete Barrier": "Concrete", "PCC Pavement": "Concrete",
    "Hot Mix Asphalt": "Paving", "Rubberized HMA": "Paving",
    "Aggregate Base": "Paving", "Cold Planing": "Paving",
    "Roadway Excavation": "Earthwork", "Embankment": "Earthwork",
    "Clearing & Grubbing": "Earthwork",
    "Reinforced Concrete Pipe": "Drainage", "Corrugated Steel Pipe": "Drainage",
    "Drainage Inlets": "Drainage",
    "Reinforcing Steel": "Structures", "Retaining Wall": "Structures",
    "Sound Wall": "Structures",
    "Thermoplastic Striping": "Traffic & Electrical", "Pavement Markers": "Traffic & Electrical",
    "Roadside Signs": "Traffic & Electrical", "Traffic Signals": "Traffic & Electrical",
    "Lighting": "Traffic & Electrical", "Metal Beam Guardrail": "Traffic & Electrical",
    "Erosion Control": "Landscape & Erosion", "Irrigation": "Landscape & Erosion",
    "Planting": "Landscape & Erosion",
    "Seal Coats & Surface Treatments": "Paving",
    "Bridge Deck & Rehab": "Structures", "Piles & Shoring": "Structures",
    "Structural Steel": "Structures", "Fencing": "Traffic & Electrical",
    "Mobilization": "General & Site Work", "Traffic Control": "General & Site Work",
    "Project Overhead": "General & Site Work", "Water Pollution Control": "General & Site Work",
    "Other": "Other",
}

# Families that describe overhead/site work rather than the project's material work;
# excluded when choosing a contract's primary_family / type_of_work label.
NON_CHARACTERIZING = {f for f, c in FAMILY_CATEGORY.items() if c == "General & Site Work"} | {"Other"}


def _rows(path):
    if not path.exists():
        raise SystemExit(f"missing {path} — run the earlier stages first")
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def _num(s):
    return float(s) if s not in (None, "") else None


def _pick_location(rows):
    """Representative location: prefer a precise segment, then the longest extent."""
    geocoded = [r for r in rows if r["geocoded"] == "True"]
    if not geocoded:
        return None
    return sorted(
        geocoded,
        key=lambda r: (0 if r["geocode_level"] == "segment" else 1, -int(r["n_points"])),
    )[0]


def main():
    summaries = {r["contract"]: r for r in _rows(config.SUMMARIES_CSV)}
    items_by = defaultdict(list)
    for r in _rows(config.LINE_ITEMS_CSV):
        items_by[r["contract"]].append(r)
    locs_by = defaultdict(list)
    for r in _rows(config.LOCATIONS_CSV):
        locs_by[r["contract"]].append(r)

    DB_PATH.unlink(missing_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)

    for ea, item_rows in sorted(items_by.items()):
        summary = summaries.get(ea, {})

        # Line items + per-bidder totals + low-bid family spend.
        line_rows = []
        bidder_total = defaultdict(float)
        bidder_name = {}
        family_spend = defaultdict(float)
        families = set()
        for r in item_rows:
            qty = _num(r["quantity"])
            qty = 1.0 if qty is None else qty
            total = _num(r["total_item_bid_usd"]) or 0.0
            rank = int(r["bidder_rank"])
            family = classify_family(r["item_code"], r["item_description"])
            line_rows.append((
                ea, rank, r["bidder_name"], r["item_no"], r["item_flag"],
                r["item_code"], r["item_description"], family, r["unit"],
                qty, _num(r["unit_price_usd"]) or 0.0, total,
            ))
            bidder_total[rank] += total
            bidder_name[rank] = r["bidder_name"]
            if rank == 1:
                family_spend[family] += total
                families.add(family)

        ranked_fams = sorted(family_spend.items(), key=lambda kv: -kv[1])
        # Characterize a contract by its dominant *material* family. Overhead-style
        # work (mobilization, traffic control, SWPPP, Other) is on every job and
        # shouldn't win the label, so it's excluded from the primary pick.
        ranked_named = [(f, v) for f, v in ranked_fams if f not in NON_CHARACTERIZING]
        primary_family = (ranked_named or ranked_fams or [("Other", 0)])[0][0]
        type_of_work = ", ".join(f for f, _ in (ranked_named or ranked_fams)[:3]) or "Other"

        loc = _pick_location(locs_by.get(ea, []))
        lat = _num(loc["centroid_lat"]) if loc else None
        lng = _num(loc["centroid_lon"]) if loc else None
        county = loc["county"] if loc else ""
        route = int(loc["route"]) if loc and loc["route"].isdigit() else None
        pm_start = _num(loc["begin_pm"]) if loc else None
        pm_end = _num(loc["end_pm"]) if loc else None

        con.execute(
            "INSERT INTO contracts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (ea, int(summary.get("district") or ea[:2]),
             summary.get("bid_date") or (item_rows[0]["bid_date"] if item_rows else ""),
             county, route, pm_start, pm_end, lat, lng,
             FAMILY_CATEGORY.get(primary_family, "Other"), type_of_work, primary_family,
             len(bidder_total), len({r["item_no"] for r in item_rows}),
             bidder_name.get(1, ""), round(bidder_total.get(1, 0.0), 2),
             summary.get("pdf_url") or None),
        )
        con.executemany(
            "INSERT INTO bidders VALUES (?,?,?,?)",
            [(ea, rk, bidder_name[rk], round(bidder_total[rk], 2)) for rk in sorted(bidder_total)],
        )
        con.executemany(
            "INSERT INTO line_items "
            "(contract_ea,bidder_rank,bidder_name,item_no,item_flag,item_code,"
            "description,family,unit,quantity,unit_price,total_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            line_rows,
        )
        con.executemany(
            "INSERT INTO contract_families VALUES (?,?)",
            [(ea, f) for f in sorted(families)],
        )
        for r in locs_by.get(ea, []):
            if r["geocoded"] != "True":
                continue
            con.execute(
                "INSERT INTO locations "
                "(contract_ea,county,route,pm_prefix,begin_pm,end_pm,centroid_lon,"
                "centroid_lat,n_points,geocode_level) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (ea, r["county"], int(r["route"]) if r["route"].isdigit() else None,
                 r["pm_prefix"], _num(r["begin_pm"]), _num(r["end_pm"]),
                 _num(r["centroid_lon"]), _num(r["centroid_lat"]),
                 int(r["n_points"]), r["geocode_level"]),
            )

    con.commit()
    counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("contracts", "bidders", "line_items", "locations")}
    con.close()
    print(f"Built {DB_PATH}")
    print("  " + " | ".join(f"{t}: {n}" for t, n in counts.items()))


if __name__ == "__main__":
    main()
