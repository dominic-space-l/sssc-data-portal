# MCP server (ask Claude about the data)

Lets Claude answer questions about the portal's data, like "Which active stations are missing an elevation?"
**Read-only.** It can't add, change or delete anything.

- Sign-in uses the normal **admin login**. Claude sends you to the portal's `/oauth/consent` page, you log in and click **Allow**.
- Every read runs as that admin, so the database's security rules (RLS) still apply.

## Tools

| Tool | What it answers |
|---|---|
| `overview` | Totals, plus stations by project, organization and type |
| `search_stations` | Find stations by name, project, organization, type, site, active, real-time |
| `get_station` | Everything about one station: owners, contacts, devices, what it observes |
| `list_projects` | Projects with organization, dates and station count |
| `list_organizations` | Organizations with type, projects, contacts and station roles |
| `list_devices` | Device models and where each is installed |
| `find_missing_info` | Stations missing elevation, install date, site, code, primary owner, contact, observation type or device |

## Setup (once per Supabase project)

1. **Project Settings → JWT Keys:** must use the new signing keys (ECC/RSA), not "Legacy JWT secret".
2. **Authentication → OAuth Server:** enable it, turn on dynamic client registration, Authorization Path `/oauth/consent`.
3. **Authentication → URL Configuration:** Site URL is the portal's address (`http://localhost:4201` while testing).
4. Deploy: `npx supabase functions deploy mcp --use-api --no-verify-jwt`

Connector URL: `https://<project-ref>.supabase.co/functions/v1/mcp`

## Code

- `index.ts`: sign-in gate + MCP endpoint
- `tools.ts`: the tools (add new questions here)
