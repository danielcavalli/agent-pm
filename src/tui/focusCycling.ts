import type { FocusedPanel } from "./types.js";

/**
 * Compute the next focused panel when Tab is pressed.
 *
 * When the agent sidebar is visible the cycle is:
 *   sidebar -> tree -> detail -> sidebar
 *
 * When the sidebar is hidden:
 *   tree -> detail -> tree
 *
 * If `current` is "sidebar" but `sidebarVisible` is false,
 * we fall through to the two-panel cycle and return "tree".
 */
export function nextFocusedPanel(
  current: FocusedPanel,
  sidebarVisible: boolean,
): FocusedPanel {
  if (sidebarVisible) {
    const order: FocusedPanel[] = ["sidebar", "tree", "detail"];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length]!;
  }
  return current === "tree" ? "detail" : "tree";
}
