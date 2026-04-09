import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { commentAdd } from "../comment.js";
import { reportCreate } from "../report.js";
import { storyAdd, storyUpdate } from "../story.js";
import { work } from "../work.js";
import {
  captureOutput,
  seedEpic,
  seedProject,
  setupTmpDir,
  type CapturedOutput,
  type TmpDirHandle,
} from "../../__tests__/integration-helpers.js";
import { getPmDir, findEpicFile } from "../../lib/codes.js";
import { lockPath, listAtomicWriteTemps, readYaml } from "../../lib/fs.js";
import { PmError } from "../../lib/errors.js";
import { EpicSchema, AgentExecutionReportSchema } from "../../schemas/index.js";

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

function createOrphanTemp(targetPath: string, content = "partial\n"): string {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.pm-write-orphan.tmp`,
  );
  fs.writeFileSync(tempPath, content, "utf8");
  return tempPath;
}

function blockDirectoryWrites(dirPath: string): () => void {
  const originalMode = fs.statSync(dirPath).mode & 0o777;
  fs.chmodSync(dirPath, 0o555);
  return () => {
    fs.chmodSync(dirPath, originalMode);
  };
}

describe("mutation reliability", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;
  let epicCode: string;
  let storyCode: string;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Reliability Test" });
    epicCode = await seedEpic("TEST", { title: "Reliability Epic" });
    await storyAdd(epicCode, {
      title: "Mutation story",
      description: "Exercise mutation recovery paths",
      points: "3",
      priority: "high",
    });
    storyCode = `${epicCode}-S001`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    out.restore();
    tmp.teardown();
  });

  it("keeps story data intact when an epic rewrite fails mid-mutation", async () => {
    const epicFile = findEpicFile(epicCode);
    expect(epicFile).toBeTruthy();
    const restoreWrites = blockDirectoryWrites(path.dirname(epicFile!));

    try {
      await expect(
        storyUpdate(storyCode, { status: "done" }),
      ).rejects.toThrow();
    } finally {
      restoreWrites();
    }

    const epic = readYaml(epicFile!, EpicSchema);
    expect(epic.stories[0]!.status).toBe("backlog");
    expect(listAtomicWriteTemps(epicFile!)).toEqual([]);
  });

  it("recovers orphan temp files before publishing a work-state update", async () => {
    const epicFile = findEpicFile(epicCode);
    expect(epicFile).toBeTruthy();
    const orphanPath = createOrphanTemp(epicFile!);

    await work(storyCode);

    const epic = readYaml(epicFile!, EpicSchema);
    expect(epic.stories[0]!.status).toBe("in_progress");
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(listAtomicWriteTemps(epicFile!)).toEqual([]);
  });

  it("fails cleanly under namespace lock contention without creating partial comments", async () => {
    const commentsDir = path.join(getPmDir(), "comments");
    const indexPath = path.join(commentsDir, "index.yaml");
    const lockFile = createFreshLock(indexPath);

    await expect(
      commentAdd({
        target: storyCode,
        type: "agent",
        content: "contention test comment",
        authorId: "reliability-agent",
      }),
    ).rejects.toBeInstanceOf(PmError);

    await expect(
      commentAdd({
        target: storyCode,
        type: "agent",
        content: "contention test comment",
        authorId: "reliability-agent",
      }),
    ).rejects.toMatchObject({ code: "LOCK_ACQUISITION_FAILED" });

    const commentFiles = fs
      .readdirSync(commentsDir)
      .filter((entry) => entry.endsWith(".yaml"));
    expect(commentFiles).toEqual([]);

    fs.unlinkSync(lockFile);
  });

  it("preserves an existing report when a forced overwrite cannot publish", async () => {
    const reportPath = path.join(
      getPmDir(),
      "reports",
      `${storyCode}-report.yaml`,
    );
    await reportCreate({
      taskId: storyCode,
      agentId: "reliability-agent",
      decisions: ["first report version"],
    });

    const restoreWrites = blockDirectoryWrites(path.dirname(reportPath));

    try {
      await expect(
        reportCreate({
          taskId: storyCode,
          agentId: "reliability-agent",
          decisions: ["second report version"],
          force: true,
        }),
      ).rejects.toThrow();
    } finally {
      restoreWrites();
    }

    const report = readYaml(reportPath, AgentExecutionReportSchema);
    expect(report.decisions[0]?.text).toBe("first report version");
    expect(listAtomicWriteTemps(reportPath)).toEqual([]);
  });
});
