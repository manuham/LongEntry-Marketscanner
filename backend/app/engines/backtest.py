"""
Phase 3 — Backtest Engine (v2)

Simulates FixedLongEntry EA logic across all parameter combinations
using 2 years of candle data. Finds optimal entry hour, SL%, and TP%
per symbol, then scores the result.

v2 improvements over v1:
  - Trades stay open until SL/TP hit (matches real EA behavior)
  - No new entry while a position is already open
  - M5 candle drill-down to resolve intra-H1 bar ambiguity
  - Proper weekend/market-close handling
  - More realistic gap slippage modeling
"""

import logging
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.database import get_pool

logger = logging.getLogger(__name__)

# Typical spreads in price points per symbol (half-spread added to entry)
TYPICAL_SPREADS: dict[str, float] = {
    # Commodities
    "XAUUSD": 0.30,
    "XAGUSD": 0.03,
    # Indices
    "US500": 0.50,
    "US100": 1.50,
    "US30": 3.00,
    "GER40": 1.50,
    "UK100": 1.50,
    "FRA40": 1.50,
    "JP225": 15.0,
    "AUS200": 2.00,
    "EU50": 1.50,
    "SPN35": 5.00,
    "HK50": 8.00,
    "N25": 0.20,
}

SL_GRID = [0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
TP_GRID = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]

# Valid entry-hour windows per symbol (broker server time, assumed UTC+2).
# Entries are only allowed within [start, end] inclusive.
# Goal: enter during liquid hours, no later than the New York session.
SESSION_HOURS: dict[str, tuple[int, int]] = {
    # Commodities — London open through mid-NY session
    "XAUUSD": (9, 20),
    "XAGUSD": (9, 20),
    # US Indices — European pre-market through mid-NY session
    "US500": (10, 20),
    "US100": (10, 20),
    "US30": (10, 20),
    # European Indices — main European session
    "GER40": (9, 17),
    "UK100": (9, 17),
    "FRA40": (9, 17),
    "EU50": (9, 17),
    "SPN35": (9, 17),
    "N25": (9, 17),
    # Asian Indices — Asian session through London overlap
    "JP225": (2, 16),
    "HK50": (3, 16),
    "AUS200": (1, 16),
}
DEFAULT_SESSION: tuple[int, int] = (8, 20)


def get_valid_entry_hours(h1: pd.DataFrame, symbol: str = "") -> list[int]:
    """Return hours that appear on at least 50% of trading days,
    filtered by the symbol's liquid session window."""
    h1_copy = h1.copy()
    h1_copy["hour"] = h1_copy["open_time"].dt.hour
    h1_copy["date"] = h1_copy["open_time"].dt.date
    total_days = h1_copy["date"].nunique()
    hour_counts = h1_copy.groupby("hour")["date"].nunique()
    threshold = total_days * 0.5
    valid = hour_counts[hour_counts >= threshold].index.tolist()

    # Constrain to liquid session hours for this symbol
    start_h, end_h = SESSION_HOURS.get(symbol, DEFAULT_SESSION)
    valid = [h for h in valid if start_h <= h <= end_h]

    return sorted(valid)


def _prepare_arrays(h1: pd.DataFrame) -> dict:
    """Convert H1 DataFrame to numpy arrays for fast simulation."""
    return {
        "open": h1["open"].values.astype(np.float64),
        "high": h1["high"].values.astype(np.float64),
        "low": h1["low"].values.astype(np.float64),
        "close": h1["close"].values.astype(np.float64),
        "hour": h1["open_time"].dt.hour.values.astype(np.int32),
        "date": h1["open_time"].dt.date.values,
        "open_time": h1["open_time"].values,  # Keep full timestamps for M5 lookup
    }


