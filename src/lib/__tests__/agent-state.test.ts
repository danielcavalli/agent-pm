import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeAgentState,
  readAgentState,
  listAgents,
  writeAgentResponse,
  readAgentResponse,
} from "../agent-state.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";
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
      expect(content).toContain("type: decision");
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

      const filePath = path.join(
        tmpDir,
        "agents",
        "test-agent-response.yaml",
      );
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

      const filePath = path.join(
        tmpDir,
        "agents",
        "test-agent-response.yaml",
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ── readAgentResponse ────────────────────────────────────────────────────

  describe("readAgentResponse", () => {
    it("reads and deletes the response file (read-once semantics)", () => {
      const response = {
        selected_option: "Option B",
        additional_context: "Go with this one",
        responded_at: "2026-03-13T11:00:00Z",
      };
      writeAgentResponse(tmpDir, "test-agent", response);

      const filePath = path.join(
        tmpDir,
        "agents",
        "test-agent-response.yaml",
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const result = readAgentResponse(tmpDir, "test-agent");
      expect(result).not.toBeNull();
      expect(result!.selected_option).toBe("Option B");
      expect(result!.additional_context).toBe("Go with this one");

      // File should be deleted after read
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("returns null when no response file exists", () => {
      const result = readAgentResponse(tmpDir, "nonexistent-agent");
      expect(result).toBeNull();
    });

    it("second read returns null (read-once)", () => {
      writeAgentResponse(tmpDir, "test-agent", {
        selected_option: "A",
        responded_at: "2026-03-13T11:00:00Z",
      });

      const first = readAgentResponse(tmpDir, "test-agent");
      expect(first).not.toBeNull();

      const second = readAgentResponse(tmpDir, "test-agent");
      expect(second).toBeNull();
    });
  });
});
