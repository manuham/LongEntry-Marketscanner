"""
Phase 2 — Market Analytics Engine

Computes technical metrics from H1 candle data for each symbol.
Groups H1 candles into daily bars, then calculates:
  - Avg daily growth/loss
  - Most bullish/bearish day
  - Up-day win rate
  - SMA(20, 50, 200) vs current price
  - RSI(14)
  - ATR(14)
  - Price changes (1w, 2w, 1m, 3m)
  - Composite TechnicalScore (0–100)
"""

import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.config import settings
from app.database import get_pool
from app.engines.backtest import run_backtest_for_symbol
from app.engines.fundamental import score_symbol as fundamental_score_symbol

# Lazy import to avoid circular dependency — used in run_full_analysis()
# from app.engines.ai_analyzer import analyze_symbol_with_ai, fetch_ai_analysis

logger = logging.getLogger(__name__)


async def fetch_candles(symbol: str) -> pd.DataFrame:
    """Fetch all H1 candles for a symbol from the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT open_time, open, high, low, close, volume
            FROM candles
            WHERE symbol = $1 AND timeframe = 'H1'
            ORDER BY open_time
            """,
            symbol,
        )
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume"])
    df["open_time"] = pd.to_datetime(df["open_time"])
    return df


def build_daily_bars(h1: pd.DataFrame) -> pd.DataFrame:
    """Aggregate H1 candles into daily OHLC bars."""
    h1 = h1.copy()
    h1["date"] = h1["open_time"].dt.date
    daily = h1.groupby("date").agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum"),
    ).reset_index()
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.sort_values("date").reset_index(drop=True)
    daily["pct_change"] = (daily["close"] - daily["open"]) / daily["open"] * 100
    return daily


def calc_sma(series: pd.Series, period: int) -> float | None:
    """Return the latest SMA value, or None if not enough data."""
    if len(series) < period:
        return None
    return float(series.iloc[-period:].mean())


def calc_rsi(closes: pd.Series, period: int = 14) -> float | None:
    """Compute RSI using exponential moving average of gains/losses."""
    if len(closes) < period + 1:
        return None
    delta = closes.diff()
    gains = delta.where(delta > 0, 0.0)
    losses = (-delta).where(delta < 0, 0.0)
    avg_gain = gains.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = losses.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else None


def calc_atr(daily: pd.DataFrame, period: int = 14) -> float | None:
    """Average True Range over N days using Wilder's smoothing (EMA)."""
    if len(daily) < period + 1:
        return None
    high = daily["high"]
    low = daily["low"]
    prev_close = daily["close"].shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    # Wilder's smoothing: EMA with alpha = 1/period (matches industry standard)
    atr = tr.ewm(alpha=1.0 / period, min_periods=period).mean()
    return float(atr.iloc[-1]) if not np.isnan(atr.iloc[-1]) else None


def calc_price_change(daily: pd.DataFrame, trading_days: int) -> float | None:
    """Percentage change over the last N trading days."""
    if len(daily) < trading_days + 1:
        return None
    current = daily["close"].iloc[-1]
    past = daily["close"].iloc[-1 - trading_days]
    return float((current - past) / past * 100)


