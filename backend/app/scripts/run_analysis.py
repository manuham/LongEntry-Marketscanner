"""
Standalone script to run weekly analytics for all symbols.
Called by cron every Saturday morning.

Usage:
    cd /opt/longentry/backend
    source venv/bin/activate
    python -m app.scripts.run_analysis
"""

import asyncio
import logging
import sys

from app.database import close_pool, get_pool
from app.engines.analytics import run_full_analysis
from app.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


async def main():
    logger.info("=== Weekly Analysis Script Started ===")

    try:
        # Initialize database pool
        await get_pool()

        # Run analysis for all symbols
        results = await run_full_analysis()

        analyzed = sum(1 for r in results if "error" not in r)
        failed = sum(1 for r in results if "error" in r)

        logger.info("=== Analysis Complete: %d analyzed, %d failed ===", analyzed, failed)

        # Print summary to stdout for cron log
        print(f"\nWeekly Analysis Summary:")
        print(f"  Analyzed: {analyzed}")
        print(f"  Failed:   {failed}")
        print()

        for r in results:
            if "error" in r:
                print(f"  {r['symbol']}: ERROR - {r['error']}")
            else:
                print(f"  {r['symbol']}: score={r['technical_score']:.1f}, "
                      f"win_rate={r['up_day_win_rate']:.1f}%")

        if failed > 0:
            sys.exit(1)

    except Exception:
        logger.exception("Weekly analysis script failed")
        sys.exit(2)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
