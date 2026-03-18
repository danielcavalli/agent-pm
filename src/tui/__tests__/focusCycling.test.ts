import { describe, it, expect } from "vitest";
import { nextFocusedPanel } from "../focusCycling.js";
import type { FocusedPanel } from "../types.js";

describe("nextFocusedPanel", () => {
  describe("sidebar hidden", () => {
    it("cycles tree -> detail", () => {
      expect(nextFocusedPanel("tree", false)).toBe("detail");
    });

    it("cycles detail -> tree", () => {
      expect(nextFocusedPanel("detail", false)).toBe("tree");
    });

    it("resets sidebar -> tree when sidebar is hidden", () => {
      // If focus is somehow on sidebar but sidebar is hidden,
      // it should fall through to the non-sidebar branch
      expect(nextFocusedPanel("sidebar", false)).toBe("tree");
    });
  });

  describe("sidebar visible", () => {
    it("cycles sidebar -> tree", () => {
      expect(nextFocusedPanel("sidebar", true)).toBe("tree");
    });

    it("cycles tree -> detail", () => {
      expect(nextFocusedPanel("tree", true)).toBe("detail");
    });

    it("cycles detail -> sidebar", () => {
      expect(nextFocusedPanel("detail", true)).toBe("sidebar");
    });

    it("completes full cycle: sidebar -> tree -> detail -> sidebar", () => {
      let panel: FocusedPanel = "sidebar";
      panel = nextFocusedPanel(panel, true);
      expect(panel).toBe("tree");
      panel = nextFocusedPanel(panel, true);
      expect(panel).toBe("detail");
      panel = nextFocusedPanel(panel, true);
      expect(panel).toBe("sidebar");
    });
  });
});
