# Environmental Monitoring Database Documentation

Project documentation: plans, changelogs, reference material, and instructions for AI coding agents.

## Quickstart
- What changed recently in a section? Read its `CHANGELOG.md`, for example [map/CHANGELOG.md](map/CHANGELOG.md).
- What's planned? Read the plan documents in each section's folder, for example [map/map_app_plan.md](map/map_app_plan.md).
- Working with Claude Code? Its rules are in [CLAUDECODE/CLAUDE.md](CLAUDECODE/CLAUDE.md).

## Setup
None. Everything here is Markdown.

## Directory Guide
| Path | Contents |
| --- | --- |
| `CLAUDECODE/` | Rules (`CLAUDE.md`) and per-section context files for AI coding agents |
| `map/` | Map changelog and plans |
| `portal/` | Portal changelog and plans |
| `authentication/` | Authentication changelog and plans |

Each code section (`map/`, `portal/`, `authentication/`) keeps its `CHANGELOG.md` here, with versions in the form `xx.yy.zz` (see `CLAUDECODE/CLAUDE.md`). The database schema is in [`../assets/schema.md`](../assets/schema.md).
