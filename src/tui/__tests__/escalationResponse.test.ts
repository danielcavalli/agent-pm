import { describe, it, expect } from "vitest";
import {
  INITIAL_RESPONSE_STATE,
  canEnterResponseMode,
  enterResponseMode,
  exitResponseMode,
  selectOption,
  confirmationMessage,
} from "../escalationResponse.js";
import type { EscalationResponseState } from "../escalationResponse.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import { buildAgentDetailLines } from "../components/DetailPanel.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agent_id: "agent-01",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    ...overrides,
  };
}

function escalatedAgent(optionCount = 3): AgentState {
  const options = Array.from({ length: optionCount }, (_, i) => `Option ${i + 1}`);
  return makeAgent({
    agent_id: "agent-42",
    status: "needs_attention",
    escalation: {
      type: "decision",
      message: "Which approach?",
      confidence: 0.75,
      options,
    },
  });
}

// ── canEnterResponseMode ─────────────────────────────────────────────────────

describe("canEnterResponseMode", () => {
  it("returns true for agent with needs_attention and escalation with options", () => {
    expect(canEnterResponseMode(escalatedAgent())).toBe(true);
  });

  it("returns false for null agent", () => {
    expect(canEnterResponseMode(null)).toBe(false);
  });

  it("returns false for undefined agent", () => {
    expect(canEnterResponseMode(undefined)).toBe(false);
  });

  it("returns false for agent with active status", () => {
    const agent = makeAgent({ status: "active" });
    expect(canEnterResponseMode(agent)).toBe(false);
  });

  it("returns false for needs_attention agent without escalation", () => {
    const agent = makeAgent({ status: "needs_attention" });
    expect(canEnterResponseMode(agent)).toBe(false);
  });

  it("returns false for needs_attention agent with escalation but no options", () => {
    const agent = makeAgent({
      status: "needs_attention",
      escalation: {
        type: "error",
        message: "Build failed",
        confidence: 0.9,
      },
    });
    expect(canEnterResponseMode(agent)).toBe(false);
  });

  it("returns false for needs_attention agent with escalation and empty options", () => {
    const agent = makeAgent({
      status: "needs_attention",
      escalation: {
        type: "error",
        message: "Build failed",
        confidence: 0.9,
        options: [],
      },
    });
    expect(canEnterResponseMode(agent)).toBe(false);
  });
});

// ── enterResponseMode ────────────────────────────────────────────────────────

describe("enterResponseMode", () => {
  it("transitions from idle to selecting when agent has escalation with options", () => {
    const result = enterResponseMode(INITIAL_RESPONSE_STATE, escalatedAgent());
    expect(result).toEqual({ mode: "selecting", confirmedOption: null });
  });

  it("returns null when agent has no escalation", () => {
    const result = enterResponseMode(INITIAL_RESPONSE_STATE, makeAgent());
    expect(result).toBeNull();
  });

  it("returns null when agent is null", () => {
    const result = enterResponseMode(INITIAL_RESPONSE_STATE, null);
    expect(result).toBeNull();
  });

  it("returns null when already in selecting mode", () => {
    const state: EscalationResponseState = { mode: "selecting", confirmedOption: null };
    const result = enterResponseMode(state, escalatedAgent());
    expect(result).toBeNull();
  });

  it("can re-enter from confirmed mode", () => {
    const state: EscalationResponseState = { mode: "confirmed", confirmedOption: 1 };
    const result = enterResponseMode(state, escalatedAgent());
    expect(result).toEqual({ mode: "selecting", confirmedOption: null });
  });
});

// ── exitResponseMode ─────────────────────────────────────────────────────────

describe("exitResponseMode", () => {
  it("transitions from selecting to idle on Escape", () => {
    const state: EscalationResponseState = { mode: "selecting", confirmedOption: null };
    const result = exitResponseMode(state);
    expect(result).toEqual(INITIAL_RESPONSE_STATE);
  });

  it("returns null when in idle mode", () => {
    const result = exitResponseMode(INITIAL_RESPONSE_STATE);
    expect(result).toBeNull();
  });

  it("returns null when in confirmed mode", () => {
    const state: EscalationResponseState = { mode: "confirmed", confirmedOption: 2 };
    const result = exitResponseMode(state);
    expect(result).toBeNull();
  });
});

// ── selectOption ─────────────────────────────────────────────────────────────

