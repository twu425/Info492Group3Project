"""Stage 3 CLI: parse each contract's project Location and geocode it.

Reads contracts from data/bid_summaries.csv, pulls the Location string from the
cached bid-summary PDF (downloading it if stage 2 hasn't), parses it, and
geocodes it against the Caltrans postmile service. When specific postmiles are
given it geocodes each segment precisely; when they aren't (e.g. `Var`) it falls
back to the whole route-within-county. Writes one row per segment/route to
data/contract_locations.csv. Resumable via state/locations_done.txt.

Usage (run from the scraper/ directory):
    python -m cli.locate                 # all contracts not yet done
    python -m cli.locate --limit 10      # smoke test
    python -m cli.locate --delay 1
"""

import argparse
import csv
import sys
import time

import requests

from caltrans import config
from caltrans.io import CsvAppender, load_done, mark_done
from caltrans.location import COUNTY_CODES, geocode_route, geocode_segment, parse_location
from caltrans.pdf.download import fetch_pdf
from caltrans.pdf.header import extract_location
from caltrans.schema import LOCATION_COLUMNS

SINGLE_PM_WINDOW = 0.1  # +/- miles to search around a single-postmile project
_BLANK = {"begin_lon": "", "begin_lat": "", "end_lon": "", "end_lat": "",
          "centroid_lon": "", "centroid_lat": "", "n_points": 0}


def read_contracts() -> list[dict]:
    if not config.SUMMARIES_CSV.exists():
        sys.exit(f"No {config.SUMMARIES_CSV}. Run `python -m cli.pull_summaries` first.")
    with config.SUMMARIES_CSV.open(newline="") as f:
        return list(csv.DictReader(f))


def _segment_rows(session, common, counties, routes, segments):
    """Precise per-segment geocoding for a cleanly-parsed single-county location."""
    county = counties[0]
    out = []
    for i, (begin, end) in enumerate(segments):
        route = routes[i] if len(routes) == len(segments) else routes[0]
        begin_pm = begin["value"]
        end_pm = end["value"] if end else begin["value"]
        lo, hi = (begin_pm - SINGLE_PM_WINDOW, begin_pm + SINGLE_PM_WINDOW) if end is None \
            else (begin_pm, end_pm)
        geo = geocode_segment(session, county, route, lo, hi)
        row = {**common, "county": county, "route": route,
               "pm_prefix": begin["prefix"], "begin_pm": begin_pm, "end_pm": end_pm}
        if geo:
            row.update(geo, geocoded=True, geocode_level="segment", note="")
        else:
            row.update(_BLANK, geocoded=False, geocode_level="none",
                       note="no postmile points in range")
        out.append(row)
    return out


def _route_rows(session, common, counties, routes):
    """Coarse fallback: whole route-within-county for each valid (county, route) pair.

    Pairs with no vertices (invalid combos from a multi-county/route string) are
    dropped. Returns [] if nothing geocodes.
    """
    out = []
    for county in counties:
        if county not in COUNTY_CODES:
            continue
        for route in routes:
            if not isinstance(route, int):
                continue
            geo = geocode_route(session, county, route)
            if geo:
                out.append({**common, "county": county, "route": route,
                            "pm_prefix": "", "begin_pm": "", "end_pm": "",
                            **geo, "geocoded": True, "geocode_level": "route",
                            "note": "whole route in county (no specific postmiles)"})
    return out


def rows_for(session, contract, district, raw) -> list[dict]:
    """Build location rows for one contract.

    Precise per-segment geocoding when the Location parses cleanly; otherwise a
    coarse route-within-county fallback; otherwise a single ungeocodable row.
    """
    loc = parse_location(raw)
    common = {"contract": contract, "district": district, "location_raw": raw}

    if not loc["complex"]:
        return _segment_rows(session, common, loc["counties"], loc["routes"], loc["segments"])

    fallback = _route_rows(session, common, loc["counties"], loc["routes"])
    if fallback:
        return fallback

    return [{**common,
             "county": ",".join(loc["counties"]),
             "route": ",".join(str(r) for r in loc["routes"]),
             "pm_prefix": "", "begin_pm": "", "end_pm": "",
             **_BLANK, "geocoded": False, "geocode_level": "none", "note": loc["note"]}]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=0.5, help="seconds between contracts")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    config.ensure_dirs()
    done = load_done(config.LOCATIONS_DONE)
    contracts = read_contracts()
    session = requests.Session()
    session.headers["User-Agent"] = config.USER_AGENT
    failures = 0
    processed = 0

    with CsvAppender(config.LOCATIONS_CSV, LOCATION_COLUMNS) as writer:
        for row in contracts:
            contract = row["contract"]
            if contract in done:
                continue
            if args.limit is not None and processed >= args.limit:
                break
            try:
                path = fetch_pdf(session, row["pdf_url"], contract)
                raw = extract_location(path)
                loc_rows = rows_for(session, contract, row["district"], raw)
                writer.write(loc_rows)
                mark_done(config.LOCATIONS_DONE, contract)
                geocoded = sum(1 for r in loc_rows if r["geocoded"])
                print(f"{contract}: {raw!r} -> {len(loc_rows)} segment(s), {geocoded} geocoded")
                failures = 0
                processed += 1
            except (requests.RequestException, ValueError) as e:
                failures += 1
                print(f"{contract}: failed ({e}); will retry on next run")
                if failures >= 3:
                    sys.exit("Stopping after 3 failures in a row.")
            time.sleep(args.delay)

    print(f"Done. Locations are in {config.LOCATIONS_CSV}.")


if __name__ == "__main__":
    main()
