"""Extract contract-level header fields from a bid-summary PDF's first page."""

import re

import pdfplumber

# "Location: 04-Mrn-131-0.0/4.4 Number of Items: 123" — capture up to the next
# column label or a multi-space gap.
_LOCATION_RE = re.compile(r"Location:\s*(.+?)(?:\s{2,}|\s+Number of Items|$)")


def extract_location(path) -> str:
    """Return the raw Location string (e.g. '04-Mrn-131-0.0/4.4'), or ''."""
    with pdfplumber.open(path) as pdf:
        head = pdf.pages[0].extract_text() or ""
    m = _LOCATION_RE.search(head)
    return m.group(1).strip() if m else ""
