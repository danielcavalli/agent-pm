 # TUI Revamp: Kanban Agent Supervision Dashboard

## Design Definition Document v1.0

---

## 0. Document Purpose

This document defines the complete UX, layout, interaction model, navigation scheme, and visual language for the revamped TUI. It serves as the authoritative specification for implementation. Every decision is grounded in the tool's core thesis: **the human is the bottleneck, not the agents**. The TUI must minimize supervisory cognitive load while maximizing situational awareness across an arbitrary number of concurrent orchestrators and workers.

---

## 1. Design Principles

These five principles govern every decision in this document. When trade-offs arise, they are resolved in priority order (P1 highest):

| # | Principle | Rationale | Implication |
|---|-----------|-----------|-------------|
| P1 | **Escalations are interrupts, everything else is ambient** | Calm technology: information lives at the periphery until it demands attention (Case, 2015). Only ~15% of agent decisions need human routing (Anthropic, 2026). | Escalation flags must be the loudest visual element. Non-escalated work should be glanceable but never demand focus. |
| P2 | **Maximize information density, minimize action surface** | Cognitive load theory applies to *decisions*, not *perception*. A pilot reads 100+ instruments but acts on 2–3. Working memory limits (Cowan, 2001) constrain simultaneous decisions, not simultaneous data streams. | Show everything — every worker, every channel, every progress bar. But the number of items *demanding human action* at any moment should be small. The TUI is an instrument panel, not a task list. Information is ambient; only escalations are interactive. |
| P3 | **Kanban columns encode workflow state, not priority** | Kanban method: columns represent process stages with WIP limits; priority is a property within a column (Anderson, 2010). | Columns are BACKLOG → TO DO → DOING → DONE. Priority is shown via sort order and badges within columns, not via separate lanes. |
| P4 | **The DOING column is the primary workspace** | The user's supervisory task is monitoring active work. Backlog and Done are reference; To Do is a queue. | DOING gets more screen real estate and richer affordances (agent trees, progress, comms). |
| P5 | **Keyboard-first, mouse-assisted** | Terminal power users expect vim-style efficiency. Mouse lowers onboarding cost but must never be required. | Every action has a keybinding. Mouse clicks are shortcuts to the same actions. |

### 1.1 Research Grounding

**Cognitive Load Theory — Reframed for Supervisory Dashboards (Sweller, 1988; Cowan, 2001; Wickens, 2008)**
Working memory limits (3–5 chunks) constrain the number of *decisions* a human can evaluate simultaneously, not the amount of *information* they can perceive. This distinction is critical for supervisory interfaces. Air traffic control displays, ICU monitors, and mission control dashboards all present dense, continuous data streams — because the operator's job is situational awareness, not item-by-item evaluation. The cognitive cost comes from context-switching between decisions, not from seeing data. The TUI applies this by treating all agent activity as **ambient information** (always visible, zero cognitive cost when things are healthy) and reserving **focal attention** only for escalations that require a human decision. Information density is a feature, not a problem. The TUI should feel like an instrument panel: everything is readable at a glance, but only the warning lights demand action.

**Kanban Method (Anderson, 2010)**
Kanban boards visualize work-in-progress, enforce WIP limits, and make bottlenecks visible. The four-column model (BACKLOG, TO DO, DOING, DONE) maps directly to the agent workflow. WIP limits on DOING are enforced by the orchestrator count — each orchestrator owns exactly one epic, so `WIP(DOING) = orchestrator_count`.

**Calm Technology (Case, 2015)**
Technology should inform without demanding attention. The TUI's default state is a quiet dashboard. Escalations transition from peripheral (status bar counter) to focal (inline flag + detail pane) only when human intervention is required.

**Span of Control (Gallup, 2024; McKinsey)**
Optimal supervisory span is 5–9 direct reports. The orchestrator count is the user's "span of control." The TUI should surface warnings when orchestrator count exceeds 8, as supervisory effectiveness degrades beyond this point.

**Agent Autonomy Patterns (Anthropic, 2026)**
Experienced supervisors approve more actions automatically but interrupt more strategically. The TUI supports this by making escalation-free work ambient (auto-advancing through columns) while making escalations high-signal and actionable.

**Terminal Dashboard Precedents**
The design draws from established terminal UIs: `htop` (process tree with real-time metrics), `k9s` (Kubernetes pod management with contextual detail), `lazygit` (panel-based workflow with vim navigation), and `taskwarrior-tui` (kanban-style task management in terminal). These establish user expectations for terminal dashboard interaction patterns.

---

## 2. Layout Architecture

### 2.1 Screen Regions

The TUI divides the terminal into five persistent regions:

