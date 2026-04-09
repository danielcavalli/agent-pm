import { describe, expect, it } from "vitest";
import type { EpicNode, StoryNode } from "../types.js";
import type { FlatRow } from "../components/Tree.js";
import { treeScrollStart } from "../components/Tree.js";
import { hitTestTreeRow, resolveTreeClick } from "../hitTestTreeRow.js";

function makeStory(
  overrides: Partial<StoryNode> & { code: string; title: string },
): StoryNode {
  return {
    kind: "story",
    epic_code: "PM-E000",
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

describe("hitTestTreeRow", () => {
  it("maps visible rows to flat row indices", () => {
    expect(hitTestTreeRow(3, 0, 2, 10)).toBe(0);
    expect(hitTestTreeRow(4, 0, 2, 10)).toBe(1);
    expect(hitTestTreeRow(7, 0, 2, 10)).toBe(4);
  });

  it("accounts for scroll offset when tree rows are scrolled", () => {
    const scrollOffset = treeScrollStart(8, 20, 6);

    expect(scrollOffset).toBe(5);
    expect(hitTestTreeRow(3, scrollOffset, 2, 20)).toBe(5);
    expect(hitTestTreeRow(8, scrollOffset, 2, 20)).toBe(10);
  });

  it("returns null for clicks in the title or header rows", () => {
    expect(hitTestTreeRow(1, 0, 2, 10)).toBeNull();
    expect(hitTestTreeRow(2, 0, 2, 10)).toBeNull();
  });

  it("returns null for clicks below the last visible row", () => {
    expect(hitTestTreeRow(10, 0, 2, 3)).toBeNull();
    expect(hitTestTreeRow(20, 5, 2, 7)).toBeNull();
  });
});

describe("resolveTreeClick", () => {
  const epic = makeEpic({ code: "PM-E064", title: "Mouse Click Support" });
  const story = makeStory({ code: "PM-E064-S003", title: "Tree rows" });
  const rows: FlatRow[] = [
    { node: epic, depth: 0, key: epic.code },
    { node: story, depth: 1, key: story.code },
  ];

  it("selects the clicked story row without toggling expansion", () => {
    expect(resolveTreeClick(rows, 1)).toEqual({
      cursor: 1,
      toggleEpicCode: null,
    });
  });

  it("selects the clicked epic row and toggles its expansion", () => {
    expect(resolveTreeClick(rows, 0)).toEqual({
      cursor: 0,
      toggleEpicCode: "PM-E064",
    });
  });

  it("handles out-of-bounds row indices gracefully", () => {
    expect(resolveTreeClick(rows, -1)).toBeNull();
    expect(resolveTreeClick(rows, 4)).toBeNull();
  });
});
