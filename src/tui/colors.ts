import type { ProjectTheme } from "../schemas/index.js";

// ── Shared color system ──────────────────────────────────────────────────────

/** Detect whether color output should be suppressed */
export function isNoColor(): boolean {
  return process.env.NO_COLOR !== undefined || process.env.TERM === "dumb";
}

// ── Theme (OpenCode-inspired) ────────────────────────────────────────────────

export const THEME_TOKENS = [
  "bg",
  "bgPanel",
  "bgDarker",
  "bgSelected",
  "text",
  "textMuted",
  "textBright",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "error",
  "info",
  "border",
  "borderFocused",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColors = Record<ThemeToken, string>;

export const DEFAULT_THEME: ThemeColors = {
  // Backgrounds
  bg: "#1a1a2e", // main background (deep navy)
  bgPanel: "#16213e", // panel background (slightly lighter)
  bgDarker: "#0f0f23", // status bar / deeper elements
  bgSelected: "#2a2a4e", // selected row background

  // Text
  text: "#e0e0e0", // primary text
  textMuted: "#6a6a6a", // secondary/dim text
  textBright: "#ffffff", // emphasized text

  // Accents
  primary: "#fab283", // warm orange-gold
  secondary: "#5c9cf5", // blue
  accent: "#9d7cd8", // purple

  // Semantic
  success: "#7fd88f", // green
  warning: "#f5a742", // orange
  error: "#e06c75", // red
  info: "#56b6c2", // cyan

  // Borders
  border: "#4b4c5c", // normal border / divider
  borderFocused: "#fab283", // focused panel border (= primary)
};

export const NAMED_THEMES: Record<string, ThemeColors> = {
  default: { ...DEFAULT_THEME },
  catppuccin: {
    bg: "#1e1e2e",
    bgPanel: "#313244",
    bgDarker: "#181825",
    bgSelected: "#45475a",
    text: "#cdd6f4",
    textMuted: "#9399b2",
    textBright: "#f5e0dc",
    primary: "#f5c2e7",
    secondary: "#89b4fa",
    accent: "#cba6f7",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    info: "#89dceb",
    border: "#6c7086",
    borderFocused: "#f5c2e7",
  },
  tokyonight: {
    bg: "#1a1b26",
    bgPanel: "#24283b",
    bgDarker: "#16161e",
    bgSelected: "#2f334d",
    text: "#c0caf5",
    textMuted: "#565f89",
    textBright: "#ffffff",
    primary: "#7aa2f7",
    secondary: "#2ac3de",
    accent: "#bb9af7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    info: "#7dcfff",
    border: "#414868",
    borderFocused: "#7aa2f7",
  },
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const theme: ThemeColors = { ...DEFAULT_THEME };

function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function themeConfigParts(config?: ProjectTheme): {
  name?: string;
  colors?: Partial<Record<ThemeToken, string>>;
} {
  if (!config) {
    return {};
  }

  if (typeof config === "string") {
    return { name: config };
  }

  return {
    name: config.name,
    colors: config.colors,
  };
}

export function resolveTheme(config?: ProjectTheme): ThemeColors {
  const { name, colors } = themeConfigParts(config);
  const namedTheme = name ? NAMED_THEMES[name.toLowerCase()] : undefined;
  const resolved: ThemeColors = {
    ...DEFAULT_THEME,
    ...(namedTheme ?? {}),
  };

  if (!colors) {
    return resolved;
  }

  for (const token of THEME_TOKENS) {
    const value = colors[token];
    if (typeof value === "string" && isValidHexColor(value)) {
      resolved[token] = value;
    }
  }

  return resolved;
}

export function applyThemeConfig(config?: ProjectTheme): ThemeColors {
  const resolved = resolveTheme(config);
  Object.assign(theme, resolved);
  return theme;
}

export function resetTheme(): ThemeColors {
  return applyThemeConfig();
}

/** Theme color with NO_COLOR guard. Returns hex string or undefined. */
export function tc(hex: string): string | undefined {
  return isNoColor() ? undefined : hex;
}

/** Map priority to a theme color string, respecting NO_COLOR */
export function priorityColor(priority: string): string | undefined {
  if (isNoColor()) return undefined;
  switch (priority) {
    case "high":
      return theme.error;
    case "medium":
      return theme.warning;
    case "low":
      return theme.textMuted;
    default:
      return undefined;
  }
}

/** Short priority badge for tree display */
export function priorityBadge(priority: string): string {
  switch (priority) {
    case "high":
      return "[H]";
    case "medium":
      return "[M]";
    case "low":
      return "[L]";
    default:
      return "";
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
