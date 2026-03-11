# PM Autonomous Filing Rules

## Project Management — Autonomous Filing

You have access to a project management system via the `pm_epic_add`, `pm_story_add`,
and `pm_status` tools. Use these to **proactively decompose work** into trackable items
and to **capture issues you discover** during your tasks. This enables parallel agents
to pick up and execute work independently.

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

- `pm_status` (no args) → lists all projects with every epic code, title, and story count
- `pm_status` (with project code) → full project detail with active/completed epic sections
- `pm epic list <PROJECT>` → tabular epic listing with status and progress
- `pm story list <EPIC>` → all stories in an epic with status and criteria
- `pm story list <EPIC> --deps` → same as above, plus each story's `depends_on` codes
- `pm_story_add` accepts `depends_on` (array of story codes) to declare execution dependencies

The project YAML files on disk are an implementation detail. Reading them directly
creates fragile workflows and bypasses validation. Always go through the CLI.

**Note:** If no relevant project exists and you need to create one, always notify the user
first — creating a new project is a higher-impact action than adding to an existing one.

## Task-Start Comment Retrieval Contract

Before beginning work on any story, an agent **MUST** retrieve any existing agent-authored
comments for that story as a CoALA retrieval action — an explicit, agent-initiated pull
from external long-term memory into working memory.

### Mandatory Retrieval Rule

When you start working on a story (either directly or via `/pm-work-on`), you **MUST**
first execute:

```
pm comment list --project <PROJECT> --task <STORY-ID> --type agent
```

Where:

- `<PROJECT>` is the project code (e.g., `PM`, `BLOG`)
- `<STORY-ID>` is the story code (e.g., `PM-E031-S005`)

This retrieval is **mandatory, not optional** — it is a precondition to beginning any
story work.

### Behaviour When No Comments Exist

If the command returns no comments, proceed normally with your work. There is no
additional action required.

### Behaviour When Comments Exceed Context Budget

If the returned comments exceed your context budget:

1. Load the most recent N comments that fit within your context limit
2. Note that truncation occurred in your working memory
3. Continue with the truncated set, prioritizing the most recent comments

### Consumed-By Tracking

After reading each comment, you **MUST** record your own `agent_id` in the comment's
`consumed_by` field. This enables dependency-based garbage collection (see
PM-E035: ADR Lifecycle and Garbage Collection).

To update consumed_by, you would typically:

- Read the comment file from `.pm/comments/`
- Add your agent_id to the `consumed_by` array
- Write the updated comment back

### Worked Example

Suppose you start working on story `PM-E031-S005`:

```
$ pm comment list --project PM --task PM-E031-S005 --type agent

[comment-id]
  Type: agent | Author: agent:prior-agent-001 | Target: PM-E031-S005
  2026-03-10T14:30:00Z
  Started implementation but ran into schema conflict. The comment schema
  needs a `references` field for cross-task linking. See comment C000001.
  Tags: schema, blocking
```

You must:

1. Load this comment into your working context
2. Understand the schema conflict mentioned
3. Add your agent_id to the comment's `consumed_by` field (e.g., `["prior-agent-001", "your-agent-id"]`)
4. Then proceed with your work, taking the prior agent's note into account

### Contract Location

This contract is co-located with the execution report contract defined in
`doc/execution-report-contract.md`. Both contracts define agent responsibilities
for cross-task communication patterns.

# END PM Autonomous Filing Rules
