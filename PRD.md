# PRD: Project Management Tool for AI Agents

**Project Code:** PM  
**Status:** Active  
**Created:** 2026-03-09  
**Updated:** 2026-03-10  
**Owner:** Dan

---

## 1. Overview

A file-based project management tool that enables AI agents operating inside **OpenCode** and **Claude Code** to autonomously create, track, and execute software projects — **from any working directory, in any repository**. The tool defines a structured schema for Projects, Epics, and Stories stored as YAML files — readable and writable by both humans and AI agents — with a globally-installed TypeScript CLI, MCP tools, and global slash commands as the primary interfaces.

**Supported Platforms:** Linux, macOS  
**First-Class Clients:** OpenCode, Claude Code

A key differentiator is that agents can **autonomously file Epics and Stories for future work** they discover during unrelated tasks. An agent fixing a bug in one repository can notice a performance issue and file it as a Story in PM without leaving its current context.

---

## 2. Problem Statement

AI agents in OpenCode lack a shared, structured mechanism to:

- Define and track multi-project engineering work
- Break large system designs into actionable milestones
- Maintain execution state across sessions
- Delegate and sequence work in a way other agents can pick up
- **Capture discovered work opportunistically** — agents regularly identify potential issues, tech debt, and improvements while working on unrelated tasks, but have no way to record them for later
- **Access project management from any context** — the tool must be usable regardless of which repository the agent is currently working in
- **Work across AI coding tools** — the solution must not be locked to a single agent runtime; both OpenCode and Claude Code are first-class citizens

Without this, work is ephemeral, context is lost between sessions, and discovered issues fall through the cracks.

---

## 3. Goals

| Goal                            | Description                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Global Availability**         | The CLI and all PM workflows must be accessible from any directory on the system, not just from inside the project-management repo                     |
| **Autonomous Filing**           | Agents must be able to create Epics and Stories from any project context via OpenCode custom tools, without user intervention or switching directories |
| **Structured Project Creation** | Auto-generate a project code and scaffold a full project definition from a natural language brief                                                      |
| **Epic & Story Decomposition**  | Allow agents to break milestones into epics, and epics into prioritized stories with acceptance criteria                                               |
| **Execution State**             | Track status (backlog / in_progress / done / cancelled) at every level                                                                                 |
| **Agent-First Interface**       | All data is stored as plain YAML files that agents can read, write, and reason about directly                                                          |
| **Slash Command Interface**     | Global slash commands as the primary UX for prompting agents into PM workflows (available in both OpenCode and Claude Code)                            |
| **CLI Interface**               | A globally-installed TypeScript CLI (`pm`) for programmatic creation, validation, and status queries                                                   |
| **MCP Tool Interface**          | An MCP server exposing PM operations as tools, providing a universal interface for both OpenCode and Claude Code agents in every session               |

### Non-Goals

- No UI (web or desktop)
- No authentication or multi-user access control
- No external integrations (Jira, Linear, GitHub Issues) in v1
- No real-time collaboration
- No automatic filing without agent judgment — agents decide what to file, not event triggers
- No Windows support — Linux and macOS only
- No support for AI coding tools other than OpenCode and Claude Code

---

## 4. Architecture

The system has three layers: a **data layer** (YAML files in a global data directory), a **CLI layer** (globally-installed `pm` binary), and an **integration layer** (MCP server, global slash commands, and AGENTS.md rules that make PM available to every agent session in both OpenCode and Claude Code).

