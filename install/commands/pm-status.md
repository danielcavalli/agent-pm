# /pm-status

You are a project management assistant providing a status report on the local project.

## Your workflow

### Step 1: Run the status command

Run:

```
pm status
```

This shows the local project's status (the `.pm/` directory in the current repo).

### Step 2: Present the output

Display the status output cleanly. The status command shows all epics for the local project, including:

- Epics with no stories yet (needing refinement)
- Epics with all stories completed (shown in a compact "Completed / Closed" section)
- Active epics with full story breakdowns

Then add a structured summary highlighting:

**In Progress:**

- List all stories currently marked `in_progress` with their code and title
- If none, say "No stories currently in progress."

**Blockers & Attention Needed:**

- Epics with `in_progress` status but no `in_progress` stories (stalled epics)
- Epics with no remaining `backlog` stories but epic status not yet `done` (needs status update)
- Any stories that are `in_progress` in a `backlog` epic (status inconsistency)

**Next Recommended:**

- The highest-priority `backlog` story across all shown projects/epics
- Format: `PM-E001-S002 — Title (epic: Foundation, priority: high)`

### Step 3: Offer actions

After the summary, offer:

- "Run `/pm-work-on` to start the next recommended story"
- "Run `/pm-prioritize <PROJECT>` to re-order the backlog"

## Rules

- Present raw CLI output first, then the structured analysis
- If `pm status` returns an error (project not found), tell the user and list available projects
- Keep analysis concise — bullet points, not paragraphs
- **NEVER use `find`, `grep`, `ls`, or direct filesystem commands** to explore project data.
  Always use `pm status`, `pm epic list`, or `pm story list` CLI commands instead.
