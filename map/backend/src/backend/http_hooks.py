"""HTTP concerns that apply to every response: caching headers and request logging.

Role: layer responses are public and stable (masked points don't move between
requests), so successful ones may be cached for ``CACHE_MAX_AGE`` seconds. Everything
else, including every error, is ``no-store``, so a temporary failure (a 503 while the
masking secret is missing) can never outlive its fix in a cache. Each request is also
logged as one line: method, path with query, status, and duration.

Usage:
    init_http(app)    # create_app does this
"""

from __future__ import annotations

import logging
import time

from flask import Flask, Response, current_app, g, request

from backend.config import CONFIG_KEY

logger = logging.getLogger("backend.requests")

# Endpoints whose successful responses may be cached: the layer routes.
CACHEABLE_ENDPOINTS = frozenset({"api.layers", "api.features", "api.feature_detail"})


def init_http(app: Flask) -> None:
    """Registers the caching and request-logging hooks.

    Args:
        app: The Flask app.

    Usage:
        init_http(app)
    """
    app.before_request(_start_timer)
    app.after_request(_set_cache_control)
    app.after_request(_log_request)


def _start_timer() -> None:
    """Records when the request started, for the log line.

    Usage:
        Called by Flask before each request.
    """
    g.request_started = time.perf_counter()


def _set_cache_control(response: Response) -> Response:
    """Lets caches keep successful layer responses, and nothing else.

    Args:
        response: The response about to be sent.

    Returns:
        The response, with ``Cache-Control`` set.

    Usage:
        Called by Flask after each request.
    """
    if response.status_code == 200 and request.endpoint in CACHEABLE_ENDPOINTS:
        max_age = _cache_max_age()
        response.headers["Cache-Control"] = f"public, max-age={max_age}"
    else:
        response.headers["Cache-Control"] = "no-store"
    return response


def _log_request(response: Response) -> Response:
    """Logs one line per request: method, path and query, status, duration.

    Args:
        response: The response about to be sent.

    Returns:
        The response, unchanged.

    Usage:
        Called by Flask after each request.
    """
    started = g.get("request_started")
    duration_ms = (time.perf_counter() - started) * 1000 if started is not None else 0.0
    path = request.full_path.rstrip("?")
    logger.info("%s %s %d %.1fms", request.method, path, response.status_code, duration_ms)
    return response


def _cache_max_age() -> int:
    """Reads CACHE_MAX_AGE from the app's Config.

    Returns:
        Seconds a layer response may be cached.

    Usage:
        _cache_max_age()
    """
    return current_app.config[CONFIG_KEY].cache_max_age