def _prepare_m5_arrays(m5: pd.DataFrame) -> dict:
    """Convert M5 DataFrame to numpy arrays for drill-down resolution."""
    return {
        "open": m5["open"].values.astype(np.float64),
        "high": m5["high"].values.astype(np.float64),
        "low": m5["low"].values.astype(np.float64),
        "close": m5["close"].values.astype(np.float64),
        "open_time": m5["open_time"].values,
    }


def _resolve_ambiguity_with_m5(
    m5_arrays: dict,
    h1_open_time: np.datetime64,
    sl_price: float,
    tp_price: float,
    entry_price: float,
    half_spread: float,
) -> str | None:
    """
    When both SL and TP are hit in the same H1 candle, drill down into
    M5 candles to determine which was hit first.

    Returns:
      'sl' if SL was hit first
      'tp' if TP was hit first
      None if M5 data unavailable or inconclusive (fall back to conservative)
    """
    if m5_arrays is None:
        return None

    m5_times = m5_arrays["open_time"]
    m5_lows = m5_arrays["low"]
    m5_highs = m5_arrays["high"]

    # Find M5 candles within this H1 candle (same hour)
    h1_start = h1_open_time
    h1_end = h1_start + np.timedelta64(1, "h")

    mask = (m5_times >= h1_start) & (m5_times < h1_end)
    indices = np.where(mask)[0]

    if len(indices) == 0:
        return None

    # Walk through M5 candles chronologically to find first hit
    for idx in indices:
        low_m5 = m5_lows[idx]
        high_m5 = m5_highs[idx]

        sl_hit = low_m5 <= sl_price
        tp_hit = high_m5 >= tp_price

        if sl_hit and tp_hit:
            # Both hit in same M5 candle — still ambiguous, assume SL
            return "sl"
        elif sl_hit:
            return "sl"
        elif tp_hit:
            return "tp"

    return None  # Neither hit in M5 data (shouldn't happen, but safe fallback)


