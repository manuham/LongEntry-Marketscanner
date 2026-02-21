"""
AI Vision Analysis Engine

Replaces rule-based technical scoring with Claude Sonnet vision analysis.
Receives D1/H4/H1/M5 chart screenshots + market data and returns structured
AI analysis: score (0-100), confidence, bias, key levels, confluence, and risk factors.

This is the core intelligence upgrade from the AI Trade Bot architecture:
- Tiered approach: Sonnet for full vision analysis (~$0.40-0.50 per market)
- Performance feedback: last 20 trades injected into prompt
- Market context: supplementary metrics (ATR, RSI, SMA) fed as data
- Fundamentals: AI outlook from auto_outlook.py included
"""

import asyncio
import base64
import json
import logging
import os
import re
import time
from datetime import date, timedelta

from app.config import settings
from app.database import get_pool

logger = logging.getLogger(__name__)

# Session hours per asset class (broker time UTC+2)
SESSION_PROFILES = {
    "XAUUSD": {"name": "Gold", "hours": "09:00-20:00 UTC+2", "type": "commodity",
                "notes": "Driven by USD strength, real yields, safe-haven demand. Trades most actively during London-NY overlap."},
    "XAGUSD": {"name": "Silver", "hours": "09:00-20:00 UTC+2", "type": "commodity",
                "notes": "Follows gold but more volatile. Industrial demand component adds sensitivity to growth data."},
    "US500":  {"name": "S&P 500", "hours": "15:30-22:00 UTC+2", "type": "index",
                "notes": "Benchmark US index. Sensitive to Fed policy, earnings, and risk sentiment."},
    "US100":  {"name": "Nasdaq 100", "hours": "15:30-22:00 UTC+2", "type": "index",
                "notes": "Tech-heavy. Higher beta than S&P. Very sensitive to interest rate expectations."},
    "US30":   {"name": "Dow Jones", "hours": "15:30-22:00 UTC+2", "type": "index",
                "notes": "Blue-chip US index. More cyclical exposure than Nasdaq."},
    "GER40":  {"name": "DAX 40", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "Germany's benchmark. Export-heavy, sensitive to EUR/USD and China demand."},
    "UK100":  {"name": "FTSE 100", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "UK blue chips. Heavy on miners, oil, financials. Inverse GBP correlation."},
    "FRA40":  {"name": "CAC 40", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "France's benchmark. Luxury and industrial names dominate."},
    "EU50":   {"name": "Euro Stoxx 50", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "Pan-European blue chips. Sensitive to ECB policy."},
    "SPN35":  {"name": "IBEX 35", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "Spain's benchmark. Heavy on banks and utilities."},
    "N25":    {"name": "AEX 25", "hours": "09:00-17:30 UTC+2", "type": "index",
                "notes": "Netherlands benchmark. Tech (ASML) and consumer names."},
    "JP225":  {"name": "Nikkei 225", "hours": "01:00-07:00 UTC+2", "type": "index",
                "notes": "Japan's benchmark. Sensitive to JPY, BoJ policy, and global risk."},
    "HK50":   {"name": "Hang Seng", "hours": "03:30-10:00 UTC+2", "type": "index",
                "notes": "Hong Kong benchmark. China exposure, tech-heavy."},
    "AUS200": {"name": "ASX 200", "hours": "01:00-07:00 UTC+2", "type": "index",
                "notes": "Australia's benchmark. Mining, banks, RBA-sensitive."},
}

ALL_PROFILES = {**SESSION_PROFILES}


