# Database Deployment Guide

For developers on the **portal** and **authentication** systems. It explains how schema changes reach the hosted Supabase database, why the process works the way it does, and how to develop and test against the database on your own machine.

The map work set this process up, in steps S1–S7 of the [Supabase plan](map/supabase_plan.md). The command-level reference is [supabase/README.md](../supabase/README.md). This guide covers what you need to know to work inside it.

## The short version

- **The repo is the source of truth for the schema and access rules.** Every table, policy, grant, and function comes from a migration in `supabase/migrations/`.
- **Develop against your local database,** not the hosted one. `npm run db:start` gives you a full Supabase stack in Docker with fictional seed data.
- **Merging to `main` and getting the deploy approved is the only path to the hosted database.** Don't change the schema in the Supabase dashboard, and don't run `supabase db push` from your laptop.
- **You don't need any production secrets.** The workflows hold them, and the drift check catches changes made any other way.
- **The `anon` role is locked down, and the `authenticated` role has no access until you write policies for it.** Most portal and authentication database work is writing those policies, with tests.

## How a change reaches the hosted database

```
 your branch                     main                            hosted Supabase
 ───────────                     ────                            ───────────────
 migration + pgTAP tests
        │
        ▼
 PR ──▶ Database (CI) ──merge──▶ Database (CI) ──pass──▶ Database deploy
        local DB on the runner                            │
        tests, lint, advisors                             ├─ Plan    (supabase-readonly)
        no secrets                                        │    dry run; lists pending migrations
                                                          │
                                                          └─ Deploy  (supabase-production)
                                                               waits for approval
                                                               db push ──────────────▶ schema updated
                                                               history + advisors

 nightly ──▶ Database drift (supabase-readonly) ──compares──▶ hosted schema vs. migrations
```

1. **On your PR,** the `Database` workflow ([database.yml](../.github/workflows/database.yml)) builds a throwaway database on the runner from every migration and `supabase/seed.sql`. It then runs the pgTAP tests, lints SQL functions, runs Supabase's security advisors, and checks that no merged migration was edited. It has no secrets and never touches the hosted project.
2. **After you merge,** `Database` runs again on `main`. When it passes, **Database deploy** ([database-deploy.yml](../.github/workflows/database-deploy.yml)) starts on that exact commit.
3. **Plan** dry-runs the push and lists the pending migrations in the run summary. If nothing is pending (for example, a docs-only change under `supabase/`), the run stops there.
4. **Deploy** waits for a required reviewer (Nicholas) to approve it. It then applies the migrations, checks that every migration is in both the repo and the hosted database, and re-runs the security advisors against the hosted database.
5. **Every night,** **Database drift** ([database-drift.yml](../.github/workflows/database-drift.yml)) checks that the hosted database still matches the repo: the migration history, the schema, and the advisors. If anything was changed outside this path, it fails and emails the maintainer.

## The two environments

GitHub **environments** hold the secrets for the two workflows that connect to the hosted project. An environment's secrets reach only jobs that name that environment, and an environment can require someone to approve a job before it runs.

