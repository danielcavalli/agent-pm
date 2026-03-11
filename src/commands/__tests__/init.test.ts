import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { init } from "../init.js";
import {
  setupTmpDir,
  captureOutput,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readYaml } from "../../lib/fs.js";
import { ProjectSchema, IndexSchema } from "../../schemas/index.js";
import {
  DuplicateProjectCodeError,
  ValidationError,
} from "../../lib/errors.js";

describe("pm init (integration)", () => {
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

  it("AC1: creates project.yaml with correct code, name, and status", async () => {
    await init({ name: "My App", code: "MYAPP", description: "A test app" });

    const projectYaml = path.join(tmp.projectsDir, "MYAPP", "project.yaml");
    expect(fs.existsSync(projectYaml)).toBe(true);

    const project = readYaml(projectYaml, ProjectSchema);
    expect(project.code).toBe("MYAPP");
    expect(project.name).toBe("My App");
    expect(project.status).toBe("active");
  });

  it("AC2: creates epics/ directory", async () => {
    await init({ name: "My App", code: "MYAPP" });

    const epicsDir = path.join(tmp.projectsDir, "MYAPP", "epics");
    expect(fs.existsSync(epicsDir)).toBe(true);
    expect(fs.statSync(epicsDir).isDirectory()).toBe(true);
  });

  it("AC3: updates index.yaml with the new project entry", async () => {
    await init({ name: "My App", code: "MYAPP", description: "Testing" });

    const indexPath = path.join(tmp.projectsDir, "index.yaml");
    expect(fs.existsSync(indexPath)).toBe(true);

    const index = readYaml(indexPath, IndexSchema);
    const entry = index.projects.find((p) => p.code === "MYAPP");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("My App");
    expect(entry!.status).toBe("active");
  });

  it("AC4: throws DuplicateProjectCodeError for duplicate code", async () => {
    await init({ name: "First", code: "DUP" });

    await expect(init({ name: "Second", code: "DUP" })).rejects.toThrow(
      DuplicateProjectCodeError,
    );
  });

  it("AC5: throws ValidationError for lowercase code", async () => {
    await expect(init({ name: "Bad Code", code: "bad" })).rejects.toThrow(
      ValidationError,
    );
  });
});
