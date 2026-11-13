"""Smoke test: what the map backend's anon key can and can't do on a Supabase project.

Role: checks, against a real Supabase project (local or hosted), the access rules the
map depends on (supabase_plan.md, S3-S6). With the key the backend is configured with:
    - the Stations and Contacts tables can't be read (permission denied, not just empty)
    - map_private.mask_point can't be called through the API
    - map_stations can be called, and returns rows with exactly the seven public columns
    - map_filter_options can be called, and returns exactly the five option lists
It reads SUPABASE_URL and SUPABASE_KEY the same way the backend does (environment, then
map/backend/.env), so it also refuses a service-role key. It prints only counts and
pass/fail lines, never coordinates or keys.

Usage (from map/backend/):
    uv run python scripts/smoke_supabase.py
    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon key> \
        uv run python scripts/smoke_supabase.py
Exits 0 if every check passes, 1 if any fails, and 2 if Supabase isn't configured.
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from postgrest.exceptions import APIError
from supabase import create_client

from backend.config import Config, ConfigError
from backend.db import DatabaseError, SupabaseDatabase

STATION_COLUMNS = {"station_id", "name", "code", "is_active", "lon", "lat", "roles"}
OPTION_LISTS = {"projects", "organizations", "station_types", "observation_types", "roles"}

# Postgres "insufficient_privilege": what S3's revokes produce for anon.
PERMISSION_DENIED = "42501"
# PostgREST "function not found in the exposed schemas".
FUNCTION_NOT_FOUND = "PGRST202"


@dataclass(frozen=True)
class Result:
    """One check's outcome.

    Attributes:
        name: What was checked.
        passed: Whether the rule held.
        detail: A short explanation, with no data values.
    """

    name: str
    passed: bool
    detail: str


def expect_api_error(name: str, call: Callable[[], Any], code: str) -> Result:
    """Passes if the call fails with the given PostgREST or Postgres error code.

    Args:
        name: Description of the check.
        call: The request to make.
        code: The expected error code.

    Returns:
        The Result. A call that succeeds fails the check, even with no rows: an empty
        result means the grants allow the read and only RLS is hiding the data.

    Usage:
        expect_api_error("Stations", lambda: client.table("Stations").select("*").execute(),
                         PERMISSION_DENIED)
    """
    try:
        response = call()
    except APIError as err:
        if err.code == code:
            return Result(name, True, f"refused with {err.code}")
        return Result(name, False, f"failed with {err.code}, expected {code}: {err.message}")
    rows = response.data if isinstance(response.data, list) else [response.data]
    return Result(name, False, f"succeeded and returned {len(rows)} row(s); expected {code}")


def check_map_stations(db: SupabaseDatabase) -> Result:
    """Passes if map_stations returns a list of rows with exactly the public columns.

    Args:
        db: The backend's database wrapper.

    Returns:
        The Result.

    Usage:
        check_map_stations(SupabaseDatabase(url, key))
    """
    name = "map_stations is callable and returns only the public columns"
    try:
        rows = db.rpc("map_stations")
    except DatabaseError as err:
        return Result(name, False, f"{type(err).__name__}: {err}")
    if not isinstance(rows, list):
        return Result(name, False, f"returned {type(rows).__name__}, not a list of rows")
    wrong = [sorted(set(row) ^ STATION_COLUMNS) for row in rows if set(row) != STATION_COLUMNS]
    if wrong:
        return Result(name, False, f"{len(wrong)} row(s) with unexpected columns: {wrong[0]}")
    return Result(name, True, f"{len(rows)} station(s)")


def check_map_filter_options(db: SupabaseDatabase) -> Result:
    """Passes if map_filter_options returns exactly the five option lists.

    Args:
        db: The backend's database wrapper.

    Returns:
        The Result.

    Usage:
        check_map_filter_options(SupabaseDatabase(url, key))
    """
    name = "map_filter_options is callable and returns the five option lists"
    try:
        options = db.rpc("map_filter_options")
    except DatabaseError as err:
        return Result(name, False, f"{type(err).__name__}: {err}")
    if not isinstance(options, dict) or set(options) != OPTION_LISTS:
        keys = sorted(options) if isinstance(options, dict) else type(options).__name__
        return Result(name, False, f"returned {keys}")
    counts = ", ".join(f"{len(options[key])} {key}" for key in sorted(OPTION_LISTS))
    return Result(name, True, counts)


def run_checks(config: Config) -> list[Result]:
    """Runs every check against the configured project.

    Args:
        config: Settings with SUPABASE_URL and SUPABASE_KEY set.

    Returns:
        One Result per check, in order.

    Usage:
        run_checks(Config.from_env())
    """
    client = create_client(config.supabase_url, config.supabase_key)
    db = SupabaseDatabase(config.supabase_url, config.supabase_key)
    return [
        expect_api_error(
            "Stations table can't be read",
            lambda: client.table("Stations").select("StationID").limit(1).execute(),
            PERMISSION_DENIED,
        ),
        expect_api_error(
            "Contacts table can't be read",
            lambda: client.table("Contacts").select("*").limit(1).execute(),
            PERMISSION_DENIED,
        ),
        expect_api_error(
            "mask_point isn't reachable through the API",
            lambda: client.rpc("mask_point", {"p_id": 1, "p_lon": 0, "p_lat": 0}).execute(),
            FUNCTION_NOT_FOUND,
        ),
        check_map_stations(db),
        check_map_filter_options(db),
    ]


def main() -> int:
    """Loads settings, runs the checks, and prints the results.

    Returns:
        The exit code: 0 all passed, 1 a check failed, 2 not configured.

    Usage:
        sys.exit(main())
    """
    try:
        config = Config.from_env()
    except ConfigError as err:
        print(f"Configuration error: {err}", file=sys.stderr)
        return 2
    if not config.is_database_configured:
        print("Set SUPABASE_URL and SUPABASE_KEY (or map/backend/.env).", file=sys.stderr)
        return 2

    print(f"Checking {urlsplit(config.supabase_url).hostname} with the configured anon key\n")
    results = run_checks(config)
    for result in results:
        print(f"{'PASS' if result.passed else 'FAIL'}  {result.name}: {result.detail}")
    failed = sum(not result.passed for result in results)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
