import React from "react";
import { Box, Text } from "ink";
import type { EpicNode, TreeNode, FilterMode, StoryNode } from "../types.js";

// ── Status icons ─────────────────────────────────────────────────────────────

export function statusIcon(status: string): string {
  switch (status) {
    case "backlog":
      return "○";
    case "in_progress":
      return "●";
    case "done":
    case "complete":
      return "✓";
    case "cancelled":
      return "✗";
    case "active":
      return "●";
    case "paused":
      return "○";
    case "archived":
      return "✗";
    default:
      return "○";
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
        const indent = "  ".repeat(row.depth);
        const node = row.node;
        const icon = statusIcon(node.status);
        const color = statusColor(node.status) as Parameters<
          typeof Text
        >[0]["color"];

        let label: string;
        if (node.kind === "epic") {
          const expandIcon = node.expanded ? "▼" : "▶";
          label = `${indent}${expandIcon} ${icon} ${node.code} ${node.title}`;
        } else {
          const story = node as StoryNode;
          let badge = "";
          if (story.resolution_type === "conflict") {
            badge = " ≋conflict";
          } else if (story.resolution_type === "gap") {
            badge = " ≋gap";
          }
          label = `${indent}  ${icon} ${story.code} ${story.title}${badge}`;
        }

        // Truncate to panel width
        const maxLen = width - 1;
        if (label.length > maxLen) {
          label = label.slice(0, maxLen - 1) + "…";
        }

        return (
          <Box key={row.key}>
            <Text
              backgroundColor={isSelected ? "blue" : undefined}
              bold={isSelected}
              color={isSelected ? "white" : color}
            >
              {label.padEnd(width - 1)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
