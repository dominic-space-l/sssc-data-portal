"""Tests for backend.config and how create_app uses it.

Role: checks that settings are read from the environment and ``.env`` (with the real
environment winning), that missing Supabase settings still let the app boot, and that
malformed values and service-role keys are refused.

Usage:
    uv run pytest tests/test_config.py     # from map/backend/
"""

import base64
import dataclasses
import json

import pytest

import backend.config
from backend import CONFIG_KEY, create_app, get_config
from backend.config import DEFAULT_CACHE_MAX_AGE, Config, ConfigError

LOCAL_URL = "http://127.0.0.1:54321"


def _jwt(claims):
    """Builds an unsigned JWT-shaped string with the given payload.

    Args:
        claims: The payload as a dict.

    Returns:
        ``header.payload.signature``, base64url-encoded without padding.

    Usage:
        _jwt({"role": "anon"})
    """

    def encode(data):
        """Base64url-encodes JSON without padding.

        Args:
            data: A JSON-serializable value.

        Returns:
            The encoded string.

        Usage:
            encode({"alg": "HS256"})
        """
        raw = json.dumps(data).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode(claims)}.signature"


# ---------------------------------------------------------------------------------------
# Config.from_env with an explicit mapping
# ---------------------------------------------------------------------------------------


def test_defaults_when_nothing_is_set():
    """With no variables, Supabase is unconfigured and the cache age is the default.

    Usage:
        uv run pytest -k defaults
    """
    config = Config.from_env({})
    assert config == Config(None, None, DEFAULT_CACHE_MAX_AGE)
    assert not config.is_database_configured


def test_reads_and_strips_values():
    """Values are read and surrounding whitespace is removed.

    Usage:
        uv run pytest -k strips
    """
    config = Config.from_env(
        {"SUPABASE_URL": f"  {LOCAL_URL} ", "SUPABASE_KEY": " anon-key\n", "CACHE_MAX_AGE": "60"}
    )
    assert config == Config(LOCAL_URL, "anon-key", 60)
    assert config.is_database_configured


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_values_count_as_missing(blank):
    """A blank value is treated as unset, not as an empty setting.

    Args:
        blank: An empty or whitespace-only value.

    Usage:
        uv run pytest -k blank
    """
    config = Config.from_env({"SUPABASE_URL": blank, "SUPABASE_KEY": blank, "CACHE_MAX_AGE": blank})
    assert config == Config()


@pytest.mark.parametrize(
    ("url", "key"), [(LOCAL_URL, None), (None, "anon-key")], ids=["url-only", "key-only"]
)
def test_database_needs_both_url_and_key(url, key):
    """Only one of the two Supabase settings isn't enough.

    Args:
        url: SUPABASE_URL, or None.
        key: SUPABASE_KEY, or None.

    Usage:
        uv run pytest -k needs_both
    """
    assert not Config(url, key).is_database_configured


# ---------------------------------------------------------------------------------------
# Malformed values are refused
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["abc", "1.5", "5m"])
def test_cache_max_age_must_be_a_whole_number(value):
    """A non-integer CACHE_MAX_AGE is a startup error, not a silent default.

    Args:
        value: A malformed CACHE_MAX_AGE.

    Usage:
        uv run pytest -k whole_number
    """
    with pytest.raises(ConfigError, match="CACHE_MAX_AGE"):
        Config.from_env({"CACHE_MAX_AGE": value})


def test_cache_max_age_cannot_be_negative():
    """A negative cache age is refused, whether from the environment or directly.

    Usage:
        uv run pytest -k negative
    """
    with pytest.raises(ConfigError, match="CACHE_MAX_AGE"):
        Config.from_env({"CACHE_MAX_AGE": "-1"})
    with pytest.raises(ConfigError, match="CACHE_MAX_AGE"):
        Config(cache_max_age=-1)


def test_zero_cache_max_age_is_allowed():
    """Zero is valid and disables caching.

    Usage:
        uv run pytest -k zero
    """
    assert Config.from_env({"CACHE_MAX_AGE": "0"}).cache_max_age == 0


@pytest.mark.parametrize("url", ["127.0.0.1:54321", "ftp://example.com", "localhost"])
def test_supabase_url_must_be_http(url):
    """A SUPABASE_URL without an http(s) scheme is refused.

    Args:
        url: A malformed URL.

    Usage:
        uv run pytest -k must_be_http
    """
    with pytest.raises(ConfigError, match="SUPABASE_URL"):
        Config.from_env({"SUPABASE_URL": url})


