"""Tests for scripts/smoke_supabase.py, with fake Supabase clients and no network.

Role: checks every check in the smoke script both ways (the rule holds, the rule is
broken), the masking comparison against fake true and served points, argument parsing,
how the service-role key is read, the exit codes, and that the output never includes
coordinates or keys. The real version of these checks runs in CI against the local
stack (the "Map integration" job in .github/workflows/ci.yml).

Usage:
    uv run pytest tests/test_smoke_supabase.py      # from map/backend/
"""

import io
import re
from types import SimpleNamespace

import pytest
import smoke_supabase
from fakes import FakeDatabase
from postgrest.exceptions import APIError
from smoke_supabase import (
    FUNCTION_NOT_FOUND,
    PERMISSION_DENIED,
    Result,
    check_coordinates,
    check_map_filter_options,
    check_map_stations,
    distance_m,
    expect_api_error,
    main,
    parse_args,
    read_service_key,
    run_checks,
)

from backend import create_app
from backend.config import Config, ConfigError
from backend.db import MaskingUnavailableError, UpstreamError

CONFIG = Config(supabase_url="http://127.0.0.1:54321", supabase_key="anon-test-key")
SERVICE_KEY = "sb_secret_test_service_key"

# Meters per degree of latitude on the script's sphere.
M_PER_DEG_LAT = 2 * 3.141592653589793 * smoke_supabase.EARTH_RADIUS_M / 360

TRUTH = {1: (-135.3341, 57.0511), 2: (-135.2871, 57.0677)}


def api_error(code):
    """Builds the error PostgREST raises.

    Args:
        code: The PostgREST or Postgres error code.

    Returns:
        An APIError.

    Usage:
        raise api_error("42501")
    """
    return APIError({"message": f"error {code}", "code": code, "hint": None, "details": None})


def north(point, meters):
    """Moves a point north and rounds it to 4 decimals, as map_stations serves it.

    Args:
        point: ``(lon, lat)``.
        meters: How far north.

    Returns:
        The served ``(lon, lat)``.

    Usage:
        north(TRUTH[1], 300)
    """
    lon, lat = point
    return round(lon, 4), round(lat + meters / M_PER_DEG_LAT, 4)


def station_row(station_id, point):
    """A map_stations row served at ``point``.

    Args:
        station_id: The station id.
        point: The served ``(lon, lat)``.

    Returns:
        A row with exactly the public columns.

    Usage:
        station_row(1, north(TRUTH[1], 300))
    """
    lon, lat = point
    return {
        "station_id": station_id,
        "name": f"Station {station_id}",
        "code": f"S{station_id}",
        "is_active": True,
        "lon": lon,
        "lat": lat,
        "roles": [],
    }


OPTIONS = {key: [] for key in smoke_supabase.OPTION_LISTS}


class FakeQuery:
    """A chainable PostgREST request that returns canned data or raises a canned error."""

    def __init__(self, outcome):
        """Stores the outcome.

        Args:
            outcome: The rows to return, or an exception to raise from ``execute``.

        Usage:
            FakeQuery(api_error("42501"))
        """
        self.outcome = outcome

    def select(self, *args, **kwargs):
        """Returns self, like the real builder.

        Args:
            *args: Ignored.
            **kwargs: Ignored.

        Usage:
            query.select("*")
        """
        return self

    def limit(self, *args, **kwargs):
        """Returns self, like the real builder.

        Args:
            *args: Ignored.
            **kwargs: Ignored.

        Usage:
            query.limit(1)
        """
        return self

    def execute(self):
        """Returns the canned rows or raises the canned error.

        Returns:
            An object with ``data``.

        Usage:
            query.execute().data
        """
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return SimpleNamespace(data=self.outcome)