```
~/.pm/                                   # Global data directory (PM_HOME)
├── projects/
│   ├── index.yaml                       # Auto-maintained project index
│   └── {PROJECT_CODE}/
│       ├── project.yaml
│       └── epics/
│           └── E{NNN}-{slug}.yaml

project-management/                      # Source repo (development only)
├── PRD.md                               # This document
├── package.json                         # TypeScript CLI, "bin": { "pm": ... }
├── tsconfig.json
├── src/
│   ├── cli.ts                           # CLI entry (commander.js)
│   ├── mcp-server.ts                    # MCP server entry (universal tool interface)
│   ├── tui/
│   │   ├── index.tsx                    # ink app entry point (pm tui)
│   │   ├── components/
│   │   │   ├── Tree.tsx                 # Navigable project/epic/story tree
│   │   │   ├── DetailPanel.tsx          # Selected item details
│   │   │   └── StatusBar.tsx            # Bottom bar: code, filter, keybinds
│   │   └── hooks/
│   │       ├── useProjectTree.ts        # Builds in-memory tree from YAML files
│   │       └── useFileWatcher.ts        # Watches projects/ and triggers reload
│   ├── schemas/
│   │   ├── project.schema.ts            # Zod schemas + TS types
│   │   ├── epic.schema.ts
│   │   └── story.schema.ts
│   ├── commands/
│   │   ├── init.ts                      # pm init
│   │   ├── epic.ts                      # pm epic
│   │   ├── story.ts                     # pm story
│   │   ├── work.ts                      # pm work
│   │   ├── prioritize.ts               # pm prioritize
│   │   └── status.ts                    # pm status
│   └── lib/
│       ├── fs.ts                        # YAML read/write helpers
│       ├── codes.ts                     # ID generation, data dir resolution
│       └── index.ts                     # Project/Epic/Story index helpers
└── install/                             # Global installation assets
    ├── commands/                         # Canonical slash commands (both clients)
    │   ├── pm-create-project.md
    │   ├── pm-add-epic.md
    │   ├── pm-add-story.md
    │   ├── pm-work-on.md
    │   ├── pm-prioritize.md
    │   ├── pm-status.md
    │   ├── pm-refine-epic.md
    │   ├── pm-work-on-project.md
    │   ├── pm-audit.md
    │   └── pm-implement.md
    ├── agents-rules.md                   # Autonomous filing rules template
    └── install.sh                        # Installer: npm link + configure clients
```

### Design Principles

1. **Files are the API.** Agents read and write YAML files directly. The CLI is a convenience wrapper with validation.
2. **Flat over nested.** Epics are separate files; stories live inside epic files. Projects are top-level directories.
3. **Codes are stable identifiers.** `PM-E001-S003` uniquely identifies a story across all agents and sessions.
4. **Status is the source of truth.** Agents update story status as they work. No external state server needed.
5. **Global by default.** The data directory, CLI, MCP tools, and commands all resolve to fixed global paths — never relative to `cwd()`.
6. **Available everywhere.** An agent in any repository can read PM state and file new work items without switching context.
7. **Client-agnostic.** The MCP server provides a universal tool interface that works identically in OpenCode and Claude Code. Slash commands are installed to both clients from a single canonical source.

---

## 5. Data Models

### 5.1 Project (`project.yaml`)

```yaml
code: PM # 2-6 uppercase letters, unique across repo
name: Project Management for AI Agents
description: >
  One paragraph description of what this project is and does.
vision: >
  The north star goal: what does success look like?
status: active # active | paused | complete | archived
created_at: "2026-03-09"
tech_stack:
  - TypeScript
  - Node.js
  - YAML
architecture:
  pattern: cli-tool
  storage: yaml-files
  primary_interface: slash-commands
notes: >
  Optional freeform notes, constraints, decisions.
```

**Validation rules:**

- `code` must match `/^[A-Z]{2,6}$/`
- `code` must be unique across `projects/`
- `status` must be one of `active | paused | complete | archived`

---

### 5.2 Epic (`epics/E{NNN}-{slug}.yaml`)

```yaml
id: E001
code: PM-E001
title: Foundation & Core Infrastructure
description: >
  What this epic covers and why it exists.
status: backlog # backlog | in_progress | done | cancelled
priority: high # high | medium | low
created_at: "2026-03-09"
stories:
  - id: S001
    code: PM-E001-S001
    title: Define Zod schemas and TypeScript types
    description: >
      Create Zod schemas for Project, Epic, Story entities.
      Export TypeScript types. Wire up validation helpers.
    acceptance_criteria:
      - Zod schema for Project, Epic, Story all validate correct fixtures
      - Invalid fixtures are rejected with clear error messages
      - TypeScript types are exported from a single index
    status: backlog # backlog | in_progress | done | cancelled
    priority: high
    story_points: 3 # 1 | 2 | 3 | 5 | 8
    notes: ""
```

**Validation rules:**

- `id` must match `/^E\d{3}$/`
- `code` must be `{PROJECT_CODE}-{id}`
- Story `code` must be `{EPIC_CODE}-S{NNN}`
- `story_points` must be one of `1 | 2 | 3 | 5 | 8`
- Story IDs must be unique within an epic

