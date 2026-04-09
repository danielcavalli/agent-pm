import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentLogLines,
  toggleAgentDetailMode,
} from "../components/DetailPanel.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractText(child)).join("");
  }

  if (React.isValidElement(node)) {
    return extractText(
      (node as React.ReactElement<{ children?: React.ReactNode }>).props
        .children,
    );
  }

  return "";
}

function makeAgent(
  overrides: Partial<ObservedAgentState> = {},
): ObservedAgentState {
  return {
    agent_id: "agent-01",
    status: "active",
    started_at: "2026-03-13T10:00:00Z",
    last_heartbeat: "2026-03-13T10:05:00Z",
    heartbeat_age_ms: 0,
    heartbeat_stale: false,
    escalation_history: [],
    ...overrides,
  };
}

describe("toggleAgentDetailMode", () => {
  it("toggles from info to log when an agent is selected", () => {
    expect(toggleAgentDetailMode("info", makeAgent())).toBe("log");
  });

  it("toggles from log to info when an agent is selected", () => {
    expect(toggleAgentDetailMode("log", makeAgent())).toBe("info");
  });

  it("does not change mode when no agent is selected", () => {
    expect(toggleAgentDetailMode("info", null)).toBe("info");
  });
});

describe("buildAgentLogLines", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempDir(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-agent-log-"));
    tempDirs.push(tempDir);
    return tempDir;
  }

  function lineTexts(lines: ReturnType<typeof buildAgentLogLines>): string[] {
    return lines.map((line) => extractText(line.content));
  }

  it("shows the last 50 lines of the configured log file", () => {
    const tempDir = makeTempDir();
    const logDir = path.join(tempDir, ".pm", "agents");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "agent.log"),
      Array.from({ length: 60 }, (_, index) => `line-${index + 1}`).join("\n"),
    );

    const lines = buildAgentLogLines(
      makeAgent({ log_file: ".pm/agents/agent.log" }),
      80,
      50,
      tempDir,
    );
    const texts = lineTexts(lines);

    expect(texts).toContain("line-11");
    expect(texts).toContain("line-60");
    expect(texts).not.toContain("line-10");
  });

  it("shows a fallback message when the log file is missing", () => {
    const lines = buildAgentLogLines(
      makeAgent({ log_file: ".pm/agents/missing.log" }),
      80,
      50,
      makeTempDir(),
    );

    expect(lineTexts(lines)).toContain("No log available");
  });

  it("shows a fallback message when the log file is empty", () => {
    const tempDir = makeTempDir();
    const logDir = path.join(tempDir, ".pm", "agents");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, "agent.log"), "");

    const lines = buildAgentLogLines(
      makeAgent({ log_file: ".pm/agents/agent.log" }),
      80,
      50,
      tempDir,
    );

    expect(lineTexts(lines)).toContain("No log available");
  });

  it("reads updated log content after a reload-triggering file change", () => {
    const tempDir = makeTempDir();
    const logDir = path.join(tempDir, ".pm", "agents");
    const logPath = path.join(logDir, "agent.log");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logPath, "first\nsecond\n");

    const initialLines = buildAgentLogLines(
      makeAgent({ log_file: ".pm/agents/agent.log" }),
      80,
      50,
      tempDir,
    );
    fs.appendFileSync(logPath, "third\n");
    const updatedLines = buildAgentLogLines(
      makeAgent({ log_file: ".pm/agents/agent.log" }),
      80,
      50,
      tempDir,
    );

    expect(lineTexts(initialLines)).not.toContain("third");
    expect(lineTexts(updatedLines)).toContain("third");
  });
});