class FakeClient:
    """A supabase-py client whose tables and functions have canned outcomes.

    Usage:
        FakeClient(tables={"Stations": rows}, rpcs={"mask_point": api_error("PGRST202")})
    """

    def __init__(self, tables=None, rpcs=None):
        """Stores the outcomes.

        Args:
            tables: Table name to rows or exception.
            rpcs: Function name to result or exception.

        Usage:
            FakeClient(tables={"Stations": []})
        """
        self.tables = tables or {}
        self.rpcs = rpcs or {}

    def table(self, name):
        """Starts a request on a table.

        Args:
            name: The table.

        Returns:
            A FakeQuery.

        Usage:
            client.table("Stations")
        """
        return FakeQuery(self.tables.get(name, []))

    def rpc(self, name, params=None):
        """Starts a function call.

        Args:
            name: The function.
            params: Ignored.

        Returns:
            A FakeQuery.

        Usage:
            client.rpc("mask_point", {})
        """
        return FakeQuery(self.rpcs.get(name, []))


@pytest.fixture
def project(monkeypatch):
    """Replaces Supabase with fakes of a correctly locked-down project.

    The anon client is refused on the tables and can't reach mask_point. The
    service-role client reads TRUTH. The backend's database serves every station 300 m
    north of its true location. Tests change ``project.clients`` or ``project.db`` to
    break a rule.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Returns:
        A namespace with ``clients`` (key to FakeClient), ``db`` (the backend's
        FakeDatabase), and ``keys`` (each key a client was created with).

    Usage:
        def test_x(project): project.db.results["map_stations"] = []
    """
    anon = FakeClient(
        tables={
            "Stations": api_error(PERMISSION_DENIED),
            "Contacts": api_error(PERMISSION_DENIED),
        },
        rpcs={"mask_point": api_error(FUNCTION_NOT_FOUND)},
    )
    service = FakeClient(
        tables={
            "Stations": [
                {"StationID": i, "Longitude": str(lon), "Latitude": str(lat)}
                for i, (lon, lat) in TRUTH.items()
            ]
        }
    )
    state = SimpleNamespace(
        clients={CONFIG.supabase_key: anon, SERVICE_KEY: service},
        db=FakeDatabase(
            {
                "map_stations": [station_row(i, north(p, 300)) for i, p in TRUTH.items()],
                "map_filter_options": OPTIONS,
            }
        ),
        keys=[],
    )

    def fake_create_client(url, key):
        state.keys.append(key)
        return state.clients[key]

    monkeypatch.setattr(smoke_supabase, "create_client", fake_create_client)
    monkeypatch.setattr(smoke_supabase, "SupabaseDatabase", lambda url, key: state.db)
    monkeypatch.setattr(smoke_supabase, "create_app", lambda config: create_app(config, state.db))
    return state


# ---------------------------------------------------------------------------
# distance_m
# ---------------------------------------------------------------------------


def test_distance_is_zero_for_the_same_point():
    """Checks that a point is 0 m from itself.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k same_point
    """
    assert distance_m(*TRUTH[1], *TRUTH[1]) == 0


def test_distance_of_one_degree_of_latitude():
    """Checks the haversine against a degree of latitude on the same sphere.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k one_degree
    """
    assert distance_m(-135.0, 57.0, -135.0, 58.0) == pytest.approx(M_PER_DEG_LAT)


def test_distance_is_symmetric_and_shrinks_east_west_toward_the_poles():
    """Checks symmetry, and that a degree of longitude is shorter at Sitka than the equator.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k symmetric
    """
    there, back = distance_m(*TRUTH[1], *TRUTH[2]), distance_m(*TRUTH[2], *TRUTH[1])
    assert there == pytest.approx(back)
    assert distance_m(-135, 57, -134, 57) < distance_m(-135, 0, -134, 0)


# ---------------------------------------------------------------------------
# The access checks
# ---------------------------------------------------------------------------


def test_expect_api_error_passes_on_the_expected_code():
    """Checks that being refused with the expected code passes.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k expected_code
    """
    result = expect_api_error("x", FakeQuery(api_error(PERMISSION_DENIED)).execute, "42501")
    assert result == Result("x", True, "refused with 42501")


