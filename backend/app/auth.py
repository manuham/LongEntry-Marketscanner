from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: str | None = Security(_api_key_header)) -> str:
    """Dependency that enforces API key authentication.

    If no LE_API_KEY_HASH is configured, authentication is skipped
    so the dashboard works out of the box.
    """
    if not settings.api_key_hash:
        return "no-auth"
    if api_key is None:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    if not settings.verify_api_key(api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key
