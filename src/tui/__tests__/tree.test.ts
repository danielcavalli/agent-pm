import { describe, it, expect } from "vitest";
import { statusIcon, statusColor, flattenTree } from "../components/Tree.js";
import type { FlatRow } from "../components/Tree.js";
import type { EpicNode, StoryNode, FilterMode } from "../types.js";

/**
 * Tests for PM-E050-S001: Tree.tsx exported pure functions.
 *
 * Pure-logic tests for statusIcon, statusColor, and flattenTree.
 * No Ink rendering -- just input/output verification.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeStory(
  overrides: Partial<StoryNode> & { code: string; title: string },
): StoryNode {
  return {
    kind: "story",
    id: overrides.code,
    status: "backlog",
    priority: "medium",
    story_points: 1,
    description: "",
    acceptance_criteria: [],
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
    stories: [],
    expanded: false,
    ...overrides,
  };
}

// ── statusIcon ──────────────────────────────────────────────────────────────

describe("statusIcon", () => {
  it("returns open circle for backlog", () => {
    expect(statusIcon("backlog")).toBe("○");
  });

  it("returns filled circle for in_progress", () => {
    expect(statusIcon("in_progress")).toBe("●");
  });

  it("returns check mark for done", () => {
    expect(statusIcon("done")).toBe("✓");
  });

  it("returns check mark for complete (alias of done)", () => {
    expect(statusIcon("complete")).toBe("✓");
  });

  it("returns x mark for cancelled", () => {
    expect(statusIcon("cancelled")).toBe("✗");
  });

  it("returns filled circle for active", () => {
    expect(statusIcon("active")).toBe("●");
  });

  it("returns open circle for paused", () => {
    expect(statusIcon("paused")).toBe("○");
  });

  it("returns x mark for archived", () => {
    expect(statusIcon("archived")).toBe("✗");
  });

  it("returns open circle for unknown status (default)", () => {
    expect(statusIcon("unknown_status")).toBe("○");
  });

  it("returns open circle for empty string", () => {
    expect(statusIcon("")).toBe("○");
  });
});

// ── statusColor ─────────────────────────────────────────────────────────────

describe("statusColor", () => {
  it("returns yellow for in_progress", () => {
    expect(statusColor("in_progress")).toBe("yellow");
  });

  it("returns yellow for active", () => {
    expect(statusColor("active")).toBe("yellow");
  });

  it("returns green for done", () => {
    expect(statusColor("done")).toBe("green");
  });

  it("returns green for complete", () => {
    expect(statusColor("complete")).toBe("green");
  });

  it("returns gray for cancelled", () => {
    expect(statusColor("cancelled")).toBe("gray");
  });

  it("returns gray for archived", () => {
    expect(statusColor("archived")).toBe("gray");
  });

  it("returns white for backlog (default)", () => {
    expect(statusColor("backlog")).toBe("white");
  });

  it("returns white for unknown status (default)", () => {
    expect(statusColor("some_random_status")).toBe("white");
  });

  it("returns white for empty string (default)", () => {
    expect(statusColor("")).toBe("white");
  });
});

// ── flattenTree ─────────────────────────────────────────────────────────────

describe("flattenTree", () => {
  // ── Empty tree ──────────────────────────────────────────────────────────

  it("returns empty array for empty epics list", () => {
    const rows = flattenTree([], "all", "");
    expect(rows).toEqual([]);
  });

  // ── Single collapsed epic ───────────────────────────────────────────────

  it("returns only the epic row when epic is collapsed", () => {
    const epic = makeEpic({
      code: "E001",
      title: "Epic One",
      expanded: false,
      stories: [makeStory({ code: "S001", title: "Story One" })],
    });

    const rows = flattenTree([epic], "all", "");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.node.kind).toBe("epic");
    expect(rows[0]!.depth).toBe(0);
    expect(rows[0]!.key).toBe("E001");
  });

  // ── Single expanded epic with stories ───────────────────────────────────

  it("returns epic plus stories when epic is expanded", () => {
    const epic = makeEpic({
      code: "E001",
      title: "Epic One",
      expanded: true,
      stories: [
        makeStory({ code: "S001", title: "Story One", status: "backlog" }),
        makeStory({
          code: "S002",
          title: "Story Two",
          status: "in_progress",
        }),
      ],
    });

    const rows = flattenTree([epic], "all", "");
    expect(rows).toHaveLength(3);

    expect(rows[0]!.key).toBe("E001");
    expect(rows[0]!.depth).toBe(0);

    expect(rows[1]!.key).toBe("S001");
    expect(rows[1]!.depth).toBe(1);

    expect(rows[2]!.key).toBe("S002");
    expect(rows[2]!.depth).toBe(1);
  });

  // ── Multiple epics ─────────────────────────────────────────────────────

  it("flattens multiple epics with mixed expanded state", () => {
    const epics = [
      makeEpic({
        code: "E001",
        title: "Epic One",
        expanded: true,
        stories: [makeStory({ code: "S001", title: "Story A" })],
      }),
      makeEpic({
        code: "E002",
        title: "Epic Two",
        expanded: false,
        stories: [makeStory({ code: "S002", title: "Story B" })],
      }),
      makeEpic({
        code: "E003",
        title: "Epic Three",
        expanded: true,
        stories: [
          makeStory({ code: "S003", title: "Story C" }),
          makeStory({ code: "S004", title: "Story D" }),
        ],
      }),
    ];

    const rows = flattenTree(epics, "all", "");
    // E001 + S001 + E002 (collapsed) + E003 + S003 + S004
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.key)).toEqual([
      "E001",
      "S001",
      "E002",
      "E003",
      "S003",
      "S004",
    ]);
  });

  // ── Filter: backlog ─────────────────────────────────────────────────────

  describe("filter=backlog", () => {
    it("only shows stories with backlog status", () => {
      const epic = makeEpic({
        code: "E001",
        title: "Epic",
        expanded: true,
        stories: [
          makeStory({ code: "S001", title: "Backlog", status: "backlog" }),
          makeStory({
            code: "S002",
            title: "In Progress",
            status: "in_progress",
          }),
          makeStory({ code: "S003", title: "Done", status: "done" }),
        ],
      });

      const rows = flattenTree([epic], "backlog", "");
      // epic + 1 backlog story
      expect(rows).toHaveLength(2);
      expect(rows[1]!.key).toBe("S001");
    });
  });

  // ── Filter: in_progress ─────────────────────────────────────────────────

  describe("filter=in_progress", () => {
    it("only shows stories with in_progress status", () => {
      const epic = makeEpic({
        code: "E001",
        title: "Epic",
        expanded: true,
        stories: [
          makeStory({ code: "S001", title: "Backlog", status: "backlog" }),
          makeStory({
            code: "S002",
            title: "In Progress",
            status: "in_progress",
          }),
          makeStory({ code: "S003", title: "Done", status: "done" }),
        ],
      });

      const rows = flattenTree([epic], "in_progress", "");
      expect(rows).toHaveLength(2);
      expect(rows[1]!.key).toBe("S002");
    });
  });

  // ── Filter: done ────────────────────────────────────────────────────────

  describe("filter=done", () => {
    it("shows stories with done or complete status", () => {
      const epic = makeEpic({
        code: "E001",
        title: "Epic",
        expanded: true,
        stories: [
          makeStory({ code: "S001", title: "Backlog", status: "backlog" }),
          makeStory({ code: "S002", title: "Done", status: "done" }),
          makeStory({
            code: "S003",
            title: "In Progress",
            status: "in_progress",
          }),
        ],
      });

      const rows = flattenTree([epic], "done", "");
      expect(rows).toHaveLength(2);
      expect(rows[1]!.key).toBe("S002");
    });
  });

  // ── Filter: all ─────────────────────────────────────────────────────────

  describe("filter=all", () => {
    it("shows all stories regardless of status", () => {
      const epic = makeEpic({
        code: "E001",
        title: "Epic",
        expanded: true,
        stories: [
          makeStory({ code: "S001", title: "A", status: "backlog" }),
          makeStory({ code: "S002", title: "B", status: "in_progress" }),
          makeStory({ code: "S003", title: "C", status: "done" }),
          makeStory({ code: "S004", title: "D", status: "cancelled" }),
        ],
      });

      const rows = flattenTree([epic], "all", "");
      // epic + 4 stories
      expect(rows).toHaveLength(5);
    });
  });

  // ── Filter does not hide epics ──────────────────────────────────────────

  it("always includes epic rows even when no stories match filter", () => {
    const epic = makeEpic({
      code: "E001",
      title: "Epic",
      expanded: true,
      stories: [
        makeStory({ code: "S001", title: "Done", status: "done" }),
      ],
    });

    const rows = flattenTree([epic], "backlog", "");
    // epic row is still present, but no story rows
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("E001");
  });

  // ── Search: title match ─────────────────────────────────────────────────

  describe("search filtering", () => {
    const epic = makeEpic({
      code: "E001",
      title: "Epic",
      expanded: true,
      stories: [
        makeStory({ code: "S001", title: "Authentication flow" }),
        makeStory({ code: "S002", title: "Dashboard layout" }),
        makeStory({ code: "S003", title: "Auth token refresh" }),
      ],
    });

    it("filters stories by title (case-insensitive)", () => {
      const rows = flattenTree([epic], "all", "auth");
      // epic + S001 + S003 (both contain "auth")
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.key)).toEqual(["E001", "S001", "S003"]);
    });

    it("filters stories by code", () => {
      const rows = flattenTree([epic], "all", "S002");
      // epic + S002
      expect(rows).toHaveLength(2);
      expect(rows[1]!.key).toBe("S002");
    });

    it("returns only epic when no stories match search", () => {
      const rows = flattenTree([epic], "all", "zzz_no_match");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.key).toBe("E001");
    });

    it("returns all stories when search is empty string", () => {
      const rows = flattenTree([epic], "all", "");
      expect(rows).toHaveLength(4); // epic + 3 stories
    });

    it("search is case-insensitive for code as well", () => {
      const rows = flattenTree([epic], "all", "s001");
      expect(rows).toHaveLength(2);
      expect(rows[1]!.key).toBe("S001");
    });
  });

  // ── Combined filter + search ────────────────────────────────────────────

  describe("combined filter and search", () => {
    it("applies both filter and search", () => {
      const epic = makeEpic({
        code: "E001",
        title: "Epic",
        expanded: true,
        stories: [
          makeStory({
            code: "S001",
            title: "Auth backlog item",
            status: "backlog",
          }),
          makeStory({
            code: "S002",
            title: "Auth in progress item",
            status: "in_progress",
          }),
          makeStory({
            code: "S003",
            title: "Dashboard backlog item",
            status: "backlog",
          }),
        ],
      });

      // filter=backlog AND search="auth" => only S001
      const rows = flattenTree([epic], "backlog", "auth");
      expect(rows).toHaveLength(2); // epic + S001
      expect(rows[1]!.key).toBe("S001");
    });
  });

  // ── Node structure ──────────────────────────────────────────────────────

  it("preserves full node references in flat rows", () => {
    const story = makeStory({
      code: "S001",
      title: "My Story",
      status: "in_progress",
      priority: "high",
    });
    const epic = makeEpic({
      code: "E001",
      title: "My Epic",
      expanded: true,
      stories: [story],
    });

    const rows = flattenTree([epic], "all", "");
    expect(rows[0]!.node).toBe(epic); // same reference
    expect(rows[1]!.node).toBe(story); // same reference
  });

  // ── Collapsed epic skips search ─────────────────────────────────────────

  it("does not include stories from collapsed epics even if they match search", () => {
    const epic = makeEpic({
      code: "E001",
      title: "Epic",
      expanded: false,
      stories: [
        makeStory({ code: "S001", title: "Matching search term" }),
      ],
    });

    const rows = flattenTree([epic], "all", "Matching");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("E001");
  });
});
