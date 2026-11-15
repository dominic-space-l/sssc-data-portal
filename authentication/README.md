# Environmental Monitoring Database Authentication System

## Overview

The authentication system controls who can write data into the monitoring database. There are two kinds of user:

- **The admin (SSSC staff)** signs in with an email and password. The admin can enter data directly and reviews everything that comes from outside.
- **Outside organizations** never get an account. They ask for access, and if the admin approves, they get a **one-time link** that lets them submit data once. Nothing they submit reaches the real tables until the admin approves it.

**Status: prototype** (authentication `0.2.x`). The pages in `prototype/` are bare-bones test pages for the flows. The real interface will be built into the portal. The prototype runs against a **separate Supabase test project**, not the repo's database in [`supabase/`](../supabase/). Its schema changes are SQL scripts run by hand, not migrations. Bringing it into the shared database is covered in [documentation/authentication/supabase_assessment.md](../documentation/authentication/supabase_assessment.md). Changes are logged in the [authentication changelog](../documentation/authentication/CHANGELOG.md).

### The flows

```
Outside organization                         Admin
────────────────────                         ─────
request-access.html ──▶ request-access ──▶ private.access_requests ──▶ email alert
  (Cloudflare Turnstile)  (Edge Function)
                                             admin.html: approve ──▶ one-time link
                                             (admin emails the link to the organization)
submit.html?code=… ──▶ submit-external
  check the link         validate, dry-run the insert, use up the link
                         ──▶ private.pending_submissions ──▶ email alert
                                             admin.html: approve ──▶ rows saved to the real tables
                                                         reject  ──▶ discarded (optionally a fresh link)

                                             form.html: direct entry, saved straight away
```

1. **Request access.** An organization fills in `request-access.html` (organization, contact name, email, reason) and passes a Cloudflare Turnstile bot check. The `request-access` function saves the request and emails an alert to `NOTIFY_EMAIL`. Each email address can have at most 3 pending requests per 24 hours.
2. **Approve.** The admin approves the request in `admin.html`. That creates a one-time link (`<SITE_URL>/submit.html?code=…`, valid for `LINK_DAYS` days, 7 by default). The system doesn't email the organization. The dashboard shows the link with **Copy link** and **Open an email draft** buttons, and the admin sends it.
3. **Submit.** The organization opens the link. `submit-external` checks it, then validates the submission: only tables listed in `ALLOWED_TABLES`, only plain values, known columns. Then it **dry-runs the insert** (saves and rolls back), so bad data is caught while the person is still on the page. If that passes, the link is used up and the submission is held in `private.pending_submissions`. The admin gets an email alert with no submitted data in it.
4. **Review.** The admin approves the submission, which saves every row into the real tables in one transaction (all or none), checked again against today's `ALLOWED_TABLES`. Or the admin rejects it, optionally with a fresh link so the organization can try again.
5. **Direct entry.** The signed-in admin can enter rows straight into any table from `form.html`.

### Submission format ("parts")

A submission can write to several tables at once. It's a list of parts, saved in order. A new row can take a temporary label with `"_id"`, and later rows can refer to that row's new ID with `{ "$ref": "<label>" }`:

```json
[
  { "table": "Stations", "rows": [ { "_id": "new-station", "StationName": "Ridge 4" } ] },
  { "table": "StationsToSensors", "rows": [ { "StationID": { "$ref": "new-station" }, "SensorID": 3 } ] }
]
```

A single row, or a list of rows for one table, also works. `toParts()` in `auth.js` turns either form into parts. The limits are 20 parts and 1,000 rows per submission, and text values are cut to 5,000 characters. Labelled rows only work in tables with a single-column primary key.

## Architecture

### Backend

Everything server-side runs on Supabase:

