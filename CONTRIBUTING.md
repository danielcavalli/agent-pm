# Contributing to pm

## Development Setup

```bash
# Clone the repo
git clone https://github.com/danielcavalli/agent-pm.git
cd agent-pm

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link for local development (makes `pm` available globally)
npm link
```

After `npm link`, the `pm` command points to your local `dist/` output. Changes take effect after running `npm run build`.

## Development Workflow

### Building

```bash
npm run build     # Compile TypeScript to dist/
```

The build compiles `src/` to `dist/` using `tsc`. The CLI entry point is `dist/cli.js` and the MCP server is `dist/mcp-server.js`.

### Testing

```bash
npm test          # Run all tests with vitest
```

Tests are in `src/__tests__/`. They use `vitest` and set the `PM_HOME` environment variable to temporary directories for test isolation. This ensures tests never touch real project data in `.pm/`.

### Manual Verification

After building, test your changes manually:

```bash
pm status                    # Verify CLI works
pm init --name Test --code T --description "test"
pm epic add T --title "Test epic" --description "testing"
pm status T
```

For MCP server changes, the automated tests in `src/__tests__/mcp-server.test.ts` use the MCP SDK client to verify the server end-to-end.

## Project Structure

| Path                      | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `src/cli.ts`              | CLI entry point (commander.js)                                             |
| `src/mcp-server.ts`       | MCP server exposing pm_status, pm_epic_add, pm_story_add                   |
| `src/commands/`           | CLI command implementations (init, epic, story, status, work, rules, etc.) |
| `src/schemas/`            | Zod schemas for Project, Epic, Story validation                            |
| `src/lib/`                | Shared helpers (ID generation, YAML I/O, data dir resolution)              |
| `src/tui/`                | ink-based interactive TUI dashboard                                        |
| `src/__tests__/`          | Test files                                                                 |
| `install/install.sh`      | Multi-client installer                                                     |
| `install/commands/`       | Canonical slash command .md files                                          |
| `install/agents-rules.md` | Autonomous filing rules template                                           |

## Adding or Modifying Slash Commands

Slash commands live in `install/commands/` as Markdown files. Each file is a system prompt that guides an AI agent through a PM workflow.

To add a new command:

1. Create `install/commands/pm-your-command.md`
2. Write the system prompt -- it should instruct the agent to use the `pm` CLI directly (not `npm run pm --`)
3. Use `$ARGUMENTS` for parameter injection where needed
4. Run `bash install/install.sh` to deploy to both clients, or manually copy to:
   - `~/.config/opencode/commands/` (OpenCode)
   - `~/.claude/commands/` (Claude Code)

To modify an existing command:

1. Edit the file in `install/commands/`
2. Re-run `install.sh` or copy the updated file to the client directories

## How install.sh Works

The installer (`install/install.sh`) performs these steps:

1. **Global CLI install** -- runs `npm install -g .` from the repo root
2. **Client detection** -- checks for `~/.config/opencode/` and `~/.claude/` directories
3. **For each detected client:**
   - **MCP server registration** -- adds `pm-tools` to the client's MCP config JSON
   - **Slash commands** -- copies `install/commands/pm-*.md` to the client's commands directory
4. **Legacy cleanup** -- removes any previously-installed global agent rules from client AGENTS.md files

The installer is idempotent -- running it multiple times is safe and will update existing configurations.

### Per-Project Agent Rules

Agent rules are no longer installed globally. Instead, they are opt-in per repository:

```bash
pm rules init             # Write PM rules into ./AGENTS.md
pm rules remove           # Strip PM rules from ./AGENTS.md
```

The rules template lives in `install/agents-rules.md`, bounded by markers:

```
# PM Autonomous Filing Rules
... content ...
# END PM Autonomous Filing Rules
```

`pm rules init` uses these markers for idempotent insertion/replacement.

## Testing the Installer

```bash
# Full install (builds + installs globally + configures clients)
npm run build && bash install/install.sh

# Verify MCP config was written
cat ~/.config/opencode/opencode.json  # OpenCode
cat ~/.claude/settings.json           # Claude Code

# Verify commands were copied
ls ~/.config/opencode/commands/pm-*
ls ~/.claude/commands/pm-*
```

## Submitting Changes

1. Create a branch for your change
2. Make your changes, run `npm run build` and `npm test`
3. Ensure tests pass and the build is clean
4. Submit a pull request with a clear description of what changed and why
