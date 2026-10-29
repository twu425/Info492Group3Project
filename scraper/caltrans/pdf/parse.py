"""Stage 2: parse a bid-summary PDF into per-bidder line-item rows.

A bid-summary PDF has these sections (in order):

  1. Bid-rank header  — one "Cost:" line per bidder, giving rank → bidder name.
  2. Contract Proposal of Low Bidder — the rank-1 bidder's full itemized bid:
        Item  Item   Description                   Unit  Est.Qty   UnitPrice  BidAmount
        0001  070030 LEAD COMPLIANCE PLAN          LS    LUMP SUM  3,000.00   3,000.00
        0002  090100 TIME-RELATED OVERHEAD (WDAY)  WDAY  220.0     1,000.00   220,000.00
     This section carries the item metadata (code, description, unit, quantity).
     Fixed columns, so a regex (LOW_ROW_RE) reads it reliably.
  3. Summary of Remaining Bidders — a wide table keyed by item number, with a
     (unit price, bid amount) pair per remaining bidder. A header names the ranks:
        Second Third Fourth Fifth
        Item   Bid Amount   Bid Amount   ...
        0001   1,500.00 1,500.00   2,700.00 2,700.00   ...
     The table paginates to a handful of bidder columns per page, so contracts
     with many bidders span several pages (…Second–Fifth, then Sixth–Seventh…).
     We parse this by COLUMN GEOMETRY rather than token order: each number is
     assigned to a bidder by its x-coordinate, using the ordinal header's word
     positions as column boundaries. That way a bidder who didn't bid an item
     leaves one empty cell instead of shifting (and corrupting) the whole row.
  4. List of subcontractors — ignored.

We emit one row per (item, bidder). Item metadata comes from section 2; the
remaining bidders' prices come from section 3, joined on item number; bidder
names come from section 1.

NOTE: v1 parser, validated against 2026 district-04/07 PDFs (per-contract item
counts match the PDF's stated "Number of Items"). `parse_pdf` returns anything
it couldn't parse cleanly as `unparsed` so layout variants surface loudly.
"""

import bisect
import re

import pdfplumber

LOW_MARKER = "Contract Proposal of"
REMAINING_MARKER = "Summary of Remaining Bidders"

ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    # Caltrans PDFs spell the 8th ordinal "Eight" (not "Eighth") in these headers.
    "seventh": 7, "eighth": 8, "eight": 8, "ninth": 9, "tenth": 10, "eleventh": 11,
    "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
    "twentieth": 20,
}

# Bid-rank header line → rank + bidder name. Two layouts occur:
#   standard:  "1 Cost: $9,633,563.89 VC0000019955 O.C. JONES & SONS, INC. CSLB# ..."
#   simple:    "1 $1,306,876.75 VC1400003400 AMERICAN PAVEMENT SYSTEMS, INC. CSLB# ..."
# (the "Cost:" prefix is optional; wrapped address lines start with a number but
# have no "$" next, so they don't match.)
RANK_RE = re.compile(
    r"^(?P<rank>\d+)\s+(?:Cost:\s+)?\$[\d,]+\.\d{2}\s+(?P<bidder_id>\S+)\s+(?P<rest>.+)$"
)

# Low-bidder item row. Optional 1-2 letter flag ("F" = federal-aid item) can sit
# between the item number and the 6-digit code. Greedy description leaves the last
# short alpha token as the unit; quantity is a number or the literal "LUMP SUM".
LOW_ROW_RE = re.compile(
    r"^(?P<item_no>\d{4})\s+"
    r"(?:(?P<flag>[A-Z]{1,2})\s+)?"
    r"(?P<item_code>[0-9]{6})\s+"
    r"(?P<desc>.+)\s+"
    r"(?P<unit>[A-Z]{1,6})\s+"
    r"(?P<qty>LUMP SUM|[\d,]+(?:\.\d+)?)\s+"
    r"(?P<unit_price>[\d,]+\.\d{2})\s+"
    r"(?P<amount>[\d,]+\.\d{2})$"
)

ITEM_NO_RE = re.compile(r"^\d{4}$")
MONEY_RE = re.compile(r"^[\d,]+\.\d{2}$")


def _num(text: str) -> float:
    return float(text.replace(",", ""))


def _center(word) -> float:
    return (word["x0"] + word["x1"]) / 2