def compute_technical_score(metrics: dict) -> float:
    """
    Composite TechnicalScore (0–100) from individual metrics.

    Components and weights:
      - Win Rate Score:       20%  (higher % of up days = better for long)
      - Growth/Loss Ratio:    15%  (avg growth vs avg loss magnitude)
      - Trend (SMA position): 25%  (price above SMAs = bullish)
      - RSI Score:            15%  (moderate RSI 40-70 ideal for entry)
      - Momentum:             15%  (recent price changes positive = bullish)
      - Volatility:           10%  (moderate ATR preferred)
    """
    scores = {}

    # 1. Win Rate Score: normalize 45%-65% range → 0-100
    wr = metrics.get("up_day_win_rate")
    if wr is not None:
        scores["win_rate"] = max(0, min(100, (wr - 45) / 20 * 100))
    else:
        scores["win_rate"] = 50

    # 2. Growth/Loss Ratio Score
    growth = metrics.get("avg_daily_growth")
    loss = metrics.get("avg_daily_loss")
    if growth is not None and loss is not None and loss != 0:
        ratio = abs(growth / loss)
        # Normalize: ratio 0.5-2.0 → 0-100
        scores["growth_loss"] = max(0, min(100, (ratio - 0.5) / 1.5 * 100))
    else:
        scores["growth_loss"] = 50

    # 3. Trend Score (price vs SMAs)
    trend = 0
    current_price = metrics.get("current_price")
    if current_price is not None:
        sma20 = metrics.get("sma_20")
        sma50 = metrics.get("sma_50")
        sma200 = metrics.get("sma_200")
        if sma20 is not None and current_price > sma20:
            trend += 33
        if sma50 is not None and current_price > sma50:
            trend += 33
        if sma200 is not None and current_price > sma200:
            trend += 34
    scores["trend"] = trend

    # 4. RSI Score: ideal range 40-65 for long entry
    rsi = metrics.get("rsi_14")
    if rsi is not None:
        if 40 <= rsi <= 65:
            scores["rsi"] = 100 - abs(rsi - 52.5) / 12.5 * 30  # Peak at 52.5
        elif rsi < 40:
            scores["rsi"] = max(0, rsi / 40 * 70)  # Oversold = opportunity but risky
        else:
            scores["rsi"] = max(0, 100 - (rsi - 65) * 3)  # Overbought penalty
    else:
        scores["rsi"] = 50

    # 5. Momentum Score: recent price changes
    m1w = metrics.get("change_1w") or 0
    m1m = metrics.get("change_1m") or 0
    # Cap individual momentum inputs at ±5% to prevent parabolic moves from
    # saturating the score (e.g. a +20% month shouldn't score 100)
    m1w = max(-5.0, min(5.0, m1w))
    m1m = max(-5.0, min(5.0, m1m))
    # Positive = bullish, normalize roughly -5% to +5% → 0-100
    momentum = (m1w * 0.4 + m1m * 0.6)
    scores["momentum"] = max(0, min(100, 50 + momentum * 10))

    # 6. Volatility Score: moderate ATR preferred, calibrated per asset class
    atr = metrics.get("atr_14")
    current = metrics.get("current_price")
    symbol = metrics.get("symbol", "")
    if atr is not None and current is not None and current > 0:
        atr_pct = atr / current * 100  # ATR as % of price
        # Asset-class-specific sweet spots for daily ATR %
        if symbol in ("XAUUSD", "XAGUSD"):
            lo, hi, mid = 0.3, 1.2, 0.75   # Commodities: tighter range
        elif symbol in ("JP225", "HK50", "AUS200"):
            lo, hi, mid = 0.4, 1.8, 1.1    # Asian indices: wider range
        elif symbol in ("TSLA", "NVDA", "BABA", "ZM", "NFLX"):
            lo, hi, mid = 1.0, 4.0, 2.5    # High-vol stocks: much wider range
        elif symbol in (
            "AAPL", "AMZN", "GOOG", "META", "MSFT", "BAC", "V", "PFE",
            "T", "WMT", "AIRF", "ALVG", "BAYGn", "DBKGn", "IBE",
            "LVMH", "RACE", "VOWG_p",
        ):
            lo, hi, mid = 0.5, 2.5, 1.5    # Large-cap stocks: moderate range
        else:
            lo, hi, mid = 0.5, 2.0, 1.25   # US/EU indices: default
        if lo <= atr_pct <= hi:
            half_range = (hi - lo) / 2.0
            scores["volatility"] = 100 - abs(atr_pct - mid) / half_range * 30
        elif atr_pct < lo:
            scores["volatility"] = atr_pct / lo * 70
        else:
            scores["volatility"] = max(0, 100 - (atr_pct - hi) * 25)
    else:
        scores["volatility"] = 50

    # Weighted average
    weights = {
        "win_rate": 0.20,
        "growth_loss": 0.15,
        "trend": 0.25,
        "rsi": 0.15,
        "momentum": 0.15,
        "volatility": 0.10,
    }
    total = sum(scores[k] * weights[k] for k in weights)
    return round(max(0, min(100, total)), 1)


