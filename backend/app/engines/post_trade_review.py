"""
Post-Trade Review Engine

When a trade closes, Haiku reviews the trade outcome vs the AI confidence
at entry time, generating one actionable insight per trade. These insights
feed back into the AI analyzer's system prompt, creating a learning loop.

Cost: ~$0.01 per review, ~20 trades/month = $0.20/month
"""

import logging
import json
from datetime import date, timedelta

from app.config import settings
from app.database import get_pool

logger = logging.getLogger(__name__)


async def review_closed_trade(trade_id: int):
    """Review a closed trade and store the insight.

    Called asynchronously when TradeSender reports a closed trade.
    Non-blocking — errors are logged but don't affect trade recording.
    """
    if not settings.post_trade_review_enabled:
        return

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Fetch trade details
        trade = await conn.fetchrow(
            """
            SELECT t.id, t.symbol, t.open_price, t.close_price,
                   t.sl_price, t.tp_price, t.pnl_percent, t.open_time, t.close_time,
                   t.result
            FROM trades t
            WHERE t.id = $1
            """,
            trade_id,
        )
        if not trade:
            logger.warning("Trade %d not found for review", trade_id)
            return

        # Check if already reviewed
        existing = await conn.fetchval(
            "SELECT 1 FROM post_trade_reviews WHERE trade_id = $1",
            trade_id,
        )
        if existing:
            return

        # Fetch AI confidence at time of entry
        # Find the week_start that was active when trade was opened
        trade_date = trade["open_time"].date() if trade["open_time"] else date.today()
        # Monday of that week
        days_since_monday = trade_date.weekday()
        week_start = trade_date - timedelta(days=days_since_monday)

        ai_row = await conn.fetchrow(
            """
            SELECT ai_confidence, ai_bias, ai_score, reasoning
            FROM ai_analysis_results
            WHERE symbol = $1 AND week_start = $2
            """,
            trade["symbol"],
            week_start,
        )

        ai_confidence = ai_row["ai_confidence"] if ai_row else "none"
        ai_bias = ai_row["ai_bias"] if ai_row else "unknown"
        ai_score = ai_row["ai_score"] if ai_row else None

    # Build review prompt for Haiku
    trade_result = trade["result"] if trade["result"] else ("win" if trade["pnl_percent"] > 0 else "loss")
    direction = "LONG" if trade["open_price"] and trade["close_price"] and trade["close_price"] > trade["open_price"] else "SHORT"

    prompt = f"""Review this closed trade and provide ONE actionable insight.

Trade Details:
- Symbol: {trade['symbol']}
- Direction: {direction}
- Entry: {trade['open_price']}, Exit: {trade['close_price']}
- SL: {trade['sl_price']}, TP: {trade['tp_price']}
- P&L: {trade['pnl_percent']:.2f}%
- Duration: {trade['open_time']} to {trade['close_time']}
- Result: {trade_result}

AI Analysis at Entry:
- AI Confidence: {ai_confidence}
- AI Bias: {ai_bias}
- AI Score: {ai_score}

Provide ONE specific, actionable insight (2-3 sentences max) about what can be learned from this trade outcome relative to the AI confidence at entry. Focus on pattern recognition: does this market tend to perform better/worse at certain confidence levels, or conditions?"""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )

        insight = response.content[0].text.strip()
        tokens_used = response.usage.input_tokens + response.usage.output_tokens
        # Haiku cost: ~$0.001 per 1K tokens
        cost_usd = tokens_used * 0.001 / 1000

    except Exception as e:
        logger.error("Post-trade review failed for trade %d: %s", trade_id, e)
        return

    # Store the review
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO post_trade_reviews
                (symbol, trade_id, trade_result, ai_confidence_at_entry, pnl_percent, insight)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (symbol, trade_id) DO NOTHING
            """,
            trade["symbol"],
            trade_id,
            trade_result,
            ai_confidence,
            trade["pnl_percent"],
            insight,
        )

    logger.info(
        "post_trade_review",
        extra={
            "trade_id": trade_id,
            "symbol": trade["symbol"],
            "result": trade_result,
            "confidence": ai_confidence,
            "tokens": tokens_used,
        },
    )


async def get_recent_insights(symbol: str, limit: int = 5) -> list[dict]:
    """Fetch recent post-trade review insights for a symbol."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT trade_result, ai_confidence_at_entry, pnl_percent, insight, reviewed_at
            FROM post_trade_reviews
            WHERE symbol = $1
            ORDER BY reviewed_at DESC
            LIMIT $2
            """,
            symbol,
            limit,
        )
    return [dict(r) for r in rows]


async def get_confidence_win_rates(symbol: str) -> dict:
    """Calculate win rates by AI confidence tier for a symbol."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ai_confidence_at_entry,
                   COUNT(*) as total,
                   SUM(CASE WHEN trade_result = 'win' THEN 1 ELSE 0 END) as wins
            FROM post_trade_reviews
            WHERE symbol = $1 AND ai_confidence_at_entry IS NOT NULL
            GROUP BY ai_confidence_at_entry
            """,
            symbol,
        )
    result = {}
    for r in rows:
        conf = r["ai_confidence_at_entry"]
        total = r["total"]
        wins = r["wins"]
        result[conf] = {
            "total": total,
            "wins": wins,
            "win_rate": round(wins / total * 100, 1) if total > 0 else 0,
        }
    return result
