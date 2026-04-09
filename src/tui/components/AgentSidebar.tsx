import React from "react";
import { Box, Text } from "ink";
import type { AgentStatus } from "../../schemas/agent-state.schema.js";
import type { AgentProgress } from "../../schemas/agent-state.schema.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";
import type { SwarmStatusData } from "../types.js";
import { theme, tc, isNoColor } from "../colors.js";
import { relativeTime } from "../time.js";

export type AgentFilterMode = "all" | "attention";

// ── Status icon mapping ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<AgentStatus, string> = {
  active: "\u25CF",
  idle: "\u25CB",
  needs_attention: "\u25B2",
  blocked: "\u2717",
  completed: "\u2713",
};

export function agentStatusIcon(
  status: string,
  heartbeatStale = false,
  processCrashed = false,
): string {
  if (processCrashed) {
    return "!";
  }

  if (heartbeatStale) {
    return "\u231b";
  }

  return STATUS_ICONS[status as AgentStatus] ?? "?";
}

// ── Color mapping ────────────────────────────────────────────────────────────

export interface StatusStyle {
  color: string | undefined;
  bold: boolean;
  dimColor: boolean;
}

export const STATUS_COLORS: Record<AgentStatus, StatusStyle> = {
  active: { color: "green", bold: false, dimColor: false },
  idle: { color: "gray", bold: false, dimColor: true },
  needs_attention: { color: "red", bold: true, dimColor: false },
  blocked: { color: "red", bold: false, dimColor: false },
  completed: { color: "gray", bold: false, dimColor: false },
};

const DEFAULT_STYLE: StatusStyle = {
  color: undefined,
  bold: false,
  dimColor: false,
};

const PROGRESS_BAR_WIDTH = 8;

export function agentNeedsAttention(agent: ObservedAgentState): boolean {
  return (
    agent.process_crashed ||
    agent.status === "needs_attention" ||
    agent.status === "blocked" ||
    agent.heartbeat_stale
  );
}

/** Resolve style for a given agent status, respecting NO_COLOR */
export function agentStatusStyle(
  status: string,
  heartbeatStale = false,
  processCrashed = false,
): StatusStyle {
  if (isNoColor()) {
    return DEFAULT_STYLE;
  }

  if (processCrashed) {
    return { color: "red", bold: true, dimColor: false };
  }

  if (heartbeatStale) {
    return { color: "yellow", bold: false, dimColor: true };
  }

  return STATUS_COLORS[status as AgentStatus] ?? DEFAULT_STYLE;
}

