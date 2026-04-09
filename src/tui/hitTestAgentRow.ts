import type { ObservedAgentState } from "../lib/agent-state.js";

function renderedAgentRowCount(agent: ObservedAgentState): number {
  return agent.progress ? 2 : 1;
}

export function hitTestAgentRow(
  clickRow: number,
  scrollOffset: number,
  bodyOffset: number,
  agents: ObservedAgentState[],
): number | null {
  if (
    !Number.isInteger(clickRow) ||
    !Number.isInteger(scrollOffset) ||
    !Number.isInteger(bodyOffset) ||
    agents.length < 1
  ) {
    return null;
  }

  const visibleRowIndex = clickRow - bodyOffset - 1;
  if (visibleRowIndex < 0) {
    return null;
  }

  const flatRowIndex = scrollOffset + visibleRowIndex;
  if (flatRowIndex < 0) {
    return null;
  }

  let renderedRows = 0;
  for (let agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
    const rowCount = renderedAgentRowCount(agents[agentIndex]!);
    if (flatRowIndex < renderedRows + rowCount) {
      return agentIndex;
    }
    renderedRows += rowCount;
  }

  return null;
}

export interface AgentClickResult {
  agentIndex: number;
  focusedPanel: "sidebar";
}

export function resolveAgentClick(
  agents: ObservedAgentState[],
  agentIndex: number,
): AgentClickResult | null {
  if (agentIndex < 0 || agentIndex >= agents.length) {
    return null;
  }

  return {
    agentIndex,
    focusedPanel: "sidebar",
  };
}
