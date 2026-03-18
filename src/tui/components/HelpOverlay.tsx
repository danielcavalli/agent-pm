import React from "react";
import { Box, Text } from "ink";
import { theme, tc } from "../colors.js";

// ── Help Overlay ──────────────────────────────────────────────────────────────

export interface HelpOverlayProps {
  width: number;
  height: number;
}

interface KeyBinding {
  key: string;
  description: string;
}

interface KeyBindingGroup {
  category: string;
  bindings: KeyBinding[];
}

const KEYBINDING_GROUPS: KeyBindingGroup[] = [
  {
    category: "Navigation",
    bindings: [
      { key: "j / Down", description: "Move cursor down" },
      { key: "k / Up", description: "Move cursor up" },
      { key: "g", description: "Jump to top" },
      { key: "G", description: "Jump to bottom" },
      { key: "Ctrl+u", description: "Page up (half screen)" },
      { key: "Ctrl+d", description: "Page down (half screen)" },
      { key: "Mouse wheel", description: "Scroll focused panel" },
    ],
  },
  {
    category: "Panels",
    bindings: [
      { key: "Tab", description: "Cycle focus between panels" },
      { key: "a", description: "Toggle agent sidebar" },
      { key: "Enter", description: "Expand/collapse epic in tree" },
    ],
  },
  {
    category: "Actions",
    bindings: [
      { key: "x", description: "Dispatch agent for selected story/epic" },
      { key: "c / y", description: "Copy selected code to clipboard" },
      { key: "e", description: "Respond to escalation" },
      { key: "/", description: "Start search" },
      { key: "Esc", description: "Cancel search / reset filters" },
      { key: "q", description: "Quit" },
    ],
  },
  {
    category: "Filters",
    bindings: [
      { key: "f", description: "Cycle tree filter (or agent filter when sidebar focused)" },
      { key: "?", description: "Toggle this help overlay" },
    ],
  },
];

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  const lines: React.ReactNode[] = [];
  let keyIndex = 0;

  lines.push(
    <Box key="title" justifyContent="center" width={width}>
      <Text bold color={tc(theme.primary)}>
        Keyboard Shortcuts
      </Text>
    </Box>,
  );

  lines.push(
    <Box key="sep-title" width={width}>
      <Text color={tc(theme.border)}>{"\u2500".repeat(Math.min(width - 4, 60))}</Text>
    </Box>,
  );

  lines.push(<Box key="spacer-top" height={1} />);

  for (const group of KEYBINDING_GROUPS) {
    lines.push(
      <Box key={`cat-${group.category}`}>
        <Text bold color={tc(theme.primary)}>
          {group.category}
        </Text>
      </Box>,
    );

    for (const binding of group.bindings) {
      lines.push(
        <Box key={`kb-${keyIndex}`}>
          <Text>
            {"  "}
            <Text bold color={tc(theme.secondary)}>
              {binding.key.padEnd(14)}
            </Text>
            <Text color={tc(theme.text)}>{binding.description}</Text>
          </Text>
        </Box>,
      );
      keyIndex++;
    }

    lines.push(<Box key={`sep-${group.category}`} height={1} />);
  }

  lines.push(
    <Box key="dismiss-hint" justifyContent="center" width={width}>
      <Text color={tc(theme.textMuted)}>Press ? or Esc to dismiss</Text>
    </Box>,
  );

  const contentHeight = lines.length;
  const topPadding = Math.max(0, Math.floor((height - contentHeight) / 2));

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      paddingTop={topPadding}
      paddingLeft={2}
      backgroundColor={tc(theme.bgDarker)}
    >
      {lines}
    </Box>
  );
}
