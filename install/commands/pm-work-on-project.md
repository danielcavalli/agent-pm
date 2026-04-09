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

## Step 3.5: Load dispatch concurrency strategy

Before printing the dispatch plan or spawning any sub-agents, inspect `.pm/swarm/strategy.yaml`.

- If the file exists and parses successfully, extract `parameters.dispatch.max_concurrent_agents`.
- Treat values in the inclusive range `[1, 20]` as valid.
- If the file is missing, malformed, missing that field, or the value is outside `[1, 20]`, fall back to the current behavior: no explicit concurrency cap within a tier.
- When falling back, emit a warning to stderr explaining why the orchestrator is ignoring `strategy.yaml` and continuing with unlimited within-tier dispatch.

Record the result as `dispatch_concurrency_limit` for the rest of the run:

- valid integer => that maximum number of concurrent cross-epic story launches
- fallback => `unlimited`

## Step 4: Print the dispatch plan

Before spawning any sub-agents, display the execution plan for the user:

    ## Dispatch Plan — <PROJECT_CODE>

    **Tier 1** (parallel across epics):
      [PM-E001] S001 → S002  (sequential within epic)
      [PM-E002] S001          (independent)

    **Tier 2** (after Tier 1 completes):
      [PM-E001] S003          (depends on PM-E002-S001)
      [PM-E003] S001          (independent)

    **Concurrency Limit:** `dispatch_concurrency_limit` (from `.pm/swarm/strategy.yaml` when valid, otherwise `unlimited`)
    **Summary:** X stories across Y tiers. Up to Z will run in parallel.

This gives the human visibility into the execution structure before work begins.

## Step 5: Execute tiers with failure reflection

### Dispatch loop

For each tier, starting with Tier 1:

1.  **Prepare tier observation context** — at the start of each tier dispatch, check whether `.pm/swarm/` exists.
    - If `.pm/swarm/` does not exist, set `observation_persistence = disabled` for the tier and skip all observation writes silently for backward compatibility.
    - If `.pm/swarm/` exists, set `observation_persistence = enabled` and call `computeObservationMetadata(pmDir)` once before launching any story in the tier. Reuse that dispatch-time metadata for every observation recorded from that tier.

2.  **Dispatch sub-agents** — for each story in the tier, capture `started_at` immediately before launch, then spawn an independent sub-agent using the Task tool with a **direct-execution prompt contract**. Do **not** pass the literal slash command `/pm-work-on <STORY_CODE>` through to the worker. That prompt shape caused recursive worker loops in early runs because some sub-agents rediscovered `/pm-work-on` and spawned more workers instead of executing the assigned story.

    Use a prompt with this structure:

        Execute story <STORY_CODE> directly in <REPO_ROOT>.

        Context:
        - Project: <PROJECT_CODE>
        - Story: <STORY_CODE> — <STORY_TITLE>
        - Dispatch tier: <TIER_NUMBER>
        - Relevant dependency/failure context:
          <failure log entries relevant to this story, or "none">

        Required workflow:
        1. Run `pm comment list --project <PROJECT_CODE> --task <STORY_CODE> --type agent` first.
        2. Run `pm work <STORY_CODE>` to load the full story context and mark it in progress.
        3. Implement the story directly in the current repo.
        4. Verify every acceptance criterion with targeted tests, content checks, or build steps.
        5. Prefer `pm report create` and `pm story update` for PM artifacts; if repo state prevents that, state exactly what failed and what fallback you used.
        6. End with a `STORY_RESULT` block containing status, criteria_verified, criteria_failed, blockers, and reflection.

        Anti-recursion guard:
        - Do not invoke `/pm-work-on`, `/pm-work-on-project`, or any other slash command.
        - Do not spawn additional sub-agents or delegate this story.
        - Do the work yourself in this repo.

    Launch cross-epic stories in the tier with this concurrency policy:
    - If `dispatch_concurrency_limit = unlimited`, preserve the current behavior and launch all eligible cross-epic stories immediately.
    - If `dispatch_concurrency_limit` is a number, launch at most that many cross-epic stories at once.
    - When more eligible stories exist than available slots, keep the remaining stories queued within the same tier and launch the next queued story as soon as a running story completes.

    For same-epic stories within the tier, still launch them **sequentially** (wait for S001 to finish before starting S002), and count only actively running story launches against the concurrency cap.

3.  **Collect results** — each sub-agent will emit a structured `STORY_RESULT` block at the end of its output. Capture `completed_at` when the sub-agent returns, then parse the full stdout with `parseStoryResult(stdout)` to extract:
    - `status`: `done`, `blocked`, or `failed`
    - `criteria_verified` / `criteria_failed`
    - `blockers`: story codes it's blocked on
    - `reflection`: why it failed or was blocked

    If `parseStoryResult(stdout)` returns `null`, log a warning that the story produced an unparsable `STORY_RESULT`, skip observation persistence for that story, and continue the orchestrator loop without crashing.

4.  **Persist observations** — if `observation_persistence = enabled` and `parseStoryResult(stdout)` returned a valid result, write `.pm/swarm/observations/<story-code>.yaml` using `writeObservation(pmDir, record)` with:
    - `story_code`: parsed `code`
    - `status`: parsed `status`
    - `criteria_verified`: parsed `criteria_verified`
    - `criteria_failed`: parsed `criteria_failed`
    - `metrics`: `{}`
    - `strategy_hash`: the tier's dispatch-time `computeObservationMetadata(pmDir)` `strategy_hash` value
    - `board_hash`: the tier's dispatch-time `computeObservationMetadata(pmDir)` `board_hash` value
    - `config_version`: the tier's dispatch-time `computeObservationMetadata(pmDir)` `config_version` value (`0` when `strategy.yaml` is absent)
    - `started_at`: the timestamp captured immediately before dispatching that story
    - `completed_at`: the timestamp captured when that sub-agent returned

5.  **Record results** — maintain a running log:
    - `done` stories: record as `✓ <STORY_CODE>: <title>`
    - `failed` stories: record as `✗ <STORY_CODE>: <title>` and capture the `reflection` field
    - `blocked` stories: record as `⊘ <STORY_CODE>: <title> — blocked on <blockers>`

6.  **Build failure context** — after the tier completes, compile all failure reflections into a **failure log**:

    ## Failure Log (passed to subsequent tiers)
    - PM-E001-S002 FAILED: "Build error in auth module — missing dependency on bcrypt.
      The package.json needs bcrypt added before any auth stories can proceed."
    - PM-E002-S001 BLOCKED: "Blocked on PM-E001-S001 which has not completed."

7.  **Dispatch next tier** — when spawning sub-agents for the next tier, reuse the same direct-execution prompt contract and include the failure log as additional context if any of their dependencies failed or if they share an epic with a failed story.

    Context from previous tier:
    <failure log entries relevant to this story>

8.  **Re-check blocked stories** — after each tier, check if any previously blocked stories are now unblocked (their blockers completed in this tier). If so, add them to the next tier's dispatch.

9.  **Stop conditions:**
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
- Never delegate by forwarding slash-command tokens to sub-agents — dispatch workers with the explicit direct-execution contract above