def build_system_prompt(symbol: str, metrics: dict, fundamentals: dict | None,
                        feedback: dict | None) -> str:
    """Construct the AI analysis system prompt.

    Inspired by the AI Trade Bot's build_system_prompt() but adapted for
    the weekly scanner use case: we evaluate overall weekly outlook rather
    than intraday entry setups.
    """
    profile = ALL_PROFILES.get(symbol, {"name": symbol, "hours": "N/A", "type": "unknown"})
    asset_type = profile.get("type", "unknown")
    sector = profile.get("sector", "")

    # Build market data context from supplementary metrics
    market_data_lines = []
    if metrics.get("current_price") is not None:
        market_data_lines.append(f"Current Price: {metrics['current_price']}")
    for key, label in [
        ("atr_14", "ATR(14)"), ("rsi_14", "RSI(14)"),
        ("sma_20", "SMA(20)"), ("sma_50", "SMA(50)"), ("sma_200", "SMA(200)"),
        ("daily_range_pct", "Avg Daily Range %"),
        ("change_1w", "1W Change %"), ("change_2w", "2W Change %"),
        ("change_1m", "1M Change %"), ("change_3m", "3M Change %"),
        ("up_day_win_rate", "Up-Day Win Rate %"),
    ]:
        val = metrics.get(key)
        if val is not None:
            market_data_lines.append(f"{label}: {val}")

    market_data_text = "\n".join(market_data_lines) if market_data_lines else "No supplementary data available."

    # Fundamentals context
    fund_text = "No fundamental data available."
    if fundamentals:
        pred = fundamentals.get("prediction", "unknown")
        score = fundamentals.get("score", "N/A")
        reasoning = fundamentals.get("reasoning", "")
        fund_text = f"AI Fundamental Outlook: {pred.upper()} (score {score}/100)\n{reasoning}"

    # Performance feedback
    feedback_text = "No historical trade data available for this symbol."
    if feedback and feedback.get("total_trades", 0) > 0:
        fb_lines = [
            f"Total Closed Trades: {feedback['total_trades']}",
            f"Win Rate: {feedback['win_rate']:.1f}%",
            f"Avg Winner: {feedback['avg_winner']:.2f}%",
            f"Avg Loser: {feedback['avg_loser']:.2f}%",
        ]
        if feedback.get("recent_insights"):
            fb_lines.append("\nRecent Trade Insights:")
            for insight in feedback["recent_insights"][:5]:
                fb_lines.append(f"  - {insight}")
        if feedback.get("recent_trades"):
            fb_lines.append("\nLast 10 Trades:")
            for t in feedback["recent_trades"][:10]:
                fb_lines.append(f"  {t}")
        feedback_text = "\n".join(fb_lines)

    sector_line = f"\nSector: {sector}" if sector else ""

    return f"""You are a professional technical analyst and market strategist evaluating {symbol} ({profile['name']}) for the COMING WEEK.

MARKET PROFILE:
Asset Type: {asset_type.title()}{sector_line}
Trading Hours: {profile['hours']}
{profile.get('notes', '')}

SUPPLEMENTARY DATA (from H1 candles):
{market_data_text}

FUNDAMENTAL CONTEXT:
{fund_text}

RECENT PERFORMANCE (this symbol's trading history):
{feedback_text}

YOUR TASK:
Analyze the 4 chart screenshots provided (D1, H4, H1, M5 timeframes) and produce a comprehensive weekly outlook.

ANALYSIS FRAMEWORK:
1. D1 (Daily): Identify the primary trend direction, key support/resistance zones, and whether price is in a premium or discount area relative to recent range.
2. H4 (4-Hour): Assess the intermediate structure. Look for higher highs/higher lows (bullish) or lower highs/lower lows (bearish). Identify any pattern formations.
3. H1 (1-Hour): Evaluate the short-term momentum. Check for confluence with higher timeframes. Identify the best entry window based on session activity.
4. M5 (5-Minute): Assess the most recent price action. Look for signs of accumulation, distribution, or exhaustion.

For each timeframe, consider:
- Moving average alignment and slope
- RSI position and divergences
- Volume/momentum patterns
- Key horizontal levels (round numbers, prior swing highs/lows)
- Chart patterns (triangles, channels, head & shoulders, etc.)
- Candlestick patterns (engulfing, pin bars, inside bars)

SCORING GUIDELINES:
- 80-100: Strong multi-timeframe confluence, clear trend, strong momentum, favorable fundamentals
- 60-79: Moderate setup, 2-3 timeframes aligned, some favorable factors
- 40-59: Mixed signals, conflicting timeframes, neutral outlook
- 20-39: Weak setup, most timeframes bearish, unfavorable conditions
- 0-19: Strong bearish signal across all timeframes, high risk factors

CONFIDENCE GUIDELINES:
- high: 3+ timeframes aligned, clear structure, strong momentum, low risk factors
- medium: 2 timeframes aligned, some uncertainty, moderate risk
- low: Conflicting signals, choppy price action, high event risk

Respond with ONLY valid JSON (no markdown fences, no text outside JSON):
{{
    "ai_score": <0-100>,
    "ai_confidence": "high|medium|low",
    "ai_bias": "bullish|neutral|bearish",
    "key_levels": {{
        "resistance_1": {{"price": <float>, "type": "swing_high|round_number|sma|trendline", "strength": "strong|moderate|weak"}},
        "resistance_2": {{"price": <float>, "type": "...", "strength": "..."}},
        "support_1": {{"price": <float>, "type": "...", "strength": "..."}},
        "support_2": {{"price": <float>, "type": "...", "strength": "..."}}
    }},
    "confluence": {{
        "description": "<what factors align>",
        "strength": "high|medium|low",
        "factors": ["<factor1>", "<factor2>", "..."]
    }},
    "momentum": {{
        "trend_direction": "up|down|sideways",
        "rsi_reading": "<oversold|neutral|overbought>",
        "ma_alignment": "bullish|neutral|bearish"
    }},
    "risk_factors": ["<risk1>", "<risk2>", "..."],
    "suggested_entry_window": "<HH:MM-HH:MM UTC+2 or 'avoid'>",
    "suggested_sl_pct": <float, e.g. 1.0 for 1%>,
    "suggested_tp_pct": <float, e.g. 2.0 for 2%>,
    "reasoning": "<2-3 sentence summary of your weekly outlook for this market>"
}}"""


