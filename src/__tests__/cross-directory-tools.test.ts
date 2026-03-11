import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Integration test: validates that the pm CLI works from an unrelated directory.
 * This simulates an agent working in any codebase using pm tools to file work.
 *
 * Tests cover PRD Workflow D (Autonomous Filing) acceptance criteria:
 *   1. pm status works from unrelated directory
 *   2. pm epic add works from unrelated directory
 *   3. pm story add works from unrelated directory
 *   4. Filed items appear in pm status output
 */

const PM_CLI = path.resolve(import.meta.dirname, "../../dist/cli.js");

function pm(args: string, env: Record<string, string>): string {
  return execSync(`node ${PM_CLI} ${args}`, {
    env: { ...process.env, ...env },
    cwd: os.tmpdir(), // unrelated directory
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
}

describe("Cross-directory PM tool usage (E018-S003)", () => {
  let tmpHome: string;
  let env: Record<string, string>;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pm-e2e-"));
    env = { PM_HOME: tmpHome };

    // Initialize a test project
    pm(
      'init --name "Test App" --code TAPP --description "E2E test project"',
      env,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("AC1: agent in unrelated directory can call pm status and see projects", () => {
    const output = pm("status", env);
    expect(output).toContain("TAPP");
    expect(output).toContain("Test App");
  });

  it("AC3: agent in unrelated directory can file an epic via pm epic add", () => {
    const output = pm(
      'epic add TAPP --title "New Feature" --description "A discovered feature" --priority medium',
      env,
    );
    expect(output).toContain("TAPP-E001");

    // Verify it appears in status
    const status = pm("status TAPP", env);
    expect(status).toContain("New Feature");
  });

  it("AC2: agent in unrelated directory can file a story via pm story add", () => {
    // First create an epic to add the story to
    pm(
      'epic add TAPP --title "Bug Fixes" --description "Various bugs" --priority high',
      env,
    );

    const output = pm(
      'story add TAPP-E001 --title "Fix null check" --description "Missing null check in parser" --points 2 --priority high',
      env,
    );
    expect(output).toContain("TAPP-E001-S001");

    // AC4: Filed items appear in pm status output
    const status = pm("status TAPP", env);
    expect(status).toContain("Fix null check");
  });

  it("AC4: filed items appear in pm status output after multiple additions", () => {
    // File an epic
    pm(
      'epic add TAPP --title "Tech Debt" --description "Code cleanup" --priority low',
      env,
    );

    // File multiple stories
    pm(
      'story add TAPP-E001 --title "Remove dead code" --description "Unused utils" --points 1 --priority low',
      env,
    );
    pm(
      'story add TAPP-E001 --title "Add missing tests" --description "Coverage gaps" --points 3 --priority medium',
      env,
    );

    const status = pm("status TAPP", env);
    expect(status).toContain("Tech Debt");
    expect(status).toContain("Remove dead code");
    expect(status).toContain("Add missing tests");
  });
});
