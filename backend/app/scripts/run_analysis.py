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
from app.telegram import send_message

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

        active = [r for r in results if r.get("is_active")]
        active.sort(key=lambda r: r.get("rank", 99))

        for r in results:
            if "error" in r:
                print(f"  {r['symbol']}: ERROR - {r['error']}")
            else:
                status = " [ACTIVE]" if r.get("is_active") else ""
                print(f"  {r['symbol']}: final={r.get('final_score', 0):.1f}{status}")

        # Send Telegram notification
        ai_count = sum(1 for r in results if r.get("ai_score") is not None)
        lines = [f"<b>Weekly Analysis Complete</b>"]
        lines.append(f"{analyzed} markets analyzed, {failed} failed")
        if ai_count > 0:
            lines.append(f"AI vision: {ai_count} markets analyzed")
        lines.append("")
        if active:
            lines.append("<b>Active markets this week:</b>")
            for r in active:
                # Show AI score if available, otherwise technical
                if r.get("ai_score") is not None:
                    confidence = r.get("ai_confidence", "?").upper()
                    bias = r.get("ai_bias", "?")
                    bias_emoji = {"bullish": "↑", "bearish": "↓", "neutral": "→"}.get(bias, "?")
                    lines.append(
                        f"  #{r.get('rank', '?')} <b>{r['symbol']}</b> — "
                        f"score {r.get('final_score', 0):.0f} "
                        f"[{confidence} {bias_emoji}] "
                        f"(AI:{r['ai_score']:.0f} "
                        f"BT:{r.get('backtest_score', 0):.0f} "
                        f"F:{r.get('fundamental_score', 0):.0f})"
                    )
                else:
                    lines.append(
                        f"  #{r.get('rank', '?')} <b>{r['symbol']}</b> — "
                        f"score {r.get('final_score', 0):.0f} "
                        f"(T:{r.get('technical_score', 0):.0f} "
                        f"B:{r.get('backtest_score', 0):.0f} "
                        f"F:{r.get('fundamental_score', 0):.0f})"
                    )
        else:
            lines.append("No markets activated (all below threshold).")
        if failed > 0:
            failed_symbols = [r["symbol"] for r in results if "error" in r]
            lines.append(f"\nFailed: {', '.join(failed_symbols)}")
        send_message("\n".join(lines))

        # Only fail if majority of symbols failed (not on individual failures)
        total = analyzed + failed
        if total > 0 and failed > total / 2:
            logger.error("Majority of symbols failed (%d/%d), exiting with error", failed, total)
            sys.exit(1)

    except Exception:
        logger.exception("Weekly analysis script failed")
        send_message("Weekly analysis script FAILED — check logs.")
        sys.exit(2)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
