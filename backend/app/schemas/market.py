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


class OverrideRequest(BaseModel):
    active: bool | None = None  # True/False = force, None = clear override


class MaxActiveRequest(BaseModel):
    max_active: int = Field(ge=1, le=14)


class MaxActiveResponse(BaseModel):
    max_active: int
    active_count: int
