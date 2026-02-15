from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.config import settings
from app.database import get_pool
from app.schemas.market import MarketConfigResponse, MaxActiveRequest, MaxActiveResponse, OverrideRequest

router = APIRouter(tags=["config"])


def _current_week_start() -> date:
    """Return the Monday of the current trading week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


# ─── Max active markets (must be defined BEFORE /config/{symbol}) ─────────────


@router.get("/config/max-active-markets", response_model=MaxActiveResponse)
async def get_max_active():
    """Return the current max active markets setting."""
    week_start = _current_week_start()
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM weekly_analysis WHERE week_start = $1 AND is_active = true",
            week_start,
        )
    return MaxActiveResponse(max_active=settings.max_active_markets, active_count=count or 0)


@router.put("/config/max-active-markets", response_model=MaxActiveResponse)
async def set_max_active(
    body: MaxActiveRequest,
    api_key: str = Depends(require_api_key),
):
    """Update max active markets and re-rank current week."""
    settings.max_active_markets = body.max_active
    week_start = _current_week_start()
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Fetch all scored markets for the current week, ordered by rank
        rows = await conn.fetch(
            """
            SELECT symbol, final_score, rank, is_manually_overridden
            FROM weekly_analysis
            WHERE week_start = $1 AND final_score IS NOT NULL
            ORDER BY final_score DESC NULLS LAST
            """,
            week_start,
        )

        # Re-activate: top N that meet min score, respecting manual overrides
        min_score = settings.min_final_score
        for rank_idx, row in enumerate(rows):
            if row["is_manually_overridden"]:
                continue
            should_be_active = (rank_idx < body.max_active) and (row["final_score"] >= min_score)
            await conn.execute(
                """
                UPDATE weekly_analysis
                SET is_active = $1
                WHERE symbol = $2 AND week_start = $3
                """,
                should_be_active,
                row["symbol"],
                week_start,
            )

        count = await conn.fetchval(
            "SELECT COUNT(*) FROM weekly_analysis WHERE week_start = $1 AND is_active = true",
            week_start,
        )

    return MaxActiveResponse(max_active=body.max_active, active_count=count or 0)


# ─── Per-symbol config ────────────────────────────────────────────────────────


@router.get("/config/{symbol}", response_model=MarketConfigResponse)
async def get_config(symbol: str):
    """Return trading configuration for a symbol. Called by EA daily."""
    week_start = _current_week_start()
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Verify symbol exists
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        row = await conn.fetchrow(
            """
            SELECT is_active, opt_entry_hour, opt_entry_minute,
                   opt_sl_percent, opt_tp_percent
            FROM weekly_analysis
            WHERE symbol = $1 AND week_start = $2
            """,
            symbol,
            week_start,
        )

    if row is None:
        # No analysis yet — return inactive with defaults
        return MarketConfigResponse(
            symbol=symbol,
            active=False,
            entry_hour=0,
            entry_minute=0,
            sl_percent=0.0,
            tp_percent=0.0,
            week_start=str(week_start),
        )

    return MarketConfigResponse(
        symbol=symbol,
        active=row["is_active"],
        entry_hour=row["opt_entry_hour"] or 0,
        entry_minute=row["opt_entry_minute"] or 0,
        sl_percent=row["opt_sl_percent"] or 0.0,
        tp_percent=row["opt_tp_percent"] or 0.0,
        week_start=str(week_start),
    )


@router.post("/override/{symbol}", response_model=MarketConfigResponse)
async def override_market(
    symbol: str,
    body: OverrideRequest,
    api_key: str = Depends(require_api_key),
):
    """Manually override a market's active status. Requires API key."""
    week_start = _current_week_start()
    pool = await get_pool()

    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        if body.active is None:
            # Clear override — revert to automatic
            await conn.execute(
                """
                UPDATE weekly_analysis
                SET is_manually_overridden = false
                WHERE symbol = $1 AND week_start = $2
                """,
                symbol,
                week_start,
            )
        else:
            # Set manual override
            # Upsert: create row if analysis hasn't run yet
            await conn.execute(
                """
                INSERT INTO weekly_analysis (symbol, week_start, is_active, is_manually_overridden)
                VALUES ($1, $2, $3, true)
                ON CONFLICT (symbol, week_start)
                DO UPDATE SET
                    is_active = $3,
                    is_manually_overridden = true
                """,
                symbol,
                week_start,
                body.active,
            )

        # Fetch updated config
        row = await conn.fetchrow(
            """
            SELECT is_active, opt_entry_hour, opt_entry_minute,
                   opt_sl_percent, opt_tp_percent
            FROM weekly_analysis
            WHERE symbol = $1 AND week_start = $2
            """,
            symbol,
            week_start,
        )

    if row is None:
        return MarketConfigResponse(
            symbol=symbol,
            active=False,
            entry_hour=0,
            entry_minute=0,
            sl_percent=0.0,
            tp_percent=0.0,
            week_start=str(week_start),
        )

    return MarketConfigResponse(
        symbol=symbol,
        active=row["is_active"],
        entry_hour=row["opt_entry_hour"] or 0,
        entry_minute=row["opt_entry_minute"] or 0,
        sl_percent=row["opt_sl_percent"] or 0.0,
        tp_percent=row["opt_tp_percent"] or 0.0,
        week_start=str(week_start),
    )
