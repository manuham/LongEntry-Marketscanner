import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import get_pool
from app.schemas.results import (
    TradeResultResponse,
    TradeResultUpload,
    WeeklyResultSummary,
)

router = APIRouter(tags=["results"])
logger = logging.getLogger(__name__)


@router.post("/results", response_model=TradeResultResponse)
async def upload_result(payload: TradeResultUpload):
    """Upload trade results for a symbol/week. Auth via apiKey in body (MQL5)."""
    if not settings.verify_api_key(payload.api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check if this market was active that week
        was_active = await conn.fetchval(
            """
            SELECT is_active FROM weekly_analysis
            WHERE symbol = $1 AND week_start = $2
            """,
            payload.symbol,
            payload.week_start,
        )

        await conn.execute(
            """
            INSERT INTO weekly_results
                (symbol, week_start, was_active, trades_taken, wins, losses, total_pnl_percent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (symbol, week_start)
            DO UPDATE SET
                trades_taken = EXCLUDED.trades_taken,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                total_pnl_percent = EXCLUDED.total_pnl_percent,
                was_active = EXCLUDED.was_active
            """,
            payload.symbol,
            payload.week_start,
            was_active,
            payload.trades_taken,
            payload.wins,
            payload.losses,
            payload.total_pnl_percent,
        )

    logger.info(
        "Result for %s week %s: %d trades, %d W / %d L, PnL %.2f%%",
        payload.symbol, payload.week_start,
        payload.trades_taken, payload.wins, payload.losses,
        payload.total_pnl_percent,
    )
    return TradeResultResponse(
        symbol=payload.symbol,
        week_start=payload.week_start,
        trades_taken=payload.trades_taken,
        wins=payload.wins,
        losses=payload.losses,
        total_pnl_percent=payload.total_pnl_percent,
        was_active=was_active,
    )


@router.get("/results", response_model=list[WeeklyResultSummary])
async def list_results():
    """Return weekly result summaries, most recent first."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT symbol, week_start, was_active,
                   trades_taken, wins, losses, total_pnl_percent
            FROM weekly_results
            ORDER BY week_start DESC, symbol
            """
        )

    # Group by week
    weeks: dict = {}
    for r in rows:
        ws = r["week_start"]
        if ws not in weeks:
            weeks[ws] = []
        weeks[ws].append(TradeResultResponse(
            symbol=r["symbol"],
            week_start=r["week_start"],
            trades_taken=r["trades_taken"],
            wins=r["wins"],
            losses=r["losses"],
            total_pnl_percent=r["total_pnl_percent"],
            was_active=r["was_active"],
        ))

    summaries = []
    for ws in sorted(weeks, reverse=True):
        results = weeks[ws]
        summaries.append(WeeklyResultSummary(
            week_start=ws,
            total_trades=sum(r.trades_taken for r in results),
            total_wins=sum(r.wins for r in results),
            total_losses=sum(r.losses for r in results),
            total_pnl_percent=round(sum(r.total_pnl_percent for r in results), 2),
            active_markets=sum(1 for r in results if r.was_active),
            results=results,
        ))

    return summaries