def test_expect_api_error_fails_on_another_code():
    """Checks that being refused for a different reason fails, naming both codes.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k another_code
    """
    result = expect_api_error("x", FakeQuery(api_error("PGRST301")).execute, "42501")
    assert not result.passed
    assert "PGRST301" in result.detail
    assert "42501" in result.detail


@pytest.mark.parametrize(("data", "rows"), [([], 0), ([{"a": 1}, {"a": 2}], 2), ({"a": 1}, 1)])
def test_expect_api_error_fails_when_the_call_succeeds(data, rows):
    """Checks that a call that succeeds fails, even with no rows (only RLS hid them).

    Args:
        data: What the call returns.
        rows: The row count the detail should report.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k succeeds
    """
    result = expect_api_error("x", FakeQuery(data).execute, "42501")
    assert not result.passed
    assert f"returned {rows} row(s)" in result.detail


def test_check_map_stations_passes_with_only_the_public_columns():
    """Checks the pass case, which reports the station count.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k stations_passes
    """
    db = FakeDatabase({"map_stations": [station_row(1, TRUTH[1]), station_row(2, TRUTH[2])]})
    result = check_map_stations(db)
    assert result.passed
    assert result.detail == "2 station(s)"


@pytest.mark.parametrize(
    "outcome",
    [
        [{**station_row(1, TRUTH[1]), "Latitude": 57.0511}],  # an extra column
        [{k: v for k, v in station_row(1, TRUTH[1]).items() if k != "roles"}],  # one missing
        {"station_id": 1},  # not a list of rows
        UpstreamError("database call map_stations failed"),
    ],
    ids=["extra-column", "missing-column", "not-a-list", "error"],
)
def test_check_map_stations_fails(outcome):
    """Checks that wrong columns, a wrong shape, or an error fail the check.

    Args:
        outcome: What map_stations returns or raises.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k stations_fails
    """
    assert not check_map_stations(FakeDatabase({"map_stations": outcome})).passed


def test_check_map_filter_options_passes_with_the_five_lists():
    """Checks the pass case, which reports a count for each list.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k options_passes
    """
    result = check_map_filter_options(FakeDatabase({"map_filter_options": OPTIONS}))
    assert result.passed
    assert "0 projects" in result.detail


@pytest.mark.parametrize(
    "outcome",
    [
        {k: [] for k in smoke_supabase.OPTION_LISTS if k != "roles"},
        {**OPTIONS, "contacts": []},
        [],
        MaskingUnavailableError("location masking is not configured"),
    ],
    ids=["missing-list", "extra-list", "not-an-object", "error"],
)
def test_check_map_filter_options_fails(outcome):
    """Checks that a missing or extra list, a wrong shape, or an error fail the check.

    Args:
        outcome: What map_filter_options returns or raises.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k options_fails
    """
    assert not check_map_filter_options(FakeDatabase({"map_filter_options": outcome})).passed


def test_run_checks_passes_on_a_locked_down_project(project):
    """Checks that all five checks pass, using only the anon key.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k locked_down
    """
    results = run_checks(CONFIG)
    assert [r.passed for r in results] == [True] * 5
    assert project.keys == [CONFIG.supabase_key]


def test_run_checks_fails_when_anon_can_read_a_table(project):
    """Checks that a readable Stations table fails, even when it returns no rows.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k anon_can_read
    """
    project.clients[CONFIG.supabase_key].tables["Stations"] = []
    results = {r.name: r.passed for r in run_checks(CONFIG)}
    assert results["Stations table can't be read"] is False
    assert results["Contacts table can't be read"] is True


# ---------------------------------------------------------------------------
# check_coordinates
# ---------------------------------------------------------------------------


def test_check_coordinates_passes_when_every_point_is_masked(project):
    """Checks every result passes when each station is served 300 m from its true location.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k every_point_is_masked
    """
    results = check_coordinates(CONFIG, SERVICE_KEY)
    assert [r.passed for r in results] == [True] * 5
    assert results[-1].detail == "offsets 300-300 m"
    assert project.keys == [SERVICE_KEY]


