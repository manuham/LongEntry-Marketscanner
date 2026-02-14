import logging
import sys
from pathlib import Path

from pythonjsonlogger.json import JsonFormatter

from app.config import settings


def setup_logging() -> None:
    formatter = JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )

    root = logging.getLogger()
    root.setLevel(settings.log_level)

    # Console handler (always)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    # File handler (if log dir exists)
    log_dir = Path(settings.log_dir)
    if log_dir.exists():
        from logging.handlers import TimedRotatingFileHandler

        file_handler = TimedRotatingFileHandler(
            log_dir / "api.log",
            when="midnight",
            backupCount=30,
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
