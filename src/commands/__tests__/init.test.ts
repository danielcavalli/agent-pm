import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { init } from "../init.js";
import { readYaml } from "../../lib/fs.js";
import { ProjectSchema, IndexSchema } from "../../schemas/index.js";
import { ValidationError, PmAlreadyExistsError } from "../../lib/errors.js";

describe("pm init (integration)", () => {
  let tmpDir: string;
  let pmDir: string;
  let originalPmHome: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    originalPmHome = process.env["PM_HOME"];
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-init-test-"));
    pmDir = path.join(tmpDir, ".pm");
    process.env["PM_HOME"] = pmDir;
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = originalPmHome;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("AC1: creates .pm/ in cwd", async () => {
    await init({
      name: "My App",
      code: "MYAPP",
      description: "A test app",
    });

    expect(fs.existsSync(pmDir)).toBe(true);
    expect(fs.statSync(pmDir).isDirectory()).toBe(true);
  });

  it("AC2: works without project code, deriving from directory name", async () => {
    await init({ name: "My App" });

    const projectYaml = path.join(pmDir, "project.yaml");
    expect(fs.existsSync(projectYaml)).toBe(true);

    const project = readYaml(projectYaml, ProjectSchema);
    expect(project.name).toBe("My App");
    expect(project.status).toBe("active");
  });

  it("AC3: works with explicit code", async () => {
    await init({ name: "My App", code: "MYAPP" });

    const projectYaml = path.join(pmDir, "project.yaml");
    expect(fs.existsSync(projectYaml)).toBe(true);

    const project = readYaml(projectYaml, ProjectSchema);
    expect(project.code).toBe("MYAPP");
    expect(project.name).toBe("My App");
  });

  it("AC4: errors if .pm/ already exists", async () => {
    await init({ name: "First", code: "FIRST" });

    await expect(init({ name: "Second", code: "SECOND" })).rejects.toThrow(
      PmAlreadyExistsError,
    );
  });

  it("AC5: created .pm/ contains project.yaml and epics/ subdirectory", async () => {
    await init({ name: "My App", code: "MYAPP" });

    const projectYaml = path.join(pmDir, "project.yaml");
    const epicsDir = path.join(pmDir, "epics");

    expect(fs.existsSync(projectYaml)).toBe(true);
    expect(fs.existsSync(epicsDir)).toBe(true);
    expect(fs.statSync(epicsDir).isDirectory()).toBe(true);
  });

  it("throws ValidationError for lowercase code", async () => {
    await expect(init({ name: "Bad Code", code: "bad" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("creates index.yaml with the project entry", async () => {
    await init({
      name: "My App",
      code: "MYAPP",
      description: "Testing",
    });

    const indexPath = path.join(pmDir, "index.yaml");
    expect(fs.existsSync(indexPath)).toBe(true);

    const index = readYaml(indexPath, IndexSchema);
    expect(index.code).toBe("MYAPP");
    expect(index.name).toBe("My App");
    expect(index.status).toBe("active");
  });
});