```
┌─── Title Bar ──────────────────────────────────────────────────────┐
│ agent-pm ░ Orchestrators: 3/5 ░ Workers: 12 ░ 🔺 2 escalations   │
├────────┬────────┬──────────────────────┬────────┬──────────────────┤
│BACKLOG │ TO DO  │       DOING          │  DONE  │  Detail Pane     │
│        │        │                      │        │  (toggle: d)     │
│ E071 ▸ │ E074 ▸ │ ● Orch-1 → E072     │ E070 ✓ │                  │
│ E073 ▸ │ E075 ▸ │   ├─ W1 auth.ts  ◐  │ E069 ✓ │  ┌─ E072 ──────┐│
│ E076 ▸ │        │   ├─ W2 db.ts    ●  │        │  │ Title: ...   ││
│        │        │   └─ W3 test.ts  ○  │        │  │ Stories: 5   ││
│        │        │ ● Orch-2 → E077     │        │  │              ││
│        │        │   ├─ W1 api.ts   ●  │        │  │ S072-1 [...] ││
│        │        │   └─ W2 routes   ◐  │        │  │ S072-2 [...] ││
│        │        │ 🔺 Orch-3 → E078    │        │  │              ││
│        │        │   ├─ W1 ui.tsx  ⚠   │        │  └──────────────┘│
│        │        │   └─ W2 css     ●  │        │                  │
├────────┴────────┴──────────────────────┴────────┴──────────────────┤
│ [Tab] focus ░ [h/l] column ░ [j/k] row ░ [d] detail ░ [?] help   │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Region Specifications

| Region | Height | Width | Purpose |
|--------|--------|-------|---------|
| **Title Bar** | 1 row | 100% | Project name, orchestrator count / max, total worker count, escalation alert count |
| **Kanban Area** | rows − 2 | Adaptive (see §2.3) | Four columns showing epic cards in workflow stages |
| **Detail Pane** | rows − 2 | 40% when open, 0 when closed | Epic/story descriptions, acceptance criteria, escalation threads, agent logs |
| **Status Bar** | 1 row | 100% | Context-sensitive key hints, last-action confirmation, timestamps |

### 2.3 Adaptive Column Widths

Column widths adapt to terminal width and detail pane state. The DOING column always gets the most space because it contains nested agent trees.

**Detail Pane Closed** (full kanban view):

| Terminal Width | BACKLOG | TO DO | DOING | DONE |
|----------------|---------|-------|-------|------|
| ≥160 cols | 18% | 18% | 42% | 22% |
| 120–159 | 16% | 16% | 46% | 22% |
| 80–119 | 14% | 14% | 50% | 22% |
| <80 | Hidden (cycle with `H/L`) | Hidden | 100% | Hidden |

**Detail Pane Open** (kanban compresses):

| Terminal Width | Kanban Area | Detail Pane |
|----------------|-------------|-------------|
| ≥160 cols | 60% | 40% |
| 120–159 | 55% | 45% |
| 80–119 | 50% | 50% |
| <80 | 0% (detail takes over) | 100% |

When the kanban area is compressed (detail open), only the **focused column** is fully rendered. Adjacent columns collapse to single-character indicators showing card count (e.g., `│3│`).

### 2.4 Narrow Terminal Fallback (<80 cols)

On very narrow terminals, the TUI enters **single-column mode**: only one column is visible at a time, navigated with `h`/`l`. This prevents layout breakage and maintains usability on minimal terminal sizes. The detail pane replaces the column view entirely when toggled.

---

## 3. Kanban Column Definitions

### 3.1 BACKLOG

**Purpose:** Epics awaiting human review before they can be queued for work. These are raw, unrefined epics that need the user's approval on scope, stories, and acceptance criteria before agents may begin.

**Card display:**
```
┌─ E071 ────────────────┐
│ Payment Gateway v2    │
│ 6 stories │ high      │
│ ⏳ Awaiting review     │
└────────────────────────┘
```

**Interactions:**
- `Enter` on a card → opens it in the Detail Pane for review
- `a` (approve) → moves card to TO DO (with confirmation prompt)
- `r` (reject/return) → opens inline comment field, sends feedback to planning agent
- `e` (edit) → opens epic in `$EDITOR` for direct modification
- Cards are sorted by priority (high → medium → low), then by creation date

**WIP Limit:** None. Backlog can grow unbounded; it is a holding area.

### 3.2 TO DO

**Purpose:** Refined, approved epics ready for orchestrator pickup. When an orchestrator becomes available, it pulls the highest-priority epic from this column.

**Card display:**
```
┌─ E074 ────────────────┐
│ Search Indexing        │
│ 4 stories │ high      │
│ ✅ Ready               │
└────────────────────────┘
```

**Interactions:**
- `Enter` → opens in Detail Pane (read-only unless user presses `e` to edit)
- `p` → reprioritize: opens a quick reorder UI (move up/down with `j`/`k`, confirm with `Enter`)
- Cards auto-disappear from TO DO when an orchestrator claims them (animated slide to DOING)

**WIP Limit:** Soft limit displayed in column header. Recommended: 2× orchestrator count. If exceeded, status bar shows "TO DO queue deep — consider prioritizing."

### 3.3 DOING

**Purpose:** Active work. Each card in DOING is owned by exactly one orchestrator. This is the richest column, displaying the agent hierarchy and communication state.

**Card display (board-level):**

DOING cards prioritize **decision context** at the board level. The card answers: "What has this orchestrator figured out so far?" rather than "Which files are workers touching?"

```
┌─ E072 ──────── ● zeus ──────────────────────┐
│ Auth System Rewrite              ██████░░ 4/5│
│                                              │
│ Decisions:                                   │
│  • Using JWT with refresh tokens, not sessions│
│  • Guard pattern for route protection        │
│  • Shared types in /common/auth.types.ts     │
│                                              │
│ Workers: 3 active │ 💬 ↔ hera (session model)│
│ 47m elapsed │ 12s ago                        │
└──────────────────────────────────────────────┘
```

**With escalation:**
```
┌─ E078 ──────── 🔺 athena ───────────────────┐
│ Dashboard Components             ████░░░░ 2/5│
│                                              │
│ Decisions:                                   │
│  • React Server Components for data panels   │
│  • D3 over Recharts for custom charts        │
│                                              │
│ 🔺 Workers disagree: CSS modules vs Tailwind │
│ Workers: 2 active │ 1h12m elapsed            │
└──────────────────────────────────────────────┘
```

**Sub-elements within a DOING card (board-level):**
- **Header line:** Epic ID, orchestrator name with status dot, progress bar (stories completed / total)
- **Decision summary:** Rolling list of the last 3–5 key decisions the orchestrator has made. These are written by the orchestrator via the `report_status` MCP tool as structured decision entries. If more than 5 exist, the card shows the most recent with a `+N more` indicator.
- **Alert line:** If an escalation is active, it replaces the bottom summary line with the escalation description in red/bold. This is the loudest element on the card.
- **Footer line:** Worker count with aggregate status, active communication channel badges, elapsed time, recency

This design keeps the card scannable — the user reads decisions top-to-bottom like a changelog, spots escalations immediately (they override the normal layout), and gets a worker/comms summary without needing to drill in.

**Interactions (board-level):**
- `Enter` → **Session Mode**: full-screen takeover showing this orchestrator's complete session view (see §3.5)
- `c` → Quick-peek communication channels in the Detail Pane without leaving the board
- `f` → Jump to the next escalation (global, but if pressed while a DOING card is selected, starts from that card)

**WIP Limit:** Hard limit = configured orchestrator count. The column header shows `DOING (3/5)` meaning 3 of 5 configured orchestrator slots are active.

### 3.5 Session Mode (Full-Screen Takeover)

Pressing `Enter` on a DOING card enters **Session Mode** — a full-screen view dedicated to a single orchestrator and its workers. This is the deep supervision workspace. `Esc` returns to the board.

**Session Mode layout:**

```
┌─ SESSION: zeus → E072 Auth System Rewrite ──── ██████░░ 4/5 ── Esc: back ─┐
│                                                                             │
│ ┌─ Workers ──────────────────────┐ ┌─ Decisions & Comms ──────────────────┐ │
│ │                                │ │                                      │ │
│ │ ● W1 (apollo)                  │ │ Tab: [Decisions] Comms  Activity     │ │
│ │   auth.service.ts              │ │                                      │ │
│ │   [|||    ] 3/8 subtasks       │ │ #5  JWT refresh tokens over sessions │ │
│ │                                │ │     Reason: stateless scaling,       │ │
│ │ ◐ W2 (hermes)                  │ │     aligns with API gateway epic     │ │
│ │   auth.guard.ts                │ │                                      │ │
│ │   [||||||  ] 6/8 subtasks      │ │ #4  Guard pattern for routes         │ │
│ │                                │ │     Reason: middleware too implicit,  │ │
│ │ ○ W3 (athena)                  │ │     guards are testable per-route    │ │
│ │   auth.spec.ts                 │ │                                      │ │
│ │   queued                       │ │ #3  Shared types in /common/         │ │
│ │                                │ │     Reason: W1 and W2 both need      │ │
│ │                                │ │     AuthUser, TokenPayload types     │ │
│ │ ─────────────────────────────  │ │                                      │ │
│ │ + spawn worker                 │ │ #2  bcrypt over argon2               │ │
│ │                                │ │     Reason: broader ecosystem support│ │
│ │                                │ │                                      │ │
│ │                                │ │ #1  Passport.js removed              │ │
│ │                                │ │     Reason: unnecessary abstraction  │ │
│ │                                │ │     for our auth flow                │ │
│ ├────────────────────────────────┤ ├──────────────────────────────────────┤ │
│ │ ▸ W1 Log Tail                  │ │ 💬 ↔ hera: session-schema           │ │
│ │ [14:23] Writing createSession()│ │ 💬 team: auth-approach               │ │
│ │ [14:23] Importing from common/ │ │                                      │ │
│ │ [14:24] Running unit tests...  │ │ Select channel to view transcript    │ │
│ └────────────────────────────────┘ └──────────────────────────────────────┘ │
├─ [j/k] navigate ░ [Tab] switch pane ░ [L] log tail ░ [K] kill ░ [Esc] back┤
└─────────────────────────────────────────────────────────────────────────────┘
```

**Session Mode has four panes arranged in a 2×2 grid:**

| Pane | Position | Content |
|---|---|---|
| **Worker List** | Top-left | All workers with status icons, current file, subtask progress bars. Selectable — `j`/`k` to navigate, `Enter` to select. |
| **Right Panel** | Top-right | Tabbed view cycling with `1`/`2`/`3`: (1) **Decisions** — full decision log with reasoning, (2) **Comms** — channel list, select to view transcript, (3) **Activity** — timeline of all actions (files written, tests run, workers spawned, messages sent) |
| **Log Tail** | Bottom-left | Live-updating log output from the selected worker. Shows last N lines of the worker's activity. Switches when a different worker is selected. |
| **Channel / Escalation Detail** | Bottom-right | Shows the transcript of the selected communication channel, or the escalation thread if one is active. This is where the user reads full conversations and responds to escalations. |

**Session Mode key bindings:**

| Key | Action |
|-----|--------|
| `Esc` | Return to Board Mode |
| `Tab` | Cycle focus between the four panes |
| `j` / `k` | Navigate within focused pane (workers, decisions, log lines, messages) |
| `1` / `2` / `3` | Switch right panel tab (Decisions, Comms, Activity) |
| `L` | Toggle log tail for selected worker |
| `K` | Kill selected worker (confirmation required) |
| `+` | Spawn a new worker (orchestrator decides the task) |
| `c` | Open selected communication channel in bottom-right pane |
| `i` | Enter input mode — inject a message into the active channel or respond to escalation |
| `Enter` | Context-dependent: select worker, open channel, confirm action |
| `y` | Copy selected content to clipboard |

**Worker status icons (used in both Board Mode cards and Session Mode worker list):**

| Icon | State | Meaning |
|------|-------|---------|
| `●` | Active | Worker is actively writing/executing |
| `◐` | Testing | Worker is running tests or validation |
| `◑` | Blocked | Worker is waiting on another worker or external resource |
| `○` | Queued | Worker has been spawned but hasn't started yet |
| `⚠` | Escalated | Worker has raised an issue needing orchestrator or human attention |
| `✗` | Failed | Worker crashed or task failed |
| `✓` | Done | Worker completed its assigned task |

### 3.4 DONE

**Purpose:** Completed epics. Kept for reference, audit, and cross-epic communication (an orchestrator working on a DOING epic may need to communicate with the orchestrator that completed a related DONE epic — the context is preserved).

**Card display:**
```
┌─ E070 ────────────────┐
│ User Profile API      │
│ 5/5 stories │ ✓ done  │
│ Completed: 2h ago     │
│ Orch: hera            │
└────────────────────────┘
```

**Interactions:**
- `Enter` → opens in Detail Pane (full history, all stories, agent logs)
- `m` → mark for archival (moves to a hidden archive; recoverable with `/` search)
- Cards are sorted by completion time (most recent first)

**WIP Limit:** Display limit of 10 most recent. Older cards are accessible via scroll or search.

---

## 4. Detail Pane

### 4.1 Purpose

The Detail Pane is a contextual side panel that shows deep information about the currently selected item. It adapts its content based on what is selected in the Kanban area.

### 4.2 Content Modes

The Detail Pane serves **Board Mode only**. When a DOING card is fully expanded, the user enters Session Mode (§3.5) instead. The Detail Pane handles everything else.

| Selection Context | Detail Pane Shows |
|---|---|
| BACKLOG card | Epic description, story list with acceptance criteria, approval/reject controls |
| TO DO card | Epic description, story list, priority info, complexity estimates |
| DOING card (`c` key, quick-peek) | Communication channel list for that orchestrator — select one to read transcript without leaving the board |
| DOING card (`Enter` key) | N/A — enters Session Mode (full-screen takeover, see §3.5) |
| DONE card | Completed epic summary, final story status, decision history, orchestrator that completed it |
| Escalation (via `f` key) | Escalation thread with context, positions, and resolution controls (see §5.4) — can be viewed from Board Mode without entering Session Mode |

### 4.3 Detail Pane Navigation

The Detail Pane is a scrollable viewport. When focused:

| Key | Action |
|-----|--------|
| `j` / `k` | Scroll down / up (line by line) |
| `Ctrl+d` / `Ctrl+u` | Scroll down / up (half page) |
| `g` / `G` | Jump to top / bottom |
| `s` | Cycle through story details (when viewing an epic) |
| `Tab` | Return focus to Kanban area |
| `q` or `d` | Close the Detail Pane |
| `/` | Search within the detail content |

### 4.4 Detail Pane Sub-Views

When viewing an epic, the detail pane has internal tabs (cycled with `1`–`4` keys):

1. **Overview** — Epic description, metadata, story count, progress
2. **Stories** — Full story list with acceptance criteria, scrollable
3. **Activity** — Timeline of agent actions on this epic (file writes, test runs, decisions)
4. **Comms** — All communication threads involving this epic's orchestrator

---

## 5. Communication & Escalation System

This is the core differentiator of the TUI. The communication model is hierarchical with clear escalation paths.

### 5.1 Communication Hierarchy

```
                    ┌─────────┐
                    │  Human  │
                    │  (You)  │
                    └────┬────┘
                         │ escalation (only when needed)
              ┌──────────┼──────────┐
              │          │          │
         ┌────┴────┐ ┌──┴───┐ ┌───┴───┐
         │ Orch-1  │ │Orch-2│ │Orch-3 │
         └────┬────┘ └──┬───┘ └───┬───┘
              │         │         │
         ┌────┼────┐    │    ┌───┼───┐
         │    │    │    │    │       │
        W1   W2   W3   W1  W1     W2

  ── Lateral communication (Orch ↔ Orch, Worker ↔ Worker within same Orch)
  │  Vertical escalation (up only when resolution fails)
