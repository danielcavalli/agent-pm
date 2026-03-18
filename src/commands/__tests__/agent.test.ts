import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { agentHeartbeat, agentEscalate, agentCheckResponse } from "../agent.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readAgentState, writeAgentResponse } from "../../lib/agent-state.js";

describe("pm agent heartbeat (integration)", () => {
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

  // ── AC1: tool is registered with correct parameters ──────────────────────
  // (Covered by MCP server test; the CLI command mirrors the parameters.)

  // ── AC2: creates .pm/agents/{agent_id}.yaml with valid schema ────────────

  it("creates a new agent state file with valid schema", async () => {
    await agentHeartbeat({
      agentId: "test-agent-1",
      status: "active",
    });

    const state = readAgentState(tmp.projectsDir, "test-agent-1");
    expect(state.agent_id).toBe("test-agent-1");
    expect(state.status).toBe("active");
    expect(state.started_at).toBeTruthy();
    expect(state.last_heartbeat).toBeTruthy();
  });

  it("sets started_at and last_heartbeat to the same ISO timestamp on creation", async () => {
    await agentHeartbeat({
      agentId: "new-agent",
      status: "active",
    });

    const state = readAgentState(tmp.projectsDir, "new-agent");
    expect(state.started_at).toBe(state.last_heartbeat);
    // Verify ISO 8601 format
    expect(new Date(state.started_at).toISOString()).toBeTruthy();
  });

  it("writes all optional fields when provided", async () => {
    await agentHeartbeat({
      agentId: "full-agent",
      sessionId: "sess-xyz",
      status: "active",
      currentTask: "TEST-E001-S001",
      progressSummary: "Working on implementation",
    });

    const state = readAgentState(tmp.projectsDir, "full-agent");
    expect(state.agent_id).toBe("full-agent");
    expect(state.session_id).toBe("sess-xyz");
    expect(state.status).toBe("active");
    expect(state.current_task).toBe("TEST-E001-S001");
    expect(state.progress_summary).toBe("Working on implementation");
  });

  it("can be verified by reading the file back", async () => {
    await agentHeartbeat({
      agentId: "verify-agent",
      status: "idle",
    });

    const filePath = path.join(
      tmp.projectsDir,
      "agents",
      "verify-agent.yaml",
    );
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("agent_id: verify-agent");
    expect(content).toContain("status: idle");
    expect(content).toContain("last_heartbeat:");
  });

  // ── AC3: updates last_heartbeat without losing other fields ──────────────

  it("updates last_heartbeat without losing other fields on second call", async () => {
    await agentHeartbeat({
      agentId: "updating-agent",
      sessionId: "sess-1",
      status: "active",
      currentTask: "TEST-E001-S001",
      progressSummary: "Started work",
    });

    const first = readAgentState(tmp.projectsDir, "updating-agent");
    const firstStartedAt = first.started_at;

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    await agentHeartbeat({
      agentId: "updating-agent",
      progressSummary: "Continuing work",
    });

    const second = readAgentState(tmp.projectsDir, "updating-agent");
    // started_at should be preserved
    expect(second.started_at).toBe(firstStartedAt);
    // last_heartbeat should be updated (different from started_at)
    expect(second.last_heartbeat).not.toBe(firstStartedAt);
    // session_id should be preserved from first call
    expect(second.session_id).toBe("sess-1");
    // current_task should be preserved from first call
    expect(second.current_task).toBe("TEST-E001-S001");
    // progress_summary should be updated
    expect(second.progress_summary).toBe("Continuing work");
    // status should be preserved
    expect(second.status).toBe("active");
  });

  it("preserves escalation data on heartbeat update", async () => {
    // Manually write an agent state with escalation using the I/O helper
    const { writeAgentState } = await import("../../lib/agent-state.js");
    writeAgentState(tmp.projectsDir, {
      agent_id: "escalated-agent",
      status: "needs_attention",
      started_at: "2026-03-13T10:00:00Z",
      last_heartbeat: "2026-03-13T10:05:00Z",
      escalation: {
        type: "decision",
        message: "Which approach?",
        confidence: 0.8,
        options: ["A", "B"],
      },
    });

    await agentHeartbeat({
      agentId: "escalated-agent",
    });

    const state = readAgentState(tmp.projectsDir, "escalated-agent");
    expect(state.escalation).toBeDefined();
    expect(state.escalation?.type).toBe("decision");
    expect(state.escalation?.message).toBe("Which approach?");
    expect(state.escalation?.confidence).toBe(0.8);
    expect(state.escalation?.options).toEqual(["A", "B"]);
    // last_heartbeat should be updated
    expect(state.last_heartbeat).not.toBe("2026-03-13T10:05:00Z");
  });

  // ── AC4: .pm/agents/ directory is created if it does not exist ───────────

  it("creates the .pm/agents/ directory if it does not exist", async () => {
    const agentsDir = path.join(tmp.projectsDir, "agents");
    // Ensure agents dir does not exist
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true });
    }
    expect(fs.existsSync(agentsDir)).toBe(false);

    await agentHeartbeat({
      agentId: "dir-create-agent",
      status: "active",
    });

    expect(fs.existsSync(agentsDir)).toBe(true);
    const filePath = path.join(agentsDir, "dir-create-agent.yaml");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // ── AC5: CLI command provides the same functionality ─────────────────────

  it("prints Created message for new agent", async () => {
    out.restore();
    out = captureOutput();

    await agentHeartbeat({
      agentId: "new-agent",
      status: "active",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Created");
    expect(lines).toContain("new-agent");
    expect(lines).toContain("last_heartbeat:");
  });

  it("prints Updated message for existing agent", async () => {
    await agentHeartbeat({ agentId: "existing-agent", status: "active" });

    out.restore();
    out = captureOutput();

    await agentHeartbeat({ agentId: "existing-agent", status: "active" });

    const lines = out.log().join("\n");
    expect(lines).toContain("Updated");
    expect(lines).toContain("existing-agent");
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("throws ValidationError when --agent-id is missing", async () => {
    await expect(agentHeartbeat({})).rejects.toThrow(
      "Missing required option: --agent-id",
    );
  });

  it("defaults to status active when creating a new agent without --status", async () => {
    await agentHeartbeat({
      agentId: "default-status-agent",
    });

    const state = readAgentState(tmp.projectsDir, "default-status-agent");
    expect(state.status).toBe("active");
  });

  it("allows updating only status via heartbeat", async () => {
    await agentHeartbeat({
      agentId: "status-change-agent",
      status: "active",
      currentTask: "TEST-E001-S001",
    });

    await agentHeartbeat({
      agentId: "status-change-agent",
      status: "idle",
    });

    const state = readAgentState(tmp.projectsDir, "status-change-agent");
    expect(state.status).toBe("idle");
    // current_task from first call should still be there
    expect(state.current_task).toBe("TEST-E001-S001");
  });
});

describe("pm agent escalate (integration)", () => {
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

  // ── AC1: tool parameters ──────────────────────────────────────────────────

  it("requires agent_id, type, and message", async () => {
    await expect(agentEscalate({})).rejects.toThrow(
      "Missing required option: --agent-id",
    );

    await expect(
      agentEscalate({ agentId: "agent-1" }),
    ).rejects.toThrow("Missing required option: --type");

    await expect(
      agentEscalate({ agentId: "agent-1", type: "decision" }),
    ).rejects.toThrow("Missing required option: --message");
  });

  // ── AC2: sets status to needs_attention and populates escalation ─────────

  it("sets status to needs_attention and populates escalation field", async () => {
    await agentEscalate({
      agentId: "esc-agent-1",
      type: "decision",
      message: "Should we use REST or gRPC?",
      confidence: "0.8",
      options: ["REST", "gRPC"],
    });

    const state = readAgentState(tmp.projectsDir, "esc-agent-1");
    expect(state.status).toBe("needs_attention");
    expect(state.escalation).toBeDefined();
    expect(state.escalation?.type).toBe("decision");
    expect(state.escalation?.message).toBe("Should we use REST or gRPC?");
    expect(state.escalation?.confidence).toBe(0.8);
    expect(state.escalation?.options).toEqual(["REST", "gRPC"]);
  });

  it("updates an existing agent to needs_attention with escalation", async () => {
    // Create an existing active agent via heartbeat
    await agentHeartbeat({
      agentId: "esc-agent-2",
      status: "active",
      currentTask: "TEST-E001-S001",
      progressSummary: "Working on feature",
    });

    const before = readAgentState(tmp.projectsDir, "esc-agent-2");
    expect(before.status).toBe("active");
    expect(before.escalation).toBeUndefined();

    await agentEscalate({
      agentId: "esc-agent-2",
      type: "error",
      message: "Build failed with exit code 1",
    });

    const after = readAgentState(tmp.projectsDir, "esc-agent-2");
    expect(after.status).toBe("needs_attention");
    expect(after.escalation?.type).toBe("error");
    expect(after.escalation?.message).toBe("Build failed with exit code 1");
    // Preserves existing fields
    expect(after.current_task).toBe("TEST-E001-S001");
    expect(after.progress_summary).toBe("Working on feature");
    expect(after.started_at).toBe(before.started_at);
  });

  // ── AC3: creates file if it does not exist with started_at set to now ────

  it("creates agent state file if it does not exist", async () => {
    const agentsDir = path.join(tmp.projectsDir, "agents");
    // Ensure agents dir does not exist
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true });
    }

    await agentEscalate({
      agentId: "new-esc-agent",
      type: "clarification",
      message: "Which database should we use?",
    });

    const filePath = path.join(agentsDir, "new-esc-agent.yaml");
    expect(fs.existsSync(filePath)).toBe(true);

    const state = readAgentState(tmp.projectsDir, "new-esc-agent");
    expect(state.agent_id).toBe("new-esc-agent");
    expect(state.status).toBe("needs_attention");
    expect(state.started_at).toBeTruthy();
    expect(state.last_heartbeat).toBeTruthy();
    // started_at and last_heartbeat should be the same (just created)
    expect(state.started_at).toBe(state.last_heartbeat);
    expect(state.escalation?.type).toBe("clarification");
  });

  // ── AC4: returns confirmation including agent_id and escalation type ──────

  it("prints confirmation with agent_id and escalation type for new agent", async () => {
    out.restore();
    out = captureOutput();

    await agentEscalate({
      agentId: "confirm-agent",
      type: "approval",
      message: "Deploy to production?",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Created");
    expect(lines).toContain("confirm-agent");
    expect(lines).toContain("approval");
  });

  it("prints confirmation with agent_id and escalation type for existing agent", async () => {
    await agentHeartbeat({ agentId: "confirm-agent-2", status: "active" });

    out.restore();
    out = captureOutput();

    await agentEscalate({
      agentId: "confirm-agent-2",
      type: "decision",
      message: "Which approach?",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Updated");
    expect(lines).toContain("confirm-agent-2");
    expect(lines).toContain("decision");
  });

  // ── Defaults ──────────────────────────────────────────────────────────────

  it("defaults confidence to 0.5 when not provided", async () => {
    await agentEscalate({
      agentId: "default-conf-agent",
      type: "decision",
      message: "What to do?",
    });

    const state = readAgentState(tmp.projectsDir, "default-conf-agent");
    expect(state.escalation?.confidence).toBe(0.5);
  });

  it("accepts all escalation types", async () => {
    for (const type of ["decision", "clarification", "approval", "error"]) {
      await agentEscalate({
        agentId: `type-${type}-agent`,
        type,
        message: `Testing ${type}`,
      });

      const state = readAgentState(tmp.projectsDir, `type-${type}-agent`);
      expect(state.escalation?.type).toBe(type);
      expect(state.status).toBe("needs_attention");
    }
  });
});

describe("pm agent check-response (integration)", () => {
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

  // ── AC1: tool is registered with correct parameters ──────────────────────
  // (Covered by MCP server test; the CLI command mirrors the parameters.)

  // ── AC2: returns response content when response file exists ──────────────

  it("returns response content when response file exists", async () => {
    // Write a response file via the I/O helper
    writeAgentResponse(tmp.projectsDir, "resp-agent", {
      selected_option: "Option A",
      additional_context: "Go with the simpler approach",
      responded_at: "2026-03-13T12:00:00Z",
    });

    out.restore();
    out = captureOutput();

    await agentCheckResponse({ agentId: "resp-agent" });

    const lines = out.log().join("\n");
    const parsed = JSON.parse(lines);
    expect(parsed.selected_option).toBe("Option A");
    expect(parsed.additional_context).toBe("Go with the simpler approach");
    expect(parsed.responded_at).toBe("2026-03-13T12:00:00Z");
  });

  // ── AC3: returns {status: no_response} when no response file exists ──────

  it("returns {status: no_response} when no response file exists", async () => {
    out.restore();
    out = captureOutput();

    await agentCheckResponse({ agentId: "no-resp-agent" });

    const lines = out.log().join("\n");
    const parsed = JSON.parse(lines);
    expect(parsed.status).toBe("no_response");
  });

  // ── AC4: response file is deleted after successful read ──────────────────

  it("deletes response file after successful read (read-once semantics)", async () => {
    writeAgentResponse(tmp.projectsDir, "delete-agent", {
      selected_option: "Option B",
      responded_at: "2026-03-13T13:00:00Z",
    });

    const responsePath = path.join(
      tmp.projectsDir,
      "agents",
      "delete-agent-response.yaml",
    );
    expect(fs.existsSync(responsePath)).toBe(true);

    await agentCheckResponse({ agentId: "delete-agent" });

    // File should be deleted after read
    expect(fs.existsSync(responsePath)).toBe(false);
  });

  it("second read returns no_response after file is consumed", async () => {
    writeAgentResponse(tmp.projectsDir, "once-agent", {
      selected_option: "Only once",
      responded_at: "2026-03-13T14:00:00Z",
    });

    // First read consumes the file
    await agentCheckResponse({ agentId: "once-agent" });

    out.restore();
    out = captureOutput();

    // Second read should return no_response
    await agentCheckResponse({ agentId: "once-agent" });

    const lines = out.log().join("\n");
    const parsed = JSON.parse(lines);
    expect(parsed.status).toBe("no_response");
  });

  // ── AC5: CLI command provides the same functionality ─────────────────────

  it("works with minimal response (only responded_at)", async () => {
    writeAgentResponse(tmp.projectsDir, "minimal-agent", {
      responded_at: "2026-03-13T15:00:00Z",
    });

    out.restore();
    out = captureOutput();

    await agentCheckResponse({ agentId: "minimal-agent" });

    const lines = out.log().join("\n");
    const parsed = JSON.parse(lines);
    expect(parsed.responded_at).toBe("2026-03-13T15:00:00Z");
    // Optional fields should not be present if not set
    expect(parsed.selected_option).toBeUndefined();
    expect(parsed.additional_context).toBeUndefined();
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("throws ValidationError when --agent-id is missing", async () => {
    await expect(agentCheckResponse({})).rejects.toThrow(
      "Missing required option: --agent-id",
    );
  });

  // ── Does not interfere with agent state file ─────────────────────────────

  it("does not modify agent state file when checking response", async () => {
    // Create agent state
    await agentHeartbeat({
      agentId: "state-agent",
      status: "needs_attention",
      currentTask: "TEST-E001-S001",
    });

    // Write a response
    writeAgentResponse(tmp.projectsDir, "state-agent", {
      selected_option: "Continue",
      responded_at: "2026-03-13T16:00:00Z",
    });

    const stateBefore = readAgentState(tmp.projectsDir, "state-agent");

    await agentCheckResponse({ agentId: "state-agent" });

    const stateAfter = readAgentState(tmp.projectsDir, "state-agent");
    // Agent state should be untouched
    expect(stateAfter.status).toBe(stateBefore.status);
    expect(stateAfter.current_task).toBe(stateBefore.current_task);
    expect(stateAfter.last_heartbeat).toBe(stateBefore.last_heartbeat);
  });
});
