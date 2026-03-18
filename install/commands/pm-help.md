---
description: List all /pm-* slash commands and their purpose
---

Here is a reference of all available `/pm-*` slash commands:

| Command               | Arguments                   | Description                                                                                                                                                        |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/pm-status`          | _(none)_                    | Show the local project's progress, in-progress stories, blockers, and the recommended next story to work on.                                                       |
| `/pm-create-project`  | _(none)_                    | Guided wizard to create a new project — collects name, description, vision, tech stack, and proposes initial epics.                                                |
| `/pm-add-epic`        | `[PROJECT_CODE]`            | Add a new epic to a project with an optional story decomposition step. Prompts for title, description, and priority.                                               |
| `/pm-add-story`       | `[EPIC_CODE]`               | Add a new story to an epic with guided acceptance criteria and Fibonacci story point estimation.                                                                   |
| `/pm-refine-epic`     | `[EPIC_CODE]`               | Research an epic and propose a detailed story breakdown for human approval. **Plan-only until you type `yes`.**                                                    |
| `/pm-work-on`         | `[STORY_CODE]`              | Execute a single story end-to-end: load context, implement, verify every acceptance criterion, mark done, and emit a structured STORY_RESULT for the orchestrator. |
| `/pm-work-on-project` | `[PROJECT_CODE]`            | Orchestrator — builds a dependency-aware dispatch plan, runs stories in parallel across epics, passes failure reflections to subsequent tiers.                     |
| `/pm-prioritize`      | `[PROJECT_CODE\|EPIC_CODE]` | Re-order backlog stories and epics according to a strategy you describe (e.g. "quick wins first", "unblock E003").                                                 |
| `/pm-iterate-plan`    | `<PROJECT_CODE> [--guidance <path>] [--max-rounds <N>]` | Multi-agent iterative planning: 4 sub-agents (Drafter, Reviewer, Researcher, Reporter) refine a plan until consensus, then present for approval.                 |
| `/pm-review-plan`     | `<path> "<prompt>" [--max-loop <N>] [--target <score>] [--verbose \| --summary]` | Generic document review pipeline: 5 fixed sub-agents (Research Reviewer, Researcher Validator, Evaluator, Integrity Checker, Drafter) + on-demand Creative Agent iteratively improve any plan/design doc. Configurable convergence target and output verbosity. |
| `/pm-review-generic`  | `<path> "<grounding-prompt>" [--max-loop <N>] [--target <score>] [--verbose \| --summary]` | Subject-adaptive document review pipeline: 5 fixed sub-agents (Content Reviewer, Evaluator, Integrity Checker, Creative Agent, Drafter) iteratively improve any document. The grounding prompt drives evaluation criteria -- no hardcoded academic standards. |
| `/pm-audit`           | `[PROJECT_CODE]`            | Compare the project's PRD/spec against the actual implementation, flag gaps, and auto-create epics for missing work.                                               |
| `/pm-implement`       | _(none)_                    | **Deprecated.** Use `/pm-work-on-project` instead.                                                                                                                 |

## Notes

- Arguments in `[brackets]` are optional — if omitted, the command will prompt you or auto-detect from context.
- Pass arguments directly after the command name: `/pm-work-on PM-E001-S003`
- All commands use the global `pm` CLI. Run `pm --help` in a terminal for raw CLI flags.
