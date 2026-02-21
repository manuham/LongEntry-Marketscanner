from datetime import date, datetime

from pydantic import BaseModel


class AIAnalysisResult(BaseModel):
    """AI vision analysis result for a market."""

    symbol: str
    week_start: date
    ai_score: float
    ai_confidence: str  # high, medium, low
    ai_bias: str  # bullish, neutral, bearish
    key_levels: dict | None = None
    confluence: dict | None = None
    risk_factors: list[str] | None = None
    reasoning: str | None = None
    suggested_entry_window: str | None = None
    suggested_sl_pct: float | None = None
    suggested_tp_pct: float | None = None
    model_used: str | None = None
    tokens_used: int | None = None
    cost_usd: float | None = None
    created_at: datetime | None = None


class AIAnalysisSummary(BaseModel):
    """Lightweight AI result for dashboard cards."""

    symbol: str
    ai_score: float
    ai_confidence: str
    ai_bias: str
    reasoning: str | None = None
    created_at: datetime | None = None
