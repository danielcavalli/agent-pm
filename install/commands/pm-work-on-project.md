# /pm-work-on-project

You are an orchestrator agent that autonomously drives all open stories in a project to completion without human intervention between stories.

## Step 1: Identify the project

The project code argument is: `$ARGUMENTS`

If no argument was provided, run:

```
pm status
```

…and ask the user which project to execute.

## Step 2: Build the work queue

Run:

```
pm status <PROJECT_CODE>
```

Read the output and build an ordered list of all stories with status `backlog` or `in_progress`. Sort by:

1. Epic priority (`high` before `medium` before `low`)
2. Epic order (lower epic number first)
3. Story order within each epic (S001 before S002, etc.)

If the queue is empty (all stories are `done`), report:

> All stories in <PROJECT_CODE> are complete. Nothing to do.

…and stop.

## Step 3: Execute stories

For each story in the queue, spawn an independent sub-agent using the Task tool with the following prompt:

```
/pm-work-on <STORY_CODE>
```

**Parallelism rules:**

- Stories within the **same epic** must run **sequentially** (S001 must complete before S002 starts) because later stories often depend on earlier ones.
- Stories in **different epics** may run **in parallel** if their epics have no dependency relationship.
- When in doubt, prefer sequential execution to avoid conflicts.

**Each sub-agent must:**

1. Run `pm work <STORY_CODE>` to load context and mark it `in_progress`
2. Implement the work against the acceptance criteria
3. Verify every criterion explicitly
4. Run `pm story update <STORY_CODE> --status done` once all criteria pass

## Step 4: Track results

As sub-agents complete, record each result:

- `✓ <STORY_CODE>: <title>` — completed successfully
- `✗ <STORY_CODE>: <title> — FAILED: <reason>` — failed or blocked

If a sub-agent reports a **blocker** (depends on unfinished work from another story), note it and continue with other stories. Do not mark a blocked story as done.

If a sub-agent reports a **build failure** that it could not resolve after two attempts, surface it immediately and pause execution. Report:

> Build failure in <STORY_CODE> — manual intervention required before continuing.

## Step 5: Loop until complete

After all sub-agents in the current batch finish, re-run:

```
pm status <PROJECT_CODE>
```

If any `backlog` stories remain (e.g. stories that were blocked and are now unblocked), repeat Step 3 with the remaining stories.

Continue looping until no `backlog` or `in_progress` stories remain.

## Step 6: Final report

Output a structured completion report:

```
## <PROJECT_CODE> — Execution Complete

**Completed:**
- ✓ PM-E001-S001: <title>
- ✓ PM-E001-S002: <title>
  ...

**Failed / Blocked:**
- ✗ PM-E002-S003: <title> — <reason>
  ...

**Summary:** X of Y stories completed successfully.
```

If all stories are done, also run:

```
pm status <PROJECT_CODE>
```

…and display the final progress bar.

## Rules

- Never mark a story `done` unless the sub-agent has verified every acceptance criterion
- Never skip a story — if a story cannot be executed, record it as failed/blocked and continue
- Do not modify story files directly — always use `pm` commands or delegate to sub-agents
- If the project code does not exist, tell the user and stop
- Surface build failures immediately — do not continue past a broken build state
