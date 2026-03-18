import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { status } from "../status.js";
import { prioritize } from "../prioritize.js";
import { storyAdd, storyUpdate } from "../story.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  seedEpic,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";

describe("pm status / pm prioritize (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;
  let epicCode: string;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
    epicCode = await seedEpic("TEST", { title: "Core Features" });
    await storyAdd(epicCode, {
      title: "Build API",
      points: "3",
      priority: "high",
    });
    await storyAdd(epicCode, {
      title: "Build UI",
      points: "5",
      priority: "medium",
    });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  // ── status ──────────────────────────────────────────────────────────

  it("AC1: status() with no args prints project code, name, and epic breakdown", async () => {
    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain("TEST");
    expect(lines).toContain("Test Project");
    // Should now include per-epic breakdown
    expect(lines).toContain(epicCode);
  });

  it("AC2: status('TEST', {}) includes epic code and at least one story code", async () => {
    out.restore();
    out = captureOutput();

    await status("TEST", {});

    const lines = out.log().join("\n");
    expect(lines).toContain(epicCode);
    expect(lines).toContain(`${epicCode}-S001`);
  });

  it("AC3: status('TEST', { json: true }) outputs valid JSON with project, epics, next_recommended", async () => {
    out.restore();
    out = captureOutput();

    await status("TEST", { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    expect(data).toHaveProperty("project");
    expect(data.project.code).toBe("TEST");
    expect(data).toHaveProperty("epics");
    expect(Array.isArray(data.epics)).toBe(true);
    expect(data.epics.length).toBeGreaterThan(0);
    expect(data).toHaveProperty("next_recommended");
    expect(data.next_recommended).not.toBeNull();
  });

  it("AC4: throws helpful error when no project.yaml exists", async () => {
    // Remove the project.yaml to simulate no project
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    fs.unlinkSync(projectYaml);

    await expect(status("TEST", {})).rejects.toThrow("No project.yaml found");
  });

  // ── status: epic visibility ───────────────────────────────────────

  it("AC7: status shows epics with no stories in completed section", async () => {
    // Create an empty epic and mark it as done by editing the file
    const emptyEpicCode = await seedEpic("TEST", { title: "Empty Epic" });
    const { readYaml, writeYaml } = await import("../../lib/fs.js");
    const { EpicSchema } = await import("../../schemas/index.js");
    const { getPmDir } = await import("../../lib/codes.js");
    const pmDir = getPmDir();
    const epicPath = path.join(pmDir, "epics", "E002-empty-epic.yaml");
    const epic = readYaml(epicPath, EpicSchema);
    epic.status = "done";
    writeYaml(epicPath, epic);

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain(emptyEpicCode);
    expect(lines).toContain("Empty Epic");
    expect(lines).toContain("(no stories)");
  });

  it("AC8: status shows epics with all stories done in completed section", async () => {
    // Mark both stories as done
    await storyUpdate(`${epicCode}-S001`, { status: "done" });
    await storyUpdate(`${epicCode}-S002`, { status: "done" });

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain(epicCode);
    // Should show the done count in completed section
    expect(lines).toContain("(2/2 stories)");
  });

  it("AC9: single-project view separates active from completed epics", async () => {
    // Mark both stories as done so the epic becomes "completed"
    await storyUpdate(`${epicCode}-S001`, { status: "done" });
    await storyUpdate(`${epicCode}-S002`, { status: "done" });

    // Add an epic with backlog stories (active)
    const activeEpicCode = await seedEpic("TEST", { title: "Active Work" });
    await storyAdd(activeEpicCode, {
      title: "New Task",
      points: "2",
      priority: "high",
    });

    out.restore();
    out = captureOutput();

    await status("TEST", {});

    const lines = out.log().join("\n");
    // The active epic should be under "Active Epics" section
    expect(lines).toContain("Active Epics");
    expect(lines).toContain("Active Work");
    // The completed epic should be under "Completed / Closed Epics" section
    expect(lines).toContain("Completed / Closed Epics");
    expect(lines).toContain("Core Features");
  });

  it("AC10: single-project view shows empty epics (no stories) as active", async () => {
    const emptyEpicCode = await seedEpic("TEST", { title: "Needs Refinement" });

    out.restore();
    out = captureOutput();

    await status("TEST", {});

    const lines = out.log().join("\n");
    // Active section should contain the empty epic (it needs refinement)
    expect(lines).toContain("Active Epics");
    expect(lines).toContain("Needs Refinement");
  });

  it("AC11: JSON view includes full epic data with stories", async () => {
    out.restore();
    out = captureOutput();

    await status(undefined, { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    expect(data).toHaveProperty("project");
    expect(data.project.code).toBe("TEST");
    expect(data).toHaveProperty("summary");
    expect(data.summary.epic_count).toBe(1);
    expect(data.summary.story_count).toBe(2);
    expect(data).toHaveProperty("epics");
    expect(data.epics).toHaveLength(1);
    expect(data.epics[0].code).toBe(epicCode);
    expect(data.epics[0].stories).toHaveLength(2);
  });

  it("AC12: single-project JSON view includes epic description field", async () => {
    out.restore();
    out = captureOutput();

    await status("TEST", { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    expect(data.epics).toHaveLength(1);
    expect(data.epics[0]).toHaveProperty("description");
    expect(data.epics[0]).toHaveProperty("code");
    expect(data.epics[0]).toHaveProperty("title");
    expect(data.epics[0]).toHaveProperty("status");
    expect(data.epics[0]).toHaveProperty("priority");
    expect(data.epics[0]).toHaveProperty("stories");
  });

  // ── status: resolution_type badges ──────────────────────────────────

  /**
   * Helper to inject resolution_type into a story by directly editing the epic YAML.
   * We must bypass storyAdd since it blocks resolution_type.
   */
  async function setResolutionType(
    storyCode: string,
    resolutionType: "conflict" | "gap",
  ) {
    const { readYaml, writeYaml } = await import("../../lib/fs.js");
    const { EpicSchema } = await import("../../schemas/index.js");
    const { getPmDir, findEpicFile, resolveStoryCode } = await import(
      "../../lib/codes.js"
    );
    const parsed = resolveStoryCode(storyCode);
    const epicFile = findEpicFile(parsed.epicCode);
    if (!epicFile) throw new Error(`Epic not found: ${parsed.epicCode}`);
    const epic = readYaml(epicFile, EpicSchema);
    const fullCode = `${parsed.projectCode}-${parsed.epicId}-${parsed.storyId}`;
    const story = epic.stories.find((s: any) => s.code === fullCode);
    if (!story) throw new Error(`Story not found: ${fullCode}`);
    story.resolution_type = resolutionType;
    writeYaml(epicFile, epic);
  }

  it("AC-RT1: StoryData type includes resolution_type field (conflict story shows badge)", async () => {
    await setResolutionType(`${epicCode}-S001`, "conflict");

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain("[CONFLICT]");
  });

  it("AC-RT2: status output shows a conflict badge for resolution_type: conflict", async () => {
    await setResolutionType(`${epicCode}-S001`, "conflict");

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    // The conflict badge should appear near the story code
    expect(lines).toContain("[CONFLICT]");
    expect(lines).toContain(`${epicCode}-S001`);
  });

  it("AC-RT3: status output shows a gap badge for resolution_type: gap", async () => {
    await setResolutionType(`${epicCode}-S002`, "gap");

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain("[GAP]");
    expect(lines).toContain(`${epicCode}-S002`);
  });

  it("AC-RT4: regular stories without resolution_type display normally (no badges)", async () => {
    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain(`${epicCode}-S001`);
    expect(lines).toContain(`${epicCode}-S002`);
    expect(lines).not.toContain("[CONFLICT]");
    expect(lines).not.toContain("[GAP]");
  });

  it("AC-RT5: JSON output includes resolution_type when present", async () => {
    await setResolutionType(`${epicCode}-S001`, "conflict");
    await setResolutionType(`${epicCode}-S002`, "gap");

    out.restore();
    out = captureOutput();

    await status(undefined, { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    const stories = data.epics[0].stories;
    const s001 = stories.find((s: any) => s.code === `${epicCode}-S001`);
    const s002 = stories.find((s: any) => s.code === `${epicCode}-S002`);

    expect(s001.resolution_type).toBe("conflict");
    expect(s002.resolution_type).toBe("gap");
  });

  it("AC-RT5b: JSON output omits resolution_type when not present", async () => {
    out.restore();
    out = captureOutput();

    await status(undefined, { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    const stories = data.epics[0].stories;
    for (const story of stories) {
      expect(story).not.toHaveProperty("resolution_type");
    }
  });

  // ── prioritize ──────────────────────────────────────────────────────

  it("AC5: prioritize('TEST', {}) output includes strategy label and a backlog story code", async () => {
    out.restore();
    out = captureOutput();

    await prioritize("TEST", {});

    const lines = out.log().join("\n");
    expect(lines).toContain("Strategy");
    expect(lines).toContain(`${epicCode}-S001`);
  });

  it("AC6: prioritize with epic filter includes epic code and story codes", async () => {
    out.restore();
    out = captureOutput();

    await prioritize("TEST", { epic: epicCode });

    const lines = out.log().join("\n");
    expect(lines).toContain(epicCode);
    expect(lines).toContain(`${epicCode}-S001`);
    expect(lines).toContain(`${epicCode}-S002`);
  });
});
