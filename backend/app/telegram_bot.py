"""
LongEntry Market Scanner — Interactive Telegram Bot

Full-featured Telegram bot for monitoring, manual overrides, and reporting.
Based on the AI Trade Bot's proven design, adapted for weekly scanner.

Commands:
  /markets  — Ranked market list with scores and active status
  /scan     — Trigger re-analysis (rate-limited)
  /stats    — Performance statistics
  /override — Manual market activation/deactivation
  /news     — Upcoming economic events
  /drawdown — Current week P&L and risk
  /report   — Weekly performance breakdown
  /config   — Current settings
  /help     — All commands

Runs in same asyncio loop as FastAPI (polling mode).
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

from app.config import settings
from app.database import get_pool

logger = logging.getLogger(__name__)


class LongEntryBot:
    """Interactive Telegram bot for LongEntry Market Scanner."""

    def __init__(self):
        self.token = settings.telegram_bot_token
        self.chat_id = settings.telegram_chat_id
        self.app: Application | None = None
        self._running = False

    async def start(self):
        """Initialize and start the bot with polling."""
        if not self.token or not self.chat_id:
            logger.warning("Telegram bot not configured — skipping startup")
            return

        self.app = Application.builder().token(self.token).build()

        # Register command handlers
        self.app.add_handler(CommandHandler("start", self.cmd_start))
        self.app.add_handler(CommandHandler("help", self.cmd_help))
        self.app.add_handler(CommandHandler("markets", self.cmd_markets))
        self.app.add_handler(CommandHandler("scan", self.cmd_scan))
        self.app.add_handler(CommandHandler("stats", self.cmd_stats))
        self.app.add_handler(CommandHandler("override", self.cmd_override))
        self.app.add_handler(CommandHandler("news", self.cmd_news))
        self.app.add_handler(CommandHandler("drawdown", self.cmd_drawdown))
        self.app.add_handler(CommandHandler("report", self.cmd_report))
        self.app.add_handler(CommandHandler("config", self.cmd_config))

        # Inline button callbacks
        self.app.add_handler(CallbackQueryHandler(self.handle_callback))

        # Start polling (non-blocking)
        await self.app.initialize()
        await self.app.start()
        await self.app.updater.start_polling(drop_pending_updates=True)
        self._running = True

        logger.info("Telegram bot started (polling mode)")

        # Start background notification loop
        asyncio.create_task(self._notification_loop())

    async def stop(self):
        """Gracefully stop the bot."""
        if self.app and self._running:
            self._running = False
            await self.app.updater.stop()
            await self.app.stop()
            await self.app.shutdown()
            logger.info("Telegram bot stopped")

    # ────────────────────────────────────────────────────────────────
    # Helper: Send message to configured chat
    # ────────────────────────────────────────────────────────────────

    async def send(self, text: str, reply_markup=None, parse_mode="HTML"):
        """Send a message to the configured chat."""
        if not self.app:
            return
        try:
            await self.app.bot.send_message(
                chat_id=self.chat_id,
                text=text,
                parse_mode=parse_mode,
                reply_markup=reply_markup,
                disable_web_page_preview=True,
            )
        except Exception:
            logger.exception("Failed to send Telegram message")

    # ────────────────────────────────────────────────────────────────
    # Helper: Get week start (Monday)
    # ────────────────────────────────────────────────────────────────

    @staticmethod
    def _week_start() -> date:
        today = date.today()
        return today - timedelta(days=today.weekday())

    # ────────────────────────────────────────────────────────────────
    # Command: /start
    # ────────────────────────────────────────────────────────────────

    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "<b>LongEntry Market Scanner Bot</b>\n\n"
            "I'll keep you updated on market rankings, trades, and performance.\n"
            "Use /help to see all commands.",
            parse_mode="HTML",
        )

    # ────────────────────────────────────────────────────────────────
    # Command: /help
    # ────────────────────────────────────────────────────────────────

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        text = (
            "<b>Available Commands</b>\n\n"
            "/markets — Ranked market list with scores\n"
            "/scan [SYMBOL] — Trigger re-analysis\n"
            "/stats [SYMBOL] [DAYS] — Performance stats\n"
            "/override SYMBOL on|off — Activate/deactivate\n"
            "/news — Upcoming economic events\n"
            "/drawdown — Current week P&L & risk\n"
            "/report — Weekly performance breakdown\n"
            "/config — Current settings\n"
            "/help — This message"
        )
        await update.message.reply_text(text, parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Command: /markets
    # ────────────────────────────────────────────────────────────────

    async def cmd_markets(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (wa.symbol) wa.symbol, wa.final_score,
                       wa.technical_score, wa.backtest_score, wa.fundamental_score,
                       wa.ai_score, wa.ai_confidence, wa.ai_bias,
                       wa.is_active, wa.is_manually_overridden, wa.rank,
                       m.category, m.name
                FROM weekly_analysis wa
                JOIN markets m ON m.symbol = wa.symbol
                WHERE wa.final_score IS NOT NULL AND m.is_in_universe = true
                ORDER BY wa.symbol, wa.week_start DESC
                """
            )

        if not rows:
            await update.message.reply_text("No analysis data available yet.")
            return

        # Sort by final score descending
        sorted_rows = sorted(rows, key=lambda r: r["final_score"] or 0, reverse=True)

        lines = ["<b>Market Rankings</b>\n"]

        for r in sorted_rows[:20]:  # Top 20
            symbol = r["symbol"]
            score = r["final_score"] or 0
            active = r["is_active"]
            override = r["is_manually_overridden"]
            rank = r["rank"] or "?"

            # Status indicator
            if active:
                status = "ACTIVE" if not override else "OVERRIDE"
                icon = "🟢"
            else:
                status = "OFF"
                icon = "⚪"

            # AI info
            if r["ai_score"] is not None:
                confidence = (r["ai_confidence"] or "?").upper()
                bias = r["ai_bias"] or "?"
                bias_emoji = {"bullish": "↑", "bearish": "↓", "neutral": "→"}.get(bias, "?")
                ai_tag = f" [{confidence} {bias_emoji}]"
            else:
                ai_tag = ""

            lines.append(
                f"{icon} #{rank} <b>{symbol}</b> — {score:.0f}{ai_tag} ({status})"
            )

        # Add inline buttons for top active markets
        keyboard = []
        active_markets = [r for r in sorted_rows if r["is_active"]][:6]
        for r in active_markets:
            keyboard.append([
                InlineKeyboardButton(
                    f"Deactivate {r['symbol']}",
                    callback_data=f"override:{r['symbol']}:off",
                )
            ])

        reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
        await update.message.reply_text("\n".join(lines), parse_mode="HTML",
                                        reply_markup=reply_markup)

    # ────────────────────────────────────────────────────────────────
    # Command: /scan
    # ────────────────────────────────────────────────────────────────

    async def cmd_scan(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "To trigger a full re-analysis, use the server endpoint:\n"
            "<code>POST /api/analytics/run</code>\n\n"
            "Or wait for the Saturday 06:00 UTC cron job.",
            parse_mode="HTML",
        )

    # ────────────────────────────────────────────────────────────────
    # Command: /stats [SYMBOL] [DAYS]
    # ────────────────────────────────────────────────────────────────

    async def cmd_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        args = context.args or []
        symbol = args[0].upper() if len(args) >= 1 else None
        days = int(args[1]) if len(args) >= 2 else 30

        pool = await get_pool()
        async with pool.acquire() as conn:
            if symbol:
                trades = await conn.fetch(
                    """
                    SELECT result, pnl_percent FROM trades
                    WHERE symbol = $1 AND result IN ('win', 'loss')
                      AND close_time >= NOW() - $2 * INTERVAL '1 day'
                    ORDER BY close_time DESC
                    """,
                    symbol,
                    days,
                )
            else:
                trades = await conn.fetch(
                    """
                    SELECT symbol, result, pnl_percent FROM trades
                    WHERE result IN ('win', 'loss')
                      AND close_time >= NOW() - $1 * INTERVAL '1 day'
                    ORDER BY close_time DESC
                    """,
                    days,
                )

        if not trades:
            title = f"{symbol} " if symbol else ""
            await update.message.reply_text(f"No trades found for {title}last {days} days.")
            return

        wins = [t for t in trades if t["result"] == "win"]
        losses = [t for t in trades if t["result"] == "loss"]
        total_pnl = sum(t["pnl_percent"] or 0 for t in trades)
        win_rate = len(wins) / len(trades) * 100 if trades else 0
        avg_win = sum(t["pnl_percent"] or 0 for t in wins) / len(wins) if wins else 0
        avg_loss = sum(t["pnl_percent"] or 0 for t in losses) / len(losses) if losses else 0
        pf = abs(sum(t["pnl_percent"] or 0 for t in wins) / sum(t["pnl_percent"] or 0 for t in losses)) if losses and sum(t["pnl_percent"] or 0 for t in losses) != 0 else 0

        title = f"<b>{symbol}</b>" if symbol else "<b>All Markets</b>"
        text = (
            f"{title} (Last {days} days)\n"
            f"├─ Trades: {len(trades)} ({len(wins)}W / {len(losses)}L)\n"
            f"├─ Win rate: {win_rate:.1f}%\n"
            f"├─ Avg winner: {avg_win:+.2f}%\n"
            f"├─ Avg loser: {avg_loss:+.2f}%\n"
            f"├─ Profit factor: {pf:.2f}\n"
            f"└─ Total P&L: {total_pnl:+.2f}%"
        )
        await update.message.reply_text(text, parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Command: /override SYMBOL on|off
    # ────────────────────────────────────────────────────────────────

    async def cmd_override(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        args = context.args or []
        if len(args) < 2:
            await update.message.reply_text(
                "Usage: /override SYMBOL on|off\n"
                "Example: /override XAUUSD on"
            )
            return

        symbol = args[0].upper()
        action = args[1].lower()
        if action not in ("on", "off"):
            await update.message.reply_text("Action must be 'on' or 'off'")
            return

        is_active = action == "on"

        pool = await get_pool()
        async with pool.acquire() as conn:
            # Get effective week
            ws = await conn.fetchval(
                """
                SELECT DISTINCT week_start FROM weekly_analysis
                WHERE final_score IS NOT NULL
                ORDER BY week_start DESC LIMIT 1
                """
            )
            if not ws:
                await update.message.reply_text("No analysis data available.")
                return

            result = await conn.execute(
                """
                UPDATE weekly_analysis
                SET is_active = $1, is_manually_overridden = true
                WHERE symbol = $2 AND week_start = $3
                """,
                is_active,
                symbol,
                ws,
            )

        status = "ACTIVATED" if is_active else "DEACTIVATED"
        await update.message.reply_text(
            f"✅ <b>{symbol}</b> {status} (manual override)",
            parse_mode="HTML",
        )

    # ────────────────────────────────────────────────────────────────
    # Command: /news
    # ────────────────────────────────────────────────────────────────

    async def cmd_news(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        pool = await get_pool()
        async with pool.acquire() as conn:
            events = await conn.fetch(
                """
                SELECT region, event_date, title, impact
                FROM economic_events
                WHERE event_date >= CURRENT_DATE
                ORDER BY event_date, impact DESC
                LIMIT 20
                """
            )

        if not events:
            await update.message.reply_text("No upcoming economic events.")
            return

        lines = ["<b>Upcoming Economic Events</b>\n"]
        for e in events:
            impact_icon = {"high": "🔴", "medium": "🟠", "low": "🟡"}.get(e["impact"], "⚪")
            dt = e["event_date"].strftime("%a %b %d")
            lines.append(f"{impact_icon} {dt} — {e['title']} ({e['region']})")

        await update.message.reply_text("\n".join(lines), parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Command: /drawdown
    # ────────────────────────────────────────────────────────────────

    async def cmd_drawdown(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        ws = self._week_start()
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Active markets
            active = await conn.fetch(
                """
                SELECT DISTINCT ON (symbol) symbol, is_active
                FROM weekly_analysis
                WHERE final_score IS NOT NULL
                ORDER BY symbol, week_start DESC
                """
            )
            active_symbols = [r["symbol"] for r in active if r["is_active"]]

            # Weekly trades
            trades = await conn.fetch(
                """
                SELECT symbol, result, pnl_percent
                FROM trades
                WHERE week_start = $1 AND result IN ('win', 'loss')
                """,
                ws,
            )

            # Open trades
            open_trades = await conn.fetchval(
                """
                SELECT COUNT(*) FROM trades
                WHERE result = 'open'
                """
            )

        weekly_pnl = sum(t["pnl_percent"] or 0 for t in trades)
        weekly_wins = sum(1 for t in trades if t["result"] == "win")
        weekly_losses = sum(1 for t in trades if t["result"] == "loss")

        text = (
            f"<b>This Week ({ws.strftime('%b %d')} - {(ws + timedelta(days=4)).strftime('%b %d')})</b>\n"
            f"├─ Active Markets: {len(active_symbols)}\n"
            f"├─ Open Trades: {open_trades or 0}\n"
            f"├─ Closed: {len(trades)} ({weekly_wins}W / {weekly_losses}L)\n"
            f"└─ Weekly P&L: {weekly_pnl:+.2f}%"
        )

        # Per-market breakdown
        if trades:
            text += "\n\n<b>By Market:</b>"
            market_pnl = {}
            for t in trades:
                s = t["symbol"]
                market_pnl[s] = market_pnl.get(s, 0) + (t["pnl_percent"] or 0)
            for s, pnl in sorted(market_pnl.items(), key=lambda x: x[1], reverse=True):
                emoji = "🟢" if pnl >= 0 else "🔴"
                text += f"\n  {emoji} {s}: {pnl:+.2f}%"

        await update.message.reply_text(text, parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Command: /report
    # ────────────────────────────────────────────────────────────────

    async def cmd_report(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        pool = await get_pool()
        async with pool.acquire() as conn:
            weeks = await conn.fetch(
                """
                SELECT week_start,
                       SUM(trades_taken) as total_trades,
                       SUM(wins) as total_wins,
                       SUM(losses) as total_losses,
                       SUM(total_pnl_percent) as total_pnl
                FROM weekly_results
                GROUP BY week_start
                ORDER BY week_start DESC
                LIMIT 4
                """
            )

        if not weeks:
            await update.message.reply_text("No weekly results available yet.")
            return

        lines = ["<b>Weekly Performance Report</b>\n"]

        cumulative = 0
        for w in reversed(weeks):
            ws = w["week_start"].strftime("%b %d")
            trades = w["total_trades"] or 0
            wins = w["total_wins"] or 0
            losses = w["total_losses"] or 0
            pnl = w["total_pnl"] or 0
            cumulative += pnl
            wr = (wins / trades * 100) if trades > 0 else 0
            emoji = "🟢" if pnl >= 0 else "🔴"
            lines.append(f"{emoji} {ws}: {pnl:+.2f}% ({trades}T, {wr:.0f}%WR)")

        lines.append(f"\n<b>Cumulative (4 weeks): {cumulative:+.2f}%</b>")

        await update.message.reply_text("\n".join(lines), parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Command: /config
    # ────────────────────────────────────────────────────────────────

    async def cmd_config(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        pool = await get_pool()
        async with pool.acquire() as conn:
            active_markets = await conn.fetchval(
                """
                SELECT COUNT(*) FROM weekly_analysis wa
                JOIN markets m ON m.symbol = wa.symbol
                WHERE wa.is_active = true
                  AND wa.week_start = (
                      SELECT MAX(week_start) FROM weekly_analysis WHERE final_score IS NOT NULL
                  )
                  AND m.category != 'stock'
                """
            )
            active_stocks = await conn.fetchval(
                """
                SELECT COUNT(*) FROM weekly_analysis wa
                JOIN markets m ON m.symbol = wa.symbol
                WHERE wa.is_active = true
                  AND wa.week_start = (
                      SELECT MAX(week_start) FROM weekly_analysis WHERE final_score IS NOT NULL
                  )
                  AND m.category = 'stock'
                """
            )
            latest = await conn.fetchval(
                "SELECT MAX(created_at) FROM weekly_analysis WHERE final_score IS NOT NULL"
            )

        ai_status = "ENABLED" if settings.ai_vision_enabled else "DISABLED"
        latest_str = latest.strftime("%a %b %d %H:%M UTC") if latest else "Never"

        text = (
            "<b>Configuration</b>\n"
            f"├─ Max Active Markets: {settings.max_active_markets} ({active_markets or 0} active)\n"
            f"├─ Max Active Stocks: {settings.max_active_stocks} ({active_stocks or 0} active)\n"
            f"├─ Min Final Score: {settings.min_final_score}\n"
            f"├─ AI Vision: {ai_status}\n"
            f"├─ Last Analysis: {latest_str}\n"
            f"└─ Learning Loop: {'ON' if settings.post_trade_review_enabled else 'OFF'}"
        )
        await update.message.reply_text(text, parse_mode="HTML")

    # ────────────────────────────────────────────────────────────────
    # Inline button callback handler
    # ────────────────────────────────────────────────────────────────

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        data = query.data
        if data.startswith("override:"):
            parts = data.split(":")
            if len(parts) == 3:
                symbol = parts[1]
                action = parts[2]
                is_active = action == "on"

                pool = await get_pool()
                async with pool.acquire() as conn:
                    ws = await conn.fetchval(
                        """
                        SELECT DISTINCT week_start FROM weekly_analysis
                        WHERE final_score IS NOT NULL
                        ORDER BY week_start DESC LIMIT 1
                        """
                    )
                    if ws:
                        await conn.execute(
                            """
                            UPDATE weekly_analysis
                            SET is_active = $1, is_manually_overridden = true
                            WHERE symbol = $2 AND week_start = $3
                            """,
                            is_active,
                            symbol,
                            ws,
                        )

                status = "ACTIVATED" if is_active else "DEACTIVATED"
                await query.edit_message_text(
                    f"✅ <b>{symbol}</b> {status} (manual override)",
                    parse_mode="HTML",
                )

    # ────────────────────────────────────────────────────────────────
    # Background notification loop
    # ────────────────────────────────────────────────────────────────

    async def _notification_loop(self):
        """Run scheduled notifications in the background."""
        last_daily_summary = None

        while self._running:
            try:
                now = datetime.now(timezone.utc)

                # Daily P&L summary — weekdays at 19:00 UTC
                if (
                    now.weekday() < 5
                    and now.hour == 19
                    and last_daily_summary != now.date()
                ):
                    last_daily_summary = now.date()
                    await self._send_daily_summary()

            except Exception:
                logger.exception("Notification loop error")

            await asyncio.sleep(60)  # Check every minute

    async def _send_daily_summary(self):
        """Send end-of-day P&L summary."""
        ws = self._week_start()
        pool = await get_pool()
        async with pool.acquire() as conn:
            trades = await conn.fetch(
                """
                SELECT symbol, result, pnl_percent
                FROM trades
                WHERE week_start = $1 AND result IN ('win', 'loss')
                """,
                ws,
            )

        if not trades:
            return

        weekly_pnl = sum(t["pnl_percent"] or 0 for t in trades)
        wins = sum(1 for t in trades if t["result"] == "win")
        losses = sum(1 for t in trades if t["result"] == "loss")
        today = date.today().strftime("%b %d")

        text = (
            f"📊 <b>Daily Summary ({today})</b>\n"
            f"├─ Closed this week: {len(trades)} ({wins}W / {losses}L)\n"
            f"└─ Weekly P&L: {weekly_pnl:+.2f}%"
        )
        await self.send(text)


# ────────────────────────────────────────────────────────────────
# Module-level convenience function (replaces telegram.py)
# ────────────────────────────────────────────────────────────────

# Global bot instance (set during startup)
_bot_instance: LongEntryBot | None = None


def get_bot() -> LongEntryBot | None:
    return _bot_instance


def set_bot(bot: LongEntryBot):
    global _bot_instance
    _bot_instance = bot


async def send_notification(text: str):
    """Send a notification via the bot (or fall back to HTTP POST)."""
    bot = get_bot()
    if bot and bot._running:
        await bot.send(text)
    else:
        # Fallback to simple HTTP POST (same as old telegram.py)
        from app.telegram import send_message
        send_message(text)
