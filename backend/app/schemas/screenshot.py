from datetime import date, datetime

from pydantic import BaseModel, Field


class ScreenshotUploadRequest(BaseModel):
    """Upload a chart screenshot from ScreenshotSender EA."""

    symbol: str = Field(..., max_length=20)
    timeframe: str = Field(..., pattern=r"^(D1|H4|H1|M5)$")
    week_start: date
    api_key: str = Field(..., alias="apiKey")
    image_base64: str = Field(..., description="Base64-encoded JPEG image data")


class ScreenshotUploadResponse(BaseModel):
    symbol: str
    timeframe: str
    file_path: str
    stored_at: datetime
    ready_for_analysis: bool  # True when all 4 timeframes uploaded


class ScreenshotInfo(BaseModel):
    """Metadata for a stored screenshot."""

    timeframe: str
    file_path: str
    file_size_bytes: int | None
    uploaded_at: datetime | None


class ScreenshotListResponse(BaseModel):
    symbol: str
    week_start: date
    screenshots: list[ScreenshotInfo]
    complete: bool  # True if all 4 timeframes present
