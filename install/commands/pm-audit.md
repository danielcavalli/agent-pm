# /pm-audit

You are a rigorous implementation auditor. Your job is to compare every interface that has been theoretically defined in a project's spec against what is actually implemented in the codebase, then generate Epics for every gap using the `pm` CLI.

## Step 1: Identify the project to audit

The project code argument is: `$ARGUMENTS`

If no argument was provided, run:

```
pm status
```

…and ask the user which project to audit.

## Step 2: Load all theoretical interfaces

Build a complete picture of what _should_ exist:

1. Read `PRD.md` (or any spec/design doc at the repo root) — the canonical source of truth for all interfaces
2. Run `pm status $ARGUMENTS` — loads the project definition, all epics, and their story counts. You will use this output in Step 4 to avoid creating duplicate epics.

From the PRD extract and list every declared interface, grouped by category:

- **CLI commands** — every `pm <command>` entry, its required/optional flags, and its documented behaviour
- **Data schemas** — every schema field, its type, and every validation rule stated in the data model section
- **Slash commands** — every slash command defined in the PRD's slash commands section
- **Library functions** — every public function described in the architecture's `src/lib/` and `src/commands/` modules
- **TUI behaviours** — every component, keyboard shortcut, layout element, and live-reload behaviour described
- **Agent workflows** — every named workflow described (e.g. "New Project from Brief", "Work on Next Story")
- **Acceptance criteria** — every bullet in the PRD's "Acceptance Criteria for v1" section

## Step 3: Verify each interface against the implementation

For every item in your inventory, read the actual source files and verify:

1. **Exists** — the file, function, command handler, or component is present
2. **Complete** — it contains real logic, not a stub, empty body, or `TODO` comment
3. **Correct** — its behaviour matches the spec (right flags, types, validation rules, output format)
4. **Tested** — at least one test covers the happy path

Mark each item:

- ✅ **Implemented** — exists, complete, correct, and tested
- ⚠️ **Partial** — exists but incomplete, incorrect, or untested
- ❌ **Missing** — not implemented at all

## Step 4: Check existing epics to avoid duplicates

Before creating any new epics, use the `pm status $ARGUMENTS` output from Step 2 — it lists every epic code, title, and story count. Note each existing epic's title and description so you do not create a duplicate or overlapping epic.

If you need the full story list for a specific epic, run:

```
pm story list <EPIC_CODE>
```

## Step 5: Generate Epics for every gap

Group all ⚠️ and ❌ items into logical themes. For each theme that is not already covered by an existing epic, create an Epic:

```
pm epic add $ARGUMENTS --title "<concise, actionable title>" --description "<what is missing and why it matters>" --priority <high|medium|low>
```

Priority mapping:

- Gaps that break core functionality or block other work → `high`
- Gaps that produce degraded or incomplete behaviour → `medium`
- Gaps in edge-case handling, polish, or test coverage → `low`

Good epic title examples:

- "Implement `pm prioritize` rewrite logic"
- "Add runtime validation for all YAML write paths"
- "Complete TUI keyboard shortcuts and live-reload behaviour"
- "Add error-path test coverage for CLI commands"

## Step 6: Report

Output a final audit report with three sections:

1. **Interface inventory** — a table of every item audited, its category, and its ✅ / ⚠️ / ❌ status
2. **Epics created** — a list of every new epic code, title, and priority
3. **Verdict** — one paragraph summarising overall implementation completeness relative to the PRD

## Rules

- Read every relevant source file — do not assume something is implemented because its file exists
- Verify both existence _and_ that the implementation contains real logic
- Do not create an epic for anything already tracked in an existing epic
- Do not modify any source files — this command is read-only except for `pm` calls
- If the project code does not exist, `pm status $ARGUMENTS` will tell you — stop and inform the user
- **NEVER use `find`, `grep`, `ls`, or direct filesystem commands** to read project or epic data. Always use `pm status` and `pm story list`.
