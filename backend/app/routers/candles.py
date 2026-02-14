import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import get_pool
from app.schemas.candle import CandleUploadRequest, CandleUploadResponse

router = APIRouter(tags=["candles"])
logger = logging.getLogger(__name__)


@router.post("/candles", response_model=CandleUploadResponse)
async def upload_candles(payload: CandleUploadRequest):
    """Receive H1 candle data from DataSender.

    Authentication is via apiKey in the JSON body (MQL5 WebRequest limitation).
    """
    if not settings.verify_api_key(payload.api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

    pool = await get_pool()

    async with pool.acquire() as conn:
        # Verify symbol exists
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", payload.symbol
        )
        if not exists:
            raise HTTPException(
                status_code=400, detail=f"Unknown symbol: {payload.symbol}"
            )

        # Insert candles, counting actual inserts via status string
        inserted = 0
        for candle in payload.candles:
            status = await conn.execute(
                """
                INSERT INTO candles (symbol, timeframe, open_time, open, high, low, close, volume)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (symbol, timeframe, open_time) DO NOTHING
                """,
                payload.symbol,
                payload.timeframe,
                candle.time,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
            )
            # asyncpg returns "INSERT 0 1" on insert, "INSERT 0 0" on conflict
            if status.endswith("1"):
                inserted += 1

    duplicates = len(payload.candles) - inserted

    logger.info(
        "candle_upload",
        extra={
            "symbol": payload.symbol,
            "timeframe": payload.timeframe,
            "received": len(payload.candles),
            "inserted": inserted,
            "duplicates": duplicates,
        },
    )

    return CandleUploadResponse(
        symbol=payload.symbol,
        received=len(payload.candles),
        inserted=inserted,
        duplicates=duplicates,
    )
