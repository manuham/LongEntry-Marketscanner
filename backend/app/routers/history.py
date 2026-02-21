import logging
from datetime import date, timedelta

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.database import get_pool
from app.engines.analytics import fetch_candles
from app.engines.backtest import (
    SL_GRID,
    TP_GRID,
    TYPICAL_SPREADS,
    _prepare_arrays,
    get_valid_entry_hours,
    simulate_trades,
)
from app.schemas.history import (
    DrawdownInfo,
    HeatmapCell,
    HeatmapResponse,
    HourReturn,
    WeeklyScoreRecord,
)

router = APIRouter(tags=["history"])
logger = logging.getLogger(__name__)


@router.get("/analytics/history/{symbol}", response_model=list[WeeklyScoreRecord])
async def get_symbol_history(symbol: str, weeks: int = Query(default=52, le=200)):
    """Return weekly score history for a symbol, most recent first."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        rows = await conn.fetch(
            """
            SELECT symbol, week_start, technical_score, backtest_score,
                   fundamental_score, final_score, rank, is_active,
                   opt_entry_hour, opt_sl_percent, opt_tp_percent,
                   bt_total_return, bt_win_rate, bt_max_drawdown
            FROM weekly_analysis
            WHERE symbol = $1
            ORDER BY week_start DESC
            LIMIT $2
            """,
            symbol,
            weeks,
        )

    return [WeeklyScoreRecord(**dict(r)) for r in rows]


@router.get("/analytics/history", response_model=list[WeeklyScoreRecord])
async def get_all_history(weeks: int = Query(default=12, le=52)):
    """Return weekly score history for all symbols (last N weeks)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cutoff = date.today() - timedelta(weeks=weeks)
        rows = await conn.fetch(
            """
            SELECT symbol, week_start, technical_score, backtest_score,
                   fundamental_score, final_score, rank, is_active,
                   opt_entry_hour, opt_sl_percent, opt_tp_percent,
                   bt_total_return, bt_win_rate, bt_max_drawdown
            FROM weekly_analysis
            WHERE week_start >= $1
            ORDER BY week_start DESC, final_score DESC NULLS LAST
            """,
            cutoff,
        )

    return [WeeklyScoreRecord(**dict(r)) for r in rows]


@router.get("/backtest/heatmap/{symbol}", response_model=HeatmapResponse)
async def get_heatmap(symbol: str):
    """
    Run backtest grid for a symbol and return all SL/TP combination results.
    Uses the optimal entry hour from the latest weekly analysis, or finds one.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        # Try to get optimal entry hour from latest analysis
        opt_hour = await conn.fetchval(
            """
            SELECT opt_entry_hour FROM weekly_analysis
            WHERE symbol = $1 AND opt_entry_hour IS NOT NULL
            ORDER BY week_start DESC LIMIT 1
            """,
            symbol,
        )

    # Fetch candle data
    h1 = await fetch_candles(symbol)
    if h1.empty:
        raise HTTPException(
            status_code=404, detail=f"No candle data for {symbol}"
        )

    spread = TYPICAL_SPREADS.get(symbol, 1.0)
    arrays = _prepare_arrays(h1)
    valid_hours = get_valid_entry_hours(h1, symbol)

    if not valid_hours:
        raise HTTPException(
            status_code=404, detail=f"No valid entry hours for {symbol}"
        )

    # Use stored optimal hour, or find the best one
    if opt_hour is None or opt_hour not in valid_hours:
        opt_hour = valid_hours[len(valid_hours) // 2]

    # Build SL x TP heatmap grid at the optimal entry hour
    grid = []
    for sl_pct in SL_GRID:
        for tp_pct in TP_GRID:
            result = simulate_trades(arrays, opt_hour, sl_pct, tp_pct, spread)
            grid.append(
                HeatmapCell(
                    sl_pct=sl_pct,
                    tp_pct=tp_pct,
                    total_return=result["total_return"],
                    win_rate=result["win_rate"],
                    profit_factor=result["profit_factor"],
                    total_trades=result["total_trades"],
                )
            )

    # Build entry-hour returns (at median SL/TP)
    mid_sl = SL_GRID[len(SL_GRID) // 2]
    mid_tp = TP_GRID[len(TP_GRID) // 2]
    entry_hour_returns = []
    for hour in valid_hours:
        result = simulate_trades(arrays, hour, mid_sl, mid_tp, spread)
        entry_hour_returns.append(
            HourReturn(
                hour=hour,
                total_return=result["total_return"],
                win_rate=result["win_rate"],
            )
        )

    return HeatmapResponse(
        symbol=symbol,
        entry_hour=opt_hour,
        grid=grid,
        entry_hour_returns=entry_hour_returns,
    )


@router.get("/trades/drawdown", response_model=list[DrawdownInfo])
async def get_drawdown():
    """Return current-week drawdown/risk info for all active markets."""
    pool = await get_pool()
    # Get current week start (Monday)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    async with pool.acquire() as conn:
        # Get active markets
        active_rows = await conn.fetch(
            """
            SELECT DISTINCT ON (symbol) symbol, is_active
            FROM weekly_analysis
            ORDER BY symbol, week_start DESC
            """
        )

        active_map = {r["symbol"]: r["is_active"] or False for r in active_rows}

        # Get this week's trades per symbol
        trade_rows = await conn.fetch(
            """
            SELECT symbol, result, pnl_percent
            FROM trades
            WHERE week_start >= $1
            ORDER BY symbol
            """,
            week_start,
        )

        # Get open trades
        open_rows = await conn.fetch(
            """
            SELECT symbol, COUNT(*) as cnt
            FROM trades
            WHERE result = 'open'
            GROUP BY symbol
            """
        )

    open_map = {r["symbol"]: r["cnt"] for r in open_rows}

    # Aggregate by symbol
    by_symbol = {}
    for r in trade_rows:
        sym = r["symbol"]
        if sym not in by_symbol:
            by_symbol[sym] = {"pnl": 0.0, "trades": 0, "wins": 0, "losses": 0}
        by_symbol[sym]["trades"] += 1
        by_symbol[sym]["pnl"] += r["pnl_percent"] or 0
        if r["result"] == "win":
            by_symbol[sym]["wins"] += 1
        elif r["result"] == "loss":
            by_symbol[sym]["losses"] += 1

    result = []
    for sym, is_active in active_map.items():
        stats = by_symbol.get(sym, {"pnl": 0, "trades": 0, "wins": 0, "losses": 0})
        result.append(
            DrawdownInfo(
                symbol=sym,
                is_active=is_active,
                open_trades=open_map.get(sym, 0),
                week_pnl_percent=round(stats["pnl"], 2),
                week_trades=stats["trades"],
                week_wins=stats["wins"],
                week_losses=stats["losses"],
            )
        )

    return sorted(result, key=lambda x: (not x.is_active, x.symbol))
