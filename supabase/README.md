# Supabase

The database for the whole project. This folder holds the Supabase CLI project: the local stack config, the versioned schema migrations, local seed data, and pgTAP tests. The hosted Supabase project is the source of truth for data. This folder is the source of truth for **schema and access rules**.

The plan for this folder is [documentation/map/supabase_plan.md](../documentation/map/supabase_plan.md), and changes are logged in the [map changelog](../documentation/map/CHANGELOG.md).

## Quickstart

Prerequisites: Node.js 24 and Docker running (see the [root README](../README.md#quickstart)). From the **repo root**:

```sh
npm install          # installs the Supabase CLI locally (no global install needed)
npm run db:start     # starts local Postgres, API, and Studio in Docker (first run downloads images)
npm run db:reset     # rebuilds the local DB: every migration, then seed.sql
npm run db:test      # runs the pgTAP tests in supabase/tests/
npm run db:lint      # lints SQL functions and runs Supabase's security advisors
```

Local Studio is at http://localhost:54323, and Postgres is at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. `npm run db:stop` stops the containers.

Any other CLI command runs through npx, for example `npx supabase status`.

## Setup

One-time setup to work against the hosted project:

1. Install Docker. On Windows/WSL, use Docker Desktop with **Settings → Resources → WSL integration** turned on for your distro, then check that `docker ps` works in your WSL terminal.
2. `npx supabase login` opens a browser to create an access token.
3. `npx supabase link --project-ref <project-ref>`. The ref is in the dashboard URL (`supabase.com/dashboard/project/<project-ref>`). It asks for the database password. Don't put the password in any file in the repo.
4. Check that `major_version` under `[db]` in `config.toml` matches the hosted Postgres version (**Settings → Infrastructure** in the dashboard). `supabase link` warns if they differ.

### Hosted project: one-time manual steps

These hold secrets, so they're done by hand in the dashboard's SQL editor and never go in a migration:

- **Location-masking secret** (done on the hosted project on 2026-11-12; redo only on a new or rebuilt project): `select vault.create_secret('<value>', 'map_location_mask_secret');`, with the value from `openssl rand -base64 48`. Don't keep a copy anywhere else. Changing it later moves every marker on the public map. Until it exists, `map_private.mask_point` raises `location masking is not configured`, and so does every `map_stations` call that would return a station. Check that it exists with `select name, created_at from vault.secrets;`. Locally, `seed.sql` creates a throwaway one.
- **Exposed schemas:** **Settings → API → Exposed schemas** must not include `map_private`.
- **Drift-check role** (for the [deploy and drift workflows](#deploy-and-drift-check-workflows)): a login role that can read the catalog and the migration history, but no table data, and can't write:
  ```sql
  create role ci_drift_check login password '<openssl rand -hex 32>';
  alter role ci_drift_check set default_transaction_read_only = on;
  grant usage on schema supabase_migrations to ci_drift_check;
  grant select on supabase_migrations.schema_migrations to ci_drift_check;
  ```
  Use a hex password so it needs no escaping in a URL. If the SQL editor saved the query as a snippet, delete it. Grant nothing else: the schema diff and the advisors read only the catalog, which every role can read. To change the password later, run `alter role ci_drift_check password '<new>';` and update the GitHub secret.

### GitHub environments for the database workflows

The deploy and drift workflows read their secrets from two GitHub environments (**Settings → Environments** in the GitHub repo). An environment's secrets reach only jobs that name it. Neither needs a Supabase access token, because every command connects with a database URL.

| Environment | Protection | Secret | Variable |
| --- | --- | --- | --- |
| `supabase-production` | **Required reviewers:** Nicholas. **Deployment branches:** `main` only. | `SUPABASE_DB_URL`: the **Session pooler** URL for `postgres`, `postgresql://postgres.cmxvpikgbetmesmpiubt:<database password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres`. Percent-encode any special characters in the password. After `npx supabase link`, the same URL without the password is in `supabase/.temp/pooler-url`. On the pooler host, port 5432 is session mode and 6543 is transaction mode. | `SUPABASE_PROJECT_ID` = `cmxvpikgbetmesmpiubt` |
| `supabase-readonly` | No reviewers. **Deployment branches:** `main` only. | `SUPABASE_READONLY_DB_URL`: the same Session pooler URL, with user `ci_drift_check.cmxvpikgbetmesmpiubt` and that role's password. | `SUPABASE_PROJECT_ID` = `cmxvpikgbetmesmpiubt` |

Use the Session pooler, not the direct `db.<ref>.supabase.co` host, which is IPv6-only and unreachable from GitHub's runners. The workflows check that each URL belongs to `SUPABASE_PROJECT_ID` and isn't local before using it. They also require TLS for every connection to the hosted database.

`supabase/.temp/` (link state) and `.env*` files are git-ignored. Never commit database passwords or access tokens.

## Workflow for a schema change

1. Write a new migration: `npx supabase migration new <short_name>`, then edit the file it creates in `migrations/`. You can also make the change in local Studio and generate the file with `npx supabase db diff -f <short_name>`.
2. Add or update pgTAP tests in `tests/`.
3. `npm run db:reset && npm run db:test && npm run db:lint`. All three must pass.
4. Commit the migration and its tests together, and open a PR. CI runs the same checks (see below).
5. Merge the PR. The `Database` workflow runs again on `main`, and when it passes, **Database deploy** starts. Its **Plan** job lists the pending migrations in the run's summary. Check that they're only what you expect, then approve the **Deploy** job (it waits in the `supabase-production` environment). Deploy pushes the migrations, checks that every migration is on both sides, and runs the security advisors against the hosted database.

**Merging to `main` and approving the deploy is the only path to the hosted database** (since map `0.10.0`). Don't run `supabase db push --remote` from a laptop. A push from a branch would put migrations on the hosted database that `main` doesn't have, and the nightly drift check would fail.

Never edit a migration that has already been merged or pushed. Write a new one instead. Make schema changes through migrations, not in the hosted dashboard. A change made in the dashboard isn't in the repo, so local and CI databases won't have it, and the nightly drift check fails until it's resolved (see [Drift](#drift)).

**If a command complains about missing migrations locally:** since CLI 3, `db push`, `migration list`, and similar commands target the *local* Docker database unless you pass `--remote`. The `Target:` line at the top of the output says which one. `Remote migration versions not found in local migrations directory` from a local command means your *local* database has a migration your checkout doesn't (for example from resetting on another branch). Run `npm run db:reset` to bring it back in line. Don't run the `migration repair` the CLI suggests.

### Drift

The nightly **Database drift** workflow fails when the hosted database and the repo disagree, and its run summary shows how:

- **Migration in the repo but not deployed:** a merge whose deploy wasn't approved, or failed. Approve or re-run it (see [Deploy and drift-check workflows](#deploy-and-drift-check-workflows)).
- **Migration on the hosted database but not in the repo:** someone pushed from outside `main`. Merge the branch that has it, or write a migration that undoes it.
- **Schema SQL:** something was changed in the dashboard. The SQL shows what would turn the migrations' schema into the hosted one. If the change was intended, capture it with `npx supabase db pull` as a new migration in a PR. If not, write a migration that reverts it. Either way, the repo stays the source of truth.
- **Security advisor errors:** for example a table created in the dashboard without RLS. Fix it with a migration.

### Restoring data

Migrations only move forward: fix a bad one with a new migration through the same PR and deploy path. For lost or damaged *data*, restore from the hosted project's backups:

1. In the dashboard, open **Database → Backups**. What's there, how far back it goes, and whether point-in-time recovery is offered all depend on the project's Supabase plan and add-ons. Check this page now, not on the day you need it.
2. Pick the latest backup (or point in time) from before the damage, and restore it. **A restore replaces the whole database**, including any rows written since. Export anything you need to keep first, for example with **Table editor → Export to CSV**.
3. A restore brings the schema back with the data, so it can also undo migrations deployed after that point. Afterwards, run **Database drift** by hand. If migrations are missing, re-run their deploy.
4. Check that Vault still holds `map_location_mask_secret` (`select name from vault.secrets;`) and that `ci_drift_check` still exists. Recreate either one from the [one-time steps](#hosted-project-one-time-manual-steps) if needed. A new masking secret moves every marker on the map.

## Access rules for the anon role

The anon key is public, so the anon role gets no access to tables (since map `0.6.0`, step S3 of the [Supabase plan](../documentation/map/supabase_plan.md)). Every table in `public` has RLS on, and anon has no table or sequence privileges. It reaches data only through functions on an allowlist:

| Function | Since | Returns |
| --- | --- | --- |
| `map_stations(p_project, p_organization, p_station_types, p_observation_types, p_station)` | `0.8.0` (S5) | The map's stations: id, name, code, active flag, a masked point (250–500 m from the true one), and the organization's role ids at each station. `null` means "no filter" for every parameter. The organization filters only when no project is given. |
| `map_filter_options()` | `0.9.0` (S6) | One jsonb object with the map's dropdown options: `projects` (with `organization_id` and `station_count`), `organizations` (those that hold a role or manage a project), `station_types`, `observation_types`, and `roles`. Ids and names only, never notes. |

Each one is `security definer` with an empty `search_path`, and returns a fixed list of columns, so adding a field to the public map means a reviewed migration. Its execute privilege is revoked from `PUBLIC` and `authenticated` and granted to `anon` alone. `tests/03_anon_rls.test.sql` checks all of this from the catalog, so it fails if:

- a new table doesn't have RLS on: add `alter table ... enable row level security` to its migration
- a policy applies to `anon` or `PUBLIC` (a policy with no `to` clause applies to `PUBLIC`): name a role, such as `to authenticated`
- anon can execute a new function in `public`: add `revoke all on function ... from public, anon` to its migration, or, if the public map should call it, add it to `anon_functions` in the test

## Continuous integration

[`.github/workflows/database.yml`](../.github/workflows/database.yml) runs on every PR and push to `main` that touches `supabase/`, `package.json`, or `package-lock.json`. It needs no secrets and never touches the hosted project.

| Check | What it catches |
| --- | --- |
| `supabase db start` | A migration or `seed.sql` that doesn't apply cleanly to an empty database |
| `supabase test db` | Failing pgTAP tests |
| `supabase db lint --schema public,map_private --fail-on error` | Type and reference errors inside our SQL and plpgsql functions. `extensions` is skipped because PostGIS's own functions report errors there. Add each new schema we own to `--schema` in the workflow and the `db:lint` script. |
| `supabase db advisors --type security --fail-on error` | Error-level security issues, such as a public table without RLS |
| Merged migrations unchanged (PRs only) | Editing, deleting, or renaming a migration already on `main`, or adding one whose timestamp sorts before the newest merged one |

### Deploy and drift-check workflows

Two more workflows connect to the hosted project (since map `0.10.0`, step S7 of the [Supabase plan](../documentation/map/supabase_plan.md)). Their setup is under [GitHub environments](#github-environments-for-the-database-workflows).

| Workflow | When | What it does |
| --- | --- | --- |
| [`database-deploy.yml`](../.github/workflows/database-deploy.yml) | After `Database` passes for a push to `main` | **Plan** (as `ci_drift_check`): dry-runs the push and lists pending migrations in the summary. If none are pending, it stops there. **Deploy** (waits for approval in `supabase-production`): `db push`, then checks the migration history matches and runs the security advisors. |
| [`database-drift.yml`](../.github/workflows/database-drift.yml) | Nightly at 10:17 UTC, or by hand | As `ci_drift_check`: checks that the migration history matches, that the hosted `public` and `map_private` schemas match the migrations (an empty `db diff`), and that the security advisors report no errors. See [Drift](#drift). |

Both use [`.github/scripts/supabase_ci.mjs`](../.github/scripts/supabase_ci.mjs). It checks each database URL and each command's target before trusting the result, and writes the job summary. The seed, `--include-all`, custom roles, and Vault secrets are never pushed.

- **Retry a deploy:** re-run the failed jobs of that **Database deploy** run. Or run the `Database` workflow on `main` by hand (**Actions → Database → Run workflow**), which starts a new deploy when it passes. Database deploy has no manual trigger of its own, so it can only deploy a commit that just passed CI.
- **Run the drift check now:** **Actions → Database drift → Run workflow**.
- **Notifications:** GitHub emails whoever last changed the drift schedule when a scheduled run fails. It also turns the schedule off after 60 days with no activity in the repo. Re-enable it under **Actions → Database drift**.

## Directory guide

| Path | Contents |
| --- | --- |
| `config.toml` | Local stack config from `supabase init` (ports, Postgres version, seed path) |
| `migrations/` | Versioned schema migrations, applied in timestamp order. The first is the baseline pulled from the hosted project with `supabase db pull`. |
| `seed.sql` | Small, fictional dataset loaded by `supabase db reset`. Local only, never pushed. The tests depend on its IDs and coordinates. It also creates a throwaway local `map_location_mask_secret` in Vault. |
| `tests/` | pgTAP tests, run by `supabase test db`. Each file runs in a transaction and rolls back. |
| `.temp/` | CLI link state (git-ignored) |
