import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  AGENT_HEARTBEAT_STALE_MS,
  getHeartbeatAgeMs,
  getHeartbeatStaleThresholdMs,
  isTrackedProcessAlive,
  isAgentHeartbeatStale,
  observeAgentState,
  appendEscalationLogEntry,
  killTrackedProcess,
  readAgentProcess,
  readEscalationLog,
  readAgentState,
  listAgents,
  deriveObservedAgentId,
  writeAgentProcess,
  writeEscalationLog,
  writeAgentState,
  writeAgentResponse,
  readAgentResponse,
} from "../agent-state.js";
import type {
  AgentProcess,
  AgentState,
} from "../../schemas/agent-state.schema.js";
import type { EscalationLogEntry } from "../../schemas/escalation-log.schema.js";
import { YamlNotFoundError, ZodValidationError } from "../errors.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeValidState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agent_id: "test-agent",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    ...overrides,
  };
}

function makeValidProcess(overrides: Partial<AgentProcess> = {}): AgentProcess {
  return {
    pid: 12345,
    spawned_at: "2026-04-08T10:00:00Z",
    command: 'claude -p "/pm-work-on PM-E065-S002"',
    method: "background",
    ...overrides,
  };
}

function makeLogEntry(
  overrides: Partial<EscalationLogEntry> = {},
): EscalationLogEntry {
  return {
    type: "decision",
    message: "Need guidance on approach",
    confidence: 0.7,
    options: ["A", "B"],
    selected_option: "A",
    additional_context: "Choose the lower-risk path",
    responded_at: "2026-03-13T11:00:00Z",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("agent-state I/O helpers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-agent-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── writeAgentState ──────────────────────────────────────────────────────

  describe("writeAgentState", () => {
    it("writes a valid agent state YAML to .pm/agents/{agent_id}.yaml", () => {
      const state = makeValidState();
      writeAgentState(tmpDir, state);

      const filePath = path.join(tmpDir, "agents", "test-agent.yaml");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("agent_id: test-agent");
      expect(content).toContain("status: active");
    });

    it("creates the agents directory if it does not exist", () => {
      const agentsDir = path.join(tmpDir, "agents");
      expect(fs.existsSync(agentsDir)).toBe(false);

      writeAgentState(tmpDir, makeValidState());
      expect(fs.existsSync(agentsDir)).toBe(true);
    });

    it("validates the state before writing (rejects invalid data)", () => {
      const invalid = {
        agent_id: "",
        status: "active",
        started_at: "2026-03-13T10:00:00Z",
        last_heartbeat: "2026-03-13T10:00:00Z",
      } as AgentState;

      expect(() => writeAgentState(tmpDir, invalid)).toThrow(
        ZodValidationError,
      );
    });

    it("overwrites an existing agent state file", () => {
      writeAgentState(tmpDir, makeValidState({ status: "active" }));
      writeAgentState(tmpDir, makeValidState({ status: "idle" }));

      const filePath = path.join(tmpDir, "agents", "test-agent.yaml");
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("status: idle");
      expect(content).not.toContain("status: active");
    });

    it("writes all optional fields when provided", () => {
      const state = makeValidState({
        session_id: "sess-123",
        current_task: "PM-E051-S001",
        progress_summary: "Working on schema",
        progress: {
          total_criteria: 3,
          completed_criteria: 1,
          current_step: "Define schema",
          criteria_status: [
            { criterion: "Schema added", status: "done" },
            { criterion: "Tests updated", status: "pending" },
          ],
        },
        escalation: {
          type: "decision",
          message: "Which approach?",
          confidence: 0.8,
          options: ["A", "B"],
        },
      });
      writeAgentState(tmpDir, state);

      const filePath = path.join(tmpDir, "agents", "test-agent.yaml");
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("session_id: sess-123");
      expect(content).toContain("current_task: PM-E051-S001");
      expect(content).toContain("progress_summary: Working on schema");
      expect(content).toContain("total_criteria: 3");
      expect(content).toContain("completed_criteria: 1");
      expect(content).toContain("current_step: Define schema");
      expect(content).toContain("criterion: Schema added");
      expect(content).toContain("type: decision");
    });
  });

  describe("deriveObservedAgentId", () => {
    it("keeps single-agent identities unchanged when session_id is omitted", () => {
      expect(deriveObservedAgentId("agent-base")).toBe("agent-base");
    });

    it("derives deterministic session-scoped worker identities", () => {
      const first = deriveObservedAgentId("shared-agent", "run/one");
      const same = deriveObservedAgentId("shared-agent", "run/one");
      const second = deriveObservedAgentId("shared-agent", "run/two");

      expect(first).toBe(same);
      expect(first).not.toBe(second);
      expect(first).toMatch(/^shared-agent--run-one-[0-9a-f]{8}$/);
      expect(second).toMatch(/^shared-agent--run-two-[0-9a-f]{8}$/);
    });
  });

  // ── readAgentState ───────────────────────────────────────────────────────

  describe("readAgentState", () => {
    it("reads and validates a written agent state file", () => {
      const state = makeValidState({
        session_id: "sess-456",
        current_task: "PM-E001-S003",
      });
      writeAgentState(tmpDir, state);

      const result = readAgentState(tmpDir, "test-agent");
      expect(result.agent_id).toBe("test-agent");
      expect(result.status).toBe("active");
      expect(result.session_id).toBe("sess-456");
      expect(result.current_task).toBe("PM-E001-S003");
    });

    it("reads back progress when present", () => {
      writeAgentState(
        tmpDir,
        makeValidState({
          progress: {
            total_criteria: 2,
            completed_criteria: 1,
            current_step: "Run tests",
            criteria_status: [
              { criterion: "Schema added", status: "done" },
              { criterion: "Heartbeat accepts progress", status: "pending" },
            ],
          },
        }),
      );

      const result = readAgentState(tmpDir, "test-agent");
      expect(result.progress?.total_criteria).toBe(2);
      expect(result.progress?.completed_criteria).toBe(1);
      expect(result.progress?.current_step).toBe("Run tests");
      expect(result.progress?.criteria_status).toEqual([
        { criterion: "Schema added", status: "done" },
        { criterion: "Heartbeat accepts progress", status: "pending" },
      ]);
    });

    it("throws YamlNotFoundError when the file does not exist", () => {
      expect(() => readAgentState(tmpDir, "nonexistent-agent")).toThrow(
        YamlNotFoundError,
      );
    });

    it("throws a descriptive error message for missing files", () => {
      try {
        readAgentState(tmpDir, "nonexistent-agent");
      } catch (err) {
        expect(err).toBeInstanceOf(YamlNotFoundError);
        if (err instanceof YamlNotFoundError) {
          expect(err.message).toContain("nonexistent-agent");
        }
      }
    });

    it("throws ZodValidationError for invalid file content", () => {
      const agentsDir = path.join(tmpDir, "agents");
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, "bad-agent.yaml"),
        "agent_id: bad\nstatus: invalid_status\n",
        "utf8",
      );

      expect(() => readAgentState(tmpDir, "bad-agent")).toThrow(
        ZodValidationError,
      );
    });
  });

  describe("agent process tracking", () => {
    it("writes a validated process YAML to .pm/agents/{agent_id}-process.yaml", () => {
      writeAgentProcess(tmpDir, "dispatch-agent", makeValidProcess());

      const filePath = path.join(
        tmpDir,
        "agents",
        "dispatch-agent-process.yaml",
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("pid: 12345");
      expect(content).toContain("spawned_at: '2026-04-08T10:00:00Z'");
      expect(content).toContain("command:");
      expect(content).toContain("/pm-work-on PM-E065-S002");
      expect(content).toContain("method: background");
    });

    it("reads back a written process file", () => {
      writeAgentProcess(
        tmpDir,
        "tmux-agent",
        makeValidProcess({ method: "tmux", pid: 4321 }),
      );

      const result = readAgentProcess(tmpDir, "tmux-agent");
      expect(result).toEqual({
        pid: 4321,
        spawned_at: "2026-04-08T10:00:00Z",
        command: 'claude -p "/pm-work-on PM-E065-S002"',
        method: "tmux",
      });
    });

    it("validates process records before writing", () => {
      expect(() =>
        writeAgentProcess(
          tmpDir,
          "bad-agent",
          makeValidProcess({ pid: 0 }) as AgentProcess,
        ),
      ).toThrow(ZodValidationError);
    });

    it("ignores -process.yaml files when listing agent state files", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "visible-agent" }));
      writeAgentProcess(tmpDir, "visible-agent", makeValidProcess());

      const result = listAgents(tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0]?.agent_id).toBe("visible-agent");
    });

    it("sends SIGTERM when killing a tracked pid", () => {
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

      try {
        expect(killTrackedProcess(4321)).toEqual({ already_dead: false });
        expect(killSpy).toHaveBeenCalledWith(4321, "SIGTERM");
      } finally {
        killSpy.mockRestore();
      }
    });

    it("treats missing tracked pids as already dead when killing", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("missing process") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      });

      try {
        expect(killTrackedProcess(7777)).toEqual({ already_dead: true });
        expect(killSpy).toHaveBeenCalledWith(7777, "SIGTERM");
      } finally {
        killSpy.mockRestore();
      }
    });
  });

  // ── listAgents ───────────────────────────────────────────────────────────

  describe("listAgents", () => {
    it("returns an empty array when the agents directory does not exist", () => {
      const result = listAgents(tmpDir);
      expect(result).toEqual([]);
    });

    it("returns an empty array when the agents directory is empty", () => {
      fs.mkdirSync(path.join(tmpDir, "agents"), { recursive: true });
      const result = listAgents(tmpDir);
      expect(result).toEqual([]);
    });

    it("returns all valid agent states", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "agent-1" }));
      writeAgentState(tmpDir, makeValidState({ agent_id: "agent-2" }));
      writeAgentState(
        tmpDir,
        makeValidState({ agent_id: "agent-3", status: "idle" }),
      );

      const result = listAgents(tmpDir);
      expect(result).toHaveLength(3);
      const ids = result.map((a) => a.agent_id).sort();
      expect(ids).toEqual(["agent-1", "agent-2", "agent-3"]);
      expect(
        result.every((agent) => typeof agent.heartbeat_stale === "boolean"),
      ).toBe(true);
    });

    it("lists distinct completed workers when they persist with derived session-scoped ids", () => {
      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: deriveObservedAgentId("shared-agent", "run-1"),
          session_id: "run-1",
          current_task: "PM-E065-S006",
          status: "completed",
          started_at: "2026-04-08T10:00:00Z",
          last_heartbeat: "2026-04-08T10:05:00Z",
          progress_summary: "Completed first worker",
        }),
      );

      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: deriveObservedAgentId("shared-agent", "run-2"),
          session_id: "run-2",
          current_task: "PM-E065-S007",
          status: "completed",
          started_at: "2026-04-08T10:06:00Z",
          last_heartbeat: "2026-04-08T10:06:30Z",
          progress_summary: "Completed second worker",
        }),
      );

      expect(listAgents(tmpDir)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_id: deriveObservedAgentId("shared-agent", "run-1"),
            session_id: "run-1",
            current_task: "PM-E065-S006",
            status: "completed",
          }),
          expect.objectContaining({
            agent_id: deriveObservedAgentId("shared-agent", "run-2"),
            session_id: "run-2",
            current_task: "PM-E065-S007",
            status: "completed",
          }),
        ]),
      );
    });

    it("marks active agents with dead tracked pids as crashed", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "crashed-agent" }));
      writeAgentProcess(
        tmpDir,
        "crashed-agent",
        makeValidProcess({ pid: 7777 }),
      );

      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((pid: number) => {
          if (pid === 7777) {
            const err = new Error("missing process") as NodeJS.ErrnoException;
            err.code = "ESRCH";
            throw err;
          }

          return true;
        });

      try {
        const result = listAgents(tmpDir);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          agent_id: "crashed-agent",
          tracked_pid: 7777,
          process_alive: false,
          process_crashed: true,
        });
        expect(killSpy).toHaveBeenCalledWith(7777, 0);
      } finally {
        killSpy.mockRestore();
      }
    });

    it("does not check liveness for agents without tracked pids", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "external-agent" }));

      const killSpy = vi.spyOn(process, "kill");

      try {
        const result = listAgents(tmpDir);
        expect(result).toHaveLength(1);
        expect(result[0]?.agent_id).toBe("external-agent");
        expect(result[0]).not.toHaveProperty("process_alive");
        expect(result[0]).not.toHaveProperty("process_crashed");
        expect(result[0]).not.toHaveProperty("tracked_pid");
        expect(killSpy).not.toHaveBeenCalled();
      } finally {
        killSpy.mockRestore();
      }
    });

    it("skips invalid files with stderr warnings", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "good-agent" }));

      // Write an invalid agent state file
      const agentsDir = path.join(tmpDir, "agents");
      fs.writeFileSync(
        path.join(agentsDir, "bad-agent.yaml"),
        "not_valid: true\n",
        "utf8",
      );

      const stderrChunks: string[] = [];
      const origWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrChunks.push(chunk);
        return true;
      }) as typeof process.stderr.write;

      try {
        const result = listAgents(tmpDir);
        expect(result).toHaveLength(1);
        expect(result[0].agent_id).toBe("good-agent");
        expect(stderrChunks.some((c) => c.includes("Warning"))).toBe(true);
        expect(stderrChunks.some((c) => c.includes("bad-agent"))).toBe(true);
      } finally {
        process.stderr.write = origWrite;
      }
    });

    it("skips response files (ending in -response.yaml)", () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "agent-1" }));
      writeAgentResponse(tmpDir, "agent-1", {
        selected_option: "A",
        responded_at: "2026-03-13T11:00:00Z",
      });

      const result = listAgents(tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].agent_id).toBe("agent-1");
    });

    it("skips escalation log files (ending in -escalation-log.yaml)", async () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "agent-1" }));
      await writeEscalationLog(tmpDir, "agent-1", [makeLogEntry()]);

      const stderrChunks: string[] = [];
      const origWrite = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrChunks.push(chunk);
        return true;
      }) as typeof process.stderr.write;

      try {
        const result = listAgents(tmpDir);
        expect(result).toHaveLength(1);
        expect(result[0].agent_id).toBe("agent-1");
        expect(stderrChunks).toEqual([]);
      } finally {
        process.stderr.write = origWrite;
      }
    });

    it("loads escalation history onto the observed agent state", async () => {
      writeAgentState(tmpDir, makeValidState({ agent_id: "agent-1" }));
      await writeEscalationLog(tmpDir, "agent-1", [
        makeLogEntry({
          message: "Past escalation",
          selected_option: "ship",
          responded_at: "2026-03-13T11:00:00Z",
        }),
      ]);

      const result = listAgents(tmpDir);

      expect(result).toHaveLength(1);
      expect(result[0].escalation_history).toEqual([
        expect.objectContaining({
          message: "Past escalation",
          selected_option: "ship",
        }),
      ]);
    });
  });

  // ── heartbeat observation helpers ────────────────────────────────────────

  describe("heartbeat observation helpers", () => {
    it("computes heartbeat age from last_heartbeat", () => {
      const state = makeValidState({
        last_heartbeat: "2026-03-13T10:04:30Z",
      });

      expect(getHeartbeatAgeMs(state, Date.parse("2026-03-13T10:05:00Z"))).toBe(
        30_000,
      );
    });

    it("detects fresh heartbeats inside the staleness threshold", () => {
      const state = makeValidState({
        last_heartbeat: "2026-03-13T10:04:01Z",
      });

      expect(
        isAgentHeartbeatStale(state, Date.parse("2026-03-13T10:05:00Z")),
      ).toBe(false);
    });

    it("detects stale heartbeats older than the default threshold", () => {
      const state = makeValidState({
        last_heartbeat: "2026-03-13T10:03:59Z",
      });

      expect(AGENT_HEARTBEAT_STALE_MS).toBe(60_000);
      expect(
        isAgentHeartbeatStale(state, Date.parse("2026-03-13T10:05:00Z")),
      ).toBe(true);
    });

    it("does not mark completed agents as stale", () => {
      const state = makeValidState({
        status: "completed",
        last_heartbeat: "2026-03-13T10:03:00Z",
      });

      expect(
        isAgentHeartbeatStale(state, Date.parse("2026-03-13T10:05:00Z")),
      ).toBe(false);
    });

    it("adds derived heartbeat fields for observed agent state", () => {
      const observed = observeAgentState(
        makeValidState({
          last_heartbeat: "2026-03-13T10:03:30Z",
        }),
        Date.parse("2026-03-13T10:05:00Z"),
      );

      expect(observed.heartbeat_age_ms).toBe(90_000);
      expect(observed.heartbeat_stale).toBe(true);
      expect(observed.escalation_history).toEqual([]);
    });

    it("loads stale threshold from project.yaml", () => {
      fs.writeFileSync(
        path.join(tmpDir, "project.yaml"),
        [
          "code: PM",
          "name: Test Project",
          "status: active",
          "created_at: '2026-01-01'",
          "stale_threshold_seconds: 120",
        ].join("\n"),
        "utf8",
      );

      expect(getHeartbeatStaleThresholdMs(tmpDir)).toBe(120_000);
    });

    it("falls back to the default stale threshold when project.yaml is missing", () => {
      expect(getHeartbeatStaleThresholdMs(tmpDir)).toBe(
        AGENT_HEARTBEAT_STALE_MS,
      );
    });
  });

  describe("isTrackedProcessAlive", () => {
    it("treats EPERM as alive", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("permission denied") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      });

      try {
        expect(isTrackedProcessAlive(4321)).toBe(true);
      } finally {
        killSpy.mockRestore();
      }
    });

    it("treats ESRCH as dead", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("missing process") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      });

      try {
        expect(isTrackedProcessAlive(4321)).toBe(false);
      } finally {
        killSpy.mockRestore();
      }
    });
  });

  // ── writeAgentResponse ───────────────────────────────────────────────────

  describe("writeAgentResponse", () => {
    it("writes a response YAML to .pm/agents/{agent_id}-response.yaml", () => {
      const response = {
        selected_option: "Option A",
        additional_context: "Prefer this approach because...",
        responded_at: "2026-03-13T11:00:00Z",
      };
      writeAgentResponse(tmpDir, "test-agent", response);

      const filePath = path.join(tmpDir, "agents", "test-agent-response.yaml");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("selected_option: Option A");
      expect(content).toContain("responded_at:");
    });

    it("creates the agents directory if it does not exist", () => {
      const agentsDir = path.join(tmpDir, "agents");
      expect(fs.existsSync(agentsDir)).toBe(false);

      writeAgentResponse(tmpDir, "test-agent", {
        responded_at: "2026-03-13T11:00:00Z",
      });
      expect(fs.existsSync(agentsDir)).toBe(true);
    });

    it("validates the response before writing", () => {
      expect(() =>
        writeAgentResponse(tmpDir, "test-agent", {
          responded_at: "not-a-date",
        }),
      ).toThrow(ZodValidationError);
    });

    it("writes a response with only responded_at (minimal)", () => {
      writeAgentResponse(tmpDir, "test-agent", {
        responded_at: "2026-03-13T11:00:00Z",
      });

      const filePath = path.join(tmpDir, "agents", "test-agent-response.yaml");
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ── readAgentResponse ────────────────────────────────────────────────────

  describe("readAgentResponse", () => {
    it("reads and deletes the response file (read-once semantics)", async () => {
      const response = {
        selected_option: "Option B",
        additional_context: "Go with this one",
        responded_at: "2026-03-13T11:00:00Z",
      };
      writeAgentResponse(tmpDir, "test-agent", response);

      const filePath = path.join(tmpDir, "agents", "test-agent-response.yaml");
      expect(fs.existsSync(filePath)).toBe(true);

      const result = await readAgentResponse(tmpDir, "test-agent");
      expect(result).not.toBeNull();
      expect(result!.selected_option).toBe("Option B");
      expect(result!.additional_context).toBe("Go with this one");

      // File should be deleted after read
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("returns null when no response file exists", async () => {
      const result = await readAgentResponse(tmpDir, "nonexistent-agent");
      expect(result).toBeNull();
    });

    it("second read returns null (read-once)", async () => {
      writeAgentResponse(tmpDir, "test-agent", {
        selected_option: "A",
        responded_at: "2026-03-13T11:00:00Z",
      });

      const first = await readAgentResponse(tmpDir, "test-agent");
      expect(first).not.toBeNull();

      const second = await readAgentResponse(tmpDir, "test-agent");
      expect(second).toBeNull();
    });

    it("archives escalation data with the response before deleting the file", async () => {
      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: "test-agent",
          status: "needs_attention",
          escalation: {
            type: "decision",
            message: "Need approval",
            confidence: 0.6,
            options: ["ship", "wait"],
          },
        }),
      );
      writeAgentResponse(tmpDir, "test-agent", {
        selected_option: "ship",
        additional_context: "Approved by reviewer",
        responded_at: "2026-03-13T11:00:00Z",
      });

      const responsePath = path.join(
        tmpDir,
        "agents",
        "test-agent-response.yaml",
      );
      const result = await readAgentResponse(tmpDir, "test-agent");

      expect(result).toEqual({
        selected_option: "ship",
        additional_context: "Approved by reviewer",
        responded_at: "2026-03-13T11:00:00Z",
      });
      expect(fs.existsSync(responsePath)).toBe(false);
      expect(readEscalationLog(tmpDir, "test-agent")).toEqual([
        {
          type: "decision",
          message: "Need approval",
          confidence: 0.6,
          options: ["ship", "wait"],
          selected_option: "ship",
          additional_context: "Approved by reviewer",
          responded_at: "2026-03-13T11:00:00Z",
        },
      ]);
    });

    it("appends a new escalation log entry on each response cycle", async () => {
      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: "test-agent",
          status: "needs_attention",
          escalation: {
            type: "decision",
            message: "Need approval",
            confidence: 0.6,
          },
        }),
      );
      writeAgentResponse(tmpDir, "test-agent", {
        selected_option: "ship",
        responded_at: "2026-03-13T11:00:00Z",
      });
      await readAgentResponse(tmpDir, "test-agent");

      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: "test-agent",
          status: "needs_attention",
          escalation: {
            type: "clarification",
            message: "Need more detail",
            confidence: 0.4,
          },
        }),
      );
      writeAgentResponse(tmpDir, "test-agent", {
        additional_context: "Use the API contract",
        responded_at: "2026-03-13T12:00:00Z",
      });
      await readAgentResponse(tmpDir, "test-agent");

      const log = readEscalationLog(tmpDir, "test-agent");
      expect(log).toHaveLength(2);
      expect(log[0].message).toBe("Need approval");
      expect(log[0].selected_option).toBe("ship");
      expect(log[1].type).toBe("clarification");
      expect(log[1].additional_context).toBe("Use the API contract");
    });

    it("returns the response even when escalation log append fails", async () => {
      writeAgentState(
        tmpDir,
        makeValidState({
          agent_id: "test-agent",
          status: "needs_attention",
          escalation: {
            type: "decision",
            message: "Need approval",
            confidence: 0.6,
          },
        }),
      );
      writeAgentResponse(tmpDir, "test-agent", {
        selected_option: "ship",
        responded_at: "2026-03-13T11:00:00Z",
      });
      fs.mkdirSync(path.join(tmpDir, "agents"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "agents", "test-agent-escalation-log.yaml"),
        "- type: decision\n  message: broken\n  confidence: 0.5\n  responded_at: not-a-date\n",
        "utf8",
      );

      const responsePath = path.join(
        tmpDir,
        "agents",
        "test-agent-response.yaml",
      );
      const result = await readAgentResponse(tmpDir, "test-agent");

      expect(result).toEqual({
        selected_option: "ship",
        responded_at: "2026-03-13T11:00:00Z",
      });
      expect(fs.existsSync(responsePath)).toBe(false);
    });
  });

  // ── escalation log helpers ───────────────────────────────────────────────

  describe("writeEscalationLog", () => {
    it("writes a YAML array to .pm/agents/{agent_id}-escalation-log.yaml", async () => {
      await writeEscalationLog(tmpDir, "test-agent", [makeLogEntry()]);

      const filePath = path.join(
        tmpDir,
        "agents",
        "test-agent-escalation-log.yaml",
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain("- type: decision");
      expect(content).toContain("selected_option: A");
      expect(content).toContain("responded_at: '2026-03-13T11:00:00Z'");
    });

    it("validates the log before writing", async () => {
      await expect(
        writeEscalationLog(tmpDir, "test-agent", [
          { responded_at: "not-a-date" } as EscalationLogEntry,
        ]),
      ).rejects.toThrow(ZodValidationError);
    });
  });

  describe("readEscalationLog", () => {
    it("returns an empty array when the log file does not exist", () => {
      expect(readEscalationLog(tmpDir, "missing-agent")).toEqual([]);
    });

    it("reads and validates a written escalation log", async () => {
      const logEntry = makeLogEntry({
        selected_option: "B",
        responded_at: "2026-03-13T12:00:00Z",
      });
      await writeEscalationLog(tmpDir, "test-agent", [logEntry]);

      const result = readEscalationLog(tmpDir, "test-agent");
      expect(result).toEqual([logEntry]);
    });
  });

  describe("appendEscalationLogEntry", () => {
    it("appends entries to the escalation log file", async () => {
      await appendEscalationLogEntry(tmpDir, "test-agent", makeLogEntry());
      await appendEscalationLogEntry(
        tmpDir,
        "test-agent",
        makeLogEntry({
          type: "error",
          message: "Build failed",
          confidence: 0.9,
          selected_option: undefined,
          additional_context: undefined,
          responded_at: undefined,
        }),
      );

      const result = readEscalationLog(tmpDir, "test-agent");
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("decision");
      expect(result[1].type).toBe("error");
      expect(result[1].responded_at).toBeUndefined();
    });

    it("validates each appended entry", async () => {
      await expect(
        appendEscalationLogEntry(tmpDir, "test-agent", {
          ...makeLogEntry(),
          confidence: 1.5,
        }),
      ).rejects.toThrow(ZodValidationError);
    });
  });
});