---

### 5.3 Index (`projects/index.yaml`)

Auto-maintained by the CLI. Agents can read for a quick overview.

```yaml
projects:
  - code: PM
    name: Project Management for AI Agents
    status: active
    epic_count: 3
    story_count: 12
    stories_done: 2
    last_updated: "2026-03-09"
```

---

## 6. Global Installation & Data Directory

### Data Directory

All project data lives in a **fixed global directory** that does not depend on the current working directory. The default is `~/.pm/`, overridable via the `PM_HOME` environment variable.

```
Resolution order:
1. PM_HOME environment variable (if set)
2. ~/.pm/                        (default)
```

The `getProjectsDir()` function in `lib/codes.ts` resolves to `$PM_HOME/projects/` (or `~/.pm/projects/`). It must **never** fall back to `process.cwd()`.

### CLI Installation

The `pm` binary must be available as a global command:

```bash
# From the project-management repo:
npm install -g .

# Or via npm link during development:
npm link
```

After installation, `pm` is on `$PATH` and works from any directory:

```bash
# These all work from any directory:
pm status
pm epic add PM --title "New feature"
pm story add PM-E005 --title "Fix edge case" --points 2
```

### Client Integration Installation

Slash commands and MCP tools are installed for all detected clients (OpenCode, Claude Code) so PM is available in every session regardless of the current project:

```bash
# install.sh performs:
# 1. npm install -g .                          (global pm binary)
# 2. Detect available clients (OpenCode, Claude Code)
# 3. Register MCP server with each detected client:
#    - OpenCode: add to ~/.config/opencode/opencode.json mcp block
#    - Claude Code: claude mcp add --scope user pm-tools node dist/pm-mcp-server.js
# 4. Copy install/commands/* to each client's commands directory:
#    - OpenCode: ~/.config/opencode/commands/
#    - Claude Code: ~/.claude/commands/
# 5. Append PM rules to each client's agent instructions (if not already present):
#    - OpenCode: ~/.config/opencode/AGENTS.md
#    - Claude Code: ~/.claude/AGENTS.md
```

After installation:

- `pm` CLI is on `$PATH`
- `/pm-*` slash commands are available in every OpenCode and Claude Code session
- `pm_epic_add`, `pm_story_add`, `pm_status` MCP tools are available to every agent
- AGENTS.md rules instruct agents when and how to file discovered work

### Migration from v1

Existing data in `project-management/projects/` should be moved to `~/.pm/projects/`:

```bash
pm migrate    # Copies projects/ to ~/.pm/projects/ and updates index
```

---

## 7. Client Integration Layer

This section defines how PM integrates into AI coding tools so that **every agent in every session** has access to PM functionality. Both **OpenCode** and **Claude Code** are first-class clients.

### 7.1 MCP Server (Universal Tool Interface)

The MCP (Model Context Protocol) server is the **single universal mechanism** for agent tool access. It replaces the previous `@opencode-ai/plugin` custom tools approach with a standard protocol that works identically in both OpenCode and Claude Code.

The server is implemented in `src/mcp-server.ts`, compiled to `dist/pm-mcp-server.js`, and registered with each client during installation. It exposes three tools over the MCP stdio transport:

**`pm_status`** — Show current project management status. Use this to understand what projects exist, what work is in progress, and what's in the backlog before filing new items.

```json
{
  "name": "pm_status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "project": {
        "type": "string",
        "description": "Project code (optional — omit for all projects)"
      }
    }
  }
}
```

**`pm_epic_add`** — File a new epic. Use when you discover a significant area of work (new feature, major refactor, systemic issue).

```json
{
  "name": "pm_epic_add",
  "inputSchema": {
    "type": "object",
    "properties": {
      "project": {
        "type": "string",
        "description": "Project code, e.g. 'PM', 'MYAPP'"
      },
      "title": {
        "type": "string",
        "description": "Epic title — concise, actionable"
      },
      "description": {
        "type": "string",
        "description": "What this epic covers and why it matters. 1-3 sentences."
      },
      "priority": {
        "type": "string",
        "enum": ["high", "medium", "low"],
        "default": "medium"
      }
    },
    "required": ["project", "title", "description"]
  }
}
```

**`pm_story_add`** — File a new story to an existing epic. Use when you discover a specific, actionable piece of work.

