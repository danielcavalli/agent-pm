import { describe, expect, it } from "vitest";
import type { ObservedAgentState } from "../../lib/agent-state.js";
import type { FlatRow } from "../components/Tree.js";
import { flattenTree } from "../components/Tree.js";
import { resolveAppClick } from "../clickHandlers.js";
import type { EpicNode, StoryNode } from "../types.js";

function makeStory(
  overrides: Partial<StoryNode> & { code: string; title: string },
): StoryNode {
  return {
    kind: "story",
    epic_code: "PM-E064",
    id: overrides.code,
    status: "backlog",
    priority: "medium",
    story_points: 1,
    description: "",
    acceptance_criteria: [],
    depends_on: [],
    notes: "",
    ...overrides,
  };
}

function makeEpic(
  overrides: Partial<EpicNode> & { code: string; title: string },
): EpicNode {
  return {
    kind: "epic",
    id: overrides.code,
    status: "backlog",
    priority: "medium",
    description: "",
    created_at: "2026-01-01T00:00:00Z",
    stories: [],
    expanded: true,
    ...overrides,
  };
}

function makeAgent(
  overrides: Partial<ObservedAgentState> & {
    agent_id: string;
    status: ObservedAgentState["status"];
  },
): ObservedAgentState {
  return {
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    heartbeat_age_ms: 0,
    heartbeat_stale: false,
    ...overrides,
  };
}

function makeRows(): FlatRow[] {
  const epic = makeEpic({
    code: "PM-E064",
    title: "Mouse Click & Selection Support",
    stories: [
      makeStory({ code: "PM-E064-S005", title: "Wire click handlers" }),
    ],
  });

  return flattenTree([epic], "all", "");
}

describe("resolveAppClick", () => {
  it("selects a clicked story row and focuses the tree", () => {
    const rows = makeRows();

    expect(
      resolveAppClick({
        col: 24,
        row: 4,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows,
        filteredAgents: [],
        selectedAgentIndex: 0,
      }),
    ).toEqual({ focusedPanel: "tree", cursor: 1, toggleEpicCode: null });
  });

  it("toggles a clicked epic row and keeps tree focus", () => {
    const rows = makeRows();

    expect(
      resolveAppClick({
        col: 24,
        row: 3,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows,
        filteredAgents: [],
        selectedAgentIndex: 0,
      }),
    ).toEqual({
      focusedPanel: "tree",
      cursor: 0,
      toggleEpicCode: "PM-E064",
    });
  });

  it("selects a clicked agent row and focuses the sidebar", () => {
    const rows = makeRows();
    const agents = [
      makeAgent({ agent_id: "agent-1", status: "active" }),
      makeAgent({ agent_id: "agent-2", status: "idle" }),
    ];

    expect(
      resolveAppClick({
        col: 10,
        row: 4,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows,
        filteredAgents: agents,
        selectedAgentIndex: 0,
      }),
    ).toEqual({ focusedPanel: "sidebar", agentCursor: 1 });
  });

  it("focuses the detail panel on detail clicks", () => {
    expect(
      resolveAppClick({
        col: 64,
        row: 8,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows: makeRows(),
        filteredAgents: [],
        selectedAgentIndex: 0,
      }),
    ).toEqual({ focusedPanel: "detail" });
  });

  it("focuses a panel even when no selectable row is hit", () => {
    const rows = makeRows();

    expect(
      resolveAppClick({
        col: 10,
        row: 20,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows,
        filteredAgents: [makeAgent({ agent_id: "agent-1", status: "active" })],
        selectedAgentIndex: 0,
      }),
    ).toEqual({ focusedPanel: "sidebar" });

    expect(
      resolveAppClick({
        col: 24,
        row: 20,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows,
        filteredAgents: [],
        selectedAgentIndex: 0,
      }),
    ).toEqual({ focusedPanel: "tree" });
  });

  it("ignores clicks on divider columns", () => {
    expect(
      resolveAppClick({
        col: 23,
        row: 5,
        sidebarWidth: 22,
        leftWidth: 39,
        termWidth: 100,
        bodyHeight: 20,
        treeCursor: 0,
        rows: makeRows(),
        filteredAgents: [],
        selectedAgentIndex: 0,
      }),
    ).toBeNull();
  });
});
