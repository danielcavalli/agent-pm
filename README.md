# pm -- Project Management for AI Agents

A file-based project management tool that enables AI agents in **OpenCode** and **Claude Code** to autonomously create, track, and execute software projects from any working directory. Data is stored as YAML files in `~/.pm/`, accessible via a global CLI, MCP tools, and slash commands.

A key differentiator: agents can **autonomously file work they discover** during unrelated tasks. An agent fixing a bug in one repository can notice tech debt and file it as a story in PM without leaving its current context.

## Features

- **Global CLI** (`pm`) -- works from any directory on the system
- **MCP Server** -- exposes `pm_status`, `pm_epic_add`, `pm_story_add` as tools available in every agent session
- **Slash Commands** -- 11 `/pm-*` commands for interactive workflows
- **Autonomous Filing** -- AGENTS.md rules instruct agents when and how to capture discovered work
- **Interactive TUI** -- live dashboard (`pm tui`) with keyboard navigation and auto-refresh
- **YAML Storage** -- all data is plain YAML, readable and writable by both humans and agents
- **Dual-Client Support** -- first-class support for both OpenCode and Claude Code

## Prerequisites

- **Node.js** >= 18 and **npm**
- **OpenCode** and/or **Claude Code** installed on the system
  - OpenCode: `~/.config/opencode/` directory exists
  - Claude Code: `~/.claude/` directory exists

## Installation

Clone the repository and run the installer:

```bash
git clone https://github.com/danielcavalli/agent-pm.git
cd agent-pm
npm install
npm run build
bash install/install.sh
```

The installer performs the following steps:

1. **Installs the `pm` CLI globally** via `npm install -g .`
2. **Detects available AI clients** by checking for `~/.config/opencode/` and `~/.claude/`
3. **For each detected client:**
   - Registers the MCP server (adds `pm-tools` to the client's MCP config)
   - Copies slash commands to the client's commands directory

If neither client is detected, the CLI is still installed globally -- you can re-run `install.sh` after setting up a client.

### Per-Project Agent Rules

Agent rules (autonomous filing instructions) are opt-in per repository. After creating a project, run:

```bash
pm rules init
```

This writes the PM filing rules into the current repo's `AGENTS.md`. Agents working in that repo will then know how to file discovered work. Run `pm rules remove` to strip the rules.

### Verifying Installation

```bash
pm --version          # Should print 0.0.1-alpha
pm status             # Should show project overview (empty if no projects yet)
```

In OpenCode or Claude Code, the MCP tools should be available immediately:

- `pm_status` -- query project state
- `pm_epic_add` -- file a new epic
- `pm_story_add` -- file a new story

## Usage

### CLI

The `pm` CLI works from any directory. All data is stored in `~/.pm/` (configurable via `PM_HOME`).

```bash
# Create a project
pm init --name "My App" --code MYAPP --description "A web application"

# Add an epic
pm epic add MYAPP --title "Authentication" --description "User auth system"

# Add a story to the epic
pm story add MYAPP-E001 --title "JWT middleware" --points 3 --priority high \
  --criteria "JWT tokens are validated on every request" \
  --criteria "Expired tokens return 401"

# View status
pm status              # All projects
pm status MYAPP        # Single project detail

# List epics and stories
pm epic list MYAPP
pm story list MYAPP-E001

# Start working on a story (marks it in_progress)
pm work MYAPP-E001-S001

# Update story status
pm story update MYAPP-E001-S001 --status done

# Re-prioritize
pm prioritize MYAPP --strategy "by business value"

# Migrate data from a legacy location
pm migrate --source ./projects/

# Launch interactive TUI dashboard
pm tui
```

### Slash Commands

Slash commands are available in both OpenCode and Claude Code sessions. They prompt the agent through structured PM workflows.

| Command                      | Purpose                              |
| ---------------------------- | ------------------------------------ |
| `/pm-create-project`         | Create a new project interactively   |
| `/pm-add-epic`               | Add an epic to a project             |
| `/pm-add-story`              | Add a story to an epic               |
| `/pm-work-on [code]`         | Execute a single story               |
| `/pm-work-on-project [code]` | Orchestrate all stories in a project |
| `/pm-prioritize [code]`      | Re-prioritize stories                |
| `/pm-status [code]`          | Show status report                   |
| `/pm-refine-epic [code]`     | Plan story decomposition for an epic |
| `/pm-audit [code]`           | Audit implementation against a PRD   |
| `/pm-implement`              | Bootstrap implementation from a PRD  |
| `/pm-help`                   | Show available PM commands           |

### MCP Tools

The MCP server exposes three tools over stdio, registered with each client during installation:

| Tool           | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `pm_status`    | Show project status. Optional `project` parameter for a specific project.                             |
| `pm_epic_add`  | File a new epic. Requires `project`, `title`, `description`. Optional `priority`.                     |
| `pm_story_add` | File a new story. Requires `epic`, `title`, `description`. Optional `points`, `priority`, `criteria`. |

These tools are what enable agents to autonomously file work -- they're available in every session regardless of the current working directory.

### Autonomous Filing

When installed, AGENTS.md rules instruct AI agents to file discovered work using the MCP tools. Agents will autonomously file:

- Bugs or regressions unrelated to the current task
- Tech debt (duplicated code, missing error handling, outdated patterns)
- Missing features or improvement opportunities that are out of scope
- Missing or inadequate test coverage
- Performance concerns

Agents will **not** file issues that are part of their current task, trivial enough to fix immediately, or uncertain.

### Interactive TUI

Run `pm tui` in a terminal (or a split tmux pane alongside your AI coding tool) for a live project dashboard:

```
pm tui
```

Features:

- Navigable tree of all projects, epics, and stories
- Detail panel showing description, acceptance criteria, status
- Auto-refreshes when YAML files change (e.g., when an agent updates a story)
- Keyboard shortcuts: arrow keys to navigate, Enter to expand/collapse, `f` to filter, `/` to search, `c` to copy code, `q` to quit

## Architecture

```
~/.pm/                                    # Global data directory
  projects/
    index.yaml                            # Auto-maintained project index
    {CODE}/
      project.yaml                        # Project definition
      epics/
        E{NNN}-{slug}.yaml                # Epic with embedded stories

agent-pm/                                 # Source repository
  src/
    cli.ts                                # CLI entry point (commander.js)
    mcp-server.ts                         # MCP server (3 tools over stdio)
    commands/                             # CLI command implementations
      rules.ts                            # Per-project agent rules (init/remove)
    schemas/                              # Zod validation schemas
    lib/                                  # Helpers (codes, fs, index)
    tui/                                  # ink-based TUI components
  install/
    install.sh                            # Multi-client installer
    commands/                             # Canonical slash command files
    agents-rules.md                       # Autonomous filing rules template
```

### Design Principles

1. **Files are the API.** Agents read and write YAML files directly. The CLI is a convenience wrapper with validation.
2. **Flat over nested.** Epics are separate files; stories live inside epic files.
3. **Codes are stable identifiers.** `PM-E001-S003` uniquely identifies a story across all agents and sessions.
4. **Global by default.** Data, CLI, MCP tools, and commands all resolve to fixed global paths -- never relative to `cwd()`.
5. **Client-agnostic.** The MCP server provides a universal tool interface that works identically in OpenCode and Claude Code.

### Naming Conventions

| Entity        | Format               | Example                |
| ------------- | -------------------- | ---------------------- |
| Project Code  | `[A-Z]{2,6}`         | `PM`, `MYAPP`          |
| Epic Code     | `{PROJECT}-E{NNN}`   | `PM-E001`              |
| Story Code    | `{EPIC}-S{NNN}`      | `PM-E001-S003`         |
| Epic filename | `E{NNN}-{slug}.yaml` | `E001-foundation.yaml` |

## Data Directory

All project data lives in `~/.pm/` by default. Override with the `PM_HOME` environment variable:

```bash
export PM_HOME=/custom/path
pm status    # Uses /custom/path/projects/
```

## License

MIT
