from datetime import date

from pydantic import BaseModel


class SymbolAnalytics(BaseModel):
    symbol: str
    week_start: date
    technical_score: float | None = None
    avg_daily_growth: float | None = None
    avg_daily_loss: float | None = None
    most_bullish_day: float | None = None
    most_bearish_day: float | None = None
    up_day_win_rate: float | None = None
    current_price: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    rsi_14: float | None = None
    atr_14: float | None = None
    daily_range_pct: float | None = None
    change_1w: float | None = None
    change_2w: float | None = None
    change_1m: float | None = None
    change_3m: float | None = None
    candle_count: int = 0
    daily_bar_count: int = 0
    # Backtest fields
    backtest_score: float | None = None
    final_score: float | None = None
    rank: int | None = None
    is_active: bool = False
    opt_entry_hour: int | None = None
    opt_sl_percent: float | None = None
    opt_tp_percent: float | None = None
    bt_total_return: float | None = None
    bt_win_rate: float | None = None
    bt_profit_factor: float | None = None
    bt_total_trades: int | None = None
    bt_max_drawdown: float | None = None
    bt_param_stability: float | None = None


class AnalysisSummary(BaseModel):
    symbol: str
    week_start: date
    technical_score: float | None = None
    avg_daily_growth: float | None = None
    avg_daily_loss: float | None = None
    most_bullish_day: float | None = None
    most_bearish_day: float | None = None
    up_day_win_rate: float | None = None
    # Backtest fields
    backtest_score: float | None = None
    final_score: float | None = None
    rank: int | None = None
    is_active: bool = False
    opt_entry_hour: int | None = None
    opt_sl_percent: float | None = None
    opt_tp_percent: float | None = None
    bt_total_return: float | None = None
    bt_win_rate: float | None = None
    bt_profit_factor: float | None = None
    bt_total_trades: int | None = None
    bt_max_drawdown: float | None = None
    bt_param_stability: float | None = None


class RunAnalysisResponse(BaseModel):
    week_start: date
    analyzed: int
    failed: int
    results: list[dict]
