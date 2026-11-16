# Portal Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

## 0.3.0 — 2026-11-16

The portal's first real pages, connected to authentication (authentication 0.3.0), styled with the SSSC Brand & Style Guide.
- **Pages:** home, admin login, request access (with an "add new / update existing" choice), the link page (single form for new-data links; "Update existing" + "Add new" tabs for update links), admin data entry (`/forms` menu: Enter information, New project, New organization, New station, New device), admin dashboard (requests, submissions with previews, edits as before/after, "Create update link"), and the Claude connect page (`/oauth/consent`).
- **Forms:** one `DataForm` component draws every form from `form-definitions.ts`. The server checks every field; its error is shown under the field.
- **Style guide:** palette colors as CSS variables, Museo/Museo Sans/Museo Sans Condensed font stacks with system fallbacks (no font files: they're licensed), a text wordmark until SSSC provides an official logo file, the land acknowledgment in the footer, no photos.
- **Settings:** `src/app/settings.ts` defaults to the local Supabase stack. Only public values go there.
- **Dependencies:** `@supabase/supabase-js`. The initial bundle warning budget is now 750kB.
- **Tests:** the shell (name, menu, land acknowledgment) and the form definitions (unique keys, real dropdown lists, the single form's required fields match the server's).

**Files changed**
- `portal/frontend/src/` (app shell, `forms/`, `guards/`, `pages/`, `services/`, `settings.ts`, `styles.scss`, `index.html`)
- `portal/frontend/package.json`, `portal/frontend/angular.json`, `package-lock.json`
- `documentation/portal/CHANGELOG.md`

## 0.2.3 — 2026-11-12

Added [documentation/deployment_guide.md](../deployment_guide.md) for portal and authentication developers. It covers:
- how database changes reach the hosted Supabase project: PR, CI, merge, an approved deploy, and the nightly drift check
- what the `supabase-readonly` and `supabase-production` environments can do, and why they're separate
- how to develop and test against the local stack, including local URLs and keys, seed data, and local auth
- how to write `authenticated` policies, tables, and functions that pass the access tests
- how to test as a signed-in user in pgTAP, and what to do when a check fails

The guide's example test and its description of a failed deploy (the failing migration is rolled back and not recorded) were checked against the local stack. Linked it from `documentation/README.md` and `supabase/README.md`.

**Files changed**
- `documentation/deployment_guide.md`
- `documentation/README.md`
- `documentation/portal/CHANGELOG.md`

## 0.2.2 — 2026-10-30

Added the portal to the new GitHub Actions CI workflow (`.github/workflows/ci.yml`), which runs ESLint (angular-eslint, `portal` selector prefix), a Prettier format check, Vitest tests, and a production build. Prettier reformatted `app.html` and `index.html`, with no behavior changes.

**Files changed**
- `.github/workflows/ci.yml`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `portal/frontend/src/app/app.html`
- `portal/frontend/src/index.html`

## 0.2.1 — 2026-10-26

Brought the existing portal files in line with the rules in `documentation/CLAUDECODE/CLAUDE.md`:
- Added file headers and docstrings to all code. There are no behavior changes.
- Added setup instructions and a directory guide to the README.
- Replaced the Angular CLI boilerplate frontend README, which listed the wrong port (4200 instead of 4201).

**Files changed**
- `portal/README.md`
- `portal/frontend/README.md`
- `portal/frontend/src/main.ts`
- `portal/frontend/src/app/app.config.ts`
- `portal/frontend/src/app/app.routes.ts`
- `portal/frontend/src/app/app.ts`
- `portal/frontend/src/app/app.spec.ts`

## 0.2.0 — 2026-10-20

Added the portal frontend frame: an Angular app with the default CLI starter page, which is still a placeholder. Added it to the root npm workspace with a `start:portal` script. (`04b334f`)

**Files changed**
- `portal/README.md`
- `portal/frontend/.editorconfig`
- `portal/frontend/.gitignore`
- `portal/frontend/.prettierrc`
- `portal/frontend/.vscode/extensions.json`
- `portal/frontend/.vscode/launch.json`
- `portal/frontend/.vscode/tasks.json`
- `portal/frontend/README.md`
- `portal/frontend/angular.json`
- `portal/frontend/package.json`
- `portal/frontend/public/favicon.ico`
- `portal/frontend/src/app/app.config.ts`
- `portal/frontend/src/app/app.html`
- `portal/frontend/src/app/app.routes.ts`
- `portal/frontend/src/app/app.scss`
- `portal/frontend/src/app/app.spec.ts`
- `portal/frontend/src/app/app.ts`
- `portal/frontend/src/index.html`
- `portal/frontend/src/main.ts`
- `portal/frontend/src/styles.scss`
- `portal/frontend/tsconfig.app.json`
- `portal/frontend/tsconfig.json`
- `portal/frontend/tsconfig.spec.json`
- Shared root files: `.gitignore`, `.nvmrc`, `.vscode/extensions.json`, `package.json`, `package-lock.json`

## 0.1.0 — 2026-10-20

Created the `portal/` directory with a README outline. (`21f747c`)

**Files changed**
- `portal/README.md`
