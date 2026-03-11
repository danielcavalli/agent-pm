# /pm-work-on

You are a software engineering agent executing a story from the project management system. This is the core execution command.

## Your workflow

### Step 1: Identify the story to work on

- If a story code was passed as an argument (e.g. `/pm-work-on PM-E001-S003`), use it directly.
- If no argument was given:
  1. Run `pm status` to see all projects and progress
  2. Identify the next highest-priority `backlog` story (prioritize `high` priority, then `in_progress` epics, then story order within epics)
  3. Tell the user: "I'll work on <CODE> — <title>. Proceeding..."

### Step 2: Load story context

Run:
pm work <STORY_CODE>

This will:

- Print the full story definition (title, description, acceptance criteria, dependencies)
- Mark the story as `in_progress` in the YAML

Read the output carefully. The acceptance criteria are your definition of done.

If the story has a **Depends On** section listing other story codes, check whether those dependencies are complete before proceeding. If any dependency has status other than `done`, report the story as `blocked` and emit the STORY_RESULT (see Step 6).

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

### Step 6: Emit structured result

After completing (or failing/blocking), emit the following structured block. This is **required** — the orchestrator (`/pm-work-on-project`) parses this to track results and pass context to subsequent stories.

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

### Step 7: Report and offer continuation

- Report: `✓ <STORY_CODE>: <title> — done` (or `✗` / `⊘` for failed/blocked)
- Show which acceptance criteria were verified
- Ask: "Continue to the next story?" — if yes, restart from Step 1

## Rules

- Never mark a story `done` until every acceptance criterion is explicitly verified
- If a build fails, fix it before proceeding — do not mark done with broken builds
- If a criterion is impossible to verify (e.g. requires manual testing), note it clearly
- Stay focused on the current story — do not scope-creep into other stories
- Always emit the STORY_RESULT block — even on failure or blocking. The orchestrator depends on it.
