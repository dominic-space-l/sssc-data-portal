"""Database access for the map backend: Supabase RPC calls with translated errors.

Role: the only module that talks to Supabase. Routes and layers depend on the
``Database`` protocol and call ``rpc(name, params)``. They never import ``supabase``,
so tests can swap in a fake. ``SupabaseDatabase`` adds a request timeout and turns
every failure into one of this module's exceptions, logging the details on the server
only:

    MaskingUnavailableError      the masking secret is missing (map_stations raised P0001)
    UpstreamError           Supabase failed, rejected the call, or couldn't be reached
    DatabaseNotConfiguredError   SUPABASE_URL or SUPABASE_KEY isn't set

The app's database is created on first use by ``get_database()`` and kept in
``app.extensions``, so the app boots, and ``/api/health`` works, without Supabase.

Usage:
    from backend.db import get_database
    rows = get_database().rpc("map_stations", {"p_project": 1})
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Mapping
from typing import Any, Protocol

import httpx
from flask import Flask, current_app
from postgrest.exceptions import APIError
from supabase import ClientOptions, create_client

from backend.config import CONFIG_KEY, Config

logger = logging.getLogger(__name__)

# Seconds to wait for Supabase on each call, covering connect and read.
DEFAULT_TIMEOUT = 10.0

# Key in app.extensions for the app's Database.
EXTENSION_KEY = "map_database"

# What map_private.mask_point raises when the Vault secret is missing (supabase S4).
MASKING_ERROR_CODE = "P0001"
MASKING_ERROR_MESSAGE = "location masking is not configured"

_init_lock = threading.Lock()


class DatabaseError(Exception):
    """Base class for database failures the API reports to clients."""


class UpstreamError(DatabaseError):
    """Supabase returned an error, or couldn't be reached in time."""


class MaskingUnavailableError(DatabaseError):
    """Location masking isn't configured, so no coordinates can be served."""


class DatabaseNotConfiguredError(DatabaseError):
    """SUPABASE_URL or SUPABASE_KEY is missing, so there is no database to call."""


class Database(Protocol):
    """What routes and layers need from the database: one RPC call at a time."""

    def rpc(self, name: str, params: Mapping[str, Any] | None = None) -> Any:
        """Calls a database function and returns its result.

        Args:
            name: Function name in the ``public`` schema, e.g. ``"map_stations"``.
            params: Named arguments. None or empty calls it with its defaults.

        Returns:
            The decoded JSON result: a list of row dicts for a set-returning
            function, or the value itself for one returning ``jsonb``.

        Raises:
            DatabaseError: A subclass describing what went wrong.

        Usage:
            db.rpc("map_filter_options")
        """
        ...


class SupabaseDatabase:
    """A Database backed by the Supabase client, with a timeout and error translation.

    Usage:
        db = SupabaseDatabase("http://127.0.0.1:54321", anon_key)
        db.rpc("map_stations", {"p_station": 3})
    """

    def __init__(
        self, url: str, key: str, *, timeout: float = DEFAULT_TIMEOUT, client: Any = None
    ) -> None:
        """Creates the Supabase client.

        Args:
            url: Supabase API URL.
            key: The anon (publishable) key. ``Config`` has already refused secret keys.
            timeout: Seconds to wait for each call.
            client: A ready client to use instead of creating one (tests).

        Usage:
            SupabaseDatabase(config.supabase_url, config.supabase_key)
        """
        self._client = client or create_client(
            url, key, ClientOptions(postgrest_client_timeout=timeout)
        )

    def rpc(self, name: str, params: Mapping[str, Any] | None = None) -> Any:
        """Calls a database function. See ``Database.rpc``.

        Args:
            name: Function name in the ``public`` schema.
            params: Named arguments, or None.

        Returns:
            The decoded JSON result.

        Raises:
            MaskingUnavailableError: The function raised the masking error.
            UpstreamError: Any other error from Supabase, or a network failure or
                timeout. The details are logged, not put in the exception message.

        Usage:
            db.rpc("map_stations", {"p_organization": 2})
        """
        try:
            return self._client.rpc(name, dict(params or {})).execute().data
        except APIError as err:
            if err.code == MASKING_ERROR_CODE and err.message == MASKING_ERROR_MESSAGE:
                logger.error("rpc %s: location masking is not configured in Vault", name)
                raise MaskingUnavailableError("location masking is not configured") from err
            logger.error(
                "rpc %s failed: code=%s message=%s details=%s hint=%s",
                name,
                err.code,
                err.message,
                err.details,
                err.hint,
            )
            raise UpstreamError(f"database call {name} failed") from err
        except httpx.HTTPError as err:
            logger.error("rpc %s: %s: %s", name, type(err).__name__, err)
            raise UpstreamError(f"database call {name} failed") from err


def init_database(app: Flask, database: Database | None = None) -> None:
    """Sets up the app's database slot.

    Args:
        app: The Flask app.
        database: A Database to use for every request (tests). If None, one is
            created from the app's Config on the first ``get_database()`` call.

    Usage:
        init_database(app)                   # create_app does this
        init_database(app, FakeDatabase())   # tests
    """
    app.extensions[EXTENSION_KEY] = database


def get_database() -> Database:
    """Returns the current app's Database, creating it on first use.

    Returns:
        The injected Database, or a SupabaseDatabase built from the app's Config.

    Raises:
        DatabaseNotConfiguredError: SUPABASE_URL or SUPABASE_KEY isn't set.

    Usage:
        Inside a request: ``get_database().rpc("map_filter_options")``.
    """
    app = current_app._get_current_object()
    database = app.extensions.get(EXTENSION_KEY)
    if database is not None:
        return database
    with _init_lock:
        database = app.extensions.get(EXTENSION_KEY)
        if database is None:
            database = _create_database(app.config[CONFIG_KEY])
            app.extensions[EXTENSION_KEY] = database
    return database


def _create_database(config: Config) -> Database:
    """Builds a SupabaseDatabase from settings.

    Args:
        config: The app's Config.

    Returns:
        A SupabaseDatabase.

    Raises:
        DatabaseNotConfiguredError: SUPABASE_URL or SUPABASE_KEY isn't set.

    Usage:
        _create_database(get_config())
    """
    if not config.is_database_configured:
        raise DatabaseNotConfiguredError("SUPABASE_URL and SUPABASE_KEY must both be set")
    return SupabaseDatabase(config.supabase_url, config.supabase_key)
