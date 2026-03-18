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

# ── Logging ──────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  RED='\033[0;31m'   GREEN='\033[0;32m'  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'  CYAN='\033[0;36m'   BOLD='\033[1m'
  DIM='\033[2m'      NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' NC=''
fi

step_num=0
step()    { step_num=$((step_num + 1)); echo -e "\n${BOLD}${BLUE}[$step_num]${NC} ${BOLD}$1${NC}"; }
info()    { echo -e "    ${CYAN}>${NC} $1"; }
success() { echo -e "    ${GREEN}ok${NC} $1"; }
warn()    { echo -e "    ${YELLOW}!!${NC} $1"; }
detail()  { echo -e "    ${DIM}$1${NC}"; }

echo ""
echo -e "${BOLD}  pm installer${NC}"
echo -e "${DIM}  ────────────${NC}"

# ── Step 1: Install pm CLI globally ──────────────────────────────────────────
step "Install pm CLI globally"

# Ensure local node_modules are present so devDependencies (tsc) are available
# when the `prepare` script runs during global install.
info "Installing local dependencies..."
(cd "$REPO_DIR" && npm install --silent)
success "Local dependencies ready"

# Uninstall under both current and legacy package names to avoid EEXIST errors
# in newer npm versions (--force is not reliable for binary conflicts).
info "Cleaning up previous installations..."
npm uninstall -g agent-pm &>/dev/null || true
npm uninstall -g project-management &>/dev/null || true

info "Installing global package..."
(cd "$REPO_DIR" && npm install -g . --silent)
success "pm installed at $(command -v pm)"

# Resolve MCP server path via global npm root
MCP_SERVER="$(npm root -g)/agent-pm/dist/mcp-server.js"

# ── Step 2: Check tmux dependency ────────────────────────────────────────────
step "Check tmux dependency"

if command -v tmux &>/dev/null; then
  success "tmux detected ($(tmux -V))"
  detail "Skipping tmux installation -- already available"
else
  warn "tmux is not installed."
  info "The TUI agent dispatch feature requires tmux to open agent panes."
  read -rp "    Install tmux? [y/N] " install_tmux
  if [[ "${install_tmux,,}" == "y" ]]; then
    if command -v brew &>/dev/null; then
      info "Installing tmux via Homebrew..."
      brew install tmux
    elif command -v apt-get &>/dev/null; then
      info "Installing tmux via apt-get..."
      sudo apt-get install -y tmux
    elif command -v dnf &>/dev/null; then
      info "Installing tmux via dnf..."
      sudo dnf install -y tmux
    elif command -v pacman &>/dev/null; then
      info "Installing tmux via pacman..."
      sudo pacman -S --noconfirm tmux
    else
      warn "Could not detect package manager. Install tmux manually."
    fi
    if command -v tmux &>/dev/null; then
      success "tmux installed ($(tmux -V))"
    else
      warn "tmux installation may have failed. Agent dispatch from TUI will use background mode."
    fi
  else
    detail "Skipped. Agent dispatch from TUI will use background mode."
  fi
fi

# ── Step 3: Detect available AI coding clients ───────────────────────────────
step "Detect AI coding clients"

OPENCODE_DETECTED=false
CLAUDE_DETECTED=false

if [ -d "${HOME}/.config/opencode" ]; then
  OPENCODE_DETECTED=true
fi

if command -v claude &>/dev/null; then
  CLAUDE_DETECTED=true
elif [ -d "${HOME}/.claude" ]; then
  # Claude Code directory exists but CLI not on PATH — partial detection
  CLAUDE_DETECTED=true
fi

if $OPENCODE_DETECTED; then
  success "OpenCode detected"
else
  detail "OpenCode not found"
fi

if $CLAUDE_DETECTED; then
  success "Claude Code detected"
else
  detail "Claude Code not found"
fi

if ! $OPENCODE_DETECTED && ! $CLAUDE_DETECTED; then
  echo ""
  warn "No AI coding clients detected."
  detail "The pm CLI has been installed, but no client integrations were configured."
  detail "Install OpenCode or Claude Code, then re-run this script."
  echo ""
  echo -e "    ${BOLD}Done${NC} ${DIM}(CLI only)${NC}"
  detail "CLI version: $(pm --version 2>/dev/null || echo 'not found')"
  exit 0
fi

# ── Step 3b: Clean up stale plugin files from prior installations ────────────
STALE_PLUGIN="${HOME}/.config/opencode/tools/pm.ts"
if [ -f "$STALE_PLUGIN" ]; then
  info "Removing stale OpenCode plugin..."
  rm "$STALE_PLUGIN"
  success "Removed ${STALE_PLUGIN}"
  detail "pm now uses the MCP server instead of the plugin file"
fi

# ── Step 4a: Configure MCP server ────────────────────────────────────────────

step "Configure MCP server"

configure_mcp_opencode() {
  local config_path="${HOME}/.config/opencode/opencode.json"
  info "Registering pm-tools in OpenCode..."
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
  success "OpenCode MCP configured"
  detail "$config_path"
}