```json
{
  "name": "pm_story_add",
  "inputSchema": {
    "type": "object",
    "properties": {
      "epic": { "type": "string", "description": "Epic code, e.g. 'PM-E001'" },
      "title": {
        "type": "string",
        "description": "Story title — specific and actionable"
      },
      "description": {
        "type": "string",
        "description": "What needs to be done and why"
      },
      "points": {
        "type": "string",
        "enum": ["1", "2", "3", "5", "8"],
        "default": "3"
      },
      "priority": {
        "type": "string",
        "enum": ["high", "medium", "low"],
        "default": "medium"
      },
      "criteria": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Acceptance criteria items"
      }
    },
    "required": ["epic", "title", "description"]
  }
}
```

Each tool invokes the `pm` CLI via Node's `child_process.spawnSync`. This maintains clean separation between the MCP protocol layer and the CLI implementation.

**Client registration:**

- **OpenCode:** Configured in `~/.config/opencode/opencode.json` under the `mcp` block
- **Claude Code:** Registered via `claude mcp add --scope user pm-tools node dist/pm-mcp-server.js`

### 7.2 Global Slash Commands

Slash commands are stored canonically in `install/commands/` and copied to each client's commands directory during installation:

- **OpenCode:** `~/.config/opencode/commands/`
- **Claude Code:** `~/.claude/commands/`

They are available in every session regardless of the current working directory, and their content is identical across clients. All commands invoke the `pm` CLI directly (not `npm run pm --`), since it is installed globally.

The full list of slash commands remains the same:

| Command                      | Purpose                     |
| ---------------------------- | --------------------------- |
| `/pm-create-project`         | Create a new project        |
| `/pm-add-epic`               | Add an epic interactively   |
| `/pm-add-story`              | Add a story interactively   |
| `/pm-work-on [code]`         | Execute a single story      |
| `/pm-prioritize [code]`      | Re-prioritize stories       |
| `/pm-status [code]`          | Show status report          |
| `/pm-refine-epic [code]`     | Plan story decomposition    |
| `/pm-work-on-project [code]` | Orchestrate all stories     |
| `/pm-audit [code]`           | Audit implementation vs PRD |
| `/pm-implement`              | Bootstrap implementation    |

### 7.3 Global Agent Rules (AGENTS.md)

The installer appends PM-specific rules to each client's agent instructions file:

- **OpenCode:** `~/.config/opencode/AGENTS.md`
- **Claude Code:** `~/.claude/AGENTS.md`

These rules instruct agents to **autonomously file discovered work** using the PM MCP tools:

```markdown
## Project Management — Autonomous Filing

You have access to a project management system via the `pm_epic_add`, `pm_story_add`,
and `pm_status` tools. Use these to capture work you discover during your tasks.

### When to file

- You discover a **bug or regression** unrelated to your current task
- You notice **tech debt** (duplicated code, missing error handling, outdated patterns)
- You identify a **missing feature** or **improvement opportunity** that is out of scope
- You find **missing or inadequate test coverage** in code you're reading
- You encounter a **performance concern** that warrants investigation

### When NOT to file

- The issue is directly related to your current task (just fix it)
- The issue is trivial and can be fixed in under 2 minutes (just fix it)
- You're unsure whether it's actually a problem (mention it to the user instead)

### How to file

1. Run `pm_status` to see existing projects and find the right project code
2. Determine whether this is a new epic (large theme) or a new story (specific task)
3. For stories: identify the most relevant existing epic, or file an epic first
4. Use `pm_story_add` or `pm_epic_add` with a clear, actionable title and description
5. Continue your current task — do not switch context to work on the filed item
```

### 7.4 Plugin Hook (Deprecated — OpenCode Only)

> **Note:** The `@opencode-ai/plugin` custom tools approach (`install/opencode/tools/pm.ts`) is deprecated in favor of the MCP server (Section 7.1). The plugin hook below was an optional enhancement for OpenCode's compaction lifecycle and may be migrated to an MCP-compatible approach in the future.

An OpenCode plugin can optionally enhance the autonomous filing workflow with a `session.idle` hook that reminds agents to review their findings:

