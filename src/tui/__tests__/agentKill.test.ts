import { describe, expect, it, vi } from "vitest";
import {
  buildKillConfirmationMessage,
  getAgentKillTarget,
  killAgentTarget,
} from "../agentKill.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";

function makeAgent(
  overrides: Partial<ObservedAgentState> = {},
): ObservedAgentState {
  return {
    agent_id: "agent-01",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    heartbeat_age_ms: 0,
    heartbeat_stale: false,
    escalation_history: [],
    ...overrides,
  };
}

describe("agent kill helpers", () => {
  it("builds the K confirmation prompt for tracked agents", () => {
    expect(buildKillConfirmationMessage("worker-7")).toBe(
      "Kill agent worker-7? [y/n]",
    );
  });

  it("returns a kill target when the agent has a tracked pid", () => {
    expect(
      getAgentKillTarget(
        makeAgent({ agent_id: "worker-7", tracked_pid: 4321 }),
      ),
    ).toEqual({ agentId: "worker-7", pid: 4321 });
  });

  it("is a no-op for agents without tracked pids", () => {
    expect(getAgentKillTarget(makeAgent({ agent_id: "worker-7" }))).toBeNull();
  });

  it("returns a success message after SIGTERM is sent", () => {
    const killProcess = vi.fn(() => ({ already_dead: false }));

    expect(
      killAgentTarget({ agentId: "worker-7", pid: 4321 }, killProcess),
    ).toBe("Sent SIGTERM to agent worker-7");
    expect(killProcess).toHaveBeenCalledWith(4321);
  });

  it("returns an already-dead message instead of throwing", () => {
    const killProcess = vi.fn(() => ({ already_dead: true }));

    expect(
      killAgentTarget({ agentId: "worker-7", pid: 4321 }, killProcess),
    ).toBe("Agent worker-7 is already stopped");
  });
});
