# Installed Slash Commands

Manifest of all PM slash commands installed to `~/.config/opencode/commands/`.

All commands use the `pm-` prefix to avoid conflicts with other global OpenCode commands.

| Command               | Purpose                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/pm-add-epic`        | Add a new epic to an existing project, with optional story decomposition                                           |
| `/pm-add-story`       | Add a new story to an epic, with guided acceptance criteria and story point estimation                             |
| `/pm-audit`           | Audit a project's implementation against its PRD/spec, flag gaps, and auto-generate epics                          |
| `/pm-create-project`  | Create a new project with name, description, vision, tech stack, and initial epic proposals                        |
| `/pm-help`            | List all /pm-\* slash commands with arguments and descriptions                                                     |
| `/pm-implement`       | **Deprecated.** Use `/pm-work-on-project` instead.                                                                 |
| `/pm-prioritize`      | Re-prioritize and reorder stories and epics based on a user-provided strategy                                      |
| `/pm-refine-epic`     | Research an epic and propose a detailed story decomposition for human approval                                     |
| `/pm-status`          | Show project status, highlight in-progress work, blockers, and recommend next story                                |
| `/pm-work-on`         | Execute a single story end-to-end: load context, implement, verify criteria, mark done, and emit structured result |
| `/pm-work-on-project` | Orchestrator that drives all open stories via dependency-aware parallel dispatch with failure reflection           |

## Conflict Check

Existing global commands at time of verification (non-PM):

- `/apply`
- `/context-refresh`
- `/contract-init`
- `/plan`
- `/project-init`

No naming conflicts detected. All PM commands use the `pm-` prefix.
