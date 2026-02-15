import hashlib
import hmac
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://longentry:longentry@localhost:5432/longentry"
    api_key_hash: str = ""  # SHA-256 hash of the API key
    log_level: str = "INFO"
    log_dir: str = "/var/log/longentry"

    # How many markets to activate per week
    max_active_markets: int = 6
    min_final_score: float = 40.0

    # Anthropic API key for AI-powered outlook
    anthropic_api_key: str = ""

    # Telegram alerts (optional)
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    model_config = {"env_prefix": "LE_", "env_file": ".env"}

    def verify_api_key(self, key: str) -> bool:
        if not self.api_key_hash:
            return False
        incoming_hash = hashlib.sha256(key.encode()).hexdigest()
        return hmac.compare_digest(incoming_hash, self.api_key_hash)


settings = Settings()