```typescript
// ~/.config/opencode/plugins/pm-reminder.ts
import type { Plugin } from "@opencode-ai/plugin";

export const PmReminderPlugin: Plugin = async ({ client }) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(`## Project Management Context
If you discovered any bugs, tech debt, missing tests, or improvement opportunities
during this session that you did not file, consider using pm_story_add or pm_epic_add
to capture them before context is lost.`);
    },
  };
};
```

This is optional and complementary — the custom tools + AGENTS.md rules are the primary mechanism.

---

## 8. CLI Interface

The CLI is invoked as `pm <command>` from any directory. The `pm` binary is installed globally via `npm install -g`.

### `pm init`

```
pm init --name "My App" --code MYAPP --description "..."
```

- Validates the code doesn't already exist
- Creates `$PM_HOME/projects/MYAPP/project.yaml`
- Creates `$PM_HOME/projects/MYAPP/epics/` directory
- Updates `$PM_HOME/projects/index.yaml`
- Outputs the created project code

### `pm epic add <PROJECT_CODE>`

```
pm epic add PM --title "Authentication System" --description "..."
```

- Auto-assigns next available epic number (`E001`, `E002`, ...)
- Creates `projects/PM/epics/E001-authentication-system.yaml`
- Sets status to `backlog`

### `pm epic list <PROJECT_CODE>`

```
pm epic list PM
```

- Lists all epics for a project with status and story counts

### `pm story add <EPIC_CODE>`

```
pm story add PM-E001 --title "JWT middleware" --description "..." --points 3
```

- Appends a new story to the epic's YAML file
- Auto-assigns next story number (`S001`, `S002`, ...)

### `pm story list <EPIC_CODE>`

```
pm story list PM-E001
```

- Lists all stories with status and priority

### `pm story update <STORY_CODE>`

```
pm story update PM-E001-S001 --status in_progress
pm story update PM-E001-S001 --status done
```

### `pm prioritize <PROJECT_CODE>`

```
pm prioritize PM --epic E001 --strategy "business-value"
```

- Accepts a freeform strategy string (passed to agent as context)
- This command primarily serves as a signal to an agent to re-order stories

### `pm status [PROJECT_CODE]`

```
pm status          # all projects summary
pm status PM       # full breakdown for PM
```

- Outputs a summary table with status across all levels

### `pm work <STORY_CODE>`

```
pm work PM-E001-S001
```

- Reads and prints the full story definition (title, description, acceptance criteria, status)
- Marks the story as `in_progress`
- Returns all context an agent needs to begin executing

### `pm migrate`

```
pm migrate [--source <path>]
```

- Copies project data from a legacy location (default: `./projects/`) to `$PM_HOME/projects/`
- Skips projects that already exist in the target
- Rebuilds the global index after migration
- Prints a summary of migrated projects

---

## 9. Slash Commands

Slash commands are installed globally for both clients as Markdown files. Each command contains a system prompt that primes the agent to perform a specific PM workflow. They are available in every session regardless of the current working directory.

- **Source of truth:** `install/commands/` in the project-management repo
- **OpenCode install path:** `~/.config/opencode/commands/`
- **Claude Code install path:** `~/.claude/commands/`

All commands invoke the `pm` CLI directly (not `npm run pm --`), since it is installed globally.

### `/pm-create-project`

Prompts the agent to gather project information and call `pm init`. Workflow:

1. Ask for project name, description, vision, tech stack, and architecture intent
2. Suggest a project code (derived from name)
3. Call `pm init` with gathered information
4. Propose an initial set of epics based on the project description
5. Offer to immediately create those epics

### `/pm-add-epic`

1. Ask which project
2. Ask for epic title and description
3. Call `pm epic add`
4. Offer to immediately decompose into stories

### `/pm-add-story`

1. Ask which epic
2. Gather title, description, acceptance criteria, story points
3. Call `pm story add`

### `/pm-prioritize`

1. Ask which project/epic to prioritize
2. Ask for prioritization strategy (e.g., "by risk", "by business value", "unblock epic E002")
3. Read current stories
4. Re-order stories in the YAML file by rewriting priorities
5. Output the new order with reasoning

### `/pm-work-on`

1. Accept an optional story code argument (e.g., `/pm-work-on PM-E001-S001`)
2. If no code given, call `pm status` and suggest the next highest-priority backlog story
3. Call `pm work <STORY_CODE>` to load context and mark in_progress
4. Execute the story based on its description and acceptance criteria
5. On completion, call `pm story update <STORY_CODE> --status done`
6. Offer to continue to the next story

