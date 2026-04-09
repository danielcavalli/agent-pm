import type { FlatRow } from "./components/Tree.js";

export function hitTestTreeRow(
  clickRow: number,
  scrollOffset: number,
  bodyOffset: number,
  rowCount: number,
): number | null {
  if (
    !Number.isInteger(clickRow) ||
    !Number.isInteger(scrollOffset) ||
    !Number.isInteger(bodyOffset) ||
    rowCount < 1
  ) {
    return null;
  }

  const visibleRowIndex = clickRow - bodyOffset - 1;
  if (visibleRowIndex < 0) {
    return null;
  }

  const flatRowIndex = scrollOffset + visibleRowIndex;
  if (flatRowIndex < 0 || flatRowIndex >= rowCount) {
    return null;
  }

  return flatRowIndex;
}

export interface TreeClickResult {
  cursor: number;
  toggleEpicCode: string | null;
}

export function resolveTreeClick(
  rows: FlatRow[],
  rowIndex: number,
): TreeClickResult | null {
  const row = rows[rowIndex];
  if (!row) {
    return null;
  }

  return {
    cursor: rowIndex,
    toggleEpicCode: row.node.kind === "epic" ? row.node.code : null,
  };
}
