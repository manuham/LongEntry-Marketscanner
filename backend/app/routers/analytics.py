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


@router.get("/analytics", response_model=list[AnalysisSummary])
async def list_analytics():
    """Return latest weekly analysis for all markets (for dashboard overview)."""
    week_start = get_current_week_start()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT symbol, week_start, technical_score,
                   avg_daily_growth, avg_daily_loss,
                   most_bullish_day, most_bearish_day, up_day_win_rate
            FROM weekly_analysis
            WHERE week_start = $1
            ORDER BY technical_score DESC NULLS LAST
            """,
            week_start,
        )

    # If no results for current week, try the most recent week
    if not rows:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (symbol)
                    symbol, week_start, technical_score,
                    avg_daily_growth, avg_daily_loss,
                    most_bullish_day, most_bearish_day, up_day_win_rate
                FROM weekly_analysis
                ORDER BY symbol, week_start DESC
                """
            )

    return [
        AnalysisSummary(
            symbol=r["symbol"],
            week_start=r["week_start"],
            technical_score=r["technical_score"],
            avg_daily_growth=r["avg_daily_growth"],
            avg_daily_loss=r["avg_daily_loss"],
            most_bullish_day=r["most_bullish_day"],
            most_bearish_day=r["most_bearish_day"],
            up_day_win_rate=r["up_day_win_rate"],
        )
        for r in rows
    ]


@router.get("/analytics/{symbol}", response_model=SymbolAnalytics)
async def get_symbol_analytics(symbol: str):
    """
    Return full analytics for a single symbol.
    Computes live from candle data (not just stored weekly_analysis).
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
