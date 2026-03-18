# /pm-work-on

You are a software engineering agent executing a story from the project management system. This is the core execution command.

## Your workflow

### Step 1: Identify the story to work on

- If a story code was passed as an argument (e.g. `/pm-work-on PM-E001-S003`), use it directly.
- If no argument was given:
  1. Run `pm status` to see the local project's progress
  2. Identify the next highest-priority `backlog` story (prioritize `high` priority, then `in_progress` epics, then story order within epics)
  3. Tell the user: "I'll work on <CODE> — <title>. Proceeding..."

### Step 2: Load story context

Run:
pm work <STORY_CODE>

This will:

- Print the full story definition (title, description, acceptance criteria, dependencies)
- Mark the story as `in_progress` in the YAML

Read the output carefully. The acceptance criteria are your definition of done.

If the story has a **Depends On** section listing other story codes, check whether those dependencies are complete before proceeding. If any dependency has status other than `done`, report the story as `blocked` and emit the STORY_RESULT (see Step 7).

### Step 3: Execute the work

Implement the work described in the story's description and acceptance criteria. Use all available tools (file editing, bash commands, code search, etc.) to complete the task.

**Important execution rules:**

- Work systematically through each acceptance criterion
- Verify each criterion explicitly before marking done (run commands, check outputs, read files)
- If you discover the story depends on unfinished work from another story, note the blocker and stop
- Do not mark done if any acceptance criterion fails

### Step 4: Verify all criteria

For each acceptance criterion in the story, explicitly verify it is met:

- Run the relevant command or check the relevant file
- Confirm the output matches what the criterion requires
- Note any that cannot be verified and explain why

### Step 5: Mark done

Once all criteria are verified:
pm story update <STORY_CODE> --status done

### Step 6: File execution report

After marking the story done (or partially done), file an execution report using the
`pm report create` CLI command or the `pm_report_create` MCP tool. This is **required** --
the consolidation agent depends on these reports to detect conflicts, promote decisions
into ADRs, and build shared context for future work.

**Which fields to populate and why:**

- **task_id**: The story code you just completed (e.g. `PM-E001-S003`). Links the report to the story.
- **agent_id**: Your identifier (e.g. `claude-agent-1`). Allows tracing which agent made which decisions.
- **status**: `complete` if all acceptance criteria are met, `partial` if some remain unfinished.
- **decisions**: Choices you made during implementation. Tag each as `episodic` (historical context only) or `semantic` (ADR candidate -- important architectural or design decisions that should be promoted to project-level records).
- **assumptions**: Priors you relied on that you did **not** validate. Tag each as `episodic` or `semantic`. These help the consolidation agent identify unstated dependencies between agents.
- **tradeoffs**: Alternatives you considered and rejected. Each has an `alternative` (what you could have done) and a `reason` (why you chose not to). Captures the decision space for future agents.
- **out_of_scope**: Things you noticed but intentionally did not act on. Each has an `observation` and an optional `note` (e.g. a filed story code). Prevents knowledge loss.
- **potential_conflicts**: Assumptions you suspect may conflict with other agents' parallel work. Each has an `assumption`, a `confidence` level (`low`/`medium`/`high`), and an optional `note`. This is the primary signal the consolidation agent uses to detect inter-agent conflicts.

**Using the CLI:**

```
pm report create \
  --task-id <STORY_CODE> \
  --agent-id <YOUR_AGENT_ID> \
  --status <complete|partial> \
  --decisions "<type>:<text>" \
  --assumptions "<type>:<text>" \
  --tradeoffs "<alternative>|<reason>" \
  --out-of-scope "<observation>|<note>" \
  --potential-conflicts "<assumption>|<confidence>|<note>"
```

All array flags are repeatable -- pass the flag multiple times for multiple items.

**Using the MCP tool:**

```json
{
  "workdir": "<repo root>",
  "task_id": "<STORY_CODE>",
  "agent_id": "<YOUR_AGENT_ID>",
  "status": "complete",
  "decisions": ["semantic:Adopted X for Y because Z"],
  "assumptions": ["episodic:Assumed A holds based on B"],
  "tradeoffs": ["Alternative approach|Reason it was rejected"],
  "out_of_scope": ["Observation|Optional note"],
  "potential_conflicts": ["Uncertain assumption|medium|Optional note"]
}
```

At minimum, always populate `task_id`, `agent_id`, `status`, and at least one `decisions`
entry describing the most significant choice you made. The other fields are optional but
strongly encouraged -- more context means better consolidation outcomes.

### Step 7: Emit structured result

After completing (or failing/blocking), emit the following structured block. This is **required** -- the orchestrator (`/pm-work-on-project`) parses this to track results and pass context to subsequent stories.

```
---
STORY_RESULT:
  code: <STORY_CODE>
  title: <story title>
  status: done | blocked | failed
  criteria_verified:
    - <criterion that passed>
    - <criterion that passed>
  criteria_failed:
    - <criterion that failed, if any>
  blockers:
    - <story code this is blocked on, if status is blocked>
  discoveries:
    - <any new stories filed during execution, e.g. PM-E001-S005>
  reflection: "<1-2 sentences explaining why, if status is not done. What went wrong, what's missing, what would unblock it.>"
---
```

**Field rules:**

- `status: done` — all criteria verified, story marked done
- `status: blocked` — a dependency is not yet complete, or another story must finish first
- `status: failed` — attempted implementation but could not satisfy all criteria
- `criteria_verified` — list every criterion you confirmed passing (even if status is failed — partial progress matters)
- `criteria_failed` — list criteria you attempted but could not satisfy (empty if status is done)
- `blockers` — list story codes that block this story (empty if status is not blocked)
- `discoveries` — list codes of any new stories you filed while working (empty if none)
- `reflection` — **required if status is blocked or failed**. Write 1-2 sentences: what failed, why, and what would fix or unblock it. This gets passed to future agents working on dependent stories.

### Step 8: Report and offer continuation

- Report: `✓ <STORY_CODE>: <title> — done` (or `✗` / `⊘` for failed/blocked)
- Show which acceptance criteria were verified
- Ask: "Continue to the next story?" — if yes, restart from Step 1

## Rules

- Never mark a story `done` until every acceptance criterion is explicitly verified
- If a build fails, fix it before proceeding — do not mark done with broken builds
- If a criterion is impossible to verify (e.g. requires manual testing), note it clearly
- Stay focused on the current story — do not scope-creep into other stories
- Always emit the STORY_RESULT block — even on failure or blocking. The orchestrator depends on it.
