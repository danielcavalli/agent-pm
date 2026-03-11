import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { remove } from "../remove.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  seedEpic,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readYaml } from "../../lib/fs.js";
import { IndexSchema } from "../../schemas/index.js";
import { ProjectNotFoundError, ValidationError } from "../../lib/errors.js";
import { storyAdd } from "../story.js";

describe("pm remove (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(() => {
    tmp = setupTmpDir();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  it("without --force prints a warning and does not delete", async () => {
    await seedProject({ code: "DEL", name: "Delete Me" });

    await remove("DEL", {});

    // Project directory should still exist
    const projectDir = path.join(tmp.projectsDir, "DEL");
    expect(fs.existsSync(projectDir)).toBe(true);

    // Output should contain the warning
    const output = out.log().join("\n");
    expect(output).toContain("--force");
    expect(output).toContain("DEL");
  });

  it("with --force deletes the project directory", async () => {
    await seedProject({ code: "DEL", name: "Delete Me" });

    await remove("DEL", { force: true });

    const projectDir = path.join(tmp.projectsDir, "DEL");
    expect(fs.existsSync(projectDir)).toBe(false);
  });

  it("with --force removes the project from index.yaml", async () => {
    await seedProject({ code: "KEEP", name: "Keep This" });
    await seedProject({ code: "DEL", name: "Delete Me" });

    await remove("DEL", { force: true });

    const indexPath = path.join(tmp.projectsDir, "index.yaml");
    const index = readYaml(indexPath, IndexSchema);

    expect(index.projects.find((p) => p.code === "DEL")).toBeUndefined();
    expect(index.projects.find((p) => p.code === "KEEP")).toBeDefined();
  });

  it("deletes epics and stories along with the project", async () => {
    await seedProject({ code: "DEL", name: "Delete Me" });
    const epicCode = await seedEpic("DEL", { title: "Test Epic" });
    await storyAdd(epicCode, {
      title: "Test Story",
      description: "A test",
      points: "3",
      priority: "medium",
      criteria: [],
    });

    await remove("DEL", { force: true });

    const projectDir = path.join(tmp.projectsDir, "DEL");
    expect(fs.existsSync(projectDir)).toBe(false);
  });

  it("throws ProjectNotFoundError for nonexistent project", async () => {
    await expect(remove("NOPE", { force: true })).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  it("throws ValidationError for invalid project code", async () => {
    await expect(remove("bad", { force: true })).rejects.toThrow(
      ValidationError,
    );
  });

  it("prints summary of deleted epics and stories", async () => {
    await seedProject({ code: "DEL", name: "Delete Me" });
    const epicCode = await seedEpic("DEL", { title: "Epic One" });
    await storyAdd(epicCode, {
      title: "Story 1",
      description: "First",
      points: "1",
      priority: "medium",
      criteria: [],
    });
    await storyAdd(epicCode, {
      title: "Story 2",
      description: "Second",
      points: "2",
      priority: "medium",
      criteria: [],
    });

    await remove("DEL", { force: true });

    const output = out.log().join("\n");
    expect(output).toContain("1 epic(s)");
    expect(output).toContain("2 story/stories");
  });
});
