from datetime import date
from typing import Optional

from pydantic import BaseModel


class WeeklyScoreRecord(BaseModel):
    symbol: str
    week_start: date
    technical_score: Optional[float] = None
    backtest_score: Optional[float] = None
    fundamental_score: Optional[float] = None
    final_score: Optional[float] = None
    rank: Optional[int] = None
    is_active: bool = False
    opt_entry_hour: Optional[int] = None
    opt_sl_percent: Optional[float] = None
    opt_tp_percent: Optional[float] = None
    bt_total_return: Optional[float] = None
    bt_win_rate: Optional[float] = None
    bt_max_drawdown: Optional[float] = None


class HeatmapCell(BaseModel):
    sl_pct: float
    tp_pct: float
    total_return: float
    win_rate: float
    profit_factor: float
    total_trades: int


class HourReturn(BaseModel):
    hour: int
    total_return: float
    win_rate: float


class HeatmapResponse(BaseModel):
    symbol: str
    entry_hour: int
    grid: list[HeatmapCell]
    entry_hour_returns: list[HourReturn]


class DrawdownInfo(BaseModel):
    symbol: str
    is_active: bool = False
    open_trades: int = 0
    week_pnl_percent: float = 0.0
    week_trades: int = 0
    week_wins: int = 0
    week_losses: int = 0
