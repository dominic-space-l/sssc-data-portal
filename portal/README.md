# Environmental Monitoring Database Web Portal
...
## Overview
...
## Architecture
...
### Backend
...
### Frontend
...
## Directory Guide
| Path | Contents |
| --- | --- |
| `frontend/` | Angular app. See [frontend/README.md](frontend/README.md). |
| `frontend/src/app/` | Root component (page shell), routes, and providers |
| `frontend/src/app/pages/` | One file per page: home, login, request access, link page, data entry, dashboard, update records, Claude connect |
| `frontend/src/app/forms/` | `form-definitions.ts` (every form's fields) and `DataForm`, which draws any of them |
| `frontend/src/app/services/portal-api.ts` | Every call to Supabase Auth and the Edge Functions |
| `frontend/src/app/settings.ts` | Public settings: Supabase URL and publishable key, Turnstile site key, contact email |
| `frontend/public/` | Static assets copied as-is into the build |

The backend is Supabase: the Edge Functions in [`supabase/functions/`](../supabase/functions/) and the `auth_private` migrations (see [authentication/README.md](../authentication/README.md)). The look follows the SSSC Brand & Style Guide. Planning docs and the changelog live in [`documentation/portal/`](../documentation/portal/).

## Usage
### Quickstart
Prerequisites: [Node.js](https://nodejs.org/) 24 (`nvm use` reads the repo's `.nvmrc`).

From the **repo root**:

```sh
npm install           # installs frontend deps for every app (npm workspaces)
npm run start:portal  # starts the Angular dev server
```

Open http://localhost:4201. The portal runs on port 4201 so it can run alongside the map (4200).

The Angular app lives in `frontend/`. There's no need to install the Angular CLI globally: run CLI commands through npm from the repo root, for example `npm run ng -w portal-frontend -- generate component foo`.
### Setup
One-time setup after cloning:

1. Install [Node.js](https://nodejs.org/) 24 (`nvm install && nvm use` in the repo root reads `.nvmrc`).
2. From the **repo root**, run `npm install`. This installs every frontend through npm workspaces. Don't run it inside `portal/frontend/`.

### Troubleshooting
...
### Configuration
...
### Testing
...
### Development
...