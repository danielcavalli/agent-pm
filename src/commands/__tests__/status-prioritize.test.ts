import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { ProjectNotFoundError } from "../../lib/errors.js";

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

  it("AC4: status('NONEXISTENT', {}) throws ProjectNotFoundError", async () => {
    await expect(status("NONEXISTENT", {})).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  // ── status: epic visibility ───────────────────────────────────────

  it("AC7: status shows epics with no stories in the all-projects view", async () => {
    // Create an empty epic (no stories)
    const emptyEpicCode = await seedEpic("TEST", { title: "Empty Epic" });

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain(emptyEpicCode);
    expect(lines).toContain("Empty Epic");
    expect(lines).toContain("(no stories)");
  });

  it("AC8: status shows epics with all stories done in the all-projects view", async () => {
    // Mark both stories as done
    await storyUpdate(`${epicCode}-S001`, { status: "done" });
    await storyUpdate(`${epicCode}-S002`, { status: "done" });

    out.restore();
    out = captureOutput();

    await status(undefined, {});

    const lines = out.log().join("\n");
    expect(lines).toContain(epicCode);
    // Should show the done count
    expect(lines).toContain("(2/2)");
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

  it("AC11: all-projects JSON view includes full epic data with stories", async () => {
    out.restore();
    out = captureOutput();

    await status(undefined, { json: true });

    const jsonStr = out.log().join("\n");
    const data = JSON.parse(jsonStr);

    expect(data).toHaveProperty("projects");
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].code).toBe("TEST");
    expect(data.projects[0]).toHaveProperty("summary");
    expect(data.projects[0].summary.epic_count).toBe(1);
    expect(data.projects[0].summary.story_count).toBe(2);
    expect(data.projects[0]).toHaveProperty("epics");
    expect(data.projects[0].epics).toHaveLength(1);
    expect(data.projects[0].epics[0].code).toBe(epicCode);
    expect(data.projects[0].epics[0].stories).toHaveLength(2);
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