async def analyze_symbol(symbol: str, week_start: date) -> dict | None:
    """
    Run full technical analysis for a single symbol.
    Returns dict of all metrics, or None if no candle data.
    """
    h1 = await fetch_candles(symbol)
    if h1.empty:
        logger.warning("No candle data for %s — skipping analysis", symbol)
        return None

    daily = build_daily_bars(h1)
    if len(daily) < 20:
        logger.warning("Only %d daily bars for %s — need at least 20", len(daily), symbol)
        return None

    # Daily return stats
    up_days = daily[daily["pct_change"] > 0]
    down_days = daily[daily["pct_change"] < 0]

    avg_daily_growth = float(up_days["pct_change"].mean()) if len(up_days) > 0 else 0.0
    avg_daily_loss = float(down_days["pct_change"].mean()) if len(down_days) > 0 else 0.0
    most_bullish_day = float(daily["pct_change"].max())
    most_bearish_day = float(daily["pct_change"].min())
    up_day_win_rate = float(len(up_days) / len(daily) * 100)

    # Current price (last H1 close)
    current_price = float(h1["close"].iloc[-1])

    # SMAs from daily closes
    closes = daily["close"]
    sma_20 = calc_sma(closes, 20)
    sma_50 = calc_sma(closes, 50)
    sma_200 = calc_sma(closes, 200)

    # RSI(14) from daily closes
    rsi_14 = calc_rsi(closes, 14)

    # ATR(14)
    atr_14 = calc_atr(daily, 14)

    # Daily range % (average of (high-low)/open * 100)
    daily_range_pct = float(((daily["high"] - daily["low"]) / daily["open"] * 100).mean())

    # Price changes over different periods (approximate trading days)
    change_1w = calc_price_change(daily, 5)
    change_2w = calc_price_change(daily, 10)
    change_1m = calc_price_change(daily, 22)
    change_3m = calc_price_change(daily, 66)

    metrics = {
        "symbol": symbol,
        "week_start": week_start,
        "current_price": current_price,
        "avg_daily_growth": round(avg_daily_growth, 4),
        "avg_daily_loss": round(avg_daily_loss, 4),
        "most_bullish_day": round(most_bullish_day, 2),
        "most_bearish_day": round(most_bearish_day, 2),
        "up_day_win_rate": round(up_day_win_rate, 1),
        "sma_20": round(sma_20, 2) if sma_20 is not None else None,
        "sma_50": round(sma_50, 2) if sma_50 is not None else None,
        "sma_200": round(sma_200, 2) if sma_200 is not None else None,
        "rsi_14": round(rsi_14, 1) if rsi_14 is not None else None,
        "atr_14": round(atr_14, 2) if atr_14 is not None else None,
        "daily_range_pct": round(daily_range_pct, 3),
        "change_1w": round(change_1w, 2) if change_1w is not None else None,
        "change_2w": round(change_2w, 2) if change_2w is not None else None,
        "change_1m": round(change_1m, 2) if change_1m is not None else None,
        "change_3m": round(change_3m, 2) if change_3m is not None else None,
        "candle_count": len(h1),
        "daily_bar_count": len(daily),
    }

    metrics["technical_score"] = compute_technical_score(metrics)
    return metrics


