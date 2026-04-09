import { killTrackedProcess } from "../lib/agent-state.js";
import type { ObservedAgentState } from "../lib/agent-state.js";

export interface AgentKillTarget {
  agentId: string;
  pid: number;
}

export function getAgentKillTarget(
  agent: ObservedAgentState | null | undefined,
): AgentKillTarget | null {
  if (!agent || typeof agent.tracked_pid !== "number") {
    return null;
  }

  return {
    agentId: agent.agent_id,
    pid: agent.tracked_pid,
  };
}

export function buildKillConfirmationMessage(agentId: string): string {
  return `Kill agent ${agentId}? [y/n]`;
}

export function killAgentTarget(
  target: AgentKillTarget,
  killProcess: typeof killTrackedProcess = killTrackedProcess,
): string {
  const result = killProcess(target.pid);
  if (result.already_dead) {
    return `Agent ${target.agentId} is already stopped`;
  }

  return `Sent SIGTERM to agent ${target.agentId}`;
}
