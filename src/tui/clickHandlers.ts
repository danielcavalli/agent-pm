import type { ObservedAgentState } from "../lib/agent-state.js";
import {
  buildAgentSidebarRows,
  selectedAgentRowIndex,
  sidebarScrollStart,
} from "./components/AgentSidebar.js";
import type { FlatRow } from "./components/Tree.js";
import { treeScrollStart } from "./components/Tree.js";
import { hitTestAgentRow, resolveAgentClick } from "./hitTestAgentRow.js";
import { hitTestPanel } from "./hitTestPanel.js";
import { hitTestTreeRow, resolveTreeClick } from "./hitTestTreeRow.js";
import type { FocusedPanel } from "./types.js";

const APP_TITLE_HEIGHT = 1;
const SIDEBAR_HEADER_HEIGHT = 1;
const TREE_HEADER_HEIGHT = 1;

export interface ResolveAppClickInput {
  col: number;
  row: number;
  sidebarWidth: number;
  leftWidth: number;
  termWidth: number;
  bodyHeight: number;
  treeCursor: number;
  rows: FlatRow[];
  filteredAgents: ObservedAgentState[];
  selectedAgentIndex: number;
}

export interface AppClickResolution {
  focusedPanel: FocusedPanel;
  cursor?: number;
  agentCursor?: number;
  toggleEpicCode?: string | null;
}

export function resolveAppClick(
  input: ResolveAppClickInput,
): AppClickResolution | null {
  const panel = hitTestPanel(
    input.col,
    input.sidebarWidth,
    input.leftWidth,
    input.termWidth,
  );
  if (!panel) {
    return null;
  }

  if (panel === "detail") {
    return { focusedPanel: "detail" };
  }

  if (panel === "sidebar") {
    if (input.filteredAgents.length === 0) {
      return { focusedPanel: "sidebar" };
    }

    const sidebarRows = buildAgentSidebarRows(
      input.filteredAgents,
      input.sidebarWidth - 2,
    );
    const scrollOffset = sidebarScrollStart(
      selectedAgentRowIndex(input.filteredAgents, input.selectedAgentIndex),
      sidebarRows.length,
      input.bodyHeight - SIDEBAR_HEADER_HEIGHT,
    );
    const sidebarBodyOffset = APP_TITLE_HEIGHT + SIDEBAR_HEADER_HEIGHT;
    const agentIndex = hitTestAgentRow(
      input.row,
      scrollOffset,
      sidebarBodyOffset,
      input.filteredAgents,
    );

    if (agentIndex === null) {
      return { focusedPanel: "sidebar" };
    }

    const clickResult = resolveAgentClick(input.filteredAgents, agentIndex);
    if (!clickResult) {
      return { focusedPanel: "sidebar" };
    }

    return {
      focusedPanel: clickResult.focusedPanel,
      agentCursor: clickResult.agentIndex,
    };
  }

  const scrollOffset = treeScrollStart(
    input.treeCursor,
    input.rows.length,
    input.bodyHeight - 1,
  );
  const treeBodyOffset = APP_TITLE_HEIGHT + TREE_HEADER_HEIGHT;
  const rowIndex = hitTestTreeRow(
    input.row,
    scrollOffset,
    treeBodyOffset,
    input.rows.length,
  );

  if (rowIndex === null) {
    return { focusedPanel: "tree" };
  }

  const clickResult = resolveTreeClick(input.rows, rowIndex);
  if (!clickResult) {
    return { focusedPanel: "tree" };
  }

  return {
    focusedPanel: "tree",
    cursor: clickResult.cursor,
    toggleEpicCode: clickResult.toggleEpicCode,
  };
}
