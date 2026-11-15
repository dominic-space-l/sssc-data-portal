# Map Testing Plan

Started 2026-11-15, after the map's 1.0 release. The goal: `map/backend/` and `map/frontend/` each have a full test suite, its coverage is measured and enforced, and CI runs every test the map has, including the ones that need a real database.

## Starting point

CI ([`ci.yml`](../../.github/workflows/ci.yml)) already ran both unit suites on every PR and push to `main`. The gaps were in what was measured and what never ran.

| Area | Tests | Coverage | Gap |
| --- | --- | --- | --- |
| Backend unit (`map/backend/tests/`) | 161, all passing | 99% (branch) | `main()`, and one branch in `db.py`. Nothing enforced it. |
| Backend integration (`test_integration.py`) | 7 | n/a | Never run in CI. They're deselected by default and skip without `SUPABASE_URL` and `SUPABASE_KEY`. |
| Smoke script (`scripts/smoke_supabase.py`) | 0 | 0%, and not measured | No tests. The `--check-coordinates` masking check only ran by hand, through an interactive prompt. |
| Frontend unit (`map/frontend/src/`) | 89 in 11 specs, all passing | Not measured | `@vitest/coverage-v8` wasn't installed |
| Frontend in a browser | 0 | n/a | The filters, role pies, legend, and project → organization (steps 13–16) were checked by hand |

`database.yml` starts only Postgres (`supabase db start`), with no API, so it can't run the backend's integration tests as it is.

## Decisions

- **Integration tests run in a third job in `ci.yml`, on every PR.** It costs a few minutes of Docker start-up, but the job always reports, so it can be a required check. (A path-filtered workflow that's skipped never reports, which blocks PRs from merging when it's required.)
- **Coverage thresholds:** 95% for the backend (branch coverage; it measured 99%). The frontend threshold is set just below what it measures.
- **Browser end-to-end tests (Playwright) are deferred.** See [Later](#later).

## Phases

### 1. Measure and enforce coverage

- Backend: add `pytest-cov` to the dev group. `[tool.coverage]` in `pyproject.toml` measures `src/` and `scripts/` with branch coverage, and fails under 95%. Coverage runs in the full-suite command (`uv run pytest --cov`, `npm run test:backend`, and CI), not on every `pytest` call, so running one file or the integration tests isn't failed by the threshold.
- Frontend: add `@vitest/coverage-v8`. `angular.json` turns coverage on for `ng test`, with thresholds, so `npm test` and CI enforce them.

### 2. Close the unit gaps

- Backend: test `main()`.
- Smoke script, using fakes and no network:
  - `distance_m`
  - `expect_api_error`, `check_map_stations`, and `check_map_filter_options`, passing and failing
  - `check_coordinates`, with fake true and served points
  - argument parsing, and `main`'s exit codes (0, 1, and 2)
  - that its output never includes coordinates or keys
- Frontend: whatever the coverage report shows is missing.

### 3. Integration and masking checks in CI

- The smoke script gets `--service-key-stdin`, which reads the service-role key from standard input, for non-interactive use. The key still never goes on the command line. The prompt stays the default.
- A new `ci.yml` job, **Map integration (local Supabase)**, does the following:
  1. starts the local stack with only what the backend needs (Postgres and the API)
  2. reads the local keys from `supabase status -o env`
  3. runs `pytest -m integration`
  4. runs the smoke script with `--check-coordinates`, passing the local stack's throwaway service-role key on standard input

  It needs no secrets and never touches the hosted project.
- A root `npm run test:backend:integration` script runs the same tests locally.

### 4. Documentation

The Testing sections of the map READMEs, the root README's scripts, the header comment in `ci.yml`, and the map changelog.

## Status (map 1.1.0)

Phases 1–4 are done.

| | Before | After |
| --- | --- | --- |
| Backend unit tests | 161, 99% of `src/`, not enforced | 201, 99.85% of `src/` and `scripts/`, fails under 95% |
| Frontend unit tests | 89, not measured | 99. 99.7% statements, 96.7% branches, 99.0% functions, 100% lines, with thresholds |
| Integration tests and masking check | By hand only | Every PR, against a local stack |

The integration job's Supabase start-up couldn't be run locally (no Docker), so its first CI run is the real check. If `supabase start` rejects a name in `--exclude`, drop that name from the list.

## Later

- **Browser end-to-end tests (Playwright)** against the frontend, the backend, and the local stack. They would cover the hand-checked steps 13–16, the error state and Retry, and popups, in a real browser. That probably means a fourth CI job, reusing phase 3's local stack.
