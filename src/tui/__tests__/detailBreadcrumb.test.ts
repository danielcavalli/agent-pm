import React from "react";
import { describe, expect, it } from "vitest";
import {
  buildAgentDetailLines,
  buildDetailBreadcrumb,
} from "../components/DetailPanel.js";
import { theme } from "../colors.js";
import type { StoryNode, EpicNode } from "../types.js";
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

function makeStory(overrides: Partial<StoryNode> = {}): StoryNode {
  return {
    kind: "story",
    epic_code: "PM-E064",
    code: "PM-E064-S001",
    id: "S001",
    title: "Map click coordinates",
    status: "backlog",
    priority: "medium",
    story_points: 2,
    description: "",
    acceptance_criteria: [],
    depends_on: [],
    notes: "",
    ...overrides,
  };
}

function makeEpic(overrides: Partial<EpicNode> = {}): EpicNode {
  return {
    kind: "epic",
    code: "PM-E064",
    id: "E064",
    title: "Mouse Click Support",
    status: "backlog",
    priority: "medium",
    description: "",
    created_at: "2026-01-01",
    stories: [],
    expanded: true,
    ...overrides,
  };
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

describe("buildDetailBreadcrumb", () => {
  it("formats story breadcrumbs as epic code then story code", () => {
    expect(buildDetailBreadcrumb(makeStory(), null)).toEqual([
      { text: "PM-E064", color: theme.textMuted },
      { text: "PM-E064-S001", color: theme.text },
    ]);
  });

  it("formats epic breadcrumbs as just the epic code", () => {
    expect(buildDetailBreadcrumb(makeEpic(), null)).toEqual([
      { text: "PM-E064", color: theme.text },
    ]);
  });

  it("formats active agent breadcrumbs as agent id only", () => {
    expect(buildDetailBreadcrumb(null, makeAgent())).toEqual([
      { text: "Agent agent-01", color: theme.text },
    ]);
  });

  it("formats escalated agent breadcrumbs with escalation leaf", () => {
    expect(
      buildDetailBreadcrumb(
        null,
        makeAgent({
          status: "needs_attention",
          escalation: {
            type: "decision",
            message: "Need input",
            confidence: 0.7,
          },
        }),
      ),
    ).toEqual([
      { text: "Agent agent-01", color: theme.textMuted },
      { text: "Escalation", color: theme.text },
    ]);
  });
});

describe("buildAgentDetailLines breadcrumbs", () => {
  it("renders the escalated agent breadcrumb trail in the detail header", () => {
    const lines = buildAgentDetailLines(
      makeAgent({
        status: "needs_attention",
        escalation: {
          type: "decision",
          message: "Need input",
          confidence: 0.7,
        },
      }),
      60,
    );

    const breadcrumbLine = lines.find((line) => line.key === "breadcrumb");
    expect(breadcrumbLine).toBeDefined();
    expect(extractText(breadcrumbLine?.content)).toBe(
      "Agent agent-01 > Escalation",
    );
  });
});
