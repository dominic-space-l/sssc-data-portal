# Environmental Monitoring Data Portal
## Background
## Technical
### Overview
Three sections:
- **Map**: Angular + Leaflet frontend, Flask backend (`map/`)
- **Portal**: Angular frontend (`portal/`)
- **Authentication**: (`authentication/`)

The Angular apps share one root `package.json` (npm workspaces), so a single `npm install` sets up every frontend.

### Quickstart
**Prerequisites**
- [Node.js](https://nodejs.org/) 24 (run `nvm use` in the repo root to pick up `.nvmrc`)
- [uv](https://docs.astral.sh/uv/), needed only for the map backend

You don't need to install the Angular CLI globally.

**Setup** (once, after cloning):
```sh
npm install
```

> Always run `npm install` from the repo root, not inside `map/frontend/` or `portal/frontend/`. Installing in an app folder creates a second `node_modules` and lockfile, which breaks the shared setup.

**Run**:

| What | Command | URL |
| --- | --- | --- |
| Map (frontend + API) | `npm run dev:map` | http://localhost:4200 (API on 5001) |
| Portal | `npm run start:portal` | http://localhost:4201 |

Other root scripts: `npm run build` and `npm test` run across all frontends.
For details, see each section's README ([map](map/README.md), [portal](portal/README.md)).

### Directory Guide
| Path | Contents |
| --- | --- |
| `map/frontend/` | Angular + Leaflet web map |
| `map/backend/` | Flask API for the map (uv project) |
| `portal/frontend/` | Angular web portal |
| `authentication/` | Authentication system |
| `documentation/` | Project docs and AI agent context |
| `pre_development/` | Database schema drafts (historical) |
