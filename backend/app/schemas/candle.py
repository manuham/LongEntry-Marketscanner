from datetime import datetime

from pydantic import BaseModel, Field


class CandleData(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


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
