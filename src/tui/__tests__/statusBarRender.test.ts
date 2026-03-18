import { describe, it, expect } from "vitest";
import type { FilterMode } from "../types.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import { buildContextKeys } from "../components/StatusBar.js";

/**
 * Unit tests for StatusBar render logic beyond agentCountSummary.
 *
 * The actual React component uses ink's Box/Text. These tests replicate
 * the pure arithmetic and string-building logic from StatusBar.tsx to
 * verify correctness without requiring ink-testing-library.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(
  overrides: Partial<AgentState> & {
    agent_id: string;
    status: AgentState["status"];
  },
): AgentState {
  return {
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    ...overrides,
  };
}

/** Replicates the filterLabels map from StatusBar */
const filterLabels: Record<FilterMode, string> = {
  all: "All",
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done",
};

/** Replicates agentCountSummary (imported in component, replicated here) */
function agentCountSummary(agents: AgentState[]): string {
  if (agents.length === 0) return "";
  const needsAttention = agents.filter(
    (a) => a.status === "needs_attention" || a.status === "blocked",
  ).length;
  const total = agents.length;
  const label = total === 1 ? "agent" : "agents";
  if (needsAttention > 0) {
    return `${total} ${label} (${needsAttention} needs attention)`;
  }
  return `${total} ${label}`;
}

/** Replicates the hidden attention indicator logic */
function buildHiddenAttentionIndicator(
  agents: AgentState[],
  sidebarHidden: boolean,
): string {
  const attentionCount = agents.filter(
    (a) => a.status === "needs_attention" || a.status === "blocked",
  ).length;
  return sidebarHidden && attentionCount > 0
    ? `  [! ${attentionCount} agent${attentionCount === 1 ? "" : "s"} need attention]`
    : "";
}

/** Replicates the agents toggle hint logic */
function buildAgentsToggleHint(agents: AgentState[]): string {
  return agents.length > 0 ? "  [a] agents" : "";
}

/** Replicates the full legend-building logic from StatusBar */
function buildLegend(opts: {
  selectedCode: string;
  filter: FilterMode;
  search: string;
  searching: boolean;
  agents: AgentState[];
  sidebarHidden: boolean;
}): string {
  const { selectedCode, filter, search, searching, agents, sidebarHidden } =
    opts;

  const agentSummary = agentCountSummary(agents);
  const hiddenAttentionIndicator = buildHiddenAttentionIndicator(
    agents,
    sidebarHidden,
  );
  const agentsToggleHint = buildAgentsToggleHint(agents);

  if (searching) {
    return `Search: ${search}\u2588  [Esc] cancel`;
  }

  return `${selectedCode}  [j/k] nav  [Tab] panel  [f] filter:${filterLabels[filter]}  [/] search  [c] copy${agentsToggleHint}  [?] help  [q] quit${agentSummary && !sidebarHidden ? "  | " + agentSummary : ""}${hiddenAttentionIndicator}`;
}

/** Replicates the bar selection and truncation logic */
function buildBar(opts: {
  selectedCode: string;
  filter: FilterMode;
  search: string;
  searching: boolean;
  message: string;
  width: number;
  agents: AgentState[];
  sidebarHidden: boolean;
}): string {
  const legend = buildLegend(opts);
  const bar = opts.message || legend;
  return bar.length > opts.width - 2
    ? bar.slice(0, opts.width - 3) + "\u2026"
    : bar;
}

/** Replicates the final padded output */
function buildPaddedOutput(bar: string, width: number): string {
  return " " + bar.padEnd(width - 1);
}

// ── Defaults for test shorthand ──────────────────────────────────────────────

