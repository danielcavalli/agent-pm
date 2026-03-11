import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
} from "../codes.js";
import { writeYaml } from "../fs.js";
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
  let projectsDir: string;
  const origPmHome = process.env["PM_HOME"];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-codes-test-"));
    projectsDir = path.join(tmpDir, "projects");
    fs.mkdirSync(projectsDir, { recursive: true });
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

  it("isProjectCodeTaken returns false for non-existent project", () => {
    expect(isProjectCodeTaken("PM")).toBe(false);
  });

  it("isProjectCodeTaken returns true when project dir exists", () => {
    fs.mkdirSync(path.join(projectsDir, "PM"), { recursive: true });
    expect(isProjectCodeTaken("PM")).toBe(true);
  });

  it("nextEpicNumber returns E001 when epics dir is empty", () => {
    fs.mkdirSync(path.join(projectsDir, "PM", "epics"), { recursive: true });
    expect(nextEpicNumber("PM")).toBe("E001");
  });

  it("nextEpicNumber returns E001 when epics dir does not exist", () => {
    expect(nextEpicNumber("NONE")).toBe("E001");
  });

  it("nextEpicNumber returns E004 when E001-E003 exist", () => {
    const epicsDir = path.join(projectsDir, "PM", "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    fs.writeFileSync(path.join(epicsDir, "E001-foundation.yaml"), "");
    fs.writeFileSync(path.join(epicsDir, "E002-cli.yaml"), "");
    fs.writeFileSync(path.join(epicsDir, "E003-slash.yaml"), "");
    expect(nextEpicNumber("PM")).toBe("E004");
  });

  it("nextStoryNumber returns S001 for empty epic", () => {
    const epicsDir = path.join(projectsDir, "PM", "epics");
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
    const epicsDir = path.join(projectsDir, "PM", "epics");
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
    fs.mkdirSync(path.join(projectsDir, "PM", "epics"), { recursive: true });
    expect(findEpicFile("PM-E001")).toBeNull();
  });

  it("findEpicFile finds epic by code", () => {
    const epicsDir = path.join(projectsDir, "PM", "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
    const epicPath = path.join(epicsDir, "E001-foundation.yaml");
    fs.writeFileSync(epicPath, "id: E001");
    const found = findEpicFile("PM-E001");
    expect(found).toBe(epicPath);
  });
});