# ---------------------------------------------------------------------------------------
# Service-role (secret) keys are refused
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "key",
    [
        "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz",
        _jwt({"iss": "supabase-demo", "role": "service_role", "exp": 1983812996}),
    ],
    ids=["new-style-secret", "legacy-service-role-jwt"],
)
def test_secret_keys_are_refused(key):
    """A key that bypasses row-level security can never be configured.

    Args:
        key: A secret or service-role key.

    Usage:
        uv run pytest -k secret_keys
    """
    with pytest.raises(ConfigError, match="service-role"):
        Config.from_env({"SUPABASE_URL": LOCAL_URL, "SUPABASE_KEY": key})


@pytest.mark.parametrize(
    "key",
    [
        "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
        _jwt({"iss": "supabase-demo", "role": "anon", "exp": 1983812996}),
        "not.a-jwt.at-all",
        _jwt(["role", "service_role"]),
    ],
    ids=["new-style-publishable", "legacy-anon-jwt", "three-dots-not-base64", "non-object-payload"],
)
def test_anon_and_unrecognized_keys_are_accepted(key):
    """Anon keys pass, and a key that can't be decoded isn't mistaken for a secret one.

    Args:
        key: An anon key or an opaque string.

    Usage:
        uv run pytest -k accepted
    """
    assert Config.from_env({"SUPABASE_KEY": key}).supabase_key == key


def test_config_is_immutable():
    """Settings can't be changed after the app is built.

    Usage:
        uv run pytest -k immutable
    """
    with pytest.raises(dataclasses.FrozenInstanceError):
        Config().cache_max_age = 1


# ---------------------------------------------------------------------------------------
# Config.from_env() with the real environment and .env
# ---------------------------------------------------------------------------------------


def test_env_file_is_loaded(clean_env, tmp_path):
    """With no argument, from_env loads map/backend/.env.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory for the .env file.

    Usage:
        uv run pytest -k env_file_is_loaded
    """
    env_file = tmp_path / ".env"
    env_file.write_text(f"SUPABASE_URL={LOCAL_URL}\nSUPABASE_KEY=anon-key\nCACHE_MAX_AGE=30\n")
    clean_env.setattr(backend.config, "ENV_FILE", env_file)

    assert Config.from_env() == Config(LOCAL_URL, "anon-key", 30)


def test_real_environment_wins_over_env_file(clean_env, tmp_path):
    """A variable set in the environment isn't overridden by .env.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory for the .env file.

    Usage:
        uv run pytest -k wins
    """
    env_file = tmp_path / ".env"
    env_file.write_text("SUPABASE_URL=http://from-file\nCACHE_MAX_AGE=30\n")
    clean_env.setattr(backend.config, "ENV_FILE", env_file)
    clean_env.setenv("SUPABASE_URL", "https://from-environment")

    config = Config.from_env()
    assert config.supabase_url == "https://from-environment"
    assert config.cache_max_age == 30


def test_missing_env_file_is_fine(clean_env, tmp_path):
    """No .env file (as in production) just means the environment alone is used.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory with no .env file in it.

    Usage:
        uv run pytest -k missing_env_file
    """
    clean_env.setattr(backend.config, "ENV_FILE", tmp_path / ".env")
    assert Config.from_env() == Config()


# ---------------------------------------------------------------------------------------
# create_app
# ---------------------------------------------------------------------------------------


def test_create_app_keeps_the_given_config():
    """An explicit Config is stored as-is and returned by get_config.

    Usage:
        uv run pytest -k keeps
    """
    config = Config(LOCAL_URL, "anon-key", 42)
    app = create_app(config)
    assert app.config[CONFIG_KEY] is config
    with app.app_context():
        assert get_config() is config


def test_create_app_without_config_reads_the_environment(clean_env, tmp_path):
    """With no Config, create_app reads the environment.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory with no .env file in it.

    Usage:
        uv run pytest -k reads_the_environment
    """
    clean_env.setattr(backend.config, "ENV_FILE", tmp_path / ".env")
    clean_env.setenv("CACHE_MAX_AGE", "7")
    assert create_app().config[CONFIG_KEY] == Config(cache_max_age=7)


def test_app_boots_and_answers_health_with_no_settings(clean_env, tmp_path):
    """With nothing configured at all, the app still starts and /api/health works.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory with no .env file in it.

    Usage:
        uv run pytest -k boots
    """
    clean_env.setattr(backend.config, "ENV_FILE", tmp_path / ".env")
    response = create_app().test_client().get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_create_app_refuses_a_malformed_environment(clean_env, tmp_path):
    """A malformed value stops the app from starting, with a clear error.

    Args:
        clean_env: Unsets the backend's variables for this test.
        tmp_path: A temporary directory with no .env file in it.

    Usage:
        uv run pytest -k malformed
    """
    clean_env.setattr(backend.config, "ENV_FILE", tmp_path / ".env")
    clean_env.setenv("SUPABASE_KEY", "sb_secret_abc")
    with pytest.raises(ConfigError, match="service-role"):
        create_app()
