"""
Screenshot upload and retrieval endpoints.

The ScreenshotSender EA uploads D1/H4/H1/M5 chart screenshots every Friday.
These are stored as JPEG files and used by the AI analysis engine on Saturday.
"""

import base64
import logging
import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.database import get_pool
from app.schemas.screenshot import (
    ScreenshotInfo,
    ScreenshotListResponse,
    ScreenshotUploadRequest,
    ScreenshotUploadResponse,
)

router = APIRouter(tags=["screenshots"])
logger = logging.getLogger(__name__)

REQUIRED_TIMEFRAMES = {"D1", "H4", "H1", "M5"}


def _screenshot_dir(week_start) -> str:
    """Build directory path: /opt/longentry/screenshots/2026/week_8/"""
    year = week_start.year
    week_num = week_start.isocalendar()[1]
    return os.path.join(settings.screenshot_dir, str(year), f"week_{week_num}")


def _screenshot_path(week_start, symbol: str, timeframe: str) -> str:
    """Full file path for a screenshot."""
    return os.path.join(_screenshot_dir(week_start), f"{symbol}_{timeframe}.jpg")


@router.post("/screenshots", response_model=ScreenshotUploadResponse)
async def upload_screenshot(payload: ScreenshotUploadRequest):
    """Receive a chart screenshot from ScreenshotSender EA.

    Authentication is via apiKey in the JSON body (MQL5 WebRequest limitation).
    Image is sent as base64-encoded JPEG.
    """
    if not settings.verify_api_key(payload.api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

    pool = await get_pool()

    # Verify symbol exists
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", payload.symbol
        )
        if not exists:
            raise HTTPException(
                status_code=400, detail=f"Unknown symbol: {payload.symbol}"
            )

    # Decode base64 image
    try:
        image_data = base64.b64decode(payload.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Validate image size (max 5MB)
    max_size = settings.max_screenshot_size_mb * 1024 * 1024
    if len(image_data) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large: {len(image_data)} bytes (max {max_size})",
        )

    # Compress with Pillow if needed
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(image_data))

        # Convert to RGB if needed (PNG may have alpha)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Save as JPEG with configured quality
        output = BytesIO()
        img.save(output, format="JPEG", quality=settings.screenshot_quality)
        image_data = output.getvalue()
    except ImportError:
        # Pillow not installed — store as-is
        logger.warning("Pillow not installed, storing screenshot without compression")
    except Exception as e:
        logger.warning("Image compression failed, storing as-is: %s", e)

    # Create directory and save file
    file_path = _screenshot_path(payload.week_start, payload.symbol, payload.timeframe)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(image_data)

    # Store metadata in database
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO chart_screenshots
                (symbol, timeframe, week_start, file_path, file_size_bytes, uploaded_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (symbol, timeframe, week_start)
            DO UPDATE SET
                file_path = EXCLUDED.file_path,
                file_size_bytes = EXCLUDED.file_size_bytes,
                uploaded_at = NOW()
            """,
            payload.symbol,
            payload.timeframe,
            payload.week_start,
            file_path,
            len(image_data),
        )

        # Check if all 4 timeframes are now uploaded
        count = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT timeframe)
            FROM chart_screenshots
            WHERE symbol = $1 AND week_start = $2
            """,
            payload.symbol,
            payload.week_start,
        )

    ready = count >= len(REQUIRED_TIMEFRAMES)

    logger.info(
        "screenshot_upload",
        extra={
            "symbol": payload.symbol,
            "timeframe": payload.timeframe,
            "week_start": str(payload.week_start),
            "file_size": len(image_data),
            "ready_for_analysis": ready,
        },
    )

    return ScreenshotUploadResponse(
        symbol=payload.symbol,
        timeframe=payload.timeframe,
        file_path=file_path,
        stored_at=datetime.utcnow(),
        ready_for_analysis=ready,
    )


@router.get("/screenshots/{symbol}", response_model=ScreenshotListResponse)
async def get_screenshots(
    symbol: str,
    week_start: str | None = Query(default=None, description="ISO date, e.g. 2026-02-16"),
):
    """Return screenshot metadata for a symbol's current or specified week."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM markets WHERE symbol = $1", symbol
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown symbol: {symbol}")

        if week_start:
            from datetime import date as date_type

            ws = date_type.fromisoformat(week_start)
        else:
            # Use most recent week with screenshots
            ws = await conn.fetchval(
                """
                SELECT week_start FROM chart_screenshots
                WHERE symbol = $1
                ORDER BY week_start DESC
                LIMIT 1
                """,
                symbol,
            )
            if ws is None:
                return ScreenshotListResponse(
                    symbol=symbol,
                    week_start=date_type.today(),
                    screenshots=[],
                    complete=False,
                )

        rows = await conn.fetch(
            """
            SELECT timeframe, file_path, file_size_bytes, uploaded_at
            FROM chart_screenshots
            WHERE symbol = $1 AND week_start = $2
            ORDER BY timeframe
            """,
            symbol,
            ws,
        )

    screenshots = [
        ScreenshotInfo(
            timeframe=r["timeframe"],
            file_path=r["file_path"],
            file_size_bytes=r["file_size_bytes"],
            uploaded_at=r["uploaded_at"],
        )
        for r in rows
    ]

    uploaded_tfs = {s.timeframe for s in screenshots}
    complete = uploaded_tfs >= REQUIRED_TIMEFRAMES

    return ScreenshotListResponse(
        symbol=symbol,
        week_start=ws,
        screenshots=screenshots,
        complete=complete,
    )
