# Contributing to pm

## Development Setup

```bash
git clone https://github.com/danielcavalli/agent-pm.git
cd agent-pm
npm install
npm run build
npm link        # Makes `pm` available globally, pointing to your local dist/
```

After `npm link`, changes take effect after `npm run build`.

## Project Structure

```
src/
  cli.ts                    # CLI entry point (commander.js). All subcommands registered here.
  mcp-server.ts             # MCP server -- exposes 14 tools over stdio transport.
  commands/                 # One file per CLI command (init, epic, story, work, adr, agent, etc.)
  schemas/                  # Zod schemas for every data type (project, epic, story, ADR, etc.)
  lib/
    fs.ts                   # YAML read/write, .pm/ directory resolution, file locking
    codes.ts                # ID generation (next epic/story/ADR number), code parsing
    index.ts                # Project index (index.yaml) maintenance
    errors.ts               # Error types
    llm.ts                  # LLM client (used by consolidation semantic clustering)
    agent-state.ts          # Agent state file read/write
  tui/
    index.tsx               # Ink app entry -- wires panels, keyboard handling, state
    types.ts                # TreeNode, filter types
    loadTree.ts             # Builds in-memory tree from YAML files on disk
    colors.ts               # Color palette
    dispatch.ts             # Agent dispatch (tmux or background process)
    escalationResponse.ts   # Write human response to agent escalation
    focusCycling.ts         # Tab focus rotation logic
    components/
      Tree.tsx              # Navigable epic/story tree
      DetailPanel.tsx       # Selected item detail view
      StatusBar.tsx         # Bottom bar (code, filter, agent count)
      AgentSidebar.tsx      # Live agent state panel
      HelpOverlay.tsx       # Keyboard shortcut overlay
    hooks/
      useProjectTree.ts     # Loads tree, exposes reload
      useFileWatcher.ts     # Watches .pm/ for changes, triggers reload
      useAgentList.ts       # Reads .pm/agents/*.yaml
      useMouseScroll.ts     # Mouse wheel scroll support
install/
  install.sh                # Multi-client installer (npm global + MCP + slash commands)
  agents-rules.md           # Autonomous filing rules template used by `pm rules init`
  commands/                 # Slash command Markdown files (one per /pm-* command)
  COMMANDS.md               # Slash command index
docs/
  adr/                      # Architecture Decision Records (Markdown, for this repo's own decisions)
  design/                   # Design specs (PRD, TUI spec)
  plans/                    # Implementation plans
  schemas/                  # Schema documentation
  research/                 # Research notes
```

## How the Pieces Fit Together

```
                              AI Agent Session
                             /        |        \
                   Slash Commands   MCP Tools   Direct CLI
                     (Markdown)    (stdio)      (pm ...)
                         |            |            |
                         v            v            v
                    install/     mcp-server.ts   cli.ts
                    commands/         |            |
                                     +-----+------+
                                           |
                                     src/commands/*
                                           |
                                     src/schemas/*
                                     src/lib/*
                                           |
                                      .pm/ (YAML)
```

- **Slash commands** are Markdown prompt templates. They instruct the agent to call `pm` CLI commands. They don't execute code themselves.
- **MCP tools** are defined in `mcp-server.ts`. Each tool shells out to the `pm` CLI binary, passing parameters as flags.
- **CLI commands** are the single source of truth for all operations. They validate via Zod schemas and read/write YAML in `.pm/`.
- **The TUI** reads `.pm/` directly (no CLI in the loop) for performance, using the same `loadTree.ts` logic.

## Building

```bash
npm run build     # Compile TypeScript to dist/
```

The build produces `dist/cli.js` (CLI entry) and `dist/mcp-server.js` (MCP server entry). Both get `chmod +x` automatically.

To refresh the generated CLI surface, MCP surface, and command reference from the canonical contract registry, run:

```bash
npm run refresh:command-artifacts
```

This writes `docs/reference/cli-surface.txt`, `docs/reference/mcp-tools.json`, and `docs/reference/commands.md`.

To verify that the checked-in generated artifacts are in sync with the canonical contract, run:

```bash
npm run build && npm run check:command-surface
```

The mutation policy for every write/destructive command lives in `docs/reference/mutation-operations.md`. Update it whenever you add a new mutable command path or change the locking/atomicity expectations of an existing one.

## Testing

```bash
npm test          # Run all tests with vitest
```

Tests live alongside the code they test (`src/**/__tests__/`). They use the `PM_HOME` environment variable pointed at temporary directories for isolation -- tests never touch real `.pm/` data.

Key test areas:

