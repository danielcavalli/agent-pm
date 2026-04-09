import type { AgentState } from "../schemas/agent-state.schema.js";
import { isNoColor } from "./colors.js";

export function escalationNotificationKey(agent: AgentState): string | null {
  if (
    (agent.status !== "needs_attention" && agent.status !== "blocked") ||
    !agent.escalation
  ) {
    return null;
  }

  const { type, message, confidence, options } = agent.escalation;
  const optionsKey = options?.join("\u001f") ?? "";
  return [agent.agent_id, type, message, String(confidence), optionsKey].join(
    "\u001e",
  );
}

export function collectEscalationKeys(agents: AgentState[]): Set<string> {
  const keys = new Set<string>();
  for (const agent of agents) {
    const key = escalationNotificationKey(agent);
    if (key) keys.add(key);
  }
  return keys;
}

export function hasNewEscalation(
  previousKeys: ReadonlySet<string>,
  currentKeys: ReadonlySet<string>,
): boolean {
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) return true;
  }
  return false;
}

export function shouldEmitEscalationBell(isTTY: boolean): boolean {
  return isTTY && !isNoColor();
}