### `/pm-status`

1. Call `pm status`
2. Present a clean summary of all projects and highlight blockers

---

## 10. Agent Workflows

### Workflow A: New Project from Brief

```
User: "Create a new project for a CLI tool that syncs dotfiles across machines"

Agent:
1. Infers: name="Dotfile Sync", code="DOTS"
2. Calls: pm init --name "Dotfile Sync" --code DOTS --description "..."
3. Proposes 3-4 epics (Foundation, Core Sync, Conflict Resolution, CLI Polish)
4. Creates epics via pm epic add
5. Decomposes each epic into 3-5 stories
6. Creates stories via pm story add
7. Outputs: "Project DOTS created with 4 epics and 14 stories"
```

### Workflow B: Work on Next Story

```
User: "Work on the next story in PM"

Agent:
1. Calls: pm status PM
2. Identifies PM-E001-S001 as next backlog/high priority
3. Calls: pm work PM-E001-S001
4. Reads acceptance criteria
5. Executes the work (file edits, commands, etc.)
6. Verifies acceptance criteria are met
7. Calls: pm story update PM-E001-S001 --status done
8. Reports completion and offers to continue
```

### Workflow C: Re-prioritize an Epic

```
User: "PM-E002 is now more urgent than E001, adjust priorities"

Agent:
1. Reads PM-E001 and PM-E002 yaml files
2. Updates story priorities in E002 to high
3. Optionally: reorders stories within epics
4. Reports new priority ordering with rationale
```

### Workflow D: Autonomous Filing from Another Project

This is the key new workflow. An agent working in a completely different codebase discovers an issue and files it to PM without any user prompt:

```
Agent is working on project "webapp" fixing a login bug.
While reading the auth module, it notices the password hashing uses MD5.

Agent (internally):
1. Recognizes this is a security concern worth tracking
2. Calls pm_status tool to check existing projects
3. Sees project "WEBAPP" exists with epic WEBAPP-E003 "Security Hardening"
4. Calls pm_story_add tool:
   - epic: "WEBAPP-E003"
   - title: "Replace MD5 password hashing with bcrypt"
   - description: "The auth module at src/auth/hash.ts uses MD5 for password
     hashing. MD5 is cryptographically broken and unsuitable for password
     storage. Should migrate to bcrypt or argon2."
   - priority: "high"
   - points: "3"
   - criteria: ["Password hashing uses bcrypt or argon2",
                "Existing password hashes are migrated on next login",
                "All auth tests pass with the new hashing"]
5. Logs: "Filed WEBAPP-E003-S004: Replace MD5 password hashing with bcrypt"
6. Continues working on the original login bug
```

The agent files the story and immediately returns to its current task. No context switch, no user intervention.

### Workflow E: Autonomous Filing When No Project Exists

If an agent discovers an issue but no relevant project exists, it can create one:

```
Agent is working on a personal script and discovers that the dotfiles repo
has no automated backup mechanism.

Agent (internally):
1. Calls pm_status tool — no "DOTS" or "BACKUP" project exists
2. This is significant enough to warrant a project, not just a story
3. Mentions to the user: "I noticed your dotfiles have no backup mechanism.
   I've filed a new project for this."
4. Calls: pm init --name "Dotfiles Backup" --code DOTS --description "..."
5. Calls pm_epic_add: "Automated Backup Pipeline"
6. Calls pm_story_add for 2-3 initial stories
7. Continues original task
```

Note: Creating a new _project_ (vs. adding to an existing one) should always include a brief mention to the user, since it's a higher-impact action.

---

## 11. Interactive TUI Dashboard (`pm tui`)

Run in a split tmux pane or second terminal window alongside OpenCode to get a live project board while prompting agents in the main pane.

```
pm tui
```

### Layout

