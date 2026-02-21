from fastapi import APIRouter

from app.database import get_pool
from app.schemas.market import MarketInfo

router = APIRouter(tags=["markets"])


@router.get("/markets", response_model=list[MarketInfo])
async def list_markets():
    """Return all 14 markets with latest candle price."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                m.symbol,
                m.name,
                m.category,
                c.close AS latest_price,
                c.open_time AS latest_time
            FROM markets m
            LEFT JOIN LATERAL (
                SELECT close, open_time
                FROM candles
                WHERE candles.symbol = m.symbol
                ORDER BY open_time DESC
                LIMIT 1
            ) c ON true
            WHERE m.is_in_universe = true
            ORDER BY m.category, m.symbol
            """
        )
    return [
        MarketInfo(
            symbol=r["symbol"],
            name=r["name"],
            category=r["category"],
            latest_price=r["latest_price"],
            latest_time=r["latest_time"],
        )
        for r in rows
    ]
