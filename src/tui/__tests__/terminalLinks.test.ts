import { describe, expect, it } from "vitest";
import {
  buildStoryUrl,
  formatTerminalLink,
  injectStoryLink,
  supportsTerminalLinks,
} from "../terminalLinks.js";

describe("terminalLinks", () => {
  it("detects iTerm2 support", () => {
    expect(supportsTerminalLinks({ env: { TERM_PROGRAM: "iTerm.app" } })).toBe(
      true,
    );
  });

  it("detects kitty support", () => {
    expect(supportsTerminalLinks({ env: { TERM: "xterm-kitty" } })).toBe(true);
  });

  it("detects VTE support", () => {
    expect(supportsTerminalLinks({ env: { VTE_VERSION: "6000" } })).toBe(true);
  });

  it("treats Apple Terminal as unsupported", () => {
    expect(
      supportsTerminalLinks({ env: { TERM_PROGRAM: "Apple_Terminal" } }),
    ).toBe(false);
  });

  it("disables hyperlinks inside tmux by default", () => {
    expect(
      supportsTerminalLinks({
        env: {
          TMUX: "/tmp/tmux-1000/default,1234,0",
          TERM_PROGRAM: "iTerm.app",
        },
      }),
    ).toBe(false);
  });

  it("supports explicit override", () => {
    expect(
      supportsTerminalLinks({ env: { PM_TUI_HYPERLINKS: "always" } }),
    ).toBe(true);
  });

  it("builds a story URL from the template", () => {
    expect(
      buildStoryUrl("https://example.com/stories/{code}", "PM-E069-S003"),
    ).toBe("https://example.com/stories/PM-E069-S003");
  });

  it("wraps a label with OSC 8 sequences", () => {
    expect(
      formatTerminalLink("PM-E069-S003", "https://example.com", true),
    ).toBe(
      "\u001B]8;;https://example.com\u001B\\PM-E069-S003\u001B]8;;\u001B\\",
    );
  });

  it("injects only the story code into a tree label", () => {
    const result = injectStoryLink(
      "    ○ [M] PM-E069-S003 Evaluate terminal link support",
      "PM-E069-S003",
      "https://example.com/stories/{code}",
      true,
    );

    expect(result).toContain("https://example.com/stories/PM-E069-S003");
    expect(result).toContain("Evaluate terminal link support");
  });
});
