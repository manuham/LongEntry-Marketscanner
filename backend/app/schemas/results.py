from datetime import date

from pydantic import BaseModel, Field


class TradeResultUpload(BaseModel):
    """Posted by the EA at end-of-week to report trade outcomes."""
    symbol: str = Field(..., max_length=20)
    week_start: date
    api_key: str = Field(..., alias="apiKey")  # Body-based auth for MQL5
    trades_taken: int = 0
    wins: int = 0
    losses: int = 0
    total_pnl_percent: float = 0.0


class TradeResultResponse(BaseModel):
    symbol: str
    week_start: date
    trades_taken: int
    wins: int
    losses: int
    total_pnl_percent: float
    was_active: bool | None


class WeeklyResultSummary(BaseModel):
    week_start: date
    total_trades: int
    total_wins: int
    total_losses: int
    total_pnl_percent: float
    active_markets: int
    results: list[TradeResultResponse]
