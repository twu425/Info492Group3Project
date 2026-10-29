"""Shared configuration: endpoints, identity, and on-disk paths.

Paths are absolute (derived from this file's location) so the pipeline writes
to the same place no matter what directory you launch it from.
"""

from pathlib import Path

# --- Caltrans portal endpoints ---
BASE = "https://ppmoe.dot.ca.gov"
PORTAL_ID = "2086b814c3221200f3897bfaa2d3aea8"
FILE_BASE = f"{BASE}/api/x_cado2_contractor/public_attachment_downloader_api/"
PAGE_API = f"{BASE}/api/now/sp/page"
PORTAL_PAGE = f"{BASE}/cc?id=cc_bid_summary"

# Caltrans State Highway Network postmile geocoding service.
POSTMILE_URL = ("https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/"
                "SHN_Postmiles_Tenth/FeatureServer/0/query")

# Identify yourself so the site owner can reach you. Put your real email here.
USER_AGENT = "BidGrid research script (contact: kawahara@gmail.com)"

# --- Paths (scraper/ is the package root's parent) ---
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STATE_DIR = ROOT / "state"
PDF_DIR = DATA_DIR / "pdfs"

SUMMARIES_CSV = DATA_DIR / "bid_summaries.csv"
LINE_ITEMS_CSV = DATA_DIR / "line_items.csv"
LOCATIONS_CSV = DATA_DIR / "contract_locations.csv"

SUMMARIES_DONE = STATE_DIR / "summaries_done.txt"
PDFS_DONE = STATE_DIR / "pdfs_done.txt"
LOCATIONS_DONE = STATE_DIR / "locations_done.txt"


def ensure_dirs():
    """Create the data/state directories if they don't exist yet."""
    for d in (DATA_DIR, STATE_DIR, PDF_DIR):
        d.mkdir(parents=True, exist_ok=True)
