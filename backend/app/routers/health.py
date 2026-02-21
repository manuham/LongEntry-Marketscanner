import logging
from datetime import date, timedelta

from fastapi import APIRouter

from app.database import get_pool

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """
    System health check — returns status of each subsystem.

    Checks:
      - db: Can we query the database?
      - candles: Has any candle data been uploaded in the last 8 days?
      - analysis: Has analysis run in the last 8 days?
      - ai_outlook: Has AI outlook run in the last 8 days?
    """
    pool = await get_pool()
    health = {"status": "ok", "checks": {}}

    try:
        async with pool.acquire() as conn:
            # DB connectivity
            await conn.fetchval("SELECT 1")
            health["checks"]["db"] = True

            cutoff = date.today() - timedelta(days=8)

            # Candle freshness
            latest_candle = await conn.fetchval(
                "SELECT MAX(open_time)::date FROM candles"
            )
            health["checks"]["candles"] = latest_candle is not None and latest_candle >= cutoff
            health["checks"]["candles_latest"] = str(latest_candle) if latest_candle else None

            # Analysis freshness
            latest_analysis = await conn.fetchval(
                "SELECT MAX(week_start) FROM weekly_analysis"
            )
            health["checks"]["analysis"] = latest_analysis is not None and latest_analysis >= cutoff
            health["checks"]["analysis_latest"] = str(latest_analysis) if latest_analysis else None

            # AI outlook freshness
            latest_ai = await conn.fetchval(
                "SELECT MAX(updated_at)::date FROM market_ai_prediction"
            )
            health["checks"]["ai_outlook"] = latest_ai is not None and latest_ai >= cutoff
            health["checks"]["ai_outlook_latest"] = str(latest_ai) if latest_ai else None

            # Count active markets
            active_count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM weekly_analysis
                WHERE is_active = true
                  AND week_start = (SELECT MAX(week_start) FROM weekly_analysis)
                """
            )
            health["checks"]["active_markets"] = active_count or 0

    except Exception:
        logger.exception("Health check failed")
        health["status"] = "error"
        health["checks"]["db"] = False

    # Overall status
    checks = health["checks"]
    if not checks.get("db"):
        health["status"] = "error"
    elif not checks.get("candles") or not checks.get("analysis"):
        health["status"] = "warning"

    return health
