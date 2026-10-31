# Portal Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

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
