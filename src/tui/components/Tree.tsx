import React from "react";
import { Box, Text } from "ink";
import type { EpicNode, TreeNode, FilterMode, StoryNode } from "../types.js";
import { theme, tc, priorityColor, priorityBadge, statusThemeColor } from "../colors.js";

// ── Status icons ─────────────────────────────────────────────────────────────

export function statusIcon(status: string): string {
  switch (status) {
    case "backlog":
      return "\u25CB";
    case "in_progress":
      return "\u25CF";
    case "done":
    case "complete":
      return "\u2713";
    case "cancelled":
      return "\u2717";
    case "active":
      return "\u25CF";
    case "paused":
      return "\u25CB";
    case "archived":
      return "\u2717";
    default:
      return "\u25CB";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
    case "active":
      return "yellow";
    case "done":
    case "complete":
      return "green";
    case "cancelled":
    case "archived":
      return "gray";
    default:
      return "white";
  }
}

// ── Flatten tree into visible rows ───────────────────────────────────────────

export interface FlatRow {
  node: TreeNode;
  depth: number;
  key: string;
}

export function flattenTree(
  epics: EpicNode[],
  filter: FilterMode,
  search: string,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const searchLower = search.toLowerCase();

  function matchesFilter(status: string): boolean {
    if (filter === "all") return true;
    if (filter === "backlog") return status === "backlog";
    if (filter === "in_progress") return status === "in_progress";
    if (filter === "done") return status === "done" || status === "complete";
    return true;
  }

  function matchesSearch(title: string, code: string): boolean {
    if (!searchLower) return true;
    return (
      title.toLowerCase().includes(searchLower) ||
      code.toLowerCase().includes(searchLower)
    );
  }

  for (const epic of epics) {
    rows.push({ node: epic, depth: 0, key: epic.code });

    if (!epic.expanded) continue;

    for (const story of epic.stories) {
      if (!matchesFilter(story.status)) continue;
      if (!matchesSearch(story.title, story.code)) continue;
      rows.push({ node: story, depth: 1, key: story.code });
    }
  }

  return rows;
}

// ── Tree Panel ────────────────────────────────────────────────────────────────

export interface TreePanelProps {
  rows: FlatRow[];
  cursor: number;
  width: number;
  height: number;
}

export function TreePanel({ rows, cursor, width, height }: TreePanelProps) {
  // Scroll window: keep cursor visible
  const scrollStart = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), rows.length - height),
  );
  const visible = rows.slice(scrollStart, scrollStart + height);

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {visible.map((row, i) => {
        const idx = scrollStart + i;
        const isSelected = idx === cursor;
        const node = row.node;
        const icon = statusIcon(node.status);
        const sColor = statusThemeColor(node.status);

        let label: string;
        if (node.kind === "epic") {
          const expandIcon = node.expanded ? "\u25BC" : "\u25B6";
          const total = node.stories.length;
          const done = node.stories.filter(s => s.status === "done").length;
          const progress = total > 0 ? ` [${done}/${total}]` : "";
          const indent = row.depth > 0 ? "  " : "";
          label = `${indent}${expandIcon} ${icon} ${node.code} ${node.title}${progress}`;
        } else {
          const story = node as StoryNode;
          const pBadge = priorityBadge(story.priority);
          let badge = "";
          if (story.resolution_type === "conflict") {
            badge = " ~conflict";
          } else if (story.resolution_type === "gap") {
            badge = " ~gap";
          }
          label = `    ${icon} ${pBadge} ${story.code} ${story.title}${badge}`;
        }

        // Truncate to panel width
        const maxLen = width;
        if (label.length > maxLen) {
          label = label.slice(0, maxLen - 1) + "\u2026";
        } else {
          label = label.padEnd(maxLen);
        }

        if (isSelected) {
          return (
            <Box key={row.key} width={width}>
              <Text backgroundColor={tc(theme.bgSelected)} color={tc(theme.textBright)} bold>
                {label}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={row.key} width={width}>
            <Text color={tc(sColor)}>
              {label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
