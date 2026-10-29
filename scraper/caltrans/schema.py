"""Column definitions for the two CSV outputs.

Keeping the field lists here (rather than inline in the CLIs) means the writer,
the parser, and anyone reading the data all agree on one source of truth.
"""

# Stage 1 — one row per contract (top-3 bidders), produced by caltrans.summaries.
SUMMARY_COLUMNS = [
    "contract", "district", "bid_date",
    "low_bidder", "low_amount",
    "second_bidder", "second_amount",
    "third_bidder", "third_amount",
    "pdf_url",
]

# Stage 2 — one row per (line item, bidder), produced by caltrans.pdf.parse.
# The PDFs itemize every bidder: the low bidder from the "Contract Proposal"
# section (rank 1) and the rest from the "Summary of Remaining Bidders" table
# (ranks 2..N), joined on item number. bidder_rank is the bid-total rank.
LINE_ITEM_COLUMNS = [
    "contract", "district", "bid_date",
    "bidder_rank", "bidder_name",
    "item_no", "item_flag", "item_code", "item_description",
    "unit", "quantity", "is_lump_sum",
    "unit_price_usd", "total_item_bid_usd",
    "source_pdf_url",
]

# Stage 3 — one row per project location segment, produced by cli.locate.
# A contract can span several segments (routes/postmile ranges); each geocoded
# segment carries its extent endpoints + centroid from the Caltrans postmile
# service. `geocode_level` records precision:
#   "segment" — exact postmile range   "route" — whole route-in-county fallback
#   "none"    — ungeocodable (kept with parsed county/route for reference)
LOCATION_COLUMNS = [
    "contract", "district", "location_raw",
    "county", "route", "pm_prefix", "begin_pm", "end_pm",
    "begin_lon", "begin_lat", "end_lon", "end_lat",
    "centroid_lon", "centroid_lat",
    "n_points", "geocoded", "geocode_level", "note",
]
