import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadTree, NoPmDirectoryError } from "../loadTree.js";
import { NAMED_THEMES, resetTheme, theme } from "../colors.js";

describe("loadTree", () => {
  let tmpDir: string;
  const origPmHome = process.env["PM_HOME"];

  afterEach(() => {
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
    resetTheme();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("produces correct epic and story codes without double prefix", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-loadTree-test-"));

    const epicsDir = path.join(tmpDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, "project.yaml"),
      [
        "code: PM",
        "name: Test Project",
        "description: A test project",
        "status: active",
        "created_at: '2026-01-01'",
        "tech_stack: []",
        "tui:",
        "  links:",
        "    story_url_template: https://example.com/stories/{code}",
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(epicsDir, "E001-test-epic.yaml"),
      [
        "id: E001",
        "code: PM-E001",
        "title: Test Epic",
        "description: A test epic",
        "status: backlog",
        "priority: high",
        "created_at: '2026-01-01'",
        "stories:",
        "  - id: S001",
        "    code: PM-E001-S001",
        "    title: Test Story",
        "    description: A test story",
        "    status: backlog",
        "    priority: high",
        "    story_points: 1",
      ].join("\n"),
    );

    process.env["PM_HOME"] = tmpDir;

    const tree = loadTree();

    expect(tree.epics).toHaveLength(1);
    expect(tree.projectName).toBe("Test Project");
    expect(tree.storyLinkTemplate).toBe("https://example.com/stories/{code}");
    expect(tree.epics[0]!.code).toBe("PM-E001");
    expect(tree.epics[0]!.stories).toHaveLength(1);
    expect(tree.epics[0]!.stories[0]!.code).toBe("PM-E001-S001");
  });

  it("applies bundled themes and custom hex overrides from project.yaml", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-loadTree-test-"));

    const epicsDir = path.join(tmpDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, "project.yaml"),
      [
        "code: PM",
        "name: Test Project",
        "status: active",
        "created_at: '2026-01-01'",
        "theme:",
        "  name: catppuccin",
        "  colors:",
        "    primary: '#123456'",
        "    info: not-a-hex-color",
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(epicsDir, "E001-test-epic.yaml"),
      [
        "id: E001",
        "code: PM-E001",
        "title: Test Epic",
        "status: backlog",
        "priority: high",
        "created_at: '2026-01-01'",
        "stories: []",
      ].join("\n"),
    );

    process.env["PM_HOME"] = tmpDir;

    loadTree();

    expect(theme.bg).toBe(NAMED_THEMES.catppuccin.bg);
    expect(theme.primary).toBe("#123456");
    expect(theme.info).toBe(NAMED_THEMES.catppuccin.info);
  });

  it("updates the active theme when project.yaml changes", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-loadTree-test-"));

    const epicsDir = path.join(tmpDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });

    const projectYaml = path.join(tmpDir, "project.yaml");
    fs.writeFileSync(
      projectYaml,
      [
        "code: PM",
        "name: Test Project",
        "status: active",
        "created_at: '2026-01-01'",
        "theme: default",
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(epicsDir, "E001-test-epic.yaml"),
      [
        "id: E001",
        "code: PM-E001",
        "title: Test Epic",
        "status: backlog",
        "priority: high",
        "created_at: '2026-01-01'",
        "stories: []",
      ].join("\n"),
    );

    process.env["PM_HOME"] = tmpDir;

    loadTree();
    expect(theme.bg).toBe(NAMED_THEMES.default.bg);

    fs.writeFileSync(
      projectYaml,
      [
        "code: PM",
        "name: Test Project",
        "status: active",
        "created_at: '2026-01-01'",
        "theme: tokyonight",
      ].join("\n"),
    );

    loadTree();
    expect(theme.bg).toBe(NAMED_THEMES.tokyonight.bg);
    expect(theme.primary).toBe(NAMED_THEMES.tokyonight.primary);
  });

  it("throws NoPmDirectoryError when .pm not found", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-loadTree-test-"));
    process.env["PM_HOME"] = path.join(tmpDir, "nonexistent");

    expect(() => loadTree()).toThrow(NoPmDirectoryError);
  });
});
