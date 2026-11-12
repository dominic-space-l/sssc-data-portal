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

`supabase/.temp/` (link state) and `.env*` files are git-ignored. Never commit database passwords or access tokens.

## Workflow for a schema change

1. Write a new migration: `npx supabase migration new <short_name>`, then edit the file it creates in `migrations/`. You can also make the change in local Studio and generate the file with `npx supabase db diff -f <short_name>`.
2. Add or update pgTAP tests in `tests/`.
3. `npm run db:reset && npm run db:test && npm run db:lint`. All three must pass.
4. Commit the migration and its tests together, and open a PR. CI runs the same checks (see below).
5. After the PR merges, check out `main` with a clean working tree, then push the new migrations to the hosted project:
   ```sh
   npx supabase db push --remote --dry-run   # lists what will run; check it's only what you expect
   npx supabase db push --remote --yes
   npx supabase migration list --remote      # every migration should show on both sides
   ```
   **`--remote` is required.** Since CLI 3, `db push`, `migration list`, and similar commands target the *local* Docker database unless you pass `--remote`. Check the `Target:` line at the top of the output: it should name the hosted project, not `local stack`. Without `--remote`, the push goes to your local database, and if that has a migration your checkout doesn't (for example from resetting on another branch), it fails with `Remote migration versions not found in local migrations directory`. That message means your local database, not the hosted one, so don't run the `migration repair` it suggests. Re-run with `--remote`, or run `npm run db:reset` to bring the local database back in line with your checkout.

Never edit a migration that has already been merged or pushed. Write a new one instead. Make schema changes through migrations, not in the hosted dashboard. A change made in the dashboard isn't in the repo, so local and CI databases won't have it. If one slips through, capture it with `npx supabase db pull` as a new migration.

## Access rules for the anon role

The anon key is public, so the anon role gets no access to tables (since map `0.6.0`, step S3 of the [Supabase plan](../documentation/map/supabase_plan.md)). Every table in `public` has RLS on, and anon has no table or sequence privileges. It reaches data only through functions on an allowlist. `tests/03_anon_rls.test.sql` checks all of this from the catalog, so it fails if:

- a new table doesn't have RLS on: add `alter table ... enable row level security` to its migration
- a policy applies to `anon` or `PUBLIC` (a policy with no `to` clause applies to `PUBLIC`): name a role, such as `to authenticated`
- anon can execute a new function in `public`: add `revoke all on function ... from public, anon` to its migration, or, if the public map should call it, add it to `anon_functions` in the test

## Continuous integration

[`.github/workflows/database.yml`](../.github/workflows/database.yml) runs on every PR and push to `main` that touches `supabase/`, `package.json`, or `package-lock.json`. It needs no secrets and never touches the hosted project.

| Check | What it catches |
| --- | --- |
| `supabase db start` | A migration or `seed.sql` that doesn't apply cleanly to an empty database |
| `supabase test db` | Failing pgTAP tests |
| `supabase db lint --schema public --fail-on error` | Type and reference errors inside our SQL and plpgsql functions. `extensions` is skipped because PostGIS's own functions report errors there. Add each new schema we own (for example `map_private` in S4) to `--schema` in the workflow and the `db:lint` script. |
| `supabase db advisors --type security --fail-on error` | Error-level security issues, such as a public table without RLS |
| Merged migrations unchanged (PRs only) | Editing, deleting, or renaming a migration already on `main`, or adding one whose timestamp sorts before the newest merged one |

## Directory guide

| Path | Contents |
| --- | --- |
| `config.toml` | Local stack config from `supabase init` (ports, Postgres version, seed path) |
| `migrations/` | Versioned schema migrations, applied in timestamp order. The first is the baseline pulled from the hosted project with `supabase db pull`. |
| `seed.sql` | Small, fictional dataset loaded by `supabase db reset`. Local only, never pushed. The tests depend on its IDs and coordinates. |
| `tests/` | pgTAP tests, run by `supabase test db`. Each file runs in a transaction and rolls back. |
| `.temp/` | CLI link state (git-ignored) |
