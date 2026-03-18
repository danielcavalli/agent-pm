import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  suggestProjectCode,
  toKebabSlug,
  isProjectCodeTaken,
  nextEpicNumber,
  nextStoryNumber,
  findEpicFile,
  parseStoryCode,
  getProjectsDir,
  getPmDir,
  findGitRoot,
  getProjectCode,
  resetProjectCodeCache,
  ensurePmDir,
  ensureProjectsDir,
} from "../codes.js";
import { writeYaml } from "../fs.js";
import * as childProcess from "node:child_process";
import * as codesModule from "../codes.js";
import type { Epic } from "../../schemas/index.js";

// ── suggestProjectCode ────────────────────────────────────────────────────────

describe("suggestProjectCode", () => {
  it("returns initials from a multi-word name", () => {
    expect(suggestProjectCode("My Cool App")).toBe("MCA");
  });

  it('returns PM for "Project Management"', () => {
    expect(suggestProjectCode("Project Management")).toBe("PM");
  });

  it("caps at 6 characters", () => {
    const result = suggestProjectCode("A B C D E F G H");
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("uppercases the result", () => {
    const result = suggestProjectCode("hello world");
    expect(result).toBe(result.toUpperCase());
  });

  it("handles single-word input", () => {
    const result = suggestProjectCode("Dotfiles");
    expect(result).toBe("D");
  });

  it("returns PROJ for empty/whitespace input", () => {
    expect(suggestProjectCode("   ")).toBe("PROJ");
  });
});

// ── toKebabSlug ───────────────────────────────────────────────────────────────

describe("toKebabSlug", () => {
  it("converts basic title to kebab", () => {
    expect(toKebabSlug("Authentication & Authorization")).toBe(
      "authentication-authorization",
    );
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(toKebabSlug("Hello   World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(toKebabSlug("Hello, World!")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(toKebabSlug("--hello--")).toBe("hello");
  });

  it("handles all-lowercase input", () => {
    expect(toKebabSlug("foundation")).toBe("foundation");
  });
});

// ── parseStoryCode ────────────────────────────────────────────────────────────

describe("parseStoryCode", () => {
  it("parses a valid story code", () => {
    const result = parseStoryCode("PM-E001-S003");
    expect(result).not.toBeNull();
    expect(result?.projectCode).toBe("PM");
    expect(result?.epicId).toBe("E001");
    expect(result?.storyId).toBe("S003");
    expect(result?.epicCode).toBe("PM-E001");
  });

  it("returns null for invalid format", () => {
    expect(parseStoryCode("pm-e001-s001")).toBeNull();
    expect(parseStoryCode("PM-E001")).toBeNull();
    expect(parseStoryCode("NOT-VALID")).toBeNull();
    expect(parseStoryCode("")).toBeNull();
  });

  it("handles 6-char project code", () => {
    const result = parseStoryCode("SIXSIX-E001-S001");
    expect(result?.projectCode).toBe("SIXSIX");
  });
});

// ── filesystem-dependent functions ────────────────────────────────────────────

describe("isProjectCodeTaken / nextEpicNumber / nextStoryNumber / findEpicFile", () => {
  let tmpDir: string;
  let pmDir: string;
  const origPmHome = process.env["PM_HOME"];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-codes-test-"));
    pmDir = tmpDir;
    fs.mkdirSync(pmDir, { recursive: true });
    process.env["PM_HOME"] = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  });

  it("isProjectCodeTaken always returns false (deprecated in single-project mode)", () => {
    expect(isProjectCodeTaken("PM")).toBe(false);
  });

  it("nextEpicNumber returns E001 when epics dir is empty", () => {
    fs.mkdirSync(path.join(pmDir, "epics"), { recursive: true });
    expect(nextEpicNumber()).toBe("E001");
  });

  it("nextEpicNumber returns E004 when E001-E003 exist", () => {
    const epicsDir = path.join(pmDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    fs.writeFileSync(path.join(epicsDir, "E001-foundation.yaml"), "");
    fs.writeFileSync(path.join(epicsDir, "E002-cli.yaml"), "");
    fs.writeFileSync(path.join(epicsDir, "E003-slash.yaml"), "");
    expect(nextEpicNumber()).toBe("E004");
  });

  it("nextStoryNumber returns S001 for empty epic", () => {
    const epicsDir = path.join(pmDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    const epicPath = path.join(epicsDir, "E001-foundation.yaml");
    const emptyEpic: Epic = {
      id: "E001",
      code: "PM-E001",
      title: "Foundation",
      description: "",
      status: "backlog",
      priority: "high",
      created_at: "2026-01-01",
      stories: [],
    };
    writeYaml(epicPath, emptyEpic);
    expect(nextStoryNumber(epicPath)).toBe("S001");
  });

  it("nextStoryNumber returns S003 when S001-S002 exist", () => {
    const epicsDir = path.join(pmDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    const epicPath = path.join(epicsDir, "E001-foundation.yaml");
    const storyBase = {
      title: "A story",
      description: "",
      acceptance_criteria: [],
      status: "done" as const,
      priority: "high" as const,
      story_points: 2 as const,
      notes: "",
      depends_on: [],
    };
    const epic: Epic = {
      id: "E001",
      code: "PM-E001",
      title: "Foundation",
      description: "",
      status: "backlog",
      priority: "high",
      created_at: "2026-01-01",
      stories: [
        { ...storyBase, id: "S001", code: "PM-E001-S001" },
        { ...storyBase, id: "S002", code: "PM-E001-S002" },
      ],
    };
    writeYaml(epicPath, epic);
    expect(nextStoryNumber(epicPath)).toBe("S003");
  });

  it("findEpicFile returns null for non-existent epic", () => {
    fs.mkdirSync(path.join(pmDir, "epics"), { recursive: true });
    expect(findEpicFile("PM-E001")).toBeNull();
  });

  it("findEpicFile finds epic by code", () => {
    const epicsDir = path.join(pmDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    const epicPath = path.join(epicsDir, "E001-foundation.yaml");
    fs.writeFileSync(epicPath, "id: E001");
    const found = findEpicFile("PM-E001");
    expect(found).toBe(epicPath);
  });

  it("nextEpicNumber returns E001 when epics dir does not exist", () => {
    expect(nextEpicNumber()).toBe("E001");
  });
});

// ── getPmDir resolution order ────────────────────────────────────────────────────

describe("getPmDir", () => {
  const origPmHome = process.env["PM_HOME"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-getpmDir-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  });

  it("returns PM_HOME when PM_HOME is set", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env["PM_HOME"] = tmpDir;
    expect(getPmDir()).toBe(tmpDir);
  });

  it("PM_HOME takes precedence over git root", () => {
    const pmHomeDir = path.join(tmpDir, "home");
    fs.mkdirSync(pmHomeDir, { recursive: true });
    process.env["PM_HOME"] = pmHomeDir;

    expect(getPmDir()).toBe(pmHomeDir);
  });

  it("returns .pm at git root when PM_HOME not set", () => {
    delete process.env["PM_HOME"];

    const gitRoot = childProcess
      .execSync("git rev-parse --show-toplevel", { encoding: "utf-8" })
      .trim();
    const pmDir = path.join(gitRoot, ".pm");

    if (fs.existsSync(pmDir)) {
      expect(getPmDir()).toBe(pmDir);
    } else {
      expect(() => getPmDir()).toThrow(/No \.pm directory found/);
    }
  });
});

// ── getProjectsDir (legacy alias) ────────────────────────────────────────────────

describe("getProjectsDir", () => {
  const origPmHome = process.env["PM_HOME"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-getprojectsdir-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  });

  it("returns PM_HOME when PM_HOME is set (legacy alias)", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env["PM_HOME"] = tmpDir;
    expect(getProjectsDir()).toBe(tmpDir);
  });

  it("PM_HOME takes precedence over git root (legacy alias)", () => {
    const pmHomeDir = path.join(tmpDir, "home");
    fs.mkdirSync(pmHomeDir, { recursive: true });
    process.env["PM_HOME"] = pmHomeDir;

    expect(getProjectsDir()).toBe(pmHomeDir);
  });

  it("returns .pm at git root when PM_HOME not set (legacy alias)", () => {
    delete process.env["PM_HOME"];

    const gitRoot = childProcess
      .execSync("git rev-parse --show-toplevel", { encoding: "utf-8" })
      .trim();
    const pmDir = path.join(gitRoot, ".pm");

    if (fs.existsSync(pmDir)) {
      expect(getProjectsDir()).toBe(pmDir);
    } else {
      expect(() => getProjectsDir()).toThrow(/No \.pm directory found/);
    }
  });
});

// ── getProjectCode ──────────────────────────────────────────────────────────────

describe("getProjectCode", () => {
  const origPmHome = process.env["PM_HOME"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-getprojectcode-test-"));
    process.env["PM_HOME"] = tmpDir;
    resetProjectCodeCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
    resetProjectCodeCache();
  });

  it("returns the code from .pm/project.yaml", () => {
    const projectYaml = path.join(tmpDir, "project.yaml");
    writeYaml(projectYaml, {
      code: "TEST",
      name: "Test Project",
      status: "active",
      created_at: "2026-01-01",
    });
    expect(getProjectCode()).toBe("TEST");
  });

  it("returns null when .pm/project.yaml does not exist", () => {
    expect(getProjectCode()).toBeNull();
  });

  it("returns null when project.yaml is invalid", () => {
    const projectYaml = path.join(tmpDir, "project.yaml");
    fs.writeFileSync(projectYaml, "invalid: yaml: content:");
    expect(getProjectCode()).toBeNull();
  });

  it("caches the result to avoid repeated file reads", async () => {
    const projectYaml = path.join(tmpDir, "project.yaml");
    writeYaml(projectYaml, {
      code: "CACHED",
      name: "Cached",
      status: "active",
      created_at: "2026-01-01",
    });

    const firstCall = getProjectCode();
    expect(firstCall).toBe("CACHED");

    fs.rmSync(projectYaml, { force: true });

    const secondCall = getProjectCode();
    expect(secondCall).toBe("CACHED");
  });
});

// ── ensurePmDir / ensureProjectsDir ──────────────────────────────────────────────

describe("ensurePmDir", () => {
  const origPmHome = process.env["PM_HOME"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-ensurepmdir-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  });

  it("creates .pm/ with subdirectories when PM_HOME is set", () => {
    process.env["PM_HOME"] = tmpDir;

    ensurePmDir();

    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "epics"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "comments"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "adrs"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "reports"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "agents"))).toBe(true);
  });

  it("is idempotent — does not error if .pm/ already exists", () => {
    process.env["PM_HOME"] = tmpDir;
    fs.mkdirSync(tmpDir, { recursive: true });

    ensurePmDir();
    ensurePmDir();

    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it("creates .pm/ at git root when PM_HOME not set", () => {
    delete process.env["PM_HOME"];

    const gitRoot = childProcess
      .execSync("git rev-parse --show-toplevel", { encoding: "utf-8" })
      .trim();
    const pmDir = path.join(gitRoot, ".pm");

    const existedBefore = fs.existsSync(pmDir);

    ensurePmDir();

    expect(fs.existsSync(pmDir)).toBe(true);
    expect(fs.existsSync(path.join(pmDir, "epics"))).toBe(true);
    expect(fs.existsSync(path.join(pmDir, "comments"))).toBe(true);
    expect(fs.existsSync(path.join(pmDir, "adrs"))).toBe(true);

    if (!existedBefore) {
      fs.rmSync(pmDir, { recursive: true, force: true });
    }
  });

  it("creates .pm/ in cwd when not in git repo and PM_HOME not set", () => {
    delete process.env["PM_HOME"];

    const origCwd = process.cwd();
    process.chdir(tmpDir);

    vi.spyOn(codesModule, "findGitRoot").mockReturnValue(null);

    try {
      ensurePmDir();

      const pmDir = path.join(tmpDir, ".pm");
      expect(fs.existsSync(pmDir)).toBe(true);
      expect(fs.existsSync(path.join(pmDir, "epics"))).toBe(true);
      expect(fs.existsSync(path.join(pmDir, "comments"))).toBe(true);
      expect(fs.existsSync(path.join(pmDir, "adrs"))).toBe(true);
    } finally {
      process.chdir(origCwd);
      vi.restoreAllMocks();
    }
  });

  it("refuses to create .pm/ in HOME directory", () => {
    delete process.env["PM_HOME"];

    const origCwd = process.cwd();
    const homeDir = os.homedir();
    const pmDir = path.join(homeDir, ".pm");
    const existedBefore = fs.existsSync(pmDir);

    const epicsBefore =
      existedBefore && fs.existsSync(path.join(pmDir, "epics"));
    const commentsBefore =
      existedBefore && fs.existsSync(path.join(pmDir, "comments"));
    const adrsBefore = existedBefore && fs.existsSync(path.join(pmDir, "adrs"));
    const reportsBefore =
      existedBefore && fs.existsSync(path.join(pmDir, "reports"));

    process.chdir(homeDir);

    vi.spyOn(codesModule, "findGitRoot").mockReturnValue(null);

    try {
      ensurePmDir();

      if (!existedBefore) {
        expect(fs.existsSync(pmDir)).toBe(false);
      } else {
        expect(fs.existsSync(path.join(pmDir, "epics"))).toBe(!!epicsBefore);
        expect(fs.existsSync(path.join(pmDir, "comments"))).toBe(
          !!commentsBefore,
        );
        expect(fs.existsSync(path.join(pmDir, "adrs"))).toBe(!!adrsBefore);
        expect(fs.existsSync(path.join(pmDir, "reports"))).toBe(
          !!reportsBefore,
        );
      }
    } finally {
      process.chdir(origCwd);
      vi.restoreAllMocks();
    }
  });

  it("refuses to create .pm/ in root directory", () => {
    delete process.env["PM_HOME"];

    const origCwd = process.cwd();

    vi.spyOn(codesModule, "findGitRoot").mockReturnValue(null);
    vi.spyOn(process, "cwd").mockReturnValue("/");

    try {
      ensurePmDir();

      expect(fs.existsSync("/.pm")).toBe(false);
    } finally {
      process.chdir(origCwd);
      vi.restoreAllMocks();
    }
  });
});

describe("ensureProjectsDir (legacy alias)", () => {
  const origPmHome = process.env["PM_HOME"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pm-ensureprojectsdir-test-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
  });

  it("creates .pm/ with subdirectories via legacy alias", () => {
    process.env["PM_HOME"] = tmpDir;

    ensureProjectsDir();

    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "epics"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "comments"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "adrs"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "reports"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "agents"))).toBe(true);
  });
});
