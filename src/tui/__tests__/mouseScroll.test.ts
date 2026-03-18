import { describe, it, expect } from "vitest";
import { parseMouseSequence, isScrollUp, isScrollDown } from "../hooks/useMouseScroll.js";

describe("parseMouseSequence", () => {
  it("parses a scroll-up press event", () => {
    // Button 64 = scroll up, col=10, row=20, M = press
    const result = parseMouseSequence("\x1b[<64;10;20M");
    expect(result).not.toBeNull();
    expect(result!.event.button).toBe(64);
    expect(result!.event.col).toBe(10);
    expect(result!.event.row).toBe(20);
    expect(result!.event.release).toBe(false);
  });

  it("parses a scroll-down press event", () => {
    const result = parseMouseSequence("\x1b[<65;5;15M");
    expect(result).not.toBeNull();
    expect(result!.event.button).toBe(65);
    expect(result!.event.col).toBe(5);
    expect(result!.event.row).toBe(15);
    expect(result!.event.release).toBe(false);
  });

  it("parses a mouse release event", () => {
    const result = parseMouseSequence("\x1b[<0;1;1m");
    expect(result).not.toBeNull();
    expect(result!.event.button).toBe(0);
    expect(result!.event.release).toBe(true);
  });

  it("returns consumed byte count", () => {
    const result = parseMouseSequence("\x1b[<64;10;20M");
    expect(result).not.toBeNull();
    expect(result!.consumed).toBe("\x1b[<64;10;20M".length);
  });

  it("returns null for non-mouse data", () => {
    expect(parseMouseSequence("hello")).toBeNull();
    expect(parseMouseSequence("\x1b[A")).toBeNull(); // up arrow
    expect(parseMouseSequence("j")).toBeNull();
  });

  it("handles large coordinates", () => {
    const result = parseMouseSequence("\x1b[<64;250;100M");
    expect(result).not.toBeNull();
    expect(result!.event.col).toBe(250);
    expect(result!.event.row).toBe(100);
  });

  it("parses mouse click (button 0)", () => {
    const result = parseMouseSequence("\x1b[<0;50;25M");
    expect(result).not.toBeNull();
    expect(result!.event.button).toBe(0);
    expect(result!.event.release).toBe(false);
  });
});

describe("isScrollUp", () => {
  it("returns true for button 64", () => {
    expect(isScrollUp(64)).toBe(true);
  });

  it("returns false for button 65", () => {
    expect(isScrollUp(65)).toBe(false);
  });

  it("returns false for button 0", () => {
    expect(isScrollUp(0)).toBe(false);
  });
});

describe("isScrollDown", () => {
  it("returns true for button 65", () => {
    expect(isScrollDown(65)).toBe(true);
  });

  it("returns false for button 64", () => {
    expect(isScrollDown(64)).toBe(false);
  });

  it("returns false for button 0", () => {
    expect(isScrollDown(0)).toBe(false);
  });
});
