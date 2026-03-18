import React from "react";
import { Box, Text } from "ink";
import type { FilterMode, FocusedPanel } from "../types.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import { theme, tc } from "../colors.js";

// ── Status Bar ────────────────────────────────────────────────────────────────

export interface StatusBarProps {
  selectedCode: string;
  filter: FilterMode;
  search: string;
  searching: boolean;
  message: string;
  width: number;
  agents?: AgentState[];
  sidebarHidden?: boolean;
  focusedPanel?: FocusedPanel;
  dispatchAvailable?: boolean;
}

export function agentCountSummary(agents: AgentState[]): string {
  if (agents.length === 0) return "";
  const needsAttention = agents.filter(
    (a) => a.status === "needs_attention" || a.status === "blocked",
  ).length;
  const total = agents.length;
  const label = total === 1 ? "agent" : "agents";
  if (needsAttention > 0) {
    return `${total} ${label} (${needsAttention} needs attention)`;
  }
  return `${total} ${label}`;
}

export function buildContextKeys(
  focusedPanel: FocusedPanel,
  dispatchAvailable: boolean,
): string {
  const dispatchHint = dispatchAvailable ? "  [x] dispatch" : "";
  switch (focusedPanel) {
    case "tree":
      return `[j/k] nav  [Enter] expand  [f] filter  [/] search${dispatchHint}`;
    case "sidebar":
      return "[j/k] nav  [f] filter  [e] respond";
    case "detail":
      return "[j/k] scroll";
    default:
      return "[j/k] nav";
  }
}

export function StatusBar({
  selectedCode,
  filter,
  search,
  searching,
  message,
  width,
  agents = [],
  sidebarHidden = false,
  focusedPanel = "tree",
  dispatchAvailable = false,
}: StatusBarProps) {
  const filterLabels: Record<FilterMode, string> = {
    all: "All",
    backlog: "Backlog",
    in_progress: "In Progress",
    done: "Done",
  };

  const agentSummary = agentCountSummary(agents);

  const attentionCount = agents.filter(
    (a) => a.status === "needs_attention" || a.status === "blocked",
  ).length;
  const hiddenAttentionIndicator =
    sidebarHidden && attentionCount > 0
      ? `  [! ${attentionCount} agent${attentionCount === 1 ? "" : "s"} need attention]`
      : "";

  if (searching) {
    const searchBar = ` Search: ${search}\u2588  [Esc] cancel`;
    const truncSearch = searchBar.length > width - 1
      ? searchBar.slice(0, width - 2) + "\u2026"
      : searchBar.padEnd(width);

    return (
      <Box width={width} height={1}>
        <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.primary)}>
          {truncSearch}
        </Text>
      </Box>
    );
  }

  if (message) {
    const msgBar = ` ${message}`;
    const truncMsg = msgBar.length > width - 1
      ? msgBar.slice(0, width - 2) + "\u2026"
      : msgBar.padEnd(width);

    return (
      <Box width={width} height={1}>
        <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.primary)}>
          {truncMsg}
        </Text>
      </Box>
    );
  }

  // Normal mode: segmented bar
  const contextKeys = buildContextKeys(focusedPanel, dispatchAvailable);
  const universalKeys = "[Tab] panel  [?] help  [q] quit";
  const agentPart = agentSummary && !sidebarHidden ? `  | ${agentSummary}` : "";

  // Build segments
  const codeSegment = selectedCode ? ` ${selectedCode}` : "";
  const filterSegment = ` [${filterLabels[filter]}]`;
  const keysSegment = `  ${contextKeys}  ${universalKeys}`;
  const fullBar = `${codeSegment}${filterSegment}${keysSegment}${agentPart}${hiddenAttentionIndicator}`;

  const truncBar = fullBar.length > width - 1
    ? fullBar.slice(0, width - 2) + "\u2026"
    : fullBar.padEnd(width);

  return (
    <Box width={width} height={1}>
      <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.textMuted)}>
        {truncBar}
      </Text>
    </Box>
  );
}
