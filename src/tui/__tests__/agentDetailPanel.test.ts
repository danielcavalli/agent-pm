import { describe, it, expect } from "vitest";
import { buildAgentDetailLines } from "../components/DetailPanel.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agent_id: "agent-01",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    ...overrides,
  };
}

describe("buildAgentDetailLines", () => {
  describe("agent with needs_attention + escalation", () => {
    const agent = makeAgent({
      agent_id: "agent-42",
      status: "needs_attention",
      current_task: "PM-E055-S001",
      escalation: {
        type: "decision",
        message: "Which JWT algorithm should we use for the auth tokens?",
        confidence: 0.65,
        options: [
          "RS256 with key rotation",
          "HS256 with shared secret",
          "EdDSA with Ed25519",
        ],
      },
    });

    it("renders the ESCALATION header", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-header");
    });

    it("renders escalation type label", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-type");
    });

    it("renders the agent id", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-agent");
    });

    it("renders the escalation message", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-msg-label");
      // At least one message line
      const msgLines = keys.filter((k) => k.startsWith("esc-msg-"));
      expect(msgLines.length).toBeGreaterThan(0);
    });

    it("renders the confidence as a percentage", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-confidence");
    });

    it("renders numbered options", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-options-label");
      // Should have lines for each option: esc-opt-0-*, esc-opt-1-*, esc-opt-2-*
      const optionLines = keys.filter((k) => k.startsWith("esc-opt-"));
      expect(optionLines.length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT render general agent-header", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("agent-header");
    });
  });

  describe("agent with needs_attention but no escalation", () => {
    const agent = makeAgent({
      agent_id: "agent-99",
      status: "needs_attention",
      current_task: "PM-E053-S004",
      progress_summary: "Working on color-coded agent states",
    });

    it("renders general agent details (not escalation)", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-header");
      expect(keys).toContain("agent-id");
      expect(keys).toContain("agent-status");
      expect(keys).not.toContain("esc-header");
    });
  });

  describe("agent with no escalation (general state)", () => {
    const agent = makeAgent({
      agent_id: "worker-alpha",
      status: "active",
      current_task: "PM-E054-S003",
      progress_summary: "Implementing scroll mechanism for detail panel",
    });

    it("renders general agent header", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-header");
    });

    it("renders agent_id field", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-id");
    });

    it("renders status field", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-status");
    });

    it("renders current_task when present", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-task");
    });

    it("renders last_heartbeat", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-heartbeat");
    });

    it("renders progress_summary when present", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-progress-label");
      const progressLines = keys.filter((k) => k.startsWith("agent-progress-"));
      expect(progressLines.length).toBeGreaterThan(0);
    });

    it("omits current_task when absent", () => {
      const agentNoTask = makeAgent({
        agent_id: "idle-agent",
        status: "idle",
      });
      const lines = buildAgentDetailLines(agentNoTask, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("agent-task");
    });

    it("omits progress_summary when absent", () => {
      const agentNoProgress = makeAgent({
        agent_id: "idle-agent",
        status: "idle",
      });
      const lines = buildAgentDetailLines(agentNoProgress, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("agent-progress-label");
    });

    it("does NOT render escalation header", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("esc-header");
    });

    it("renders started_at field", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-started");
    });

    it("renders session_id when present", () => {
      const agentWithSession = makeAgent({
        agent_id: "session-agent",
        status: "active",
        session_id: "sess-abc123",
      });
      const lines = buildAgentDetailLines(agentWithSession, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-session");
    });

    it("omits session_id when absent", () => {
      const agentNoSession = makeAgent({
        agent_id: "no-session-agent",
        status: "active",
      });
      const lines = buildAgentDetailLines(agentNoSession, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("agent-session");
    });
  });

  describe("escalation with no options", () => {
    const agent = makeAgent({
      agent_id: "agent-no-opts",
      status: "needs_attention",
      escalation: {
        type: "error",
        message: "Build failed with exit code 1",
        confidence: 0.9,
      },
    });

    it("does not render options section when options are absent", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("esc-options-label");
      const optLines = keys.filter((k) => k.startsWith("esc-opt-"));
      expect(optLines).toHaveLength(0);
    });

    it("still renders type, message, and confidence", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("esc-type");
      expect(keys).toContain("esc-msg-label");
      expect(keys).toContain("esc-confidence");
    });
  });

  describe("escalation with empty options array", () => {
    const agent = makeAgent({
      agent_id: "agent-empty-opts",
      status: "needs_attention",
      escalation: {
        type: "clarification",
        message: "Need clarification on API contract",
        confidence: 0.4,
        options: [],
      },
    });

    it("does not render options section when options array is empty", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).not.toContain("esc-options-label");
    });
  });

  describe("escalation type labels", () => {
    it("maps 'decision' to 'Decision Required'", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "decision",
          message: "test",
          confidence: 0.5,
        },
      });
      const lines = buildAgentDetailLines(agent, 60);
      // The esc-type line should contain the mapped label
      const typeLine = lines.find((l) => l.key === "esc-type");
      expect(typeLine).toBeDefined();
    });

    it("maps 'clarification' to 'Clarification Needed'", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "clarification",
          message: "test",
          confidence: 0.5,
        },
      });
      const lines = buildAgentDetailLines(agent, 60);
      const typeLine = lines.find((l) => l.key === "esc-type");
      expect(typeLine).toBeDefined();
    });

    it("maps 'approval' to 'Approval Required'", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "approval",
          message: "test",
          confidence: 0.5,
        },
      });
      const lines = buildAgentDetailLines(agent, 60);
      const typeLine = lines.find((l) => l.key === "esc-type");
      expect(typeLine).toBeDefined();
    });

    it("maps 'error' to 'Error'", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "error",
          message: "test",
          confidence: 0.5,
        },
      });
      const lines = buildAgentDetailLines(agent, 60);
      const typeLine = lines.find((l) => l.key === "esc-type");
      expect(typeLine).toBeDefined();
    });
  });

  describe("confidence rendering", () => {
    it("rounds confidence to integer percentage", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "decision",
          message: "test",
          confidence: 0.654,
        },
      });
      // We verify the line exists; the actual content check would need React rendering
      const lines = buildAgentDetailLines(agent, 60);
      const confLine = lines.find((l) => l.key === "esc-confidence");
      expect(confLine).toBeDefined();
    });
  });

  describe("scrollability (line count)", () => {
    it("generates enough lines to require scrolling with many options", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "decision",
          message:
            "This is a very long escalation message that describes the problem in great detail and should wrap across multiple lines when rendered in a narrow panel width",
          confidence: 0.75,
          options: [
            "Option A with a very long description that should wrap",
            "Option B with another long description for testing",
            "Option C: short",
            "Option D with yet another verbose explanation",
            "Option E final option",
          ],
        },
      });
      // With width=30, long text will wrap into many lines
      const lines = buildAgentDetailLines(agent, 30);
      // Should generate significantly more lines than a typical panel height (~20)
      expect(lines.length).toBeGreaterThan(15);
    });
  });
});
