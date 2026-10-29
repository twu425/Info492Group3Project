"""HTTP session setup for the Caltrans portal."""

import re

import requests

from . import config


def start_session() -> requests.Session:
    """Load the portal page once to get session cookies and the page token."""
    session = requests.Session()
    session.headers.update({"User-Agent": config.USER_AGENT})
    page = session.get(config.PORTAL_PAGE, timeout=30)
    page.raise_for_status()
    match = re.search(r"g_ck\s*=\s*['\"]([^'\"]+)['\"]", page.text)
    if match:
        session.headers["X-UserToken"] = match.group(1)
    return session
