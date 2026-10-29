"""Join the three stage outputs into one contracts.json for the Next.js app.

Reads data/{bid_summaries,line_items,contract_locations}.csv and emits a single
JSON array — one object per contract — at ../lib/bidgrid/contracts.generated.json.
The app's data layer imports that file and maps it into its Contract type (item
families are classified app-side so the ItemFamily taxonomy stays in one place).

Usage (from the scraper/ directory):
    python -m cli.export_app
"""

import csv
import json
from collections import defaultdict

from caltrans import config

APP_JSON = config.ROOT.parent / "lib" / "bidgrid" / "contracts.generated.json"


def _rows(path):
    if not path.exists():
        raise SystemExit(f"missing {path} — run the earlier stages first")
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def _num(s):
    return float(s) if s not in (None, "") else None


def main():
    summaries = {r["contract"]: r for r in _rows(config.SUMMARIES_CSV)}
    items_by_contract = defaultdict(list)
    for r in _rows(config.LINE_ITEMS_CSV):
        items_by_contract[r["contract"]].append(r)
    locs_by_contract = defaultdict(list)
    for r in _rows(config.LOCATIONS_CSV):
        locs_by_contract[r["contract"]].append(r)

    contracts = []
    for contract, item_rows in sorted(items_by_contract.items()):
        summary = summaries.get(contract, {})

        # Line items: one row per (item, bidder). Lump-sum quantity -> 1.
        line_items = []
        bidder_totals = defaultdict(float)
        bidder_name = {}
        for r in item_rows:
            qty = _num(r["quantity"])
            qty = 1.0 if qty is None else qty
            total = _num(r["total_item_bid_usd"]) or 0.0
            rank = int(r["bidder_rank"])
            line_items.append({
                "itemCode": r["item_code"],
                "itemFlag": r["item_flag"],
                "description": r["item_description"],
                "quantity": qty,
                "unit": r["unit"],
                "unitPrice": _num(r["unit_price_usd"]) or 0.0,
                "totalPrice": total,
                "bidder": r["bidder_name"],
                "bidderRank": rank,
            })
            bidder_totals[rank] += total
            bidder_name[rank] = r["bidder_name"]

        bidders = [{"name": bidder_name[rk], "rank": rk, "total": round(bidder_totals[rk], 2)}
                   for rk in sorted(bidder_totals)]

        # Geocoded location segments (drop ungeocodable rows; keep for primary pick).
        locations = []
        for r in locs_by_contract.get(contract, []):
            if r["geocoded"] != "True":
                continue
            locations.append({
                "county": r["county"], "route": int(r["route"]) if r["route"].isdigit() else r["route"],
                "pmPrefix": r["pm_prefix"],
                "beginPm": _num(r["begin_pm"]), "endPm": _num(r["end_pm"]),
                "centroidLon": _num(r["centroid_lon"]), "centroidLat": _num(r["centroid_lat"]),
                "nPoints": int(r["n_points"]), "geocodeLevel": r["geocode_level"],
            })

        contracts.append({
            "ea": contract,
            "district": int(summary.get("district") or contract[:2]),
            "bidOpenDate": summary.get("bid_date") or (item_rows[0]["bid_date"] if item_rows else ""),
            "bidders": bidders,
            "lineItems": line_items,
            "locations": locations,
        })

    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps(contracts, separators=(",", ":")))
    n_items = sum(len(c["lineItems"]) for c in contracts)
    n_geo = sum(1 for c in contracts if c["locations"])
    print(f"Wrote {len(contracts)} contracts, {n_items} line-item rows, "
          f"{n_geo} with a location -> {APP_JSON}")


if __name__ == "__main__":
    main()
