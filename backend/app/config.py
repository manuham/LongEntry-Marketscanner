import hashlib
import hmac
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://longentry:longentry@localhost:5432/longentry"
    api_key_hash: str = ""  # SHA-256 hash of the API key
    log_level: str = "INFO"
    log_dir: str = "/var/log/longentry"

    # How many markets to activate per week (indices + commodities)
    max_active_markets: int = 6
    # How many stocks to activate per week (separate pool)
    max_active_stocks: int = 4
    min_final_score: float = 40.0

    # Anthropic API key for AI-powered outlook
    anthropic_api_key: str = ""

    # Telegram alerts & bot (optional)
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_bot_enabled: bool = True

    # AI Vision Analysis
    ai_vision_enabled: bool = True
    screenshot_dir: str = "/opt/longentry/screenshots"
    screenshot_quality: int = 85  # JPEG compression quality
    max_screenshot_size_mb: int = 5

    # Learning loop
    post_trade_review_enabled: bool = True
    dynamic_min_score_enabled: bool = True

    # Market context (free external APIs)
    market_context_enabled: bool = True

    model_config = {"env_prefix": "LE_", "env_file": ".env", "frozen": False}

    def verify_api_key(self, key: str) -> bool:
        if not self.api_key_hash:
            return False
        incoming_hash = hashlib.sha256(key.encode()).hexdigest()
        return hmac.compare_digest(incoming_hash, self.api_key_hash)


settings = Settings()
