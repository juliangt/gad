# backend/src/gad/logging_setup.py
import logging
import sys

import structlog

from gad.config import settings


def setup_logging() -> None:
    renderer = (
        structlog.processors.JSONRenderer()
        if settings.environment == "prod"
        else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