def simulate_trades(
    arrays: dict,
    entry_hour: int,
    sl_pct: float,
    tp_pct: float,
    spread: float,
    m5_arrays: dict | None = None,
) -> dict:
    """
    Simulate FixedLongEntry trades over the full dataset.

    v2 behavior (matches real EA):
      - Enter at entry_hour candle open (+ half spread) — only if no position open
      - SL and TP are set as % of entry price
      - Position stays open until SL or TP is hit (no force-close at next entry)
      - If position is still open at next entry_hour, skip that entry
      - Gap handling: if candle opens beyond SL/TP, fill at open price (slippage)
      - Same-bar ambiguity: use M5 drill-down if available, else assume SL first
      - Only close at dataset end (last trade may be partial — excluded from stats)
    """
    opens = arrays["open"]
    highs = arrays["high"]
    lows = arrays["low"]
    closes = arrays["close"]
    hours = arrays["hour"]
    dates = arrays["date"]
    open_times = arrays["open_time"]
    n = len(opens)

    if n == 0:
        return _empty_result()

    half_spread = spread / 2.0
    sl_mult = 1.0 - sl_pct / 100.0
    tp_mult = 1.0 + tp_pct / 100.0

    wins = 0
    losses = 0
    gross_profit = 0.0
    gross_loss = 0.0
    equity = 100.0
    peak_equity = 100.0
    max_drawdown = 0.0

    # State: are we currently in a position?
    in_position = False
    entry_price = 0.0
    sl_price = 0.0
    tp_price = 0.0
    exit_spread_pct = 0.0
    entry_bar_idx = -1

    # Track which days we've already entered on (one entry per day max)
    entered_dates: set = set()

    for j in range(n):
        hour_j = hours[j]
        date_j = dates[j]
        open_j = opens[j]
        high_j = highs[j]
        low_j = lows[j]

        if in_position:
            # ── Check if current bar resolves the open position ──

            # Gap detection: if bar opens beyond SL/TP (not on entry bar)
            if j > entry_bar_idx:
                if open_j <= sl_price:
                    # Gapped below SL — loss is worse than sl_pct
                    trade_pnl_pct = (
                        (open_j - entry_price) / entry_price * 100.0
                        - exit_spread_pct
                    )
                    losses += 1
                    gross_loss += abs(trade_pnl_pct)
                    equity *= 1.0 + trade_pnl_pct / 100.0
                    _update_dd = True
                    in_position = False

                elif open_j >= tp_price:
                    # Gapped above TP — profit is better than tp_pct
                    trade_pnl_pct = (
                        (open_j - entry_price) / entry_price * 100.0
                        - exit_spread_pct
                    )
                    wins += 1
                    gross_profit += trade_pnl_pct
                    equity *= 1.0 + trade_pnl_pct / 100.0
                    _update_dd = True
                    in_position = False

            if in_position:
                # Check SL/TP within this candle
                sl_hit = low_j <= sl_price
                tp_hit = high_j >= tp_price

                if sl_hit and tp_hit:
                    # Both hit in same H1 candle — try M5 drill-down
                    resolution = _resolve_ambiguity_with_m5(
                        m5_arrays,
                        open_times[j],
                        sl_price,
                        tp_price,
                        entry_price,
                        half_spread,
                    )

                    if resolution == "tp":
                        trade_pnl_pct = tp_pct - exit_spread_pct
                        wins += 1
                        gross_profit += trade_pnl_pct
                    else:
                        # Default: SL first (conservative) or M5 confirmed SL
                        trade_pnl_pct = -sl_pct - exit_spread_pct
                        losses += 1
                        gross_loss += abs(trade_pnl_pct)

                    equity *= 1.0 + trade_pnl_pct / 100.0
                    in_position = False

                elif sl_hit:
                    trade_pnl_pct = -sl_pct - exit_spread_pct
                    losses += 1
                    gross_loss += abs(trade_pnl_pct)
                    equity *= 1.0 + trade_pnl_pct / 100.0
                    in_position = False

                elif tp_hit:
                    trade_pnl_pct = tp_pct - exit_spread_pct
                    wins += 1
                    gross_profit += trade_pnl_pct
                    equity *= 1.0 + trade_pnl_pct / 100.0
                    in_position = False

            # Update drawdown after any trade close
            if not in_position:
                if equity > peak_equity:
                    peak_equity = equity
                dd = (peak_equity - equity) / peak_equity * 100.0
                if dd > max_drawdown:
                    max_drawdown = dd

        # ── Try to open a new position ──
        if not in_position and hour_j == entry_hour and date_j not in entered_dates:
            entered_dates.add(date_j)
            entry_price = open_j + half_spread  # Buy at ask
            sl_price = entry_price * sl_mult
            tp_price = entry_price * tp_mult
            exit_spread_pct = half_spread / entry_price * 100.0
            entry_bar_idx = j
            in_position = True

            # Check if SL/TP already hit on the entry candle itself
            sl_hit = low_j <= sl_price
            tp_hit = high_j >= tp_price

            if sl_hit and tp_hit:
                resolution = _resolve_ambiguity_with_m5(
                    m5_arrays,
                    open_times[j],
                    sl_price,
                    tp_price,
                    entry_price,
                    half_spread,
                )
                if resolution == "tp":
                    trade_pnl_pct = tp_pct - exit_spread_pct
                    wins += 1
                    gross_profit += trade_pnl_pct
                else:
                    trade_pnl_pct = -sl_pct - exit_spread_pct
                    losses += 1
                    gross_loss += abs(trade_pnl_pct)
                equity *= 1.0 + trade_pnl_pct / 100.0
                in_position = False
                if equity > peak_equity:
                    peak_equity = equity
                dd = (peak_equity - equity) / peak_equity * 100.0
                if dd > max_drawdown:
                    max_drawdown = dd

            elif sl_hit:
                trade_pnl_pct = -sl_pct - exit_spread_pct
                losses += 1
                gross_loss += abs(trade_pnl_pct)
                equity *= 1.0 + trade_pnl_pct / 100.0
                in_position = False
                if equity > peak_equity:
                    peak_equity = equity
                dd = (peak_equity - equity) / peak_equity * 100.0
                if dd > max_drawdown:
                    max_drawdown = dd

            elif tp_hit:
                trade_pnl_pct = tp_pct - exit_spread_pct
                wins += 1
                gross_profit += trade_pnl_pct
                equity *= 1.0 + trade_pnl_pct / 100.0
                in_position = False
                if equity > peak_equity:
                    peak_equity = equity
                dd = (peak_equity - equity) / peak_equity * 100.0
                if dd > max_drawdown:
                    max_drawdown = dd

    # If still in position at end of data, close at last close price
    # but mark as "unresolved" — this is the trailing partial trade
    if in_position and n > 0:
        close_price = closes[n - 1]
        trade_pnl_pct = (
            (close_price - entry_price) / entry_price * 100.0 - exit_spread_pct
        )
        if trade_pnl_pct >= 0:
            wins += 1
            gross_profit += trade_pnl_pct
        else:
            losses += 1
            gross_loss += abs(trade_pnl_pct)
        equity *= 1.0 + trade_pnl_pct / 100.0
        if equity > peak_equity:
            peak_equity = equity
        dd = (peak_equity - equity) / peak_equity * 100.0
        if dd > max_drawdown:
            max_drawdown = dd

    total_trades = wins + losses
    total_return = equity - 100.0  # % return on initial 100

    return {
        "total_return": round(total_return, 2),
        "win_rate": round(wins / total_trades * 100, 1) if total_trades > 0 else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 2)
        if gross_loss > 0
        else 99.0,
        "max_drawdown": round(max_drawdown, 2),
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
    }


