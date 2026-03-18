import { describe, it, expect } from "vitest";

/**
 * Unit tests for page navigation logic (Ctrl+u, Ctrl+d, g, G).
 *
 * These tests verify the arithmetic used by the tree panel (cursor-based),
 * detail panel (scroll-offset-based), and sidebar panel (cursor-based)
 * for half-page and jump-to-boundary navigation.
 */

// ── Tree / Sidebar cursor navigation (cursor-based) ─────────────────────────

/** Replicates Ctrl+d: move cursor down by half page */
function cursorHalfPageDown(
  cursor: number,
  totalItems: number,
  panelHeight: number,
): number {
  const half = Math.max(1, Math.floor(panelHeight / 2));
  return Math.min(totalItems - 1, cursor + half);
}

/** Replicates Ctrl+u: move cursor up by half page */
function cursorHalfPageUp(
  cursor: number,
  panelHeight: number,
): number {
  const half = Math.max(1, Math.floor(panelHeight / 2));
  return Math.max(0, cursor - half);
}

/** Replicates g: jump to first item */
function cursorJumpToFirst(): number {
  return 0;
}

/** Replicates G: jump to last item */
function cursorJumpToLast(totalItems: number): number {
  return totalItems > 0 ? totalItems - 1 : 0;
}

// ── Detail panel scroll navigation (offset-based) ───────────────────────────

/** Replicates Ctrl+d for detail panel: scroll down by half page */
function scrollHalfPageDown(
  scrollOffset: number,
  maxScroll: number,
  panelHeight: number,
): number {
  const half = Math.max(1, Math.floor(panelHeight / 2));
  return Math.min(scrollOffset + half, maxScroll);
}

/** Replicates Ctrl+u for detail panel: scroll up by half page */
function scrollHalfPageUp(
  scrollOffset: number,
  panelHeight: number,
): number {
  const half = Math.max(1, Math.floor(panelHeight / 2));
  return Math.max(0, scrollOffset - half);
}

/** Replicates g for detail panel: jump to top */
function scrollJumpToTop(): number {
  return 0;
}

/** Replicates G for detail panel: jump to bottom */
function scrollJumpToBottom(maxScroll: number): number {
  return maxScroll;
}

describe("Page navigation — tree/sidebar cursor-based", () => {
  describe("Ctrl+d (half-page down)", () => {
    it("moves cursor down by half the panel height", () => {
      // panelHeight=20, half=10, cursor at 5 => 15
      expect(cursorHalfPageDown(5, 50, 20)).toBe(15);
    });

    it("does not exceed the last item index", () => {
      // 30 items, cursor at 28, half=10 => clamped to 29
      expect(cursorHalfPageDown(28, 30, 20)).toBe(29);
    });

    it("moves to last item when near the end", () => {
      expect(cursorHalfPageDown(25, 30, 20)).toBe(29);
    });

    it("works from the beginning", () => {
      expect(cursorHalfPageDown(0, 50, 20)).toBe(10);
    });

    it("handles small panel height (minimum half = 1)", () => {
      // panelHeight=1, half = max(1, floor(1/2)) = max(1,0) = 1
      expect(cursorHalfPageDown(0, 10, 1)).toBe(1);
    });

    it("handles single-item list", () => {
      expect(cursorHalfPageDown(0, 1, 20)).toBe(0);
    });
  });

  describe("Ctrl+u (half-page up)", () => {
    it("moves cursor up by half the panel height", () => {
      expect(cursorHalfPageUp(15, 20)).toBe(5);
    });

    it("does not go below 0", () => {
      expect(cursorHalfPageUp(3, 20)).toBe(0);
    });

    it("stays at 0 when already at 0", () => {
      expect(cursorHalfPageUp(0, 20)).toBe(0);
    });

    it("handles small panel height", () => {
      expect(cursorHalfPageUp(5, 1)).toBe(4);
    });
  });

  describe("g (jump to first)", () => {
    it("always returns 0", () => {
      expect(cursorJumpToFirst()).toBe(0);
    });
  });

  describe("G (jump to last)", () => {
    it("returns last index for non-empty list", () => {
      expect(cursorJumpToLast(50)).toBe(49);
    });

    it("returns 0 for single-item list", () => {
      expect(cursorJumpToLast(1)).toBe(0);
    });

    it("returns 0 for empty list", () => {
      expect(cursorJumpToLast(0)).toBe(0);
    });
  });

  describe("round-trip: g then G covers the full range", () => {
    it("g then G traverses from start to end", () => {
      const totalItems = 100;
      const first = cursorJumpToFirst();
      const last = cursorJumpToLast(totalItems);
      expect(first).toBe(0);
      expect(last).toBe(99);
    });
  });

  describe("Ctrl+d then Ctrl+u round-trip", () => {
    it("returns to original position after equal page jumps", () => {
      const panelHeight = 20;
      let cursor = 10;
      cursor = cursorHalfPageDown(cursor, 50, panelHeight); // 10 + 10 = 20
      cursor = cursorHalfPageUp(cursor, panelHeight);        // 20 - 10 = 10
      expect(cursor).toBe(10);
    });
  });
});