async def store_analysis(metrics: dict) -> None:
    """Insert or update weekly_analysis row for this symbol + week."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO weekly_analysis
                (symbol, week_start, technical_score,
                 avg_daily_growth, avg_daily_loss,
                 most_bullish_day, most_bearish_day, up_day_win_rate,
                 backtest_score, fundamental_score,
                 opt_entry_hour, opt_entry_minute,
                 opt_sl_percent, opt_tp_percent,
                 bt_total_return, bt_win_rate, bt_profit_factor,
                 bt_total_trades, bt_max_drawdown, bt_param_stability,
                 final_score, rank, is_active,
                 ai_score, ai_confidence, ai_bias)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26)
            ON CONFLICT (symbol, week_start)
            DO UPDATE SET
                technical_score = EXCLUDED.technical_score,
                avg_daily_growth = EXCLUDED.avg_daily_growth,
                avg_daily_loss = EXCLUDED.avg_daily_loss,
                most_bullish_day = EXCLUDED.most_bullish_day,
                most_bearish_day = EXCLUDED.most_bearish_day,
                up_day_win_rate = EXCLUDED.up_day_win_rate,
                backtest_score = EXCLUDED.backtest_score,
                fundamental_score = EXCLUDED.fundamental_score,
                opt_entry_hour = EXCLUDED.opt_entry_hour,
                opt_entry_minute = EXCLUDED.opt_entry_minute,
                opt_sl_percent = EXCLUDED.opt_sl_percent,
                opt_tp_percent = EXCLUDED.opt_tp_percent,
                bt_total_return = EXCLUDED.bt_total_return,
                bt_win_rate = EXCLUDED.bt_win_rate,
                bt_profit_factor = EXCLUDED.bt_profit_factor,
                bt_total_trades = EXCLUDED.bt_total_trades,
                bt_max_drawdown = EXCLUDED.bt_max_drawdown,
                bt_param_stability = EXCLUDED.bt_param_stability,
                final_score = EXCLUDED.final_score,
                rank = EXCLUDED.rank,
                is_active = CASE
                    WHEN weekly_analysis.is_manually_overridden THEN weekly_analysis.is_active
                    ELSE EXCLUDED.is_active
                END,
                ai_score = EXCLUDED.ai_score,
                ai_confidence = EXCLUDED.ai_confidence,
                ai_bias = EXCLUDED.ai_bias
            """,
            metrics["symbol"],
            metrics["week_start"],
            metrics["technical_score"],
            metrics["avg_daily_growth"],
            metrics["avg_daily_loss"],
            metrics["most_bullish_day"],
            metrics["most_bearish_day"],
            metrics["up_day_win_rate"],
            metrics.get("backtest_score"),
            metrics.get("fundamental_score"),
            metrics.get("opt_entry_hour"),
            metrics.get("opt_entry_minute", 0),
            metrics.get("opt_sl_percent"),
            metrics.get("opt_tp_percent"),
            metrics.get("bt_total_return"),
            metrics.get("bt_win_rate"),
            metrics.get("bt_profit_factor"),
            metrics.get("bt_total_trades"),
            metrics.get("bt_max_drawdown"),
            metrics.get("bt_param_stability"),
            metrics.get("final_score"),
            metrics.get("rank"),
            metrics.get("is_active", False),
            metrics.get("ai_score"),
            metrics.get("ai_confidence"),
            metrics.get("ai_bias"),
        )


def get_current_week_start() -> date:
    """Return the Monday of the current trading week."""
    today = date.today()
    # Monday = 0, Sunday = 6
    return today - timedelta(days=today.weekday())


async def _dynamic_min_score(pool, base_min_score: float) -> float:
    """Adjust min score threshold based on recent system-wide win rate.

    Rules:
    - Win rate >= 65% (min 10 trades) → lower to 35 (more aggressive)
    - Win rate < 40% → raise to 50 (more selective)
    - Otherwise → keep base threshold
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) AS wins
            FROM trades
            WHERE closed_at > NOW() - INTERVAL '60 days'
            """
        )

    if not row or row["total"] < 10:
        return base_min_score

    win_rate = row["wins"] / row["total"] * 100
    if win_rate >= 65:
        return 35.0
    elif win_rate < 40:
        return 50.0
    return base_min_score


