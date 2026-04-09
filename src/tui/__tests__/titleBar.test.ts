import { describe, it, expect } from "vitest";
import {
  buildProjectProgressBar,
  calculateProjectCompletion,
  truncateTitleSegment,
} from "../titleBar.js";

describe("calculateProjectCompletion", () => {
  it("computes completion from done and total stories", () => {
    expect(calculateProjectCompletion(13, 25)).toBe(52);
  });

  it("returns 0 when the project has no stories", () => {
    expect(calculateProjectCompletion(0, 0)).toBe(0);
  });
});

describe("buildProjectProgressBar", () => {
  it("renders a visual bar with percentage", () => {
    expect(buildProjectProgressBar(13, 25, 40)).toBe("[########........] 52%");
  });

  it("uses dots for the remaining portion", () => {
    expect(buildProjectProgressBar(1, 4, 40)).toBe("[####............] 25%");
  });

  it("gracefully handles projects with zero stories", () => {
    expect(buildProjectProgressBar(0, 0, 40)).toBe("[................] 0%");
  });

  it("shrinks the bar when available width is limited", () => {
    expect(buildProjectProgressBar(13, 25, 9)).toBe("[##.] 52%");
  });
});

describe("truncateTitleSegment", () => {
  it("preserves short project titles", () => {
    expect(truncateTitleSegment(" | Demo", 20)).toBe(" | Demo");
  });

  it("truncates long project titles to fit the title bar", () => {
    expect(truncateTitleSegment(" | Very Long Project Name", 10)).toBe(
      " | Very L…",
    );
  });
});
