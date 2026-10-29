"""Stage 1: fetch per-weekday bid summaries from the portal's page API."""

import re
from datetime import date, timedelta

from . import config


def find_data(node):
    """Find the widget data object that holds the bid summaries."""
    if isinstance(node, dict):
        if "projects" in node and "bidOpenDates" in node:
            return node
        node = list(node.values())
    if isinstance(node, list):
        for value in node:
            found = find_data(value)
            if found:
                return found
    return None


def to_number(amount):
    """'$4,387,696.00' -> 4387696.0 (None if blank)."""
    cleaned = re.sub(r"[^0-9.]", "", amount or "")
    return float(cleaned) if cleaned else None


def fetch_day(session, day: str) -> list[dict]:
    """Return one summary row per contract opened on `day` (ISO date string)."""
    request_uri = f"/cc?id=cc_bid_summary&archived=true&date={day}"
    response = session.get(
        config.PAGE_API,
        params={
            "id": "cc_bid_summary",
            "archived": "true",
            "date": day,
            "portal_id": config.PORTAL_ID,
            "request_uri": request_uri,
        },
        headers={"Accept": "application/json"},
        timeout=30,
    )
    response.raise_for_status()
    data = find_data(response.json())
    rows = []
    for bid_date in (data or {}).get("bidOpenDates", []):
        for item in data["projects"].get(bid_date, []):
            contract = item.get("project", "")
            rows.append({
                "contract": contract,
                "district": contract[:2],
                "bid_date": bid_date,
                "low_bidder": item.get("lowBidder", ""),
                "low_amount": to_number(item.get("lowAmount")),
                "second_bidder": item.get("secondBidder", ""),
                "second_amount": to_number(item.get("secondAmount")),
                "third_bidder": item.get("thirdBidder", ""),
                "third_amount": to_number(item.get("thirdAmount")),
                "pdf_url": config.FILE_BASE + item.get("sys_id", ""),
            })
    return rows


def weekdays(start: date, end: date):
    """Yield ISO date strings for every Mon–Fri between start and end inclusive."""
    day = start
    while day <= end:
        if day.weekday() < 5:
            yield day.isoformat()
        day += timedelta(days=1)
