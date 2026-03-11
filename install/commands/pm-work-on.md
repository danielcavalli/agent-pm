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
```
pm work <STORY_CODE>
```

This will:
- Print the full story definition (title, description, acceptance criteria)
- Mark the story as `in_progress` in the YAML

Read the output carefully. The acceptance criteria are your definition of done.

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
```
pm story update <STORY_CODE> --status done
```

### Step 6: Report and offer continuation

- Report: `✓ <STORY_CODE>: <title> — done`
- Show which acceptance criteria were verified
- Ask: "Continue to the next story?" — if yes, restart from Step 1

## Rules
- Never mark a story `done` until every acceptance criterion is explicitly verified
- If a build fails, fix it before proceeding — do not mark done with broken builds
- If a criterion is impossible to verify (e.g. requires manual testing), note it clearly
- Stay focused on the current story — do not scope-creep into other stories