async def load_screenshots(symbol: str, week_start: date) -> dict[str, str]:
    """Load screenshot file paths from database, return {timeframe: base64_jpeg}."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT timeframe, file_path
            FROM chart_screenshots
            WHERE symbol = $1 AND week_start = $2
            """,
            symbol,
            week_start,
        )

    screenshots = {}
    for row in rows:
        tf = row["timeframe"]
        path = row["file_path"]
        if os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
            screenshots[tf] = base64.b64encode(data).decode("utf-8")
        else:
            logger.warning("Screenshot file not found: %s", path)

    return screenshots


async def fetch_supplementary_metrics(symbol: str) -> dict:
    """Fetch latest technical metrics from candles (reuses analytics.py logic)."""
    from app.engines.analytics import (
        build_daily_bars,
        calc_atr,
        calc_price_change,
        calc_rsi,
        calc_sma,
        fetch_candles,
    )

    h1 = await fetch_candles(symbol)
    if h1.empty:
        return {}

    daily = build_daily_bars(h1)
    if len(daily) < 20:
        return {}

    current_price = float(h1["close"].iloc[-1])
    closes = daily["close"]

    # Daily return stats
    up_days = daily[daily["pct_change"] > 0]
    down_days = daily[daily["pct_change"] < 0]

    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "sma_20": round(calc_sma(closes, 20), 2) if calc_sma(closes, 20) is not None else None,
        "sma_50": round(calc_sma(closes, 50), 2) if calc_sma(closes, 50) is not None else None,
        "sma_200": round(calc_sma(closes, 200), 2) if calc_sma(closes, 200) is not None else None,
        "rsi_14": round(calc_rsi(closes, 14), 1) if calc_rsi(closes, 14) is not None else None,
        "atr_14": round(calc_atr(daily, 14), 2) if calc_atr(daily, 14) is not None else None,
        "daily_range_pct": round(((daily["high"] - daily["low"]) / daily["open"] * 100).mean(), 3),
        "change_1w": round(calc_price_change(daily, 5), 2) if calc_price_change(daily, 5) is not None else None,
        "change_2w": round(calc_price_change(daily, 10), 2) if calc_price_change(daily, 10) is not None else None,
        "change_1m": round(calc_price_change(daily, 22), 2) if calc_price_change(daily, 22) is not None else None,
        "change_3m": round(calc_price_change(daily, 66), 2) if calc_price_change(daily, 66) is not None else None,
        "up_day_win_rate": round(len(up_days) / len(daily) * 100, 1),
        "avg_daily_growth": round(float(up_days["pct_change"].mean()), 4) if len(up_days) > 0 else 0.0,
        "avg_daily_loss": round(float(down_days["pct_change"].mean()), 4) if len(down_days) > 0 else 0.0,
    }


async def fetch_fundamentals(symbol: str) -> dict | None:
    """Fetch latest AI prediction for this symbol (from auto_outlook.py)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT prediction, score, reasoning, updated_at
            FROM market_ai_prediction
            WHERE symbol = $1
              AND updated_at > NOW() - INTERVAL '7 days'
            """,
            symbol,
        )
    if not row:
        return None
    return dict(row)


