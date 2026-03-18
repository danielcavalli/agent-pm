import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { priorityColor, priorityBadge, isNoColor, theme, tc } from "../colors.js";

describe("priorityColor", () => {
  const origNoColor = process.env.NO_COLOR;

  beforeEach(() => {
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    if (origNoColor !== undefined) {
      process.env.NO_COLOR = origNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
  });

  it("returns theme.error for high priority", () => {
    expect(priorityColor("high")).toBe(theme.error);
  });

  it("returns theme.warning for medium priority", () => {
    expect(priorityColor("medium")).toBe(theme.warning);
  });

  it("returns theme.textMuted for low priority", () => {
    expect(priorityColor("low")).toBe(theme.textMuted);
  });

  it("returns undefined for unknown priority", () => {
    expect(priorityColor("unknown")).toBeUndefined();
  });

  it("returns undefined for all priorities when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(priorityColor("high")).toBeUndefined();
    expect(priorityColor("medium")).toBeUndefined();
    expect(priorityColor("low")).toBeUndefined();
  });
});

describe("tc (theme color helper)", () => {
  const origNoColor = process.env.NO_COLOR;

  beforeEach(() => {
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    if (origNoColor !== undefined) {
      process.env.NO_COLOR = origNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
  });

  it("returns the hex color when NO_COLOR is not set", () => {
    expect(tc("#fab283")).toBe("#fab283");
  });

  it("returns undefined when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(tc("#fab283")).toBeUndefined();
  });
});

describe("priorityBadge", () => {
  it("returns [H] for high", () => {
    expect(priorityBadge("high")).toBe("[H]");
  });

  it("returns [M] for medium", () => {
    expect(priorityBadge("medium")).toBe("[M]");
  });

  it("returns [L] for low", () => {
    expect(priorityBadge("low")).toBe("[L]");
  });

  it("returns empty string for unknown", () => {
    expect(priorityBadge("unknown")).toBe("");
  });
});
