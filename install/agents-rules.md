# PM Autonomous Filing Rules

## Project Management — Autonomous Filing

You have access to a project management system via the `pm_epic_add`, `pm_story_add`,
and `pm_status` tools. Use these to **proactively decompose work** into trackable items
and to **capture issues you discover** during your tasks. This enables parallel agents
to pick up and execute work independently.

### Local Project Discovery

The PM system stores all project data in a `.pm/` directory at the repository root.
When you run PM commands, they automatically discover and use the `.pm/` directory
in your current working directory (or the nearest ancestor directory containing `.pm/`).

Project codes (e.g., `PM`, `BLOG`) are optional in most commands — the CLI infers the
project from your current working directory. Use project codes explicitly only when
working across multiple projects or when your cwd differs from the target project.

### When to file

**Reactive — issues discovered while working:**

- You discover a **bug or regression** unrelated to your current task
- You notice **tech debt** (duplicated code, missing error handling, outdated patterns)
- You identify a **missing feature** or **improvement opportunity** that is out of scope
- You find **missing or inadequate test coverage** in code you're reading
- You encounter a **performance concern** that warrants investigation

**Proactive — decomposing work you've been given:**

- You're given a goal that spans **multiple independent deliverables** — create an epic,
  then break it into stories before you start implementing
- You identify a piece of work that is **independently completable** and could be handed
  to another agent — file it as a story with clear acceptance criteria
- You're planning implementation and see **natural boundaries** between components,
  layers, or features — each boundary is likely a separate story

### When NOT to file

- The issue is directly related to your current task (just fix it)
- The issue is trivial and can be fixed in under 2 minutes (just fix it)
- You're unsure whether it's actually a problem (mention it to the user instead)
- The work is a **sub-step within a story** you're already executing — use your internal
  task tracking (e.g., todo lists) for steps like "read the code," "write the test,"
  "update the import." These are implementation details, not stories.

### Work Decomposition — Epic vs Story vs Sub-task

Use this hierarchy to decide what level of tracking a piece of work needs:

- **Epic** — A theme or goal with multiple independent deliverables. Examples: "Add user
  authentication," "Migrate database to PostgreSQL," "Implement export system." Create an
  epic when you can see 3+ stories that could be worked on in parallel or in any order.
  An epic is a container, not a task — you don't "do" an epic, you complete its stories.

- **Story** — A specific, independently completable unit of work. A story should be
  something one agent can finish in a single focused session. It must have a clear
  definition of done (acceptance criteria) that another agent or human can verify without
  asking the author what they meant. Examples: "Add password hashing to registration
  endpoint," "Create CSV export for project status," "Write integration tests for
  the MCP server."

- **Sub-task** — A step within a story that only makes sense in the context of that
  story. Do NOT file sub-tasks as stories. Handle them with your internal task tracking.
  Examples: "Read existing validation code," "Add the new field to the schema,"
  "Update the test fixture." If you can't write meaningful acceptance criteria for it
  independent of the parent story, it's a sub-task.

### Writing Stories for Parallel Execution

Stories may be picked up by different agents working in parallel. Write them so that
any agent can execute them without prior context:

- **Title**: Specific and actionable. "Add input validation to user registration
  endpoint" — not "Fix validation" or "Registration stuff."
- **Description**: State what needs to be done, why it matters, and where in the codebase
  the work lives. Include enough context that an agent starting fresh can begin
  without reading the full epic history or asking clarifying questions.
- **Acceptance criteria**: List concrete, verifiable conditions. Each criterion should
  be checkable by running a command, reading a file, or observing a behavior. Avoid
  vague criteria like "code is clean" or "works correctly."
- **Dependencies**: If a story depends on another story being completed first, declare it
  using the `depends_on` field (e.g., `--depends-on PM-E005-S002` when filing via CLI, or
  `depends_on: ["PM-E005-S002"]` via MCP tool). The orchestrator uses this to build
  dispatch tiers — stories with unmet dependencies wait until their dependencies complete.
  Prefer structuring stories to **minimize dependencies** — independent stories can run
  in parallel.
- **Points**: Estimate complexity honestly. 1 = trivial rename or config change,
  3 = typical feature or fix, 5 = complex with multiple files, 8 = significant
  effort spanning a subsystem.

### How to file

1. Run `pm_status` to see existing projects and find the right project code.
   The status output lists **all epics** with their codes, titles, and story counts —
   use this to identify the right epic for your story.
2. If you need more detail on a specific epic, run `pm_status` with the project code
   to see the full epic breakdown including individual story statuses.
3. Determine whether this is a new epic (large theme) or a new story (specific task)
4. For stories: identify the most relevant existing epic from the status output, or file an epic first
5. Use `pm_story_add` or `pm_epic_add` with a clear, actionable title and description
6. For **reactive filing**: continue your current task — do not switch context to work
   on the filed item
7. For **proactive decomposition**: file all stories first, then begin working through
   them (or leave them for parallel agents to pick up)

### Passing workdir to MCP tools

All PM MCP tools accept a `workdir` parameter. **Always pass your current working directory
as workdir** to ensure commands execute in the correct project context. This is especially
important when working across multiple projects or when your process cwd differs from the
target project's root directory.

Example: If you're working in `/home/user/projects/myapp`, pass `workdir: "/home/user/projects/myapp"`
to each MCP tool call.

### IMPORTANT: Use CLI tools, not filesystem exploration

**NEVER** use `find`, `grep`, `ls`, or other filesystem commands to discover or read
project, epic, or story data. The PM CLI tools provide all the information you need:

- `pm status` → lists all projects with every epic code, title, and story count
- `pm status [PROJECT]` → full project detail with active/completed epic sections (project optional)
- `pm epic list [PROJECT]` → tabular epic listing with status and progress (project optional)
- `pm story list <EPIC>` → all stories in an epic with status and criteria
- `pm story list <EPIC> --deps` → same as above, plus each story's `depends_on` codes
- `pm_story_add` accepts `depends_on` (array of story codes) to declare execution dependencies

The project YAML files on disk are an implementation detail. Reading them directly
creates fragile workflows and bypasses validation. Always go through the CLI.

**Note:** If no relevant project exists and you need to create one, always notify the user
first — creating a new project is a higher-impact action than adding to an existing one.

## Post-Task Execution Reports

After completing a story, you **must** file an execution report. Reports capture the
decisions, assumptions, tradeoffs, and observations you made during implementation.
The consolidation agent uses these reports to detect conflicts between parallel agents,
promote important decisions into Architecture Decision Records (ADRs), and build shared
context for future work.

### When to file a report

File a report **immediately after marking a story as done** (or partially done). Every
story completion must produce a report — no exceptions. If you only completed part of
the story, set the status to `partial`.

### Report fields

The report schema (`AgentExecutionReportSchema`) has the following fields:

- **task_id** (required): The story code you just completed (e.g. `PM-E030-S001`).
- **agent_id** (required): Your identifier — use a short descriptive string (e.g.
  `claude-agent-1`, `opus-session-abc`).
- **status** (required): `complete` if all acceptance criteria are met, `partial` if some
  remain unfinished.
- **decisions**: Choices you made and their rationale. Each item has a `type`:
  - `episodic` — historical narrative, relevant only for consolidation context
    (e.g. "Used existing validation middleware instead of writing new one")
  - `semantic` — ADR candidate, eligible for promotion to a project-level decision
    (e.g. "Adopted Zod for runtime schema validation across all CLI commands")
- **assumptions**: Priors you relied on that were **not validated**. Each item has a
  `type` (`episodic` or `semantic`) and a `text` description. Example: "Assumed the
  database migration runs before the API server starts."
- **tradeoffs**: Alternatives you considered and rejected. Each item has an `alternative`
  (what you could have done) and a `reason` (why you chose not to). Example:
  alternative = "Use JSON instead of YAML for config", reason = "YAML supports comments
  and is already used throughout the project."
- **out_of_scope**: Observations that surfaced during your work but were not acted on.
  Each item has an `observation` and an optional `note`. Example: observation = "The
  error handler does not log stack traces in production", note = "Filed as PM-E050-S003."
- **potential_conflicts**: Self-flagged assumptions you know are uncertain or likely to
  conflict with other agents' work. Each item has an `assumption`, a `confidence` level
  (`low`, `medium`, or `high`), and an optional `note`. Use this to signal areas where
  parallel agents may have made contradictory choices.

### How to file — MCP tool

Use the `pm_report_create` tool. Always pass `workdir` to ensure the report lands in the
correct project.

### How to file — CLI

```
pm report create \
  --task-id <STORY_CODE> \
  --agent-id <YOUR_ID> \
  --status <complete|partial> \
  --decisions "<type>:<text>" \
  --assumptions "<type>:<text>" \
  --tradeoffs "<alternative>|<reason>" \
  --out-of-scope "<observation>|<note>" \
  --potential-conflicts "<assumption>|<confidence>|<note>"
```

All array flags (decisions, assumptions, tradeoffs, out-of-scope, potential-conflicts)
are repeatable — pass the flag multiple times for multiple items.

### Worked example

After completing story PM-E030-S001 ("Add execution report schema"), an agent files:

```
pm report create \
  --task-id PM-E030-S001 \
  --agent-id claude-agent-1 \
  --status complete \
  --decisions "semantic:Chose Zod over JSON Schema for runtime validation because it provides TypeScript type inference" \
  --decisions "episodic:Placed schema file in src/schemas/ alongside existing project and story schemas" \
  --assumptions "episodic:Assumed max 10 items per array field is sufficient based on typical story complexity" \
  --tradeoffs "Use JSON Schema directly|Zod integrates better with existing codebase and provides compile-time types" \
  --out-of-scope "Report CLI command is not yet registered in cli.ts|Tracked in PM-E045-S002" \
  --potential-conflicts "Report file naming uses story code as prefix|high|Other agents may expect a different naming convention"
```

Or via the MCP tool:

```json
{
  "workdir": "/path/to/repo",
  "task_id": "PM-E030-S001",
  "agent_id": "claude-agent-1",
  "status": "complete",
  "decisions": [
    "semantic:Chose Zod over JSON Schema for runtime validation because it provides TypeScript type inference",
    "episodic:Placed schema file in src/schemas/ alongside existing project and story schemas"
  ],
  "assumptions": [
    "episodic:Assumed max 10 items per array field is sufficient based on typical story complexity"
  ],
  "tradeoffs": [
    "Use JSON Schema directly|Zod integrates better with existing codebase and provides compile-time types"
  ],
  "out_of_scope": [
    "Report CLI command is not yet registered in cli.ts|Tracked in PM-E045-S002"
  ],
  "potential_conflicts": [
    "Report file naming uses story code as prefix|high|Other agents may expect a different naming convention"
  ]
}
```

The report is saved as a YAML sidecar file in `.pm/reports/` (e.g.
`.pm/reports/PM-E030-S001-report.yaml`).

# END PM Autonomous Filing Rules