def _cluster_rows(words, tol: float = 3.0):
    """Group words into visual rows by their vertical position (`top`)."""
    rows: list[tuple[float, list]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if rows and abs(w["top"] - rows[-1][0]) <= tol:
            rows[-1][1].append(w)
        else:
            rows.append((w["top"], [w]))
    return [sorted(ws, key=lambda w: w["x0"]) for _, ws in rows]


def _parse_remaining_page(page):
    """Extract {item_no: {rank: (unit_price, amount)}} from one remaining page.

    Columns are located by the ordinal header's x-positions, so each number is
    bound to a bidder by geometry. Returns (data, notes); notes flag cells that
    didn't resolve to a clean (price, amount) pair.
    """
    data: dict[str, dict[int, tuple[float, float]]] = {}
    notes: list[str] = []
    ranks: list[int] = []
    boundaries: list[float] = []  # midpoints between adjacent bidder columns

    for row in _cluster_rows(page.extract_words()):
        texts = [w["text"] for w in row]

        # Ordinal header ("Second Third Fourth Fifth") → ranks + column boundaries.
        if texts and all(t.lower() in ORDINALS for t in texts):
            ranks = [ORDINALS[t.lower()] for t in texts]
            centers = [_center(w) for w in row]
            boundaries = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]
            continue

        if not ranks or not ITEM_NO_RE.match(texts[0]):
            continue

        item_no = texts[0]
        # Bucket each money word into its bidder column by x-center.
        blocks: list[list] = [[] for _ in ranks]
        for w in row[1:]:
            if not MONEY_RE.match(w["text"]):
                continue
            blocks[bisect.bisect_right(boundaries, _center(w))].append(w)

        rankmap: dict[int, tuple[float, float]] = {}
        for k, rank in enumerate(ranks):
            nums = sorted(blocks[k], key=lambda w: w["x0"])
            if len(nums) == 2:
                rankmap[rank] = (_num(nums[0]["text"]), _num(nums[1]["text"]))
            elif len(nums) == 0:
                pass  # bidder did not bid this item — leave the cell absent
            else:
                notes.append(f"item {item_no} rank {rank}: {len(nums)} values (expected 2)")
        data.setdefault(item_no, {}).update(rankmap)

    return data, notes


def parse_pdf(path, contract: str, district: str, bid_date: str,
              source_pdf_url: str) -> tuple[list[dict], list[str]]:
    """Extract per-bidder line items from a bid-summary PDF.

    Returns (rows, unparsed). `rows` are dicts keyed by LINE_ITEM_COLUMNS, one per
    (item, bidder). `unparsed` collects low-bidder lines the regex missed and any
    geometry notes from the remaining-bidders table.
    """
    rank_names: dict[int, str] = {}
    low_items: dict[str, dict] = {}                       # item_no -> metadata + rank-1 prices
    remaining: dict[str, dict[int, tuple[float, float]]] = {}  # item_no -> {rank: (price, amount)}
    unparsed: list[str] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""

            # Bidder names can appear on any early page; scanning all is harmless.
            for line in text.splitlines():
                m = RANK_RE.match(line.strip())
                if m:
                    rank_names[int(m.group("rank"))] = m.group("rest").split("CSLB#")[0].strip()

            if REMAINING_MARKER in text:
                page_data, notes = _parse_remaining_page(page)
                for item_no, rankmap in page_data.items():
                    remaining.setdefault(item_no, {}).update(rankmap)
                unparsed.extend(notes)
            elif LOW_MARKER in text:
                for line in text.splitlines():
                    stripped = line.strip()
                    m = LOW_ROW_RE.match(stripped)
                    if m:
                        is_lump = m.group("qty") == "LUMP SUM"
                        low_items[m.group("item_no")] = {
                            "item_flag": m.group("flag") or "",
                            "item_code": m.group("item_code"),
                            "item_description": m.group("desc").strip(),
                            "unit": m.group("unit"),
                            "quantity": None if is_lump else _num(m.group("qty")),
                            "is_lump_sum": is_lump,
                            "unit_price_usd": _num(m.group("unit_price")),
                            "total_item_bid_usd": _num(m.group("amount")),
                        }
                    elif ITEM_NO_RE.match(stripped.split(" ")[0]):
                        unparsed.append(stripped)

    rows: list[dict] = []

    def base(item_no: str) -> dict:
        meta = low_items[item_no]
        return {
            "contract": contract, "district": district, "bid_date": bid_date,
            "item_no": item_no, "item_flag": meta["item_flag"],
            "item_code": meta["item_code"], "item_description": meta["item_description"],
            "unit": meta["unit"], "quantity": meta["quantity"],
            "is_lump_sum": meta["is_lump_sum"], "source_pdf_url": source_pdf_url,
        }

    # Rank-1 rows from the low-bidder section.
    for item_no, meta in low_items.items():
        row = base(item_no)
        row.update(bidder_rank=1, bidder_name=rank_names.get(1, ""),
                   unit_price_usd=meta["unit_price_usd"],
                   total_item_bid_usd=meta["total_item_bid_usd"])
        rows.append(row)

    # Rank 2..N rows from the remaining-bidders table, joined on item number.
    for item_no, rankmap in remaining.items():
        if item_no not in low_items:
            unparsed.append(f"remaining item {item_no} has no low-bidder metadata")
            continue
        for rank, (price, amount) in rankmap.items():
            row = base(item_no)
            row.update(bidder_rank=rank, bidder_name=rank_names.get(rank, ""),
                       unit_price_usd=price, total_item_bid_usd=amount)
            rows.append(row)

    rows.sort(key=lambda r: (r["item_no"], r["bidder_rank"]))
    return rows, unparsed