| | `supabase-readonly` | `supabase-production` |
| --- | --- | --- |
| **Used by** | Deploy's **Plan** job, and the nightly **Drift** check | Deploy's **Deploy** job only |
| **Connects as** | `ci_drift_check` | `postgres`, the owner of the schema |
| **What it can do** | Read the system catalog (the schema's structure) and the migration history. It can't read any table data, and it's read-only by default, so it can't write even by mistake. | Everything: create and alter tables, policies, and functions. |
| **Approval** | None, because it can't change or read anything sensitive | A required reviewer must approve each run |
| **Branches** | `main` only | `main` only |
| **Secret** | `SUPABASE_READONLY_DB_URL` | `SUPABASE_DB_URL` |

**Why two?** Each job gets the least access that does its job. The jobs that run on their own (planning and the nightly check) can't change the database or read station coordinates or contact details, even if their secret leaked. The one job that can change the database runs only for a commit that passed CI, and only after a person has read the list of migrations it will apply.

**Why no Supabase access token?** Every command connects with a database URL instead. A personal access token reaches every project in its owner's Supabase account, while a database URL reaches one database.

You won't need either secret, and you can't read them back from GitHub. If you think one needs changing, ask the maintainer.

## Why it's set up this way

- **The anon key is public.** Any browser that loads the map or the portal can read it. Anything the `anon` role can reach is effectively public, including true station coordinates (the public map shows them shifted 250–500 m) and contact details. So `anon` gets no table access at all, and can call only two map functions.
- **Dashboard edits are invisible.** A table, policy, or grant changed in the Supabase dashboard isn't in the repo. Local databases, CI, and code review never see it, and a single loosened grant can expose data. The drift check exists to catch exactly this.
- **One reviewed path** means every change to the hosted schema has a PR, passing tests, and an approval behind it. To undo a change, you write a new migration through the same path.

## Developing against the database

### One-time setup

Prerequisites: Node.js 24 and Docker. Docker Desktop on Windows needs WSL integration turned on. The [root README](../README.md#quickstart) has the details.

```sh
npm install          # from the repo root; installs the Supabase CLI locally
npm run db:start     # starts Postgres, the API, Auth, Studio, and Mailpit in Docker
```

The first start downloads the Docker images and takes a few minutes.

### Everyday commands

From the repo root:

| Command | What it does |
| --- | --- |
| `npm run db:reset` | Rebuilds your local database from every migration, then `supabase/seed.sql`. Run it after pulling, switching branches, or editing a migration. |
| `npm run db:test` | Runs every pgTAP test in `supabase/tests/` |
| `npm run db:lint` | Lints SQL functions and runs the security advisors |
| `npx supabase status -o env` | Prints the local URLs and keys (below) |
| `npm run db:stop` | Stops the containers |

### Local URLs and keys

`npx supabase status -o env` prints everything your app needs to talk to the local stack:

| Value | Use |
| --- | --- |
| `API_URL` (`http://127.0.0.1:54321`) | The Supabase URL for `supabase-js` or REST calls |
| `PUBLISHABLE_KEY` / `ANON_KEY` | The key a frontend uses. Requests run as `anon`, or as `authenticated` once a user signs in. |
| `SECRET_KEY` / `SERVICE_ROLE_KEY` | Bypasses RLS entirely. Only for trusted server code, never in a frontend. |
| `STUDIO_URL` (`http://127.0.0.1:54323`) | Local Studio, for browsing tables and creating test users |
| `MAILPIT_URL` | Catches every email the local Auth server sends (sign-up confirmations, magic links) |
| `DB_URL` | Direct Postgres access as `postgres` |

These local keys work only against your local stack and are safe to share. The hosted project's keys are different. The hosted publishable (anon) key may go in frontend config. The hosted secret (service role) key must never be committed or reach a browser.

### Data

`supabase/seed.sql` loads a small, **fictional** dataset with known ids: organizations, projects, stations near Sitka with made-up coordinates, roles, and types. Tests rely on its exact values, so if you change it, update the tests. If you need more data for portal work, add fictional rows to the seed in your PR. Never copy real data from the hosted project into the repo, and never point local tools at the hosted database.

### Local auth

The local stack runs a real Supabase Auth server with sign-up enabled. You can create users from local Studio (**Authentication → Users**), or sign up through your app. Confirmation emails land in Mailpit.

`[auth]` in `supabase/config.toml` still has the CLI's defaults: `site_url = "http://127.0.0.1:3000"`. The portal runs on `http://localhost:4201`, so update `site_url` and `additional_redirect_urls` in a PR when you start on sign-in redirects.

**`config.toml` only configures your local stack.** The deploy workflow applies migrations and nothing else. Hosted Auth settings (providers, redirect URLs, email templates, whether sign-up is open) are set in the dashboard under **Authentication**. When you change one, record it in the authentication changelog so it isn't lost.

## Writing changes for the portal and authentication

### What's already in place

| Role | Who it is | What it can do today |
| --- | --- | --- |
| `anon` | Any request with the publishable key and no signed-in user | No table access. It can execute only `map_stations` and `map_filter_options` (the public map). |
| `authenticated` | Any request from a signed-in user | Has the default table grants, but RLS is on for every table and there are **no policies**, so it sees and changes nothing. |
| `service_role` | Requests with the secret key | Bypasses RLS. Server-side only. |

Every table in `public` has RLS on. [`supabase/tests/03_anon_rls.test.sql`](../supabase/tests/03_anon_rls.test.sql) checks this from the system catalog, so CI fails if any of these happen:

- a table has RLS off
- any policy applies to `anon`, or to `PUBLIC` (a policy with no `to` clause applies to `PUBLIC`)
- anon can execute any function in `public` other than the two map functions
- anon has any table or sequence privilege

### Giving signed-in users access: policies

Access for the portal is RLS policies **`to authenticated`**. Always name the role. Before writing one, decide who "signed in" really means. **If sign-up is open, anyone on the internet can become `authenticated`,** so `to authenticated using (true)` would be nearly as open as `anon`. Tie access to something you control, for example a table of approved users or a claim in the user's JWT. Designing that model is the authentication plan's job. The examples below only show the mechanics.

```sql
-- supabase/migrations/<timestamp>_portal_station_read.sql
-- Role: lets approved portal users read stations. Tests: supabase/tests/NN_portal_station_read.test.sql.

create policy "Approved users can read stations"
  on public."Stations"
  for select
  to authenticated
  using ((select auth.uid()) in (select user_id from public.portal_users));
```

- **One operation per policy** (`for select`, `for insert`, ...). For `insert` and `update`, also write a `with check` expression that limits what rows can be written.
- **Wrap `auth.uid()` in `(select ...)`,** as above. Postgres then evaluates it once per query instead of once per row.
- **True coordinates and contacts are sensitive.** `Stations` (`Longitude`, `Latitude`, `CoordinateLocation`) and `StationSites` hold true locations, and `Contacts` holds personal data. Only the people who need them should be able to read them.

### New tables

```sql
create table public."PortalThing" ( ... );
alter table public."PortalThing" enable row level security;
-- then policies "to authenticated" as above
```

anon gets no grant on new tables: S3 revoked `postgres`'s default privileges for anon. CI fails if you forget RLS.

### New functions

Postgres lets **every role, including `anon`, execute a new function in `public`** by default. Every function migration needs explicit privileges:

```sql
create or replace function public.portal_station_summary(p_station bigint)
returns table (...)
language sql stable
security invoker          -- runs as the caller, so the caller's RLS policies apply
set search_path = ''      -- always; qualify every name, e.g. public."Stations"
as $$ ... $$;

revoke all on function public.portal_station_summary(bigint) from public, anon, authenticated;
grant execute on function public.portal_station_summary(bigint) to authenticated;
```

- **Prefer `security invoker`.** Use `security definer` only when the function must do something the caller can't, and then return only the columns the caller should see. `map_stations` is an example: it runs as `postgres` but returns only masked points. Always set `search_path = ''` on either kind.
- **To make a function public,** that is callable by `anon`, add it to `anon_functions` in `03_anon_rls.test.sql`. That change is a public-access decision, so call it out in your PR.

### Leave the map's objects alone

`map_private` (the masking function and its schema), `map_stations`, `map_filter_options`, and the Vault secret `map_location_mask_secret` keep true coordinates off the public map. Don't change or grant them in portal or authentication migrations. If the portal needs one of them, raise it with the map maintainer first.

### New schemas

The lint, the drift check, and the advisors cover only `public` and `map_private`. If you create a schema (for example `portal_private`), add it to `--schema` in three places in the same PR:

- [database.yml](../.github/workflows/database.yml)
- the `db:lint` script in [package.json](../package.json)
- the **Schema** step of [database-drift.yml](../.github/workflows/database-drift.yml)

Also say in the PR whether it should be exposed through the API: **Settings → API → Exposed schemas** in the dashboard, and `[api] schemas` in `config.toml`.

## Testing

Write pgTAP tests in `supabase/tests/`, named `NN_short_name.test.sql` with the next number. Each file runs in a transaction and rolls back. Tests can act as a specific signed-in user:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Act as a signed-in user. auth.uid() returns this sub.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select is((select count(*)::int from public."Stations"), 0,
  'a signed-in user who is not approved sees no stations');

select throws_ok(
  $$insert into public."Stations" ("StationName", "Longitude", "Latitude")
    values ('x', -135.3, 57.05)$$,
  '42501', null,
  'a signed-in user cannot insert stations without an insert policy');

reset role;
select * from finish();
rollback;
```

Test both sides of every policy: what a user **can** see or change, and what they **can't**, including other users' rows and the anon role. The existing tests in `supabase/tests/` show more patterns, such as catalog checks and switching between `anon` and `authenticated`.

Before pushing, run `npm run db:reset && npm run db:test && npm run db:lint`. CI runs the same checks.

## Shipping a change

1. **Create the migration** with `npx supabase migration new <short_name>`, and write the SQL in the file it creates. Start it with a comment saying what it does and which test covers it.
2. **Add or update tests** in `supabase/tests/`.
3. **Run the checks:** `npm run db:reset && npm run db:test && npm run db:lint`.
4. **Open a PR** with the migration and its tests together. In the description, say what access changes: who can now read or write what.
5. **Merge.** Then open **Actions → Database deploy**. The Plan summary lists your migrations, and the maintainer approves the Deploy job. A schema change isn't live until that approval.
6. **Check the hosted database:** the Deploy summary shows what was applied, the migration history, and the advisors.

**Never edit a migration once it's merged.** CI rejects that, and the hosted database has already run the old version. Fix it with a new migration. A new migration's timestamp must also sort after the newest one on `main`. If yours doesn't after a rebase, rename the file with a fresh timestamp.

## When something fails

| What failed | Likely cause | What to do |
| --- | --- | --- |
| `Database` on your PR: **Start local database** | A migration or `seed.sql` doesn't apply cleanly | Run `npm run db:reset` locally and read the first error |
| `Database`: **Test (pgTAP)** | A test failed, often `03_anon_rls`: a table without RLS, a policy with no `to`, or a function anon can execute | Read the failing test's description. Fix the migration, not the test. |
| `Database`: **Merged migrations are unchanged** | You edited, renamed, or deleted a merged migration, or yours sorts before the newest one | Restore the merged file. Put the change in a new migration with a newer timestamp. |
| **Database deploy**: Plan | The read-only secret or the hosted database is unreachable | Tell the maintainer. Your change isn't deployed yet. |
| **Database deploy**: Deploy | A migration failed on the hosted data, for example a constraint that existing rows break | Each migration runs in its own transaction. The failed one is rolled back completely and isn't recorded, and the ones after it don't run. Migrations before it in the same push stay applied. Every later deploy retries the failed migration first, so a new migration can't get past it. **Tell the maintainer.** The fix is either to correct the hosted data so the migration succeeds, or to fix the migration file itself. It never ran on the hosted database, but CI blocks edits to merged migrations, so that needs the maintainer to override the check. |
| **Database drift** (nightly) | Something changed outside this path, or a merged migration is waiting for approval | See "Drift" in [supabase/README.md](../supabase/README.md#drift) |
| A local command says `Remote migration versions not found in local migrations directory` | Your local database has a migration your checkout doesn't, often after switching branches | `npm run db:reset`. Don't run the `migration repair` the CLI suggests. |

## FAQ

**Can I look at the hosted data?** If the project's owner has given you a dashboard account, you can browse it in the dashboard. Don't copy it into the repo, into the seed, or into tests.

**Can I try a migration on the hosted database before merging?** No. Test locally. Your local stack runs the same Postgres version and the same migrations as the hosted project.

**I need a hosted setting changed** (an Auth provider, a redirect URL, an exposed schema). Those aren't migrations, so the deploy doesn't apply them. Ask the maintainer, and record the change in your section's changelog.

**Who approves deploys?** The required reviewers on `supabase-production`, currently Nicholas.

**Where's the full command reference?** [supabase/README.md](../supabase/README.md). The design decisions behind each step are in [map/supabase_plan.md](map/supabase_plan.md).
