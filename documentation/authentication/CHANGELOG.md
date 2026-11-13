# Authentication Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

## 0.1.2 — 2026-11-12

Added [documentation/deployment_guide.md](../deployment_guide.md) for portal and authentication developers. For authentication work it covers:
- the current role model: `anon` locked down, `authenticated` blocked by RLS until policies exist, `service_role` server-only
- why `to authenticated using (true)` is nearly public while sign-up is open
- testing as a signed-in user with `request.jwt.claims` and `auth.uid()`
- local auth (Studio users, Mailpit, and `site_url` still at the CLI default rather than the portal's port 4201)
- that hosted Auth settings are set in the dashboard, not deployed by the workflow, so changes to them belong in this changelog

**Files changed**
- `documentation/deployment_guide.md`
- `documentation/README.md`
- `documentation/authentication/CHANGELOG.md`

## 0.1.1 — 2026-10-26

Added the README sections required by `documentation/CLAUDECODE/CLAUDE.md` (quickstart, setup, directory guide). They note that there is no code yet.

**Files changed**
- `authentication/README.md`

## 0.1.0 — 2026-10-20

Created the `authentication/` directory with a README outline. No code yet. (`21f747c`)

**Files changed**
- `authentication/README.md`
