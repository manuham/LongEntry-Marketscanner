from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class TradeRecord(BaseModel):
    """A single trade record from the EA."""
    symbol: str = Field(..., max_length=20)
    open_time: datetime
    close_time: Optional[datetime] = None
    open_price: float
    close_price: Optional[float] = None
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None
    lot_size: Optional[float] = None
    pnl_amount: Optional[float] = None
    pnl_percent: Optional[float] = None
    result: Optional[str] = None          # 'win', 'loss', or 'open'
    magic_number: Optional[int] = None


class TradeUploadBatch(BaseModel):
    """Batch upload of trades from the EA. Auth via apiKey in body (MQL5)."""
    api_key: str = Field(..., alias="apiKey")
    trades: list[TradeRecord]


class TradeResponse(BaseModel):
    """Trade record returned to the frontend."""
    id: int
    symbol: str
    open_time: datetime
    close_time: Optional[datetime] = None
    open_price: float
    close_price: Optional[float] = None
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None
    lot_size: Optional[float] = None
    pnl_amount: Optional[float] = None
    pnl_percent: Optional[float] = None
    result: Optional[str] = None
    week_start: Optional[date] = None


class TradeUploadResponse(BaseModel):
    received: int
    inserted: int
    duplicates: int
