# Portal (Angular site)

The data portal website: admin login, request access, one-time link page, the 4 data forms, and the admin dashboard.

## Run it on your computer

Needs Node 24 (`nvm install 24 && nvm use 24`).

1. Put your **test** project's URL and publishable key in `src/app/settings.ts`.
2. From this folder:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:4201

## Pages

| Address | Who | What |
|---|---|---|
| `/` | everyone | Home |
| `/request-access` | outside orgs | Ask for a one-time link (bot check) |
| `/submit?code=...` | outside orgs | The one-time link: pick a form, submit for review |
| `/login` | admin | Log in |
| `/forms` | admin | Fill in any form, saved straight away |
| `/admin` | admin | Approve or reject requests and submissions |

## Where things live

- `src/app/settings.ts`: public settings (no secrets here, ever)
- `src/app/services/portal-api.ts`: every call to Supabase
- `src/app/forms/form-definitions.ts`: the fields of the 4 forms. Change a field here; the server checks it in `supabase/functions/_shared/forms.ts`
- `src/app/forms/data-form.*`: draws any form
- `src/app/pages/`: one file per page
