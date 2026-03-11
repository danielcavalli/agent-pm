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

    await remove(undefined, {});

    expect(fs.existsSync(tmp.projectsDir)).toBe(true);

    const output = out.log().join("\n");
    expect(output).toContain("--force");
    expect(output).toContain("DEL");
  });

  it("with --force deletes the .pm directory", async () => {
    await seedProject({ code: "DEL", name: "Delete Me" });

    await remove(undefined, { force: true });

    expect(fs.existsSync(tmp.projectsDir)).toBe(false);
  });

  it("with --force removes index.yaml", async () => {
    await seedProject({ code: "TEST", name: "Test Project" });

    await remove(undefined, { force: true });

    const indexPath = path.join(tmp.projectsDir, "index.yaml");
    expect(fs.existsSync(indexPath)).toBe(false);
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

    await remove(undefined, { force: true });

    expect(fs.existsSync(tmp.projectsDir)).toBe(false);
  });

  it("throws ProjectNotFoundError for nonexistent project", async () => {
    await expect(remove(undefined, { force: true })).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  it("works without project code, using auto-detected code", async () => {
    await seedProject({ code: "AUTO", name: "Auto Project" });

    await remove(undefined, { force: true });

    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    expect(fs.existsSync(projectYaml)).toBe(false);
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

    await remove(undefined, { force: true });

    const output = out.log().join("\n");
    expect(output).toContain("1 epic(s)");
    expect(output).toContain("2 story/stories");
  });
});
