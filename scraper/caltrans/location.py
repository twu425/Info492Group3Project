"""Parse Caltrans project "Location" strings and geocode them via the postmile service.

A Location string looks like `04-Mrn-131-0.0/4.4`:

    district - county(s) - route(s) - postmile spec

Postmile specs vary: ranges (`0.0/4.4`), single postmiles (`2.0`), multiple
segments (`0.0/3.4,3.7/6.8`), prefixes (`R8.0`, `T0.5`, `M1.1`), or `Var`
(various — no specific postmiles). Counties and routes can be comma-lists.
See parse_location for the normalized structure and how messy cases are flagged.

Geocoding uses the Caltrans SHN postmile FeatureServer. For a (county, route,
begin, end) segment we range-query every postmile vertex in [begin, end] — more
robust than exact-match (postmiles are stored as noisy floats and not every
tenth exists) and it yields the whole extent, not just endpoints.
"""

import re

import requests

from . import config

# The 58 county codes the postmile service uses (all uppercase). Location-string
# abbreviations map onto these by uppercasing (e.g. "Mrn"->"MRN", "SBd"->"SBD").
COUNTY_CODES = {
    "ALA", "ALP", "AMA", "BUT", "CAL", "CC", "COL", "DN", "ED", "FRE", "GLE",
    "HUM", "IMP", "INY", "KER", "KIN", "LA", "LAK", "LAS", "MAD", "MEN", "MER",
    "MNO", "MOD", "MON", "MPA", "MRN", "NAP", "NEV", "ORA", "PLA", "PLU", "RIV",
    "SAC", "SB", "SBD", "SBT", "SCL", "SCR", "SD", "SF", "SHA", "SIE", "SIS",
    "SJ", "SLO", "SM", "SOL", "SON", "STA", "SUT", "TEH", "TRI", "TUL", "TUO",
    "VEN", "YOL", "YUB",
}

_PM_TOKEN = re.compile(r"^([A-Za-z]*)(\d+(?:\.\d+)?)$")


def _parse_pm(text: str):
    """'R8.0' -> {'prefix': 'R', 'value': 8.0}; returns None if unparseable."""
    m = _PM_TOKEN.match(text.strip())
    if not m:
        return None
    return {"prefix": m.group(1).upper(), "value": float(m.group(2))}


def parse_location(raw: str) -> dict:
    """Normalize a Location string into components.

    Returns a dict with: raw, district, counties[], routes[] (ints, or strings
    for non-numeric like "CR 29"), segments[] (list of (begin_pm, end_pm) where
    each pm is {'prefix','value'} or None), complex (bool), note (str).

    `complex=True` marks strings we won't auto-geocode confidently: missing
    pieces, "Var" postmiles, non-numeric routes, multi-county, or a route/segment
    count mismatch. These still get their parsed pieces for manual follow-up.
    """
    out = {"raw": (raw or "").strip(), "district": None, "counties": [],
           "routes": [], "segments": [], "complex": False, "note": ""}
    text = out["raw"]

    m = re.match(r"^(\d{2})-(?:\d{2}-)?(.*)$", text)  # strip district (+ doubled-district typo)
    if not m:
        out["complex"] = True
        out["note"] = "no district prefix"
        return out
    out["district"] = m.group(1)

    parts = m.group(2).split("-")
    counties_raw = parts[0] if len(parts) > 0 else ""
    routes_raw = parts[1] if len(parts) > 1 else ""
    pm_raw = parts[2] if len(parts) > 2 else ""
    if len(parts) > 3:  # unexpected extra dashes — keep everything after routes as pm
        pm_raw = "-".join(parts[2:])
        out["note"] = "extra dashes"

    out["counties"] = [c.strip().upper() for c in counties_raw.split(",") if c.strip()]

    for r in routes_raw.split(","):
        r = r.strip()
        if not r:
            continue
        out["routes"].append(int(r) if r.isdigit() else r)

    pm_raw = pm_raw.strip().rstrip(",").strip()
    if pm_raw and pm_raw.lower() != "var":
        for tok in pm_raw.split(","):
            tok = tok.strip()
            if not tok:
                continue
            if "/" in tok:
                a, b = tok.split("/", 1)
                out["segments"].append((_parse_pm(a), _parse_pm(b)))
            else:
                out["segments"].append((_parse_pm(tok), None))

    # Flag cases we won't auto-geocode confidently.
    if not out["counties"] or not out["routes"] or not out["segments"]:
        out["complex"] = True
        out["note"] = out["note"] or "missing county/route/postmile"
    elif any(not isinstance(r, int) for r in out["routes"]):
        out["complex"] = True
        out["note"] = "non-numeric route"
    elif len(out["counties"]) > 1:
        out["complex"] = True
        out["note"] = "multi-county"
    elif len(out["routes"]) > 1 and len(out["routes"]) != len(out["segments"]):
        out["complex"] = True
        out["note"] = "route/segment count mismatch"
    unknown = [c for c in out["counties"] if c not in COUNTY_CODES]
    if unknown:
        out["complex"] = True
        out["note"] = f"unknown county {unknown}"
    return out


def _query_extent(session, where: str):
    """Run a postmile query and summarize the returned vertices, or None if empty.

    Returns {begin_lon, begin_lat, end_lon, end_lat (by lowest/highest postmile),
    centroid_lon, centroid_lat (mean of all vertices), n_points}.
    """
    resp = session.get(
        config.POSTMILE_URL,
        params={"where": where, "outFields": "PM,AlignCode",
                "orderByFields": "PM", "outSR": "4326", "f": "json"},
        timeout=30,
    )
    resp.raise_for_status()
    feats = resp.json().get("features", [])
    pts = [(f["attributes"]["PM"], f["geometry"]["x"], f["geometry"]["y"])
           for f in feats if f.get("geometry")]
    if not pts:
        return None
    pts.sort(key=lambda p: p[0])
    return {
        "begin_lon": pts[0][1], "begin_lat": pts[0][2],
        "end_lon": pts[-1][1], "end_lat": pts[-1][2],
        "centroid_lon": sum(p[1] for p in pts) / len(pts),
        "centroid_lat": sum(p[2] for p in pts) / len(pts),
        "n_points": len(pts),
    }


def geocode_segment(session, county: str, route: int, begin: float, end: float):
    """Precise: range-query postmile vertices in [begin, end]. Extent summary or None."""
    lo, hi = sorted([begin, end])
    return _query_extent(session, f"County='{county}' AND Route={route} AND PM>={lo} AND PM<={hi}")


def geocode_route(session, county: str, route: int):
    """Coarse fallback: the whole route within the county (no postmile filter).

    Use when a project names a county + route but no specific postmiles (e.g.
    `Var`). Returns None if the (county, route) pair has no vertices — which also
    filters out invalid combinations from a multi-county/multi-route string.
    """
    return _query_extent(session, f"County='{county}' AND Route={route}")