async def run_full_analysis() -> list[dict]:
    """
    Run analytics + backtest for all markets (indices, commodities, and stocks).
    Called by the Saturday cron job.
    Returns list of results.
    """
    week_start = get_current_week_start()
    logger.info("Starting weekly analysis for week of %s", week_start)

    pool = await get_pool()
    async with pool.acquire() as conn:
        symbols = await conn.fetch(
            "SELECT symbol, category FROM markets WHERE is_in_universe = true ORDER BY symbol"
        )

    # Build symbol→category lookup
    symbol_category = {row["symbol"]: row["category"] for row in symbols}

    # Lazy import to avoid circular dependency
    from app.engines.ai_analyzer import analyze_symbol_with_ai, fetch_ai_analysis

    # Phase 1: Technical analysis + backtest + AI vision for each symbol
    results = []
    total_ai_cost = 0.0
    for row in symbols:
        symbol = row["symbol"]
        try:
            metrics = await analyze_symbol(symbol, week_start)
            if metrics is None:
                results.append({"symbol": symbol, "error": "No data"})
                continue

            # Run backtest and merge results
            h1 = await fetch_candles(symbol)
            bt = await run_backtest_for_symbol(symbol, h1, week_start)
            if bt is not None:
                metrics.update(bt)

            # Compute fundamental score
            fund_score = await fundamental_score_symbol(symbol, week_start)
            metrics["fundamental_score"] = fund_score

            # AI Vision Analysis (if enabled and screenshots available)
            ai_result = None
            if settings.ai_vision_enabled:
                # Try to run AI analysis (will skip if no screenshots)
                ai_result = await analyze_symbol_with_ai(symbol, week_start)
                if ai_result is None:
                    # Check if a previous analysis exists for this week
                    ai_result = await fetch_ai_analysis(symbol, week_start)

            if ai_result is not None:
                metrics["ai_score"] = ai_result["ai_score"]
                metrics["ai_confidence"] = ai_result["ai_confidence"]
                metrics["ai_bias"] = ai_result["ai_bias"]
                if ai_result.get("cost_usd"):
                    total_ai_cost += ai_result["cost_usd"]

            # Compute Final Score
            # When backtest fails, use neutral 50 instead of 0
            bt_score = bt["backtest_score"] if bt is not None else 50.0
            metrics.setdefault("backtest_score", bt_score)

            if ai_result is not None:
                # NEW formula: AI(60%) + Backtest(25%) + Fundamental(15%)
                ai_part = ai_result["ai_score"] * 0.60
                bt_part = bt_score * 0.25
                fund_part = fund_score * 0.15
                metrics["final_score"] = round(ai_part + bt_part + fund_part, 1)
                score_breakdown = (
                    f"AI:{ai_result['ai_score']:.0f} "
                    f"BT:{bt_score:.0f} "
                    f"F:{fund_score:.0f}"
                )
            else:
                # Fallback: old formula Technical(50%) + Backtest(35%) + Fundamental(15%)
                tech_part = metrics["technical_score"] * 0.50
                bt_part = bt_score * 0.35
                fund_part = fund_score * 0.15
                metrics["final_score"] = round(tech_part + bt_part + fund_part, 1)
                score_breakdown = (
                    f"T:{metrics['technical_score']:.0f} "
                    f"BT:{bt_score:.0f} "
                    f"F:{fund_score:.0f}"
                )

            results.append(metrics)
            ai_tag = f" [{metrics.get('ai_confidence', 'no-ai').upper()}]" if ai_result else " [NO-AI]"
            logger.info(
                "Analyzed %s: %s → final=%.1f%s",
                symbol,
                score_breakdown,
                metrics["final_score"],
                ai_tag,
            )
        except Exception:
            logger.exception("Failed to analyze %s", symbol)
            results.append({"symbol": symbol, "error": "Analysis failed"})

    if total_ai_cost > 0:
        logger.info("Total AI analysis cost this run: $%.4f", total_ai_cost)

    # Phase 2: Rank and activate in separate pools (stocks vs indices/commodities)
    scored = [r for r in results if "error" not in r and "final_score" in r]

    # Dynamic min score threshold based on recent win rate
    min_score = settings.min_final_score
    if settings.dynamic_min_score_enabled:
        min_score = await _dynamic_min_score(pool, min_score)
        logger.info("Dynamic min_score: %.1f (base: %.1f)", min_score, settings.min_final_score)

    # Split into category pools
    stocks = [r for r in scored if symbol_category.get(r["symbol"]) == "stock"]
    non_stocks = [r for r in scored if symbol_category.get(r["symbol"]) != "stock"]

    stocks.sort(key=lambda r: r["final_score"], reverse=True)
    non_stocks.sort(key=lambda r: r["final_score"], reverse=True)

    max_active_markets = settings.max_active_markets
    max_active_stocks = settings.max_active_stocks

    for rank_idx, m in enumerate(non_stocks):
        m["rank"] = int(rank_idx + 1)
        m["final_score"] = float(m["final_score"])
        m["is_active"] = bool((rank_idx < max_active_markets) and (m["final_score"] >= min_score))

    for rank_idx, m in enumerate(stocks):
        m["rank"] = int(rank_idx + 1)
        m["final_score"] = float(m["final_score"])
        m["is_active"] = bool((rank_idx < max_active_stocks) and (m["final_score"] >= min_score))

    all_scored = non_stocks + stocks

    # Phase 3: Store all results
    for m in all_scored:
        try:
            await store_analysis(m)
        except Exception:
            logger.exception("Failed to store analysis for %s", m["symbol"])

    analyzed = len(all_scored)
    failed = len(results) - analyzed
    active_markets = sum(1 for m in non_stocks if m.get("is_active"))
    active_stocks = sum(1 for m in stocks if m.get("is_active"))
    logger.info(
        "Weekly analysis complete: %d/%d symbols, %d markets active, %d stocks active",
        analyzed,
        len(symbols),
        active_markets,
        active_stocks,
    )
    return results
