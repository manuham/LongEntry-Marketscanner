import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.config import settings
from app.database import get_pool
from app.schemas.market import (
    ApplyRankingResponse,
    MarketConfigResponse,
    MaxActiveRequest,
    MaxActiveResponse,
    OverrideRequest,
)

router = APIRouter(tags=["config"])
logger = logging.getLogger(__name__)


def _current_week_start() -> date:
    """Return the Monday of the current trading week."""
    today = date.today()
    return today - timedelta(days=today.weekday())


async def _effective_week_start(pool) -> date:
    """Return the most recent week that has scored analysis data.

    This prevents week-boundary bugs where overrides or ranking changes
    happen before the weekly analysis has run for the new week.
    Falls back to the current week start if no analysis data exists.
    """
    async with pool.acquire() as conn:
        week = await conn.fetchval(
            "SELECT DISTINCT week_start FROM weekly_analysis "
            "WHERE final_score IS NOT NULL "
            "ORDER BY week_start DESC LIMIT 1"
        )
    return week or _current_week_start()


# ─── Max active markets (must be defined BEFORE /config/{symbol}) ─────────────


@router.get("/config/max-active-markets", response_model=MaxActiveResponse)
async def get_max_active():
    """Return the current max active markets setting."""
    pool = await get_pool()
    week_start = await _effective_week_start(pool)
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
    """Update max active markets and re-rank."""
    settings.max_active_markets = body.max_active
    pool = await get_pool()
    count = await _apply_ranking(pool, body.max_active)
    return MaxActiveResponse(max_active=body.max_active, active_count=count)


async def _apply_ranking(pool, max_active: int) -> int:
    """Apply ranking: activate top N non-overridden markets.

    Manually overridden markets keep their state. The remaining auto
    slots are filled by top-ranked markets that meet the minimum score.
    Returns the total active count.
    """
    week_start = await _effective_week_start(pool)
    min_score = settings.min_final_score

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT symbol, final_score, rank, is_manually_overridden, is_active
            FROM weekly_analysis
            WHERE week_start = $1 AND final_score IS NOT NULL
            ORDER BY final_score DESC NULLS LAST
            """,
            week_start,
        )

        # Count how many manually-overridden markets are active
        manual_active = sum(
            1 for r in rows
            if r["is_manually_overridden"] and r["is_active"]
        )

        # Auto slots = max_active minus manually activated markets
        auto_slots = max(0, max_active - manual_active)
        auto_idx = 0

        for row in rows:
            if row["is_manually_overridden"]:
                continue
            should_be_active = (auto_idx < auto_slots) and (row["final_score"] >= min_score)
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
            auto_idx += 1

        count = await conn.fetchval(
            "SELECT COUNT(*) FROM weekly_analysis WHERE week_start = $1 AND is_active = true",
            week_start,
        )

    return count or 0


@router.post("/config/apply-ranking", response_model=ApplyRankingResponse)
async def apply_ranking(api_key: str = Depends(require_api_key)):
    """Re-apply ranking using current max_active setting.

    Activates the top N markets by score while preserving manual overrides.
    Use this after changing max_active or to ensure the correct markets are active.
    """
    pool = await get_pool()
    max_active = settings.max_active_markets
    count = await _apply_ranking(pool, max_active)
    logger.info("Applied ranking: max_active=%d, active_count=%d", max_active, count)
    return ApplyRankingResponse(
        max_active=max_active,
        active_count=count,
        applied=True,
    )


# ─── Per-symbol config ────────────────────────────────────────────────────────


@router.get("/config/{symbol}", response_model=MarketConfigResponse)
async def get_config(symbol: str):
    """Return trading configuration for a symbol. Called by EA frequently."""
    pool = await get_pool()
    week_start = await _effective_week_start(pool)

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
    """Manually override a market's active status.

    Uses the effective analysis week so overrides apply to the same
    week as the existing scored data (prevents week-boundary bugs).
    """
    pool = await get_pool()
    week_start = await _effective_week_start(pool)

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
            # Re-apply ranking so this market gets auto-ranked again
            await _apply_ranking(pool, settings.max_active_markets)
        else:
            # Set manual override on the effective week's row
            await conn.execute(
                """
                UPDATE weekly_analysis
                SET is_active = $1, is_manually_overridden = true
                WHERE symbol = $2 AND week_start = $3
                """,
                body.active,
                symbol,
                week_start,
            )
            logger.info(
                "Manual override: %s set to %s (week %s)",
                symbol, "active" if body.active else "inactive", week_start,
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
