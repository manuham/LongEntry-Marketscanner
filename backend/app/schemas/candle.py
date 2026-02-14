from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class CandleData(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0

    @field_validator("time", mode="before")
    @classmethod
    def parse_mql5_time(cls, v):
        """Accept MQL5 format '2024.02.14 12:00:00' alongside ISO 8601."""
        if isinstance(v, str) and "." in v[:10]:
            v = v.replace(".", "-", 2)
        return v


class CandleUploadRequest(BaseModel):
    symbol: str = Field(..., max_length=20)
    timeframe: str = Field(default="H1", max_length=10)
    api_key: str = Field(..., alias="apiKey")
    candles: list[CandleData] = Field(..., max_length=20000)


class CandleUploadResponse(BaseModel):
    symbol: str
    received: int
    inserted: int
    duplicates: int
