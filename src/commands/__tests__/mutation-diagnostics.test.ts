import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createProgram } from "../../contracts/cli-surface.js";
import {
  captureOutput,
  seedEpic,
  seedProject,
  setupTmpDir,
  type CapturedOutput,
  type TmpDirHandle,
} from "../../__tests__/integration-helpers.js";
import { findEpicFile, getPmDir } from "../../lib/codes.js";
import { lockPath } from "../../lib/fs.js";
import { storyAdd } from "../story.js";

function makeProgram() {
  return createProgram("test", (_contract, fn) => fn);
}

function createOrphanTemp(targetPath: string, content = "partial\n"): string {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.pm-write-orphan.tmp`,
  );
  fs.writeFileSync(tempPath, content, "utf8");
  return tempPath;
}

function createFreshLock(targetPath: string): string {
  const lockFile = lockPath(targetPath);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(
    lockFile,
    JSON.stringify({ pid: 99999, created_at: new Date().toISOString() }),
    "utf8",
  );
  return lockFile;
}

describe("pm mutation diagnostics", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;
  let storyCode: string;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Mutation Diagnostics Test" });
    const epicCode = await seedEpic("TEST", { title: "Diagnostics Epic" });
    await storyAdd(epicCode, {
      title: "Diagnostics Story",
      description: "Exercise mutation anomaly diagnostics",
      points: "3",
      priority: "medium",
    });
    storyCode = `${epicCode}-S001`;
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  it("lists recent mutation failures, warnings, and lock contention in concise mode", async () => {
    const epicFile = findEpicFile("TEST-E001");
    expect(epicFile).toBeTruthy();
    const orphanPath = createOrphanTemp(epicFile!);

    await makeProgram().parseAsync(["node", "pm", "work", storyCode]);
    expect(fs.existsSync(orphanPath)).toBe(false);

    const commentsDir = path.join(getPmDir(), "comments");
    const indexPath = path.join(commentsDir, "index.yaml");
    const heldLock = createFreshLock(indexPath);

    await expect(
      makeProgram().parseAsync([
        "node",
        "pm",
        "comment",
        "add",
        "--target",
        storyCode,
        "--type",
        "agent",
        "--content",
        "lock contention sample",
        "--author-id",
        "mutation-diagnostics-test",
      ]),
    ).rejects.toMatchObject({ code: "LOCK_ACQUISITION_FAILED" });

    fs.unlinkSync(heldLock);

    await expect(
      makeProgram().parseAsync(["node", "pm", "story", "update", storyCode]),
    ).rejects.toThrow("At least one of --status, --priority, or --depends-on");

    out.restore();
    out = captureOutput();

    await makeProgram().parseAsync([
      "node",
      "pm",
      "mutation",
      "diagnostics",
      "--limit",
      "5",
    ]);

    const rendered = out.log().join("\n");
    expect(rendered).toContain("Recent mutation anomalies");
    expect(rendered).toContain("lock_contention");
    expect(rendered).toContain("warning");
    expect(rendered).toContain("failure");
    expect(rendered).toContain("pm comment add");
    expect(rendered).toContain(epicFile!);
  });

  it("supports detailed mode with timestamp, operation id, command, and path fields", async () => {
    const epicFile = findEpicFile("TEST-E001");
    expect(epicFile).toBeTruthy();
    createOrphanTemp(epicFile!);

    await makeProgram().parseAsync(["node", "pm", "work", storyCode]);

    out.restore();
    out = captureOutput();

    await makeProgram().parseAsync([
      "node",
      "pm",
      "mutation",
      "diagnostics",
      "--detailed",
      "--limit",
      "1",
    ]);

    const rendered = out.log().join("\n");
    expect(rendered).toContain("Timestamp:");
    expect(rendered).toContain("Command:");
    expect(rendered).toContain("Path:");
    expect(rendered).toContain("pm work");
    expect(rendered).toContain(epicFile!);
  });
});
