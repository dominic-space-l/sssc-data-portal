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
| `src/app/map/` | Leaflet map page (`MapView`) |
| `src/app/services/` | `Api`: HTTP client for the Flask backend |
| `src/assets.d.ts` | Lets TypeScript import `.png` files as URLs |
| `proxy.conf.json` | Dev proxy: `/api/*` → `http://127.0.0.1:5001` |
