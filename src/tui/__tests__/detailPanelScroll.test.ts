import { describe, it, expect } from "vitest";

/**
 * Unit tests for DetailPanel scroll offset logic.
 *
 * The actual React component uses useState/useInput from ink, which requires
 * ink-testing-library for full integration testing. These tests verify the
 * core clamping arithmetic that DetailPanel uses.
 */

/** Replicates the clamping logic in DetailPanel */
function clampScrollOffset(
  scrollOffset: number,
  linesCount: number,
  height: number,
): number {
  const maxScroll = Math.max(0, linesCount - height);
  return Math.min(Math.max(0, scrollOffset), maxScroll);
}

/** Replicates the j/k handlers */
function scrollDown(
  current: number,
  linesCount: number,
  height: number,
): number {
  const maxScroll = Math.max(0, linesCount - height);
  return Math.min(current + 1, maxScroll);
}

function scrollUp(current: number): number {
  return Math.max(current - 1, 0);
}

/** Replicates the visible slice */
function visibleSlice<T>(
  lines: T[],
  scrollOffset: number,
  height: number,
): T[] {
  const maxScroll = Math.max(0, lines.length - height);
  const clamped = Math.min(Math.max(0, scrollOffset), maxScroll);
  return lines.slice(clamped, clamped + height);
}

describe("DetailPanel scroll offset logic", () => {
  describe("clampScrollOffset", () => {
    it("initializes to 0", () => {
      expect(clampScrollOffset(0, 30, 10)).toBe(0);
    });

    it("clamps negative offset to 0", () => {
      expect(clampScrollOffset(-5, 30, 10)).toBe(0);
    });

    it("clamps offset past max to max", () => {
      // 30 lines, 10 height => max scroll = 20
      expect(clampScrollOffset(25, 30, 10)).toBe(20);
    });

    it("allows offset at max boundary", () => {
      expect(clampScrollOffset(20, 30, 10)).toBe(20);
    });

    it("returns 0 when lines fit in height", () => {
      expect(clampScrollOffset(0, 5, 10)).toBe(0);
      expect(clampScrollOffset(5, 5, 10)).toBe(0);
    });

    it("returns 0 when lines exactly equal height", () => {
      expect(clampScrollOffset(0, 10, 10)).toBe(0);
    });
  });

  describe("scrollDown (j key)", () => {
    it("increments offset by 1", () => {
      expect(scrollDown(0, 30, 10)).toBe(1);
      expect(scrollDown(5, 30, 10)).toBe(6);
    });

    it("does not exceed maxScroll", () => {
      // 30 lines, 10 height => maxScroll = 20
      expect(scrollDown(20, 30, 10)).toBe(20);
      expect(scrollDown(19, 30, 10)).toBe(20);
    });

    it("stays at 0 when content fits in panel", () => {
      expect(scrollDown(0, 5, 10)).toBe(0);
    });
  });

  describe("scrollUp (k key)", () => {
    it("decrements offset by 1", () => {
      expect(scrollUp(5)).toBe(4);
      expect(scrollUp(1)).toBe(0);
    });

    it("does not go below 0", () => {
      expect(scrollUp(0)).toBe(0);
    });
  });

  describe("visibleSlice", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line-${i}`);

    it("shows first height lines at offset 0", () => {
      const visible = visibleSlice(lines, 0, 10);
      expect(visible).toHaveLength(10);
      expect(visible[0]).toBe("line-0");
      expect(visible[9]).toBe("line-9");
    });

    it("shows scrolled content at offset 5", () => {
      const visible = visibleSlice(lines, 5, 10);
      expect(visible).toHaveLength(10);
      expect(visible[0]).toBe("line-5");
      expect(visible[9]).toBe("line-14");
    });

    it("shows last lines at max offset", () => {
      // 25 lines, 10 height => max offset = 15
      const visible = visibleSlice(lines, 15, 10);
      expect(visible).toHaveLength(10);
      expect(visible[0]).toBe("line-15");
      expect(visible[9]).toBe("line-24");
    });

    it("clamps over-offset to show last lines", () => {
      const visible = visibleSlice(lines, 100, 10);
      expect(visible).toHaveLength(10);
      expect(visible[0]).toBe("line-15");
      expect(visible[9]).toBe("line-24");
    });

    it("shows all lines when content fits in height", () => {
      const shortLines = ["a", "b", "c"];
      const visible = visibleSlice(shortLines, 0, 10);
      expect(visible).toHaveLength(3);
    });
  });

  describe("scrolling through 20+ acceptance criteria scenario", () => {
    it("can scroll through all 25 lines with j/k", () => {
      const totalLines = 25;
      const panelHeight = 10;
      let offset = 0;

      // Scroll down to the bottom
      while (offset < totalLines - panelHeight) {
        offset = scrollDown(offset, totalLines, panelHeight);
      }

      // At maxScroll = 15, visible range is lines 15-24
      expect(offset).toBe(15);

      // The last line (index 24) should be visible
      const lines = Array.from({ length: totalLines }, (_, i) => `line-${i}`);
      const visible = visibleSlice(lines, offset, panelHeight);
      expect(visible).toContain("line-24");
      expect(visible).toContain("line-15");

      // Scroll back up to the top
      while (offset > 0) {
        offset = scrollUp(offset);
      }

      expect(offset).toBe(0);
      const visibleTop = visibleSlice(lines, offset, panelHeight);
      expect(visibleTop).toContain("line-0");
    });
  });
});