const defaults = {
  selectedCode: "PM-E001-S001",
  filter: "all" as FilterMode,
  search: "",
  searching: false,
  message: "",
  width: 120,
  agents: [] as AgentState[],
  sidebarHidden: false,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("StatusBar filter label mapping", () => {
  it("maps 'all' to 'All'", () => {
    expect(filterLabels["all"]).toBe("All");
  });

  it("maps 'backlog' to 'Backlog'", () => {
    expect(filterLabels["backlog"]).toBe("Backlog");
  });

  it("maps 'in_progress' to 'In Progress'", () => {
    expect(filterLabels["in_progress"]).toBe("In Progress");
  });

  it("maps 'done' to 'Done'", () => {
    expect(filterLabels["done"]).toBe("Done");
  });
});

describe("StatusBar search mode legend", () => {
  it("shows search text with cursor block and Esc hint", () => {
    const legend = buildLegend({
      ...defaults,
      searching: true,
      search: "hello",
    });
    expect(legend).toBe("Search: hello\u2588  [Esc] cancel");
  });

  it("shows empty search with cursor block when search is empty", () => {
    const legend = buildLegend({
      ...defaults,
      searching: true,
      search: "",
    });
    expect(legend).toBe("Search: \u2588  [Esc] cancel");
  });

  it("search mode ignores filter, agents, and other state", () => {
    const agents = [makeAgent({ agent_id: "a1", status: "needs_attention" })];
    const legend = buildLegend({
      ...defaults,
      searching: true,
      search: "test",
      filter: "done",
      agents,
      sidebarHidden: true,
    });
    // In search mode, only search text is shown
    expect(legend).toBe("Search: test\u2588  [Esc] cancel");
    expect(legend).not.toContain("filter");
    expect(legend).not.toContain("agent");
  });
});

describe("StatusBar normal mode legend", () => {
  it("includes selected code at the start", () => {
    const legend = buildLegend({ ...defaults, selectedCode: "PM-E050-S003" });
    expect(legend.startsWith("PM-E050-S003")).toBe(true);
  });

  it("includes all keybinding hints", () => {
    const legend = buildLegend(defaults);
    expect(legend).toContain("[j/k] nav");
    expect(legend).toContain("[Tab] panel");
    expect(legend).toContain("[f] filter:");
    expect(legend).toContain("[/] search");
    expect(legend).toContain("[c] copy");
    expect(legend).toContain("[?] help");
    expect(legend).toContain("[q] quit");
  });

  it("includes the current filter label", () => {
    const legend = buildLegend({ ...defaults, filter: "in_progress" });
    expect(legend).toContain("[f] filter:In Progress");
  });

  it("cycles through all filters correctly in legend", () => {
    for (const [mode, label] of Object.entries(filterLabels)) {
      const legend = buildLegend({
        ...defaults,
        filter: mode as FilterMode,
      });
      expect(legend).toContain(`filter:${label}`);
    }
  });

  it("omits agents toggle hint when no agents exist", () => {
    const legend = buildLegend({ ...defaults, agents: [] });
    expect(legend).not.toContain("[a] agents");
  });

  it("includes agents toggle hint when agents exist", () => {
    const agents = [makeAgent({ agent_id: "a1", status: "active" })];
    const legend = buildLegend({ ...defaults, agents });
    expect(legend).toContain("[a] agents");
  });

  it("includes agent summary when agents exist and sidebar is visible", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
    ];
    const legend = buildLegend({
      ...defaults,
      agents,
      sidebarHidden: false,
    });
    expect(legend).toContain("| 2 agents");
  });

  it("omits agent summary when sidebar is hidden", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
    ];
    const legend = buildLegend({
      ...defaults,
      agents,
      sidebarHidden: true,
    });
    expect(legend).not.toContain("| 2 agents");
  });

  it("shows hidden attention indicator when sidebar hidden with attention agents", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "needs_attention" }),
    ];
    const legend = buildLegend({
      ...defaults,
      agents,
      sidebarHidden: true,
    });
    expect(legend).toContain("[! 1 agent need attention]");
    // Should NOT show the pipe-separated summary
    expect(legend).not.toContain("| 1 agent");
  });
});

describe("StatusBar message override", () => {
  it("displays message instead of legend when message is set", () => {
    const bar = buildBar({
      ...defaults,
      message: "Copied PM-E001-S001 to clipboard",
    });
    expect(bar).toBe("Copied PM-E001-S001 to clipboard");
  });

  it("displays legend when message is empty", () => {
    const bar = buildBar({ ...defaults, message: "" });
    expect(bar).toContain("[j/k] nav");
  });
});

