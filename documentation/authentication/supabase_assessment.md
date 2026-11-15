# Supabase in Authentication and Map: Assessment

Written 2026-11-15 (authentication `0.2.1`), after the authentication prototype was merged in PR #23. It lists how `authentication/` and `map/` each use Supabase, where they conflict, and whether and how they should be unified. It's an assessment, not a plan: each recommendation below would get its own plan and PR.

## Summary

The two sections use Supabase in opposite ways.

- **Map** works inside the repo's shared Supabase project (`supabase/`). Every schema change is a reviewed migration with pgTAP tests, CI, a gated deploy, and a nightly drift check. At runtime it holds only the public anon key, and can only call two allowlisted, `security definer` functions.
- **Authentication** is a separate Supabase CLI project (`authentication/supabase/`) pointed at a separate **test** project. Its schema changes are SQL scripts run by hand in the dashboard. Its Edge Functions connect to Postgres as `postgres` and enforce access in TypeScript. Its policies grant every signed-in user read and insert on every table.

**Recommendation: unify the database layer, not the application code.** There should be one Supabase project and one source of truth for schema and access rules: the root `supabase/` folder. Authentication's tables, policies, and functions should move there as migrations with tests, and the access model should be tightened on the way. The runtimes should stay separate: Flask with `supabase-py` for the map, Deno Edge Functions and `supabase-js` for authentication. They do different jobs, and there's no client code worth sharing between them.