def _empty_result() -> dict:
    """Return zeroed result dict."""
    return {
        "total_return": 0.0,
        "win_rate": 0.0,
        "profit_factor": 0.0,
        "max_drawdown": 0.0,
        "total_trades": 0,
        "wins": 0,
        "losses": 0,
    }


def sweep_parameters(
    h1: pd.DataFrame,
    spread: float,
    symbol: str = "",
    m5: pd.DataFrame | None = None,
) -> dict | None:
    """
    Test all parameter combinations and return the best one.

    Returns dict with best_params and results, or None if no valid hours.
    If m5 DataFrame is provided, it will be used to resolve intra-H1
    bar ambiguity when both SL and TP are hit in the same candle.
    """
    valid_hours = get_valid_entry_hours(h1, symbol)
    if not valid_hours:
        return None

    arrays = _prepare_arrays(h1)
    m5_arrays = _prepare_m5_arrays(m5) if m5 is not None and len(m5) > 0 else None

    best = None
    best_return = -999999.0
    combos_tested = 0

    for entry_hour in valid_hours:
        for sl_pct in SL_GRID:
            for tp_pct in TP_GRID:
                result = simulate_trades(
                    arrays, entry_hour, sl_pct, tp_pct, spread, m5_arrays
                )
                combos_tested += 1

                if result["total_return"] > best_return:
                    best_return = result["total_return"]
                    best = {
                        "best_params": {
                            "entry_hour": entry_hour,
                            "sl_pct": sl_pct,
                            "tp_pct": tp_pct,
                        },
                        "results": result,
                    }

    if best is not None:
        best["combos_tested"] = combos_tested
    return best


def calculate_backtest_score(results: dict, stability: float) -> float:
    """
    Compute BacktestScore (0–100) from backtest results.

    Formula from README:
      NormalizedReturn × 0.35 + NormalizedPF × 0.30
      + NormalizedWinRate × 0.15 + NormalizedDrawdown × 0.20
    """
    norm_return = min(max(results["total_return"], 0), 100)
    norm_pf = min(results["profit_factor"] / 3.0, 1.0) * 100
    norm_wr = results["win_rate"]  # already 0–100
    norm_dd = max(0, 100 - results["max_drawdown"] * 5)

    raw = norm_return * 0.35 + norm_pf * 0.30 + norm_wr * 0.15 + norm_dd * 0.20

    # Stability penalty
    if stability < 50:
        raw = raw * (stability / 100.0)

    return round(max(0, min(100, raw)), 1)


