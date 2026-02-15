"""
Auto-Outlook: AI-powered fundamental analysis

Fetches financial news from free RSS feeds, sends headlines to the Claude API,
and updates the fundamental_outlook table with AI-assessed macro scores.

Runs before the weekly analysis cron job every Saturday.
Cost: ~$0.01 per run.
"""

import asyncio
import json
import logging
import os
import sys

import feedparser

# Add parent to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_pool, close_pool
from app.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

# Free RSS feeds for financial news (no API key needed)
RSS_FEEDS = [
    "https://feeds.content.dowjones.io/public/rss/mw_topstories",           # MarketWatch
    "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",          # MarketWatch Pulse
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",                # CNBC Economy
    "https://www.cnbc.com/id/10001147/device/rss/rss.html",                 # CNBC Finance
    "https://www.rss.app/feeds/v1.1/tJXEqFjPmDPilKhd.xml",                 # Reuters Business
]

REGIONS = ["US", "EU", "UK", "JP", "AU", "HK", "commodities"]

PROMPT = """You are a macro-economic analyst. Based on the financial news headlines below, assess the current macro environment for each of these 7 regions: US, EU, UK, JP, AU, HK, commodities (gold/silver).

For each region, provide:
- cb_stance: -1 (hawkish/hiking rates), 0 (neutral/on hold), 1 (dovish/cutting rates)
- growth_outlook: -1 (contracting/recession), 0 (stable), 1 (expanding/strong growth)
- inflation_trend: -1 (falling), 0 (stable), 1 (rising)
- risk_sentiment: -1 (risk-off/fear), 0 (neutral), 1 (risk-on/greed)
- notes: 1-sentence summary of the outlook

If headlines don't clearly indicate a direction for a region, use 0 (neutral).
For commodities: assess what the environment means for gold/silver specifically.

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "US": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "EU": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "UK": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "JP": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "AU": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "HK": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."},
  "commodities": {"cb_stance": 0, "growth_outlook": 0, "inflation_trend": 0, "risk_sentiment": 0, "notes": "..."}
}

NEWS HEADLINES:
"""


def fetch_headlines() -> list[str]:
    """Fetch recent headlines from financial RSS feeds."""
    headlines = []
    for url in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:15]:  # Top 15 per feed
                title = entry.get("title", "").strip()
                if title:
                    headlines.append(title)
        except Exception:
            logger.warning("Failed to fetch RSS feed: %s", url)
    # Deduplicate and limit
    seen = set()
    unique = []
    for h in headlines:
        if h not in seen:
            seen.add(h)
            unique.append(h)
    return unique[:80]  # Max 80 headlines to keep token usage low


def call_claude(headlines: list[str]) -> dict:
    """Send headlines to Claude API and get macro assessment."""
    import anthropic

    from app.config import settings

    api_key = settings.anthropic_api_key
    if not api_key:
        logger.error("LE_ANTHROPIC_API_KEY not set — cannot run auto outlook")
        return {}

    client = anthropic.Anthropic(api_key=api_key)

    headline_text = "\n".join(f"- {h}" for h in headlines)
    user_message = PROMPT + headline_text

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        messages=[{"role": "user", "content": user_message}],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    import re
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def update_outlooks(assessments: dict) -> None:
    """Write AI assessments to the fundamental_outlook table."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        for region, data in assessments.items():
            if region not in REGIONS:
                continue
            await conn.execute(
                """
                UPDATE fundamental_outlook
                SET cb_stance = $2,
                    growth_outlook = $3,
                    inflation_trend = $4,
                    risk_sentiment = $5,
                    notes = $6,
                    updated_at = NOW()
                WHERE region = $1
                """,
                region,
                data.get("cb_stance", 0),
                data.get("growth_outlook", 0),
                data.get("inflation_trend", 0),
                data.get("risk_sentiment", 0),
                data.get("notes", ""),
            )
            logger.info(
                "Updated %s: cb=%d growth=%d infl=%d risk=%d — %s",
                region,
                data.get("cb_stance", 0),
                data.get("growth_outlook", 0),
                data.get("inflation_trend", 0),
                data.get("risk_sentiment", 0),
                data.get("notes", ""),
            )


async def main():
    logger.info("=== Auto Outlook Started ===")

    # Step 1: Fetch headlines
    headlines = fetch_headlines()
    if not headlines:
        logger.warning("No headlines fetched — skipping outlook update")
        return
    logger.info("Fetched %d headlines from RSS feeds", len(headlines))

    # Step 2: Ask Claude to assess
    try:
        assessments = call_claude(headlines)
    except Exception:
        logger.exception("Claude API call failed")
        return

    if not assessments:
        logger.warning("Empty assessment — skipping update")
        return

    logger.info("Got assessments for %d regions", len(assessments))

    # Step 3: Update database
    try:
        await update_outlooks(assessments)
    except Exception:
        logger.exception("Failed to update outlooks in database")
    finally:
        await close_pool()

    logger.info("=== Auto Outlook Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
