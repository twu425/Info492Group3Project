"""Resumable CSV output + done-set tracking, shared by both pipeline stages.

Both stages follow the same pattern: append rows to a CSV, record a key in a
"done" file after each unit of work, and skip keys already done on the next run.
This factors that pattern out of the CLI scripts so it stays consistent.
"""

import csv
from pathlib import Path


def load_done(path: Path) -> set[str]:
    """Return the set of keys already processed (empty if the file is new)."""
    if path.exists():
        return set(path.read_text().split())
    return set()


def mark_done(path: Path, key: str):
    """Append a key to the done file and flush immediately."""
    with path.open("a") as f:
        f.write(key + "\n")
        f.flush()


class CsvAppender:
    """Append-only DictWriter that writes the header once for a new file.

    Usage:
        with CsvAppender(path, COLUMNS) as writer:
            writer.write(rows)        # rows: list[dict]
    """

    def __init__(self, path: Path, columns: list[str]):
        self.path = path
        self.columns = columns
        self._is_new = not path.exists()
        self._fh = None
        self._writer = None

    def __enter__(self):
        self._fh = self.path.open("a", newline="")
        self._writer = csv.DictWriter(self._fh, fieldnames=self.columns)
        if self._is_new:
            self._writer.writeheader()
        return self

    def write(self, rows: list[dict]):
        self._writer.writerows(rows)
        self._fh.flush()

    def __exit__(self, *exc):
        if self._fh:
            self._fh.close()