```

### 5.2 Communication Types

| Type | Between | Trigger | TUI Indicator |
|------|---------|---------|---------------|
| **Worker Chat** | Workers within same orchestrator | Workers recognize overlapping concerns in their subtasks | `💬` on the orchestrator's DOING card |
| **Orchestrator Chat** | Two or more orchestrators | Cross-epic domain overlap detected (shared files, shared APIs, dependency) | `💬 Orch-X ↔ Orch-Y` badge on both DOING cards |
| **Worker → Orch Escalation** | Worker to its orchestrator | Workers cannot reach consensus after N exchanges (configurable, default: 3) | `⚠` on the worker row; orchestrator status changes to "arbitrating" |
| **Orch → Human Escalation** | Orchestrator to the user | Orchestrator cannot resolve: (a) worker dispute, (b) cross-epic dispute, or (c) ambiguous requirement | `🔺` flag on the DOING card + Title Bar counter increments + optional terminal bell |

### 5.3 Communication Channel View

When the user selects a communication badge (`c` key or `Enter` on a `💬` badge), the Detail Pane switches to the **Comms View**:

```
┌─ Comms: Orch-1 ↔ Orch-2 ───────────────────┐
│ Topic: Shared session model between Auth     │
│        (E072) and API Gateway (E077)         │
│ Status: ● Active (3 messages)                │
│──────────────────────────────────────────────│
│ [Orch-1 12:34] My auth service writes to     │
│ sessions table. Are you reading from it?     │
│                                              │
│ [Orch-2 12:34] Yes, my API gateway reads     │
│ session tokens. We should agree on schema.   │
│                                              │
│ [Orch-1 12:35] Proposing: { sid, uid, exp,  │
│ scopes[] }. Acceptable?                      │
│                                              │
│ [Orch-2 12:35] Agreed. I'll use that schema. │
│ Status: ✅ Resolved                           │
└──────────────────────────────────────────────┘
```

This is a read-only log for the user. The user can:
- Scroll through the transcript (`j`/`k`)
- Inject a message into the channel (`i` to enter input mode, type, `Enter` to send) — this allows the human to proactively guide a conversation even before escalation
- Close the view (`q` or `d`)

### 5.4 Escalation Interaction

When a `🔺` escalation reaches the user, it appears in three places simultaneously:
1. **Title Bar** — counter increments (e.g., `🔺 2 escalations`)
2. **DOING card** — the card gets a red left-border accent and the 🔺 icon
3. **Status Bar** — flashes "Escalation from Orch-3: workers disagree on API versioning strategy — press `f` to focus"

**Escalation focus flow:**

1. User presses `f` (focus next escalation) — cursor jumps to the escalated card
2. `Enter` opens the escalation in the Detail Pane
3. Detail Pane shows:
   - **Context:** What the agents were trying to do
   - **Disagreement:** Each side's position, clearly labeled
   - **Recommendation:** The orchestrator's suggested resolution (if any)
   - **Action buttons:**
     - `1` — Accept Side A
     - `2` — Accept Side B
     - `3` — Accept orchestrator's recommendation
     - `i` — Write a custom resolution (opens input line)
     - `s` — Skip / defer (escalation stays active but user can return later)
4. After resolution, the escalation flag clears, and work auto-resumes

### 5.5 Escalation Priority Levels

| Level | Source | Visual | Sound | Auto-timeout |
|-------|--------|--------|-------|--------------|
| **Info** | Worker → Orch (resolved by orch) | `ℹ` icon, dim | None | N/A (resolved) |
| **Warning** | Orch arbitrating worker dispute | `⚠` icon, yellow | None | 10 min, then re-escalates to human |
| **Critical** | Orch → Human (needs your input) | `🔺` icon, red + border | Terminal bell (configurable) | None (blocks work on that subtask) |

### 5.6 Cross-Epic Communication Scenarios

**Scenario A: Shared Domain Detected**
Two orchestrators touch the same file or API. The system auto-opens a communication channel. TUI shows the `💬` badge. No human action needed unless they can't agree.

**Scenario B: Dependency Discovered Mid-Work**
Orch-2 realizes its epic depends on output from Orch-1's in-progress epic. Orch-2 opens a channel, requests the interface contract. If Orch-1 can provide it (even before finishing), work continues. If not, the dependency becomes a soft block (`◑` status on affected workers) and the user sees it in the DOING card.

**Scenario C: Completed Epic Reference**
Orch-3 needs to understand decisions made in a DONE epic. It can read the DONE epic's context (stored in `.pm/` files). No communication channel needed — it's a read operation. But if the decision needs revisiting, Orch-3 escalates to the human.

---

## 6. Navigation Model

### 6.1 Focus System

The TUI has a hierarchical focus model:

```
Level 0: Global (title bar / status bar commands always available)
Level 1: Column focus (which kanban column is active)
Level 2: Card focus (which epic card within the column)
Level 3: Element focus (which worker/element within a DOING card)
Level 4: Detail Pane focus (when pane is open and focused)
```

Focus level determines which key bindings are active. The current focus is indicated by:
- **Column:** Column header is highlighted (bold + accent color)
- **Card:** Card has a bright border / selection indicator (`▸` prefix or highlighted background)
- **Element:** Worker row is highlighted within the expanded card
- **Detail Pane:** Pane border changes to accent color; kanban border dims

### 6.2 Global Key Bindings (Always Active)

| Key | Action |
|-----|--------|
| `?` | Toggle help overlay |
| `f` | Focus next escalation (cycles through active escalations) |
| `F` | Focus previous escalation |
| `d` | Toggle Detail Pane open/closed |
| `Tab` | Cycle focus: Kanban columns → Detail Pane → Kanban |
| `Ctrl+c` | Quit (with confirmation if agents are running) |
| `/` | Global search (epics, stories, agents by name) |
| `Esc` | Cancel current action / close overlay / return to column focus |
| `n` | Notification center: show all recent events (last 50) |
| `O` | Open orchestrator config (set count, naming, strategy) |

### 6.3 Column-Level Key Bindings

| Key | Action |
|-----|--------|
| `h` / `l` | Move focus to previous / next column |
| `j` / `k` | Move selection down / up within column |
| `g` / `G` | Jump to first / last card in column |
| `Enter` | Drill into selected card (Level 2 → Level 3 in DOING; opens Detail Pane in others) |
| `Ctrl+d` / `Ctrl+u` | Scroll half-page down / up in column |

### 6.4 Column-Specific Key Bindings

| Column | Key | Action |
|--------|-----|--------|
| BACKLOG | `a` | Approve → move to TO DO |
| BACKLOG | `r` | Reject → open comment input, send feedback |
| BACKLOG | `e` | Edit epic in `$EDITOR` |
| TO DO | `p` | Reprioritize (enter reorder mode) |
| TO DO | `e` | Edit epic in `$EDITOR` |
| DOING | `Enter` | Enter Session Mode (full-screen, see §3.5) |
| DOING | `c` | Quick-peek comms in Detail Pane |
| DOING | `f` | Focus next escalation on this card |
| DONE | `m` | Archive card (hide from view, accessible via search) |

### 6.5 Detail Pane Key Bindings (When Focused)

| Key | Action |
|-----|--------|
| `j` / `k` | Scroll line |
| `Ctrl+d` / `Ctrl+u` | Scroll half-page |
| `g` / `G` | Top / bottom |
| `1`–`4` | Switch sub-view tabs (Overview, Stories, Activity, Comms) |
| `s` | Next story (in Stories sub-view) |
| `S` | Previous story |
| `i` | Enter input mode (for comms injection or escalation response) |
| `Enter` | Submit input |
| `y` / `c` | Copy selected content to clipboard |
| `/` | Search within detail content |
| `q` or `d` or `Tab` | Close / return focus to Kanban |

### 6.6 Mouse Interactions

| Action | Effect |
|--------|--------|
| Click on column header | Focus that column |
| Click on card | Select that card (focus Level 2) |
| Click on worker row | Select that worker (focus Level 3) |
| Click on `💬` badge | Open comms in Detail Pane |
| Click on `🔺` flag | Open escalation in Detail Pane |
| Scroll wheel | Scroll within focused region |
| Click on Detail Pane tab | Switch to that sub-view |
| Double-click card | Toggle expand/collapse (DOING cards) |

---

## 7. Visual Language

### 7.1 Color Semantics

All colors respect `NO_COLOR` and `TERM=dumb` — falling back to bold/dim/underline text decorations.

| Semantic | Color (256-color) | Fallback | Usage |
|----------|-------------------|----------|-------|
| Healthy / Active | Green (34) | Bold | Active workers, progress bars filling, DONE cards |
| Warning / Attention | Yellow (33) | Underline | Worker-level escalations (⚠), soft blocks, queue depth warnings |
| Critical / Escalation | Red (31) | Bold + Inverse | Human-required escalations (🔺), failed workers (✗), kill confirmations |
| Communication | Cyan (36) | Dim | Chat badges (💬), channel transcripts, info-level notifications |
| Neutral / Ambient | Default / Gray | Normal | Card borders, inactive columns, timestamps, metadata |
| Focus / Selected | Blue (34) or Inverse | Inverse | Currently focused column, selected card, active detail pane border |
| Queued / Idle | Dim gray | Dim | Queued workers (○), idle orchestrators, archived items |

### 7.2 Card Border Accents

Cards in the DOING column have a left-border accent that encodes state at a glance:

| Left Border | State |
|-------------|-------|
| `│` (green) | All workers active, no issues |
| `│` (yellow) | At least one worker blocked or orchestrator is arbitrating |
| `│` (red) | Escalation pending human attention |
| `│` (cyan) | Active inter-orchestrator communication channel |
| `│` (dim) | Orchestrator idle (between tasks within the epic) |

### 7.3 Progress Indicators

**Epic progress bar** (in DOING cards):
```
████████░░ 4/5 stories
```
- Filled segments: completed stories (green)
- Half-filled: in-progress story (yellow)
- Empty: not started (dim)

**Worker activity indicator** (inline):
```
● apollo   auth.service.ts   [|||   ] 3/8 subtasks
```
Compact spinner (`●`) pulses between bright and dim to indicate active file I/O.

### 7.4 Typography Hierarchy

| Level | Style | Example |
|-------|-------|---------|
| Column header | UPPERCASE, Bold, Underline | `DOING (3/5)` |
| Card title (epic) | Bold | **Auth System Rewrite** |
| Orchestrator name | Bold + color accent | **● Orch-1 (zeus)** |
| Worker name | Normal + status icon | `├─ W1 (apollo)  auth.service.ts  ● active` |
| Metadata | Dim | `Runtime: 47m │ Last activity: 12s ago` |
| Escalation text | Bold + Red background (or inverse) | `🔺 Workers disagree on API versioning` |
| Status bar hints | Dim, spaced with `░` separator | `[Tab] focus ░ [h/l] column ░ [f] escalation` |

---

## 8. Orchestrator Management

### 8.1 Orchestrator Configuration

The user configures orchestrator count via the `O` key (global), which opens an overlay:

```
┌─ Orchestrator Configuration ─────────────┐
│                                           │
│  Active orchestrators:  3                 │
│  Maximum allowed:       [5]  (editable)   │
│                                           │
│  ┌──────────┬────────┬──────────────────┐ │
│  │ Name     │ Status │ Current Epic     │ │
│  ├──────────┼────────┼──────────────────┤ │
│  │ zeus     │ active │ E072 Auth System │ │
│  │ hera     │ active │ E077 API Gateway │ │
│  │ athena   │ active │ E078 Dashboard   │ │
│  │ apollo   │ idle   │ —                │ │
│  │ hermes   │ idle   │ —                │ │
│  └──────────┴────────┴──────────────────┘ │
│                                           │
│  [+] Add orchestrator  [-] Remove         │
│  [Enter] Confirm  [Esc] Cancel            │
│                                           │
│  ⚠ Recommended max: 8 (span of control)  │
└───────────────────────────────────────────┘
```

### 8.2 Orchestrator Lifecycle

1. **Spawn:** User increases orchestrator count or a new orchestrator auto-spawns when one finishes and TO DO is non-empty. Orchestrator picks highest-priority TO DO epic, moves it to DOING.
2. **Active:** Orchestrator owns exactly one epic. Spawns workers as needed. Participates in cross-epic comms. Arbitrates worker disputes.
3. **Completing:** Orchestrator finishes all stories in its epic. Runs final validation. Moves epic to DONE.
4. **Idle:** Orchestrator has no epic. If TO DO is non-empty, it claims one. If TO DO is empty, it enters idle state (shown in config overlay, not in DOING column).
5. **Terminated:** User removes an orchestrator via config. If it was working on an epic, the epic returns to TO DO (with progress preserved).

### 8.3 Span of Control Warning

If the user configures more than 8 orchestrators, the status bar shows a persistent warning:

```
⚠ 9 orchestrators active — supervisory effectiveness may degrade (recommended: ≤8)
```

This is advisory, not blocking. The user can dismiss it with `Esc`.

---

## 9. Search & Filtering

### 9.1 Global Search (`/`)

Opens a search bar at the bottom of the screen (vim-style). Searches across:
- Epic titles and IDs
- Story titles
- Orchestrator and worker names
- Communication channel topics
- Escalation descriptions

Results appear as a filtered overlay on the Kanban area. `Enter` on a result navigates to that item. `Esc` closes the search.

### 9.2 Column Filtering

Within a column, `F` opens a filter prompt:
- By priority: `high`, `medium`, `low`
- By tag/label
- By orchestrator name (DOING column)
- By status (DOING column: `active`, `blocked`, `escalated`)

Active filters are shown in the column header: `DOING (3/5) [filter: active]`

---

## 10. Notification & Event System

### 10.1 Event Categories

| Category | Examples | Default Behavior |
|----------|----------|------------------|
| **Escalation** | Worker dispute, orch → human flag | Title bar counter, status bar flash, optional bell |
| **Completion** | Story done, epic done, worker finished | Brief status bar message ("E072-S3 completed"), auto-clears after 5s |
| **Communication** | New cross-orch channel opened | `💬` badge appears on card, status bar note |
| **Warning** | Worker crash, stale heartbeat, high queue depth | Status bar persistent warning, yellow accent on affected card |
| **Info** | Orchestrator claimed epic, worker spawned | Status bar message, auto-clears after 3s |

### 10.2 Notification Center (`n` key)

Opens a scrollable overlay showing the last 50 events in reverse chronological order, with category icons and timestamps:

```
┌─ Notifications ──────────────────────────────┐
│ 🔺 12:47  Orch-3 escalated: API versioning   │
│ 💬 12:45  Orch-1 ↔ Orch-2: session schema    │
│ ✓  12:42  E072-S3 auth.guard completed        │
│ ●  12:40  Orch-2 spawned worker W2            │
│ ⚠  12:38  W1 (athena) heartbeat stale (>30s) │
│ ...                                           │
│ [j/k scroll] [Enter: navigate to item] [q]   │
└───────────────────────────────────────────────┘
```

### 10.3 Terminal Bell

Configurable via `.pm/config.toml`:

```toml
[tui.notifications]
bell_on_escalation = true        # Ring terminal bell on 🔺 Critical
bell_on_completion = false       # Ring on epic completion
bell_on_crash = true             # Ring on worker/orch crash
```

---

## 11. State Architecture (Implementation Guidance)

### 11.1 State Model

The current monolithic `useState` approach (12+ atoms in App) will not scale to this design. The recommended architecture:

**Option A: Zustand Store (Recommended)**
A single Zustand store with sliced state:

```
KanbanStore
├── columns: { backlog: Epic[], todo: Epic[], doing: DoingEpic[], done: Epic[] }
├── orchestrators: Orchestrator[]
├── workers: Map<OrchestratorId, Worker[]>
├── communications: Channel[]
├── escalations: Escalation[]
├── ui: { focusLevel, focusColumn, focusCard, focusElement, detailPaneOpen, detailPaneContent }
├── notifications: Event[]
└── config: { maxOrchestrators, bellSettings, ... }
```

Zustand is chosen over Redux/MobX because: (a) it has zero boilerplate, (b) it works well with React (Ink), (c) selectors prevent unnecessary re-renders in a terminal context where every render cycle matters.

**Option B: useReducer + Context**
If external dependencies are undesirable, a `useReducer` with a structured action set can replace the 12 `useState` calls. The reducer function acts as a centralized state machine.

### 11.2 Data Flow

```
.pm/ filesystem (source of truth)
    │
    ▼