describe("selectOption", () => {
  const selectingState: EscalationResponseState = { mode: "selecting", confirmedOption: null };
  const agent = escalatedAgent(3); // 3 options

  it("selects option 1 when pressing '1'", () => {
    const result = selectOption(selectingState, "1", agent);
    expect(result).toEqual({
      newState: { mode: "confirmed", confirmedOption: 1 },
      optionNumber: 1,
    });
  });

  it("selects option 2 when pressing '2'", () => {
    const result = selectOption(selectingState, "2", agent);
    expect(result).toEqual({
      newState: { mode: "confirmed", confirmedOption: 2 },
      optionNumber: 2,
    });
  });

  it("selects option 3 when pressing '3'", () => {
    const result = selectOption(selectingState, "3", agent);
    expect(result).toEqual({
      newState: { mode: "confirmed", confirmedOption: 3 },
      optionNumber: 3,
    });
  });

  it("returns null for option number out of range (too high)", () => {
    const result = selectOption(selectingState, "4", agent);
    expect(result).toBeNull();
  });

  it("returns null for option number 0", () => {
    const result = selectOption(selectingState, "0", agent);
    expect(result).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    const result = selectOption(selectingState, "a", agent);
    expect(result).toBeNull();
  });

  it("returns null when not in selecting mode", () => {
    const result = selectOption(INITIAL_RESPONSE_STATE, "1", agent);
    expect(result).toBeNull();
  });

  it("returns null when agent is null", () => {
    const result = selectOption(selectingState, "1", null);
    expect(result).toBeNull();
  });

  it("returns null when agent has no escalation options", () => {
    const noOptionsAgent = makeAgent({
      status: "needs_attention",
      escalation: {
        type: "error",
        message: "Build failed",
        confidence: 0.9,
      },
    });
    const result = selectOption(selectingState, "1", noOptionsAgent);
    expect(result).toBeNull();
  });

  it("handles 9 options correctly", () => {
    const nineOptionAgent = escalatedAgent(9);
    const result = selectOption(selectingState, "9", nineOptionAgent);
    expect(result).toEqual({
      newState: { mode: "confirmed", confirmedOption: 9 },
      optionNumber: 9,
    });
  });
});

// ── confirmationMessage ──────────────────────────────────────────────────────

describe("confirmationMessage", () => {
  it("returns 'Response sent: option 1' for option 1", () => {
    expect(confirmationMessage(1)).toBe("Response sent: option 1");
  });

  it("returns 'Response sent: option 3' for option 3", () => {
    expect(confirmationMessage(3)).toBe("Response sent: option 3");
  });
});

// ── buildAgentDetailLines with response mode ─────────────────────────────────

describe("buildAgentDetailLines with response mode", () => {
  const agent = escalatedAgent(3);

  it("includes resp-prompt line when mode is selecting", () => {
    const lines = buildAgentDetailLines(agent, 60, "selecting");
    const keys = lines.map((l) => l.key);
    expect(keys).toContain("resp-prompt");
  });

  it("includes resp-confirmation line when mode is confirmed", () => {
    const lines = buildAgentDetailLines(agent, 60, "confirmed", 2);
    const keys = lines.map((l) => l.key);
    expect(keys).toContain("resp-confirmation");
  });

  it("does not include response lines when mode is idle", () => {
    const lines = buildAgentDetailLines(agent, 60, "idle");
    const keys = lines.map((l) => l.key);
    expect(keys).not.toContain("resp-prompt");
    expect(keys).not.toContain("resp-confirmation");
  });

  it("does not include response lines for agent without options", () => {
    const noOptionsAgent = makeAgent({
      status: "needs_attention",
      escalation: {
        type: "error",
        message: "Build failed",
        confidence: 0.9,
      },
    });
    const lines = buildAgentDetailLines(noOptionsAgent, 60, "selecting");
    const keys = lines.map((l) => l.key);
    expect(keys).not.toContain("resp-prompt");
  });
});

// ── Full state machine flow ──────────────────────────────────────────────────

describe("escalation response full flow", () => {
  it("idle -> e -> selecting -> number -> confirmed", () => {
    const agent = escalatedAgent(3);
    let state = INITIAL_RESPONSE_STATE;

    // Press e
    const afterE = enterResponseMode(state, agent);
    expect(afterE).not.toBeNull();
    state = afterE!;
    expect(state.mode).toBe("selecting");

    // Press 2
    const afterNum = selectOption(state, "2", agent);
    expect(afterNum).not.toBeNull();
    state = afterNum!.newState;
    expect(state.mode).toBe("confirmed");
    expect(state.confirmedOption).toBe(2);
  });

  it("idle -> e -> selecting -> Escape -> idle", () => {
    const agent = escalatedAgent(3);
    let state = INITIAL_RESPONSE_STATE;

    // Press e
    const afterE = enterResponseMode(state, agent);
    expect(afterE).not.toBeNull();
    state = afterE!;
    expect(state.mode).toBe("selecting");

    // Press Escape
    const afterEsc = exitResponseMode(state);
    expect(afterEsc).not.toBeNull();
    state = afterEsc!;
    expect(state.mode).toBe("idle");
    expect(state.confirmedOption).toBeNull();
  });

  it("e on non-escalated agent does nothing", () => {
    const agent = makeAgent({ status: "active" });
    const result = enterResponseMode(INITIAL_RESPONSE_STATE, agent);
    expect(result).toBeNull();
  });

  it("invalid number key in selecting mode does nothing", () => {
    const agent = escalatedAgent(3);
    const selectingState: EscalationResponseState = { mode: "selecting", confirmedOption: null };

    // Press 5 (only 3 options)
    const result = selectOption(selectingState, "5", agent);
    expect(result).toBeNull();
  });
});
