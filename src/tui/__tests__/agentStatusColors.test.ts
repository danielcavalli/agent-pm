import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  STATUS_COLORS,
  agentStatusIcon,
  agentStatusStyle,
} from "../components/AgentSidebar.js";
import { isNoColor } from "../colors.js";

// ── STATUS_COLORS constant tests ────────────────────────────────────────────

describe("STATUS_COLORS constant", () => {
  it("maps active to green, not bold", () => {
    expect(STATUS_COLORS.active.color).toBe("green");
    expect(STATUS_COLORS.active.bold).toBe(false);
  });

  it("maps idle to gray with dimColor", () => {
    expect(STATUS_COLORS.idle.color).toBe("gray");
    expect(STATUS_COLORS.idle.dimColor).toBe(true);
  });

  it("maps needs_attention to red with bold", () => {
    expect(STATUS_COLORS.needs_attention.color).toBe("red");
    expect(STATUS_COLORS.needs_attention.bold).toBe(true);
  });

  it("maps blocked to red, not bold", () => {
    expect(STATUS_COLORS.blocked.color).toBe("red");
    expect(STATUS_COLORS.blocked.bold).toBe(false);
  });

  it("maps completed to gray, not bold", () => {
    expect(STATUS_COLORS.completed.color).toBe("gray");
    expect(STATUS_COLORS.completed.bold).toBe(false);
  });

  it("is a single object covering all five statuses", () => {
    const keys = Object.keys(STATUS_COLORS);
    expect(keys).toContain("active");
    expect(keys).toContain("idle");
    expect(keys).toContain("needs_attention");
    expect(keys).toContain("blocked");
    expect(keys).toContain("completed");
    expect(keys).toHaveLength(5);
  });
});

// ── agentStatusStyle tests ──────────────────────────────────────────────────

describe("agentStatusStyle", () => {
  it("returns green style for active status", () => {
    const style = agentStatusStyle("active");
    expect(style.color).toBe("green");
    expect(style.bold).toBe(false);
  });

  it("returns dim gray style for idle status", () => {
    const style = agentStatusStyle("idle");
    expect(style.color).toBe("gray");
    expect(style.dimColor).toBe(true);
  });

  it("returns red bold style for needs_attention", () => {
    const style = agentStatusStyle("needs_attention");
    expect(style.color).toBe("red");
    expect(style.bold).toBe(true);
  });

  it("returns red style for blocked", () => {
    const style = agentStatusStyle("blocked");
    expect(style.color).toBe("red");
    expect(style.bold).toBe(false);
  });

  it("returns gray style for completed", () => {
    const style = agentStatusStyle("completed");
    expect(style.color).toBe("gray");
    expect(style.bold).toBe(false);
  });

  it("returns default (no color) for unknown status", () => {
    const style = agentStatusStyle("unknown_status");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
    expect(style.dimColor).toBe(false);
  });
});

// ── agentStatusIcon tests ───────────────────────────────────────────────────

describe("agentStatusIcon", () => {
  it("returns filled circle for active", () => {
    expect(agentStatusIcon("active")).toBe("\u25CF");
  });

  it("returns empty circle for idle", () => {
    expect(agentStatusIcon("idle")).toBe("\u25CB");
  });

  it("returns triangle for needs_attention", () => {
    expect(agentStatusIcon("needs_attention")).toBe("\u25B2");
  });

  it("returns x mark for blocked", () => {
    expect(agentStatusIcon("blocked")).toBe("\u2717");
  });

  it("returns check mark for completed", () => {
    expect(agentStatusIcon("completed")).toBe("\u2713");
  });

  it("returns ? for unknown status", () => {
    expect(agentStatusIcon("foo")).toBe("?");
  });
});

// ── NO_COLOR / TERM=dumb tests ─────────────────────────────────────────────

describe("isNoColor", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Clean up any NO_COLOR / TERM that might be set
    delete process.env.NO_COLOR;
    delete process.env.TERM;
  });

  afterEach(() => {
    // Restore original env
    if (origEnv.NO_COLOR !== undefined) {
      process.env.NO_COLOR = origEnv.NO_COLOR;
    } else {
      delete process.env.NO_COLOR;
    }
    if (origEnv.TERM !== undefined) {
      process.env.TERM = origEnv.TERM;
    } else {
      delete process.env.TERM;
    }
  });

  it("returns false when NO_COLOR is not set and TERM is not dumb", () => {
    expect(isNoColor()).toBe(false);
  });

  it("returns true when NO_COLOR is set (any value)", () => {
    process.env.NO_COLOR = "";
    expect(isNoColor()).toBe(true);
  });

  it("returns true when NO_COLOR is set to a truthy value", () => {
    process.env.NO_COLOR = "1";
    expect(isNoColor()).toBe(true);
  });

  it("returns true when TERM is dumb", () => {
    process.env.TERM = "dumb";
    expect(isNoColor()).toBe(true);
  });

  it("returns false when TERM is xterm-256color", () => {
    process.env.TERM = "xterm-256color";
    expect(isNoColor()).toBe(false);
  });
});

describe("agentStatusStyle with NO_COLOR", () => {
  const origNoColor = process.env.NO_COLOR;

  beforeEach(() => {
    process.env.NO_COLOR = "1";
  });

  afterEach(() => {
    if (origNoColor !== undefined) {
      process.env.NO_COLOR = origNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
  });

  it("returns no color, no bold, no dim for active when NO_COLOR is set", () => {
    const style = agentStatusStyle("active");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
    expect(style.dimColor).toBe(false);
  });

  it("returns no color for needs_attention when NO_COLOR is set", () => {
    const style = agentStatusStyle("needs_attention");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
    expect(style.dimColor).toBe(false);
  });

  it("returns no color for blocked when NO_COLOR is set", () => {
    const style = agentStatusStyle("blocked");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
  });

  it("icons are still returned regardless of NO_COLOR", () => {
    // Symbols are always used for differentiation
    expect(agentStatusIcon("active")).toBe("\u25CF");
    expect(agentStatusIcon("needs_attention")).toBe("\u25B2");
    expect(agentStatusIcon("blocked")).toBe("\u2717");
  });
});

describe("agentStatusStyle with TERM=dumb", () => {
  const origTerm = process.env.TERM;

  beforeEach(() => {
    delete process.env.NO_COLOR;
    process.env.TERM = "dumb";
  });

  afterEach(() => {
    if (origTerm !== undefined) {
      process.env.TERM = origTerm;
    } else {
      delete process.env.TERM;
    }
  });

  it("returns no color for active when TERM=dumb", () => {
    const style = agentStatusStyle("active");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
    expect(style.dimColor).toBe(false);
  });

  it("returns no color for idle when TERM=dumb", () => {
    const style = agentStatusStyle("idle");
    expect(style.color).toBeUndefined();
    expect(style.bold).toBe(false);
    expect(style.dimColor).toBe(false);
  });
});
