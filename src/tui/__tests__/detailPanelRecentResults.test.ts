import React from "react";
import { describe, expect, it } from "vitest";
import {
  buildExplorationCoverageLines,
  buildRecentExperimentLines,
  recentExperimentDecisionColor,
} from "../components/DetailPanel.js";
import { tc, theme } from "../colors.js";
import type { SwarmStatusData } from "../types.js";

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

function findTextElement(
  node: React.ReactNode,
  matcher: (text: string) => boolean,
): React.ReactElement<Record<string, unknown>> | null {
  if (node === null || node === undefined || typeof node === "boolean") {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findTextElement(child, matcher);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (React.isValidElement(node)) {
    const text = extractText(node);
    if (matcher(text)) {
      return node as React.ReactElement<Record<string, unknown>>;
    }

    return findTextElement(
      (node as React.ReactElement<{ children?: React.ReactNode }>).props
        .children,
      matcher,
    );
  }

  return null;
}

describe("buildRecentExperimentLines", () => {
  const recentResults: SwarmStatusData["recentResults"] = [
    {
      experimentId: "exp-06",
      decision: "keep",
      score: 0.84,
      description: "Split a new story from the epic backlog for follow-up work",
    },
    {
      experimentId: "exp-05",
      decision: "discard",
      score: 0.22,
      description:
        "Demote a critical story after confirming the signal regressed",
    },
  ];

  it("returns no section when no results exist", () => {
    expect(buildRecentExperimentLines([], 48)).toEqual([]);
  });

  it("renders the section header and one row per result", () => {
    const lines = buildRecentExperimentLines(recentResults, 48);
    const texts = lines.map((line) => extractText(line.content));

    expect(lines.map((line) => line.key)).toEqual([
      "recent-results-section-rule",
      "recent-results-section",
      "recent-result-0",
      "recent-result-1",
    ]);
    expect(texts[1]).toContain("Recent Experiments");
    expect(texts[2]).toContain("keep 0.84 Split a new story");
    expect(texts[3]).toContain("discard 0.22 Demote a critical story");
  });

  it("truncates long descriptions to fit the panel width", () => {
    const lines = buildRecentExperimentLines(recentResults, 28);
    const resultText = extractText(lines[2]?.content);

    expect(resultText).toContain("...");
  });

  it("uses green for keep and red for discard decisions", () => {
    expect(recentExperimentDecisionColor("keep")).toBe(theme.success);
    expect(recentExperimentDecisionColor("discard")).toBe(theme.error);
  });
});

describe("buildExplorationCoverageLines", () => {
  const explorationCoverage: SwarmStatusData["explorationCoverage"] = [
    {
      key: "runtime",
      label: "Runtime",
      dimensions: [
        { name: "dispatch.max_concurrent_agents", count: 2 },
        { name: "heartbeat.frequency_seconds", count: 0 },
      ],
    },
    {
      key: "board",
      label: "Board",
      dimensions: [
        { name: "priority_changes", count: 1 },
        { name: "dependency_changes", count: 0 },
      ],
    },
  ];

  it("returns no section when no coverage exists", () => {
    expect(buildExplorationCoverageLines([], 48)).toEqual([]);
  });

  it("renders the section header and compact dimension counts", () => {
    const lines = buildExplorationCoverageLines(explorationCoverage, 80);
    const texts = lines.map((line) => extractText(line.content));

    expect(texts[1]).toContain("Exploration Coverage");
    expect(texts).toContain(
      "Runtime: dispatch.max_concurrent_agents 2 · heartbeat.frequency_seconds 0",
    );
    expect(texts).toContain("Board: priority_changes 1 · dependency_changes 0");
  });

  it("uses muted dim text for zero-count gaps", () => {
    const lines = buildExplorationCoverageLines(explorationCoverage, 80);
    const zeroLine = lines.find((line) => line.key === "coverage-runtime-0");
    const zeroText = findTextElement(
      zeroLine?.content ?? null,
      (text) => text === "heartbeat.frequency_seconds 0",
    );

    expect(zeroText?.props.color).toBe(tc(theme.textMuted));
    expect(zeroText?.props.dimColor).toBe(true);
  });

  it("reflects refreshed coverage values on rebuild", () => {
    const initial = buildExplorationCoverageLines(explorationCoverage, 80)
      .map((line) => extractText(line.content))
      .join("\n");
    const updated = buildExplorationCoverageLines(
      [
        {
          key: "runtime",
          label: "Runtime",
          dimensions: [
            { name: "dispatch.max_concurrent_agents", count: 3 },
            { name: "heartbeat.frequency_seconds", count: 1 },
          ],
        },
      ],
      80,
    )
      .map((line) => extractText(line.content))
      .join("\n");

    expect(initial).toContain("dispatch.max_concurrent_agents 2");
    expect(updated).toContain("dispatch.max_concurrent_agents 3");
    expect(updated).not.toContain("heartbeat.frequency_seconds 0");
  });
});