```
┌─ Projects ──────────────────┬─ Detail ─────────────────────────────────┐
│                             │                                          │
│  ▶ PM  Project Management   │  PM-E001-S002                            │
│    ● E001  Foundation       │  Define Zod schemas and TypeScript types │
│      ○ S001  Init TS proj   │                                          │
│    ► S002  Zod schemas      │  Status:   backlog    Points: 3          │
│      ○ S003  YAML I/O       │  Priority: high                          │
│      ○ S004  Code utils     │                                          │
│    ○ E002  CLI              │  Description:                            │
│    ○ E003  Slash commands   │  Create Zod schemas for Project, Epic,   │
│                             │  Story entities. Export TypeScript types. │
│                             │                                          │
│                             │  Acceptance Criteria:                    │
│                             │  1. ProjectSchema validates correct fix.. │
│                             │  2. Invalid fixtures are rejected with.. │
│                             │  3. TypeScript types exported from index  │
│                             │                                          │
├─────────────────────────────┴──────────────────────────────────────────┤
│  PM-E001-S002  [All]  ↑↓ navigate  ↵ expand  f filter  / search  c copy  q quit │
└────────────────────────────────────────────────────────────────────────┘
```

### Keyboard shortcuts

| Key        | Action                                           |
| ---------- | ------------------------------------------------ |
| `↑` / `↓`  | Navigate tree                                    |
| `Enter`    | Expand/collapse Epic or Project node             |
| `f`        | Cycle filter: All → Backlog → In Progress → Done |
| `/`        | Open inline search (filter by title)             |
| `Escape`   | Clear filter/search                              |
| `c` or `y` | Copy current item code to clipboard              |
| `q`        | Quit                                             |

### Live reload

The TUI watches `~/.pm/projects/**/*.yaml` for file changes. When an agent updates a story status (e.g. marks `in_progress` -> `done`), the tree updates within ~1 second. The cursor holds position on the selected item across reloads.

---

## 12. Naming Conventions

| Entity        | Format                      | Example                |
| ------------- | --------------------------- | ---------------------- |
| Project Code  | `[A-Z]{2,6}`                | `PM`, `DOTS`, `MYAPP`  |
| Epic Code     | `{PROJECT}-E{NNN}`          | `PM-E001`              |
| Story Code    | `{EPIC}-S{NNN}`             | `PM-E001-S003`         |
| Epic filename | `E{NNN}-{kebab-slug}.yaml`  | `E001-foundation.yaml` |
| Project dir   | `$PM_HOME/projects/{CODE}/` | `~/.pm/projects/PM/`   |

---

## 13. Implementation Roadmap

The project tracks itself. All epics and stories are defined in `~/.pm/projects/PM/`.

### Completed (v1)

| Epic    | Title                            | Priority |
| ------- | -------------------------------- | -------- |
| PM-E001 | Foundation & Core Infrastructure | High     |
| PM-E002 | CLI Implementation               | High     |
| PM-E003 | OpenCode Slash Commands          | High     |
| PM-E004 | Validation & Error Handling      | Medium   |
| PM-E005 | Index & Status Reporting         | Medium   |
| PM-E006 | Interactive TUI Dashboard        | High     |

### Completed (v2 — Global + Autonomous Filing)

| Epic    | Title                                       | Priority |
| ------- | ------------------------------------------- | -------- |
| PM-E013 | Global Data Directory (`PM_HOME`)           | High     |
| PM-E014 | Global CLI Installation                     | High     |
| PM-E015 | OpenCode Custom Tools for Autonomous Filing | High     |
| PM-E016 | Global Slash Command Installation           | Medium   |
| PM-E017 | AGENTS.md Rules & Plugin Hook               | Medium   |
| PM-E018 | Migration Tooling (v1 -> v2)                | Medium   |

### New (v2.1 — Multi-Client + MCP)

| Epic    | Title                                       | Priority |
| ------- | ------------------------------------------- | -------- |
| PM-E020 | Unified Command Directory                   | High     |
| PM-E021 | PM MCP Server — Universal Tool Interface    | High     |
| PM-E022 | Claude Code First-Class Verification        | Medium   |
| PM-E023 | Open Source Documentation                   | Medium   |
| PM-E024 | Status Command Enhancements & Data Hygiene  | Low      |
| PM-E025 | Slash Command v2 Content Cleanup            | High     |
| PM-E026 | pm-implement.md v2 Rewrite                  | High     |
| PM-E027 | Legacy Custom Tools & Project-Local Cleanup | High     |
| PM-E028 | Unified Installation Experience             | High     |
| PM-E029 | Source Code & Build Legacy Cleanup          | Low      |

#### PM-E013: Global Data Directory (Complete)

