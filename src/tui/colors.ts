// ── Shared color system ──────────────────────────────────────────────────────

/** Detect whether color output should be suppressed */
export function isNoColor(): boolean {
  return (
    process.env.NO_COLOR !== undefined ||
    process.env.TERM === "dumb"
  );
}

// ── Theme (OpenCode-inspired) ────────────────────────────────────────────────

export const theme = {
  // Backgrounds
  bg:            "#1a1a2e",   // main background (deep navy)
  bgPanel:       "#16213e",   // panel background (slightly lighter)
  bgDarker:      "#0f0f23",   // status bar / deeper elements
  bgSelected:    "#2a2a4e",   // selected row background

  // Text
  text:          "#e0e0e0",   // primary text
  textMuted:     "#6a6a6a",   // secondary/dim text
  textBright:    "#ffffff",   // emphasized text

  // Accents
  primary:       "#fab283",   // warm orange-gold
  secondary:     "#5c9cf5",   // blue
  accent:        "#9d7cd8",   // purple

  // Semantic
  success:       "#7fd88f",   // green
  warning:       "#f5a742",   // orange
  error:         "#e06c75",   // red
  info:          "#56b6c2",   // cyan

  // Borders
  border:        "#4b4c5c",   // normal border / divider
  borderFocused: "#fab283",   // focused panel border (= primary)
};

/** Theme color with NO_COLOR guard. Returns hex string or undefined. */
export function tc(hex: string): string | undefined {
  return isNoColor() ? undefined : hex;
}

/** Map priority to a theme color string, respecting NO_COLOR */
export function priorityColor(priority: string): string | undefined {
  if (isNoColor()) return undefined;
  switch (priority) {
    case "high": return theme.error;
    case "medium": return theme.warning;
    case "low": return theme.textMuted;
    default: return undefined;
  }
}

/** Short priority badge for tree display */
export function priorityBadge(priority: string): string {
  switch (priority) {
    case "high": return "[H]";
    case "medium": return "[M]";
    case "low": return "[L]";
    default: return "";
  }
}

/** Map story/epic status to a theme color */
export function statusThemeColor(status: string): string {
  switch (status) {
    case "in_progress":
    case "active":
      return theme.warning;
    case "done":
    case "complete":
      return theme.success;
    case "cancelled":
    case "archived":
      return theme.textMuted;
    default:
      return theme.text;
  }
}
