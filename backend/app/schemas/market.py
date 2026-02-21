from datetime import datetime

from pydantic import BaseModel, Field


class MarketInfo(BaseModel):
    symbol: str
    name: str
    category: str
    latest_price: float | None = None
    latest_time: datetime | None = None


class MarketConfigResponse(BaseModel):
    symbol: str
    active: bool
    entry_hour: int = Field(serialization_alias="entryHour")
    entry_minute: int = Field(serialization_alias="entryMinute")
    sl_percent: float = Field(serialization_alias="slPercent")
    tp_percent: float = Field(serialization_alias="tpPercent")
    week_start: str = Field(serialization_alias="weekStart")
    # Smart position management fields
    tp1_close_pct: float = Field(default=0.5, serialization_alias="tp1ClosePct")  # % of position to close at TP1
    tp2_percent: float = Field(default=0.0, serialization_alias="tp2Percent")  # Extended TP target (0 = disabled)
    ai_confidence: str = Field(default="none", serialization_alias="aiConfidence")  # high/medium/low/none
    use_trailing_stop: bool = Field(default=False, serialization_alias="useTrailingStop")
    trailing_stop_distance: float = Field(default=0.0, serialization_alias="trailingStopDistance")  # % distance


class OverrideRequest(BaseModel):
    active: bool | None = None  # True/False = force, None = clear override


class MaxActiveRequest(BaseModel):
    max_active: int = Field(ge=1, le=50)


class MaxActiveResponse(BaseModel):
    max_active: int
    active_count: int



class ApplyRankingResponse(BaseModel):
    max_active: int
    active_count: int
    applied: bool
