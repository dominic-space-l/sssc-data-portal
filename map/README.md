# Environmental Monitoring Database Webmap
...
## Overview
...
## Architecture
...
### Backend
...
### Frontend
...
## Usage
### Quickstart
Prerequisites: [Node.js](https://nodejs.org/) 24 (`nvm use` reads the repo's `.nvmrc`) and [uv](https://docs.astral.sh/uv/).

From the **repo root**:

```sh
npm install        # installs frontend deps for every app (npm workspaces)
npm run dev:map    # starts the Flask API and the Angular dev server together
```

Open http://localhost:4200. You should see a Leaflet map, and the bottom-right badge should read `backend: ok`.

To run each side on its own:

| Part | Command (from repo root) | URL |
| --- | --- | --- |
| Frontend (Angular + Leaflet) | `npm run start:map` | http://localhost:4200 |
| Backend (Flask) | `npm run backend:map` (or `uv run backend` inside `map/backend/`) | http://localhost:5001/api/health |

In dev, the frontend proxies `/api/*` to the backend (`frontend/proxy.conf.json`). The API runs on port 5001 instead of 5000 because macOS AirPlay already uses 5000.
### Troubleshooting
...
### Configuration
...
### Testing
...
### Development
...