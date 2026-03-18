import { describe, it, expect } from "vitest";
import {
  AgentStateSchema,
  AgentStatusSchema,
  EscalationSchema,
  EscalationTypeSchema,
} from "../agent-state.schema.js";

// ── EscalationTypeSchema ─────────────────────────────────────────────────────

describe("EscalationTypeSchema", () => {
  it.each(["decision", "clarification", "approval", "error"])(
    "accepts '%s'",
    (val) => {
      expect(EscalationTypeSchema.safeParse(val).success).toBe(true);
    },
  );

  it("rejects an invalid type", () => {
    expect(EscalationTypeSchema.safeParse("warning").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(EscalationTypeSchema.safeParse("").success).toBe(false);
  });
});

// ── EscalationSchema ─────────────────────────────────────────────────────────

describe("EscalationSchema", () => {
  const validEscalation = {
    type: "decision",
    message: "Which authentication strategy should we use?",
    confidence: 0.7,
    options: ["OAuth 2.0", "API keys", "JWT"],
  };

  it("validates a complete escalation", () => {
    const result = EscalationSchema.safeParse(validEscalation);
    expect(result.success).toBe(true);
  });

  it("validates an escalation without options (optional)", () => {
    const { options: _, ...noOptions } = validEscalation;
    const result = EscalationSchema.safeParse(noOptions);
    expect(result.success).toBe(true);
  });

  it("rejects an escalation with empty message", () => {
    const result = EscalationSchema.safeParse({
      ...validEscalation,
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const result = EscalationSchema.safeParse({
      ...validEscalation,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const result = EscalationSchema.safeParse({
      ...validEscalation,
      confidence: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts confidence of exactly 0", () => {
    const result = EscalationSchema.safeParse({
      ...validEscalation,
      confidence: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts confidence of exactly 1", () => {
    const result = EscalationSchema.safeParse({
      ...validEscalation,
      confidence: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing type", () => {
    const { type: _, ...noType } = validEscalation;
    const result = EscalationSchema.safeParse(noType);
    expect(result.success).toBe(false);
  });

  it("rejects missing confidence", () => {
    const { confidence: _, ...noConf } = validEscalation;
    const result = EscalationSchema.safeParse(noConf);
    expect(result.success).toBe(false);
  });
});

// ── AgentStatusSchema ────────────────────────────────────────────────────────

describe("AgentStatusSchema", () => {
  it.each(["active", "idle", "needs_attention", "blocked", "completed"])(
    "accepts '%s'",
    (val) => {
      expect(AgentStatusSchema.safeParse(val).success).toBe(true);
    },
  );

  it("rejects an invalid status", () => {
    expect(AgentStatusSchema.safeParse("running").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(AgentStatusSchema.safeParse("").success).toBe(false);
  });
});

// ── AgentStateSchema ─────────────────────────────────────────────────────────

describe("AgentStateSchema", () => {
  const validAgentState = {
    agent_id: "agent-1",
    session_id: "sess-abc-123",
    status: "active",
    current_task: "PM-E051-S001",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    progress_summary: "Implementing agent state schema",
    escalation: {
      type: "decision",
      message: "Which pattern to use?",
      confidence: 0.8,
      options: ["A", "B"],
    },
  };

  it("validates a complete agent state with all fields", () => {
    const result = AgentStateSchema.safeParse(validAgentState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent_id).toBe("agent-1");
      expect(result.data.status).toBe("active");
      expect(result.data.escalation?.type).toBe("decision");
    }
  });

  it("validates a minimal agent state (only required fields)", () => {
    const minimal = {
      agent_id: "agent-2",
      status: "idle",
      started_at: "2026-03-13T10:00:00Z",
      last_heartbeat: "2026-03-13T10:00:00Z",
    };
    const result = AgentStateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_id).toBeUndefined();
      expect(result.data.current_task).toBeUndefined();
      expect(result.data.progress_summary).toBeUndefined();
      expect(result.data.escalation).toBeUndefined();
    }
  });

  it("rejects missing agent_id", () => {
    const { agent_id: _, ...noId } = validAgentState;
    const result = AgentStateSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects empty agent_id", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      agent_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const { status: _, ...noStatus } = validAgentState;
    const result = AgentStateSchema.safeParse(noStatus);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status value", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      status: "running",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing started_at", () => {
    const { started_at: _, ...noStarted } = validAgentState;
    const result = AgentStateSchema.safeParse(noStarted);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO datetime for started_at", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      started_at: "2026-03-13",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing last_heartbeat", () => {
    const { last_heartbeat: _, ...noHeartbeat } = validAgentState;
    const result = AgentStateSchema.safeParse(noHeartbeat);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO datetime for last_heartbeat", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      last_heartbeat: "10:05:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ISO datetime with timezone offset", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      started_at: "2026-03-13T10:00:00+05:30",
      last_heartbeat: "2026-03-13T10:05:00-04:00",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ISO datetime with milliseconds", () => {
    const result = AgentStateSchema.safeParse({
      ...validAgentState,
      started_at: "2026-03-13T10:00:00.123Z",
      last_heartbeat: "2026-03-13T10:05:00.456Z",
    });
    expect(result.success).toBe(true);
  });

  it("validates agent state with escalation but no options", () => {
    const state = {
      ...validAgentState,
      escalation: {
        type: "error",
        message: "Build failed",
        confidence: 0.95,
      },
    };
    const result = AgentStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("rejects agent state with invalid escalation", () => {
    const state = {
      ...validAgentState,
      escalation: {
        type: "invalid_type",
        message: "Something",
        confidence: 0.5,
      },
    };
    const result = AgentStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("accepts all valid status enum values", () => {
    for (const status of [
      "active",
      "idle",
      "needs_attention",
      "blocked",
      "completed",
    ]) {
      const result = AgentStateSchema.safeParse({
        ...validAgentState,
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});
