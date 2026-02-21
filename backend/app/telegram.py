"""
Telegram notification helper.

Sends alerts to a configured Telegram chat. Used by:
  - run_weekly_analysis.sh (after analysis: activated markets)
  - Future: DataSender health checks, error alerts

Setup:
  1. Create a bot via @BotFather → get the token
  2. Start a chat with the bot, send /start
  3. Get your chat_id via https://api.telegram.org/bot<TOKEN>/getUpdates
  4. Set env vars: LE_TELEGRAM_BOT_TOKEN, LE_TELEGRAM_CHAT_ID
"""

import logging
from urllib.request import Request, urlopen
from urllib.error import URLError
import json

from app.config import settings

logger = logging.getLogger(__name__)


def send_message(text: str) -> bool:
    """Send a Telegram message. Returns True on success, False on failure."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    if not token or not chat_id:
        logger.debug("Telegram not configured — skipping notification")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode()

    req = Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                logger.info("Telegram message sent")
                return True
            logger.warning("Telegram API returned %d", resp.status)
            return False
    except URLError:
        logger.exception("Failed to send Telegram message")
        return False