async def format_trade_feedback(symbol: str, limit: int = 20) -> dict:
    """Format recent closed trades for injection into the AI prompt.

    Based on the AI Trade Bot's performance feedback pattern: last N trades
    plus win rates and post-trade review insights.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        trades = await conn.fetch(
            """
            SELECT open_time, close_time, open_price, close_price,
                   pnl_percent, result
            FROM trades
            WHERE symbol = $1 AND result IN ('win', 'loss')
            ORDER BY close_time DESC
            LIMIT $2
            """,
            symbol,
            limit,
        )

        # Fetch post-trade review insights
        insights = await conn.fetch(
            """
            SELECT insight
            FROM post_trade_reviews
            WHERE symbol = $1
            ORDER BY reviewed_at DESC
            LIMIT 5
            """,
            symbol,
        )

    if not trades:
        return {"total_trades": 0}

    wins = [t for t in trades if t["result"] == "win"]
    losses = [t for t in trades if t["result"] == "loss"]

    avg_winner = sum(t["pnl_percent"] or 0 for t in wins) / len(wins) if wins else 0
    avg_loser = sum(t["pnl_percent"] or 0 for t in losses) / len(losses) if losses else 0

    recent_trades = []
    for t in trades[:10]:
        pnl = t["pnl_percent"] or 0
        result = t["result"].upper()
        dt = t["close_time"].strftime("%a %b %d %H:%M") if t["close_time"] else "?"
        recent_trades.append(f"{dt} — {result} {pnl:+.2f}%")

    return {
        "total_trades": len(trades),
        "win_rate": len(wins) / len(trades) * 100,
        "avg_winner": avg_winner,
        "avg_loser": avg_loser,
        "recent_trades": recent_trades,
        "recent_insights": [r["insight"] for r in insights],
    }


def extract_json(text: str) -> dict:
    """Parse JSON from Claude's response, handling markdown fences."""
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```", "", text)

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
                try:
                    return json.loads(text[start: i + 1], strict=False)
                except json.JSONDecodeError as e:
                    logger.error("JSON parse error: %s", e)
                    return {}
    return {}


def validate_ai_result(result: dict) -> dict | None:
    """Validate and normalize the AI analysis result."""
    required = ["ai_score", "ai_confidence", "ai_bias"]
    for key in required:
        if key not in result:
            logger.error("Missing required field: %s", key)
            return None

    # Clamp score to 0-100
    score = float(result["ai_score"])
    if not (0 <= score <= 100):
        logger.warning("AI score %.1f out of range, clamping", score)
        score = max(0, min(100, score))
    result["ai_score"] = round(score, 1)

    # Validate enums
    if result["ai_confidence"] not in ("high", "medium", "low"):
        result["ai_confidence"] = "medium"
    if result["ai_bias"] not in ("bullish", "neutral", "bearish"):
        result["ai_bias"] = "neutral"

    return result


async def analyze_symbol_with_ai(symbol: str, week_start: date) -> dict | None:
    """
    Run AI vision analysis for a single symbol.

    1. Load D1/H4/H1/M5 screenshots
    2. Fetch supplementary metrics, fundamentals, trade feedback
    3. Build prompt, call Claude Sonnet with vision
    4. Parse & validate result
    5. Store in ai_analysis_results table
    """
    import anthropic

    if not settings.anthropic_api_key:
        logger.error("LE_ANTHROPIC_API_KEY not set — cannot run AI analysis")
        return None

    # Load screenshots
    screenshots = await load_screenshots(symbol, week_start)
    if len(screenshots) < 2:
        logger.warning(
            "Only %d screenshots for %s (need at least 2) — skipping AI analysis",
            len(screenshots), symbol,
        )
        return None

    # Fetch context
    metrics = await fetch_supplementary_metrics(symbol)
    fundamentals = await fetch_fundamentals(symbol)
    feedback = await format_trade_feedback(symbol)

    # Build prompt
    system_prompt = build_system_prompt(symbol, metrics, fundamentals, feedback)

    # Build message with images
    content = []

    # Add screenshots as images (D1, H4, H1, M5 order)
    for tf in ["D1", "H4", "H1", "M5"]:
        if tf in screenshots:
            content.append({
                "type": "text",
                "text": f"--- {tf} Chart ---",
            })
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": screenshots[tf],
                },
            })

    # Inject market context and upcoming events
    from app.market_context import get_market_context, format_context_for_prompt
    from app.news_filter import get_events_for_symbol, format_events_for_prompt

    context_task = asyncio.create_task(get_market_context(symbol))
    events_task = asyncio.create_task(get_events_for_symbol(symbol, days=7))

    context = await context_task
    events = await events_task

    context_text = format_context_for_prompt(context)
    events_text = format_events_for_prompt(events, limit=10)

    user_message_parts = ["Please analyze these charts and provide your weekly outlook as JSON."]
    if context_text:
        user_message_parts.append(context_text)
    if events_text:
        user_message_parts.append(events_text)

    content.append({
        "type": "text",
        "text": "\n\n".join(user_message_parts),
    })

    # Call Claude Sonnet
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    start_time = time.time()
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as e:
        logger.exception("Claude API call failed for %s: %s", symbol, e)
        return None

    duration = time.time() - start_time

    # Extract text from response
    text_parts = []
    for block in response.content:
        if hasattr(block, "text") and block.text.strip():
            text_parts.append(block.text.strip())

    if not text_parts:
        logger.error("No text in Claude response for %s", symbol)
        return None

    # Parse JSON
    result = None
    for text in reversed(text_parts):
        result = extract_json(text)
        if result:
            break

    if not result:
        combined = "\n".join(text_parts)
        result = extract_json(combined)

    if not result:
        logger.error("Could not parse JSON from AI response for %s", symbol)
        return None

    # Validate
    result = validate_ai_result(result)
    if result is None:
        return None

    # Calculate cost (approximate)
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    # Sonnet pricing: $3/M input, $15/M output
    cost = (input_tokens * 3 + output_tokens * 15) / 1_000_000

    logger.info(
        "AI analysis for %s: score=%.1f, confidence=%s, bias=%s (%.1fs, $%.4f, %d+%d tokens)",
        symbol,
        result["ai_score"],
        result["ai_confidence"],
        result["ai_bias"],
        duration,
        cost,
        input_tokens,
        output_tokens,
    )

    # Store in database
    await store_ai_analysis(symbol, week_start, result, input_tokens + output_tokens, cost)

    return result


async def store_ai_analysis(
    symbol: str,
    week_start: date,
    result: dict,
    tokens_used: int,
    cost_usd: float,
) -> None:
    """Store AI analysis result in the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO ai_analysis_results
                (symbol, week_start, ai_score, ai_confidence, ai_bias,
                 key_levels, confluence, risk_factors, reasoning,
                 suggested_entry_window, suggested_sl_pct, suggested_tp_pct,
                 model_used, tokens_used, cost_usd, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            ON CONFLICT (symbol, week_start)
            DO UPDATE SET
                ai_score = EXCLUDED.ai_score,
                ai_confidence = EXCLUDED.ai_confidence,
                ai_bias = EXCLUDED.ai_bias,
                key_levels = EXCLUDED.key_levels,
                confluence = EXCLUDED.confluence,
                risk_factors = EXCLUDED.risk_factors,
                reasoning = EXCLUDED.reasoning,
                suggested_entry_window = EXCLUDED.suggested_entry_window,
                suggested_sl_pct = EXCLUDED.suggested_sl_pct,
                suggested_tp_pct = EXCLUDED.suggested_tp_pct,
                model_used = EXCLUDED.model_used,
                tokens_used = EXCLUDED.tokens_used,
                cost_usd = EXCLUDED.cost_usd,
                created_at = NOW()
            """,
            symbol,
            week_start,
            result["ai_score"],
            result["ai_confidence"],
            result["ai_bias"],
            json.dumps(result.get("key_levels")) if result.get("key_levels") else None,
            json.dumps(result.get("confluence")) if result.get("confluence") else None,
            json.dumps(result.get("risk_factors")) if result.get("risk_factors") else None,
            result.get("reasoning"),
            result.get("suggested_entry_window"),
            result.get("suggested_sl_pct"),
            result.get("suggested_tp_pct"),
            "claude-sonnet-4-5-20250929",
            tokens_used,
            cost_usd,
        )


async def fetch_ai_analysis(symbol: str, week_start: date) -> dict | None:
    """Fetch stored AI analysis for a symbol/week."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ai_score, ai_confidence, ai_bias, key_levels, confluence,
                   risk_factors, reasoning, suggested_entry_window,
                   suggested_sl_pct, suggested_tp_pct, tokens_used, cost_usd,
                   created_at
            FROM ai_analysis_results
            WHERE symbol = $1 AND week_start = $2
            """,
            symbol,
            week_start,
        )
    if not row:
        return None
    result = dict(row)
    # Parse JSONB fields
    for field in ("key_levels", "confluence", "risk_factors"):
        if result[field] and isinstance(result[field], str):
            result[field] = json.loads(result[field])
    return result
