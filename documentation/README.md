# Environmental Monitoring Database Documentation

Project documentation: plans, changelogs, reference material, and instructions for AI coding agents.

## Quickstart
- What changed recently in a section? Read its `CHANGELOG.md`, for example [map/CHANGELOG.md](map/CHANGELOG.md).
- What's planned? Read the plan documents in each section's folder, for example [map/map_app_plan.md](map/map_app_plan.md).
- Working with Claude Code? Its rules are in [CLAUDECODE/CLAUDE.md](CLAUDECODE/CLAUDE.md).
- Changing the database (tables, policies, functions)? Read [deployment_guide.md](deployment_guide.md) first: how changes reach the hosted Supabase project, and how to develop and test against it locally.

## Setup
None. Everything here is Markdown.

## Directory Guide
| Path | Contents |
| --- | --- |
| `deployment_guide.md` | How database changes are developed, tested, and deployed to the hosted Supabase project (for portal and authentication developers) |
| `CLAUDECODE/` | Rules (`CLAUDE.md`) and per-section context files for AI coding agents |
| `map/` | Map changelog and plans, the API contract (`api.md`), and the guide to adding or changing a layer (`adding_a_layer.md`) |
| `portal/` | Portal changelog and plans |
| `authentication/` | Authentication changelog and plans |

Each code section (`map/`, `portal/`, `authentication/`) keeps its `CHANGELOG.md` here, with versions in the form `xx.yy.zz` (see `CLAUDECODE/CLAUDE.md`). The database schema is in [`schema.md`](schema.md).
