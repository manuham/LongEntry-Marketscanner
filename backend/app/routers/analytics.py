import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.database import get_pool
from app.engines.analytics import (
    analyze_symbol,
    get_current_week_start,
    run_full_analysis,
    store_analysis,
)
from app.schemas.analytics import AnalysisSummary, RunAnalysisResponse, SymbolAnalytics

router = APIRouter(tags=["analytics"])
logger = logging.getLogger(__name__)


_ANALYSIS_COLS = """
    symbol, week_start, technical_score,
    avg_daily_growth, avg_daily_loss,
    most_bullish_day, most_bearish_day, up_day_win_rate,
    backtest_score, fundamental_score,
    final_score, rank, is_active, is_manually_overridden,
    opt_entry_hour, opt_sl_percent, opt_tp_percent,
    bt_total_return, bt_win_rate, bt_profit_factor,
    bt_total_trades, bt_max_drawdown, bt_param_stability
"""


def _row_to_summary(r) -> AnalysisSummary:
    return AnalysisSummary(
        symbol=r["symbol"],
        week_start=r["week_start"],
        technical_score=r["technical_score"],
        avg_daily_growth=r["avg_daily_growth"],
        avg_daily_loss=r["avg_daily_loss"],
        most_bullish_day=r["most_bullish_day"],
        most_bearish_day=r["most_bearish_day"],
        up_day_win_rate=r["up_day_win_rate"],
        backtest_score=r["backtest_score"],
        fundamental_score=r["fundamental_score"],
        final_score=r["final_score"],
        rank=r["rank"],
        is_active=r["is_active"] or False,
        is_manually_overridden=r["is_manually_overridden"] or False,
        opt_entry_hour=r["opt_entry_hour"],
        opt_sl_percent=r["opt_sl_percent"],
        opt_tp_percent=r["opt_tp_percent"],
        bt_total_return=r["bt_total_return"],
        bt_win_rate=r["bt_win_rate"],
        bt_profit_factor=r["bt_profit_factor"],
        bt_total_trades=r["bt_total_trades"],
        bt_max_drawdown=r["bt_max_drawdown"],
        bt_param_stability=r["bt_param_stability"],
    )


@router.get("/analytics", response_model=list[AnalysisSummary])
async def list_analytics():
    """Return latest weekly analysis for all markets (for dashboard overview).

    Uses DISTINCT ON to always return the most recent row per symbol,
    preventing gaps when the week changes but analysis hasn't run yet.
    """
    week_start = get_current_week_start()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {_ANALYSIS_COLS}
            FROM weekly_analysis
            WHERE week_start = $1
            ORDER BY final_score DESC NULLS LAST, technical_score DESC NULLS LAST
            """,
            week_start,
        )

    # If not all markets have data for this week, get most recent per symbol
    if len(rows) < 14:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT DISTINCT ON (symbol)
                    {_ANALYSIS_COLS}
                FROM weekly_analysis
                WHERE final_score IS NOT NULL
                ORDER BY symbol, week_start DESC
                """
            )

    return [_row_to_summary(r) for r in rows]


@router.get("/analytics/{symbol}", response_model=SymbolAnalytics)
async def get_symbol_analytics(symbol: str):
    """
    Return full analytics for a single symbol.
    Computes live technical metrics + merges stored backtest data.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM markets WHERE symbol = $1", symbol)
    if not exists:
        raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

    week_start = get_current_week_start()
    metrics = await analyze_symbol(symbol, week_start)
    if metrics is None:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data available for {symbol}",
        )

    # Merge stored backtest + fundamental data from weekly_analysis
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT backtest_score, fundamental_score,
                   final_score, rank, is_active,
                   is_manually_overridden,
                   opt_entry_hour, opt_sl_percent, opt_tp_percent,
                   bt_total_return, bt_win_rate, bt_profit_factor,
                   bt_total_trades, bt_max_drawdown, bt_param_stability
            FROM weekly_analysis
            WHERE symbol = $1 AND week_start = $2
            """,
            symbol,
            week_start,
        )

    if row:
        for key in row.keys():
            if row[key] is not None:
                metrics[key] = row[key]

    return SymbolAnalytics(**metrics)


@router.post("/analytics/run", response_model=RunAnalysisResponse)
async def trigger_analysis(api_key: str = Depends(require_api_key)):
    """
    Manually trigger analysis for all symbols.
    Requires API key. Used by cron job or for manual testing.
    """
    week_start = get_current_week_start()
    logger.info("Manual analysis triggered for week %s", week_start)

    results = await run_full_analysis()

    analyzed = sum(1 for r in results if "error" not in r)
    failed = sum(1 for r in results if "error" in r)

    return RunAnalysisResponse(
        week_start=week_start,
        analyzed=analyzed,
        failed=failed,
        results=results,
    )
