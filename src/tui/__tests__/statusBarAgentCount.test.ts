import { describe, it, expect } from "vitest";
import { agentCountSummary } from "../components/StatusBar.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";

function makeAgent(
  overrides: Partial<AgentState> & { agent_id: string; status: AgentState["status"] },
): AgentState {
  return {
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    ...overrides,
  };
}

describe("agentCountSummary", () => {
  it("returns empty string when no agents exist", () => {
    expect(agentCountSummary([])).toBe("");
  });

  it("returns singular 'agent' for a single active agent", () => {
    const agents = [makeAgent({ agent_id: "a1", status: "active" })];
    expect(agentCountSummary(agents)).toBe("1 agent");
  });

  it("returns plural 'agents' for multiple agents", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
      makeAgent({ agent_id: "a3", status: "completed" }),
    ];
    expect(agentCountSummary(agents)).toBe("3 agents");
  });

  it("includes needs_attention count when agents have needs_attention status", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "needs_attention" }),
      makeAgent({ agent_id: "a3", status: "idle" }),
    ];
    expect(agentCountSummary(agents)).toBe("3 agents (1 needs attention)");
  });

  it("includes blocked agents in the needs-attention count", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "needs_attention" }),
      makeAgent({ agent_id: "a3", status: "blocked" }),
    ];
    expect(agentCountSummary(agents)).toBe("3 agents (2 needs attention)");
  });

  it("handles all agents needing attention", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "needs_attention" }),
      makeAgent({ agent_id: "a2", status: "blocked" }),
    ];
    expect(agentCountSummary(agents)).toBe("2 agents (2 needs attention)");
  });

  it("handles single agent needing attention", () => {
    const agents = [makeAgent({ agent_id: "a1", status: "needs_attention" })];
    expect(agentCountSummary(agents)).toBe("1 agent (1 needs attention)");
  });

  it("does not count idle, active, or completed as needing attention", () => {
    const agents = [
      makeAgent({ agent_id: "a1", status: "active" }),
      makeAgent({ agent_id: "a2", status: "idle" }),
      makeAgent({ agent_id: "a3", status: "completed" }),
    ];
    expect(agentCountSummary(agents)).toBe("3 agents");
  });
});
