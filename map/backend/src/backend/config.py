"""Runtime configuration for the map backend, read from the environment.

Role: turns environment variables (and, in development, ``map/backend/.env``) into
one immutable ``Config``. Missing Supabase settings are allowed, so the app still
boots and ``/api/health`` still answers. Malformed values, and a Supabase key that
would bypass row-level security, are refused at startup.

Settings:
    SUPABASE_URL    Project API URL, e.g. ``http://127.0.0.1:54321`` locally.
    SUPABASE_KEY    The anon (publishable) key. Never the service-role (secret) key.
    CACHE_MAX_AGE   Seconds browsers and proxies may cache layer responses. Default 300.

Usage:
    config = Config.from_env()   # os.environ, after loading map/backend/.env
    config = Config(supabase_url="http://127.0.0.1:54321", supabase_key="...")  # tests
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# map/backend/.env. The backend is installed in editable mode (uv's default), so this
# resolves to the source tree: src/backend/config.py -> parents[2] is map/backend/.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

DEFAULT_CACHE_MAX_AGE = 300


class ConfigError(ValueError):
    """A configuration value is present but unusable."""


@dataclass(frozen=True)
class Config:
    """Settings the backend needs, with Supabase values optional.

    Attributes:
        supabase_url: Supabase project API URL, or None if not configured.
        supabase_key: Supabase anon (publishable) key, or None if not configured.
        cache_max_age: Seconds layer responses may be cached.

    Usage:
        Config()                                   # nothing configured; health still works
        Config.from_env({"SUPABASE_URL": "...", "SUPABASE_KEY": "..."})
    """

    supabase_url: str | None = None
    supabase_key: str | None = None
    cache_max_age: int = DEFAULT_CACHE_MAX_AGE

    def __post_init__(self) -> None:
        """Validates the values, however the Config was built.

        Raises:
            ConfigError: If the URL isn't http(s), the key is a service-role (secret)
                key, or the cache age is negative.

        Usage:
            Config(cache_max_age=-1)  # raises ConfigError
        """
        if self.supabase_url is not None and not self.supabase_url.startswith(
            ("http://", "https://")
        ):
            raise ConfigError("SUPABASE_URL must start with http:// or https://.")
        if self.supabase_key is not None and _is_secret_key(self.supabase_key):
            raise ConfigError(
                "SUPABASE_KEY is a service-role (secret) key, which bypasses row-level "
                "security. The map backend must use the anon (publishable) key."
            )
        if self.cache_max_age < 0:
            raise ConfigError("CACHE_MAX_AGE must be zero or a positive number of seconds.")

    @property
    def is_database_configured(self) -> bool:
        """Whether both Supabase settings are present.

        Returns:
            True if ``supabase_url`` and ``supabase_key`` are both set.

        Usage:
            if not config.is_database_configured: ...
        """
        return self.supabase_url is not None and self.supabase_key is not None

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Config:
        """Builds a Config from environment variables.

        With no argument, it first loads ``ENV_FILE`` if it exists. Variables already
        set in the real environment win over the file. Blank values count as missing.

        Args:
            environ: Variables to read instead of ``os.environ``. Nothing is loaded
                from ``ENV_FILE`` when this is given.

        Returns:
            A validated Config.

        Raises:
            ConfigError: If a value is present but malformed (see ``__post_init__``),
                or CACHE_MAX_AGE isn't a whole number.

        Usage:
            Config.from_env()
            Config.from_env({"CACHE_MAX_AGE": "60"})
        """
        if environ is None:
            load_dotenv(ENV_FILE, override=False)
            environ = os.environ

        cache_max_age = DEFAULT_CACHE_MAX_AGE
        raw_cache = _clean(environ.get("CACHE_MAX_AGE"))
        if raw_cache is not None:
            try:
                cache_max_age = int(raw_cache)
            except ValueError:
                raise ConfigError(
                    f"CACHE_MAX_AGE must be a whole number of seconds, not {raw_cache!r}."
                ) from None

        return cls(
            supabase_url=_clean(environ.get("SUPABASE_URL")),
            supabase_key=_clean(environ.get("SUPABASE_KEY")),
            cache_max_age=cache_max_age,
        )


def _clean(value: str | None) -> str | None:
    """Strips whitespace and treats a blank value as missing.

    Args:
        value: A raw environment value, or None.

    Returns:
        The stripped value, or None if it was missing or blank.

    Usage:
        _clean("  x ")  # "x"
    """
    if value is None:
        return None
    value = value.strip()
    return value or None


def _is_secret_key(key: str) -> bool:
    """Recognizes Supabase keys that bypass row-level security.

    New-style secret keys start with ``sb_secret_``. Legacy keys are JWTs, and the
    service-role one carries ``"role": "service_role"`` in its payload. The payload is
    only decoded, not verified: this is a guard against pasting the wrong key, not an
    authentication check.

    Args:
        key: The configured Supabase key.

    Returns:
        True if the key is a secret or service-role key.

    Usage:
        _is_secret_key("sb_secret_...")  # True
    """
    if key.startswith("sb_secret_"):
        return True
    parts = key.split(".")
    if len(parts) != 3:
        return False
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return False
    return isinstance(claims, dict) and claims.get("role") == "service_role"
