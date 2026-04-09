import React from "react";
import { Box, Text } from "ink";
import type { FilterMode, FocusedPanel, SwarmStatusData } from "../types.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";
import { agentNeedsAttention } from "./AgentSidebar.js";
import { theme, tc } from "../colors.js";

// ── Status Bar ────────────────────────────────────────────────────────────────

export interface StatusBarProps {
  selectedCode: string;
  filter: FilterMode;
  search: string;
  searching: boolean;
  message: string;
  width: number;
  agents?: ObservedAgentState[];
  sidebarHidden?: boolean;
  focusedPanel?: FocusedPanel;
  dispatchAvailable?: boolean;
  swarmStatus?: SwarmStatusData | null;
}

interface StatusBarSegment {
  text: string;
  color?: string;
}

export function agentCountSummary(agents: ObservedAgentState[]): string {
  if (agents.length === 0) return "";
  const needsAttention = agents.filter((agent) =>
    agentNeedsAttention(agent),
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
      return `[j/k] nav  [Enter] expand  [s] status  [f] filter  [/] search${dispatchHint}`;
    case "sidebar":
      return "[j/k] nav  [f] filter  [e] respond  [K] kill";
    case "detail":
      return "[j/k] scroll";
    default:
      return "[j/k] nav";
  }
}

export function swarmTrendColor(trendColor: string): string | undefined {
  switch (trendColor) {
    case "green":
      return tc(theme.success);
    case "yellow":
      return tc(theme.warning);
    case "red":
      return tc(theme.error);
    default:
      return tc(theme.textMuted);
  }
}

export function buildStatusBarSegments(options: {
  selectedCode: string;
  filter: FilterMode;
  agents?: ObservedAgentState[];
  sidebarHidden?: boolean;
  focusedPanel?: FocusedPanel;
  dispatchAvailable?: boolean;
  swarmStatus?: SwarmStatusData | null;
}): StatusBarSegment[] {
  const {
    selectedCode,
    filter,
    agents = [],
    sidebarHidden = false,
    focusedPanel = "tree",
    dispatchAvailable = false,
    swarmStatus = null,
  } = options;

  const filterLabels: Record<FilterMode, string> = {
    all: "All",
    backlog: "Backlog",
    in_progress: "In Progress",
    done: "Done",
  };

  const agentSummary = agentCountSummary(agents);
  const attentionCount = agents.filter((agent) =>
    agentNeedsAttention(agent),
  ).length;
  const hiddenAttentionIndicator =
    sidebarHidden && attentionCount > 0
      ? `  [! ${attentionCount} agent${attentionCount === 1 ? "" : "s"} need attention]`
      : "";
  const contextKeys = buildContextKeys(focusedPanel, dispatchAvailable);
  const universalKeys = "[Tab] panel  [?] help  [q] quit";
  const agentPart = agentSummary && !sidebarHidden ? `  | ${agentSummary}` : "";
  const codeSegment = selectedCode ? ` ${selectedCode}` : "";
  const filterSegment = ` [${filterLabels[filter]}]`;
  const keysSegment = `  ${contextKeys}  ${universalKeys}`;
  const baseText = `${codeSegment}${filterSegment}${keysSegment}${agentPart}${hiddenAttentionIndicator}`;

  if (!swarmStatus) {
    return [{ text: baseText }];
  }

  const bestScore =
    swarmStatus.bestScore === null ? "--" : swarmStatus.bestScore.toFixed(2);

  return [
    {
      text: `${baseText}  | Swarm: ${swarmStatus.experimentCount} experiments | `,
    },
    {
      text: swarmStatus.trend,
      color: swarmTrendColor(swarmStatus.trendColor),
    },
    {
      text: ` | best: ${bestScore}`,
    },
  ];
}

export function flattenStatusBarSegments(segments: StatusBarSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

export function fitStatusBarSegments(
  segments: StatusBarSegment[],
  width: number,
): StatusBarSegment[] {
  const fullText = flattenStatusBarSegments(segments);

  if (fullText.length <= width - 1) {
    const padded = segments.map((segment) => ({ ...segment }));
    const padding = width - fullText.length;
    if (padding > 0) {
      if (padded.length === 0) {
        padded.push({ text: " ".repeat(padding) });
      } else {
        padded[padded.length - 1] = {
          ...padded[padded.length - 1],
          text: padded[padded.length - 1].text + " ".repeat(padding),
        };
      }
    }
    return padded;
  }

  const maxVisibleChars = Math.max(width - 2, 0);
  const truncated: StatusBarSegment[] = [];
  let remaining = maxVisibleChars;

  for (const segment of segments) {
    if (remaining <= 0) {
      break;
    }
    if (segment.text.length <= remaining) {
      truncated.push({ ...segment });
      remaining -= segment.text.length;
      continue;
    }

    truncated.push({
      ...segment,
      text: segment.text.slice(0, remaining),
    });
    remaining = 0;
  }

  if (truncated.length === 0) {
    return [{ text: "\u2026" }];
  }

  truncated[truncated.length - 1] = {
    ...truncated[truncated.length - 1],
    text: `${truncated[truncated.length - 1].text}\u2026`,
  };

  return truncated;
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
  swarmStatus = null,
}: StatusBarProps) {
  if (searching) {
    const searchBar = ` Search: ${search}\u2588  [Esc] cancel`;
    const truncSearch =
      searchBar.length > width - 1
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
    const truncMsg =
      msgBar.length > width - 1
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

  const segments = fitStatusBarSegments(
    buildStatusBarSegments({
      selectedCode,
      filter,
      agents,
      sidebarHidden,
      focusedPanel,
      dispatchAvailable,
      swarmStatus,
    }),
    width,
  );

  return (
    <Box width={width} height={1}>
      {segments.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          backgroundColor={tc(theme.bgDarker)}
          color={segment.color ?? tc(theme.textMuted)}
        >
          {segment.text}
        </Text>
      ))}
    </Box>
  );
}
