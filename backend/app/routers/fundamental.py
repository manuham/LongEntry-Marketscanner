import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_api_key
from app.database import get_pool
from app.engines.fundamental import SYMBOL_REGION
from app.schemas.fundamental import (
    CreateEvent,
    EconomicEvent,
    MarketAIPrediction,
    RegionOutlook,
    UpdateOutlook,
)

router = APIRouter(tags=["fundamental"])
logger = logging.getLogger(__name__)

VALID_REGIONS = set(SYMBOL_REGION.values())


# ── Region outlooks ───────────────────────────────────────────────

@router.get("/fundamental", response_model=list[RegionOutlook])
async def list_outlooks():
    """Return macro outlook for all regions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT region, cb_stance, growth_outlook, inflation_trend, "
            "risk_sentiment, notes, updated_at FROM fundamental_outlook ORDER BY region"
        )
    return [
        RegionOutlook(
            region=r["region"],
            cb_stance=r["cb_stance"],
            growth_outlook=r["growth_outlook"],
            inflation_trend=r["inflation_trend"],
            risk_sentiment=r["risk_sentiment"],
            notes=r["notes"],
            updated_at=str(r["updated_at"]) if r["updated_at"] else None,
        )
        for r in rows
    ]


@router.put("/fundamental/{region}", response_model=RegionOutlook)
async def update_outlook(
    region: str,
    body: UpdateOutlook,
    api_key: str = Depends(require_api_key),
):
    """Update the macro outlook for a region. Requires API key."""
    if region not in VALID_REGIONS:
        raise HTTPException(status_code=404, detail=f"Unknown region: {region}")

    # Build SET clause from non-None fields
    updates = {}
    if body.cb_stance is not None:
        updates["cb_stance"] = body.cb_stance
    if body.growth_outlook is not None:
        updates["growth_outlook"] = body.growth_outlook
    if body.inflation_trend is not None:
        updates["inflation_trend"] = body.inflation_trend
    if body.risk_sentiment is not None:
        updates["risk_sentiment"] = body.risk_sentiment
    if body.notes is not None:
        updates["notes"] = body.notes

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = [f"{k} = ${i+2}" for i, k in enumerate(updates)]
    set_parts.append(f"updated_at = NOW()")
    set_clause = ", ".join(set_parts)
    values = [region] + list(updates.values())

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            f"UPDATE fundamental_outlook SET {set_clause} WHERE region = $1",
            *values,
        )
        row = await conn.fetchrow(
            "SELECT region, cb_stance, growth_outlook, inflation_trend, "
            "risk_sentiment, notes, updated_at FROM fundamental_outlook WHERE region = $1",
            region,
        )

    logger.info("Updated fundamental outlook for region %s: %s", region, updates)
    return RegionOutlook(
        region=row["region"],
        cb_stance=row["cb_stance"],
        growth_outlook=row["growth_outlook"],
        inflation_trend=row["inflation_trend"],
        risk_sentiment=row["risk_sentiment"],
        notes=row["notes"],
        updated_at=str(row["updated_at"]) if row["updated_at"] else None,
    )


# ── AI predictions ────────────────────────────────────────────────

@router.get("/fundamental/ai-predictions", response_model=list[MarketAIPrediction])
async def list_ai_predictions():
    """Return the latest AI predictions for all markets (from auto_outlook.py)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT symbol, prediction, score, reasoning, updated_at
            FROM market_ai_prediction
            ORDER BY score DESC
            """
        )
    return [
        MarketAIPrediction(
            symbol=r["symbol"],
            prediction=r["prediction"],
            score=r["score"],
            reasoning=r["reasoning"],
            updated_at=str(r["updated_at"]) if r["updated_at"] else None,
        )
        for r in rows
    ]


# ── Economic events ───────────────────────────────────────────────

@router.get("/fundamental/events", response_model=list[EconomicEvent])
async def list_events():
    """Return all upcoming economic events (future + last 7 days)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, region, event_date, title, impact, description
            FROM economic_events
            WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY event_date, region
            """
        )
    return [
        EconomicEvent(
            id=r["id"],
            region=r["region"],
            event_date=r["event_date"],
            title=r["title"],
            impact=r["impact"],
            description=r["description"],
        )
        for r in rows
    ]


@router.post("/fundamental/events", response_model=EconomicEvent)
async def create_event(
    body: CreateEvent,
    api_key: str = Depends(require_api_key),
):
    """Add an upcoming economic event. Requires API key."""
    if body.region not in VALID_REGIONS:
        raise HTTPException(status_code=400, detail=f"Unknown region: {body.region}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO economic_events (region, event_date, title, impact, description)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, region, event_date, title, impact, description
            """,
            body.region,
            body.event_date,
            body.title,
            body.impact,
            body.description,
        )

    logger.info("Created economic event: %s on %s (%s)", body.title, body.event_date, body.region)
    return EconomicEvent(
        id=row["id"],
        region=row["region"],
        event_date=row["event_date"],
        title=row["title"],
        impact=row["impact"],
        description=row["description"],
    )


@router.delete("/fundamental/events/{event_id}")
async def delete_event(
    event_id: int,
    api_key: str = Depends(require_api_key),
):
    """Delete an economic event. Requires API key."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.execute(
            "DELETE FROM economic_events WHERE id = $1", event_id
        )
    if deleted == "DELETE 0":
        raise HTTPException(status_code=404, detail="Event not found")
    return {"status": "deleted", "id": event_id}
