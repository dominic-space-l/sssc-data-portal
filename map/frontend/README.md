# Map Frontend

Angular + Leaflet web map. Talks to the Flask API in [`../backend`](../backend/) through the dev proxy.

## Quickstart
From the **repo root**:

```sh
npm run dev:map      # frontend + backend together
# or frontend only:
npm run start:map
```

Open http://localhost:4200. The page reloads automatically when you edit source files.

## Setup
1. Install [Node.js](https://nodejs.org/) 24 (`nvm install && nvm use` in the repo root reads `.nvmrc`).
2. From the **repo root**, run `npm install`. Don't run it in this folder: the frontends share one `node_modules` through npm workspaces, and installing here creates a second lockfile.

You don't need the Angular CLI installed globally. Run it through npm from the repo root:

```sh
npm run ng -w map-frontend -- generate component component-name
npm run build -w map-frontend    # production build into dist/
npm test -w map-frontend         # Vitest unit tests
```

## Directory Guide
| Path | Contents |
| --- | --- |
| `angular.json` | Angular CLI build, serve, and test configuration |
| `package.json` | This app's dependencies (installed from the repo root) |
| `public/` | Static assets copied as-is into the build |
| `src/main.ts` | Browser entry point |
| `src/styles.scss` | Global styles |
| `src/app/` | Root component (`app.ts`), routes (`app.routes.ts`), providers (`app.config.ts`) |
| `src/app/map/` | `MapView`: the Leaflet map. Draws each visible layer from the manifest, redraws it when its filters change, and shows an empty-state message (`empty-message.ts`) or an error with a Retry button (`error-message.ts`). Zoom is capped at 14. |
| `src/app/core/` | `models.ts`: types for the API contract. `map-api.ts`: `MapApi` (health, layers, features, detail), `filterParams`, and `describeApiError`. `map-state.ts`: `MapState`, the shared signals (manifest, filter values, load status). `setFilter` applies an option's `implies` (a project sets its organization) and undoes it when that filter changes, unless the user has set the implied filter by hand. |
| `src/app/layers/` | How layers look: `registry.ts` (marker style per layer id, with a default, and the Okabe–Ito `style_by` palette), `style-by.ts` (when `style_by` coloring applies and each feature's colors), `markers.ts` (SVG marker factory: solid, pie, and muted), `popup.ts` (popup built from the manifest's `popup_fields`) |
| `src/app/legend/` | `Legend`: the `style_by` colors while active, and the muted label when muted markers are drawn |
| `src/app/filter-panel/` | `FilterPanel`: one control per manifest filter (dropdown with "All", checkbox list, or checkbox), writing values to `MapState` |
| `src/app/status-badge/` | `StatusBadge`: the backend health badge |
| `proxy.conf.json` | Dev proxy: `/api/*` → `http://127.0.0.1:5001` |
