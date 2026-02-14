from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.database import get_pool
from app.schemas.market import MarketConfigResponse, OverrideRequest

router = APIRouter(tags=["config"])


def _current_week_start() -> date:
    """Return the Monday of the current trading week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


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
