r"""Smoke test: what the map backend's anon key can and can't do on a Supabase project.

Role: checks, against a real Supabase project (local or hosted), the access rules the
map depends on (supabase_plan.md, S3-S6). With the key the backend is configured with:
    - the Stations and Contacts tables can't be read (permission denied, not just empty)
    - map_private.mask_point can't be called through the API
    - map_stations can be called, and returns rows with exactly the seven public columns
    - map_filter_options can be called, and returns exactly the five option lists
It reads SUPABASE_URL and SUPABASE_KEY the same way the backend does (environment, then
map/backend/.env), so it also refuses a service-role key there.

With --check-coordinates, it also checks the masking end to end. It prompts for the
service-role key (never pass it as an argument, where it would land in shell history),
uses it only to read the true station locations, and compares them with what the
backend's real features route serves with the anon key:
    - no served point equals its station's true location to 4 decimal places
    - every served point is 250-500 m from its station (235-515 m, allowing for rounding)
The key is never stored, logged, or put in the app's config. Output is only counts,
pass/fail lines, and the smallest and largest offsets: never coordinates or keys.
For non-interactive runs (CI), --service-key-stdin reads the key from the first line of
standard input instead of prompting. It still never goes on the command line.

Usage (from map/backend/):
    uv run python scripts/smoke_supabase.py
    uv run python scripts/smoke_supabase.py --check-coordinates   # prompts for the key
    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<anon key> \
        uv run python scripts/smoke_supabase.py
    printf '%s\n' "$SERVICE_ROLE_KEY" | \
        uv run python scripts/smoke_supabase.py --check-coordinates --service-key-stdin
Exits 0 if every check passes, 1 if any fails, and 2 if Supabase isn't configured or no
service-role key was given.
"""

from __future__ import annotations

import argparse
import getpass
import math
import sys
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from postgrest.exceptions import APIError
from supabase import create_client

from backend import create_app
from backend.config import Config, ConfigError
from backend.db import DatabaseError, SupabaseDatabase

STATION_COLUMNS = {"station_id", "name", "code", "is_active", "lon", "lat", "roles"}
OPTION_LISTS = {"projects", "organizations", "station_types", "observation_types", "roles"}

# Postgres "insufficient_privilege": what S3's revokes produce for anon.
PERMISSION_DENIED = "42501"
# PostgREST "function not found in the exposed schemas".
FUNCTION_NOT_FOUND = "PGRST202"

# The masking band (supabase S4), widened by the 4-decimal rounding, as in the pgTAP tests.
MIN_OFFSET_M = 235
MAX_OFFSET_M = 515
# Mean Earth radius (IUGG). Haversine on it is within about 0.5% of the ellipsoidal
# distance the database uses: under 3 m at 500 m, well inside the rounding slack.
EARTH_RADIUS_M = 6_371_008.8


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


def distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance between two WGS 84 points.

    Args:
        lon1: First longitude, in degrees.
        lat1: First latitude, in degrees.
        lon2: Second longitude, in degrees.
        lat2: Second latitude, in degrees.

    Returns:
        The distance in meters (haversine).

    Usage:
        distance_m(-135.33, 57.05, -135.3341, 57.0511)
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def check_coordinates(config: Config, service_key: str) -> list[Result]:
    """Compares the features route's points with the true station locations.

    Args:
        config: Settings with the anon key. The app is built from these, so the points
            come from the real route exactly as the public map gets them.
        service_key: The service-role key, used only to read the true locations.

    Returns:
        Results for: reading the true locations, serving the features, every served
        station being known, no point at its true location, and the offset band.

    Usage:
        check_coordinates(Config.from_env(), getpass.getpass())
    """
    truth_name = "true locations can be read with the service-role key"
    try:
        rows = (
            create_client(config.supabase_url, service_key)
            .table("Stations")
            .select("StationID,Longitude,Latitude")
            .execute()
            .data
        )
    except APIError as err:
        return [Result(truth_name, False, f"{err.code}: is this the service-role key?")]
    truth = {row["StationID"]: (float(row["Longitude"]), float(row["Latitude"])) for row in rows}
    results = [Result(truth_name, True, f"{len(truth)} station(s)")]

    response = create_app(config).test_client().get("/api/layers/stations/features")
    if response.status_code != 200:
        code = (response.get_json() or {}).get("error", {}).get("code")
        results.append(
            Result("the features route answers", False, f"{response.status_code} {code}")
        )
        return results
    features = response.get_json()["features"]
    results.append(Result("the features route answers", True, f"{len(features)} feature(s)"))

    unknown = [f["id"] for f in features if f["id"] not in truth]
    results.append(
        Result(
            "every served station exists",
            not unknown,
            f"{len(unknown)} unknown id(s)" if unknown else "all ids found",
        )
    )
    known = [f for f in features if f["id"] in truth]
    exact = [
        f["id"]
        for f in known
        if tuple(f["geometry"]["coordinates"]) == tuple(round(c, 4) for c in truth[f["id"]])
    ]
    results.append(
        Result(
            "no served point is at its true location (to 4 decimal places)",
            not exact,
            f"{len(exact)} station(s) unmasked" if exact else f"{len(known)} checked",
        )
    )
    offsets = {f["id"]: distance_m(*truth[f["id"]], *f["geometry"]["coordinates"]) for f in known}
    outside = [i for i, d in offsets.items() if not MIN_OFFSET_M <= d <= MAX_OFFSET_M]
    span = f"{min(offsets.values()):.0f}-{max(offsets.values()):.0f} m" if offsets else "none"
    results.append(
        Result(
            f"every served point is {MIN_OFFSET_M}-{MAX_OFFSET_M} m from its station",
            not outside,
            f"{len(outside)} outside, offsets {span}" if outside else f"offsets {span}",
        )
    )
    return results


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parses the command line.

    Args:
        argv: Arguments, or None for ``sys.argv``.

    Returns:
        The parsed options.

    Usage:
        parse_args(["--check-coordinates"])
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check-coordinates",
        action="store_true",
        help="also compare served points with the true locations (prompts for the "
        "service-role key)",
    )
    parser.add_argument(
        "--service-key-stdin",
        action="store_true",
        help="with --check-coordinates, read the service-role key from the first line of "
        "standard input instead of prompting (for CI)",
    )
    args = parser.parse_args(argv)
    if args.service_key_stdin and not args.check_coordinates:
        parser.error("--service-key-stdin only applies with --check-coordinates")
    return args


def read_service_key(from_stdin: bool) -> str:
    """Gets the service-role key for the coordinate check, without echoing it.

    Args:
        from_stdin: Read the first line of standard input instead of prompting.

    Returns:
        The key, stripped of surrounding whitespace. Empty if none was given.

    Usage:
        read_service_key(from_stdin=False)   # prompts
    """
    if from_stdin:
        return sys.stdin.readline().strip()
    return getpass.getpass("Service-role key (used for this check only, not stored): ").strip()


def main(argv: list[str] | None = None) -> int:
    """Loads settings, runs the checks, and prints the results.

    Args:
        argv: Command-line arguments, or None for ``sys.argv``.

    Returns:
        The exit code: 0 all passed, 1 a check failed, 2 not configured or no
        service-role key given.

    Usage:
        sys.exit(main())
    """
    args = parse_args(argv)
    try:
        config = Config.from_env()
    except ConfigError as err:
        print(f"Configuration error: {err}", file=sys.stderr)
        return 2
    if not config.is_database_configured:
        print("Set SUPABASE_URL and SUPABASE_KEY (or map/backend/.env).", file=sys.stderr)
        return 2
    # Ask for the key before any checks run, so a missing key fails fast.
    service_key = read_service_key(args.service_key_stdin) if args.check_coordinates else None
    if args.check_coordinates and not service_key:
        print("No service-role key given, so the coordinates can't be checked.", file=sys.stderr)
        return 2

    print(f"Checking {urlsplit(config.supabase_url).hostname} with the configured anon key\n")
    results = run_checks(config)
    if service_key:
        results += check_coordinates(config, service_key)
    for result in results:
        print(f"{'PASS' if result.passed else 'FAIL'}  {result.name}: {result.detail}")
    failed = sum(not result.passed for result in results)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
