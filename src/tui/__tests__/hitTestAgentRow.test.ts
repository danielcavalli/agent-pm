import { describe, expect, it } from "vitest";
import type { ObservedAgentState } from "../../lib/agent-state.js";
import { hitTestAgentRow, resolveAgentClick } from "../hitTestAgentRow.js";
import {
  selectedAgentRowIndex,
  sidebarScrollStart,
} from "../components/AgentSidebar.js";

function makeAgent(
  overrides: Partial<ObservedAgentState> & {
    agent_id: string;
    status: ObservedAgentState["status"];
  },
): ObservedAgentState {
  return {
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    heartbeat_age_ms: 0,
    heartbeat_stale: false,
    ...overrides,
  };
}

describe("hitTestAgentRow", () => {
  it("maps sidebar body rows to filtered agent indices", () => {
    const agents = [
      makeAgent({ agent_id: "agent-1", status: "active" }),
      makeAgent({ agent_id: "agent-2", status: "idle" }),
      makeAgent({ agent_id: "agent-3", status: "completed" }),
    ];

    expect(hitTestAgentRow(3, 0, 2, agents)).toBe(0);
    expect(hitTestAgentRow(4, 0, 2, agents)).toBe(1);
    expect(hitTestAgentRow(5, 0, 2, agents)).toBe(2);
  });

  it("accounts for sidebar scroll offset and progress rows", () => {
    const agents = [
      makeAgent({
        agent_id: "agent-1",
        status: "active",
        progress: {
          total_criteria: 4,
          completed_criteria: 1,
          current_step: "Working",
          criteria_status: [],
        },
      }),
      makeAgent({ agent_id: "agent-2", status: "idle" }),
      makeAgent({
        agent_id: "agent-3",
        status: "active",
        progress: {
          total_criteria: 2,
          completed_criteria: 2,
          current_step: "Done",
          criteria_status: [],
        },
      }),
      makeAgent({ agent_id: "agent-4", status: "completed" }),
    ];
    const availableRows = 3;
    const scrollOffset = sidebarScrollStart(
      selectedAgentRowIndex(agents, 2),
      6,
      availableRows,
    );

    expect(scrollOffset).toBe(2);
    expect(hitTestAgentRow(3, scrollOffset, 2, agents)).toBe(1);
    expect(hitTestAgentRow(4, scrollOffset, 2, agents)).toBe(2);
    expect(hitTestAgentRow(5, scrollOffset, 2, agents)).toBe(2);
  });

  it("returns null for header and out-of-bounds clicks", () => {
    const agents = [makeAgent({ agent_id: "agent-1", status: "active" })];

    expect(hitTestAgentRow(1, 0, 2, agents)).toBeNull();
    expect(hitTestAgentRow(2, 0, 2, agents)).toBeNull();
    expect(hitTestAgentRow(4, 0, 2, agents)).toBeNull();
  });
});

describe("resolveAgentClick", () => {
  const agents = [makeAgent({ agent_id: "agent-1", status: "active" })];

  it("selects the clicked agent and focuses the sidebar", () => {
    expect(resolveAgentClick(agents, 0)).toEqual({
      agentIndex: 0,
      focusedPanel: "sidebar",
    });
  });

  it("handles invalid agent indices gracefully", () => {
    expect(resolveAgentClick(agents, -1)).toBeNull();
    expect(resolveAgentClick(agents, 2)).toBeNull();
  });
});
