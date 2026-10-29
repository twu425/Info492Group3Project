"""Stage 1 CLI: pull archived Caltrans bid summaries one weekday at a time.

Usage (run from the scraper/ directory):
    python -m cli.pull_summaries 2026-04-27 2026-05-01          # test one week first
    python -m cli.pull_summaries 2025-01-01 2025-12-31 --delay 5

Progress is saved after every day (state/summaries_done.txt), so you can stop
with Ctrl+C and rerun the same command to resume. Rows go to
data/bid_summaries.csv.
"""

import argparse
import sys
import time
from datetime import date

import requests

from caltrans import config
from caltrans.io import CsvAppender, load_done, mark_done
from caltrans.schema import SUMMARY_COLUMNS
from caltrans.session import start_session
from caltrans.summaries import fetch_day, weekdays


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("start", type=date.fromisoformat)
    parser.add_argument("end", type=date.fromisoformat)
    parser.add_argument("--delay", type=float, default=4.0, help="seconds between requests")
    args = parser.parse_args()

    config.ensure_dirs()
    done = load_done(config.SUMMARIES_DONE)
    session = start_session()
    failures = 0

    with CsvAppender(config.SUMMARIES_CSV, SUMMARY_COLUMNS) as writer:
        for day in weekdays(args.start, args.end):
            if day in done:
                continue
            try:
                rows = fetch_day(session, day)
                writer.write(rows)
                mark_done(config.SUMMARIES_DONE, day)
                print(f"{day}: {len(rows)} contracts")
                failures = 0
            except (requests.RequestException, ValueError) as e:
                failures += 1
                print(f"{day}: failed ({e}); will retry on next run")
                if failures >= 3:
                    sys.exit("Stopping after 3 failures in a row. Check the site or your request.")
            time.sleep(args.delay)

    print(f"Done. Data is in {config.SUMMARIES_CSV}.")


if __name__ == "__main__":
    main()
