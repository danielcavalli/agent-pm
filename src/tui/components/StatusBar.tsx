import React from "react";
import { Box, Text } from "ink";
import type { FilterMode } from "../types.js";

// ── Status Bar ────────────────────────────────────────────────────────────────

export interface StatusBarProps {
  selectedCode: string;
  filter: FilterMode;
  search: string;
  searching: boolean;
  message: string;
  width: number;
}

export function StatusBar({
  selectedCode,
  filter,
  search,
  searching,
  message,
  width,
}: StatusBarProps) {
  const filterLabels: Record<FilterMode, string> = {
    all: "All",
    backlog: "Backlog",
    in_progress: "In Progress",
    done: "Done",
  };

  const legend = searching
    ? `Search: ${search}█  [Esc] cancel`
    : `${selectedCode}  [f] filter:${filterLabels[filter]}  [/] search  [c] copy  [q] quit`;

  const bar = message || legend;
  const truncated =
    bar.length > width - 2 ? bar.slice(0, width - 3) + "…" : bar;

  return (
    <Box width={width} height={1}>
      <Text backgroundColor="blue" color="white">
        {" " + truncated.padEnd(width - 1)}
      </Text>
    </Box>
  );
}
