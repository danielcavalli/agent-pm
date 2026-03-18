import { describe, it, expect } from "vitest";
import { sidebarScrollStart } from "../components/AgentSidebar.js";

describe("sidebarScrollStart", () => {
  it("returns 0 when fewer agents than available rows", () => {
    expect(sidebarScrollStart(0, 3, 10)).toBe(0);
    expect(sidebarScrollStart(2, 3, 10)).toBe(0);
  });

  it("returns 0 when agents exactly fill available rows", () => {
    expect(sidebarScrollStart(0, 10, 10)).toBe(0);
    expect(sidebarScrollStart(5, 10, 10)).toBe(0);
  });

  it("centers the cursor when list overflows", () => {
    // 20 agents, 10 visible, cursor at 10 -> scrollStart should center at 5
    expect(sidebarScrollStart(10, 20, 10)).toBe(5);
  });

  it("clamps to 0 when cursor is near the top", () => {
    // cursor at 2 with half=5 would give -3, clamped to 0
    expect(sidebarScrollStart(2, 20, 10)).toBe(0);
  });

  it("clamps to max when cursor is near the bottom", () => {
    // 20 agents, 10 visible -> max scrollStart is 10
    // cursor at 18 -> 18 - 5 = 13, clamped to 10
    expect(sidebarScrollStart(18, 20, 10)).toBe(10);
  });

  it("returns 0 for cursor at 0", () => {
    expect(sidebarScrollStart(0, 20, 10)).toBe(0);
  });

  it("returns max for cursor at last position", () => {
    // 20 agents, 10 visible -> max = 10
    // cursor at 19 -> 19 - 5 = 14, clamped to 10
    expect(sidebarScrollStart(19, 20, 10)).toBe(10);
  });

  it("handles single available row", () => {
    expect(sidebarScrollStart(5, 10, 1)).toBe(5);
    expect(sidebarScrollStart(0, 10, 1)).toBe(0);
    expect(sidebarScrollStart(9, 10, 1)).toBe(9);
  });

  it("handles 0 available rows gracefully", () => {
    expect(sidebarScrollStart(0, 5, 0)).toBe(0);
  });
});