File watcher (useFileWatcher hook, already exists)
    │
    ▼
State store (Zustand or reducer)
    │
    ▼
Selectors → Component tree (Ink)
    │
    ▼
Key/mouse input → Actions → State store (loop)
```

Agent communication and escalation data should be persisted in `.pm/comms/` and `.pm/escalations/` directories, with the file watcher picking up changes in real time.

### 11.3 File Conventions for Communication & Escalation

```
.pm/
├── comms/
│   ├── orch-1--orch-2--session-schema.jsonl    # Inter-orch channel
│   ├── orch-1--workers--auth-debate.jsonl       # Intra-orch worker chat
│   └── ...
├── escalations/
│   ├── esc-001.json     # Escalation record (status, thread, resolution)
│   └── ...
├── agents/
│   ├── orch-1.json      # Orchestrator state (heartbeat, current epic, workers)
│   └── ...
└── epics/
    ├── E072.md           # Epic definition (existing)
    └── ...
```

Each `.jsonl` communication file is append-only, making it safe for concurrent agent writes and trivial for the file watcher to tail.

---

## 12. Accessibility & Degradation

### 12.1 NO_COLOR / TERM=dumb

When `NO_COLOR` is set or `TERM=dumb`:
- All color is removed
- Status icons fall back to ASCII: `[*]` active, `[~]` testing, `[!]` escalated, `[x]` failed, `[.]` queued, `[v]` done
- Card borders use `+`, `-`, `|` instead of box-drawing characters
- Escalation flags use `[!!!]` instead of `🔺`
- Focus is indicated by `>` prefix instead of color inversion

### 12.2 Screen Reader Considerations

While full screen reader support is out of scope for v1, the TUI should:
- Announce escalations via terminal bell (already specified)
- Provide a text-dump mode (`--dump` flag) that outputs current state as plain text to stdout, suitable for piping to accessibility tools
- Ensure all information conveyed by color is also conveyed by text (icons, labels)

### 12.3 Minimum Terminal Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Width | 80 cols | 160+ cols |
| Height | 24 rows | 40+ rows |
| Color | None (NO_COLOR) | 256-color or truecolor |
| Unicode | ASCII fallback available | Full Unicode |
| Mouse | Not required | xterm mouse protocol |

---

## 13. Configuration

All TUI configuration lives in `.pm/config.toml` under a `[tui]` section:

```toml
[tui]
default_detail_pane = false          # Start with detail pane closed
default_column_focus = "doing"       # Initial column focus on launch

