# How to Use pm

This guide walks through common workflows -- from setting up your first project to running multi-agent orchestration.

## Table of Contents

- [Setup](#setup)
- [Creating a Project](#creating-a-project)
- [Working with Epics and Stories](#working-with-epics-and-stories)
- [Having an Agent Execute Work](#having-an-agent-execute-work)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [Using the TUI Dashboard](#using-the-tui-dashboard)
- [Autonomous Filing](#autonomous-filing)
- [Cross-Task Communication](#cross-task-communication)
- [Architecture Decision Records](#architecture-decision-records)
- [Consolidation and Garbage Collection](#consolidation-and-garbage-collection)
- [Document Review](#document-review)
- [Iterative Planning](#iterative-planning)

---

## Setup

After [installation](../README.md#install), verify everything is working:

```bash
pm --version          # Should print the installed version
```

In Claude Code or OpenCode, verify MCP tools are available by asking your agent:

> "What pm tools do you have access to?"

It should list tools like `pm_status`, `pm_epic_add`, `pm_story_add`, etc.

---

## Creating a Project

### Via CLI

```bash
cd /path/to/your/repo
pm init --name "My Web App" --code WEBAPP --description "A full-stack web application"
```

This creates `.pm/` at the repo root with `project.yaml`, `index.yaml`, and an empty `epics/` directory. Commit `.pm/` to git.

### Via Slash Command

In Claude Code or OpenCode:

```
/pm-create-project
```

The agent walks you through collecting project details, runs `pm init`, and optionally proposes initial epics based on your description.

### Enabling Agent Rules

Agent rules are opt-in per repository. They teach agents when and how to file discovered work:

```bash
pm rules init         # Adds PM filing rules to ./AGENTS.md
```

This is what enables the "autonomous filing" behavior -- without it, agents in this repo won't proactively create stories.

To remove: `pm rules remove`.

---

## Working with Epics and Stories

### Adding Epics

```bash
pm epic add --title "User Authentication" \
  --description "Implement user auth with JWT tokens and OAuth providers" \
  --priority high
```

Or via slash command:

```
/pm-add-epic WEBAPP
```

The agent guides you through title, description, priority, and optionally proposes a story breakdown.

### Adding Stories

```bash
pm story add E001 --title "JWT middleware" --points 3 --priority high \
  --criteria "JWT tokens validated on every request" \
  --criteria "Expired tokens return 401" \
  --criteria "Invalid tokens return 403 with error message"
```

Key fields:

- **Points** (1, 2, 3, 5, 8) -- Fibonacci complexity estimate. 1 = trivial config change, 3 = typical feature, 8 = complex subsystem work.
- **Criteria** -- Concrete, verifiable conditions. Each should be checkable by running a command or observing a behavior.
- **Dependencies** -- Declare with `--depends-on E001-S002` if this story depends on another being complete first.

### Refining Epics

When you have an epic but haven't broken it into stories yet:

```
/pm-refine-epic E001
```

The agent researches the codebase, proposes a story breakdown with estimates and criteria, and waits for your approval before creating anything.

### Viewing Status

```bash
pm status              # Full project overview
pm epic list           # All epics with progress
pm story list E001     # All stories in an epic
pm story list E001 --deps   # Include dependency info
```

Or via slash command for a richer, narrative status with recommendations:

```
/pm-status
```

### Re-Prioritizing

```
/pm-prioritize WEBAPP
```

Tell the agent your prioritization strategy (e.g., "focus on security stories first, then performance") and it reorders the backlog accordingly.

---

## Having an Agent Execute Work

### Single Story

```
/pm-work-on E001-S001
```

The agent:

1. Loads the story context (title, description, criteria, dependencies)
2. Retrieves any cross-task comments left by prior agents
3. Implements the work
4. Verifies each acceptance criterion
5. Marks the story as done
6. Files an execution report (decisions made, assumptions, tradeoffs, out-of-scope observations)

### From the TUI

Select a story in the TUI and press `x`. This dispatches a new Claude Code agent to execute `/pm-work-on` for that story. If you're in tmux, it opens in a split pane; otherwise it runs as a background process.

---

## Multi-Agent Orchestration

### Orchestrating a Full Project

```
/pm-work-on-project WEBAPP
```

The orchestrator:

1. Reads all epics and stories
2. Builds dependency-aware dispatch tiers -- stories with no unmet dependencies go in tier 1, etc.
3. Executes stories tier by tier, running independent stories in parallel
4. Passes failure reflections forward so subsequent stories can adapt
5. Continues until all stories are complete or blocked

### Story Dependencies

Stories can declare dependencies on other stories:

```bash
pm story add E001 --title "OAuth integration" --depends-on E001-S001 \
  --criteria "Google OAuth login works" \
  --criteria "GitHub OAuth login works"
```

The orchestrator respects these: `E001-S002` won't start until `E001-S001` is done.

Minimize dependencies where possible -- independent stories run in parallel.

### Agent Heartbeats

While working, agents send periodic heartbeats:

```
pm_agent_heartbeat agent_id="agent-abc" status="active" current_task="E001-S002"
```

These create state files in `.pm/agents/` that the TUI reads for the agent sidebar.

### Escalation

When an agent hits a blocker requiring human judgment:

```
pm_agent_escalate agent_id="agent-abc" type="decision" \
  message="JWT token expiry: 15 minutes or 1 hour?" \
  options=["15 minutes (more secure)", "1 hour (better UX)"]
```

The agent's status changes to `needs_attention`. In the TUI, focus the agent sidebar, select the escalated agent, and press `e` to respond. The agent picks up the response on its next `pm_agent_check_response` call.

---

## Using the TUI Dashboard

```bash
pm tui
```

Run this in a terminal -- ideally a tmux split alongside your AI coding tool.

### Layout

- **Agent Sidebar** (left) -- Live agent states. Appears automatically when agents exist.
- **Tree Panel** (center) -- Navigable epic/story tree.
- **Detail Panel** (right) -- Full details for the selected item.
- **Status Bar** (bottom) -- Selected code, active filter, agent count.

### Key Shortcuts

| Key | Action |
|-----|--------|
| `j`/`k` or arrows | Navigate up/down |
| `g` / `G` | Jump to top / bottom |
| `Ctrl+u` / `Ctrl+d` | Half-page up / Half-page down |
| Mouse wheel | Scroll focused panel |
| `Tab` | Cycle focus between panels |
| `Enter` | Expand/collapse epic |
| `/` | Search |
| `f` | Filter by status (all, backlog, in_progress, done) |
| `a` | Toggle agent sidebar |
| `x` | Dispatch agent for selected story/epic |
| `e` | Respond to agent escalation |
| `c` / `y` | Copy selected code to clipboard |
| `Esc` | Cancel search / reset filters |
| `?` | Help overlay |
| `q` | Quit |

### Agent Sidebar Status Icons

| Icon | Meaning |
|------|---------|
| Filled circle (green) | Active -- agent is working |
| Hollow circle (gray) | Idle |
| Triangle (red) | Needs attention -- escalation waiting |
| X (red) | Blocked |
| Checkmark (gray) | Completed |

---

## Autonomous Filing

When `pm rules init` has been run in a repo, agents proactively file work they discover during unrelated tasks.

**What gets filed:**
- Bugs or regressions unrelated to the current task
- Tech debt (duplicated code, missing error handling, outdated patterns)
- Missing features or improvement opportunities that are out of scope
- Missing test coverage
- Performance concerns

**What does NOT get filed:**
- Issues directly related to the current task (just fix it)
- Trivial fixes (under 2 minutes -- just fix it)
- Uncertain observations (mention to the user instead)
- Sub-steps within a story (use internal task tracking)

Agents use MCP tools (`pm_epic_add`, `pm_story_add`) to file work, then continue their current task without context-switching.

---

## Cross-Task Communication

Agents can leave notes for each other via cross-task comments:

```
pm_comment_add target="E001-S003" type="agent" \
  content="Started implementation but hit a schema conflict. The comment schema needs a references field."
  tags=["schema", "blocking"]
```

When another agent starts working on E001-S003, it retrieves these comments first (this is a mandatory step in `/pm-work-on`), gaining context from prior work.

List comments:

```
pm_comment_list project="WEBAPP" task="E001-S003" type="agent"
```

---

## Architecture Decision Records

Record significant technical decisions as ADRs:

```bash
pm adr create --project WEBAPP --title "Use PostgreSQL over MySQL" \
  --status accepted \
  --context "Need JSONB support for flexible metadata storage" \
  --decision "Use PostgreSQL 16 with JSONB columns for metadata" \
  --positive "Native JSONB indexing" \
  --positive "Better concurrent write performance" \
  --negative "Team has more MySQL experience" \
  --tags database,storage
```

Query with relevance ranking:

```bash
pm adr query --tags database --search "storage" --format full
pm adr query --status accepted --limit 10
```

ADRs can be created by both humans and agents. The consolidation pipeline also creates ADRs automatically when it identifies confirmed decisions across multiple execution reports.

---

## Consolidation and Garbage Collection

### Consolidation

As agents complete stories, execution reports and comments accumulate. The consolidation pipeline processes them into actionable knowledge:

```bash
pm consolidate run             # Run the full pipeline
pm consolidate run --dry-run   # Preview without writing
pm consolidate config          # Show current configuration
```

The pipeline:
1. Deduplicates findings (structural matching first, then LLM-powered semantic clustering)
2. Creates ADRs for confirmed decisions that appear across multiple reports
3. Creates resolution tasks for identified gaps or conflicts
4. Marks processed items so they're eligible for garbage collection

Configure in `project.yaml`:

```yaml
consolidation:
  max_reports_per_run: 20
  trigger_mode: manual      # manual | event_based | time_based
```

### Garbage Collection

Clean up old consolidated artifacts:

```bash
pm gc run                  # Run GC
pm gc run --dry-run        # Preview
pm gc run --verbose        # Show TTL evaluation per item
```

Configure TTLs in `project.yaml`:

```yaml
gc_config:
  ttl_comments_days: 30
  ttl_reports_days: 7
  ttl_adrs_days: 90
```

---

## Document Review

### Reviewing a Plan or Document

```
/pm-review-plan docs/design/my-plan.md "Focus on feasibility -- we have 3 engineers and 6 weeks"
```

This runs a 5-agent review pipeline:
- **Research Reviewer** -- Searches for evidence to support or contradict claims
- **Researcher Validator** -- Validates research quality and sources
- **Evaluator** -- Scores the document across 8 dimensions (claim support, logical coherence, completeness, feasibility, etc.)
- **Integrity Checker** -- Audits the Evaluator's scores for blind spots
- **Drafter** -- Applies feedback and produces a revised version
- **Creative Agent** -- Spawned on demand for lateral suggestions

The loop runs until the target score is reached or convergence is detected (minimum 3 loops).

### Reviewing Any Document Type

```
/pm-review-generic api-spec.yaml "Check backward compatibility and that the migration path is realistic"
```

Same architecture as `/pm-review-plan`, but the grounding prompt defines all evaluation criteria. Works on ADRs, RFCs, post-mortems, API specs, runbooks, or any document.

Options:
- `--max-loop N` -- Maximum review iterations (default: 5)
- `--target N` -- Target composite score out of 5.0 (default: 4.0)
- `--verbose` / `--summary` -- Control output detail level

---

## Iterative Planning

```
/pm-iterate-plan WEBAPP --guidance docs/requirements.md --max-rounds 5
```

A 4-agent planning loop:

1. **Drafter** -- Generates or refines the implementation plan
2. **Reviewer** -- Evaluates across 5 dimensions (architecture, research grounding, story quality, completeness, feasibility)
3. **Researcher** -- Performs web search and codebase exploration to ground the plan
4. **Reporter** -- Synthesizes all findings into a status report

The loop runs until all agents vote APPROVE (unanimous consensus). The final approved plan bulk-creates epics and stories in your project.

The `--guidance` flag points to a requirements document, PRD, or brief that provides context for what the plan should cover.
