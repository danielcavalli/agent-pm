# Multi-Agent TUI Research Summary

**Date:** 2026-03-12
**Purpose:** Inform the architectural decisions for agent-pm v0.1.0-alpha -- an agent-aware supervisory TUI grounded in the principle that humans are the bottleneck in AI development, not the agents.
**status:** OUTDATED

---

## 1. TUI State of the Art

### 1.1 Framework Landscape

Four major TUI frameworks are actively maintained as of early 2026:

**Ratatui (Rust)** uses immediate-mode rendering where the developer owns the event loop and calls `Terminal.draw()` each frame. It provides widgets and layout primitives but is unopinionated about application architecture. Used in production by Netflix, OpenAI, AWS, and Vercel, with 2,100+ dependent crates. Best suited for maximum performance and control in Rust ecosystems.
[Source: Terminal UI: BubbleTea vs Ratatui](https://www.glukhov.org/post/2026/02/tui-frameworks-bubbletea-go-vs-ratatui-rust/)

**BubbleTea (Go)** implements The Elm Architecture (Model/Init/Update/View). The framework owns the event loop and converts input into messages for predictable state transitions. Part of the Charm ecosystem with companion libraries Bubbles (pre-built components), Lip Gloss (styling), and Huh (forms). Over 10,000 apps built with it.
[Source: Charm BubbleTea GitHub](https://github.com/charmbracelet/bubbletea)

**Textual (Python)** is a full application framework with event-driven programming, a comprehensive widget set, CSS-like styling, and grid/docking layouts. It leverages GPU-accelerated modern terminals for 60fps rendering. It is the only framework with built-in screen reader integration, monochrome mode, and color-blind themes.
[Source: Textualize Blog](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/)

**Ink (Node.js/TypeScript)** is a React renderer for the terminal. It treats stdout as a component tree of `<Box>` and `<Text>` elements, using the Yoga layout engine (Flexbox). Current version is 6.8.0. Version 6.7.0 added React concurrent rendering support and synchronized output (DEC mode 2026) to fix historical flickering. Ink is the dominant Node.js TUI framework and the one used by agent-pm.
[Source: Ink GitHub](https://github.com/vadimdemedes/ink)
[Source: Ink v6.7.0 Release Notes](https://github.com/vadimdemedes/ink/releases/tag/v6.7.0)

| Criterion | Ratatui | BubbleTea | Textual | Ink |
|---|---|---|---|---|
| Language | Rust | Go | Python | TypeScript/JS |
| Architecture | Immediate-mode | Elm (TEA) | Event-driven | React renderer |
| Learning curve | Steep | Moderate | Moderate | Low (if React) |
| Accessibility | Manual | Manual | Built-in | Manual |
| Fullscreen | Native | Native | Native | Via fullscreen-ink |

**Relevance to agent-pm:** Ink is the correct choice for this project -- it leverages existing React/TypeScript expertise, has active development, and its component model maps naturally to agent cards and status panels. The v6.7+ improvements address historical rendering concerns.

### 1.2 Design Principles

**Command Line Interface Guidelines (clig.dev)** is the most comprehensive resource for CLI/TUI design. Key principles relevant to a supervisory TUI:
- Print something within 100ms -- silence signals a broken program
- Put important information at the end of output where the eye naturally rests
- Show progress for long operations with time estimates
- Respect `NO_COLOR` environment variable and `TERM=dumb`
- Confirm before danger: mild (optional), moderate (y/yes), severe (type resource name)
- Suggest next commands to guide workflow discovery
[Source: Command Line Interface Guidelines](https://clig.dev/)

**Charm's design philosophy** centers on four questions: (1) Should this use the altscreen or inline? (2) How can we keep the user from ever wondering what key to press? (3) How should it behave in very small or very large terminals? (4) Does this really need to be a TUI? Their core insight: developer experience IS user experience -- APIs and CLIs deserve the same design care as visual interfaces.
[Source: Charm at 100K Stars](https://charm.land/blog/100k/)

**Textualize's hard-won lessons** from building Textual include: (1) "Overwrite, don't clear" to avoid blank-frame flicker -- write updates in a single call using Synchronized Output protocol. (2) Use exact arithmetic for layout math -- floating-point errors accumulate. (3) Emojis are terrible -- unreliable width calculations across terminal emulators; restrict to Unicode 9. (4) Immutable data structures simplify caching and reasoning.
[Source: 7 Things I've Learned Building a Modern TUI Framework](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/)

**Terminal interface speed** matters above all else. Brandur argues that startup and loading time should be negligible, transitions instant, and applications should build for power users. Animations waste productivity when repeated thousands of times daily.
[Source: Learning From Terminals to Design the Future of User Interfaces](https://brandur.org/interfaces)

### 1.3 Multi-Pane Patterns

Five distinct multi-pane patterns emerge from studying popular TUI applications:

**Master-detail (lazygit):** Left panels (status, branches, commits, stash) drive the right panel (diff/details). One box always has visible focus. Number keys (1-5) switch panels. All panels visible simultaneously; zoom for deep inspection. Reactive: interacting with left panels updates the right panel content.
[Source: Lazygit GitHub](https://github.com/jesseduffield/lazygit)

**Command-driven single view (k9s):** One resource type visible at a time. Command mode (`:`) switches between resource types. Forward slash for filtering. `?` for contextual help. Color-coded status indicators. Progressive disclosure through drill-down: resource list -> resource detail -> logs/events.
[Source: K9s Official](https://k9scli.io/)

**Dashboard grid (btop):** Distinct boxes for CPU, memory, disk, network, processes. Unicode Braille patterns for high-resolution graphs. Full mouse support. A "masterclass in information density, elegantly separated into distinct boxes."
[Source: btop++ Review](https://itsfoss.com/btop-plus-plus/)

**Dual-pane (midnight commander):** Two vertical directory panels. Tab toggles the active panel. F1-F10 function key bar at bottom. Pull-down menus via F9. Panels can show directory listing, text preview, or directory tree.
[Source: Linux Command Line: Midnight Commander](https://linuxcommand.org/lc3_adv_mc.php)

**Tab-based (Conduit):** Up to 10 concurrent tabs with independent contexts. Ctrl+T new tab, Ctrl+W close, Tab/Shift+Tab switch. Real-time token tracking and cost estimation per session.
[Source: Conduit](https://getconduit.sh/)

**Relevance to agent-pm:** A hybrid of master-detail (agent list driving detail view) with a collapsible agent sidebar is the recommended pattern. The agent sidebar provides at-a-glance fleet status (btop pattern), the tree panel provides project navigation (lazygit pattern), and the detail panel provides deep inspection (k9s drill-down pattern).

### 1.4 Ink Performance Model and Limits

Ink's rendering pipeline: React Component Tree -> Yoga Layout Engine (Flexbox) -> 2D Character Buffer -> ANSI Escape Sequences -> Terminal Output. Every React state change triggers full-tree traversal. The 32ms throttle prevents excessive redraws.

**Critical performance constraints:**
- Manual virtualization required -- no native ScrollView. Render only the visible slice of data.
- Keep rendered `<Text>` nodes to screen-visible count (~50 items max per list).
- Use `<Static>` for historical data that won't change.
- Avoid `console.log` -- it breaks the Ink layout.
- Synchronized output (v6.7+) wraps frame writes in DEC mode sequences to reduce flickering.
[Source: Ink Flickering Analysis](https://github.com/atxtechbro/test-ink-flickering/blob/main/INK-ANALYSIS.md)
[Source: TUI Development: Ink + React](https://combray.prose.sh/2025-12-01-tui-development)

**Multi-panel layout in Ink:** Use `useFocusManager()` for panel navigation. Tab/custom keys switch active panel. Bordered containers with focus-dependent styling signal the active panel. Flexible sizing via `flexGrow` and fixed `height` properties.

**Relevance to agent-pm:** Agent heartbeat updates (every 5-10 seconds) at 5 agents = 0.5-1.0 state changes/second. This is well within Ink's 32ms throttle. The existing 300ms debounce in `useFileWatcher` is appropriate. The main concern is detail panel content overflow -- manual scroll implementation is required, replicating the existing `Tree.tsx` scroll pattern.

### 1.5 Competitive Landscape

Five existing multi-agent TUI tools provide direct design inspiration:

**IttyBitty** uses a four-panel layout: agent list (top), Claude session (left), agent log (right), key commands (bottom). Its philosophy: make "10 agents feel like 1 agent" through integrated visibility. Shows denied tool requests in logs for transparency. Spawns Claude instances in tmux virtual terminals.
[Source: IttyBitty Agent Orchestrator](https://adamwulf.me/2026/01/itty-bitty-ai-agent-orchestrator/)

**Conduit** is tab-based with up to 10 concurrent tabs, each with an independent context. Single-keystroke agent switching. Supports Claude Code, Codex CLI, and Gemini CLI in the same interface. Real-time token tracking and cost estimation.
[Source: Conduit](https://getconduit.sh/)

**TmuxCC** provides centralized monitoring of AI agents running in tmux panes. Supports Claude Code, OpenCode, Codex CLI, and Gemini CLI.
[Source: TmuxCC GitHub](https://github.com/nyanko3141592/tmuxcc)

**Agent View** is a lightweight tmux session manager with real-time agent status detection and notifications for finished/waiting agents.
[Source: Agent View GitHub](https://github.com/Frayo44/agent-view)

**Ralph TUI** visualizes an entire agent call hierarchy in real-time with drill-down into any level. Keyboard navigation and search.
[Source: Ralph TUI](https://peerlist.io/leonardo_zanobi/articles/ralph-tui-ai-agent-orchestration-that-actually-works)

**Key lesson:** Every successful agent TUI focuses on reducing the number of things the human must actively track. IttyBitty's "10 agents feel like 1" is the target experience.

---

## 2. Multi-Agent Orchestration

### 2.1 Framework Comparison

Six major multi-agent frameworks were analyzed:

| Framework | Pattern | Human-in-Loop | Observability |
|-----------|---------|---------------|---------------|
| AutoGen | Conversational | Human proxy agent | Chat logs |
| CrewAI | Role-based teams | Hierarchical management | Role-based status |
| LangGraph | State graph | Interrupt nodes | LangSmith tracing |
| MetaGPT | Assembly line / SOP | Stage gates | Structured artifacts |
| OpenAI Agents SDK | Routines + Handoffs | Guardrail-triggered | Built-in tracing |
| Anthropic Multi-Agent | Orchestrator-worker | Lead agent escalation | Privacy-preserving tracing |

**AutoGen (Microsoft)** emphasizes natural language interactions with dynamic role-playing. Agents collaborate through structured multi-turn conversations. Supports a "human proxy agent" that participates in conversations, approves actions, or provides feedback.
[Source: CrewAI vs LangGraph vs AutoGen (DataCamp)](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)

**CrewAI** uses role-based agents inspired by real-world organizations. Three process models: sequential, hierarchical (manager delegates to workers), and consensual. Over 60% of Fortune 500 adopted CrewAI by late 2025.
[Source: Top AI Agent Frameworks (Codecademy)](https://www.codecademy.com/article/top-ai-agent-frameworks-in-2025)

**LangGraph** models workflows as directed graphs with conditional routing, parallel processing, and checkpointing. Native support for "interrupt" nodes where execution pauses for human input.
[Source: Best AI Agent Frameworks 2025 (Maxim)](https://www.getmaxim.ai/articles/top-5-ai-agent-frameworks-in-2025-a-practical-guide-for-ai-builders/)

**MetaGPT** simulates a software company: Product Manager -> Architect -> Project Manager -> Engineer -> QA. `Code = SOP(Team)` -- encodes standardized operating procedures into prompt sequences. Structured intermediate outputs significantly increase code generation success rate.
[Source: MetaGPT (arXiv)](https://arxiv.org/abs/2308.00352)
[Source: What is MetaGPT? (IBM)](https://www.ibm.com/think/topics/metagpt)

**OpenAI Agents SDK** has two primitives: Routines (instructions + tools) and Handoffs (one agent transfers conversation to another). Lightweight and controllable. Guardrails validate input/output on every tool invocation.
[Source: Orchestrating Agents (OpenAI)](https://developers.openai.com/cookbook/examples/orchestrating_agents/)

### 2.2 Orchestrator-Worker Pattern

Anthropic's multi-agent research system is the most relevant architecture. A lead agent coordinates and spawns specialized subagents in parallel. Scaling: 1 agent for fact-finding (3-10 tool calls), 2-4 for comparisons (10-15 calls each), 10+ for complex research. Multi-agent (Opus 4 lead + Sonnet 4 workers) outperformed single-agent Opus 4 by 90.2%. Cut research time by up to 90%.
[Source: How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system)

Key design principles from Anthropic's system:
1. Think like your agents -- build simulations to observe failure modes
2. Heuristics over rules -- encode strategies, not rigid instructions
3. Tool design is critical -- bad descriptions send agents down wrong paths
4. Small changes to the lead agent unpredictably affect subagent behavior
5. Self-improvement: a tool-testing agent rewrites descriptions, yielding 40% faster task completion
[Source: How Anthropic Built a Multi-Agent Research System (ByteByteGo)](https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent)

**Relevance to agent-pm:** The orchestrator-worker pattern maps directly to the existing `/pm-work-on-project` slash command, which already dispatches stories to parallel sub-agents. The TUI's role is to make this orchestration visible to the human supervisor.

### 2.3 Confidence-Based Escalation

The Dynamic Intervention Framework (DIF) from Research Square defines a three-tier confidence system:
- **Autonomous (Ccs >= 0.85):** Execute without human input
- **Async Review (0.50 < Ccs < 0.85):** Execute but flag for post-hoc audit
- **Blocked (Ccs <= 0.50):** Halt, request human intervention

Results: 85.5% of tasks decoupled from human oversight while maintaining 98.2% success rate (vs 99.1% with full HITL). Latency reduced 10x (4.8s vs 45.6s). Progressive learning via DPO fine-tuning reduced intervention rates from 21.0% to 11.5%.
[Source: Balancing autonomy and oversight in reliable agentic AI (Research Square)](https://www.researchsquare.com/article/rs-8952805/v1)

The DIF includes a "Flight Recorder" dashboard with three panels: Context Trace (chain-of-thought with highlighted reasoning), Proposal Panel (exact actions with git-style diffs), and Diagnostics Panel (explains why intervention was triggered, e.g., "Confidence Score: 42%; threshold exceeded").

**Relevance to agent-pm:** For v0.1.0-alpha, implement a simplified version: agents self-report their confidence level in escalation requests. The TUI surfaces these as attention indicators. Full confidence-based auto-routing is deferred to v0.2.0+ once real-world calibration data exists.

### 2.4 Agent Communication Protocols

Across frameworks, two communication patterns dominate:

**Shared message pool (MetaGPT):** Agents publish structured messages; others subscribe based on their role. Works well for assembly-line workflows where each stage produces artifacts for the next.

**Direct handoff (OpenAI Swarm):** One agent transfers the active conversation to another. Explicit, observable, prevents loops. Each transfer is a discrete, loggable event.

The existing agent-pm architecture uses a hybrid: cross-task comments (`.pm/comments/`) for async communication, and the execution report pipeline for structured post-task artifacts. Both patterns are already implemented.

### 2.5 Failure Recovery Patterns

Anthropic's system resumes from checkpoint rather than restarting. The lead agent saves its research plan to memory when context exceeds 200K tokens, then spawns a new instance that loads the plan. LangGraph provides built-in persistence and checkpointing -- workflows can resume from any node. OpenAI Agents SDK uses guardrails for early failure detection.

**Relevance to agent-pm:** The existing `pm work` command marks stories as `in_progress`. If an agent fails, the story remains `in_progress` and another agent can pick it up. The heartbeat mechanism proposed for v0.1.0-alpha adds visibility: if an agent's heartbeat goes stale (> 60s since last_heartbeat), the TUI can flag it as potentially failed.

---

## 3. Human-Bottleneck Design Principles

### 3.1 Cognitive Load Theory

Human working memory has an estimated capacity of only 3-5 meaningful items under optimal conditions. The sum of intrinsic (task complexity), extraneous (noise), and germane (useful decision-support) load must remain below this capacity. The unit of analysis for design is not the human or the AI in isolation but the joint cognitive system.
[Source: Overloaded minds and machines (Springer)](https://link.springer.com/article/10.1007/s10462-026-11510-z)

**Implication:** The TUI must keep the number of things requiring simultaneous human attention to 3-5 at most, even if dozens of agents are running. Aggressively reduce extraneous load (noise) and maximize germane load (useful information).

### 3.2 Supervisory Span of Control

Management research provides useful anchors for how many agents a human can supervise:
- Median team size: 5-6 per manager
- Engagement peaks at 8-9 direct reports
- Managers with 7 or fewer score 20% higher on team engagement
- Managers spending >40% on individual work struggle with larger spans
[Source: Span of Control (Gallup)](https://www.gallup.com/workplace/700718/span-control-optimal-team-size-managers.aspx)
[Source: Right Spans of Control (McKinsey)](https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/how-to-identify-the-right-spans-of-control-for-your-organization)

Anthropic's autonomy research found that only ~15% of agent decisions need human routing. Experienced users auto-approve more often but interrupt more strategically -- a shift in supervision strategy rather than abdicated oversight. Claude-initiated clarification requests exceed human interruptions, especially on complex tasks.
[Source: Measuring Agent Autonomy (Anthropic)](https://www.anthropic.com/research/measuring-agent-autonomy)

**Implication:** Target 5-9 agents per human. With good filtering, dozens can run if only 2-3 need attention at any moment. The critical variable is not total agent count but simultaneous attention demands.

### 3.3 Sheridan-Verplank Levels of Automation

The 10 Levels of Automation (1978) remain foundational:
1. Human does everything
2. Computer offers alternatives
3. Computer narrows alternatives
4. Computer suggests one
5. **Computer executes if human approves** <-- management by consent
6. **Computer executes, human can veto** <-- management by exception
7. Computer executes, informs afterward
8. Computer informs only if asked
9. Computer informs only if it decides to
10. Fully autonomous

Key problems with high automation for AI: the Out-Of-The-Loop (OOTL) problem (operators lose situational awareness, skills deteriorate, sensitivity to warnings decreases) and automation bias (operators uncritically accept AI outputs).
[Source: Human control of AI systems: from supervision to teaming (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12058881/)

**Implication:** Agent tasks should operate at different levels. Routine actions (writing tests, refactoring) at level 6-7. High-risk actions (force-push, delete, deploy) at level 5. The TUI must counteract OOTL by keeping humans aware even of autonomous actions.

### 3.4 ISA-101 Display Hierarchy

Industrial HMI (Human-Machine Interface) standards define a four-level display hierarchy:
- **Level 1 (Overview):** Entire span of responsibility at a glance. What is happening, without details.
- **Level 2 (Operating):** Normal operations. Enough to handle routine changes.
- **Level 3 (Diagnostic):** Non-routine. Sufficient for process diagnostics.
- **Level 4 (Detail):** Full raw data, historical trends, configuration.
[Source: Rockwell Automation Process HMI Style Guide](https://literature.rockwellautomation.com/idc/groups/literature/documents/wp/proces-wp023_-en-p.pdf)
[Source: Building Dashboards for Operational Visibility (AWS)](https://aws.amazon.com/builders-library/building-dashboards-for-operational-visibility/)

**Mapping to agent-pm TUI:**
- L1: Agent sidebar -- all agents, status icons, attention indicators
- L2: Project tree -- current tasks, story states, epic progress
- L3: Detail panel -- full story description, acceptance criteria, escalation details
- L4: (v0.2.0+) Raw logs, token counts, timing data

### 3.5 Calm Technology

Technology should reside mainly in the user's periphery, shifting to center of attention only when needed. It should amplify the best of technology and humanity, communicate without needing to speak, and solve problems with the minimum amount of technology required. A person's primary task should not be computing, but being human.
[Source: Calm Technology](https://calmtech.com/)
[Source: Principles of Calm Technology (Design Principles FTW)](https://www.designprinciplesftw.com/collections/principles-of-calm-technology)

**Implication:** Agents running normally should produce minimal visual noise. Only anomalies, blocks, and completions demand attention. The agent sidebar should be a calm peripheral display that shifts to foreground only when an agent needs help.

### 3.6 Management by Exception vs Consent

Two contrasting supervisory approaches:
- **Management by exception (reactive):** Human intervenes only when the system flags an anomaly. Risk: automation bias, complacency.
- **Management by consent (proactive):** Human must actively approve actions. Risk: slower, higher cognitive load.
[Source: Is Human-On-the-Loop the Best Answer? (JAPCC)](https://www.japcc.org/essays/is-human-on-the-loop-the-best-answer-for-rapid-relevant-responses/)

HBR proposes matching supervision to problem character: complicated problems (well-defined) get high autonomy; ambiguous problems (many variables) get feedback-based supervision; uncertain problems (novel) get restricted autonomy. The Waymo model: operators answer agent questions about ambiguous choices rather than controlling directly.
[Source: How Much Supervision for AI Agents? (HBR)](https://hbr.org/2025/01/how-much-supervision-should-companies-give-ai-agents)

**Implication:** Default to management by exception for routine agent work. Switch to consent for high-risk operations. Let agents ask questions (escalate) rather than requiring blanket approval.

### 3.7 Alert Fatigue Mitigation

SOC (Security Operations Center) analysts face massive alert volumes leading to fatigue, delayed responses, and high false-positive rates. Two fatigue mechanisms: cognitive overload (volume/complexity) and desensitization (repeated exposure to the same alert). A framework demonstrated 30% fatigue reduction by adapting agent autonomy based on analyst workload. Chunked information formats reduce context-switching; subtle nudges improve consistency under stress.
[Source: Alert Fatigue in Security Operations Centres (ACM)](https://dl.acm.org/doi/10.1145/3723158)
[Source: Mitigating Alert Fatigue in Cloud Monitoring (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S138912862400375X)

**Implication:** Alert fatigue is the primary risk for a multi-agent supervisory TUI. Strategies: (1) aggressively filter to only important events, (2) vary notification modality to prevent desensitization, (3) chunk information to reduce context-switching, (4) adapt notification frequency to workload.

### 3.8 Progressive Disclosure

Show users what they need when they need it. Gradually reveal more complex information as the user progresses. Implementation patterns: accordions, tabs, scrolling, modal dialogs. Benefits: reduces cognitive load, simplifies initial view, creates better understanding of primary vs secondary features.
[Source: Progressive Disclosure (NN/g)](https://www.nngroup.com/articles/progressive-disclosure/)

**Implication:** The TUI implements progressive disclosure through the ISA-101 hierarchy. L1 (sidebar) is always visible. L2/L3 (tree/detail) are revealed by navigation. Agents start as a single line in the sidebar and expand to full diagnostic detail on demand.

---

## 4. Synthesis

### 4.1 Design Implications for v0.1.0-alpha

The research converges on six concrete implications:

1. **Target 5-9 agents per human** with aggressive filtering so only 2-3 need simultaneous attention. The cognitive load limit (3-5 items) is the hard constraint; the span of control (5-9) is the design target.

2. **Use the orchestrator-worker pattern** with confidence-based escalation. The existing `/pm-work-on-project` slash command already implements this pattern. The TUI makes it visible.

3. **Implement a four-level information hierarchy** (fleet overview / agent focus / diagnostic / debug). Only L1-L3 are needed for v0.1.0-alpha.

4. **Default to calm/peripheral awareness** with attention-demanding signals only for anomalies. The agent sidebar should be a quiet peripheral display.

5. **Support both exception-based and consent-based interaction modes.** Default to exception for routine work; consent for high-risk operations.

6. **Design async-first.** Agents work independently and queue requests for human attention. The human processes the queue when they choose.

### 4.2 The Observer Model

For v0.1.0-alpha, the TUI observes agents rather than spawning them. Agents run externally (in tmux, as Claude Code sessions, as background processes) and register by writing heartbeat files to `.pm/agents/`. This is the right architectural choice because:

- It preserves the "files are the API" design principle -- the filesystem IS the communication layer.
- It works with any agent runtime. No coupling to a specific process management approach.
- The existing `useFileWatcher` hook already monitors `.pm/` for YAML changes. Extending to `.pm/agents/` is trivial.
- It matches the calm technology principle: agents check in periodically; the TUI observes passively.
- Direct process management is a v0.2.0+ concern that requires significant infrastructure (process lifecycle, signal handling, output capture, crash recovery).

### 4.3 Information Hierarchy for Agent Supervision

Mapping ISA-101 to the three-panel TUI layout:

```
+---L1: Fleet Overview---+---L2: Project Navigation---+---L3: Diagnostic---+
| Agent Sidebar           | Project Tree                | Detail Panel       |
| All agents at a glance  | Epics, stories, progress    | Full item details  |
| Status icons            | Expand/collapse             | Scrollable content |
| Attention indicators    | Filter by status            | Escalation details |
+-------------------------+-----------------------------+--------------------+
```

The human's natural workflow:
1. Glance at the sidebar -- is anything red/blocked? (L1, peripheral)
2. If yes, navigate to the agent or its task (L2, focused)
3. Read the escalation details, make a decision (L3, active)
4. Return to peripheral monitoring (L1)

This workflow keeps the human in a calm peripheral state 80-90% of the time, with active engagement only when needed. This matches the DIF finding that 85.5% of tasks can be decoupled from human oversight.

### 4.4 Interaction Pattern Recommendations

**Navigation:** vim-style j/k for all panels. Tab cycles panel focus. Arrow keys as alternative. `?` for help. This is the universal TUI convention. Agent-pm's current arrow-key-only navigation is non-standard.

**Escalation handling:** Agent writes escalation to its state file. TUI highlights it. Human navigates to it, reads context, responds. Response written to filesystem. Agent polls. This is the Q&A model (HBR/Waymo) implemented through the existing file-based API.

**Status communication:** Color-coded agent states (green=active, red=needs_attention, gray=idle) with symbol backup for accessibility. Agent count in status bar for ambient awareness.

---

## 5. Open Questions

1. **Heartbeat staleness threshold:** If an agent's heartbeat is older than N seconds, should the TUI flag it as "stale/possibly crashed"? What is the right N? This needs real-world calibration.

2. **Escalation response format:** What structure should human responses take? Free-text? Multiple-choice from agent-provided options? Both? The right answer depends on how agents can parse responses.

3. **Multi-user scenarios:** If two humans are supervising the same `.pm/` directory simultaneously (e.g., two tmux sessions), should the TUI detect this? Probably not for v0.1.0-alpha, but it affects the advisory locking design.

4. **Agent identity stability:** If an agent crashes and restarts, does it get a new agent_id or reuse the old one? This affects heartbeat tracking and escalation response matching.

5. **Scalability ceiling:** At what agent count does the sidebar become unusable? 10? 20? 50? The research suggests 5-9 is the effective range, but the UI should degrade gracefully beyond that.

6. **Integration with existing observability:** Should the TUI consume OpenTelemetry traces from agent frameworks? This is likely a v0.2.0+ concern but worth considering in the schema design to avoid breaking changes later.
[Source: AI Agent Observability Standards (OpenTelemetry)](https://opentelemetry.io/blog/2025/ai-agent-observability/)

7. **Confidence calibration:** The DIF's confidence thresholds (0.85/0.50) were calibrated on specific workloads. How should agent-pm discover the right thresholds for coding agent tasks? Self-reported confidence from LLMs is notoriously miscalibrated.

8. **Accessibility:** Ink has no built-in screen reader support. Should v0.1.0-alpha include `--json` output mode for the TUI's agent status view? This would make the data accessible to screen readers and scripting tools.
[Source: Accessibility of CLIs (ACM CHI 2021)](https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445544)