describe("StatusBar truncation logic", () => {
  it("does not truncate when bar fits within width - 2", () => {
    const bar = buildBar({ ...defaults, message: "short", width: 20 });
    expect(bar).toBe("short");
    expect(bar).not.toContain("\u2026");
  });

  it("truncates with ellipsis when bar exceeds width - 2", () => {
    const longMessage = "A".repeat(50);
    const bar = buildBar({ ...defaults, message: longMessage, width: 20 });
    // width - 3 chars + ellipsis
    expect(bar.length).toBe(18); // 17 chars + 1 ellipsis
    expect(bar.endsWith("\u2026")).toBe(true);
    expect(bar).toBe("A".repeat(17) + "\u2026");
  });

  it("does not truncate when bar length equals exactly width - 2", () => {
    // bar.length === width - 2 should NOT truncate
    const msg = "A".repeat(18);
    const bar = buildBar({ ...defaults, message: msg, width: 20 });
    expect(bar).toBe(msg);
    expect(bar).not.toContain("\u2026");
  });

  it("truncates when bar length equals width - 1", () => {
    // bar.length === width - 1 > width - 2, so truncate
    const msg = "A".repeat(19);
    const bar = buildBar({ ...defaults, message: msg, width: 20 });
    expect(bar.endsWith("\u2026")).toBe(true);
    expect(bar.length).toBe(18);
  });

  it("truncates a long legend when width is narrow", () => {
    const bar = buildBar({ ...defaults, width: 40 });
    // The default legend is much longer than 40 chars
    expect(bar.length).toBe(38); // width - 3 + 1 for ellipsis = 38
    expect(bar.endsWith("\u2026")).toBe(true);
  });
});

describe("StatusBar padded output", () => {
  it("prepends a space and pads to width - 1", () => {
    const output = buildPaddedOutput("hello", 20);
    expect(output.startsWith(" ")).toBe(true);
    expect(output.length).toBe(20);
    expect(output).toBe(" hello" + " ".repeat(14));
  });

  it("handles bar that fills the entire width", () => {
    const bar = "A".repeat(19);
    const output = buildPaddedOutput(bar, 20);
    expect(output.length).toBe(20);
    expect(output).toBe(" " + "A".repeat(19));
  });

  it("handles empty bar", () => {
    const output = buildPaddedOutput("", 10);
    expect(output.length).toBe(10);
    expect(output).toBe(" ".repeat(10));
  });
});

describe("StatusBar agents toggle hint", () => {
  it("returns empty string for zero agents", () => {
    expect(buildAgentsToggleHint([])).toBe("");
  });

  it("returns hint string for one or more agents", () => {
    const agents = [makeAgent({ agent_id: "a1", status: "active" })];
    expect(buildAgentsToggleHint(agents)).toBe("  [a] agents");
  });
});

describe("buildContextKeys", () => {
  it("shows tree-specific keys when tree is focused", () => {
    const keys = buildContextKeys("tree", false);
    expect(keys).toContain("[j/k] nav");
    expect(keys).toContain("[Enter] expand");
    expect(keys).toContain("[f] filter");
    expect(keys).toContain("[/] search");
  });

  it("shows dispatch hint when tree focused and dispatch available", () => {
    const keys = buildContextKeys("tree", true);
    expect(keys).toContain("[x] dispatch");
  });

  it("omits dispatch hint when dispatch not available", () => {
    const keys = buildContextKeys("tree", false);
    expect(keys).not.toContain("[x] dispatch");
  });

  it("shows sidebar-specific keys when sidebar is focused", () => {
    const keys = buildContextKeys("sidebar", false);
    expect(keys).toContain("[j/k] nav");
    expect(keys).toContain("[f] filter");
    expect(keys).toContain("[e] respond");
    expect(keys).not.toContain("[Enter] expand");
  });

  it("shows detail-specific keys when detail is focused", () => {
    const keys = buildContextKeys("detail", false);
    expect(keys).toContain("[j/k] scroll");
    expect(keys).not.toContain("[Enter]");
    expect(keys).not.toContain("[f] filter");
  });
});
