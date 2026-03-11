---
description: List all /pm-* slash commands and their purpose
---

Here is a reference of all available `/pm-*` slash commands:

| Command               | Arguments                   | Description                                                                                                                             |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/pm-status`          | `[PROJECT_CODE]`            | Show project progress, in-progress stories, blockers, and the recommended next story to work on. Omit the argument to see all projects. |
| `/pm-create-project`  | _(none)_                    | Guided wizard to create a new project — collects name, description, vision, tech stack, and proposes initial epics.                     |
| `/pm-add-epic`        | `[PROJECT_CODE]`            | Add a new epic to a project with an optional story decomposition step. Prompts for title, description, and priority.                    |
| `/pm-add-story`       | `[EPIC_CODE]`               | Add a new story to an epic with guided acceptance criteria and Fibonacci story point estimation.                                        |
| `/pm-refine-epic`     | `[EPIC_CODE]`               | Research an epic and propose a detailed story breakdown for human approval. **Plan-only until you type `yes`.**                         |
| `/pm-work-on`         | `[STORY_CODE]`              | Execute a single story end-to-end: load context, implement, verify every acceptance criterion, and mark done.                           |
| `/pm-work-on-project` | `[PROJECT_CODE]`            | Autonomous orchestrator — builds a work queue of all open stories and drives them to completion, running independent epics in parallel. |
| `/pm-prioritize`      | `[PROJECT_CODE\|EPIC_CODE]` | Re-order backlog stories and epics according to a strategy you describe (e.g. "quick wins first", "unblock E003").                      |
| `/pm-audit`           | `[PROJECT_CODE]`            | Compare the project's PRD/spec against the actual implementation, flag gaps (✅ / ⚠️ / ❌), and auto-create epics for missing work.     |
| `/pm-implement`       | _(none)_                    | Full autonomous implementation loop that works through all epics and stories in sequence from E001 onward.                              |

## Notes

- Arguments in `[brackets]` are optional — if omitted, the command will prompt you or auto-detect from context.
- Pass arguments directly after the command name: `/pm-work-on PM-E001-S003`
- All commands use the global `pm` CLI. Run `pm --help` in a terminal for raw CLI flags.
