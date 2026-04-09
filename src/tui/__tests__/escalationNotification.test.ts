import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import {
  escalationNotificationKey,
  collectEscalationKeys,
  hasNewEscalation,
  shouldEmitEscalationBell,
} from "../escalationNotification.js";

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

describe("escalationNotificationKey", () => {
  it("returns null for non-attention agents", () => {
    expect(
      escalationNotificationKey(
        makeAgent({ agent_id: "a1", status: "active" }),
      ),
    ).toBeNull();
  });

  it("returns null when escalation payload is missing", () => {
    expect(
      escalationNotificationKey(
        makeAgent({ agent_id: "a1", status: "needs_attention" }),
      ),
    ).toBeNull();
  });

  it("builds a stable key from agent and escalation payload", () => {
    expect(
      escalationNotificationKey(
        makeAgent({
          agent_id: "a1",
          status: "needs_attention",
          escalation: {
            type: "decision",
            message: "Need input",
            confidence: 0.5,
            options: ["A", "B"],
          },
        }),
      ),
    ).toContain("a1");
  });
});

describe("collectEscalationKeys", () => {
  it("collects only active escalation keys", () => {
    const keys = collectEscalationKeys([
      makeAgent({
        agent_id: "a1",
        status: "needs_attention",
        escalation: {
          type: "decision",
          message: "Need input",
          confidence: 0.5,
        },
      }),
      makeAgent({ agent_id: "a2", status: "active" }),
    ]);

    expect(keys.size).toBe(1);
  });
});

describe("hasNewEscalation", () => {
  it("returns true when a new escalation appears", () => {
    expect(hasNewEscalation(new Set(["a"]), new Set(["a", "b"]))).toBe(true);
  });

  it("returns false when the active escalations are unchanged", () => {
    expect(hasNewEscalation(new Set(["a"]), new Set(["a"]))).toBe(false);
  });

  it("returns false when escalations clear without a new one arriving", () => {
    expect(hasNewEscalation(new Set(["a"]), new Set())).toBe(false);
  });
});

describe("shouldEmitEscalationBell", () => {
  const originalNoColor = process.env.NO_COLOR;
  const originalTerm = process.env.TERM;

  beforeEach(() => {
    delete process.env.NO_COLOR;
    delete process.env.TERM;
  });

  afterEach(() => {
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }

    if (originalTerm !== undefined) {
      process.env.TERM = originalTerm;
    } else {
      delete process.env.TERM;
    }
  });

  it("returns true for tty output when color is enabled", () => {
    expect(shouldEmitEscalationBell(true)).toBe(true);
  });

  it("returns false when output is not a tty", () => {
    expect(shouldEmitEscalationBell(false)).toBe(false);
  });

  it("returns false when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(shouldEmitEscalationBell(true)).toBe(false);
  });

  it("returns false when TERM is dumb", () => {
    process.env.TERM = "dumb";
    expect(shouldEmitEscalationBell(true)).toBe(false);
  });
});
