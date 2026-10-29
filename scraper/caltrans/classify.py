"""Classify a Caltrans bid item into one of the UI's item families.

Primary signal is the item code (leading digits track the Standard Specifications
section: 39xxxx = HMA, 51xxxx = structural concrete, ...). A few description
keyword rules catch the reorganized 01/03/04 code ranges. Unrecognized items ->
'Other' (dominated by mobilization / traffic control / overhead, which have no
material family). Kept in sync with the app's lib/bidgrid/classify.ts.
"""

import re

OTHER = "Other"


def _starts(*prefixes):
    return lambda code, desc: any(code.startswith(p) for p in prefixes)


# (predicate(code, desc) -> bool, family) evaluated in order, most specific first.
_CODE_RULES = [
    (lambda c, d: c.startswith("39") and "RUBBERIZED" in d, "Rubberized HMA"),
    (_starts("39"), "Hot Mix Asphalt"),
    (_starts("40", "41", "42"), "PCC Pavement"),
    (_starts("153"), "Cold Planing"),
    (_starts("25", "26", "28", "29"), "Aggregate Base"),
    (_starts("30", "37"), "Seal Coats & Surface Treatments"),
    (_starts("193", "198"), "Embankment"),
    (_starts("19"), "Roadway Excavation"),
    (_starts("16", "17"), "Clearing & Grubbing"),
    (_starts("73"), "Minor Concrete"),
    (_starts("51", "53"), "Structural Concrete"),
    (_starts("52"), "Reinforcing Steel"),
    (_starts("48", "49", "57"), "Piles & Shoring"),
    (_starts("55", "59", "75"), "Structural Steel"),
    (_starts("46", "47"), "Retaining Wall"),
    (_starts("58"), "Sound Wall"),
    (_starts("60"), "Bridge Deck & Rehab"),
    (_starts("839"), "Concrete Barrier"),
    (_starts("832", "833", "835"), "Metal Beam Guardrail"),
    (_starts("80"), "Fencing"),
    (_starts("65", "61"), "Reinforced Concrete Pipe"),
    (_starts("66", "69"), "Corrugated Steel Pipe"),
    (_starts("70"), "Drainage Inlets"),
    (_starts("84"), "Thermoplastic Striping"),
    (_starts("81"), "Pavement Markers"),
    (_starts("82", "56"), "Roadside Signs"),
    (lambda c, d: c.startswith("77")
        or ((c.startswith("86") or c.startswith("87")) and "LIGHTING" in d and "SIGNAL" not in d),
        "Lighting"),
    (_starts("86", "87"), "Traffic Signals"),
    (_starts("21", "72"), "Erosion Control"),
    (_starts("206", "208"), "Irrigation"),
    (_starts("20", "204"), "Planting"),
    (_starts("12"), "Traffic Control"),
    (_starts("13"), "Water Pollution Control"),
    (_starts("08", "09"), "Project Overhead"),
    (_starts("99"), "Mobilization"),
]

_KEYWORD_RULES = [
    (re.compile(r"RUBBERIZED"), "Rubberized HMA"),
    (re.compile(r"HOT MIX ASPHALT|\bHMA\b|ASPHALT CONCRETE"), "Hot Mix Asphalt"),
    (re.compile(r"COLD PLANE"), "Cold Planing"),
    (re.compile(r"MICRO-?SURFACING|SLURRY SEAL|SEAL COAT|HIGH FRICTION"), "Seal Coats & Surface Treatments"),
    (re.compile(r"SOLDIER PILE|SHORING|LAGGING|GROUND ANCHOR|SOIL NAIL"), "Piles & Shoring"),
    (re.compile(r"POLYESTER CONCRETE OVERLAY|BRIDGE DECK"), "Bridge Deck & Rehab"),
    (re.compile(r"STRUCTURAL STEEL"), "Structural Steel"),
    (re.compile(r"GUARDRAIL|GUARD RAIL|MIDWEST"), "Metal Beam Guardrail"),
    (re.compile(r"CONCRETE BARRIER"), "Concrete Barrier"),
    (re.compile(r"MINOR CONCRETE|CURB RAMP|SIDEWALK|CURB AND GUTTER"), "Minor Concrete"),
    (re.compile(r"STRUCTURAL CONCRETE"), "Structural Concrete"),
    (re.compile(r"THERMOPLASTIC|TRAFFIC STRIPE|PAVEMENT MARKING"), "Thermoplastic Striping"),
    (re.compile(r"REINFORCING STEEL|REINFORCEMENT"), "Reinforcing Steel"),
    (re.compile(r"\bFENCE\b|FENCING"), "Fencing"),
    (re.compile(r"MOBILIZATION"), "Mobilization"),
    (re.compile(r"TRAFFIC CONTROL|TEMPORARY BARRIER|CONSTRUCTION AREA"), "Traffic Control"),
    (re.compile(r"WATER POLLUTION|SWPPP|JOB SITE MANAGEMENT|STORM WATER|STORMWATER"), "Water Pollution Control"),
    (re.compile(r"EROSION|FIBER ROLL|HYDROSEED|HYDROMULCH|ROCK SLOPE"), "Erosion Control"),
]


def classify_family(item_code: str, description: str) -> str:
    code = (item_code or "").strip()
    desc = (description or "").upper()
    for test, family in _CODE_RULES:
        if test(code, desc):
            return family
    for pattern, family in _KEYWORD_RULES:
        if pattern.search(desc):
            return family
    return OTHER
