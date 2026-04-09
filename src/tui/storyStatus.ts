import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import type { TreeNode } from "./types.js";

export const STORY_STATUS_ORDER = ["backlog", "in_progress", "done"] as const;

export type SelectableStoryStatus = (typeof STORY_STATUS_ORDER)[number];

export type StoryStatusPickerState =
  | {
      mode: "idle";
    }
  | {
      mode: "selecting";
      code: string;
      status: SelectableStoryStatus;
    };

export const INITIAL_STORY_STATUS_PICKER_STATE: StoryStatusPickerState = {
  mode: "idle",
};

export function normalizeSelectableStoryStatus(
  status: string,
): SelectableStoryStatus {
  if (status === "in_progress" || status === "done") {
    return status;
  }

  return "backlog";
}

export function nextSelectableStoryStatus(
  current: SelectableStoryStatus,
): SelectableStoryStatus {
  const index = STORY_STATUS_ORDER.indexOf(current);
  return (
    STORY_STATUS_ORDER[(index + 1) % STORY_STATUS_ORDER.length] ?? "backlog"
  );
}

export function enterStoryStatusPicker(
  selectedNode: TreeNode | null,
): StoryStatusPickerState | null {
  if (!selectedNode || selectedNode.kind !== "story") {
    return null;
  }

  return {
    mode: "selecting",
    code: selectedNode.code,
    status: normalizeSelectableStoryStatus(selectedNode.status),
  };
}

export function cycleStoryStatusPicker(
  state: StoryStatusPickerState,
): StoryStatusPickerState {
  if (state.mode !== "selecting") {
    return state;
  }

  return {
    ...state,
    status: nextSelectableStoryStatus(state.status),
  };
}

export function buildStoryStatusPickerMessage(
  state: StoryStatusPickerState,
): string {
  if (state.mode !== "selecting") {
    return "";
  }

  return `Set ${state.code} status: ${state.status} [s] next [Enter] save [Esc] cancel`;
}

export type StoryStatusCommandRunner = typeof spawnSync;

export function updateStoryStatus(
  storyCode: string,
  status: SelectableStoryStatus,
  runner: StoryStatusCommandRunner = spawnSync,
): string {
  const result = runner(
    "pm",
    ["story", "update", storyCode, "--status", status],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(commandFailureMessage(result));
  }

  return result.stdout.trim();
}

function commandFailureMessage(result: SpawnSyncReturns<string>): string {
  const stderr = result.stderr.trim();
  if (stderr.length > 0) {
    return stderr;
  }

  const stdout = result.stdout.trim();
  if (stdout.length > 0) {
    return stdout;
  }

  return `pm story update exited with code ${result.status ?? "unknown"}`;
}