[tui.orchestrators]
max_count = 5                        # Maximum orchestrator slots
auto_claim = true                    # Orchestrators auto-claim from TO DO
names = ["zeus", "hera", "athena", "apollo", "hermes"]  # Named orchestrators

[tui.escalation]
worker_exchange_limit = 3            # Max worker exchanges before auto-escalate to orch
orch_exchange_limit = 5              # Max orch exchanges before auto-escalate to human
bell_on_critical = true
bell_on_crash = true

[tui.display]
card_default_collapsed = false       # DOING cards start expanded
done_display_limit = 10              # Max DONE cards shown
timestamp_format = "relative"        # "relative" (2m ago) or "absolute" (12:34:56)
```

---

## 14. Implementation Phasing

The implementation should be phased to deliver value incrementally while managing complexity.

### Phase 1: Kanban Core (Foundation)
- Four-column layout with adaptive widths
- Epic cards in all columns with basic display
- Column navigation (`h`/`l`/`j`/`k`)
- Card selection and Detail Pane (toggle with `d`)
- Epic description rendering in Detail Pane
- Backlog → TO DO approval flow (`a` key)
- State migration from useState atoms to Zustand store
- File watcher integration for kanban state changes

### Phase 2: Agent Supervision
- DOING column enrichment: orchestrator headers, worker trees
- Worker status icons and progress bars
- Orchestrator configuration overlay (`O` key)
- Worker/orchestrator log tail in Detail Pane (`L` key)
- Kill worker (`K`), spawn/despawn workers (`+`/`-`)
- Heartbeat monitoring and stale detection

### Phase 3: Communication & Escalation
- `.pm/comms/` file convention and watcher integration
- Communication channel view in Detail Pane (`c` key)
- Escalation flag system (🔺 in title bar, cards, status bar)
- Escalation focus flow (`f` key)
- Escalation resolution UI (1/2/3/i/s keys)
- Human message injection into channels (`i` key)
- Terminal bell configuration

### Phase 4: Polish & Refinement
- Mouse click support (hit-testing for all interactive elements)
- Global search (`/`)
- Column filtering (`F`)
- Notification center (`n`)
- Narrow terminal fallback (<80 cols)
- NO_COLOR / TERM=dumb fallback
- Text-dump accessibility mode
- Done card archival (`m`)
- Comprehensive component tests (ink-testing-library)

---

## 15. Key Binding Reference Card

For quick reference, a complete binding table. This doubles as the content for the `?` help overlay.

```
GLOBAL
  ?         Help overlay (this screen)
  f / F     Next / previous escalation
  d         Toggle Detail Pane
  Tab       Cycle focus region
  /         Global search
  n         Notification center
  O         Orchestrator configuration
  Ctrl+c    Quit

