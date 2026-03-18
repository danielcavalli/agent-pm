import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { storyAdd, storyList, storyUpdate } from "../story.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  seedEpic,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { readYaml, writeYaml } from "../../lib/fs.js";
import { EpicSchema } from "../../schemas/index.js";
import { findEpicFile, resolveStoryCode } from "../../lib/codes.js";
import { ValidationError, StoryNotFoundError } from "../../lib/errors.js";

describe("pm story add / list / update (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;
  let epicCode: string;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
    epicCode = await seedEpic("TEST", { title: "Test Epic" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  // ── storyAdd ────────────────────────────────────────────────────────

  it("AC1: appends story to epic YAML with correct id, code, title, points, status", async () => {
    await storyAdd(epicCode, {
      title: "Add login",
      description: "Login form",
      points: "5",
      priority: "high",
    });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories.length).toBe(1);

    const story = epic.stories[0]!;
    expect(story.id).toBe("S001");
    expect(story.code).toBe(`${epicCode}-S001`);
    expect(story.title).toBe("Add login");
    expect(story.story_points).toBe(5);
    expect(story.status).toBe("backlog");
  });

  it("AC2: persists acceptance_criteria array entries", async () => {
    await storyAdd(epicCode, {
      title: "With criteria",
      criteria: ["Unit tests pass", "Code reviewed"],
    });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    const story = epic.stories[0]!;
    expect(story.acceptance_criteria).toEqual([
      "Unit tests pass",
      "Code reviewed",
    ]);
  });

  it("AC3: invalid points value throws ValidationError", async () => {
    await expect(
      storyAdd(epicCode, { title: "Bad Points", points: "4" }),
    ).rejects.toThrow(ValidationError);
  });

  it("AC3b: storyAdd rejects resolution_type as it's reserved for consolidation agent", async () => {
    await expect(
      storyAdd(epicCode, {
        title: "Conflict Story",
        resolution_type: "conflict",
      }),
    ).rejects.toThrow("resolution_type is reserved");
  });

  // ── storyList ───────────────────────────────────────────────────────

  it("AC4: storyList output includes story code, title, status, and points", async () => {
    await storyAdd(epicCode, {
      title: "Story Alpha",
      points: "2",
      priority: "high",
    });
    await storyAdd(epicCode, {
      title: "Story Beta",
      points: "8",
      priority: "low",
    });

    // Clear output from storyAdd calls
    out.restore();
    out = captureOutput();

    await storyList(epicCode);

    const lines = out.log().join("\n");
    expect(lines).toContain(`${epicCode}-S001`);
    expect(lines).toContain("Story Alpha");
    expect(lines).toContain(`${epicCode}-S002`);
    expect(lines).toContain("Story Beta");
    expect(lines).toContain("backlog");
    // Points appear as string in tabular output
    expect(lines).toContain("2");
    expect(lines).toContain("8");
  });

  // ── storyUpdate ─────────────────────────────────────────────────────

  it("AC5: storyUpdate changes status to done in YAML", async () => {
    await storyAdd(epicCode, { title: "Finish me", points: "1" });

    const storyCode = `${epicCode}-S001`;
    await storyUpdate(storyCode, { status: "done" });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.status).toBe("done");
  });

  it("AC6: storyUpdate with invalid status throws ValidationError", async () => {
    await storyAdd(epicCode, { title: "Some story", points: "3" });

    const storyCode = `${epicCode}-S001`;
    await expect(
      storyUpdate(storyCode, { status: "invalid_status" }),
    ).rejects.toThrow(ValidationError);
  });

  it("AC7: storyUpdate for non-existent story throws StoryNotFoundError", async () => {
    await expect(
      storyUpdate(`${epicCode}-S999`, { status: "done" }),
    ).rejects.toThrow(StoryNotFoundError);
  });

  // ── depends_on ──────────────────────────────────────────────────────

  it("AC8: storyAdd persists depends_on array in YAML", async () => {
    // Create the dependency target first
    await storyAdd(epicCode, { title: "Dep Target", points: "1" });
    const depCode = `${epicCode}-S001`;

    // Create a story that depends on S001
    await storyAdd(epicCode, {
      title: "Dependent Story",
      points: "3",
      dependsOn: [depCode],
    });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    const story = epic.stories[1]!;
    expect(story.depends_on).toEqual([depCode]);
  });

  it("AC9: storyAdd defaults depends_on to empty array when not provided", async () => {
    await storyAdd(epicCode, { title: "No Deps", points: "2" });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.depends_on).toEqual([]);
  });

  it("AC10: storyUpdate with --depends-on replaces the depends_on list", async () => {
    await storyAdd(epicCode, { title: "Update Deps", points: "3" });
    const storyCode = `${epicCode}-S001`;

    await storyUpdate(storyCode, {
      dependsOn: ["PM-E002-S001", "PM-E003-S001"],
    });

    const epicFile = findEpicFile(epicCode)!;
    const epic = readYaml(epicFile, EpicSchema);
    expect(epic.stories[0]!.depends_on).toEqual([
      "PM-E002-S001",
      "PM-E003-S001",
    ]);
  });

  it("AC11: storyList with --deps flag shows dependency codes", async () => {
    await storyAdd(epicCode, {
      title: "With Dep",
      points: "2",
      dependsOn: ["PM-E002-S001"],
    });

    out.restore();
    out = captureOutput();

    await storyList(epicCode, { deps: true });

    const lines = out.log().join("\n");
    expect(lines).toContain("Depends On");
    expect(lines).toContain("PM-E002-S001");
  });

  it("AC12: storyList without --deps flag does not show Depends On header", async () => {
    await storyAdd(epicCode, {
      title: "With Dep Hidden",
      points: "2",
      dependsOn: ["PM-E002-S001"],
    });

    out.restore();
    out = captureOutput();

    await storyList(epicCode);

    const lines = out.log().join("\n");
    expect(lines).not.toContain("Depends On");
  });

  // ── --type filter ─────────────────────────────────────────────────

  /**
   * Helper to inject resolution_type into a story by directly editing the epic YAML.
   * We must bypass storyAdd since it blocks resolution_type.
   */
  function setResolutionType(
    storyCode: string,
    resolutionType: "conflict" | "gap",
  ) {
    const parsed = resolveStoryCode(storyCode);
    const epicFile = findEpicFile(parsed.epicCode);
    if (!epicFile) throw new Error(`Epic not found: ${parsed.epicCode}`);
    const epic = readYaml(epicFile, EpicSchema);
    const fullCode = `${parsed.projectCode}-${parsed.epicId}-${parsed.storyId}`;
    const story = epic.stories.find((s: any) => s.code === fullCode);
    if (!story) throw new Error(`Story not found: ${fullCode}`);
    (story as any).resolution_type = resolutionType;
    writeYaml(epicFile, epic);
  }

  it("AC13: storyList --type conflict shows only conflict stories", async () => {
    await storyAdd(epicCode, { title: "Regular Story", points: "2" });
    await storyAdd(epicCode, { title: "Conflict Story", points: "3" });
    await storyAdd(epicCode, { title: "Gap Story", points: "1" });

    setResolutionType(`${epicCode}-S002`, "conflict");
    setResolutionType(`${epicCode}-S003`, "gap");

    out.restore();
    out = captureOutput();

    await storyList(epicCode, { type: "conflict" });

    const lines = out.log().join("\n");
    expect(lines).toContain("Conflict Story");
    expect(lines).not.toContain("Regular Story");
    expect(lines).not.toContain("Gap Story");
  });

  it("AC14: storyList --type gap shows only gap stories", async () => {
    await storyAdd(epicCode, { title: "Regular Story", points: "2" });
    await storyAdd(epicCode, { title: "Conflict Story", points: "3" });
    await storyAdd(epicCode, { title: "Gap Story", points: "1" });

    setResolutionType(`${epicCode}-S002`, "conflict");
    setResolutionType(`${epicCode}-S003`, "gap");

    out.restore();
    out = captureOutput();

    await storyList(epicCode, { type: "gap" });

    const lines = out.log().join("\n");
    expect(lines).toContain("Gap Story");
    expect(lines).not.toContain("Regular Story");
    expect(lines).not.toContain("Conflict Story");
  });

  it("AC15: storyList without --type shows all stories including resolution tasks", async () => {
    await storyAdd(epicCode, { title: "Regular Story", points: "2" });
    await storyAdd(epicCode, { title: "Conflict Story", points: "3" });
    await storyAdd(epicCode, { title: "Gap Story", points: "1" });

    setResolutionType(`${epicCode}-S002`, "conflict");
    setResolutionType(`${epicCode}-S003`, "gap");

    out.restore();
    out = captureOutput();

    await storyList(epicCode);

    const lines = out.log().join("\n");
    expect(lines).toContain("Regular Story");
    expect(lines).toContain("Conflict Story");
    expect(lines).toContain("Gap Story");
  });

  it("AC16: storyList --type with invalid value throws ValidationError", async () => {
    await expect(
      storyList(epicCode, { type: "invalid" }),
    ).rejects.toThrow(ValidationError);
  });
});