- S001: Replace `process.cwd()/projects` with `PM_HOME` resolution in `getProjectsDir()`
- S002: Default `PM_HOME` to `~/.pm/` using `os.homedir()`
- S003: Create `~/.pm/projects/` on first CLI invocation if it doesn't exist
- S004: Update all tests to use `PM_HOME` env var (already uses `PROJECTS_DIR`)
- S005: Update TUI file watcher to watch `$PM_HOME/projects/`

#### PM-E014: Global CLI Installation (Complete)

- S001: Ensure `package.json` `bin` field is correct for global install
- S002: Add `#!/usr/bin/env node` shebang to CLI entry point
- S003: Test `npm install -g .` and `npm link` workflows
- S004: Create `install.sh` script that installs CLI + OpenCode assets

#### PM-E015: OpenCode Custom Tools for Autonomous Filing (Complete — Deprecated by MCP)

> **Note:** These custom tools used `@opencode-ai/plugin` and are being replaced by the MCP server (PM-E021). They remain functional but will be removed by PM-E027.

- S001: Create `install/opencode/tools/pm.ts` with `epic_add`, `story_add`, `status` tools
- S002: Ensure tools call `pm` CLI (not import TS modules) for clean separation
- S003: Add tool descriptions that guide agents on when/how to file items
- S004: Test tools work from a different project directory

#### PM-E016: Global Slash Command Installation (Complete)

- S001: Copy all `.opencode/commands/` to `install/opencode/commands/`
- S002: Replace all `npm run pm --` references with plain `pm`
- S003: Update `install.sh` to symlink/copy commands to `~/.config/opencode/commands/`
- S004: Verify commands don't conflict with existing global commands

#### PM-E017: AGENTS.md Rules & Plugin Hook (Complete)

- S001: Write PM filing rules for `~/.config/opencode/AGENTS.md`
- S002: Create optional `pm-reminder` compaction plugin
- S003: Test that agents in unrelated projects can see and use PM tools
- S004: Validate that agents follow the "when to file / when not to file" guidelines

#### PM-E018: Migration Tooling (Complete)

- S001: Implement `pm migrate` command
- S002: Handle duplicate project codes gracefully
- S003: Rebuild index after migration

#### v2.1 Epics (PM-E020 through PM-E029)

Detailed story breakdowns for v2.1 epics are tracked in `~/.pm/projects/PM/epics/` and viewable via `pm status PM`.

---

## 14. Acceptance Criteria

### v1 (Complete)

- [x] An agent can create a new project with a single prompt
- [x] An agent can decompose a project into epics and stories
- [x] An agent can pick up the next story and execute it
- [x] All data is stored as readable YAML files
- [x] The CLI validates all inputs with clear error messages
- [x] Slash commands exist for all 5 core workflows
- [x] `pm tui` shows a live, navigable tree of all projects/epics/stories
- [x] The TUI auto-refreshes when YAML files are changed by agents
- [x] The PM project tracks its own development using this tool (self-hosting)

### v2 (Global + Autonomous Filing)

- [x] `pm` CLI works from any directory on the system (not just the project-management repo)
- [x] Project data lives in `~/.pm/` (or `$PM_HOME`) — never relative to `cwd()`
- [x] `/pm-*` slash commands are available in every OpenCode session
- [x] `pm_epic_add` and `pm_story_add` MCP tools are available to all agents
- [x] An agent working in an unrelated project can file a story without switching context
- [x] An agent working in an unrelated project can file an epic without switching context
- [x] Agents follow the autonomous filing rules (file when appropriate, don't file trivially)
- [x] `pm migrate` successfully moves v1 project data to the global directory
- [x] The TUI watches the global data directory, not a local `projects/` folder
- [ ] `install.sh` performs a complete setup for both OpenCode and Claude Code (CLI + MCP server + commands + AGENTS.md rules)

### v2.1 (Multi-Client + MCP)

- [ ] MCP server exposes all three tools (pm_status, pm_epic_add, pm_story_add) over stdio
- [ ] MCP server is registered with OpenCode via opencode.json mcp config
- [ ] MCP server is registered with Claude Code via `claude mcp add`
- [ ] `/pm-*` slash commands work in Claude Code sessions
- [ ] Agent rules are installed for Claude Code in `~/.claude/AGENTS.md`
- [ ] Legacy `@opencode-ai/plugin` custom tools are removed
