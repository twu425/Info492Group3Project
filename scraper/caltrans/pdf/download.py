"""Download bid-summary PDFs, caching them on disk so reruns don't re-fetch."""

from pathlib import Path

from .. import config


def pdf_path(contract: str) -> Path:
    """Local cache path for a contract's PDF."""
    return config.PDF_DIR / f"{contract}.pdf"


def fetch_pdf(session, url: str, contract: str) -> Path:
    """Download the PDF for `contract` to the cache, skipping if already present.

    Returns the local path. Raises requests exceptions on network failure, or
    ValueError if the response isn't actually a PDF.
    """
    dest = pdf_path(contract)
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    response = session.get(url, timeout=60)
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise ValueError(f"{contract}: response was not a PDF (content-type "
                         f"{response.headers.get('content-type')!r})")

    dest.write_bytes(response.content)
    return dest