KANBAN NAVIGATION
  h / l     Previous / next column
  j / k     Down / up within column
  g / G     First / last card
  Ctrl+d/u  Half-page scroll
  Enter     Drill into card / expand

BACKLOG
  a         Approve → TO DO
  r         Reject with comment
  e         Edit in $EDITOR

TO DO
  p         Reprioritize
  e         Edit in $EDITOR

DOING (Board Mode)
  Enter     Session Mode (full-screen takeover)
  c         Quick-peek comms in Detail Pane
  f         Focus next escalation on this card

SESSION MODE (full-screen, Esc to return)
  Esc       Return to Board Mode
  Tab       Cycle focus between panes
  j / k     Navigate within focused pane
  1 / 2 / 3 Switch right panel tab (Decisions, Comms, Activity)
  L         Toggle log tail for selected worker
  K         Kill selected worker
  +         Spawn new worker
  c         Open comm channel in detail pane
  i         Input mode (message injection / escalation response)
  y         Copy to clipboard

DONE
  m         Archive card

DETAIL PANE (when focused)
  j / k     Scroll line
  Ctrl+d/u  Half-page scroll
  g / G     Top / bottom
  1-4       Switch sub-view tab
  s / S     Next / prev story
  i         Input mode (comms/escalation)
  y / c     Copy to clipboard
  q         Close pane