/** Filter agents based on the current filter mode */
export function filterAgents(
  agents: ObservedAgentState[],
  filterMode: AgentFilterMode,
): ObservedAgentState[] {
  if (filterMode === "attention") {
    return agents.filter((agent) => agentNeedsAttention(agent));
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

export interface AgentSidebarRow {
  key: string;
  text: string;
  selected: boolean;
  style: StatusStyle;
}

const ACTIVE_EXPERIMENT_HEADER = "Active Experiments";

function mutationTypeIcon(
  mutationType: SwarmStatusData["activeExperimentClaims"][number]["mutationType"],
): string {
  return mutationType === "runtime_config" ? "⚙" : "🌳";
}

export function buildActiveExperimentRows(
  activeClaims: SwarmStatusData["activeExperimentClaims"],
  innerWidth: number,
  nowMs = Date.now(),
): AgentSidebarRow[] {
  if (activeClaims.length === 0) {
    return [];
  }

  return [
    {
      key: "active-experiments-header",
      text: ACTIVE_EXPERIMENT_HEADER.padEnd(innerWidth).slice(0, innerWidth),
      selected: false,
      style: { color: tc(theme.primary), bold: true, dimColor: false },
    },
    ...activeClaims.map((claim, index) => ({
      key: `active-experiment-${claim.agentId}-${index}`,
      text: `${mutationTypeIcon(claim.mutationType)} ${claim.agentId} ${relativeTime(claim.claimedAt, nowMs)}`
        .padEnd(innerWidth)
        .slice(0, innerWidth),
      selected: false,
      style: {
        color: tc(theme.textMuted),
        bold: false,
        dimColor: false,
      },
    })),
  ];
}

export function buildAgentProgressBar(progress: AgentProgress): string {
  const total = Math.max(progress.total_criteria, 0);
  const completed = Math.min(Math.max(progress.completed_criteria, 0), total);
  const filled =
    total === 0
      ? 0
      : Math.min(
          PROGRESS_BAR_WIDTH,
          Math.round((completed / total) * PROGRESS_BAR_WIDTH),
        );

  return `[${"#".repeat(filled)}${".".repeat(PROGRESS_BAR_WIDTH - filled)}] ${completed}/${total}`;
}

export function selectedAgentRowIndex(
  agents: ObservedAgentState[],
  selectedIndex: number,
): number {
  if (selectedIndex < 0 || selectedIndex >= agents.length) {
    return 0;
  }

  let rowIndex = 0;
  for (let i = 0; i < selectedIndex; i += 1) {
    rowIndex += agents[i]?.progress ? 2 : 1;
  }

  return rowIndex;
}

export function buildAgentSidebarRows(
  agents: ObservedAgentState[],
  innerWidth: number,
  selectedIndex = -1,
  focused = false,
): AgentSidebarRow[] {
  return agents.flatMap((agent, agentIndex) => {
    const icon = agentStatusIcon(
      agent.status,
      agent.heartbeat_stale,
      agent.process_crashed,
    );
    const style = agentStatusStyle(
      agent.status,
      agent.heartbeat_stale,
      agent.process_crashed,
    );
    const task = agent.current_task ?? "";
    const isSelected = focused && agentIndex === selectedIndex;

    const iconWidth = 2;
    const taskSuffix = agent.progress ? "" : task ? ` ${task}` : "";
    const maxIdLen = Math.max(innerWidth - iconWidth - taskSuffix.length, 0);
    const truncatedId =
      maxIdLen === 0
        ? ""
        : agent.agent_id.length > maxIdLen
          ? agent.agent_id.slice(0, maxIdLen)
          : agent.agent_id;

    const agentRow: AgentSidebarRow = {
      key: agent.agent_id,
      text: `${icon} ${truncatedId}${taskSuffix}`
        .padEnd(innerWidth)
        .slice(0, innerWidth),
      selected: isSelected,
      style,
    };

    if (!agent.progress) {
      return [agentRow];
    }

    return [
      agentRow,
      {
        key: `${agent.agent_id}-progress`,
        text: buildAgentProgressBar(agent.progress)
          .padEnd(innerWidth)
          .slice(0, innerWidth),
        selected: isSelected,
        style,
      },
    ];
  });
}

interface AgentSidebarProps {
  agents: ObservedAgentState[];
  activeExperimentClaims?: SwarmStatusData["activeExperimentClaims"];
  width: number;
  height: number;
  agentFilter?: AgentFilterMode;
  selectedIndex?: number;
  focused?: boolean;
}

export function AgentSidebar({
  agents,
  activeExperimentClaims = [],
  width,
  height,
  agentFilter = "all",
  selectedIndex = -1,
  focused = false,
}: AgentSidebarProps) {
  const innerWidth = Math.max(width - 2, 1);
  const filtered = filterAgents(agents, agentFilter);
  const availableRows = Math.max(height - 1, 0);
  const rows = buildAgentSidebarRows(
    filtered,
    innerWidth,
    selectedIndex,
    focused,
  );
  const sidebarRows = [
    ...rows,
    ...buildActiveExperimentRows(activeExperimentClaims, innerWidth),
  ];
  const scrollStart = sidebarScrollStart(
    selectedAgentRowIndex(filtered, selectedIndex),
    sidebarRows.length,
    availableRows,
  );
  const visibleRows = sidebarRows.slice(
    scrollStart,
    scrollStart + availableRows,
  );

  const baseHeader = sidebarHeader(agentFilter);
  const posIndicator =
    filtered.length > availableRows
      ? ` ${selectedIndex + 1}/${filtered.length}`
      : "";
  const header = `${baseHeader}${posIndicator}`;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text bold color={tc(theme.primary)}>
        {header.padEnd(innerWidth)}
      </Text>
      {visibleRows.map((row) => {
        if (row.selected) {
          return (
            <Box key={row.key} width={innerWidth}>
              <Text
                backgroundColor={tc(theme.bgSelected)}
                color={tc(theme.textBright)}
                bold
              >
                {row.text}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={row.key} width={innerWidth}>
            <Text
              color={row.style.color}
              bold={row.style.bold}
              dimColor={row.style.dimColor}
            >
              {row.text}
            </Text>
          </Box>
        );
      })}
      {filtered.length === 0 && (
        <Text color={tc(theme.textMuted)}>
          {agents.length === 0 ? "No agents" : "No agents need attention"}
        </Text>
      )}
    </Box>
  );
}