def test_check_coordinates_fails_on_an_unmasked_point(project):
    """Checks that a station served at its true location fails the check.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k unmasked
    """
    project.db.results["map_stations"][0] = station_row(1, north(TRUTH[1], 0))
    results = {r.name: r for r in check_coordinates(CONFIG, SERVICE_KEY)}
    unmasked = results["no served point is at its true location (to 4 decimal places)"]
    assert not unmasked.passed
    assert unmasked.detail == "1 station(s) unmasked"


@pytest.mark.parametrize("meters", [100, 800])
def test_check_coordinates_fails_outside_the_offset_band(project, meters):
    """Checks that a point too close to, or too far from, its station fails.

    Args:
        project: The fake project.
        meters: The served offset for station 2.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k offset_band
    """
    project.db.results["map_stations"][1] = station_row(2, north(TRUTH[2], meters))
    band = check_coordinates(CONFIG, SERVICE_KEY)[-1]
    assert not band.passed
    assert band.detail.startswith("1 outside")


def test_check_coordinates_fails_on_an_unknown_station(project):
    """Checks that a served station the true locations don't include fails.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k unknown_station
    """
    project.db.results["map_stations"].append(station_row(99, north(TRUTH[1], 300)))
    results = {r.name: r for r in check_coordinates(CONFIG, SERVICE_KEY)}
    assert results["every served station exists"].detail == "1 unknown id(s)"
    assert not results["every served station exists"].passed


def test_check_coordinates_stops_when_the_true_locations_cant_be_read(project):
    """Checks that a refused service-role read stops with one failure (wrong key?).

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k cant_be_read
    """
    project.clients[SERVICE_KEY].tables["Stations"] = api_error(PERMISSION_DENIED)
    [result] = check_coordinates(CONFIG, SERVICE_KEY)
    assert not result.passed
    assert "service-role key" in result.detail


def test_check_coordinates_stops_when_the_features_route_fails(project):
    """Checks that a failing features route stops after reporting its status and code.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k route_fails
    """
    project.db.results["map_stations"] = MaskingUnavailableError("not configured")
    results = check_coordinates(CONFIG, SERVICE_KEY)
    assert [r.passed for r in results] == [True, False]
    assert results[-1].detail == "503 masking_unavailable"


def test_check_coordinates_with_no_stations_served(project):
    """Checks that an empty features route passes, reporting no offsets.

    Args:
        project: The fake project.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k no_stations_served
    """
    project.db.results["map_stations"] = []
    results = check_coordinates(CONFIG, SERVICE_KEY)
    assert all(r.passed for r in results)
    assert results[-1].detail == "offsets none"


# ---------------------------------------------------------------------------
# Arguments and the service-role key
# ---------------------------------------------------------------------------


def test_parse_args_defaults():
    """Checks that no arguments means the access checks only.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k defaults
    """
    args = parse_args([])
    assert not args.check_coordinates
    assert not args.service_key_stdin


def test_parse_args_refuses_stdin_key_without_the_coordinate_check(capsys):
    """Checks that --service-key-stdin alone is a usage error (exit 2).

    Args:
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k refuses_stdin
    """
    with pytest.raises(SystemExit) as exit_info:
        parse_args(["--service-key-stdin"])
    assert exit_info.value.code == 2
    assert "--check-coordinates" in capsys.readouterr().err


def test_read_service_key_from_stdin(monkeypatch):
    """Checks that only the first line of standard input is read, stripped.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k from_stdin
    """
    monkeypatch.setattr("sys.stdin", io.StringIO(f"  {SERVICE_KEY}  \nsecond line\n"))
    assert read_service_key(from_stdin=True) == SERVICE_KEY