- `src/__tests__/mcp-server.test.ts` -- End-to-end MCP server tests using the MCP SDK client
- `src/commands/__tests__/` -- CLI command tests (init, epic, story, work, consolidate, gc, ADR, agent, etc.)
- `src/tui/__tests__/` -- TUI component and interaction tests
- `src/schemas/__tests__/` -- Schema validation tests
- `src/lib/__tests__/` -- Library utility tests

### Manual Verification

```bash
pm status
pm init --name Test --code T --description "test project"
pm epic add --title "Test epic" --description "testing"
pm story add E001 --title "Test story" --points 1 --criteria "It works"
pm status
pm tui
```

## Adding a New CLI Command

1. Create `src/commands/your-command.ts` with a function that takes a Commander `program` argument
2. Register it in `src/cli.ts` by importing and calling it
3. If it needs a new data type, add a Zod schema in `src/schemas/`
4. Add tests in `src/commands/__tests__/your-command.test.ts`

## Adding a New MCP Tool

1. Implement the underlying logic as a CLI command first (see above)
2. Add the tool definition in `src/mcp-server.ts` following the existing pattern:
   - Define `inputSchema` with Zod
   - Shell out to the `pm` CLI binary with the appropriate flags
   - Return the CLI output as the tool result
3. Add tests in `src/__tests__/mcp-server.test.ts`

## Adding or Modifying Slash Commands

Slash commands are Markdown files in `install/commands/`. Each file is a system prompt that guides an AI agent through a workflow.

To add a new command:

1. Create `install/commands/pm-your-command.md`
2. Write the prompt -- instruct the agent to use `pm` CLI commands directly
3. Use `$ARGUMENTS` as a placeholder for user-provided parameters
4. Add the command to `install/COMMANDS.md`
5. Run `bash install/install.sh` to deploy, or manually copy to:
   - `~/.claude/commands/` (Claude Code)
   - `~/.config/opencode/commands/` (OpenCode)

## Modifying Schemas

Zod schemas in `src/schemas/` define the shape of all YAML data. When modifying:

- Update the Zod schema
- Run `npm test` to verify existing data still validates
- If adding fields, consider whether they should be optional (backward compatibility with existing `.pm/` data)

## How install.sh Works

The installer (`install/install.sh`) is idempotent and supports `--non-interactive` (or `PM_INSTALL_NON_INTERACTIVE=1`) for unattended setup:

1. Runs `npm install` locally so build-time devDependencies are available, then `npm install -g .`
2. Checks for `tmux` and offers to install it interactively if missing
3. Detects AI clients by checking for `~/.config/opencode/` and the Claude CLI / `~/.claude/`
4. For each detected client:
   - Registers the shared MCP server (`dist/mcp-server.js`)
   - Copies all `install/commands/pm-*.md` files to the client's commands directory
5. Removes stale OpenCode plugin artifacts and legacy globally-injected PM rules

Before the installer overwrites an existing client config, command file, or legacy artifact, it creates a timestamped sibling backup named like `<path>.pm-backup-<timestamp>`. If a write fails after backup creation, the installer restores the original file when possible and reports the backup locations in the success summary. To restore manually, copy the backup file back to the original path.

Claude Code MCP registration uses `claude mcp add -s user pm-tools -- node <path>`, not manual edits to `~/.claude/settings.json`.

Use `bash install/install.sh --non-interactive` or `PM_INSTALL_NON_INTERACTIVE=1` when prompts are not allowed; the installer will skip interactive tmux installation and use safe defaults.

Agent rules are installed per-repo via `pm rules init`, not globally.

## Documentation Review Checklist

When you change the command surface or installer behavior, verify these docs in the same PR:

1. `PRD.md` matches current CLI / MCP / slash-command counts and installation behavior
2. `CONTRIBUTING.md` matches the actual contributor workflow and installer behavior
3. `docs/guide.md` reflects any user-visible workflow changes
4. `install/COMMANDS.md` matches the slash command files in `install/commands/`
5. The canonical references still agree with implementation: `src/cli.ts` and `src/mcp-server.ts`
6. `docs/reference/commands.md` has been regenerated if contract metadata changed

## Mutation Review Checklist

When you add or change a write/destructive command, verify these items in the same PR:

1. `docs/reference/mutation-operations.md` includes the command path and correct mutation category
2. Mutation policy conformance is explicit: safety level, lock class, and atomicity rule all match the implementation intent
3. Any shared allocator/index updates are covered by the same lock scope as the primary write
4. Tests cover the policy/documentation contract when the mutable command surface changes

## Submitting Changes

1. Create a branch
2. Make changes
3. Run `npm run lint && npm run build && npm test`
4. Submit a pull request describing what changed and why

Pull requests now run the same lint, build, and test checks in GitHub Actions. Keeping the local commands green before you open or update a PR should match the CI result.
