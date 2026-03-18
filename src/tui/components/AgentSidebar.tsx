import React from "react";
import { Box, Text } from "ink";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import type { AgentStatus } from "../../schemas/agent-state.schema.js";
import { theme, tc, isNoColor } from "../colors.js";

export type AgentFilterMode = "all" | "attention";

// ── Status icon mapping ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<AgentStatus, string> = {
  active: "\u25CF",
  idle: "\u25CB",
  needs_attention: "\u25B2",
  blocked: "\u2717",
  completed: "\u2713",
};

export function agentStatusIcon(status: string): string {
  return STATUS_ICONS[status as AgentStatus] ?? "?";
}

// ── Color mapping ────────────────────────────────────────────────────────────

export interface StatusStyle {
  color: string | undefined;
  bold: boolean;
  dimColor: boolean;
}

export const STATUS_COLORS: Record<AgentStatus, StatusStyle> = {
  active:          { color: "green",   bold: false, dimColor: false },
  idle:            { color: "gray",    bold: false, dimColor: true  },
  needs_attention: { color: "red",     bold: true,  dimColor: false },
  blocked:         { color: "red",     bold: false, dimColor: false },
  completed:       { color: "gray",    bold: false, dimColor: false },
};

const DEFAULT_STYLE: StatusStyle = { color: undefined, bold: false, dimColor: false };

/** Resolve style for a given agent status, respecting NO_COLOR */
export function agentStatusStyle(status: string): StatusStyle {
  if (isNoColor()) {
    return DEFAULT_STYLE;
  }
  return STATUS_COLORS[status as AgentStatus] ?? DEFAULT_STYLE;
}

/** Map agent status to a theme hex color */
function agentStatusThemeColor(status: string): string {
  switch (status) {
    case "active": return theme.success;
    case "idle": return theme.textMuted;
    case "needs_attention": return theme.error;
    case "blocked": return theme.warning;
    case "completed": return theme.textMuted;
    default: return theme.textMuted;
  }
}

/** Filter agents based on the current filter mode */
export function filterAgents(
  agents: AgentState[],
  filterMode: AgentFilterMode,
): AgentState[] {
  if (filterMode === "attention") {
    return agents.filter(
      (a) => a.status === "needs_attention" || a.status === "blocked",
    );
  }
  return agents;
}

/** Cycle to the next agent filter mode */
export function nextAgentFilter(current: AgentFilterMode): AgentFilterMode {
  return current === "all" ? "attention" : "all";
}

/** Build the sidebar header string based on filter mode */
export function sidebarHeader(filterMode: AgentFilterMode): string {
  if (filterMode === "attention") {
    return "Agents [!]";
  }
  return "Agents";
}

/** Compute scroll window start for cursor-centered view */
export function sidebarScrollStart(
  selectedIndex: number,
  filteredCount: number,
  availableRows: number,
): number {
  if (filteredCount <= availableRows) return 0;
  return Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(availableRows / 2),
      filteredCount - availableRows,
    ),
  );
}

interface AgentSidebarProps {
  agents: AgentState[];
  width: number;
  height: number;
  agentFilter?: AgentFilterMode;
  selectedIndex?: number;
  focused?: boolean;
}

export function AgentSidebar({
  agents,
  width,
  height,
  agentFilter = "all",
  selectedIndex = -1,
  focused = false,
}: AgentSidebarProps) {
  const innerWidth = Math.max(width - 2, 1);
  const filtered = filterAgents(agents, agentFilter);
  const availableRows = Math.max(height - 1, 0);
  const noColor = isNoColor();

  const scrollStart = sidebarScrollStart(selectedIndex, filtered.length, availableRows);
  const visibleAgents = filtered.slice(scrollStart, scrollStart + availableRows);

  const baseHeader = sidebarHeader(agentFilter);
  const posIndicator = filtered.length > availableRows
    ? ` ${selectedIndex + 1}/${filtered.length}`
    : "";
  const header = `${baseHeader}${posIndicator}`;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text bold color={tc(theme.primary)}>{header.padEnd(innerWidth)}</Text>
      {visibleAgents.map((agent, idx) => {
        const icon = agentStatusIcon(agent.status);
        const themeColor = agentStatusThemeColor(agent.status);
        const task = agent.current_task ?? "";
        const isSelected = focused && (scrollStart + idx) === selectedIndex;

        const iconWidth = 2;
        const taskSuffix = task ? ` ${task}` : "";
        const maxIdLen = innerWidth - iconWidth - taskSuffix.length;
        const truncatedId =
          maxIdLen <= 0
            ? ""
            : agent.agent_id.length > maxIdLen
              ? agent.agent_id.slice(0, maxIdLen)
              : agent.agent_id;

        const rowText = `${icon} ${truncatedId}${taskSuffix}`.padEnd(innerWidth);

        if (isSelected) {
          return (
            <Box key={agent.agent_id} width={innerWidth}>
              <Text backgroundColor={tc(theme.bgSelected)} color={tc(theme.textBright)} bold>
                {rowText}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={agent.agent_id} width={innerWidth}>
            <Text color={noColor ? undefined : tc(themeColor)}>
              {rowText}
            </Text>
          </Box>
        );
      })}
      {filtered.length === 0 && (
        <Text color={tc(theme.textMuted)}>
          {agents.length === 0
            ? "No agents"
            : "No agents need attention"}
        </Text>
      )}
    </Box>
  );
}
