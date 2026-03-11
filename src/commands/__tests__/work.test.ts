import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { work } from "../work.js";
import { storyAdd } from "../story.js";
import { storyUpdate } from "../story.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  seedEpic,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readYaml } from "../../lib/fs.js";
import { EpicSchema } from "../../schemas/index.js";
import { findEpicFile } from "../../lib/codes.js";
import { StoryNotFoundError } from "../../lib/errors.js";

describe("pm work (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;
  let epicCode: string;
  let storyCode: string;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
    epicCode = await seedEpic("TEST", { title: "Work Epic" });
    await storyAdd(epicCode, {
      title: "Implement feature",
      description: "Build the feature",
      points: "3",
      priority: "high",
      criteria: ["Tests pass", "Code reviewed"],
    });
    storyCode = `${epicCode}-S001`;
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  it("AC1: sets story status to in_progress in YAML", async () => {
    await work(storyCode);

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.status).toBe("in_progress");
  });

  it("AC2: console output includes story code, title, and acceptance criteria", async () => {
    // Clear output from setup
    out.restore();
    out = captureOutput();

    await work(storyCode);

    const lines = out.log().join("\n");
    expect(lines).toContain(storyCode);
    expect(lines).toContain("Implement feature");
    expect(lines).toContain("Tests pass");
    expect(lines).toContain("Code reviewed");
  });

  it("AC3: already in_progress prints warning but does not change YAML", async () => {
    // First call marks it in_progress
    await work(storyCode);

    // Clear and call again
    out.restore();
    out = captureOutput();

    await work(storyCode);

    const lines = out.log().join("\n");
    expect(lines).toContain("already in_progress");

    // YAML still in_progress (not reverted)
    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.status).toBe("in_progress");
  });

  it("AC4: done story prints warning and returns without modifying YAML", async () => {
    // Mark the story done first
    await storyUpdate(storyCode, { status: "done" });

    // Clear and call work on it
    out.restore();
    out = captureOutput();

    await work(storyCode);

    const lines = out.log().join("\n");
    expect(lines).toContain("already done");

    // YAML still done
    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.status).toBe("done");
  });

  it("AC5: non-existent story code throws StoryNotFoundError", async () => {
    await expect(work(`${epicCode}-S999`)).rejects.toThrow(StoryNotFoundError);
  });
});