| Piece | What it does |
| --- | --- |
| **Supabase Auth** | Email and password sign-in for the admin. **Sign-ups must be turned off** in the dashboard. The system treats any signed-in user as the admin. |
| **Edge Functions** (Deno, `supabase/functions/`) | `request-access` and `submit-external` are public (deployed with `--no-verify-jwt`). `admin-api` is admin-only: it checks the caller's token with Supabase Auth and runs every dashboard action. `send-test-email` was a Day 1 email check and is meant to be deleted. |
| **`_shared/`** | Code the functions share: HTTP and CORS helpers (`http.ts`), the direct database connection (`db.ts`), the caller check (`auth.ts`), Resend email alerts (`email.ts`), one-time links (`links.ts`), and validating and saving parts (`rows.ts`). |
| **Postgres, `public` schema** | The real data tables. `sql/002_day2_rules.sql` turns on RLS and lets signed-in users read and add rows. |
| **Postgres, `private` schema** | `access_requests`, `access_links`, and `pending_submissions`. Not exposed to the API, so the browser can't reach it. Only the Edge Functions use it, through a direct Postgres connection (`SUPABASE_DB_URL`). |
| **Resend** | Sends the email alerts, all to one inbox (`NOTIFY_EMAIL`) |
| **Cloudflare Turnstile** | The bot check on the request-access form |

### Frontend

- **`auth/auth.js`** is the only file the pages import. It wraps `supabase-js`. Every function returns `{ ok: true, ... }` or `{ ok: false, message }`, so pages never deal with raw errors. It's written as an ES module so it can move into the Angular portal: change the CDN import to `import { createClient } from "@supabase/supabase-js";` and call `initAuth(environment.supabase)` once in a service.
- **`prototype/*.html`** are plain HTML test pages with inline scripts. They read their settings from `window.APP_CONFIG` in `config.js`.

The browser holds only the **publishable (anon) key**. The secret key and the Resend and Turnstile secrets live only in Edge Function secrets.

## Directory Guide

