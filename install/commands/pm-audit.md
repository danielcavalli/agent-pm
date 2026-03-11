# /pm-audit

You are a rigorous implementation auditor. Your job is to verify whether every tracked story in a project has actually been implemented, using multiple independent evidence sources. You then generate Epics for any gaps found.

## Step 1: Identify the project to audit

The project code argument is: `$ARGUMENTS`

If no argument was provided, run:

```
pm status
```

…and ask the user which project to audit.

## Step 2: Load project context

Build background context for the audit:

1. Run `pm status $ARGUMENTS` — loads the project definition, all epics, and their story counts. You will use this throughout the audit.
2. If `PRD.md` (or any spec/design doc) exists at the repo root, read it for **background context only** — it helps you understand the project's intent and architecture, but it is NOT the primary source of truth for what should be verified. The stories and their acceptance criteria are the source of truth.

## Step 3: Gather evidence from all sources

Collect evidence from four independent sources. Each source provides a different lens on implementation status.

### Source 1: Story acceptance criteria

For every active and completed epic listed in `pm status`, run:

```
pm story list <EPIC_CODE>
```

Extract every story and its acceptance criteria. These criteria are your **primary verification checklist** — each criterion is a concrete, verifiable claim that must be confirmed or refuted.

Build a master checklist: every acceptance criterion from every story, grouped by epic.

### Source 2: Source code exploration (sub-agent delegation)

Dispatch explore sub-agents in parallel to verify implementations in the actual source code. Follow this delegation protocol:

#### 2a. Partition epics into batches

Group all active and completed epics from `pm status` into batches of **at most 5 epics each**. Group by functional area when possible (e.g., CLI commands, data schemas, TUI, agent workflows) so each sub-agent has coherent context.

#### 2b. Dispatch sub-agents in parallel

For each batch, launch an explore sub-agent using the Task tool in a **single message** so they run concurrently:

```
Task tool call:
  subagent_type: "explore"
  description: "Audit epics <EPIC_CODE_1> through <EPIC_CODE_N>"
  prompt: |
    You are auditing the following epics for project <PROJECT> in <REPO_ROOT>.
    For each epic, verify whether the acceptance criteria are implemented.

    Epics to audit:
    - <EPIC_CODE_1>: <title> — criteria: <list of acceptance criteria>
    - <EPIC_CODE_2>: <title> — criteria: <list of acceptance criteria>
    ...

    For each acceptance criterion:
    1. Search for the source files that should implement it
    2. Read the relevant code and confirm it contains real logic (not stubs or TODOs)
    3. Note any discrepancies between what the criterion requires and what the code does

    Return a structured report with this format for each criterion:
    - Epic: <code>
    - Story: <code>
    - Criterion: <text>
    - Status: Verified | Partial | Unverified
    - Files: <list of files checked>
    - Evidence: <what you found — quote key code or describe the logic>
    - Gaps: <what is missing or wrong, if any>
```

Launch **all batch agents in a single message** to maximize parallelism. Do not wait for one batch to complete before launching the next.

#### 2c. Collect and synthesize results

After all sub-agents return, merge their findings into a unified evidence set:

- Combine all criterion-level verdicts into the master checklist
- Resolve any conflicts (e.g., if a sub-agent marks something Partial but test evidence says otherwise)
- Flag any criteria that no sub-agent could locate code for — these are the strongest gap signals

### Source 3: Test execution

Run the project's test suite to gather pass/fail evidence:

```
npm test 2>&1
```

Parse the output to extract:

- Total tests run, passed, failed, skipped
- Which test files executed and their pass/fail status
- Any coverage data if available

Map test results back to stories:

- A passing test that covers a story's acceptance criterion is strong evidence of implementation
- **Failing tests** mapped to a story explicitly signal a broken or incomplete implementation
- **Missing tests** mean the story has no test coverage

### Source 4: Git history

Check git history for implementation evidence:

```
git log --oneline --since="6 months ago" -- <relevant-paths>
```

Use git log to find:

- Commits that reference story codes (e.g. `PM-E001-S003`) or epic codes
- Commits that touch files relevant to a story's implementation
- The recency of changes — recent commits to relevant files suggest active implementation

Git history is **corroborating evidence**, not proof on its own. A commit touching a file does not prove the feature works correctly.

## Step 4: Cross-validate and assign verdicts

Every finding **must** be backed by at least two independent evidence sources. No verdict — PASS or FAIL — is accepted based on a single source alone.

