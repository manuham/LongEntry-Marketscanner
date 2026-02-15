"""
Phase 5 — Fundamental Scoring Engine

Computes a FundamentalScore (0–100) per symbol based on:
  - Per-region macro outlook (central bank stance, growth, inflation, risk)
  - Upcoming high-impact economic events
  - Different scoring logic for equities vs commodities

V1: Manual input via API. Later: auto-fetch from economic calendar APIs.
"""

import logging
from datetime import date, timedelta

from app.database import get_pool

logger = logging.getLogger(__name__)

# Symbol → region mapping
SYMBOL_REGION = {
    "XAUUSD": "commodities",
    "XAGUSD": "commodities",
    "US500": "US",
    "US100": "US",
    "US30": "US",
    "GER40": "EU",
    "EU50": "EU",
    "FRA40": "EU",
    "SPN35": "EU",
    "N25": "EU",
    "UK100": "UK",
    "JP225": "JP",
    "AUS200": "AU",
    "HK50": "HK",
}

COMMODITY_SYMBOLS = {"XAUUSD", "XAGUSD"}


async def fetch_region_outlook(region: str) -> dict | None:
    """Fetch the macro outlook for a given region."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT cb_stance, growth_outlook, inflation_trend, risk_sentiment, notes
            FROM fundamental_outlook
            WHERE region = $1
            """,
            region,
        )
    if not row:
        return None
    return dict(row)


async def count_upcoming_events(region: str, week_start: date) -> int:
    """Count high-impact economic events for a region in the given trading week."""
    week_end = week_start + timedelta(days=4)  # Mon-Fri
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM economic_events
            WHERE region = $1
              AND event_date BETWEEN $2 AND $3
              AND impact = 'high'
            """,
            region,
            week_start,
            week_end,
        )
    return count or 0


def compute_fundamental_score(
    outlook: dict,
    high_impact_events: int,
    is_commodity: bool,
) -> float:
    """
    Compute FundamentalScore (0–100) from macro outlook and event risk.

    Scoring logic (baseline 50):
      Equities: dovish=good, growth=good, risk_on=good, inflation=slight negative
      Commodities: dovish=good, inflation=good, risk_off=good, growth=slight negative
      Event risk: each high-impact event penalises score
    """
    score = 50.0

    cb = outlook.get("cb_stance", 0)
    growth = outlook.get("growth_outlook", 0)
    inflation = outlook.get("inflation_trend", 0)
    risk = outlook.get("risk_sentiment", 0)

    if not is_commodity:
        # Equities
        score += cb * 15          # dovish +15, hawkish -15
        score += growth * 15      # expanding +15, contracting -15
        score += risk * 10        # risk_on +10, risk_off -10
        score -= inflation * 5    # rising inflation -5
    else:
        # Commodities (gold/silver)
        score += cb * 15          # dovish +15 (weaker dollar, lower rates)
        score += inflation * 10   # rising inflation +10 (inflation hedge)
        score -= risk * 10        # risk_off +10 (safe haven demand)
        score -= growth * 5       # expanding economy -5 (less safe haven need)

    # Event risk penalty: up to 3 high-impact events, -5 each
    score -= min(high_impact_events, 3) * 5

    return max(0.0, min(100.0, round(score, 1)))


async def score_symbol(symbol: str, week_start: date) -> float:
    """
    Compute the FundamentalScore for a single symbol.
    Returns 50.0 (neutral) if region data is missing.
    """
    region = SYMBOL_REGION.get(symbol)
    if not region:
        logger.warning("No region mapping for %s, using neutral score", symbol)
        return 50.0

    outlook = await fetch_region_outlook(region)
    if not outlook:
        logger.warning("No outlook data for region %s, using neutral score", region)
        return 50.0

    events = await count_upcoming_events(region, week_start)
    is_commodity = symbol in COMMODITY_SYMBOLS

    score = compute_fundamental_score(outlook, events, is_commodity)
    logger.info(
        "Fundamental score for %s (region=%s): %.1f (events=%d)",
        symbol, region, score, events,
    )
    return score
