/**
 * Shared integration test helpers.
 *
 * Provides temp-dir lifecycle, console capture, and seed utilities so that
 * per-command integration tests stay DRY.
 */

import { beforeEach, afterEach, type SpyInstance } from "vitest";
import * as vi from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { init } from "../commands/init.js";
import { epicAdd } from "../commands/epic.js";

// ── Temp directory lifecycle ────────────────────────────────────────────────

export interface TmpDirHandle {
  /** Absolute path to the temp PM_HOME directory */
  dir: string;
  /** Absolute path to the .pm directory inside PM_HOME */
  projectsDir: string;
  /** Remove the temp directory and restore env vars */
  teardown: () => void;
}

export function setupTmpDir(): TmpDirHandle {
  const origPmHome = process.env["PM_HOME"];
  const origCwd = process.cwd();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-integ-"));
  const projectsDir = path.join(dir, ".pm");

  process.env["PM_HOME"] = projectsDir;
  process.chdir(dir);

  const teardown = () => {
    process.chdir(origCwd);
    fs.rmSync(dir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  };

  return { dir, projectsDir, teardown };
}

// ── Console capture ─────────────────────────────────────────────────────────

export interface CapturedOutput {
  /** Lines written to console.log */
  log: () => string[];
  /** Lines written to console.error */
  error: () => string[];
  /** Restore original console methods */
  restore: () => void;
}

/**
 * Spies on console.log and console.error so tests can inspect CLI output
 * without it leaking to the terminal.
 */
export function captureOutput(): CapturedOutput {
  const logLines: string[] = [];
  const errorLines: string[] = [];

  const logSpy = vi.vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(" "));
    });

  const errorSpy = vi.vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      errorLines.push(args.map(String).join(" "));
    });

  return {
    log: () => [...logLines],
    error: () => [...errorLines],
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

// ── Seed helpers ────────────────────────────────────────────────────────────

/**
 * Creates a real project in the temp directory by calling init() directly.
 * Returns the project code.
 */
export async function seedProject(
  options: {
    name?: string;
    code?: string;
    description?: string;
  } = {},
): Promise<string> {
  const code = options.code ?? "TEST";
  const name = options.name ?? "Test Project";
  const description = options.description ?? "A seeded test project";

  await init({ name, code, description });
  return code;
}

/**
 * Creates a real epic under the given project by calling epicAdd() directly.
 * Returns the epic code (e.g. "TEST-E001").
 */
export async function seedEpic(
  projectCode: string,
  options: {
    title?: string;
    description?: string;
    priority?: string;
  } = {},
): Promise<string> {
  const title = options.title ?? "Test Epic";
  const description = options.description ?? "A seeded test epic";
  const priority = options.priority ?? "medium";

  // Determine the next epic number before adding so we can return the code
  const { nextEpicNumber } = await import("../lib/codes.js");
  const epicId = nextEpicNumber(projectCode);
  const epicCode = `${projectCode}-${epicId}`;

  await epicAdd(projectCode, { title, description, priority });
  return epicCode;
}
