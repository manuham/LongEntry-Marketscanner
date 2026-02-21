import asyncio
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import close_pool, get_pool
from app.logging_config import setup_logging
from app.routers import analytics, candles, config, fundamental, health, history, markets, results, screenshots, trades

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="LongEntry Market Scanner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    logger.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(duration_ms, 1),
        },
    )
    return response


@app.on_event("startup")
async def startup():
    logger.info("Starting LongEntry Market Scanner API")
    await get_pool()

    # Start Telegram bot if configured
    if (
        settings.telegram_bot_token
        and settings.telegram_chat_id
        and settings.telegram_bot_enabled
    ):
        try:
            from app.telegram_bot import LongEntryBot, set_bot

            bot = LongEntryBot()
            set_bot(bot)
            asyncio.create_task(bot.start())
            logger.info("Telegram bot launch scheduled")
        except Exception as e:
            logger.error("Failed to initialize Telegram bot: %s", e)
    else:
        logger.info("Telegram bot disabled or not configured — skipping")


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down")

    # Stop Telegram bot if running
    try:
        from app.telegram_bot import get_bot

        bot = get_bot()
        if bot:
            await bot.stop()
    except Exception as e:
        logger.error("Error stopping Telegram bot: %s", e)

    await close_pool()


app.include_router(health.router, prefix="/api")
app.include_router(candles.router, prefix="/api")
app.include_router(markets.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(fundamental.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(trades.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(screenshots.router, prefix="/api")
