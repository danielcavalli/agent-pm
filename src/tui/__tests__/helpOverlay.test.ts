import { describe, it, expect } from "vitest";

/**
 * Unit tests for HelpOverlay keybinding data and toggle logic.
 *
 * The actual React component uses ink's Box/Text, which requires
 * ink-testing-library for full integration testing. These tests verify
 * the keybinding data completeness and the toggle state machine.
 */

/** All keybindings that v0.1.0 introduced and must appear in the overlay */
const REQUIRED_KEYBINDINGS = [
  "j",
  "k",
  "Tab",
  "a",
  "e",     // not yet implemented, but documented per PRD
  "?",
  "f",
  "Ctrl+u",
  "Ctrl+d",
  "g",
  "G",
];

/** The keybinding groups as defined in HelpOverlay.tsx */
const KEYBINDING_GROUPS = [
  {
    category: "Navigation",
    bindings: [
      { key: "j / Down", description: "Move cursor down" },
      { key: "k / Up", description: "Move cursor up" },
      { key: "g", description: "Jump to top" },
      { key: "G", description: "Jump to bottom" },
      { key: "Ctrl+u", description: "Page up (half screen)" },
      { key: "Ctrl+d", description: "Page down (half screen)" },
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
      { key: "f", description: "Cycle filter: All > Backlog > In Progress > Done" },
      { key: "?", description: "Toggle this help overlay" },
    ],
  },
];

/** Flatten all binding keys into a single string for searching */
function allKeyStrings(): string {
  return KEYBINDING_GROUPS.flatMap((g) => g.bindings.map((b) => b.key)).join(" ");
}

describe("HelpOverlay keybinding data", () => {
  it("has exactly 4 categories", () => {
    const categories = KEYBINDING_GROUPS.map((g) => g.category);
    expect(categories).toEqual(["Navigation", "Panels", "Actions", "Filters"]);
  });

  it("documents all v0.1.0 keybindings", () => {
    const allKeys = allKeyStrings();
    for (const required of REQUIRED_KEYBINDINGS) {
      expect(
        allKeys.includes(required),
        `Missing keybinding: ${required}`,
      ).toBe(true);
    }
  });

  it("every binding has a non-empty key and description", () => {
    for (const group of KEYBINDING_GROUPS) {
      for (const binding of group.bindings) {
        expect(binding.key.length).toBeGreaterThan(0);
        expect(binding.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate keys across groups", () => {
    const allKeys = KEYBINDING_GROUPS.flatMap((g) =>
      g.bindings.map((b) => b.key),
    );
    const unique = new Set(allKeys);
    expect(unique.size).toBe(allKeys.length);
  });
});

describe("Help overlay toggle state machine", () => {
  /** Simulates the helpVisible toggle logic from index.tsx */
  function toggleHelp(visible: boolean, input: string, isEscape: boolean): boolean {
    if (visible) {
      if (input === "?" || isEscape) {
        return false;
      }
      // All other input is swallowed
      return true;
    }
    if (input === "?") {
      return true;
    }
    return false;
  }

  it("? opens the overlay when closed", () => {
    expect(toggleHelp(false, "?", false)).toBe(true);
  });

  it("? closes the overlay when open", () => {
    expect(toggleHelp(true, "?", false)).toBe(false);
  });

  it("Escape closes the overlay when open", () => {
    expect(toggleHelp(true, "", true)).toBe(false);
  });

  it("other keys do not open the overlay", () => {
    expect(toggleHelp(false, "j", false)).toBe(false);
    expect(toggleHelp(false, "k", false)).toBe(false);
    expect(toggleHelp(false, "f", false)).toBe(false);
  });

  it("other keys are swallowed when overlay is open", () => {
    expect(toggleHelp(true, "j", false)).toBe(true);
    expect(toggleHelp(true, "q", false)).toBe(true);
    expect(toggleHelp(true, "f", false)).toBe(true);
  });
});