def test_read_service_key_prompts_without_echo(monkeypatch):
    """Checks that the default is a getpass prompt, stripped.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k prompts
    """
    prompts = []
    monkeypatch.setattr(
        smoke_supabase.getpass, "getpass", lambda prompt: prompts.append(prompt) or " key "
    )
    assert read_service_key(from_stdin=False) == "key"
    assert len(prompts) == 1


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


@pytest.fixture
def configured(monkeypatch):
    """Makes ``Config.from_env`` return CONFIG, so no real environment or .env is read.

    Args:
        monkeypatch: pytest's monkeypatch fixture.

    Returns:
        The monkeypatch, to change the Config further.

    Usage:
        def test_x(configured, project): main([])
    """
    monkeypatch.setattr(Config, "from_env", classmethod(lambda cls, environ=None: CONFIG))
    return monkeypatch


def test_main_exits_0_when_every_check_passes(configured, project, capsys):
    """Checks exit 0 and the summary line.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        project: The fake project.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k exits_0
    """
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "Checking 127.0.0.1" in out
    assert out.rstrip().endswith("5 passed, 0 failed")


def test_main_exits_1_when_a_check_fails(configured, project, capsys):
    """Checks exit 1 and a FAIL line when a rule is broken.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        project: The fake project.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k exits_1
    """
    project.clients[CONFIG.supabase_key].tables["Contacts"] = [{"Email": "x"}]
    assert main([]) == 1
    out = capsys.readouterr().out
    assert "FAIL  Contacts table can't be read" in out
    assert out.rstrip().endswith("4 passed, 1 failed")


def test_main_exits_2_when_not_configured(configured, capsys):
    """Checks exit 2 when SUPABASE_URL or SUPABASE_KEY is missing.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k not_configured
    """
    configured.setattr(Config, "from_env", classmethod(lambda cls, environ=None: Config()))
    assert main([]) == 2
    assert "Set SUPABASE_URL and SUPABASE_KEY" in capsys.readouterr().err


def test_main_exits_2_on_a_configuration_error(configured, capsys):
    """Checks exit 2 when a setting is malformed, such as a secret key as SUPABASE_KEY.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k configuration_error
    """

    def refuse(cls, environ=None):
        raise ConfigError("SUPABASE_KEY is a service-role (secret) key")

    configured.setattr(Config, "from_env", classmethod(refuse))
    assert main([]) == 2
    assert "Configuration error" in capsys.readouterr().err


def test_main_exits_2_without_a_service_key_before_any_check(configured, project, capsys):
    """Checks that an empty key fails fast: exit 2, and no Supabase client is created.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        project: The fake project.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k without_a_service_key
    """
    configured.setattr("sys.stdin", io.StringIO("\n"))
    assert main(["--check-coordinates", "--service-key-stdin"]) == 2
    assert "No service-role key" in capsys.readouterr().err
    assert project.keys == []


def test_main_checks_coordinates_without_printing_coordinates_or_keys(configured, project, capsys):
    """Checks the full run with --service-key-stdin, and that the output is safe to share.

    The script promises only counts, pass/fail lines, and the offset range: never a key
    or a coordinate.

    Args:
        configured: Fixture making Config.from_env return CONFIG.
        project: The fake project.
        capsys: pytest's output capture.

    Usage:
        uv run pytest tests/test_smoke_supabase.py -k without_printing
    """
    configured.setattr("sys.stdin", io.StringIO(f"{SERVICE_KEY}\n"))
    assert main(["--check-coordinates", "--service-key-stdin"]) == 0

    captured = capsys.readouterr()
    output = captured.out + captured.err
    assert output.rstrip().endswith("10 passed, 0 failed")
    assert project.keys == [CONFIG.supabase_key, SERVICE_KEY]
    for secret in (SERVICE_KEY, CONFIG.supabase_key):
        assert secret not in output
    served = [(row["lon"], row["lat"]) for row in project.db.results["map_stations"]]
    for lon, lat in [*TRUTH.values(), *served]:
        assert str(lon) not in output
        assert str(lat) not in output
    assert not re.search(r"\d+\.\d{3,}", output), "no coordinate-like numbers"
