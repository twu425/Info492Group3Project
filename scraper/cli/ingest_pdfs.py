"""Stage 2 CLI: download each contract's bid-summary PDF and parse the low
bidder's line items into data/line_items.csv.

Reads the contracts from data/bid_summaries.csv (stage 1 output), so run
pull_summaries first. Resumable via state/pdfs_done.txt.

Usage (run from the scraper/ directory):
    python -m cli.ingest_pdfs                     # process everything not yet done
    python -m cli.ingest_pdfs --limit 5           # smoke-test on the first 5
    python -m cli.ingest_pdfs --delay 2
"""

import argparse
import csv
import sys
import time

import requests

from caltrans import config
from caltrans.io import CsvAppender, load_done, mark_done
from caltrans.pdf.download import fetch_pdf
from caltrans.pdf.parse import parse_pdf
from caltrans.schema import LINE_ITEM_COLUMNS
from caltrans.session import start_session


def read_contracts() -> list[dict]:
    """Load (contract, district, bid_date, pdf_url) from the summaries CSV."""
    if not config.SUMMARIES_CSV.exists():
        sys.exit(f"No {config.SUMMARIES_CSV}. Run `python -m cli.pull_summaries` first.")
    with config.SUMMARIES_CSV.open(newline="") as f:
        return list(csv.DictReader(f))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=3.0, help="seconds between PDF fetches")
    parser.add_argument("--limit", type=int, default=None, help="process at most N new contracts")
    args = parser.parse_args()

    config.ensure_dirs()
    done = load_done(config.PDFS_DONE)
    contracts = read_contracts()
    session = start_session()
    failures = 0
    processed = 0

    with CsvAppender(config.LINE_ITEMS_CSV, LINE_ITEM_COLUMNS) as writer:
        for row in contracts:
            contract = row["contract"]
            if contract in done:
                continue
            if args.limit is not None and processed >= args.limit:
                break
            try:
                path = fetch_pdf(session, row["pdf_url"], contract)
                items, unparsed = parse_pdf(
                    path, contract, row["district"], row["bid_date"], row["pdf_url"]
                )
                writer.write(items)
                mark_done(config.PDFS_DONE, contract)
                note = f" ({len(unparsed)} unparsed lines)" if unparsed else ""
                print(f"{contract}: {len(items)} line items{note}")
                failures = 0
                processed += 1
            except (requests.RequestException, ValueError) as e:
                failures += 1
                print(f"{contract}: failed ({e}); will retry on next run")
                if failures >= 3:
                    sys.exit("Stopping after 3 failures in a row. Check the site or a PDF.")
            time.sleep(args.delay)

    print(f"Done. Line items are in {config.LINE_ITEMS_CSV}.")


if __name__ == "__main__":
    main()