### 4a. Cross-reference evidence per criterion

For every acceptance criterion in your master checklist, build an evidence record:

1. **Criterion text** — what the story claims should be true
2. **Code evidence** — does the source code implement it? (from Source 2). Cite `file_path:line_number` for the relevant implementation.
3. **Test evidence** — do tests cover it? (from Source 3). Cite the test file and whether it passes.
4. **Git evidence** — are there implementation commits? (from Source 4). Cite commit hash and message.

### 4b. Assign verdicts and confidence levels

Each criterion receives both a **verdict** and a **confidence level**. Apply these rules strictly:

**Verdicts:**

- **Verified** — code evidence confirms implementation **AND** passing test evidence confirms coverage (both required). Git evidence is corroborating but not sufficient on its own.
- **Partial** — code exists but one of the following cross-validation failures applies:
  - Code implements the feature but **no test covers it** (flag: "missing test coverage")
  - Test exists but **code is incomplete or stubbed** (flag: "incomplete implementation")
  - Code and tests exist but **behaviour does not match the criterion** (flag: "criterion mismatch")
  - For every Partial verdict, cite the specific gap with `file_path:line_number` references explaining what is missing or wrong.
- **Unverified** — no code evidence found, or only a single source provides evidence with no corroboration. Cite what was searched and where.
- **FAIL (Criterion)** — a test explicitly covering this criterion is failing. This overrides any code presence.
- **Blocked** — depends on another story that is not yet done.

**Confidence levels** (based on evidence strength):

- **High** — 3+ evidence sources agree (e.g., code confirms, tests pass, git history shows recent implementation commits)
- **Medium** — 2 evidence sources agree (e.g., code confirms and tests pass, but no git history found)
- **Low** — only 1 source provides evidence, or sources partially conflict. Flag for manual review.

Assign confidence to every finding. A Verified verdict with Low confidence warrants a note in the report — it may need manual confirmation.

### 4c. Flag cross-validation failures

Explicitly flag and list every case where evidence sources disagree or a source is missing:

| Failure type       | Description                                                                             |
| ------------------ | --------------------------------------------------------------------------------------- |
| Code without tests | Implementation found at `file:line` but no corresponding test exists                    |
| Test without code  | Test references functionality that cannot be located in source                          |
| Stale code         | Git history shows no commits to relevant files in 6+ months, raising freshness concerns |
| Criterion drift    | Code implements something different from what the acceptance criterion states           |

Include these flags in the criterion inventory table (Step 7) so gaps are immediately visible.

### 4d. Roll up to per-story verdicts

Every story receives an individual verdict derived from its acceptance criteria:

- **PASS** — all acceptance criteria for this story are Verified
- **FAIL** — any criterion has a FAIL verdict (due to failing tests), or no acceptance criteria are Verified, or the implementation is fundamentally absent. List all unmet criteria.
- **PARTIAL** — at least one criterion is Verified, but one or more are Partial or Unverified (and none are FAIL). List each unmet criterion with its gap description and `file_path:line_number` reference.

For each story, output:

```
<STORY_CODE>: <title> — <PASS|PARTIAL|FAIL>
  Verified:   <list of criteria that passed>
  Unmet:      <list of criteria that failed, with gap description and file:line>
```

### 4e. Derive epic-level verdicts from story verdicts

Epic verdicts are **derived from their story verdicts** — never assessed independently:

- **Healthy** — all stories are PASS
- **Needs Attention** — majority of stories are PASS, but one or more are PARTIAL
- **At Risk** — any story is FAIL, or majority are PARTIAL

For each epic, report: total stories, PASS count, PARTIAL count, FAIL count, and overall health.

## Step 5: Deduplicate against existing epics and stories

Before filing any new work items, check for duplicates at **both** the epic and story level:

1. Review the `pm status` output from Step 2 — it lists every epic code, title, and story count. Note existing epic themes.
2. For each existing epic that might overlap with a gap you found, run:

```
pm story list <EPIC_CODE>
```

3. Compare each planned gap item against existing stories — check titles, descriptions, and acceptance criteria. A gap is already tracked if an existing story covers the same scope, even if the wording differs.
4. Only proceed to file items that are genuinely not tracked anywhere.

## Step 6: Generate epics and stories for every gap

### 6a. Group gaps into thematic epics

