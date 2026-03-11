import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { epicAdd, epicList } from "../epic.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readYaml } from "../../lib/fs.js";
import { EpicSchema } from "../../schemas/index.js";
import { ProjectNotFoundError, ValidationError } from "../../lib/errors.js";

describe("pm epic add / epic list (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  // ── epicAdd ─────────────────────────────────────────────────────────

  it("AC1: creates E001-<slug>.yaml with correct id, code, title, and status", async () => {
    await epicAdd("TEST", {
      title: "Auth Flow",
      description: "Authentication",
    });

    const epicsDir = path.join(tmp.projectsDir, "TEST", "epics");
    const files = fs.readdirSync(epicsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^E001-auth-flow\.yaml$/);

    const epicPath = path.join(epicsDir, files[0]);
    const epic = readYaml(epicPath, EpicSchema);
    expect(epic.id).toBe("E001");
    expect(epic.code).toBe("TEST-E001");
    expect(epic.title).toBe("Auth Flow");
    expect(epic.status).toBe("backlog");
  });

  it("AC2: second epicAdd assigns E002", async () => {
    await epicAdd("TEST", { title: "First Epic" });
    await epicAdd("TEST", { title: "Second Epic" });

    const epicsDir = path.join(tmp.projectsDir, "TEST", "epics");
    const files = fs.readdirSync(epicsDir).sort();
    expect(files.length).toBe(2);
    expect(files[0]).toMatch(/^E001-/);
    expect(files[1]).toMatch(/^E002-/);

    const epic2 = readYaml(path.join(epicsDir, files[1]), EpicSchema);
    expect(epic2.id).toBe("E002");
    expect(epic2.code).toBe("TEST-E002");
  });

  it("AC3: invalid priority throws ValidationError", async () => {
    await expect(
      epicAdd("TEST", { title: "Bad Priority", priority: "urgent" }),
    ).rejects.toThrow(ValidationError);
  });

  it("AC4: non-existent project throws ProjectNotFoundError", async () => {
    await expect(epicAdd("NOPE", { title: "Orphan Epic" })).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  // ── epicList ────────────────────────────────────────────────────────

  it("AC5: epicList output includes epic code and title", async () => {
    await epicAdd("TEST", { title: "Alpha Feature", priority: "high" });
    await epicAdd("TEST", { title: "Beta Feature", priority: "low" });

    // Clear captured output from epicAdd calls
    out.restore();
    out = captureOutput();

    await epicList("TEST");

    const lines = out.log().join("\n");
    expect(lines).toContain("TEST-E001");
    expect(lines).toContain("Alpha Feature");
    expect(lines).toContain("TEST-E002");
    expect(lines).toContain("Beta Feature");
  });

  it("AC6: epicList prints 'No epics found' when project has no epics", async () => {
    // Clear captured output from seedProject
    out.restore();
    out = captureOutput();

    await epicList("TEST");

    const lines = out.log().join("\n");
    expect(lines).toContain("No epics found");
  });
});
