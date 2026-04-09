import { describe, expect, it, vi } from "vitest";
import {
  INITIAL_STORY_STATUS_PICKER_STATE,
  buildStoryStatusPickerMessage,
  cycleStoryStatusPicker,
  enterStoryStatusPicker,
  nextSelectableStoryStatus,
  normalizeSelectableStoryStatus,
  updateStoryStatus,
} from "../storyStatus.js";
import type { StoryNode } from "../types.js";

function makeStory(
  overrides: Partial<StoryNode> & Pick<StoryNode, "code" | "status" | "title">,
): StoryNode {
  return {
    ...overrides,
    kind: "story",
    epic_code: "PM-E068",
    id: "S006",
    priority: "medium",
    story_points: 3,
    description: "",
    acceptance_criteria: [],
    depends_on: [],
    notes: "",
  };
}

describe("story status picker", () => {
  it("opens only for selected stories", () => {
    expect(enterStoryStatusPicker(null)).toBeNull();
    expect(
      enterStoryStatusPicker({
        kind: "epic",
        code: "PM-E068",
        id: "E068",
        title: "Epic",
        status: "in_progress",
        priority: "medium",
        description: "",
        created_at: "2026-04-08T00:00:00Z",
        stories: [],
        expanded: true,
      }),
    ).toBeNull();
  });

  it("opens with the currently selected story status", () => {
    expect(
      enterStoryStatusPicker(
        makeStory({
          code: "PM-E068-S006",
          status: "in_progress",
          title: "Ship it",
        }),
      ),
    ).toEqual({
      mode: "selecting",
      code: "PM-E068-S006",
      status: "in_progress",
    });
  });

  it("normalizes non-selectable story statuses to backlog", () => {
    expect(normalizeSelectableStoryStatus("cancelled")).toBe("backlog");
  });

  it("cycles backlog -> in_progress -> done -> backlog", () => {
    expect(nextSelectableStoryStatus("backlog")).toBe("in_progress");
    expect(nextSelectableStoryStatus("in_progress")).toBe("done");
    expect(nextSelectableStoryStatus("done")).toBe("backlog");
  });

  it("cycles the picker with repeated s presses", () => {
    const started = enterStoryStatusPicker(
      makeStory({ code: "PM-E068-S006", status: "backlog", title: "Ship it" }),
    );
    const next = cycleStoryStatusPicker(
      started ?? INITIAL_STORY_STATUS_PICKER_STATE,
    );
    expect(next).toEqual({
      mode: "selecting",
      code: "PM-E068-S006",
      status: "in_progress",
    });
  });

  it("renders the status picker in the status bar", () => {
    expect(
      buildStoryStatusPickerMessage({
        mode: "selecting",
        code: "PM-E068-S006",
        status: "done",
      }),
    ).toBe("Set PM-E068-S006 status: done [s] next [Enter] save [Esc] cancel");
  });
});

describe("updateStoryStatus", () => {
  it("runs pm story update with the selected status", () => {
    const runner = vi.fn(() => ({
      status: 0,
      stdout: "updated",
      stderr: "",
      output: ["", "updated", ""],
      pid: 123,
      signal: null,
    }));

    const result = updateStoryStatus("PM-E068-S006", "done", runner as never);

    expect(result).toBe("updated");
    expect(runner).toHaveBeenCalledWith(
      "pm",
      ["story", "update", "PM-E068-S006", "--status", "done"],
      expect.objectContaining({ cwd: process.cwd(), encoding: "utf8" }),
    );
  });

  it("throws stderr when the command fails", () => {
    const runner = vi.fn(() => ({
      status: 1,
      stdout: "",
      stderr: "boom",
      output: ["", "", "boom"],
      pid: 123,
      signal: null,
    }));

    expect(() =>
      updateStoryStatus("PM-E068-S006", "done", runner as never),
    ).toThrow("boom");
  });
});