configure_mcp_claude() {
  if ! command -v claude &>/dev/null; then
    warn "'claude' CLI not found on PATH -- skipping MCP registration"
    detail "Install Claude Code, then re-run this script or run manually:"
    detail "  claude mcp add -s user pm-tools -- node $MCP_SERVER"
    return 0
  fi
  info "Registering pm-tools in Claude Code..."
  # Remove stale registration (ignore errors if it doesn't exist)
  claude mcp remove pm-tools -s user &>/dev/null || true
  # Register with user scope so it's available in all projects
  claude mcp add -s user pm-tools -- node "$MCP_SERVER" >/dev/null
  # Clean up stale mcpServers key from settings.json (written by older installers)
  local settings_path="${HOME}/.claude/settings.json"
  if [ -f "$settings_path" ] && grep -q '"mcpServers"' "$settings_path" 2>/dev/null; then
    info "Cleaning up stale mcpServers from settings.json..."
    node -e "
      const fs = require('fs');
      const p = process.argv[1];
      try {
        const c = JSON.parse(fs.readFileSync(p, 'utf8'));
        delete c.mcpServers;
        fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
      } catch {}
    " "$settings_path"
  fi
  success "Claude Code MCP configured"
}

if $OPENCODE_DETECTED; then
  configure_mcp_opencode
fi

if $CLAUDE_DETECTED; then
  configure_mcp_claude
fi

# ── Step 4b: Copy slash commands ─────────────────────────────────────────────

step "Install slash commands"

install_commands() {
  local target_dir="$1"
  local client_name="$2"
  mkdir -p "$target_dir"
  if [ -d "$SCRIPT_DIR/commands" ]; then
    local count=0
    for f in "$SCRIPT_DIR/commands/"pm-*.md; do
      [ -f "$f" ] && count=$((count + 1))
    done
    cp "$SCRIPT_DIR/commands/"pm-*.md "$target_dir/"
    success "$count commands installed for $client_name"
    detail "$target_dir/"
  else
    warn "No commands found at $SCRIPT_DIR/commands/"
  fi
}

if $OPENCODE_DETECTED; then
  install_commands "${HOME}/.config/opencode/commands" "OpenCode"
fi

if $CLAUDE_DETECTED; then
  install_commands "${HOME}/.claude/commands" "Claude Code"
fi

# ── Step 4c: Clean up legacy global agent rules ──────────────────────────────
#
# PM agent rules are now installed per-project via `pm rules init`, invoked
# by the /pm-create-project slash command. Previous versions injected rules
# into the global AGENTS.md — this step removes them if present.

step "Clean up legacy configuration"

legacy_cleaned=false

clean_global_rules() {
  local agents_file="$1"
  local client_name="$2"
  local start_marker="# PM Autonomous Filing Rules"
  local end_marker="# END PM Autonomous Filing Rules"

  [ -f "$agents_file" ] || return 0

  if grep -qF "$start_marker" "$agents_file"; then
    info "Removing legacy PM rules from $client_name..."
    local tmpfile
    tmpfile=$(mktemp)
    awk -v start="$start_marker" -v end="$end_marker" '
      $0 == start { skip=1; next }
      $0 == end { skip=0; next }
      !skip { print }
    ' "$agents_file" > "$tmpfile"
    mv "$tmpfile" "$agents_file"
    success "Removed legacy rules from $client_name"
    detail "PM rules are now per-project -- run 'pm rules init' in your repo"
    legacy_cleaned=true
  fi
}

if $OPENCODE_DETECTED; then
  clean_global_rules "${HOME}/.config/opencode/AGENTS.md" "OpenCode"
fi

if $CLAUDE_DETECTED; then
  clean_global_rules "${HOME}/.claude/AGENTS.md" "Claude Code"
fi

if ! $legacy_cleaned; then
  detail "Nothing to clean up"
fi

# ── Client differences (for maintainers) ─────────────────────────────────────
#
# OpenCode vs Claude Code integration points:
#
#   Feature          OpenCode                           Claude Code
#   ──────────────── ────────────────────────────────── ──────────────────────────────────
#   MCP config       ~/.config/opencode/opencode.json   `claude mcp add -s user` (writes
#                    mcp.pm-tools.command = [cmd, arg]   to ~/.claude.json mcpServers key)
#   Slash commands   ~/.config/opencode/commands/        ~/.claude/commands/
#   Agent rules      Per-project AGENTS.md               Per-project AGENTS.md
#                    (via `pm rules init`)               (via `pm rules init`)
#
# IMPORTANT: Claude Code does NOT read MCP config from ~/.claude/settings.json.
# MCP servers must be registered via `claude mcp add` which writes to
# ~/.claude.json. Older versions of this installer wrote to settings.json
# which had no effect. The current version uses the CLI and cleans up stale
# settings.json entries.
#
# The MCP server (dist/mcp-server.js) is identical for both clients — it
# serves 14 tools over stdio using the MCP protocol. No client-specific
# behavior exists in the tool layer.
#
# Agent rules are installed per-project by running `pm rules init` in the
# project repository. The /pm-create-project slash command does this
# automatically.
#

# ── Summary ──────────────────────────────────────────────────────────────────
PM_VERSION="$(pm --version 2>/dev/null || echo 'not found')"
CLIENTS="$(${OPENCODE_DETECTED} && echo 'OpenCode') $(${CLAUDE_DETECTED} && echo 'Claude Code')"
CLIENTS="$(echo "$CLIENTS" | xargs)"  # trim whitespace

echo ""
echo -e "${DIM}  ────────────────────────────────────${NC}"
echo -e "  ${GREEN}${BOLD}Installation complete${NC}"
echo ""
echo -e "    ${BOLD}Version${NC}     $PM_VERSION"
echo -e "    ${BOLD}MCP server${NC}  $MCP_SERVER"
echo -e "    ${BOLD}Clients${NC}     $CLIENTS"
echo ""
detail "Run /pm-help in your AI client to get started"
echo ""
