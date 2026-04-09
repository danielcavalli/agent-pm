import { describe, it, expect } from "vitest";
import { relativeTime } from "../time.js";

describe("relativeTime", () => {
  const nowMs = Date.parse("2026-03-13T10:05:30Z");

  it("formats second deltas", () => {
    expect(relativeTime("2026-03-13T10:05:15Z", nowMs)).toBe("15s ago");
  });

  it("formats minute deltas", () => {
    expect(relativeTime("2026-03-13T10:03:30Z", nowMs)).toBe("2m ago");
  });

  it("formats hour deltas", () => {
    expect(relativeTime("2026-03-13T08:05:30Z", nowMs)).toBe("2h ago");
  });

  it("formats day deltas", () => {
    expect(relativeTime("2026-03-10T10:05:30Z", nowMs)).toBe("3d ago");
  });

  it("falls back to raw ISO string when parsing fails", () => {
    expect(relativeTime("not-a-date", nowMs)).toBe("not-a-date");
  });
});
