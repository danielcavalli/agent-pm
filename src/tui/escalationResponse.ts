import type { AgentState } from "../schemas/agent-state.schema.js";

/**
 * Escalation response mode state.
 *
 * - idle: no response mode active
 * - selecting: user pressed `e`, waiting for option number (1-N)
 * - confirmed: response was sent, showing confirmation briefly
 */
export type EscalationResponseMode = "idle" | "selecting" | "confirmed";

export interface EscalationResponseState {
  mode: EscalationResponseMode;
  /** The option number that was selected (1-based), set when mode is "confirmed" */
  confirmedOption: number | null;
}

export const INITIAL_RESPONSE_STATE: EscalationResponseState = {
  mode: "idle",
  confirmedOption: null,
};

/**
 * Determine whether the `e` key should activate response mode.
 * Only activates when the selected agent has needs_attention status
 * with an escalation that has options.
 */
export function canEnterResponseMode(agent: AgentState | null | undefined): boolean {
  if (!agent) return false;
  if (agent.status !== "needs_attention") return false;
  if (!agent.escalation) return false;
  if (!agent.escalation.options || agent.escalation.options.length === 0) return false;
  return true;
}

/**
 * Handle pressing `e` to enter response mode.
 * Returns the new state, or null if the action should be ignored.
 */
export function enterResponseMode(
  current: EscalationResponseState,
  agent: AgentState | null | undefined,
): EscalationResponseState | null {
  if (!canEnterResponseMode(agent)) return null;
  if (current.mode === "selecting") return null; // already in response mode
  return { mode: "selecting", confirmedOption: null };
}

/**
 * Handle pressing Escape to exit response mode.
 * Returns the new state, or null if not in response mode.
 */
export function exitResponseMode(
  current: EscalationResponseState,
): EscalationResponseState | null {
  if (current.mode !== "selecting") return null;
  return INITIAL_RESPONSE_STATE;
}

/**
 * Handle pressing a number key (1-9) to select an option.
 * Returns the selected option number (1-based) if valid, or null if invalid.
 */
export function selectOption(
  current: EscalationResponseState,
  input: string,
  agent: AgentState | null | undefined,
): { newState: EscalationResponseState; optionNumber: number } | null {
  if (current.mode !== "selecting") return null;
  if (!agent?.escalation?.options) return null;

  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > agent.escalation.options.length) return null;

  return {
    newState: { mode: "confirmed", confirmedOption: num },
    optionNumber: num,
  };
}

/**
 * Build the confirmation message shown after responding.
 */
export function confirmationMessage(optionNumber: number): string {
  return `Response sent: option ${optionNumber}`;
}
