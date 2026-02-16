import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.config import settings
from app.database import get_pool
from app.schemas.market import (
    ApplyRankingResponse,
    MarketConfigResponse,
    MaxActiveAllResponse,
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
    """Return the current max active markets (indices/commodities) setting."""
    pool = await get_pool()
    week_start = await _effective_week_start(pool)
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.is_active = true
              AND m.category != 'stock'
            """,
            week_start,
        )
    return MaxActiveResponse(max_active=settings.max_active_markets, active_count=count or 0)


@router.put("/config/max-active-markets", response_model=MaxActiveResponse)
async def set_max_active(
    body: MaxActiveRequest,
    api_key: str = Depends(require_api_key),
):
    """Update max active markets (indices/commodities) and re-rank."""
    settings.max_active_markets = body.max_active
    pool = await get_pool()
    count = await _apply_ranking_for_category(pool, body.max_active, is_stock=False)
    return MaxActiveResponse(max_active=body.max_active, active_count=count)


@router.get("/config/max-active-stocks", response_model=MaxActiveResponse)
async def get_max_active_stocks():
    """Return the current max active stocks setting."""
    pool = await get_pool()
    week_start = await _effective_week_start(pool)
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.is_active = true
              AND m.category = 'stock'
            """,
            week_start,
        )
    return MaxActiveResponse(max_active=settings.max_active_stocks, active_count=count or 0)


@router.put("/config/max-active-stocks", response_model=MaxActiveResponse)
async def set_max_active_stocks(
    body: MaxActiveRequest,
    api_key: str = Depends(require_api_key),
):
    """Update max active stocks and re-rank."""
    settings.max_active_stocks = body.max_active
    pool = await get_pool()
    count = await _apply_ranking_for_category(pool, body.max_active, is_stock=True)
    return MaxActiveResponse(max_active=body.max_active, active_count=count)


@router.get("/config/max-active-all", response_model=MaxActiveAllResponse)
async def get_max_active_all():
    """Return max active settings for both markets and stocks."""
    pool = await get_pool()
    week_start = await _effective_week_start(pool)
    async with pool.acquire() as conn:
        market_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.is_active = true
              AND m.category != 'stock'
            """,
            week_start,
        )
        stock_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.is_active = true
              AND m.category = 'stock'
            """,
            week_start,
        )
    return MaxActiveAllResponse(
        markets=MaxActiveResponse(
            max_active=settings.max_active_markets,
            active_count=market_count or 0,
        ),
        stocks=MaxActiveResponse(
            max_active=settings.max_active_stocks,
            active_count=stock_count or 0,
        ),
    )


async def _apply_ranking_for_category(pool, max_active: int, is_stock: bool) -> int:
    """Apply ranking for a specific category pool (stocks or non-stocks).

    Manually overridden markets keep their state. The remaining auto
    slots are filled by top-ranked markets that meet the minimum score.
    Returns the active count for this category.
    """
    week_start = await _effective_week_start(pool)
    min_score = settings.min_final_score
    category_filter = "= 'stock'" if is_stock else "!= 'stock'"

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT wa.symbol, wa.final_score, wa.rank,
                   wa.is_manually_overridden, wa.is_active
            FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.final_score IS NOT NULL
              AND m.category {category_filter}
            ORDER BY wa.final_score DESC NULLS LAST
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
            f"""
            SELECT COUNT(*) FROM weekly_analysis wa
            JOIN markets m ON m.symbol = wa.symbol
            WHERE wa.week_start = $1 AND wa.is_active = true
              AND m.category {category_filter}
            """,
            week_start,
        )

    return count or 0


@router.post("/config/apply-ranking", response_model=ApplyRankingResponse)
async def apply_ranking(api_key: str = Depends(require_api_key)):
    """Re-apply ranking for both markets and stocks.

    Activates the top N per category while preserving manual overrides.
    """
    pool = await get_pool()
    market_count = await _apply_ranking_for_category(pool, settings.max_active_markets, is_stock=False)
    stock_count = await _apply_ranking_for_category(pool, settings.max_active_stocks, is_stock=True)
    total = market_count + stock_count
    logger.info(
        "Applied ranking: markets=%d/%d, stocks=%d/%d, total=%d",
        market_count, settings.max_active_markets,
        stock_count, settings.max_active_stocks,
        total,
    )
    return ApplyRankingResponse(
        max_active=settings.max_active_markets,
        active_count=total,
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
        market = await conn.fetchrow(
            "SELECT symbol, category FROM markets WHERE symbol = $1", symbol
        )
        if not market:
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
            # Re-apply ranking for the correct category pool
            is_stock = market["category"] == "stock"
            max_active = settings.max_active_stocks if is_stock else settings.max_active_markets
            await _apply_ranking_for_category(pool, max_active, is_stock=is_stock)
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
