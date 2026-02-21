from datetime import date

from pydantic import BaseModel, Field


class RegionOutlook(BaseModel):
    region: str
    cb_stance: int = Field(0, ge=-1, le=1, description="-1=hawkish, 0=neutral, 1=dovish")
    growth_outlook: int = Field(0, ge=-1, le=1, description="-1=contracting, 0=stable, 1=expanding")
    inflation_trend: int = Field(0, ge=-1, le=1, description="-1=falling, 0=stable, 1=rising")
    risk_sentiment: int = Field(0, ge=-1, le=1, description="-1=risk_off, 0=neutral, 1=risk_on")
    notes: str | None = None
    updated_at: str | None = None


class UpdateOutlook(BaseModel):
    cb_stance: int | None = Field(None, ge=-1, le=1)
    growth_outlook: int | None = Field(None, ge=-1, le=1)
    inflation_trend: int | None = Field(None, ge=-1, le=1)
    risk_sentiment: int | None = Field(None, ge=-1, le=1)
    notes: str | None = None


class EconomicEvent(BaseModel):
    id: int | None = None
    region: str
    event_date: date
    title: str
    impact: str = "medium"
    description: str | None = None


class CreateEvent(BaseModel):
    region: str
    event_date: date
    title: str
    impact: str = Field("medium", pattern="^(high|medium|low)$")
    description: str | None = None


class MarketAIPrediction(BaseModel):
    symbol: str
    prediction: str  # bullish, neutral, bearish
    score: float
    reasoning: str | None = None
    updated_at: str | None = None