| Path | Contents |
| --- | --- |
| `auth/auth.js` | The functions the pages call: sign-in, direct entry, access requests, one-time links, submissions, and the security checks |
| `prototype/index.html` | Home page: sign-in status, links to the other pages, and the **Checks** panel |
| `prototype/login.html` | Admin sign-in. `?next=<page>.html` picks where to go afterward. |
| `prototype/admin.html` | Admin dashboard: pending access requests and submissions, with approve and reject buttons |
| `prototype/form.html` | Admin direct entry (JSON). One plain table is inserted through the API. Several tables or labels go through `admin-api`. |
| `prototype/request-access.html` | Public access request form, with Turnstile |
| `prototype/submit.html` | Public one-time-link submission page (JSON) |
| `prototype/csv-upload.html` | Placeholder for CSV upload (planned "Day 5") |
| `prototype/config.example.js` | Template for `config.js` |
| `prototype/config.js` | Settings for the test project. **Committed**, although it's meant to be personal. Its values are public by design (project URL, publishable key, Turnstile test key). |
| `supabase/config.toml` | Supabase CLI config for this folder (CLI defaults, `project_id = "data-portal"`) |
| `supabase/functions/` | The Edge Functions and `_shared/` code (see [Backend](#backend)) |
| `supabase/sql/002_day2_rules.sql` | RLS and policies on `public`, plus the `private` schema and its three tables |
| `supabase/sql/003_multi_table.sql` | Changes `pending_submissions` to the multi-table `parts` format |
| `package.json`, `package-lock.json` | Pins Supabase CLI 2.x for this folder. Not part of the root npm workspaces. |
| `.gitignore`, `supabase/.gitignore` | Ignores `.env*`, CLI state, `node_modules/`, and `public/` |

## Usage

### Requirements

- Node.js 24 (see the [root README](../README.md#quickstart)), for the Supabase CLI
- Python 3 or any other static file server, to serve the pages
- A Supabase project to test against. Use a **test** project, not the hosted production database (see [Status](#overview)).
- A [Resend](https://resend.com) account, for the email alerts
- A [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) site key and secret. Cloudflare's test keys work for development.

### Quickstart

This runs the pages against a test project that is already set up (see [Setup](#setup)). From `authentication/`:

```sh
# The pages import ./auth/auth.js, so serve them from one folder that holds both.
rm -rf public && mkdir public
cp prototype/*.html prototype/config.js public/
cp -r auth public/auth

python3 -m http.server 3000 --directory public
```

Then open http://localhost:3000. `public/` is git-ignored. Re-run the copy after editing anything in `prototype/` or `auth/`.

On the home page, run the three **Checks** (sign-up blocked, private tables hidden, logged-out add blocked). All three should pass before you trust anything else. Then sign in at `login.html` with the admin account.

### Setup

One-time setup of a Supabase test project for the prototype.

1. **Create or choose a test project** in the Supabase dashboard, with the portal's tables in `public`.
2. **Dashboard settings:**
   - **Authentication → Sign In / Providers:** turn off **Allow new users to sign up**. The whole access model depends on this (see [Security notes](#security-notes)).
   - **Authentication → Users:** create the admin user.
   - **Settings → API → Exposed schemas:** make sure `private` isn't listed.
3. **Run the SQL** in the dashboard's SQL Editor, in order: `supabase/sql/002_day2_rules.sql`, then `003_multi_table.sql`. Both are safe to run more than once. If the editor offers to enable RLS, run without it, because the scripts handle RLS themselves. The last query in each script prints a check.
4. **Link the CLI and set the secrets.** The repo root already installs the Supabase CLI, so run it from the root with `--workdir`. That avoids a second `npm install` in this folder. (Running `npm install` here instead installs the 2.x CLI that `package.json` pins.)
   ```sh
   npx supabase login
   npx supabase --workdir authentication link --project-ref <test-project-ref>
   npx supabase --workdir authentication secrets set \
     RESEND_API_KEY=... NOTIFY_EMAIL=... TURNSTILE_SECRET_KEY=... \
     SITE_URL=http://localhost:3000 ALLOWED_TABLES=Stations,StationsToSensors LOOKUP_TABLES=Sensors
   ```
5. **Deploy the functions.** The two public ones skip JWT verification:
   ```sh
   npx supabase --workdir authentication functions deploy admin-api
   npx supabase --workdir authentication functions deploy request-access --no-verify-jwt
   npx supabase --workdir authentication functions deploy submit-external --no-verify-jwt
   ```
6. **Write `prototype/config.js`** from `config.example.js` (see [Configuration](#configuration)).

### Configuration

**Browser settings** (`prototype/config.js`, `window.APP_CONFIG`). Every value here is public.

| Key | Use |
| --- | --- |
| `SUPABASE_URL` | Project URL (**Settings → Data API**) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key (**Settings → API Keys**). Never the secret key. |
| `TEST_TABLE` | Any table, used by the connection check |
| `FORM_TABLE` | Default table for `form.html`, `submit.html`, and the logged-out check |
| `TURNSTILE_SITE_KEY` | Turnstile site key. `1x00000000000000000000AA` is Cloudflare's always-pass test key. Replace it before launch. |
| `CONTACT_EMAIL` | Shown on the public pages |

**Edge Function secrets** (`supabase secrets set`):

| Secret | Used by | Use |
| --- | --- | --- |
| `RESEND_API_KEY` | `request-access`, `submit-external` | Sends alert emails |
| `NOTIFY_EMAIL` | `request-access`, `submit-external` | The one inbox every alert goes to |
| `TURNSTILE_SECRET_KEY` | `request-access` | Verifies the bot check. Pair the always-pass test site key with test secret `1x0000000000000000000000000000000AA`. |
| `SITE_URL` | all three | Base URL of the pages, used to build one-time links and dashboard links |
| `ALLOWED_TABLES` | `submit-external`, `admin-api` | Comma-separated tables outside organizations may submit to. Checked again when the admin approves. |
| `LOOKUP_TABLES` | `submit-external` | Comma-separated tables a link holder may read for dropdowns. Every column is returned, so list only lookup tables. |
| `LINK_DAYS` | `admin-api` | Days a one-time link stays valid. Optional. The default is 7, and the maximum is 60. |

Supabase provides `SUPABASE_URL`, `SUPABASE_DB_URL`, and the publishable key to every function automatically.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The browser console shows a 404 for `auth/auth.js` | The pages were served from `prototype/` directly. Serve the assembled `public/` folder (see [Quickstart](#quickstart)). |
| `Call initAuth(config) first` | A page called `auth.js` before `initAuth(window.APP_CONFIG)`, or `config.js` didn't load |
| Check: `Sign-up worked, so it is NOT blocked` | Turn off **Allow new users to sign up**, then delete the test user the check created (**Authentication → Users**) |
| Check: `The private schema is reachable from the browser` | Remove `private` from **Settings → API → Exposed schemas** |
| Check: `A logged-out visitor added a row` | RLS is off, or a policy applies to `anon`. Re-run `002_day2_rules.sql`. |
| `Something went wrong` from a function | Read the function's logs (**Edge Functions → Logs**). `Missing secret: X` means that secret isn't set. |
| `Please log in.` (401) from the dashboard | The session expired. Sign in again. |
| `Bot check failed` | The Turnstile site key in `config.js` and `TURNSTILE_SECRET_KEY` aren't a matching pair |
| Alerts never arrive | With Resend's `onboarding@resend.dev` sender, Resend delivers only to the address the Resend account was created with. Set `NOTIFY_EMAIL` to that address, or verify a domain in Resend. |
| `The table "X" isn't open for submissions.` | Add it to `ALLOWED_TABLES` |
| `The list "X" isn't available.` | Add it to `LOOKUP_TABLES` |
| `unknown or read-only column(s)` | A column name is misspelled (names are case-sensitive, e.g. `StationName`), or it's generated or an identity column |
| `new rows can only be labelled in tables with a single ID column` | `_id` labels need a single-column primary key. Insert that table's rows without labels. |
| `This link has already been used` / `expired` / `cancelled` | Each link works once. The admin can reject the old submission with a fresh link, or approve a new access request. |

### Testing

There are no automated tests yet (`npm test` is a placeholder). Testing is manual:

- The **Checks** panel on `index.html` checks the three security rules against the live project: sign-up blocked, `private` hidden, logged-out inserts blocked.
- Walk through each flow end to end: request access, approve, submit with the link, then approve or reject. Also try a used link, an expired link, a table not in `ALLOWED_TABLES`, and a bad column name.

Moving the SQL into `supabase/migrations/` would let pgTAP tests cover the policies and the `private` schema in CI. That is part of the [Supabase assessment](../documentation/authentication/supabase_assessment.md).

### Development

- **Adding a table outside organizations can submit to:** add it to `ALLOWED_TABLES`. No code change is needed. It must be in `public`.
- **Adding a dashboard action:** add a `case` to `admin-api/index.ts` and a wrapper function in `auth.js`. Validate IDs with `isUuid`. Do updates as `update ... where status = 'pending' returning ...`, so two admins can't handle the same item twice.
- **Changing the schema:** for now, add a numbered script to `supabase/sql/` that is safe to run more than once. Long term, schema changes should go through `supabase/migrations/` at the repo root like everything else (see the [deployment guide](../documentation/deployment_guide.md)).
- **Moving to the portal:** `auth.js` is meant to become an Angular service. The links the functions build (`/submit.html`, `/admin.html`) will need to follow the portal's routes.

### Security notes

- **"Signed in" means "admin."** Both the `public` policies (`to authenticated using (true)`) and `admin-api` treat any signed-in user as the admin. That's safe only while sign-ups are off. That setting lives in the dashboard, not in the repo. The local `supabase/config.toml` still has `enable_signup = true`.
- **The Edge Functions connect to Postgres as `postgres`,** so RLS and grants don't apply to them. The checks in `rows.ts` (the table allowlist, column checks, `public` only) are what keeps outside submissions in bounds.
- **Turnstile uses Cloudflare's always-pass test key** in `config.js`. Replace it before launch.