describe("Page navigation — detail panel scroll-based", () => {
  describe("Ctrl+d (half-page down)", () => {
    it("scrolls down by half the panel height", () => {
      // maxScroll=15, panelHeight=10, half=5, offset at 0 => 5
      expect(scrollHalfPageDown(0, 15, 10)).toBe(5);
    });

    it("does not exceed maxScroll", () => {
      expect(scrollHalfPageDown(13, 15, 10)).toBe(15);
    });

    it("clamps at maxScroll", () => {
      expect(scrollHalfPageDown(15, 15, 10)).toBe(15);
    });
  });

  describe("Ctrl+u (half-page up)", () => {
    it("scrolls up by half the panel height", () => {
      expect(scrollHalfPageUp(10, 10)).toBe(5);
    });

    it("does not go below 0", () => {
      expect(scrollHalfPageUp(2, 10)).toBe(0);
    });

    it("stays at 0 when already at 0", () => {
      expect(scrollHalfPageUp(0, 10)).toBe(0);
    });
  });

  describe("g (jump to top)", () => {
    it("always returns 0", () => {
      expect(scrollJumpToTop()).toBe(0);
    });
  });

  describe("G (jump to bottom)", () => {
    it("returns maxScroll", () => {
      expect(scrollJumpToBottom(20)).toBe(20);
    });

    it("returns 0 when maxScroll is 0", () => {
      expect(scrollJumpToBottom(0)).toBe(0);
    });
  });

  describe("full scroll scenario with half-page jumps", () => {
    it("Ctrl+d three times from 0 reaches near the bottom of 25-line content in 10-line panel", () => {
      const totalLines = 25;
      const panelHeight = 10;
      const maxScroll = totalLines - panelHeight; // 15

      let offset = 0;
      offset = scrollHalfPageDown(offset, maxScroll, panelHeight); // 0 + 5 = 5
      expect(offset).toBe(5);

      offset = scrollHalfPageDown(offset, maxScroll, panelHeight); // 5 + 5 = 10
      expect(offset).toBe(10);

      offset = scrollHalfPageDown(offset, maxScroll, panelHeight); // 10 + 5 = 15
      expect(offset).toBe(15);

      // One more should stay at 15
      offset = scrollHalfPageDown(offset, maxScroll, panelHeight);
      expect(offset).toBe(15);
    });

    it("Ctrl+u from bottom returns to top in equal steps", () => {
      const panelHeight = 10;

      let offset = 15;
      offset = scrollHalfPageUp(offset, panelHeight); // 15 - 5 = 10
      expect(offset).toBe(10);

      offset = scrollHalfPageUp(offset, panelHeight); // 10 - 5 = 5
      expect(offset).toBe(5);

      offset = scrollHalfPageUp(offset, panelHeight); // 5 - 5 = 0
      expect(offset).toBe(0);
    });
  });
});
