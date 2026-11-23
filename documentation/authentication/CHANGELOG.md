# Authentication Changelog

Versioning follows `xx.yy.zz` (see [documentation/CLAUDECODE/CLAUDE.md](../CLAUDECODE/CLAUDE.md)):
`xx` = major feature, `yy` = steps/commits toward a major feature, `zz` = small updates and revisions.

## 0.3.1 — 2026-11-23

- **Fixed:** rejecting a submission (Reject, Reject + new link) failed every time. `admin-api` wrote a `review_note` column that doesn't exist in `auth_private.pending_submissions`.
- **Added:** `admin-api` action `create_new_link { orgName, email, contactName? }`. It creates a new-data link without a request and stores it as an approved request, so the submission shows who it's from.

**Files changed**
- `supabase/functions/admin-api/index.ts`
- `documentation/authentication/CHANGELOG.md`

## 0.3.0 — 2026-11-16

Authentication moved onto the shared database and into the portal, following the [Supabase assessment](supabase_assessment.md). Elias's single combined form ("Enter information") is now a portal form.
- **Admin model:** an admins table. `auth_private.admins` lists which users are admins, and `auth_private.is_admin()` (security definer, empty `search_path`) checks the caller. Being signed in no longer means being an admin. Admins are managed by hand in the dashboard, not in the portal.
- **Migration A1 (`20261116220000_auth_private.sql`):** the `auth_private` schema with `admins`, `access_requests`, `access_links` and `pending_submissions` in their final shape (link kinds `new`/`edit`, update links tied to an organization, edits with before/after values). RLS on, every privilege revoked, default privileges revoked. `authenticated` gets only `USAGE` on the schema and `EXECUTE` on `is_admin()`.
- **Migration A2 (`20261116220100_auth_admin_read.sql`):** one `SELECT` policy per public table, `to authenticated using (auth_private.is_admin())`, listed by name. No `INSERT`/`UPDATE`/`DELETE` policies: writes go through the Edge Functions. `002_day2_rules.sql` is not used.
- **Tests:** `07_auth_private.test.sql` (schema locked down, `is_admin()` true only for listed users) and `08_auth_admin_read.test.sql` (catalog-driven: every authenticated policy is a SELECT tied to `is_admin()`; an admin reads every table, a signed-in non-admin sees nothing, anon is still refused).
- **CI:** `auth_private` added to `--schema` in `db:lint`, `database.yml` and `database-drift.yml`.
- **Edge Functions** moved to `supabase/functions/`, with `verify_jwt = false` set per function in `supabase/config.toml` (the functions check callers themselves). `admin-api` requires an admin (signed in and listed). Removed `send-test-email`, the `lookup` action (`select *` on `LOOKUP_TABLES`), raw `submit` for links, and `submit_direct` for admins: every write is built by a form builder, and parts may only name the builders' own tables (`FORM_TABLES`). `ALLOWED_TABLES`/`LOOKUP_TABLES` secrets are gone; `LINK_FORMS` replaces `ALLOWED_FORMS`.
- **Single combined form (`main`)** ported from the `/main` route on `Elias-new-branch`: contact, organization, project, station type and site (created if new), station, other organizations' roles, observation type, station contact, sensor, measurement unit, sensor placement, and device (manufacturer, model, station and sensor links). Saved all-or-nothing. Outside organizations' links offer only this form; admins get it plus the four separate forms.
- **Schema fit:** no writes to the generated `CoordinateLocation` columns; project and sensor names are unique across the database; one contact per station (`StationContact`'s key).
- **Links and emails** point to the portal's `/submit` and `/admin`.
- **Organization updates:** update links (one organization, many edits until expiry) for stations where it's Primary Owner, Secondary Owner or Maintainer, its contacts, and its devices and sensors. The admin sees before/after and approval stops if the row changed meanwhile.
- **Read-only MCP connector** (`supabase/functions/mcp`): AI apps sign in through Supabase's OAuth server as an admin and read through the A2 policies.
- **`supabase/config.toml`:** sign-ups off locally, `site_url` on the portal's port, OAuth server on with `/oauth/consent`.
- **Retired:** `authentication/supabase/` and `authentication/package.json` (CLI 2.x).
- **Hosted settings:** none changed yet.

**Files changed**
- `supabase/migrations/20261116220000_auth_private.sql`, `supabase/migrations/20261116220100_auth_admin_read.sql`
- `supabase/tests/07_auth_private.test.sql`, `supabase/tests/08_auth_admin_read.test.sql`
- `supabase/functions/` (new: `_shared/`, `admin-api/`, `request-access/`, `submit-external/`, `mcp/`)
- `supabase/config.toml`, `package.json`, `.github/workflows/database.yml`, `.github/workflows/database-drift.yml`
- `authentication/supabase/`, `authentication/package.json`, `authentication/package-lock.json` (removed)
- `authentication/README.md`, `README.md`, `documentation/authentication/CHANGELOG.md`

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
