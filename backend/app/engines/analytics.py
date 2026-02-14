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
    """Average True Range over N days."""
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
    atr = tr.rolling(window=period).mean()
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
    # Positive = bullish, normalize roughly -5% to +5% → 0-100
    momentum = (m1w * 0.4 + m1m * 0.6)
    scores["momentum"] = max(0, min(100, 50 + momentum * 10))

    # 6. Volatility Score: moderate ATR preferred
    atr = metrics.get("atr_14")
    current = metrics.get("current_price")
    if atr is not None and current is not None and current > 0:
        atr_pct = atr / current * 100  # ATR as % of price
        # Sweet spot: 0.5%-2.0% daily ATR
        if 0.5 <= atr_pct <= 2.0:
            scores["volatility"] = 100 - abs(atr_pct - 1.25) / 0.75 * 30
        elif atr_pct < 0.5:
            scores["volatility"] = atr_pct / 0.5 * 70
        else:
            scores["volatility"] = max(0, 100 - (atr_pct - 2.0) * 25)
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
                 backtest_score, opt_entry_hour, opt_entry_minute,
                 opt_sl_percent, opt_tp_percent,
                 bt_total_return, bt_win_rate, bt_profit_factor,
                 bt_total_trades, bt_max_drawdown, bt_param_stability,
                 final_score, rank, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                    $20, $21, $22)
            ON CONFLICT (symbol, week_start)
            DO UPDATE SET
                technical_score = EXCLUDED.technical_score,
                avg_daily_growth = EXCLUDED.avg_daily_growth,
                avg_daily_loss = EXCLUDED.avg_daily_loss,
                most_bullish_day = EXCLUDED.most_bullish_day,
                most_bearish_day = EXCLUDED.most_bearish_day,
                up_day_win_rate = EXCLUDED.up_day_win_rate,
                backtest_score = EXCLUDED.backtest_score,
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
                END
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
        )


def get_current_week_start() -> date:
    """Return the Monday of the current trading week."""
    today = date.today()
    # Monday = 0, Sunday = 6
    return today - timedelta(days=today.weekday())


async def run_full_analysis() -> list[dict]:
    """
    Run analytics + backtest for all 14 markets.
    Called by the Saturday cron job.
    Returns list of results.
    """
    week_start = get_current_week_start()
    logger.info("Starting weekly analysis for week of %s", week_start)

    pool = await get_pool()
    async with pool.acquire() as conn:
        symbols = await conn.fetch(
            "SELECT symbol FROM markets WHERE is_in_universe = true ORDER BY symbol"
        )

    # Phase 1: Technical analysis + backtest for each symbol
    results = []
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
                # FinalScore = Technical×0.50 + Backtest×0.35 (Fundamental=0 for now)
                metrics["final_score"] = round(
                    metrics["technical_score"] * 0.50 + bt["backtest_score"] * 0.35,
                    1,
                )
            else:
                # No backtest — use technical score only
                metrics["final_score"] = round(metrics["technical_score"] * 0.50, 1)

            results.append(metrics)
            logger.info(
                "Analyzed %s: tech=%.1f, bt=%.1f, final=%.1f",
                symbol,
                metrics["technical_score"],
                metrics.get("backtest_score", 0),
                metrics["final_score"],
            )
        except Exception:
            logger.exception("Failed to analyze %s", symbol)
            results.append({"symbol": symbol, "error": "Analysis failed"})

    # Phase 2: Rank by final_score and activate top N
    scored = [r for r in results if "error" not in r and "final_score" in r]
    scored.sort(key=lambda r: r["final_score"], reverse=True)

    max_active = settings.max_active_markets
    min_score = settings.min_final_score

    for rank_idx, m in enumerate(scored):
        m["rank"] = rank_idx + 1
        m["is_active"] = (rank_idx < max_active) and (m["final_score"] >= min_score)

    # Phase 3: Store all results
    for m in scored:
        try:
            await store_analysis(m)
        except Exception:
            logger.exception("Failed to store analysis for %s", m["symbol"])

    analyzed = len(scored)
    failed = len(results) - analyzed
    logger.info(
        "Weekly analysis complete: %d/%d symbols, %d active",
        analyzed,
        len(symbols),
        sum(1 for m in scored if m.get("is_active")),
    )
    return results
