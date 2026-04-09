import type { FocusedPanel } from "./types.js";

const PANEL_DIVIDER_WIDTH = 1;

export function hitTestPanel(
  col: number,
  sidebarWidth: number,
  treeWidth: number,
  termWidth: number,
): FocusedPanel | null {
  if (col < 1 || col > termWidth || termWidth < 1) {
    return null;
  }

  const safeSidebarWidth = Math.max(sidebarWidth, 0);
  const safeTreeWidth = Math.max(treeWidth, 0);
  const sidebarDividerWidth = safeSidebarWidth > 0 ? PANEL_DIVIDER_WIDTH : 0;

  if (safeSidebarWidth > 0 && col <= safeSidebarWidth) {
    return "sidebar";
  }

  const sidebarDividerCol = safeSidebarWidth + 1;
  if (sidebarDividerWidth > 0 && col === sidebarDividerCol) {
    return null;
  }

  const treeStart = safeSidebarWidth + sidebarDividerWidth + 1;
  const treeEnd = Math.min(termWidth, treeStart + safeTreeWidth - 1);
  if (col >= treeStart && col <= treeEnd) {
    return "tree";
  }

  const treeDividerCol = treeEnd + 1;
  if (treeDividerCol <= termWidth && col === treeDividerCol) {
    return null;
  }

  const detailStart = treeDividerCol + 1;
  if (detailStart <= termWidth && col >= detailStart) {
    return "detail";
  }

  return null;
}