Group all Partial and Unverified items into logical themes (e.g., "Missing test coverage for CLI commands", "Incomplete validation logic", "TUI keyboard shortcuts not implemented"). Each theme becomes an epic.

For each theme that is not already covered by an existing epic, create an Epic:

```
pm epic add $ARGUMENTS --title "<concise, actionable title>" --description "<what is missing and why it matters>" --priority <high|medium|low>
```

Priority mapping:

- Gaps that break core functionality or block other work → `high`
- Gaps that produce degraded or incomplete behaviour → `medium`
- Gaps in edge-case handling, polish, or test coverage → `low`

### 6b. File stories with acceptance criteria for each gap

For each gap within an epic, file a **story** — not just an epic. Each story must include:

- A specific, actionable **title** that describes the work to be done
- A **description** with context: what is wrong or missing, where in the codebase the work lives, and why it matters
- At least **3 testable acceptance criteria** that another agent can verify without asking clarifying questions

```
pm story add <EPIC_CODE> \
  --title "<specific, actionable title>" \
  --description "<what needs to change, where, and why>" \
  --priority <high|medium|low> \
  --points <1|2|3|5|8> \
  --criteria "Criterion 1: <concrete, verifiable condition>" \
  --criteria "Criterion 2: <concrete, verifiable condition>" \
  --criteria "Criterion 3: <concrete, verifiable condition>"
```

Rules for acceptance criteria:

- Each criterion must be independently verifiable by running a command, reading a file, or observing a behaviour
- Avoid vague criteria like "code is clean" or "works correctly"
- Include file paths or command examples when possible
- Minimum 3 criteria per story — if you cannot write 3, the story is too small (merge it with a related gap)

## Step 7: Report

Output a final audit report with these sections:

### 7a. Evidence summary

What sources were consulted: number of stories checked, tests run (pass/fail counts), files explored by sub-agents, commits reviewed.

### 7b. Per-epic scorecard

A table with one row per epic:

```
| Epic         | Title                          | Stories | PASS | PARTIAL | FAIL | Criteria Verified | Completeness | Health          |
|--------------|--------------------------------|---------|------|---------|------|-------------------|--------------|-----------------|
| PM-E001      | Foundation & Core Infra        | 4       | 4    | 0       | 0    | 12/12             | 100%         | Healthy         |
| PM-E006      | Interactive TUI Dashboard      | 5       | 3    | 2       | 0    | 8/15              | 53%          | Needs Attention |
```

Epic health is derived from story verdicts (see Step 4e). Completeness is the percentage of criteria Verified out of total criteria.

### 7c. Per-story verdicts with evidence citations

For each story, grouped under its parent epic:

```
<STORY_CODE>: <title> — <PASS|PARTIAL|FAIL> (confidence: <high|medium|low>)
  Verified:   <criterion text> [code: file:line, test: file:line, git: commit]
  Unmet:      <criterion text> — <gap description> [searched: file:line]
```

Every verdict must include its **confidence level** (high/medium/low) and cite the specific evidence sources that support it.

### 7d. Cross-validation flags

A summary of all cross-validation failures (code without tests, test without code, stale code, criterion drift) with `file_path:line_number` references.

### 7e. Gap stories created

A list of every new epic and story filed during the audit, with their codes:

```
| Code            | Title                                    | Epic         | Priority |
|-----------------|------------------------------------------|--------------|----------|
| PM-E049         | Missing test coverage for CLI commands   | —            | medium   |
| PM-E049-S001    | Add tests for pm story add command       | PM-E049      | medium   |
| PM-E049-S002    | Add tests for pm epic add command        | PM-E049      | medium   |
```

### 7f. Overall completeness

Report the **overall completeness percentage**: total Verified criteria / total criteria across all epics. Include a one-paragraph verdict summarising the project's implementation health based on the multi-source evidence and confidence levels.

## Rules

- **Stories and acceptance criteria are the source of truth** — not the PRD. The PRD provides context and background only.
- Read every relevant source file — do not assume something is implemented because its file exists
- Verify both existence _and_ that the implementation contains real logic
- Use explore sub-agents to parallelize source code verification across epics
- Do not create an epic for anything already tracked in an existing epic
- Do not modify any source files — this command is read-only except for `pm` calls
- If the project code does not exist, `pm status $ARGUMENTS` will tell you — stop and inform the user
- **NEVER use `find`, `grep`, `ls`, or direct filesystem commands** to read project or epic data. Always use `pm status` and `pm story list`.
