# Environmental Monitoring Data Portal
## Background
## Technical
### Overview
Three sections:
- **Map**: Angular + Leaflet frontend, Flask backend (`map/`)
- **Portal**: Angular frontend (`portal/`)
- **Authentication**: Supabase Auth and Edge Functions (Deno), with plain HTML/JS prototype pages (`authentication/`)

The Angular apps share one root `package.json` (npm workspaces), so a single `npm install` sets up every frontend.

### Authentication
Controls who can write data. The **admin** (SSSC staff) signs in with an email and password, enters data directly, and reviews everything else. **Outside organizations** don't get accounts. They request access, and if the admin approves, they get a **one-time link** to submit data once. Their submission is held for review and reaches the real tables only when the admin approves it. Email alerts go through Resend, and the request form has a Cloudflare Turnstile bot check.

It's currently a **prototype** that runs against a separate Supabase test project, not the shared database in `supabase/`. The pages are test pages, and the real interface will be part of the portal. See [authentication/README.md](authentication/README.md), and [documentation/authentication/supabase_assessment.md](documentation/authentication/supabase_assessment.md) for the plan to move it onto the shared database.

### Quickstart
**Prerequisites**
- [Node.js](https://nodejs.org/) 24.15 or newer (run `nvm install && nvm use` in the repo root to pick up `.nvmrc`). If you use nvm, also run `nvm alias default 24` so new terminals and editors don't fall back to an older Node.
- [uv](https://docs.astral.sh/uv/), needed only for the map backend
- [Docker](https://docs.docker.com/get-docker/), needed only for the local Supabase database. On Windows/WSL, install Docker Desktop and turn on **Settings → Resources → WSL integration** for your distro.

You don't need to install the Angular CLI or the Supabase CLI globally. `npm install` installs both locally. Run the Supabase CLI with `npx supabase ...` or the `db:*` scripts below. (`npm install -g supabase` isn't supported by Supabase.)

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
| Authentication prototype | Needs a Supabase test project; see [authentication/README.md](authentication/README.md#quickstart) | http://localhost:3000 |
| Local Supabase (Postgres, Studio) | `npm run db:start` (stop with `npm run db:stop`) | http://localhost:54323 (Studio) |

Other root scripts: `npm run build` and `npm test` run across all frontends. `npm run db:reset` rebuilds the local database from the migrations and seed, `npm run db:test` runs the pgTAP database tests, and `npm run db:lint` lints SQL functions and runs Supabase's security advisors.
For details, see each section's README ([map](map/README.md), [portal](portal/README.md), [authentication](authentication/README.md), [supabase](supabase/README.md)).

### Directory Guide
| Path | Contents |
| --- | --- |
| `map/frontend/` | Angular + Leaflet web map |
| `map/backend/` | Flask API for the map (uv project) |
| `portal/frontend/` | Angular web portal |
| `authentication/auth/` | `auth.js`: the sign-in and data-submission calls the pages make (meant to become a portal service) |
| `authentication/prototype/` | Bare-bones HTML test pages: login, admin dashboard, direct entry, request access, submit by link |
| `authentication/supabase/` | Authentication's Edge Functions and hand-run SQL, as a separate Supabase CLI project (for now) |
| `supabase/` | Supabase CLI project: config, schema migrations, seed data, and pgTAP tests |
| `.github/workflows/` | CI (`ci.yml`), database tests (`database.yml`), and the hosted database's gated deploy and nightly drift check (`database-deploy.yml`, `database-drift.yml`; see [supabase/README.md](supabase/README.md#deploy-and-drift-check-workflows)) |
| `.github/scripts/` | Helpers for those workflows |
| `documentation/` | Project docs and AI agent context |
| `pre_development/` | Database schema drafts (historical) |
