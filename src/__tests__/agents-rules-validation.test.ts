import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Validates that the AGENTS.md rules and MCP server tool descriptions provide
 * clear, non-contradictory guidance for autonomous filing.
 *
 * Scenarios from PRD Section 10:
 *   - Workflow D: Agent discovers MD5 password hashing → should file a story
 *   - Workflow E: Agent discovers issue, no project exists → should notify user first
 *   - Trivial issues (under 2 min fix) should NOT trigger filing
 */

const RULES_PATH = path.resolve(
  import.meta.dirname,
  "../../install/agents-rules.md",
);
const TOOLS_PATH = path.resolve(import.meta.dirname, "../mcp-server.ts");

describe("AGENTS.md rules validation (E018-S004)", () => {
  let rules: string;
  let tools: string;

  // Load both files once
  rules = fs.readFileSync(RULES_PATH, "utf-8");
  tools = fs.readFileSync(TOOLS_PATH, "utf-8");

  // ── AC1: Rules are clear and non-contradictory ──────────────────────

  it("AC1: rules contain all 5 'when to file' scenarios", () => {
    expect(rules).toContain("bug or regression");
    expect(rules).toContain("tech debt");
    expect(rules).toContain("missing feature");
    expect(rules).toContain("test coverage");
    expect(rules).toContain("performance concern");
  });

  it("AC1: rules contain all 3 'when NOT to file' scenarios", () => {
    expect(rules).toContain("directly related to your current task");
    expect(rules).toContain("trivial and can be fixed in under 2 minutes");
    expect(rules).toContain("unsure whether it's actually a problem");
  });

  it("AC1: tool descriptions align with rules (no contradictions)", () => {
    // story_add description should mention bug/improvement/test/debt
    expect(tools).toMatch(/bug/i);
    expect(tools).toMatch(/improvement/i);
    expect(tools).toMatch(/tech debt/i);

    // epic_add description should distinguish from story_add
    expect(tools).toContain("Do NOT use this for small fixes");
    expect(tools).toContain("significant area of work");

    // status tool should guide checking first
    expect(tools).toContain("before filing new items");
  });

  it("AC1: how to file workflow has exactly 7 steps", () => {
    // Steps are numbered 1-7 in the rules
    expect(rules).toContain("1. Run `pm_status`");
    expect(rules).toContain("2. If you need more detail");
    expect(rules).toContain("3. Determine whether");
    expect(rules).toContain("4. For stories:");
    expect(rules).toContain("5. Use `pm_story_add` or `pm_epic_add`");
    expect(rules).toContain(
      "6. For **reactive filing**: continue your current task",
    );
    expect(rules).toContain("7. For **proactive decomposition**:");
  });

  // ── AC2: Workflow D (MD5 password hashing) would trigger correct filing ──

  it("AC2: MD5 password hashing scenario matches 'when to file' rules", () => {
    // MD5 hashing is a security bug/regression → matches "bug or regression"
    expect(rules).toContain("bug or regression");

    // It's also tech debt → matches "tech debt"
    expect(rules).toContain("tech debt");

    // The rules say "unrelated to your current task" — the MD5 issue is found
    // while working on a login bug, making it unrelated to the current task
    expect(rules).toContain("unrelated to your current task");

    // Workflow says: check status first, find existing epic, file story
    expect(rules).toContain("Run `pm_status`");
    expect(rules).toContain("identify the most relevant existing epic");

    // The story_add tool mentions the exact use case
    expect(tools).toContain("while working on something else");
  });

  // ── AC3: Workflow E (new project creation) includes user notification ──

  it("AC3: rules include user notification for new project creation", () => {
    // PRD Workflow E: "Mentions to the user" when creating a new project
    expect(rules).toContain("notify the user");
    expect(rules).toContain("creating a new project");
    expect(rules).toContain("higher-impact action");
  });

  // ── AC4: Trivial issues would NOT trigger filing per the rules ──

  it("AC4: trivial issues are explicitly excluded from filing", () => {
    // "when NOT to file" section covers trivial fixes
    expect(rules).toContain("trivial and can be fixed in under 2 minutes");
    expect(rules).toContain("just fix it");

    // Also excludes things directly related to current task
    expect(rules).toContain("directly related to your current task");
  });

  it("AC4: uncertain issues are excluded — suggest mentioning to user", () => {
    expect(rules).toContain("mention it to the user instead");
  });
});
