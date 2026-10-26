# Portal Frontend

Angular web portal. Still the Angular CLI starter app.

## Quickstart
From the **repo root**:

```sh
npm run start:portal
```

Open http://localhost:4201. The page reloads automatically when you edit source files.

## Setup
1. Install [Node.js](https://nodejs.org/) 24 (`nvm install && nvm use` in the repo root reads `.nvmrc`).
2. From the **repo root**, run `npm install`. Don't run it in this folder: the frontends share one `node_modules` through npm workspaces, and installing here creates a second lockfile.

You don't need the Angular CLI installed globally. Run it through npm from the repo root:

```sh
npm run ng -w portal-frontend -- generate component component-name
npm run build -w portal-frontend    # production build into dist/
npm test -w portal-frontend         # Vitest unit tests
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
| `src/app/app.html` | Angular CLI starter page (placeholder) |
