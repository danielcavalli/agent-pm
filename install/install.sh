#!/usr/bin/env bash
set -euo pipefail

# install.sh — Install pm CLI and configure AI client integrations
#
# Performs:
#   1. Install pm CLI globally via npm
#   2. Detect available AI coding clients (OpenCode, Claude Code)
#   3. For each detected client:
#      a. Register MCP server
#      b. Copy slash commands
#      c. Install agent rules
#
# Supported platforms: Linux, macOS
# Idempotent: safe to run multiple times.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Step 1: Install pm CLI globally ──────────────────────────────────────────
echo "==> Installing pm CLI globally..."
# Ensure local node_modules are present so devDependencies (tsc) are available
# when the `prepare` script runs during global install.
(cd "$REPO_DIR" && npm install --silent)
# Uninstall under both current and legacy package names to avoid EEXIST errors
# in newer npm versions (--force is not reliable for binary conflicts).
npm uninstall -g agent-pm 2>/dev/null || true
npm uninstall -g project-management 2>/dev/null || true
(cd "$REPO_DIR" && npm install -g .)
echo "    pm installed: $(command -v pm)"
echo ""

# Resolve MCP server path via global npm root
MCP_SERVER="$(npm root -g)/agent-pm/dist/mcp-server.js"

# ── Step 2: Detect available AI coding clients ───────────────────────────────
OPENCODE_DETECTED=false
CLAUDE_DETECTED=false

if [ -d "${HOME}/.config/opencode" ]; then
  OPENCODE_DETECTED=true
fi

if [ -d "${HOME}/.claude" ]; then
  CLAUDE_DETECTED=true
fi

echo "==> Client detection:"
echo "    OpenCode:    $OPENCODE_DETECTED"
echo "    Claude Code: $CLAUDE_DETECTED"

if ! $OPENCODE_DETECTED && ! $CLAUDE_DETECTED; then
  echo ""
  echo "    WARNING: No AI coding clients detected."
  echo "    The pm CLI has been installed, but no client integrations were configured."
  echo "    Install OpenCode or Claude Code, then re-run this script."
  echo ""
  echo "==> Installation complete (CLI only)!"
  echo "    CLI: $(pm --version 2>/dev/null || echo 'not found')"
  exit 0
fi
echo ""

# ── Step 3a: Configure MCP server ────────────────────────────────────────────

configure_mcp_opencode() {
  local config_path="${HOME}/.config/opencode/opencode.json"
  echo "==> Configuring MCP server in OpenCode (${config_path})..."
  node -e "
    const fs = require('fs');
    const configPath = process.argv[1];
    const mcpServer = process.argv[2];
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    if (!config.mcp) config.mcp = {};
    config.mcp['pm-tools'] = {
      type: 'local',
      command: ['node', mcpServer]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  " "$config_path" "$MCP_SERVER"
  echo "    Done."
  echo ""
}

configure_mcp_claude() {
  local config_path="${HOME}/.claude/settings.json"
  echo "==> Configuring MCP server in Claude Code (${config_path})..."
  node -e "
    const fs = require('fs');
    const configPath = process.argv[1];
    const mcpServer = process.argv[2];
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers['pm-tools'] = {
      command: 'node',
      args: [mcpServer]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  " "$config_path" "$MCP_SERVER"
  echo "    Done."
  echo ""
}

if $OPENCODE_DETECTED; then
  configure_mcp_opencode
fi

if $CLAUDE_DETECTED; then
  configure_mcp_claude
fi

# ── Step 3b: Copy slash commands ─────────────────────────────────────────────

install_commands() {
  local target_dir="$1"
  echo "==> Copying slash commands to ${target_dir}/"
  mkdir -p "$target_dir"
  if [ -d "$SCRIPT_DIR/commands" ]; then
    cp -v "$SCRIPT_DIR/commands/"pm-*.md "$target_dir/"
  else
    echo "    WARNING: No commands found at $SCRIPT_DIR/commands/"
  fi
  echo ""
}

if $OPENCODE_DETECTED; then
  install_commands "${HOME}/.config/opencode/commands"
fi

if $CLAUDE_DETECTED; then
  install_commands "${HOME}/.claude/commands"
fi

# ── Step 3c: Clean up legacy global agent rules ──────────────────────────────
#
# PM agent rules are now installed per-project via `pm rules init`, invoked
# by the /pm-create-project slash command. Previous versions injected rules
# into the global AGENTS.md — this step removes them if present.

clean_global_rules() {
  local agents_file="$1"
  local start_marker="# PM Autonomous Filing Rules"
  local end_marker="# END PM Autonomous Filing Rules"

  [ -f "$agents_file" ] || return 0

  if grep -qF "$start_marker" "$agents_file"; then
    echo "==> Removing legacy PM rules from ${agents_file}..."
    local tmpfile
    tmpfile=$(mktemp)
    awk -v start="$start_marker" -v end="$end_marker" '
      $0 == start { skip=1; next }
      $0 == end { skip=0; next }
      !skip { print }
    ' "$agents_file" > "$tmpfile"
    mv "$tmpfile" "$agents_file"
    echo "    Done. (PM rules are now per-project — run 'pm rules init' in your repo.)"
    echo ""
  fi
}

if $OPENCODE_DETECTED; then
  clean_global_rules "${HOME}/.config/opencode/AGENTS.md"
fi

if $CLAUDE_DETECTED; then
  clean_global_rules "${HOME}/.claude/AGENTS.md"
fi

# ── Client differences (for maintainers) ─────────────────────────────────────
#
# OpenCode vs Claude Code integration points:
#
#   Feature          OpenCode                           Claude Code
#   ──────────────── ────────────────────────────────── ──────────────────────────────────
#   MCP config       ~/.config/opencode/opencode.json   ~/.claude/settings.json
#                    mcp.pm-tools.command = [cmd, arg]  mcpServers.pm-tools = {command, args}
#   Slash commands   ~/.config/opencode/commands/        ~/.claude/commands/
#   Agent rules      Per-project AGENTS.md               Per-project AGENTS.md
#                    (via `pm rules init`)               (via `pm rules init`)
#
# The MCP server (dist/mcp-server.js) is identical for both clients — it serves
# pm_status, pm_epic_add, and pm_story_add over stdio using the MCP protocol.
# No client-specific behavior exists in the tool layer.
#
# The slash command .md files use $ARGUMENTS for parameter injection and are
# format-compatible between both clients.
#
# Agent rules are installed per-project by running `pm rules init` in the
# project repository. The /pm-create-project slash command does this
# automatically. This ensures only explicitly managed projects get the
# autonomous filing behavior — not every project the agent works on.
#
# Known limitation: full live verification of Claude Code integration requires
# the `claude` CLI to be installed. The MCP protocol layer is fully tested via
# automated tests (see src/__tests__/mcp-server.test.ts).
#

# ── Summary ──────────────────────────────────────────────────────────────────
echo "==> Installation complete!"
echo "    CLI:        $(pm --version 2>/dev/null || echo 'not found')"
echo "    MCP server: ${MCP_SERVER}"
echo "    Clients:    $(${OPENCODE_DETECTED} && echo 'OpenCode') $(${CLAUDE_DETECTED} && echo 'Claude Code')"
