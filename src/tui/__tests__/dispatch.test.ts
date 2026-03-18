import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isTmuxAvailable,
  buildStoryCommand,
  buildEpicCommand,
} from "../dispatch.js";

describe("isTmuxAvailable", () => {
  const origTmux = process.env.TMUX;

  afterEach(() => {
    if (origTmux !== undefined) {
      process.env.TMUX = origTmux;
    } else {
      delete process.env.TMUX;
    }
  });

  it("returns true when TMUX env is set", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    expect(isTmuxAvailable()).toBe(true);
  });

  it("returns false when TMUX env is not set", () => {
    delete process.env.TMUX;
    expect(isTmuxAvailable()).toBe(false);
  });

  it("returns false when TMUX is empty string", () => {
    process.env.TMUX = "";
    expect(isTmuxAvailable()).toBe(false);
  });
});

describe("buildStoryCommand", () => {
  it("builds a claude -p command for a story code", () => {
    const cmd = buildStoryCommand("PM-E001-S003");
    expect(cmd).toBe('claude -p "/pm-work-on PM-E001-S003"');
  });

  it("includes the exact story code in the command", () => {
    const cmd = buildStoryCommand("MYAPP-E002-S001");
    expect(cmd).toContain("MYAPP-E002-S001");
    expect(cmd).toContain("/pm-work-on");
  });
});

describe("buildEpicCommand", () => {
  it("builds a claude -p command for project orchestration", () => {
    const cmd = buildEpicCommand();
    expect(cmd).toBe('claude -p "/pm-work-on-project"');
  });
});
