import asyncio
import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.database import get_pool
from app.schemas.trades import (
    TradeResponse,
    TradeUploadBatch,
    TradeUploadResponse,
)

router = APIRouter(tags=["trades"])
logger = logging.getLogger(__name__)


@router.post("/trades", response_model=TradeUploadResponse)
async def upload_trades(payload: TradeUploadBatch):
    """Upload individual trade records from the EA. Auth via apiKey in body."""
    if not settings.verify_api_key(payload.api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

    pool = await get_pool()
    inserted = 0

    async with pool.acquire() as conn:
        for t in payload.trades:
            # Calculate week_start (Monday) from open_time
            open_date = t.open_time.date()
            week_start = open_date - timedelta(days=open_date.weekday())

            status = await conn.execute(
                """
                INSERT INTO trades
                    (symbol, open_time, close_time, open_price, close_price,
                     sl_price, tp_price, lot_size, pnl_amount, pnl_percent,
                     result, week_start, magic_number)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (symbol, open_time, magic_number) DO UPDATE SET
                    close_time = EXCLUDED.close_time,
                    close_price = EXCLUDED.close_price,
                    pnl_amount = EXCLUDED.pnl_amount,
                    pnl_percent = EXCLUDED.pnl_percent,
                    result = EXCLUDED.result
                """,
                t.symbol,
                t.open_time,
                t.close_time,
                t.open_price,
                t.close_price,
                t.sl_price,
                t.tp_price,
                t.lot_size,
                t.pnl_amount,
                t.pnl_percent,
                t.result,
                week_start,
                t.magic_number,
            )
            if "INSERT" in status:
                inserted += 1
                # Fetch the trade ID and trigger post-trade review asynchronously
                trade_id = await conn.fetchval(
                    """
                    SELECT id FROM trades
                    WHERE symbol = $1 AND open_time = $2 AND magic_number = $3
                    """,
                    t.symbol,
                    t.open_time,
                    t.magic_number,
                )
                if trade_id:
                    from app.engines.post_trade_review import review_closed_trade
                    asyncio.create_task(review_closed_trade(trade_id))

    duplicates = len(payload.trades) - inserted
    logger.info(
        "trade_upload: received=%d inserted=%d duplicates=%d",
        len(payload.trades), inserted, duplicates,
    )
    return TradeUploadResponse(
        received=len(payload.trades),
        inserted=inserted,
        duplicates=duplicates,
    )


@router.get("/trades/{symbol}", response_model=list[TradeResponse])
async def get_trades(
    symbol: str,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
):
    """Return individual trades for a symbol, most recent first."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        if from_date and to_date:
            rows = await conn.fetch(
                """
                SELECT id, symbol, open_time, close_time, open_price, close_price,
                       sl_price, tp_price, lot_size, pnl_amount, pnl_percent,
                       result, week_start
                FROM trades
                WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3
                ORDER BY open_time DESC
                """,
                symbol, from_date, to_date,
            )
        elif from_date:
            rows = await conn.fetch(
                """
                SELECT id, symbol, open_time, close_time, open_price, close_price,
                       sl_price, tp_price, lot_size, pnl_amount, pnl_percent,
                       result, week_start
                FROM trades
                WHERE symbol = $1 AND open_time >= $2
                ORDER BY open_time DESC
                """,
                symbol, from_date,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, symbol, open_time, close_time, open_price, close_price,
                       sl_price, tp_price, lot_size, pnl_amount, pnl_percent,
                       result, week_start
                FROM trades
                WHERE symbol = $1
                ORDER BY open_time DESC
                """,
                symbol,
            )

    return [
        TradeResponse(
            id=r["id"],
            symbol=r["symbol"],
            open_time=r["open_time"],
            close_time=r["close_time"],
            open_price=r["open_price"],
            close_price=r["close_price"],
            sl_price=r["sl_price"],
            tp_price=r["tp_price"],
            lot_size=r["lot_size"],
            pnl_amount=r["pnl_amount"],
            pnl_percent=r["pnl_percent"],
            result=r["result"],
            week_start=r["week_start"],
        )
        for r in rows
    ]
