import { describe, it, expect } from "vitest";
import { findCursorKey, restoreCursor } from "../hooks/useFileWatcher.js";

/**
 * Tests for PM-E050-S002: useFileWatcher utility functions.
 *
 * Pure-logic tests for the cursor helpers exported from useFileWatcher.
 * The hook itself (useFileWatcher) depends on React and fs; here we only
 * verify the two pure functions: findCursorKey and restoreCursor.
 */

// ── findCursorKey ──────────────────────────────────────────────────────────

describe("findCursorKey", () => {
  const rows = [
    { key: "E001" },
    { key: "S001" },
    { key: "S002" },
    { key: "E002" },
    { key: "S003" },
  ];

  it("returns the key at the given cursor index", () => {
    expect(findCursorKey(rows, 0)).toBe("E001");
    expect(findCursorKey(rows, 1)).toBe("S001");
    expect(findCursorKey(rows, 4)).toBe("S003");
  });

  it("returns null when cursor is out of bounds (too large)", () => {
    expect(findCursorKey(rows, 5)).toBeNull();
    expect(findCursorKey(rows, 100)).toBeNull();
  });

  it("returns null when cursor is negative", () => {
    expect(findCursorKey(rows, -1)).toBeNull();
  });

  it("returns null for an empty rows array", () => {
    expect(findCursorKey([], 0)).toBeNull();
  });

  it("works with a single-element array", () => {
    expect(findCursorKey([{ key: "E050" }], 0)).toBe("E050");
    expect(findCursorKey([{ key: "E050" }], 1)).toBeNull();
  });

  it("returns the correct key for a story code", () => {
    expect(findCursorKey(rows, 2)).toBe("S002");
  });

  it("returns the correct key for the last element", () => {
    expect(findCursorKey(rows, rows.length - 1)).toBe("S003");
  });
});

// ── restoreCursor ──────────────────────────────────────────────────────────

describe("restoreCursor", () => {
  const rows = [
    { key: "E001" },
    { key: "S001" },
    { key: "S002" },
    { key: "E002" },
    { key: "S003" },
  ];

  it("returns the index of the matching key", () => {
    expect(restoreCursor(rows, "E001")).toBe(0);
    expect(restoreCursor(rows, "S001")).toBe(1);
    expect(restoreCursor(rows, "S002")).toBe(2);
    expect(restoreCursor(rows, "E002")).toBe(3);
    expect(restoreCursor(rows, "S003")).toBe(4);
  });

  it("returns 0 when key is null", () => {
    expect(restoreCursor(rows, null)).toBe(0);
  });

  it("returns 0 when key is not found in rows", () => {
    expect(restoreCursor(rows, "NONEXISTENT")).toBe(0);
  });

  it("returns 0 for an empty rows array", () => {
    expect(restoreCursor([], "E001")).toBe(0);
  });

  it("returns 0 for an empty rows array with null key", () => {
    expect(restoreCursor([], null)).toBe(0);
  });

  it("works with a single-element array when key matches", () => {
    expect(restoreCursor([{ key: "E050" }], "E050")).toBe(0);
  });

  it("works with a single-element array when key does not match", () => {
    expect(restoreCursor([{ key: "E050" }], "E999")).toBe(0);
  });

  it("returns first occurrence when duplicate keys exist", () => {
    const dupeRows = [
      { key: "E001" },
      { key: "S001" },
      { key: "S001" }, // duplicate
      { key: "E002" },
    ];
    expect(restoreCursor(dupeRows, "S001")).toBe(1);
  });

  // ── Round-trip: findCursorKey -> restoreCursor ───────────────────────────

  describe("round-trip with findCursorKey", () => {
    it("restores cursor to the same position when rows are unchanged", () => {
      for (let i = 0; i < rows.length; i++) {
        const key = findCursorKey(rows, i);
        const restored = restoreCursor(rows, key);
        expect(restored).toBe(i);
      }
    });

    it("restores cursor to new position when a row is removed before it", () => {
      // Cursor was on S002 (index 2)
      const key = findCursorKey(rows, 2);
      expect(key).toBe("S002");

      // After reload, S001 is removed; S002 shifts to index 1
      const newRows = [
        { key: "E001" },
        { key: "S002" },
        { key: "E002" },
        { key: "S003" },
      ];
      expect(restoreCursor(newRows, key)).toBe(1);
    });

    it("falls back to 0 when the selected row is removed", () => {
      // Cursor was on S002 (index 2)
      const key = findCursorKey(rows, 2);
      expect(key).toBe("S002");

      // After reload, S002 no longer exists
      const newRows = [
        { key: "E001" },
        { key: "S001" },
        { key: "E002" },
        { key: "S003" },
      ];
      expect(restoreCursor(newRows, key)).toBe(0);
    });

    it("handles cursor beyond new rows length by returning null key then 0", () => {
      // Cursor at index 10, well beyond rows length
      const key = findCursorKey(rows, 10);
      expect(key).toBeNull();
      expect(restoreCursor(rows, key)).toBe(0);
    });
  });
});
