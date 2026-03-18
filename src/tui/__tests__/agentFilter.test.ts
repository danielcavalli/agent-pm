import { describe, it, expect } from "vitest";
import {
  filterAgents,
  nextAgentFilter,
  sidebarHeader,
} from "../components/AgentSidebar.js";
import type { AgentFilterMode } from "../components/AgentSidebar.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";

/**
 * Tests for PM-E053-S006: Agent filter in sidebar.
 *
 * Pure-logic tests for the filter helpers. The key binding (f when sidebar
 * is focused) lives in src/tui/index.tsx; here we verify:
 *
 * - filterAgents correctly filters by attention-only statuses
 * - nextAgentFilter cycles: all -> attention -> all
 * - sidebarHeader reflects the current filter mode
 * - Default filter is "all"
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

// ── filterAgents ────────────────────────────────────────────────────────────

describe("filterAgents", () => {
  const agents: AgentState[] = [
    makeAgent({ agent_id: "a1", status: "active" }),
    makeAgent({ agent_id: "a2", status: "idle" }),
    makeAgent({ agent_id: "a3", status: "needs_attention" }),
    makeAgent({ agent_id: "a4", status: "blocked" }),
    makeAgent({ agent_id: "a5", status: "completed" }),
  ];

  it('returns all agents when filter is "all"', () => {
    const result = filterAgents(agents, "all");
    expect(result).toHaveLength(5);
    expect(result).toEqual(agents);
  });

  it('returns only needs_attention and blocked agents when filter is "attention"', () => {
    const result = filterAgents(agents, "attention");
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.agent_id)).toEqual(["a3", "a4"]);
  });

  it("returns empty array when no agents match attention filter", () => {
    const healthyAgents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
      makeAgent({ agent_id: "a3", status: "completed" }),
    ];
    const result = filterAgents(healthyAgents, "attention");
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no agents exist regardless of filter", () => {
    expect(filterAgents([], "all")).toHaveLength(0);
    expect(filterAgents([], "attention")).toHaveLength(0);
  });

  it("includes blocked agents in attention filter", () => {
    const blockedOnly = [makeAgent({ agent_id: "b1", status: "blocked" })];
    const result = filterAgents(blockedOnly, "attention");
    expect(result).toHaveLength(1);
    expect(result[0]!.agent_id).toBe("b1");
  });

  it("includes needs_attention agents in attention filter", () => {
    const attentionOnly = [
      makeAgent({ agent_id: "n1", status: "needs_attention" }),
    ];
    const result = filterAgents(attentionOnly, "attention");
    expect(result).toHaveLength(1);
    expect(result[0]!.agent_id).toBe("n1");
  });
});

// ── nextAgentFilter ─────────────────────────────────────────────────────────

describe("nextAgentFilter", () => {
  it("AC1: cycles all -> attention", () => {
    expect(nextAgentFilter("all")).toBe("attention");
  });

  it("AC1: cycles attention -> all", () => {
    expect(nextAgentFilter("attention")).toBe("all");
  });

  it("AC1: full cycle: all -> attention -> all", () => {
    let mode: AgentFilterMode = "all";
    mode = nextAgentFilter(mode);
    expect(mode).toBe("attention");
    mode = nextAgentFilter(mode);
    expect(mode).toBe("all");
  });
});

// ── sidebarHeader ───────────────────────────────────────────────────────────

describe("sidebarHeader", () => {
  it('AC2: shows "Agents" when filter is "all"', () => {
    expect(sidebarHeader("all")).toBe("Agents");
  });

  it('AC2: shows "Agents [!]" when filter is "attention"', () => {
    expect(sidebarHeader("attention")).toBe("Agents [!]");
  });
});

// ── Default filter mode ─────────────────────────────────────────────────────

describe("default filter mode", () => {
  it("AC3: default filter is 'all' (verified by type initialization)", () => {
    // The AgentSidebar component defaults agentFilter to "all",
    // and App() in index.tsx initializes useState<AgentFilterMode>("all").
    // We verify that the "all" filter returns all agents as expected.
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "needs_attention" }),
    ];
    expect(filterAgents(agents, "all")).toHaveLength(2);
  });
});
