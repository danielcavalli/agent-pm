import { describe, it, expect } from "vitest";
import {
  buildActiveExperimentRows,
  buildAgentProgressBar,
  buildAgentSidebarRows,
  selectedAgentRowIndex,
} from "../components/AgentSidebar.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";

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

describe("buildAgentProgressBar", () => {
  it("renders progress in [####....] N/M format", () => {
    expect(
      buildAgentProgressBar({
        total_criteria: 8,
        completed_criteria: 4,
        current_step: "Halfway done",
        criteria_status: [],
      }),
    ).toBe("[####....] 4/8");
  });
});

describe("buildAgentSidebarRows", () => {
  it("shows a progress row when progress data is available", () => {
    const rows = buildAgentSidebarRows(
      [
        makeAgent({
          agent_id: "agent-01",
          status: "active",
          progress: {
            total_criteria: 8,
            completed_criteria: 4,
            current_step: "Halfway done",
            criteria_status: [],
          },
        }),
      ],
      18,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.text.trim()).toBe("● agent-01");
    expect(rows[1]?.text.trim()).toBe("[####....] 4/8");
  });

  it("omits the progress row when progress data is absent", () => {
    const rows = buildAgentSidebarRows(
      [makeAgent({ agent_id: "agent-02", status: "idle" })],
      18,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.text.trim()).toBe("○ agent-02");
  });

  it("shows a distinct crash indicator for crashed tracked agents", () => {
    const rows = buildAgentSidebarRows(
      [
        makeAgent({
          agent_id: "agent-03",
          status: "active",
          process_crashed: true,
        }),
      ],
      18,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.text.trim()).toBe("! agent-03");
    expect(rows[0]?.style.color).toBe("red");
    expect(rows[0]?.style.bold).toBe(true);
  });

  it("keeps the agent id visible while fitting progress rows inside the sidebar width", () => {
    const rows = buildAgentSidebarRows(
      [
        makeAgent({
          agent_id: "agent-01",
          status: "active",
          progress: {
            total_criteria: 8,
            completed_criteria: 4,
            current_step: "Halfway done",
            criteria_status: [],
          },
        }),
      ],
      18,
    );

    expect(rows[0]?.text.includes("agent-01")).toBe(true);
    expect(rows[0]?.text.length).toBe(18);
    expect(rows[1]?.text.trim()).toBe("[####....] 4/8");
    expect(rows[1]?.text.length).toBe(18);
  });
});

describe("buildActiveExperimentRows", () => {
  it("shows the section header and experiment rows with icons and elapsed time", () => {
    const rows = buildActiveExperimentRows(
      [
        {
          agentId: "agent-runtime",
          claimedAt: "2026-04-08T12:00:00.000Z",
          mutationType: "runtime_config",
        },
        {
          agentId: "agent-board",
          claimedAt: "2026-04-08T11:59:00.000Z",
          mutationType: "board_mutation",
        },
      ],
      32,
      Date.parse("2026-04-08T12:01:00.000Z"),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]?.text.trim()).toBe("Active Experiments");
    expect(rows[1]?.text.trim()).toBe("⚙ agent-runtime 1m ago");
    expect(rows[2]?.text.trim()).toBe("🌳 agent-board 2m ago");
  });

  it("returns no rows for an empty claims array", () => {
    expect(buildActiveExperimentRows([], 24)).toEqual([]);
  });
});

describe("selectedAgentRowIndex", () => {
  it("accounts for progress rows when mapping selection to rendered rows", () => {
    const agents = [
      makeAgent({
        agent_id: "agent-01",
        status: "active",
        progress: {
          total_criteria: 8,
          completed_criteria: 4,
          current_step: "Halfway done",
          criteria_status: [],
        },
      }),
      makeAgent({ agent_id: "agent-02", status: "idle" }),
    ];

    expect(selectedAgentRowIndex(agents, 0)).toBe(0);
    expect(selectedAgentRowIndex(agents, 1)).toBe(2);
  });
});
