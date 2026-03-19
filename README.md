# pm -- Project Management and Orchestration for AI Agents

**pm** is a file-based project management and orchestration layer for AI coding agents. It gives agents a shared memory of what needs to be done, what's in progress, and what's been decided -- stored as plain YAML files in your repository, versioned alongside your code.

Agents working in [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [OpenCode](https://opencode.ai) get access to PM through three channels: a global CLI (`pm`), MCP tools available in every session, and slash commands that guide agents through structured workflows. A live terminal dashboard (`pm tui`) gives you real-time visibility into project state and agent activity.

## Why

AI coding agents are stateless. Each session starts from scratch with no memory of prior work, no awareness of what other agents are doing, and no structured way to capture discovered issues for later. Work falls through the cracks, agents duplicate effort, and you lose context between sessions.

**pm** solves this by providing:

- **Persistent project state** -- Epics, stories, and acceptance criteria survive across sessions. An agent can pick up exactly where another left off.
- **Autonomous work capture** -- An agent fixing a bug can notice tech debt and file it as a story without leaving its current task. The work item persists for any future agent (or human) to pick up.
- **Multi-agent coordination** -- Dependency-aware orchestration dispatches stories across parallel agents. Agents send heartbeats, escalate blockers to humans, and leave notes for each other through cross-task comments.
- **Knowledge consolidation** -- Execution reports, architecture decisions, and cross-task commentary are automatically deduplicated and consolidated into a shared knowledge base.
- **Human oversight** -- A live TUI dashboard shows what every agent is doing, surfaces escalations requiring human input, and lets you dispatch new work with a keypress.

## Quick Start

### Prerequisites

- **Node.js** >= 18 and **npm**
- **Claude Code** and/or **OpenCode** installed

### Install

```bash
git clone https://github.com/danielcavalli/agent-pm.git
cd agent-pm
npm install && npm run build
bash install/install.sh
```

The installer registers the `pm` CLI globally, configures the MCP server for your AI clients, and copies slash commands into place.

### Initialize a Project

```bash
cd /path/to/your/repo
pm init --name "My App" --code MYAPP --description "A web application"
pm rules init   # Write agent filing rules into AGENTS.md (opt-in per repo)
```

This creates a `.pm/` directory at your repo root. Commit it to git -- project data is versioned alongside your code.

### Verify

```bash
pm status             # Project overview
pm tui                # Live dashboard
```

In Claude Code or OpenCode, MCP tools (`pm_status`, `pm_epic_add`, `pm_story_add`, etc.) are available immediately in every session.

## Features

### Project Management

The core data model is **Project > Epic > Story**. Projects live in `.pm/` at the repo root. Epics are individual YAML files with stories embedded inside them.

```bash
pm epic add --title "Authentication" --description "User auth system" --priority high
pm story add E001 --title "JWT middleware" --points 3 --priority high \
  --criteria "JWT tokens validated on every request" \
  --criteria "Expired tokens return 401"
pm work E001-S001              # Load context, mark in_progress
pm story update E001-S001 --status done
```

Stories support dependency declarations (`--depends-on E002-S001`) that the orchestrator uses to build dispatch tiers -- independent stories run in parallel, dependent stories wait.

### MCP Tools

The MCP server exposes PM operations as tools available in every AI agent session, regardless of working directory. This is what enables autonomous filing -- an agent in any repo can query project state and create work items.

| Tool | Purpose |
|------|---------|
| `pm_status` | Query project state |
| `pm_epic_add` | Create an epic |
| `pm_story_add` | Create a story with criteria and dependencies |
| `pm_project_remove` | Delete a project |
| `pm_comment_add` | Leave a cross-task comment for other agents |
| `pm_comment_list` | Read comments (filtered by task, type, author) |
| `pm_report_create` | File an execution report after completing a story |
| `pm_report_view` | View an execution report |
| `pm_adr_create` | Record an architecture decision |
| `pm_adr_query` | Query ADRs with relevance ranking and full-text search |
| `pm_agent_heartbeat` | Send agent heartbeat (status, current task, progress) |
| `pm_agent_escalate` | Escalate a blocker to a human |
| `pm_agent_check_response` | Check for human response to an escalation (read-once) |
| `pm_gc_run` | Run garbage collection |

All tools accept a `workdir` parameter to target a specific repo's `.pm/` directory.

### Slash Commands

Slash commands are available in both Claude Code and OpenCode. They guide agents through multi-step PM workflows.

| Command | Purpose |
|---------|---------|
| `/pm-create-project` | Guided project creation wizard |
| `/pm-add-epic` | Add an epic with optional story decomposition |
| `/pm-add-story` | Add a story with guided estimation and criteria |
| `/pm-refine-epic` | Research an epic, propose story breakdown (plan-only until approved) |
| `/pm-work-on [code]` | Execute a story end-to-end: load context, implement, verify criteria, file report |
| `/pm-work-on-project [code]` | Orchestrate all stories -- builds dependency-aware dispatch tiers, runs in parallel |
| `/pm-prioritize [code]` | Re-prioritize backlog with a strategy |
| `/pm-status` | Status report with blocker highlights and next-story recommendations |
| `/pm-audit [code]` | Audit implementation against acceptance criteria, file gaps as stories |
| `/pm-iterate-plan` | 4-agent iterative planning loop (Drafter, Reviewer, Researcher, Reporter) |
| `/pm-review-plan` | 5-agent document review pipeline with research-grounded scoring |
| `/pm-review-generic` | Subject-adaptive document review (works on any doc type: ADR, RFC, runbook, etc.) |
| `/pm-help` | List all commands |

### Interactive TUI

Run `pm tui` for a live dashboard with three panels:

```
+--------------------+---------------------------+-----------------------------+
| Agent Sidebar      | Tree Panel                | Detail Panel                |
|                    |                           |                             |
| agent-abc (active) | v E001 Authentication     | JWT Middleware               |
|   E001-S002        |     S001 JWT middleware    | Status: in_progress         |
| agent-def (idle)   |   > S002 OAuth provider   | Priority: high              |
|                    | > E002 Data pipeline      | Points: 3                   |
|                    |                           | Criteria:                   |
|                    |                           |  - JWT tokens validated ... |
|                    |                           |  - Expired tokens return 401|
+--------------------+---------------------------+-----------------------------+
| MYAPP-E001-S001 | filter: all | agents: 2                    | ? help      |
+--------------------+---------------------------+-----------------------------+
```

**Navigation:** `j`/`k` or arrows to move, `g`/`G` for top/bottom, `Ctrl+u`/`Ctrl+d` for half-page scroll, mouse wheel to scroll focused panel, `Tab` to cycle panels, `Enter` to expand/collapse, `/` to search (`Esc` to cancel), `f` to filter by status.

**Agent interaction:** The sidebar shows live agent state (heartbeats, current task, escalations). Press `e` on an escalated agent to respond. Press `x` on a story to dispatch a new agent to work on it (uses `claude` CLI, prefers tmux split-pane).

**Live reload:** The TUI watches `.pm/` for changes and auto-refreshes (300ms debounce, preserves cursor position).

Press `?` for the full keyboard shortcut overlay.

### Agent State and Escalation

Agents register their presence via heartbeats and can escalate blockers to humans:

```
Agent heartbeat -> .pm/agents/{agent_id}.yaml
  status: active | idle | needs_attention | blocked | completed
  current_task: E001-S002
  escalation:
    type: decision | clarification | approval | error
    message: "Schema conflict -- should comments support nested replies?"
    options: ["Flat comments only", "Single-level nesting", "Full threading"]
```

Humans respond via the TUI (press `e`) or by writing a response file. The agent picks it up with `pm_agent_check_response` (read-once semantics -- the response file is deleted after reading).

### Architecture Decision Records (ADRs)

Agents (and humans) can record architecture decisions as structured YAML:

```bash
pm adr create --project MYAPP --title "Use JWT for auth" \
  --status accepted --context "Need stateless auth for microservices" \
  --decision "Use RS256 JWT with 15-minute expiry" \
  --positive "Stateless, no session store needed" \
  --negative "Token revocation requires allowlist" \
  --tags auth,security
```

Query ADRs with relevance-ranked search:

```bash
pm adr query --tags auth,security --search "token"
pm adr query --status accepted --format full --limit 10
```

Relevance scoring combines tag match count with recency. Full-text search spans title, context, and decision fields.

### Knowledge Consolidation

After agents complete stories, their execution reports and cross-task comments accumulate. The consolidation pipeline (`pm consolidate run`) processes them:

1. **Ingest** -- Load unconsolidated reports and comments
2. **Structural dedup** -- Exact and fuzzy matching to eliminate duplicates
3. **Semantic clustering** -- LLM-powered grouping of related findings
4. **Merge** -- Combine structural and semantic results
5. **Route** -- Create ADRs for confirmed decisions, resolution tasks for identified gaps
6. **Mark** -- Flag processed items as consolidated for GC eligibility

### Garbage Collection

```bash
pm gc run              # Clean up consolidated artifacts
pm gc run --dry-run    # Preview what would be removed
```

Three collectors with configurable TTLs (set in `project.yaml`):
- **Comments** -- Deletes consolidated comments that have been consumed by their target agent
- **Reports** -- Archives consolidated reports past TTL
- **ADRs** -- Marks superseded ADRs past TTL

### Document Review Pipelines

Two slash commands provide multi-agent document review:

**`/pm-review-plan`** -- Research-grounded review with fixed academic rigor standards. 6 agents (Research Reviewer, Researcher Validator, Evaluator, Integrity Checker, Drafter -- five fixed in the cycle, plus a Creative Agent spawned on demand) score documents across 8 dimensions with convergence detection.

**`/pm-review-generic`** -- Same architecture, but the grounding prompt drives all evaluation criteria. Works on any document type: ADRs, PRDs, RFCs, post-mortems, API specs, runbooks.

Both enforce a minimum of 3 review loops, track the best version across iterations, and detect convergence patterns (plateau, oscillation, near-threshold, regression).

### Multi-Agent Planning

**`/pm-iterate-plan`** -- A 4-agent iterative planning loop:
- **Drafter** generates or refines the plan
- **Reviewer** evaluates across 5 dimensions (architecture, research grounding, story quality, completeness, feasibility)
- **Researcher** performs web search and codebase exploration to ground the plan in reality
- **Reporter** synthesizes findings

The loop runs until all agents vote APPROVE. The final plan bulk-creates epics and stories.

## Architecture

```
your-repo/
  .pm/                          # Project data (git-tracked)
    project.yaml                # Project definition + consolidation/GC config
    index.yaml                  # Auto-maintained summary
    epics/
      E001-auth.yaml            # Epic with embedded stories
    adrs/
      ADR-001.yaml              # Architecture Decision Records
    reports/
      E001-S001-report.yaml     # Execution reports
      archive/                  # GC-archived reports
    comments/
      index.yaml                # Comment index
      C000001-*.yaml            # Cross-task comments
    agents/
      agent-abc.yaml            # Agent state (heartbeat, escalation)
      agent-abc-response.yaml   # Human response (read-once)
    ADR-000.yaml                # ADR index

agent-pm/                       # This repository
  src/
    cli.ts                      # CLI entry (commander.js)
    mcp-server.ts               # MCP server (14 tools over stdio)
    commands/                   # CLI command implementations
    schemas/                    # Zod validation schemas
    lib/                        # Helpers (codes, filesystem, index)
    tui/                        # Ink-based TUI dashboard
      components/               # Tree, DetailPanel, StatusBar, AgentSidebar, HelpOverlay
      hooks/                    # useProjectTree, useFileWatcher, useAgentList, useMouseScroll
  install/
    install.sh                  # Multi-client installer
    commands/                   # Slash command templates (Markdown)
    agents-rules.md             # Autonomous filing rules template
```

### Design Principles

1. **Files are the API.** Agents read and write YAML files directly. The CLI adds validation on top.
2. **Flat over nested.** Epics are separate files; stories embed inside epics. One project per `.pm/`.
3. **Codes are stable identifiers.** `MYAPP-E001-S003` uniquely identifies a story across all agents and sessions.
4. **Local-first.** Data lives in `.pm/` at the repo root, versioned with your code.
5. **Client-agnostic.** The MCP server is a standard protocol -- works identically in OpenCode and Claude Code.
6. **Agents are first-class.** Every interface (CLI, MCP, slash commands, TUI dispatch) is designed for agent consumption.

### Naming Conventions

| Entity       | Format               | Example                |
|--------------|----------------------|------------------------|
| Project Code | `[A-Z]{2,6}`        | `PM`, `MYAPP`          |
| Epic Code    | `{PROJECT}-E{NNN}`  | `PM-E001`              |
| Story Code   | `{EPIC}-S{NNN}`     | `PM-E001-S003`         |
| Epic File    | `E{NNN}-{slug}.yaml`| `E001-authentication.yaml` |
| ADR File     | `ADR-{NNN}.yaml`    | `ADR-001.yaml`         |

## Configuration

Project-level settings live in `.pm/project.yaml`:

```yaml
# Consolidation pipeline
consolidation:
  max_reports_per_run: 20
  trigger_mode: manual          # manual | event_based | time_based

# Garbage collection TTLs
gc_config:
  ttl_comments_days: 30
  ttl_reports_days: 7
  ttl_adrs_days: 90
```

For test/CI isolation, set `PM_HOME` to override the data directory:

```bash
export PM_HOME=/tmp/test-pm
pm status    # Uses /tmp/test-pm/.pm/
```

## License

MIT
