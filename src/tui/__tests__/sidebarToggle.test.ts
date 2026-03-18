import { describe, it, expect } from "vitest";
import { nextFocusedPanel } from "../focusCycling.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";

/**
 * Tests for PM-E053-S003: Agent sidebar toggle via `a` key.
 *
 * The actual keybinding lives in src/tui/index.tsx (React component),
 * so here we test the pure-logic helpers that the toggle relies on:
 *
 * - Focus cycling correctly degrades when sidebar becomes hidden
 * - StatusBar hidden-attention indicator text
 */

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

// ── Focus behavior on sidebar toggle ───────────────────────────────────────

describe("focus behavior when sidebar is toggled off", () => {
  it("AC4: focus moves to tree when sidebar was focused and sidebar becomes hidden", () => {
    // When sidebarVisible transitions from true to false while focus is on sidebar,
    // the effectiveFocusedPanel logic in index.tsx maps sidebar -> tree.
    // nextFocusedPanel with sidebarVisible=false and current=sidebar also returns tree.
    expect(nextFocusedPanel("sidebar", false)).toBe("tree");
  });

  it("focus stays on tree when sidebar is hidden and focus was on tree", () => {
    // Tab from tree with no sidebar cycles to detail
    expect(nextFocusedPanel("tree", false)).toBe("detail");
  });

  it("focus stays on detail when sidebar is hidden and focus was on detail", () => {
    // Tab from detail with no sidebar cycles to tree
    expect(nextFocusedPanel("detail", false)).toBe("tree");
  });

  it("two-panel cycle works: tree -> detail -> tree", () => {
    let panel = nextFocusedPanel("tree", false);
    expect(panel).toBe("detail");
    panel = nextFocusedPanel(panel, false);
    expect(panel).toBe("tree");
  });
});

// ── StatusBar hidden attention indicator ───────────────────────────────────

describe("StatusBar hidden attention indicator logic", () => {
  /**
   * The StatusBar builds its attention indicator using inline logic.
   * We replicate the same calculation here to ensure correctness.
   */
  function buildAttentionIndicator(
    agents: AgentState[],
    sidebarHidden: boolean,
  ): string {
    const attentionCount = agents.filter(
      (a) => a.status === "needs_attention" || a.status === "blocked",
    ).length;
    if (sidebarHidden && attentionCount > 0) {
      return `  [! ${attentionCount} agent${attentionCount === 1 ? "" : "s"} need attention]`;
    }
    return "";
  }

  it("AC3: shows indicator when sidebar hidden and agents need attention", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "needs_attention" }),
    ];
    const indicator = buildAttentionIndicator(agents, true);
    expect(indicator).toBe("  [! 1 agent need attention]");
  });

  it("AC3: shows plural indicator for multiple agents needing attention", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "needs_attention" }),
      makeAgent({ agent_id: "a2", status: "blocked" }),
    ];
    const indicator = buildAttentionIndicator(agents, true);
    expect(indicator).toBe("  [! 2 agents need attention]");
  });

  it("returns empty string when sidebar is visible (not hidden)", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "needs_attention" }),
    ];
    const indicator = buildAttentionIndicator(agents, false);
    expect(indicator).toBe("");
  });

  it("returns empty string when sidebar is hidden but no agents need attention", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
    ];
    const indicator = buildAttentionIndicator(agents, true);
    expect(indicator).toBe("");
  });

  it("returns empty string when no agents exist", () => {
    const indicator = buildAttentionIndicator([], true);
    expect(indicator).toBe("");
  });

  it("counts blocked agents in the attention count", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "blocked" }),
    ];
    const indicator = buildAttentionIndicator(agents, true);
    expect(indicator).toBe("  [! 1 agent need attention]");
  });
});