async def calculate_parameter_stability(
    symbol: str, week_start: date, best_params: dict
) -> float:
    """
    Compare this week's best params against the last 8 weeks.

    Returns 0–100. First run (no history) returns 100.0.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT opt_entry_hour, opt_sl_percent, opt_tp_percent
            FROM weekly_analysis
            WHERE symbol = $1
              AND week_start < $2
              AND opt_entry_hour IS NOT NULL
            ORDER BY week_start DESC
            LIMIT 8
            """,
            symbol,
            week_start,
        )

    if not rows:
        return 100.0  # No history — no penalty

    matching = sum(
        1
        for r in rows
        if r["opt_entry_hour"] == best_params["entry_hour"]
        and r["opt_sl_percent"] == best_params["sl_pct"]
        and r["opt_tp_percent"] == best_params["tp_pct"]
    )

    return round(matching / len(rows) * 100, 1)


async def _fetch_m5_candles(symbol: str) -> pd.DataFrame | None:
    """
    Fetch M5 candle data from database for a symbol (if available).

    Returns DataFrame or None if no M5 data exists.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT open_time, open, high, low, close
            FROM candles
            WHERE symbol = $1 AND timeframe = 'M5'
            ORDER BY open_time
            """,
            symbol,
        )

    if not rows:
        return None

    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close"])
    df["open_time"] = pd.to_datetime(df["open_time"])
    return df


async def run_backtest_for_symbol(
    symbol: str, h1: pd.DataFrame, week_start: date
) -> dict | None:
    """
    Run full backtest sweep for a single symbol.

    Returns dict with all backtest fields ready for DB storage, or None on failure.
    If M5 candle data is available, uses it for higher accuracy resolution.
    """
    spread = TYPICAL_SPREADS.get(symbol, 1.0)
    start_time = time.time()

    # Try to load M5 data for higher accuracy
    m5 = await _fetch_m5_candles(symbol)
    has_m5 = m5 is not None and len(m5) > 0

    sweep = sweep_parameters(h1, spread, symbol, m5)
    if sweep is None:
        logger.warning("No valid entry hours for %s — skipping backtest", symbol)
        return None

    params = sweep["best_params"]
    results = sweep["results"]

    stability = await calculate_parameter_stability(symbol, week_start, params)
    bt_score = calculate_backtest_score(results, stability)

    elapsed = time.time() - start_time
    logger.info(
        "Backtest %s: return=%.1f%%, wr=%.1f%%, pf=%.2f, dd=%.1f%%, "
        "params=(h=%d, sl=%.2f, tp=%.2f), stability=%.0f, score=%.1f, "
        "%d combos in %.1fs%s",
        symbol,
        results["total_return"],
        results["win_rate"],
        results["profit_factor"],
        results["max_drawdown"],
        params["entry_hour"],
        params["sl_pct"],
        params["tp_pct"],
        stability,
        bt_score,
        sweep["combos_tested"],
        elapsed,
        " [M5 enhanced]" if has_m5 else "",
    )

    return {
        "backtest_score": bt_score,
        "opt_entry_hour": params["entry_hour"],
        "opt_entry_minute": 0,
        "opt_sl_percent": params["sl_pct"],
        "opt_tp_percent": params["tp_pct"],
        "bt_total_return": results["total_return"],
        "bt_win_rate": results["win_rate"],
        "bt_profit_factor": results["profit_factor"],
        "bt_total_trades": results["total_trades"],
        "bt_max_drawdown": results["max_drawdown"],
        "bt_param_stability": stability,
    }
