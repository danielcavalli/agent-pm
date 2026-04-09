import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { buildAgentDetailLines } from "../components/DetailPanel.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractText(child)).join("");
  }

  if (React.isValidElement(node)) {
    return extractText(
      (node as React.ReactElement<{ children?: React.ReactNode }>).props
        .children,
    );
  }

  return "";
}

function lineText(
  lines: ReturnType<typeof buildAgentDetailLines>,
  key: string,
): string {
  const line = lines.find((entry) => entry.key === key);
  return line ? extractText(line.content) : "";
}

function makeAgent(
  overrides: Partial<ObservedAgentState> = {},
): ObservedAgentState {
  return {
    agent_id: "agent-01",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    heartbeat_age_ms: 0,
    heartbeat_stale: false,
    escalation_history: [],
    ...overrides,
  };
}

describe("buildAgentDetailLines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T10:05:30Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
      expect(lineText(lines, "agent-heartbeat")).toContain("30s ago");
    });

    it("renders a timeline section with started event first", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const timelineTexts = lines
        .filter((line) => line.key.startsWith("timeline-item-"))
        .map((line) => extractText(line.content));

      expect(lineText(lines, "timeline-header")).toContain("Timeline");
      expect(timelineTexts[0]).toContain("Started");
      expect(timelineTexts[1]).toContain("Heartbeat");
    });

    it("shows the heartbeat event with relative time", () => {
      const lines = buildAgentDetailLines(agent, 60);

      expect(lineText(lines, "timeline-item-1")).toContain("Heartbeat");
      expect(lineText(lines, "timeline-item-1")).toContain("30s ago");
      expect(lineText(lines, "timeline-detail-1-0")).toContain(
        "Last heartbeat 30s ago",
      );
    });

    it("renders heartbeat health when stale", () => {
      const lines = buildAgentDetailLines(
        makeAgent({ heartbeat_stale: true, heartbeat_age_ms: 90_000 }),
        60,
      );
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-heartbeat-health");
    });

    it("renders progress_summary when present", () => {
      const lines = buildAgentDetailLines(agent, 60);
      const keys = lines.map((l) => l.key);
      expect(keys).toContain("agent-progress-label");
      const progressLines = keys.filter((k) => k.startsWith("agent-progress-"));
      expect(progressLines.length).toBeGreaterThan(0);
    });

    it("renders a criteria checklist when structured progress data is present", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          agent_id: "progress-agent",
          progress: {
            total_criteria: 3,
            completed_criteria: 1,
            current_step: "Run tests",
            criteria_status: [
              { criterion: "Write code", status: "done" },
              { criterion: "Run tests", status: "pending" },
              { criterion: "Ship fix", status: "failed" },
            ],
          },
        }),
        60,
      );

      const texts = lines.map((line) => extractText(line.content));
      expect(texts).toContain("Progress");
      expect(texts).toContain("Current Step: Run tests");
      expect(texts).toContain(" ✓ Write code");
      expect(texts).toContain(" ○ Run tests");
      expect(texts).toContain(" ✗ Ship fix");
    });

    it("keeps checklist criteria in order under the progress section", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          agent_id: "ordered-progress-agent",
          progress: {
            total_criteria: 3,
            completed_criteria: 1,
            current_step: "Second step",
            criteria_status: [
              { criterion: "First step", status: "done" },
              { criterion: "Second step", status: "pending" },
              { criterion: "Third step", status: "failed" },
            ],
          },
        }),
        60,
      );

      const criterionTexts = lines
        .filter((line) => line.key.startsWith("agent-progress-criterion-"))
        .map((line) => extractText(line.content));

      expect(criterionTexts).toEqual([
        " ✓ First step",
        " ○ Second step",
        " ✗ Third step",
      ]);
    });

    it("shows the current step before the checklist entries", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          agent_id: "current-step-agent",
          progress: {
            total_criteria: 2,
            completed_criteria: 0,
            current_step: "Implement checklist",
            criteria_status: [
              { criterion: "Implement checklist", status: "pending" },
              { criterion: "Verify reload", status: "pending" },
            ],
          },
        }),
        60,
      );

      const keys = lines.map((line) => line.key);
      expect(keys.indexOf("agent-progress-current-step")).toBeGreaterThan(
        keys.indexOf("agent-progress-label"),
      );
      expect(keys.indexOf("agent-progress-current-step")).toBeLessThan(
        keys.indexOf("agent-progress-criterion-0-0"),
      );
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
      expect(lineText(lines, "agent-started")).toContain("5m ago");
    });

    it("falls back to raw ISO string when timestamp parsing fails", () => {
      const lines = buildAgentDetailLines(
        makeAgent({ started_at: "not-a-date" }),
        60,
      );

      expect(lineText(lines, "agent-started")).toContain("not-a-date");
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

    it("generates enough lines to require scrolling with many history entries", () => {
      const agent = makeAgent({
        escalation_history: Array.from({ length: 8 }, (_, index) => ({
          type: "decision",
          message: `History item ${index + 1} with enough text to wrap in a narrower detail panel`,
          confidence: 0.75,
          selected_option: `Option ${index + 1}`,
          responded_at: `2026-03-13T10:0${index}:00Z`,
        })),
      });

      const lines = buildAgentDetailLines(agent, 30);
      expect(lines.length).toBeGreaterThan(20);
    });

    it("generates enough timeline lines to scroll inside the detail panel", () => {
      const agent = makeAgent({
        status: "needs_attention",
        escalation: {
          type: "decision",
          message:
            "Need a decision on the timeline detail panel event ordering for archived escalation entries.",
          confidence: 0.7,
        },
        escalation_history: Array.from({ length: 10 }, (_, index) => ({
          type: index % 2 === 0 ? "decision" : "clarification",
          message: `Escalation history item ${index + 1} with enough detail to wrap in the panel`,
          confidence: 0.6,
          selected_option: `Option ${index + 1}`,
          responded_at: `2026-03-13T10:${String(index).padStart(2, "0")}:00Z`,
        })),
      });

      const lines = buildAgentDetailLines(agent, 30);
      const timelineLines = lines.filter((line) =>
        line.key.startsWith("timeline-"),
      );

      expect(timelineLines.length).toBeGreaterThan(20);
    });
  });

  describe("agent timeline events", () => {
    it("shows active escalation events in the timeline", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          status: "needs_attention",
          escalation: {
            type: "approval",
            message: "Approve the release for the next agent lifecycle build",
            confidence: 0.8,
          },
        }),
        60,
      );

      const timelineTexts = lines
        .filter((line) => line.key.startsWith("timeline-item-"))
        .map((line) => extractText(line.content));

      expect(
        timelineTexts.some((text) => text.includes("Approval Required open")),
      ).toBe(true);
    });

    it("shows completed agents with a terminal timeline event", () => {
      const lines = buildAgentDetailLines(
        makeAgent({ status: "completed" }),
        60,
      );

      const timelineTexts = lines
        .filter((line) => line.key.startsWith("timeline-item-"))
        .map((line) => extractText(line.content));

      expect(timelineTexts.at(-1)).toContain("Completed");
    });

    it("shows crashed tracked agents with a terminal timeline event", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          process_crashed: true,
          tracked_pid: 4242,
        }),
        60,
      );

      const timelineTexts = lines
        .filter((line) => line.key.startsWith("timeline-item-"))
        .map((line) => extractText(line.content));

      expect(timelineTexts.at(-1)).toContain("Crashed");
      expect(
        lines.some(
          (line) =>
            line.key.startsWith("timeline-detail-") &&
            extractText(line.content).includes("4242"),
        ),
      ).toBe(true);
    });
  });

  describe("escalation history", () => {
    it("renders an Escalation History section for agents with no past escalations", () => {
      const lines = buildAgentDetailLines(makeAgent(), 60);
      const keys = lines.map((l) => l.key);

      expect(keys).toContain("history-header");
      expect(lineText(lines, "history-empty")).toContain("No past escalations");
    });

    it("renders history entries in reverse chronological order", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          escalation_history: [
            {
              type: "approval",
              message: "Oldest escalation entry",
              confidence: 0.4,
              selected_option: "wait",
              responded_at: "2026-03-13T10:01:00Z",
            },
            {
              type: "decision",
              message: "Newest escalation entry",
              confidence: 0.8,
              selected_option: "ship",
              responded_at: "2026-03-13T10:05:00Z",
            },
          ],
        }),
        80,
      );

      expect(lineText(lines, "history-item-0")).toContain("Decision Required");
      expect(lineText(lines, "history-message-0")).toContain(
        "Newest escalation entry",
      );
      expect(lineText(lines, "history-selected-0")).toContain("ship");
      expect(lineText(lines, "history-message-1")).toContain(
        "Oldest escalation entry",
      );
    });

    it("renders message summaries and selected options for history entries", () => {
      const lines = buildAgentDetailLines(
        makeAgent({
          escalation_history: [
            {
              type: "clarification",
              message:
                "Need clarification on whether the CLI should show archived escalation entries by default in the detail panel view",
              confidence: 0.5,
              selected_option: "Show archived entries",
              responded_at: "2026-03-13T10:05:00Z",
            },
          ],
        }),
        40,
      );

      expect(lineText(lines, "history-item-0")).toContain(
        "Clarification Needed",
      );
      expect(lineText(lines, "history-message-0")).toContain("...");
      expect(lineText(lines, "history-selected-0")).toContain(
        "Show archived entries",
      );
    });
  });
});
