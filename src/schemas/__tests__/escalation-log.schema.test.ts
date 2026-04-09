import { describe, it, expect } from "vitest";
import {
  EscalationLogEntrySchema,
  EscalationLogSchema,
} from "../escalation-log.schema.js";

describe("EscalationLogEntrySchema", () => {
  const validEntry = {
    type: "decision",
    message: "Which implementation should we choose?",
    confidence: 0.8,
    options: ["A", "B"],
    selected_option: "A",
    additional_context: "Prefer the simpler path",
    responded_at: "2026-03-13T11:00:00Z",
  };

  it("accepts a complete escalation log entry", () => {
    const result = EscalationLogEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it("accepts an entry without response fields", () => {
    const {
      selected_option: _selected,
      additional_context: _context,
      responded_at: _respondedAt,
      ...pendingEntry
    } = validEntry;
    const result = EscalationLogEntrySchema.safeParse(pendingEntry);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid responded_at timestamp", () => {
    const result = EscalationLogEntrySchema.safeParse({
      ...validEntry,
      responded_at: "tomorrow",
    });
    expect(result.success).toBe(false);
  });
});

describe("EscalationLogSchema", () => {
  it("accepts an array of escalation log entries", () => {
    const result = EscalationLogSchema.safeParse([
      {
        type: "decision",
        message: "Choose a transport",
        confidence: 0.6,
        options: ["REST", "gRPC"],
        responded_at: "2026-03-13T11:00:00Z",
      },
      {
        type: "error",
        message: "Build failed",
        confidence: 0.9,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects invalid entries inside the array", () => {
    const result = EscalationLogSchema.safeParse([
      {
        type: "decision",
        message: "Choose a transport",
        confidence: 1.2,
      },
    ]);
    expect(result.success).toBe(false);
  });
});
