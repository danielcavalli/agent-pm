# /pm-work-on-project

You are an orchestrator agent that autonomously drives all open stories in a project to completion. You dispatch sub-agents in parallel where safe to do so, using explicit dependency data to determine execution order.

## Step 1: Identify the project

The project code argument is: `$ARGUMENTS`

If no argument was provided, the orchestrator operates on the local project (the `.pm/` directory in the current repo). Run `pm status` to confirm the project context.

## Step 2: Build the work queue

Run:

    pm status <PROJECT_CODE>

Read the output and build an ordered list of all stories with status `backlog` or `in_progress`. Sort by:

1. Epic priority (`high` before `medium` before `low`)
2. Epic order (lower epic number first)
3. Story order within each epic (S001 before S002, etc.)

If the queue is empty (all stories are `done`), report:

> All stories in <PROJECT_CODE> are complete. Nothing to do.

...and stop.

## Step 3: Build the dependency manifest

For each epic that has stories in the work queue, run:

    pm story list <EPIC_CODE> --deps

This shows each story's `depends_on` field — the list of story codes that must be completed before it can start.

Build a dependency graph from two sources:

1. **Explicit dependencies** — the `depends_on` field on each story. A story with `depends_on: [PM-E001-S002]` cannot start until PM-E001-S002 has status `done`.
2. **Implicit same-epic ordering** — stories within the same epic are treated as sequentially dependent by default (S001 before S002 before S003). This is because later stories in an epic often build on earlier ones.

Using this graph, classify stories into **dispatch tiers**:

- **Tier 1:** Stories with no unmet dependencies (no explicit `depends_on` pointing to incomplete stories, and no earlier same-epic story still in queue).
- **Tier 2:** Stories whose dependencies are all in Tier 1.
- **Tier N:** Stories whose dependencies are all in tiers < N.

Within each tier, stories in **different epics** can run in **parallel**. Stories in the **same epic** within the same tier run **sequentially** (by story order).

## Step 4: Print the dispatch plan

Before spawning any sub-agents, display the execution plan for the user:

    ## Dispatch Plan — <PROJECT_CODE>

    **Tier 1** (parallel across epics):
      [PM-E001] S001 → S002  (sequential within epic)
      [PM-E002] S001          (independent)

    **Tier 2** (after Tier 1 completes):
      [PM-E001] S003          (depends on PM-E002-S001)
      [PM-E003] S001          (independent)

    **Summary:** X stories across Y tiers. Z will run in parallel.

This gives the human visibility into the execution structure before work begins.

## Step 5: Execute tiers with failure reflection

### Dispatch loop

For each tier, starting with Tier 1:

1.  **Dispatch sub-agents** — for each story in the tier, spawn an independent sub-agent using the Task tool with the following prompt:

        /pm-work-on <STORY_CODE>

    Launch all cross-epic stories in the tier as **parallel** sub-agents. For same-epic stories within the tier, launch them **sequentially** (wait for S001 to finish before starting S002).

2.  **Collect results** — each sub-agent will emit a structured `STORY_RESULT` block at the end of its output. Parse it to extract:
    - `status`: `done`, `blocked`, or `failed`
    - `criteria_verified` / `criteria_failed`
    - `blockers`: story codes it's blocked on
    - `reflection`: why it failed or was blocked

3.  **Record results** — maintain a running log:
    - `done` stories: record as `✓ <STORY_CODE>: <title>`
    - `failed` stories: record as `✗ <STORY_CODE>: <title>` and capture the `reflection` field
    - `blocked` stories: record as `⊘ <STORY_CODE>: <title> — blocked on <blockers>`

4.  **Build failure context** — after the tier completes, compile all failure reflections into a **failure log**:

    ## Failure Log (passed to subsequent tiers)
    - PM-E001-S002 FAILED: "Build error in auth module — missing dependency on bcrypt.
      The package.json needs bcrypt added before any auth stories can proceed."
    - PM-E002-S001 BLOCKED: "Blocked on PM-E001-S001 which has not completed."

5.  **Dispatch next tier** — when spawning sub-agents for the next tier, include the failure log as additional context in the prompt if any of their dependencies failed or if they share an epic with a failed story:

    /pm-work-on <STORY_CODE>

    Context from previous tier:
    <failure log entries relevant to this story>

6.  **Re-check blocked stories** — after each tier, check if any previously blocked stories are now unblocked (their blockers completed in this tier). If so, add them to the next tier's dispatch.

7.  **Stop conditions:**
    - If a sub-agent reports a **build failure** that it could not resolve after two attempts, pause execution immediately:

      > Build failure in <STORY_CODE> — manual intervention required before continuing.

    - If all remaining stories are `blocked` or `failed` with no new completions in the last tier, stop the loop (quiescence).

### Loop until complete

Continue dispatching tiers until:

- All stories are `done`, or
- A stop condition is hit, or
- No more progress can be made (all remaining stories are blocked/failed)

## Step 6: Final report

Output a structured completion report:

    ## <PROJECT_CODE> — Execution Complete

    **Completed:**
    - ✓ PM-E001-S001: <title>
    - ✓ PM-E001-S002: <title>

    **Failed:**
    - ✗ PM-E002-S003: <title>
      Reflection: <failure reflection from sub-agent>

    **Blocked:**
    - ⊘ PM-E003-S001: <title> — blocked on PM-E002-S003

    **Summary:** X of Y stories completed successfully across Z tiers.

If all stories are done, also run:

    pm status <PROJECT_CODE>

...and display the final progress bar.

## Rules

- Never mark a story `done` unless the sub-agent has verified every acceptance criterion
- Never skip a story — if a story cannot be executed, record it as failed/blocked and continue
- Do not modify story files directly — always use `pm` commands or delegate to sub-agents
- If the project code does not exist, tell the user and stop
- Surface build failures immediately — do not continue past a broken build state
- Treat same-epic stories as sequentially ordered unless `depends_on` creates a different structure
- Treat cross-epic stories as parallel unless `depends_on` links them
- Always pass failure reflections forward to subsequent tiers — this is how agents learn from prior failures
