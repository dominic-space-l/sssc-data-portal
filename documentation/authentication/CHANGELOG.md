# Authentication Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

## 0.2.1 — 2026-11-15

Documentation for the prototype, and an assessment of how its Supabase use fits with the map's.
- **`authentication/README.md`:** every section filled in. Overview with the two user types and a diagram of the flows, the "parts" submission format, Architecture, a directory guide for every file, Requirements, Quickstart (serving the pages from an assembled `public/` folder, which is the layout their `./auth/auth.js` import expects), Setup for a test project, every browser setting and Edge Function secret, Troubleshooting from the code's error messages, Testing, Development, and Security notes.
- **`documentation/authentication/supabase_assessment.md`:** lists every way the prototype and the map use Supabase, where the two conflict, and a recommended order of PRs to move authentication onto the repo's shared Supabase project: migrations and pgTAP tests, an explicit admin model in place of "any signed-in user", an `auth_private` schema covered by lint and drift, and the functions under `supabase/functions/`.
- **Root `README.md`:** overview of the authentication system, its row in the directory guide, and a link to its README. Also fixes a blank line that split the Run table in two.
- **`documentation/README.md`:** the directory guide lists the assessment.
- **Repo housekeeping:** `.vscode/` is no longer tracked. `.gitignore` now ignores the whole folder, including `extensions.json`, which was tracked before.
- **Hosted settings:** none changed.

**Files changed**
- `authentication/README.md`
- `documentation/authentication/supabase_assessment.md`
- `documentation/authentication/CHANGELOG.md`
- `documentation/README.md`
- `README.md`
- `.gitignore`
- `.vscode/extensions.json` (removed from version control)

## 0.2.0 — 2026-11-15

The authentication prototype (`05029be`, written 2026-10-26, merged in PR #23). It covers plan "Days" 1–4: connection checks, admin sign-in, access requests, one-time links, and multi-table submissions. It runs against a separate Supabase test project, not the repo's `supabase/` project.
- **Admin sign-in:** email and password through Supabase Auth, with sign-ups turned off in the dashboard. Any signed-in user is treated as the admin.
- **Access requests:** a public form with a Cloudflare Turnstile bot check. The `request-access` Edge Function saves the request to `private.access_requests`, limits each email to 3 pending requests per 24 hours, and emails an alert through Resend.
- **One-time links:** approving a request creates a single-use link that expires (`LINK_DAYS`, default 7). The admin sends it by hand.
- **Outside submissions:** `submit-external` checks the link, validates the rows against the `ALLOWED_TABLES` allowlist and the real columns, dry-runs the insert, uses up the link, and holds the submission in `private.pending_submissions` for review. It also serves dropdown rows from `LOOKUP_TABLES`.
- **Admin dashboard:** the `admin-api` Edge Function lists, approves, and rejects requests and submissions. An approved submission is saved in one transaction. A rejection can come with a fresh link. `submit_direct` lets the admin write to any table.
- **Multi-table "parts":** one submission can write to several tables, using `_id` labels and `{ "$ref": ... }` references to link new rows.
- **Database:** `sql/002_day2_rules.sql` turns on RLS for every `public` table, adds `to authenticated` select and insert policies, and creates the `private` schema with three tables. `sql/003_multi_table.sql` moves `pending_submissions` to the `parts` format. Both are run by hand in the SQL Editor.
- **Prototype pages:** home and checks, login, admin dashboard, direct-entry form, request access, submit by link, and a CSV upload placeholder. `auth/auth.js` holds every call the pages make.
- **Hosted settings (test project, set in the dashboard):** sign-ups off, `private` not in Exposed schemas, an admin user, and the Edge Function secrets.

**Files changed**
- `authentication/.gitignore`
- `authentication/package.json`
- `authentication/package-lock.json`
- `authentication/auth/auth.js`
- `authentication/prototype/admin.html`
- `authentication/prototype/config.example.js`
- `authentication/prototype/config.js`
- `authentication/prototype/csv-upload.html`
- `authentication/prototype/form.html`
- `authentication/prototype/index.html`
- `authentication/prototype/login.html`
- `authentication/prototype/request-access.html`
- `authentication/prototype/submit.html`
- `authentication/supabase/.gitignore`
- `authentication/supabase/config.toml`
- `authentication/supabase/functions/_shared/auth.ts`
- `authentication/supabase/functions/_shared/db.ts`
- `authentication/supabase/functions/_shared/email.ts`
- `authentication/supabase/functions/_shared/http.ts`
- `authentication/supabase/functions/_shared/links.ts`
- `authentication/supabase/functions/_shared/rows.ts`
- `authentication/supabase/functions/admin-api/index.ts`
- `authentication/supabase/functions/request-access/index.ts`
- `authentication/supabase/functions/send-test-email/index.ts`
- `authentication/supabase/functions/submit-external/index.ts`
- `authentication/supabase/sql/002_day2_rules.sql`
- `authentication/supabase/sql/003_multi_table.sql`

## 0.1.2 — 2026-11-12

Added [documentation/deployment_guide.md](../deployment_guide.md) for portal and authentication developers (`dba2849`). For authentication work it covers:
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

Added the README sections required by `documentation/CLAUDECODE/CLAUDE.md` (quickstart, setup, directory guide). They noted that there was no code yet. This changelog was created in the same batch of commits (`b642f4a`, `c003c6b`).

**Files changed**
- `authentication/README.md`
- `documentation/authentication/CHANGELOG.md`
- `documentation/CLAUDECODE/authentication_context.md`

## 0.1.0 — 2026-10-20

Created the `authentication/` directory with a README outline, and an empty agent context file. No code yet. (`21f747c`, `076a20f`)

**Files changed**
- `authentication/README.md`
- `documentation/CLAUDECODE/authentication_context.md`
