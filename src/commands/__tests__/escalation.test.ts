import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { escalationList } from "../escalation.js";
import {
  captureOutput,
  seedProject,
  setupTmpDir,
  type CapturedOutput,
  type TmpDirHandle,
} from "../../__tests__/integration-helpers.js";
import { writeEscalationLog } from "../../lib/agent-state.js";

describe("pm escalation list (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  it("shows a table of all escalation history", async () => {
    await writeEscalationLog(tmp.projectsDir, "agent-a", [
      {
        type: "decision",
        message: "Choose rollout strategy for the CLI patch",
        confidence: 0.8,
        options: ["canary", "full"],
        selected_option: "canary",
        responded_at: "2026-03-16T10:00:00Z",
      },
    ]);
    await writeEscalationLog(tmp.projectsDir, "agent-b", [
      {
        type: "error",
        message: "Build failed because the command registry snapshot drifted",
        confidence: 0.9,
        selected_option: "regenerate",
        responded_at: "2026-03-16T11:00:00Z",
      },
    ]);

    await escalationList({});

    const lines = out.log().join("\n");
    expect(lines).toContain("Agent ID");
    expect(lines).toContain("Timestamp");
    expect(lines).toContain("Type");
    expect(lines).toContain("Message Summary");
    expect(lines).toContain("Selected Option");
    expect(lines).toContain("agent-a");
    expect(lines).toContain("agent-b");
    expect(lines).toContain("2026-03-16T11:00:00Z");
    expect(lines).toContain("error");
    expect(lines).toContain("regenerate");
  });

  it("filters escalation history to a specific agent", async () => {
    await writeEscalationLog(tmp.projectsDir, "agent-a", [
      {
        type: "clarification",
        message: "Need confirmation on CLI output format",
        confidence: 0.6,
        selected_option: "table",
        responded_at: "2026-03-16T09:00:00Z",
      },
    ]);
    await writeEscalationLog(tmp.projectsDir, "agent-b", [
      {
        type: "approval",
        message: "Request approval to update generated docs",
        confidence: 0.7,
        selected_option: "approved",
        responded_at: "2026-03-16T09:30:00Z",
      },
    ]);

    await escalationList({ agent: "agent-b" });

    const lines = out.log().join("\n");
    expect(lines).toContain("agent-b");
    expect(lines).not.toContain("agent-a");
    expect(lines).toContain("approved");
  });

  it("shows an empty state when no escalation history exists", async () => {
    await escalationList({});

    expect(out.log().join("\n")).toContain("No escalation history found");
  });

  it("shows an empty state when the filtered agent has no escalation history", async () => {
    await writeEscalationLog(tmp.projectsDir, "agent-a", [
      {
        type: "decision",
        message: "Pick a retry strategy",
        confidence: 0.5,
        selected_option: "backoff",
        responded_at: "2026-03-16T08:00:00Z",
      },
    ]);

    await escalationList({ agent: "agent-missing" });

    expect(out.log().join("\n")).toContain("No escalation history found");
  });
});