The most important finding: **`002_day2_rules.sql` must not be run against the hosted production project as written.** It would let any signed-in user read true station coordinates and contact details. It would also become drift (see [Conflicts](#conflicts)).

## How each section uses Supabase

### Authentication

| Supabase feature | Where | What it does |
| --- | --- | --- |
| Auth (email and password) | `auth.js` `login`, `logout`, `getUser`, `onAuthChange` | Admin sign-in. Sign-ups are turned off in the test project's dashboard. |
| Auth REST API (`/auth/v1/user`) | `_shared/auth.ts` `getCaller` | `admin-api` checks the caller's token. Any valid user passes. |
| Data API (PostgREST) from the browser, as `anon` or `authenticated` | `auth.js` `testConnection`, `submitForm`, and the three checks | Direct reads and inserts on `public` tables, which rely on the `to authenticated` policies |
| Edge Functions (Deno) | `request-access`, `submit-external` (public, `--no-verify-jwt`), `admin-api`, `send-test-email` | Every flow that needs a secret or the `private` schema |
| Direct Postgres (`SUPABASE_DB_URL`, as `postgres`) | `_shared/db.ts`, used by all three real functions | Reads and writes `private.*`. Inserts approved rows into `public` tables. Bypasses RLS and grants. |
| Function secrets | `supabase secrets set` | Resend and Turnstile keys, `SITE_URL`, the `ALLOWED_TABLES` and `LOOKUP_TABLES` allowlists, `LINK_DAYS` |
| Schema (hand-run SQL) | `sql/002_day2_rules.sql`, `sql/003_multi_table.sql` | RLS and `to authenticated` policies on every `public` table, plus the `private` schema with three tables |
| CLI project | `authentication/supabase/config.toml`, `authentication/package.json` (CLI 2.x) | Linking and function deploys. Unchanged `supabase init` defaults. |

### Map

| Supabase feature | Where | What it does |
| --- | --- | --- |
| CLI project | `supabase/` (root), CLI 3.x from the root `package.json` | Local stack, migrations, seed, pgTAP tests |
| Migrations | `supabase/migrations/` | Baseline schema, keys and coordinates, anon lockdown (S3), masking (S4), and the map functions (S5, S6) |
| CI, deploy, and drift | `.github/workflows/database*.yml` | Tests, lint, and advisors on every PR. A gated `db push` after merge. A nightly comparison of the hosted database with the repo. |
| Data API (PostgREST), RPC only, as `anon` | `map/backend/src/backend/db.py` | Calls `map_stations` and `map_filter_options`. Nothing else is reachable. |
| Vault | `map_location_mask_secret` | The secret used to mask coordinates. Set by hand, never in a migration. |
| Key guard | `map/backend/src/backend/config.py` | Refuses to start with a service-role or secret key |

### Side by side

| | Map | Authentication |
| --- | --- | --- |
| Supabase project | Hosted production project (`cmxvpikgbetmesmpiubt`) | A separate test project (`hehharhdxezekqongisc`, in `prototype/config.js`) |
| CLI project | `supabase/` | `authentication/supabase/` |
| CLI version | 3.x | 2.x |
| Schema changes | Migrations, through PR, CI, and an approved deploy | SQL Editor by hand |
| Tests | pgTAP in CI | Manual checks panel |
| Runtime role | `anon` only | Browser: `anon` and `authenticated`. Functions: `postgres`. |
| Where access is enforced | In the database (grants, RLS, function allowlist) | Mostly in TypeScript (`rows.ts` allowlists, `getCaller`) |
| Private schema | `map_private`, covered by lint and drift | `private`, covered by neither |
| Secrets | Vault, set by hand | Edge Function secrets |
| Table names | Quoted PascalCase (`"Stations"`) | The same. They agree. |

## Conflicts

Ordered by importance.

### 1. Policies that make every signed-in user an admin

`002_day2_rules.sql` loops over every table in `public` and creates `for select to authenticated using (true)` and `for insert to authenticated with check (true)`. It also grants `select, insert` on all tables to `authenticated`. On the production schema, that means any signed-in user can read:

- `Stations` and `StationSites`: **true coordinates**, which the map goes to great lengths to mask
- `Contacts`: personal data

The [deployment guide](../deployment_guide.md#giving-signed-in-users-access-policies) warns against exactly this pattern. It's safe only while sign-ups are off, and that setting is a dashboard toggle that isn't recorded in the repo. Both local `config.toml` files still have `enable_signup = true`.

**CI wouldn't catch it.** `supabase/tests/03_anon_rls.test.sql` rejects policies for `anon` and `PUBLIC`, but these policies name `authenticated`, so they pass.

### 2. The Edge Functions rely on the same assumption, with full database access

`getCaller` says it outright: "Sign-ups are off, so a logged-in user is the admin." `admin-api` checks only that the caller has a valid token. All three functions connect as `postgres`, so the database applies no limits of its own:

- `submit_direct` (`anyTable: true`) inserts into **any** `public` table. The only check is that the table exists in `public` (`writableKeys`).
- `readLookup` runs `select *` on any table in `LOOKUP_TABLES`, for anyone holding a valid link. If someone added `Stations` or `Contacts` there, true coordinates or contact details would go to outside organizations.
- The dry run (insert, then roll back) runs real inserts as `postgres`. Any triggers fire, and sequence values are used up.

The map does the opposite: least privilege in the database, and an application that can't exceed it even when it's wrong.

### 3. Two projects, two CLI setups

- The prototype's tables and functions exist only in the test project. Nothing in the production schema, the local stack, or CI knows about them.
- Both `config.toml` files use the same local ports (54321–54324), so the two local stacks can't run at the same time.
- `authentication/package.json` pins CLI 2.x, outside the root npm workspaces. The root README says to run `npm install` only from the root. `package.json` also points at a personal repository (`dominic-space-l/sssc-data-portal`).

### 4. Hand-run SQL instead of migrations

If `002` and `003` were run in the production dashboard:

- the nightly drift check would fail on the schema difference
- the policies would be live without a review, a test, or an approved deploy
- local databases and CI wouldn't have the `private` tables, so nothing built on them could be tested

There's no `001_*.sql` in the repo. Either Day 1 had no SQL, or it wasn't committed.

### 5. The `private` schema

- The name is generic. Following `map_private`, it would be `auth_private`, which also says whose it is.
- `db:lint`, the drift check, and the advisors cover only `public` and `map_private`. A new schema has to be added in three places (see the [deployment guide](../deployment_guide.md#new-schemas)).
- It correctly has RLS on, all privileges revoked, and isn't exposed. That should carry over.

### 6. Edge Functions are outside the deploy path

- The root has no `supabase/functions/`, and no workflow deploys functions.
- Whether a function verifies JWTs is a command-line flag (`--no-verify-jwt`) that someone has to remember. It belongs in `config.toml` (`[functions.request-access] verify_jwt = false`).
- Deploying functions needs a Supabase **access token** (the Management API). The database workflows deliberately avoid access tokens, because a token reaches every project in its owner's account. So automating function deploys is a real trade-off, not just a copy of the database workflow.

### 7. Smaller items

- `send-test-email` says to delete it after Day 1.
- The functions build links to `/submit.html` and `/admin.html`. These will need to follow the portal's routes.
- CORS is `*` on every function. That's acceptable for the public ones, but `admin-api` could be limited to the portal's origin.
- `prototype/config.js` is committed. Its values are public by design, but it ties the repo to the test project.
- `documentation/CLAUDECODE/authentication_context.md` has a placeholder title copied from the map ("Context for `.map/`").

## What already lines up

- Both sections keep the secret key out of the browser. The prototype's browser code holds only the publishable key.
- Both put server-only tables in a schema the API doesn't expose, with RLS on and grants revoked.
- Both use the production table names (quoted PascalCase), so the prototype's SQL and allowlists will work against the real schema.
- Both check data before writing it. The prototype validates columns against `information_schema`, dry-runs inserts, and saves an approved submission in one transaction.

## Should they be unified?

| Layer | Unify? | Why |
| --- | --- | --- |
| Supabase project (hosted) | **Yes** | The portal writes the same tables the map reads. Two projects mean two copies of the data. |
| CLI project and version | **Yes** | One `supabase/`, one `config.toml`, one CLI version, and no port clashes |
| Schema, policies, and grants | **Yes**, as migrations with pgTAP tests | The repo is the source of truth. CI, drift, and review then cover authentication too. |
| Edge Function source | **Yes**, in `supabase/functions/` | That's where the CLI expects functions, next to the config that sets `verify_jwt` |
| Access principles | **Yes** | Least privilege, explicit allowlists in the database, fail closed. The same rules the map follows. |
| Application runtime and client code | **No** | Flask with `supabase-py` (public, read-only RPC) and Deno or `supabase-js` (admin writes, email, bot checks) do different jobs. Shared code would add coupling with nothing to gain. |
| The map's "anon calls definer functions" pattern | **Partly** | It fits the public pieces: a definer function returning `id, name` for dropdowns instead of `select *`. Admin writes need an authenticated, authorized path instead. |

## Recommended path

Each step is a PR through the normal migration path in the [deployment guide](../deployment_guide.md). Steps 1 and 2 come first, because everything after them depends on the admin model.

0. **Decide the admin model** (a team decision). Two common options:
   - **An admins table** (recommended): `auth_private.admins (user_id uuid references auth.users)`, plus `auth_private.is_admin()` as a `security definer` function with `search_path = ''`. It's easy to test with pgTAP and easy to audit, and adding or removing an admin takes effect immediately.
   - **A JWT claim:** set `app_metadata.role = 'admin'` and check `auth.jwt()`. This needs no table, but a change takes effect only after the user's token refreshes, and the claim is set outside migrations.

   Either way, "signed in" stops meaning "admin", and opening sign-ups for the portal later doesn't hand out admin access.
1. **Migration: `auth_private` schema.** Create the three tables in their final (post-`003`) shape, with RLS on and everything revoked. Add the schema to `db:lint`, `database.yml`, and `database-drift.yml`. Add pgTAP tests that check `anon` and `authenticated` can't reach the schema.
2. **Migration: admin access.** Add the admin model from step 0. Write `to authenticated using (auth_private.is_admin())` policies **per table, for the operations the portal actually needs**, not a loop over every table. Test both sides: an admin can, a signed-in non-admin can't, and `anon` can't. Consider extending `03_anon_rls.test.sql`, or adding a test, to flag any `using (true)` policy.
3. **Move the functions** to `supabase/functions/`. Set `verify_jwt` per function in the root `config.toml`. Make `getCaller` check `is_admin`, not just that the user exists. Delete `send-test-email`.
4. **Narrow the functions' database access.** Option A: a dedicated login role (for example `auth_writer`) with `usage` on `auth_private` and `insert` on the `ALLOWED_TABLES` tables only, used for the outside-submission path. Option B: `security definer` functions in `auth_private` that do the writes, which the Edge Functions call. Either one puts a database-side limit behind the TypeScript checks. Replace `select *` in `readLookup` with explicit columns.
5. **Deploy and secrets.** Document `supabase functions deploy` and `secrets set` for the production project in `supabase/README.md`. Decide whether to automate function deploys, given the access-token trade-off above. Record the production Auth settings (sign-ups off, redirect URLs, the SMTP sender) in this changelog, because migrations don't carry them.
6. **Retire `authentication/supabase/` and `authentication/package.json`.** Keep `auth.js` and the prototype until the portal replaces them, pointed at the local stack (`npx supabase status -o env`) instead of the test project.

## Open questions

- **Has `002` or `003` been run against the production project?** The prototype config points at the test project, so probably not. The latest **Database drift** run would show it, and the drift check would currently be failing if they had been.
- Is the test project still needed after step 6, or can it be deleted?
- One admin or several? Will SSSC staff other than the admin ever sign in to the portal with less access?
- Will outside organizations ever get accounts, or are one-time links permanent?
