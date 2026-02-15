"""
Auto-Outlook: AI-powered per-market fundamental analysis

Uses Claude with web search to research each of the 14 markets, then predicts
bullish/neutral/bearish with a 0-100 score. This replaces the generic RSS-based
regional approach — Claude actually searches the web for current data, just like
you would ask it in a chat.

Runs before the weekly analysis cron job every Saturday.
Cost: ~$0.05-0.10 per run (web search + tokens).
"""

import asyncio
import json
import logging
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import get_pool, close_pool
from app.logging_config import setup_logging
from app.telegram import send_message

setup_logging()
logger = logging.getLogger(__name__)

# All 14 markets the system trades
MARKETS = {
    "XAUUSD": "Gold",
    "XAGUSD": "Silver",
    "US500":  "S&P 500",
    "US100":  "Nasdaq 100",
    "US30":   "Dow Jones 30",
    "GER40":  "DAX 40 (Germany)",
    "AUS200": "ASX 200 (Australia)",
    "UK100":  "FTSE 100 (UK)",
    "JP225":  "Nikkei 225 (Japan)",
    "SPN35":  "IBEX 35 (Spain)",
    "EU50":   "Euro Stoxx 50",
    "FRA40":  "CAC 40 (France)",
    "HK50":   "Hang Seng 50 (Hong Kong)",
    "N25":    "AEX 25 (Netherlands)",
}

PROMPT = """You are a professional macro-economic analyst helping a trader decide which stock indices and commodities are likely to move up next week.

Use the web_search tool to research the CURRENT macro environment. Search for:
1. Central bank rate decisions and forward guidance (Fed, ECB, BoE, BoJ, RBA, HKMA)
2. Recent economic data releases (GDP, employment, CPI/inflation, PMI)
3. Current market sentiment and risk appetite
4. Any geopolitical events affecting markets
5. Gold/silver specific drivers (dollar strength, real yields, safe haven demand)

After your research, assess each of the following 14 markets for the COMING WEEK.
For each, give:
- "prediction": "bullish", "neutral", or "bearish"
- "score": a number 0-100 where 0=extremely bearish, 50=neutral, 100=extremely bullish
- "reasoning": 1-2 sentence explanation

Markets to assess:
- XAUUSD (Gold)
- XAGUSD (Silver)
- US500 (S&P 500)
- US100 (Nasdaq 100)
- US30 (Dow Jones 30)
- GER40 (DAX 40, Germany)
- AUS200 (ASX 200, Australia)
- UK100 (FTSE 100, UK)
- JP225 (Nikkei 225, Japan)
- SPN35 (IBEX 35, Spain)
- EU50 (Euro Stoxx 50)
- FRA40 (CAC 40, France)
- HK50 (Hang Seng 50, Hong Kong)
- N25 (AEX 25, Netherlands)

Respond with ONLY valid JSON (no markdown fences, no explanation outside the JSON):
{
  "XAUUSD": {"prediction": "bullish", "score": 65, "reasoning": "..."},
  "XAGUSD": {"prediction": "neutral", "score": 50, "reasoning": "..."},
  ...all 14 markets...
}
"""


def extract_json(text: str) -> dict:
    """Find and parse the JSON object from Claude's response text."""
    # Strip markdown code fences if present
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```", "", text)

    # Find the outermost JSON object { ... }
    start = text.find("{")
    if start == -1:
        return {}

    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1], strict=False)
    return {}


def call_claude() -> dict:
    """Ask Claude to research all markets using web search and return predictions."""
    import anthropic

    api_key = settings.anthropic_api_key
    if not api_key:
        logger.error("LE_ANTHROPIC_API_KEY not set — cannot run auto outlook")
        return {}

    client = anthropic.Anthropic(api_key=api_key)

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        tools=[
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 10,
            }
        ],
        messages=[{"role": "user", "content": PROMPT}],
    )

    # Log block types for debugging
    block_types = [block.type for block in response.content]
    logger.info("Response block types: %s", block_types)

    # Collect ALL text from text blocks (response has interleaved search + text blocks)
    text_parts = []
    for block in response.content:
        if block.type == "text" and block.text.strip():
            text_parts.append(block.text.strip())

    if not text_parts:
        logger.error("No text blocks in Claude response")
        return {}

    # The JSON is usually in the last text block
    # Try last block first, then fall back to searching all blocks
    for text in reversed(text_parts):
        result = extract_json(text)
        if result:
            return result

    # Last resort: concatenate all text and search
    combined = "\n".join(text_parts)
    result = extract_json(combined)
    if result:
        return result

    logger.error("Could not find JSON in response. Text blocks: %s", text_parts[:2])
    return {}


async def store_predictions(predictions: dict) -> None:
    """Write per-market AI predictions to the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        for symbol, data in predictions.items():
            if symbol not in MARKETS:
                continue
            pred = data.get("prediction", "neutral")
            score = float(data.get("score", 50))
            reasoning = data.get("reasoning", "")

            # Clamp score to 0-100
            score = max(0.0, min(100.0, score))

            await conn.execute(
                """
                INSERT INTO market_ai_prediction (symbol, prediction, score, reasoning, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (symbol)
                DO UPDATE SET
                    prediction = EXCLUDED.prediction,
                    score = EXCLUDED.score,
                    reasoning = EXCLUDED.reasoning,
                    updated_at = NOW()
                """,
                symbol,
                pred,
                score,
                reasoning,
            )
            logger.info(
                "  %s %-7s: %s (score=%.0f) — %s",
                symbol,
                f"({MARKETS[symbol]})",
                pred.upper(),
                score,
                reasoning[:80],
            )


async def main():
    logger.info("=== Auto Outlook Started (AI Web Search) ===")

    # Ask Claude to research and predict
    try:
        predictions = call_claude()
    except Exception:
        logger.exception("Claude API call failed")
        return

    if not predictions:
        logger.warning("Empty predictions — skipping update")
        return

    logger.info("Got predictions for %d markets:", len(predictions))

    # Store to database
    try:
        await store_predictions(predictions)
    except Exception:
        logger.exception("Failed to store predictions in database")
    finally:
        await close_pool()

    # Send Telegram summary
    bullish = [s for s, d in predictions.items() if s in MARKETS and d.get("prediction") == "bullish"]
    bearish = [s for s, d in predictions.items() if s in MARKETS and d.get("prediction") == "bearish"]
    lines = ["<b>AI Outlook Updated</b>"]
    if bullish:
        lines.append(f"Bullish: {', '.join(bullish)}")
    if bearish:
        lines.append(f"Bearish: {', '.join(bearish)}")
    lines.append(f"\n{len(predictions)} markets analyzed via web search.")
    send_message("\n".join(lines))

    logger.info("=== Auto Outlook Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
