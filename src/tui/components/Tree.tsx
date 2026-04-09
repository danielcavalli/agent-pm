import React from "react";
import { Box, Text } from "ink";
import type { EpicNode, TreeNode, FilterMode, StoryNode } from "../types.js";
import { theme, tc, priorityBadge, statusThemeColor } from "../colors.js";
import { injectStoryLink } from "../terminalLinks.js";

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

export interface RowPart {
  text: string;
  color?: string;
}

interface StatusChip {
  text: string;
  color: string;
}

const COLLAPSED_EPIC_STATUS_ORDER = [
  "in_progress",
  "backlog",
  "done",
  "cancelled",
] as const;

function truncateText(value: string, width: number): string {
  if (width <= 0) return "";
  if (value.length <= width) return value;
  if (width === 1) return "\u2026";
  return value.slice(0, width - 1) + "\u2026";
}

function truncateParts(parts: RowPart[], width: number): RowPart[] {
  if (width <= 0) {
    return [];
  }

  const truncated: RowPart[] = [];
  let remaining = width;

  for (const part of parts) {
    if (remaining <= 0) {
      break;
    }

    if (part.text.length <= remaining) {
      truncated.push(part);
      remaining -= part.text.length;
      continue;
    }

    truncated.push({ ...part, text: truncateText(part.text, remaining) });
    break;
  }

  return truncated;
}

export function collapsedEpicStatusChips(stories: StoryNode[]): StatusChip[] {
  const counts = {
    in_progress: 0,
    backlog: 0,
    done: 0,
    cancelled: 0,
  };

  for (const story of stories) {
    counts[story.status] += 1;
  }

  return COLLAPSED_EPIC_STATUS_ORDER.flatMap((status) => {
    const count = counts[status];
    if (count === 0) {
      return [];
    }

    switch (status) {
      case "in_progress":
        return [{ text: `${count} active`, color: theme.warning }];
      case "backlog":
        return [{ text: `${count} backlog`, color: theme.info }];
      case "done":
        return [{ text: `${count} done`, color: theme.success }];
      case "cancelled":
        return [{ text: `${count} canceled`, color: theme.error }];
    }
  });
}

export function buildTreeRowParts(row: FlatRow, width: number): RowPart[] {
  const node = row.node;
  const icon = statusIcon(node.status);
  const sColor = statusThemeColor(node.status);

  if (node.kind === "epic") {
    const expandIcon = node.expanded ? "\u25BC" : "\u25B6";
    const indent = row.depth > 0 ? "  " : "";
    const prefix = `${indent}${expandIcon} ${icon} ${node.code} `;
    const parts: RowPart[] = [{ text: prefix, color: sColor }];

    if (!node.expanded) {
      const chips = collapsedEpicStatusChips(node.stories);
      const chipParts: RowPart[] = [];
      if (chips.length > 0) {
        chipParts.push({ text: " ", color: sColor });
        chips.forEach((chip, index) => {
          if (index > 0) {
            chipParts.push({ text: " | ", color: theme.textMuted });
          }
          chipParts.push({ text: chip.text, color: chip.color });
        });
      }

      const chipWidth = chipParts.reduce(
        (sum, part) => sum + part.text.length,
        0,
      );
      const titleWidth = Math.max(0, width - prefix.length - chipWidth);
      parts.push({ text: truncateText(node.title, titleWidth), color: sColor });
      parts.push(...chipParts);
    } else {
      const total = node.stories.length;
      const done = node.stories.filter((s) => s.status === "done").length;
      const progress = total > 0 ? ` [${done}/${total}]` : "";
      const titleWidth = Math.max(0, width - prefix.length - progress.length);
      parts.push({ text: truncateText(node.title, titleWidth), color: sColor });
      if (progress) {
        parts.push({ text: progress, color: theme.textMuted });
      }
    }

    return truncateParts(parts, width);
  }

  const story = node as StoryNode;
  const pBadge = priorityBadge(story.priority);
  let badge = "";
  if (story.resolution_type === "conflict") {
    badge = " ~conflict";
  } else if (story.resolution_type === "gap") {
    badge = " ~gap";
  }

  return truncateParts(
    [
      {
        text: truncateText(
          `    ${icon} ${pBadge} ${story.code} ${story.title}${badge}`,
          width,
        ),
        color: sColor,
      },
    ],
    width,
  );
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

export function treeScrollStart(
  cursor: number,
  rowCount: number,
  height: number,
): number {
  if (rowCount <= 0 || height <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), rowCount - height),
  );
}

// ── Tree Panel ────────────────────────────────────────────────────────────────

export interface TreePanelProps {
  rows: FlatRow[];
  cursor: number;
  width: number;
  height: number;
  storyLinkTemplate?: string;
  hyperlinksEnabled?: boolean;
}

export function TreePanel({
  rows,
  cursor,
  width,
  height,
  storyLinkTemplate,
  hyperlinksEnabled = false,
}: TreePanelProps) {
  // Scroll window: keep cursor visible
  const scrollStart = treeScrollStart(cursor, rows.length, height);
  const visible = rows.slice(scrollStart, scrollStart + height);

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {visible.map((row, i) => {
        const idx = scrollStart + i;
        const isSelected = idx === cursor;
        const node = row.node;
        const rawParts = buildTreeRowParts(row, width);
        const contentWidth = rawParts.reduce(
          (sum, part) => sum + part.text.length,
          0,
        );
        const parts =
          contentWidth < width
            ? [...rawParts, { text: " ".repeat(width - contentWidth) }]
            : rawParts;

        if (node.kind === "story") {
          const storyText = parts
            .map((part) => part.text)
            .join("")
            .padEnd(width);
          const linkedText = injectStoryLink(
            storyText,
            node.code,
            storyLinkTemplate,
            hyperlinksEnabled,
          );

          if (isSelected) {
            return (
              <Box key={row.key} width={width}>
                <Text
                  backgroundColor={tc(theme.bgSelected)}
                  color={tc(theme.textBright)}
                  bold
                >
                  {linkedText}
                </Text>
              </Box>
            );
          }

          return (
            <Box key={row.key} width={width}>
              <Text
                color={tc(parts[0]?.color ?? statusThemeColor(node.status))}
              >
                {linkedText}
              </Text>
            </Box>
          );
        }

        if (isSelected) {
          return (
            <Box key={row.key} width={width}>
              {parts.map((part, partIndex) => (
                <Text
                  key={`${row.key}-${partIndex}`}
                  backgroundColor={tc(theme.bgSelected)}
                  color={tc(part.color ?? theme.textBright)}
                  bold
                >
                  {part.text}
                </Text>
              ))}
            </Box>
          );
        }

        return (
          <Box key={row.key} width={width}>
            {parts.map((part, partIndex) => (
              <Text
                key={`${row.key}-${partIndex}`}
                color={part.color ? tc(part.color) : undefined}
              >
                {part.text}
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
