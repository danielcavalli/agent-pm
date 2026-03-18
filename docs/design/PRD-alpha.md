# PRD: v0.1.0-alpha -- Agent-Aware Supervisory Dashboard

## 1. Vision & Philosophy

### The Human-as-Bottleneck Thesis

AI coding agents can work in parallel, maintain context indefinitely, and execute faster than humans can review. The constraint in AI-assisted development is not agent capability but human supervisory capacity. Every design decision in agent-pm must minimize human cognitive load, context-switching cost, and supervisory overhead.

This thesis is grounded in research:

- **Cognitive load theory** establishes that human working memory holds 3-5 meaningful items simultaneously ([Springer, 2026](https://link.springer.com/article/10.1007/s10462-026-11510-z)). A supervisory interface must keep the number of items requiring simultaneous attention within this limit, regardless of how many agents are running.

- **Span of control research** from management science shows optimal supervisory effectiveness at 5-9 direct reports, with engagement peaking at 8-9 ([Gallup](https://www.gallup.com/workplace/700718/span-control-optimal-team-size-managers.aspx), [McKinsey](https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/how-to-identify-the-right-spans-of-control-for-your-organization)).

- **Anthropic's autonomy research** found that only ~15% of agent decisions need human routing. Experienced users auto-approve more but interrupt more strategically -- monitoring-based oversight, not action-by-action approval ([Anthropic, 2026](https://www.anthropic.com/research/measuring-agent-autonomy)).

- **Calm technology principles** state that technology should reside in the user's periphery by default, shifting to center of attention only when needed ([calmtech.com](https://calmtech.com/)).

### The v0.1.0-alpha Goal

Make 5 agents feel like 1 by surfacing only what needs human attention.

v0.1.0-alpha transforms the TUI from a read-only project board into an agent-aware supervisory dashboard. Agents running externally (in tmux, as Claude Code sessions, as background processes) become visible to the human through a file-based heartbeat protocol. The human sees at a glance which agents are working, which need attention, and which are idle. Escalation requests surface with a single keystroke.

Full research: `docs/research/multi-agent-tui-research.md`
Architecture decisions: `docs/adr/ADR-021-v0.1.0-architecture.md`

---

## 2. User Personas

### The Solo Operator

Runs 2-5 Claude Code agents simultaneously in tmux panes or terminal tabs. Each agent works on a different story from the project backlog. The operator needs a single pane that answers: "What are my agents doing right now? Does any of them need me?"

**Pain point today:** Must switch between 2-5 terminal tabs to check each agent's status. Misses escalation requests because they scroll past in agent output. No unified view of fleet health.

**Success with v0.1.0:** Opens `pm tui` in one pane, sees all agents in the sidebar. Green dots mean working. A red indicator means one needs a decision. Presses `e`, reads the question, picks an option, returns to other work. Total interruption: 15 seconds.

### The Team Lead

Reviews agent-generated PRs and stories. Coordinates work across a project with 10+ epics. Needs to understand which stories are progressing, which agents are blocked, and where to invest human review time.

**Pain point today:** Runs `pm status` repeatedly. No visibility into active agent execution. Blocked agents sit idle until someone notices.

**Success with v0.1.0:** The agent sidebar shows 3 agents active, 1 blocked. The project tree shows story progress live. Attends to the blocked agent first, then reviews completed stories in the detail panel. Prioritization is visual and immediate.

### The Agent

An AI coding agent (Claude Code, OpenCode, custom) that needs to register its existence, report what it is working on, and ask the human when it encounters ambiguity -- without blocking or requiring the human to be watching.

**Pain point today:** No mechanism to signal its presence or ask questions. If it encounters ambiguity, it either guesses (risk) or stops (waste).

**Success with v0.1.0:** Calls `pm_agent_heartbeat` every 15 seconds. When uncertain, calls `pm_agent_escalate` with options. Continues working on non-blocked tasks while waiting. Polls `pm_agent_check_response` and incorporates the human's answer.

---

## 3. Requirements

### MUST Have (P0)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| M1 | **Agent state schema and `.pm/agents/` directory.** Define `agent-state.schema.ts` with Zod validation. Agents write heartbeat YAML files to `.pm/agents/{agent-id}.yaml`. | ISA-101 Level 1 requires knowing who is active. Without agent state files, the TUI has nothing to observe. This is the foundation for all agent-aware features. |
| M2 | **TUI agent sidebar showing active agents with attention states.** New left panel (20-25 chars wide) listing all registered agents with status icons (active/idle/needs_attention/blocked/completed). | Span of control research: humans need a summary view of all agents at a glance. The sidebar is the ISA-101 Level 1 fleet overview. |
| M3 | **Detail panel scrolling.** The detail panel (`DetailPanel.tsx`) must support vertical scrolling for content that exceeds the panel height. | Currently `DetailPanel.tsx:199` truncates with `lines.slice(0, height)`. Stories with long descriptions or many acceptance criteria are cut off. This is a basic usability bug. |
| M4 | **vim-style j/k navigation and Tab panel focus cycling.** j/k for up/down in any panel. Tab cycles focus between panels. Active panel indicated by border color. | Every major TUI (lazygit, k9s, btop) uses vim-style keys. Arrow-key-only navigation is non-standard. Charm's principle: "never wonder what key to press." |
| M5 | **`pm_agent_heartbeat` MCP tool.** Agents call this periodically to register and update their state. Creates/updates `.pm/agents/{id}.yaml`. | Agents must self-register to be observable. MCP tools are the agent-facing API surface (ADR-007). Without a registration mechanism, the agent sidebar will always be empty. |
| M6 | **Escalation display in TUI.** When an agent's status is `needs_attention`, display it prominently in the sidebar. When selected, show escalation details in the detail panel. | Management by exception: the human only engages when an agent explicitly asks (JAPCC). Only ~15% of decisions need human routing (Anthropic). This is the core supervisory interaction. |
| M7 | **Fix silent `catch {}` blocks.** Replace all empty catch blocks with proper error logging (stderr) or state propagation. | These mask real errors in `index.tsx`, `loadTree.ts`, `consolidate-output.ts`, `epic.ts`, `gc.ts`, `status.ts`, `work.ts`. Debugging is impossible when errors are swallowed. |

### SHOULD Have (P1)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| S1 | **Escalation response mechanism.** Human selects an option (via `e` key + number), response written to `.pm/agents/{id}-response.yaml`. | Closes the human-agent feedback loop. Without it, agents can ask but never receive answers through the TUI. |
| S2 | **`pm_agent_escalate` and `pm_agent_check_response` MCP tools.** Full escalation lifecycle via MCP. | Agents need programmatic APIs to escalate and poll for responses. |
| S3 | **Help overlay (`?` key).** Full-screen overlay showing all keybindings with descriptions. Dismissible with Escape or `?`. | "Never wonder what key to press." Every vim-inspired TUI has `?` for help. |
| S4 | **Agent sidebar toggle (`a` key).** Hide/show the agent sidebar. When hidden, restore the v0.0.6 two-panel layout. | Backward compatibility for users not using multi-agent workflows. |
| S5 | **Advisory file locking.** `withLock(filePath, fn)` wrapper in `lib/fs.ts` using `.pm/.lock-{hash}` files with PID + timestamp. 30s staleness timeout. | Concurrent agent writes to the same epic file can produce corrupted YAML. |
| S6 | **Deduplicate `TaskReferenceSchema`.** Single definition in `comment.schema.ts`, re-exported from `schemas/index.ts`, imported by `adr.schema.ts`. | Duplicate definitions in two files create maintenance risk if they drift apart. |
| S7 | **MCP version from `package.json`.** Replace hardcoded `"0.0.6-alpha"` in `mcp-server.ts:11` with dynamic read. | Eliminates version string drift between package.json and MCP server. |
| S8 | **Clean up dead code in `task-start.schema.ts`.** Either export `ReadyTaskSchema`, `TaskStartQuerySchema`, `TaskStartResponseSchema` from `schemas/index.ts` and use them, or remove the file entirely. | Dead schemas that are neither exported nor imported create confusion and maintenance burden. |

### COULD Have (P2)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| C1 | **Color-coded agent states.** Green (active), yellow (idle), red (needs_attention/blocked), gray (completed). Symbol backup for accessibility. | Calm technology: peripheral awareness through color without demanding attention. |
| C2 | **Agent count in status bar.** Show "3 agents (1 needs attention)" in the bottom bar. | Ambient awareness without looking at the sidebar. |
| C3 | **Page up/down in all panels.** Ctrl+u/Ctrl+d for half-page scroll. g/G for top/bottom. | Power user navigation for large project trees and long detail content. |
| C4 | **Agent filter.** Filter sidebar to show only agents needing attention. | Alert fatigue mitigation: reduce noise when many agents are running smoothly. |

### Won't Have (Deferred to v0.2.0+)

| ID | Deferral | Why |
|----|----------|-----|
| W1 | Agent spawning/killing from TUI | Requires process lifecycle management, signal handling, output capture, crash recovery. Significant infrastructure. |
| W2 | Agent log/output streaming | Ink's rendering model (full-tree traversal on every state change) makes high-frequency text streaming impractical without a dedicated tail-view component. |
| W3 | Token/cost tracking | Requires an observability backend or standardized agent telemetry format. OpenTelemetry conventions are still in development. |
| W4 | Mouse support | Non-essential for terminal power users. Adds complexity to focus management. |
| W5 | Multi-project support | Single `.pm/` per repository by design (ADR local-first). Multi-repo coordination is an orchestration concern, not a TUI concern. |
| W6 | Confidence-based auto-routing | Needs real-world calibration data. LLM self-reported confidence is notoriously miscalibrated. |
| W7 | Audio/desktop notifications | Terminal TUI cannot produce system notifications without external tooling. |
| W8 | OpenTelemetry integration | Agent state schema can be extended with trace IDs in v0.2.0+, but OpenTelemetry conventions for AI agents are still in development. |

---

## 4. Success Criteria

The v0.1.0-alpha release satisfies these testable criteria:

| # | Criterion | How to Verify |
|---|-----------|---------------|
| SC1 | A human can see all active agents and their current tasks in one terminal pane. | Start `pm tui`. Create 3 agent heartbeat files in `.pm/agents/`. Verify all 3 appear in the sidebar with correct status and task codes. |
| SC2 | An agent can register via MCP, send heartbeats, and escalate decisions. | Call `pm_agent_heartbeat` via MCP client. Verify `.pm/agents/{id}.yaml` is created. Call `pm_agent_escalate`. Verify status changes to `needs_attention`. |
| SC3 | The human can respond to an escalation through the TUI. | In `pm tui`, navigate to an agent with `needs_attention` status. Press `e`. Select an option. Verify `.pm/agents/{id}-response.yaml` is created with the correct selection. |
| SC4 | The detail panel displays stories of any length without truncation. | Select a story with 20+ acceptance criteria. Verify all criteria are visible by scrolling (j/k) in the detail panel. |
| SC5 | Navigation responds in < 100ms per keystroke. | Subjective test: j/k movement, Tab focus switching, and filter cycling all feel instant with no perceptible lag. |
| SC6 | Existing v0.0.6 `.pm/` directories work without migration. | Run `pm tui` on a repository that was initialized with v0.0.6. Verify the tree panel renders all epics and stories correctly. Verify the agent sidebar auto-hides (no `.pm/agents/` directory). |
| SC7 | TUI defaults to two-panel layout when no agents are registered. | Start `pm tui` with no `.pm/agents/` directory. Verify the layout matches v0.0.6 (tree + detail, no sidebar). |
| SC8 | All error paths produce visible diagnostics (no silent failures). | Corrupt a YAML file. Run `pm tui`. Verify an error message appears (not silent swallowing). |

---

## 5. Scope Boundary

### What v0.1.0-alpha IS

An agent-aware supervisory dashboard that adds three capabilities to the existing project management TUI:

1. **Agent visibility** -- see which agents exist, what they are working on, and whether they need attention
2. **Escalation handling** -- agents ask questions, humans answer through the TUI
3. **Professional navigation** -- vim keybindings, panel focus, scrollable detail, help overlay

### What v0.1.0-alpha is NOT

- Not an agent orchestrator. It does not decide which agent works on which story.
- Not an agent launcher. It does not start or stop agent processes.
- Not a log viewer. It does not stream agent terminal output.
- Not an analytics dashboard. It does not track tokens, costs, or performance metrics.
- Not a multi-project manager. It shows one project from one `.pm/` directory.

The TUI is a **supervisory window** -- it shows the human what is happening and provides controls for the ~15% of moments that need human judgment. The other 85% of the time, agents run autonomously and the TUI is a calm peripheral display.

---

## 6. Migration Path from v0.0.6-alpha

### Zero Breaking Changes

v0.1.0-alpha is a strict superset of v0.0.6-alpha:

- **Data model:** No changes to `project.yaml`, epic YAML, story YAML, comment YAML, ADR YAML, or report YAML schemas. All existing `.pm/` directories are valid v0.1.0 data.
- **CLI:** All 13 existing commands work identically. New commands are additive.
- **MCP tools:** All 9 existing tools work identically. 3 new tools are additive.
- **Slash commands:** All 11 existing commands work identically. Updates to `pm-work-on.md` and `AGENTS.md` rules add heartbeat instructions but are backward compatible.
- **TUI:** The default layout (when no agents are registered) matches v0.0.6. New features (sidebar, vim keys, scrolling) are additive.

### What Changes

| Area | Change | Impact |
|------|--------|--------|
| New directory | `.pm/agents/` | Created on first `pm_agent_heartbeat` call or by `pm init`. Does not affect existing data. |
| New schema | `src/schemas/agent-state.schema.ts` | Additive. No changes to existing schemas. |
| New MCP tools | `pm_agent_heartbeat`, `pm_agent_escalate`, `pm_agent_check_response` | Additive. Existing tools unchanged. |
| TUI keybindings | j/k, Tab, ?, a, e added | Existing keys (arrows, Enter, f, /, c, y, q, Escape) unchanged. |
| TUI layout | Agent sidebar appears when `.pm/agents/` has content | When no agents present, layout is identical to v0.0.6. |
| Error handling | Silent `catch {}` replaced with stderr logging | May surface errors that were previously hidden. This is intentional. |
| `TaskReferenceSchema` | Single definition, imported elsewhere | Internal refactor. No change to validated data shapes. |
| MCP version | Dynamic from `package.json` | Cosmetic. No behavioral change. |

### Upgrade Path

1. `npm install -g agent-pm@0.1.0-alpha` (replaces v0.0.6)
2. Run `bash install/install.sh` to update MCP server registration and slash commands
3. No data migration needed. Existing `.pm/` directories work as-is.
4. To use agent features: update agent workflows to call `pm_agent_heartbeat`
