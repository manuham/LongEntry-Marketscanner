"""
News Filter — Economic calendar integration.

Fetches upcoming high-impact economic events and makes them available
for the Telegram /news command and AI prompt enrichment.

Uses free economic calendar APIs.
"""

import logging
import json
import time
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)

_events_cache = None
_events_cache_time = 0
CACHE_TTL = 3600  # 1 hour


async def get_upcoming_events(days: int = 7) -> list[dict]:
    """Get upcoming economic events for the next N days.

    Returns events from the database (populated by auto_outlook.py)
    or fetches from free API if available.
    """
    from app.database import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if we have the economic_events table
        table_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'economic_events'
            )
            """
        )

        if table_exists:
            today = date.today()
            end_date = today + timedelta(days=days)
            rows = await conn.fetch(
                """
                SELECT title, country, impact, event_date, event_time
                FROM economic_events
                WHERE event_date BETWEEN $1 AND $2
                ORDER BY event_date, event_time
                """,
                today,
                end_date,
            )
            return [dict(r) for r in rows]

    return []


async def get_events_for_symbol(symbol: str, days: int = 7) -> list[dict]:
    """Get events relevant to a specific market symbol."""
    # Map symbols to relevant countries/regions
    symbol_regions = {
        "XAUUSD": ["US", "Global"],
        "XAGUSD": ["US", "Global"],
        "US500": ["US"],
        "US100": ["US"],
        "US30": ["US"],
        "GER40": ["DE", "EU", "ECB"],
        "UK100": ["GB", "BOE"],
        "FRA40": ["FR", "EU", "ECB"],
        "EU50": ["EU", "ECB"],
        "SPN35": ["ES", "EU", "ECB"],
        "N25": ["NL", "EU", "ECB"],
        "JP225": ["JP", "BOJ"],
        "HK50": ["CN", "HK"],
        "AUS200": ["AU", "RBA"],
    }

    regions = symbol_regions.get(symbol, ["Global"])
    all_events = await get_upcoming_events(days)

    # Filter to relevant regions
    return [
        e for e in all_events
        if e.get("country") in regions or e.get("impact") == "high"
    ]


def format_events_for_prompt(events: list[dict], limit: int = 10) -> str:
    """Format events as text for AI prompt injection."""
    if not events:
        return ""

    lines = ["UPCOMING ECONOMIC EVENTS:"]
    for e in events[:limit]:
        impact_marker = "!!!" if e.get("impact") == "high" else "!" if e.get("impact") == "medium" else ""
        lines.append(
            f"- [{e.get('event_date')}] {e.get('title')} ({e.get('country')}) {impact_marker}"
        )

    return "\n".join(lines)
