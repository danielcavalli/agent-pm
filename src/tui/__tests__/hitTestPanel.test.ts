import { describe, expect, it } from "vitest";
import { hitTestPanel } from "../hitTestPanel.js";

describe("hitTestPanel", () => {
  it("returns sidebar for clicks inside the sidebar region", () => {
    expect(hitTestPanel(1, 22, 39, 100)).toBe("sidebar");
    expect(hitTestPanel(22, 22, 39, 100)).toBe("sidebar");
  });

  it("returns tree for clicks inside the tree region", () => {
    expect(hitTestPanel(24, 22, 30, 100)).toBe("tree");
    expect(hitTestPanel(53, 22, 30, 100)).toBe("tree");
  });

  it("returns detail for clicks inside the detail region", () => {
    expect(hitTestPanel(55, 22, 30, 100)).toBe("detail");
    expect(hitTestPanel(100, 22, 30, 100)).toBe("detail");
  });

  it("returns null for divider columns", () => {
    expect(hitTestPanel(23, 22, 30, 100)).toBeNull();
    expect(hitTestPanel(54, 22, 30, 100)).toBeNull();
  });

  it("handles layouts without a visible sidebar", () => {
    expect(hitTestPanel(1, 0, 40, 100)).toBe("tree");
    expect(hitTestPanel(40, 0, 40, 100)).toBe("tree");
    expect(hitTestPanel(41, 0, 40, 100)).toBeNull();
    expect(hitTestPanel(42, 0, 40, 100)).toBe("detail");
  });

  it("handles narrow terminals where the detail panel disappears", () => {
    expect(hitTestPanel(1, 0, 9, 10)).toBe("tree");
    expect(hitTestPanel(9, 0, 9, 10)).toBe("tree");
    expect(hitTestPanel(10, 0, 9, 10)).toBeNull();
  });

  it("returns null for out-of-bounds columns", () => {
    expect(hitTestPanel(0, 22, 30, 100)).toBeNull();
    expect(hitTestPanel(101, 22, 30, 100)).toBeNull();
    expect(hitTestPanel(1, 22, 30, 0)).toBeNull();
  });
});
