# Map Backend

Flask API that serves data to the map frontend. Right now it has a single health-check route. See [the map plan](../../documentation/map/map_app_plan.md) for what comes next.

## Quickstart
From the repo root:

```sh
npm run backend:map   # or, from this folder: uv run backend
curl http://localhost:5001/api/health   # → {"status": "ok"}
```

The server runs on port 5001 because macOS AirPlay uses 5000. The port is set by `PORT` in `src/backend/__init__.py` and must match `../frontend/proxy.conf.json`.

## Setup
1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. From this folder, run `uv sync`. This installs Python (version from `.python-version`) and the dependencies from `uv.lock` into `.venv`.

To add a dependency, run `uv add <package>`, or `uv add --dev <package>` for test-only tools. Commit `pyproject.toml` and `uv.lock` with the change.

## Testing
```sh
uv run pytest
```

## Directory Guide
| Path | Contents |
| --- | --- |
| `pyproject.toml` | Project metadata, dependencies, and the `backend` run script |
| `uv.lock` | Locked dependency versions (commit this) |
| `.python-version` | Python version uv uses |
| `src/backend/__init__.py` | App factory (`create_app`), routes, and dev-server entry point (`main`) |
| `tests/` | pytest tests |
