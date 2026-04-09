import { afterEach, describe, expect, it } from "vitest";
import {
  applyThemeConfig,
  DEFAULT_THEME,
  NAMED_THEMES,
  resetTheme,
  resolveTheme,
  theme,
} from "../colors.js";

describe("resolveTheme", () => {
  afterEach(() => {
    resetTheme();
  });

  it("bundles default, catppuccin, and tokyonight themes", () => {
    expect(NAMED_THEMES.default).toBeDefined();
    expect(NAMED_THEMES.catppuccin).toBeDefined();
    expect(NAMED_THEMES.tokyonight).toBeDefined();
  });

  it("merges named themes with custom hex overrides", () => {
    const resolved = resolveTheme({
      name: "tokyonight",
      colors: {
        primary: "#abcdef",
        borderFocused: "#123456",
      },
    });

    expect(resolved.bg).toBe(NAMED_THEMES.tokyonight.bg);
    expect(resolved.primary).toBe("#abcdef");
    expect(resolved.borderFocused).toBe("#123456");
  });

  it("falls back to prior defaults for invalid color overrides", () => {
    const resolved = resolveTheme({
      name: "catppuccin",
      colors: {
        primary: "not-a-color",
        secondary: "#123456",
      },
    });

    expect(resolved.primary).toBe(NAMED_THEMES.catppuccin.primary);
    expect(resolved.secondary).toBe("#123456");
  });

  it("falls back to the default theme for unknown theme names", () => {
    const resolved = resolveTheme("unknown-theme");

    expect(resolved).toEqual(DEFAULT_THEME);
  });
});

describe("applyThemeConfig", () => {
  afterEach(() => {
    resetTheme();
  });

  it("updates the shared theme object in place", () => {
    const activeTheme = applyThemeConfig("catppuccin");

    expect(activeTheme).toBe(theme);
    expect(theme.bg).toBe(NAMED_THEMES.catppuccin.bg);
  });
});
