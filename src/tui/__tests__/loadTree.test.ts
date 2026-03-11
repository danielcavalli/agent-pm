import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadTree } from "../loadTree.js";

describe("loadTree", () => {
  let tmpDir: string;
  const origPmHome = process.env["PM_HOME"];

  afterEach(() => {
    // Restore env
    if (origPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = origPmHome;
    }
    // Clean up temp dir
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("produces correct epic and story codes without double prefix", () => {
    // Create a temp PM_HOME with projects subdirectory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-loadTree-test-"));
    const projectsDir = path.join(tmpDir, "projects");

    const projectDir = path.join(projectsDir, "PM");
    const epicsDir = path.join(projectDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });

    // Write project.yaml
    fs.writeFileSync(
      path.join(projectDir, "project.yaml"),
      [
        "code: PM",
        "name: Test Project",
        "description: A test project",
        "status: active",
        "created_at: '2026-01-01'",
        "tech_stack: []",
      ].join("\n"),
    );

    // Write epic YAML with one story
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

    // Point loadTree at the temp directory via PM_HOME
    process.env["PM_HOME"] = tmpDir;

    const tree = loadTree();

    expect(tree.projects).toHaveLength(1);
    expect(tree.projects[0]!.code).toBe("PM");
    expect(tree.projects[0]!.epics).toHaveLength(1);
    expect(tree.projects[0]!.epics[0]!.code).toBe("PM-E001");
    expect(tree.projects[0]!.epics[0]!.stories).toHaveLength(1);
    expect(tree.projects[0]!.epics[0]!.stories[0]!.code).toBe("PM-E001-S001");
  });
});