```

---

## 16. Open Questions for Review

These are deliberate decisions left open for the reviewing agent to weigh in on:

1. **Blessed/neo-blessed vs Ink:** The current backlog (E069) flagged blessed as a potential alternative. This design is Ink-agnostic in its UX specification, but the implementation will need to choose. Ink's React model is familiar but lacks native mouse click support. Blessed provides full mouse and scroll support natively but uses an imperative API. Recommendation: stay with Ink unless Phase 4 mouse support proves intractable.

2. **Communication persistence format:** `.jsonl` (append-only log) vs SQLite (queryable). JSONL is simpler and friendlier for file watchers; SQLite enables richer queries (e.g., "show all escalations from last week"). Recommendation: start with JSONL, add SQLite indexing later if query needs arise.

3. **Orchestrator naming:** Auto-generated names (zeus, hera) vs user-assigned vs numeric IDs. Named orchestrators are more memorable in a supervisory context (research: humans track named entities better than numbered ones), but add configuration overhead. Recommendation: default to themed names, allow override in config.

4. **Worker spawn control:** Should the user be able to set per-orchestrator worker limits, or is this always the orchestrator's decision? Recommendation: orchestrator decides by default, but user can set a global `max_workers_per_orchestrator` cap in config.

5. **DONE column retention:** How long to keep completed epics visible? Recommendation: show last 10 by default, configurable, with full archive accessible via search.

---

*End of Design Definition Document*
