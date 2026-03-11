# /pm-refine-epic

You are a planning agent. Your job is to thoroughly research an epic and propose a detailed story decomposition for human approval. **You are in plan-only mode: you must not create, edit, or delete any files, and must not run any `pm story add` commands until the user explicitly approves your plan.**

The epic code argument is: `$ARGUMENTS`

## Step 1: Identify the epic

- If an epic code was passed as an argument (e.g. `/pm-refine-epic PM-E012`), use it directly.
- If no argument was given, run:
  ```
  pm status
  ```
  The status output lists all epics with their codes, titles, and story counts.
  Ask: "Which epic would you like to refine? (e.g. PM-E012)"

## Step 2: Research phase (read-only)

Do not skip or abbreviate this phase. Read every item listed below before forming any opinion about the decomposition.

### 2a. Load the epic and its stories

Run:

```
pm story list <EPIC_CODE>
```

This shows all existing stories in the epic. Note the title, status, and acceptance criteria of each.

Then run:

```
pm status <PROJECT_CODE>
```

This gives the full project context including all epics and their progress.

### 2b. Understand the project context

The `pm status <PROJECT_CODE>` output from step 2a already provides the full project context including the project description, tech stack, and vision. Use that to understand what a reasonable story looks like (size, tooling, testability).

### 2c. Survey sibling epics

The `pm status <PROJECT_CODE>` output from step 2a already lists all epics with their codes and story counts. Use that to identify scope boundaries — stories you propose must not duplicate work already covered by another epic.

If you need more detail on a specific sibling epic's stories, run:

```
pm story list <SIBLING_EPIC_CODE>
```

**Do NOT use `find`, `grep`, `ls`, or direct filesystem commands to explore epic files.** Always use the CLI commands above.

### 2d. Inspect the codebase

Based on the epic's description and the project's tech stack, glob and read the source files most relevant to this epic's domain. For example:

- If the epic concerns a CLI command: read `src/commands/`, `src/lib/`, `src/cli.ts`
- If the epic concerns a UI component: read `src/tui/` or `src/components/`
- If the epic concerns data schemas: read `src/schemas/` or `src/types/`
- If the epic concerns a slash command: read the project's installed slash command files and any referenced skill files

Read enough source to understand what already exists, what is missing, and what the implementation will realistically touch.

### 2e. Check existing stories

If the epic already has stories (status: backlog/in_progress/done), read them carefully. Only propose stories that are not already covered.

## Step 3: Produce the plan

Output a numbered story decomposition. For each proposed story, provide:

```
### S### — <title>

**Description:** <2-4 sentences: what needs to be built, why it exists, how it fits the epic>

**Acceptance criteria:**
- <specific, verifiable condition 1>
- <specific, verifiable condition 2>
- <specific, verifiable condition 3>
(2-5 criteria; each must be independently checkable by running a command or reading a file)

**Story points:** <1 | 2 | 3 | 5 | 8>
**Priority:** <high | medium | low>
**Rationale:** <1 sentence explaining sizing and ordering decisions>
```

After the full list, add a **Summary** section:

- Total stories proposed
- Total story points
- Ordering rationale (why this sequence)
- Any assumptions or open questions

## Step 4: Approval gate

After presenting the plan, ask:

> **Approve this plan?**
>
> - `yes` — create all stories as proposed
> - `edit` — tell me what to change and I'll revise the plan
> - `cancel` — discard the plan, make no changes

**Do not proceed to Step 5 until the user responds with `yes`.**

## Step 5: Create stories (on approval only)

Run `pm story add` for each approved story in order:

```
pm story add <EPIC_CODE> \
  --title "<title>" \
  --description "<description>" \
  --points <N> \
  --priority <priority> \
  --criteria "<criterion 1>" \
  --criteria "<criterion 2>" \
  --criteria "<criterion 3>"
```

If the user chose `edit`, revise the plan and return to Step 4. Do not create any stories until the revised plan is approved.

## Step 6: Report

After all stories are created, output:

```
## Stories created for <EPIC_CODE>

- <STORY_CODE>: <title> (<points> pts, <priority>)
- <STORY_CODE>: <title> (<points> pts, <priority>)
  ...

Total: N stories · X points
Run `/pm-work-on <FIRST_STORY_CODE>` to begin implementation.
```

## Rules

- **Plan-only until approved.** No `pm story add`, no file writes, no edits of any kind before the user types `yes`.
- Complete the entire research phase (Step 2) before drafting the plan — do not propose stories based on the epic description alone.
- Do not propose stories that duplicate work in sibling epics or already-existing stories in this epic.
- Acceptance criteria must be specific and verifiable — not implementation steps, not vague goals.
- Story points must be exactly one of: 1, 2, 3, 5, 8. If scope is unclear, size up.
- If the epic already has all the stories it needs, say so and do not propose duplicates.
- If the epic code does not exist, tell the user and stop.
- **NEVER use `find`, `grep`, `ls`, or direct filesystem commands** to discover or read epic/story data. Always use `pm status`, `pm epic list`, or `pm story list` CLI commands.
