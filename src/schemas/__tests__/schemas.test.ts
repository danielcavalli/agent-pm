import { describe, it, expect } from "vitest";
import { ProjectSchema } from "../project.schema.js";
import { EpicSchema } from "../epic.schema.js";
import { StorySchema, StoryPointsSchema } from "../story.schema.js";

// ── Project schema ────────────────────────────────────────────────────────────

describe("ProjectSchema", () => {
  const validProject = {
    code: "PM",
    name: "Project Management for AI Agents",
    description: "A file-based project management tool.",
    vision: "Enable AI agents to track projects.",
    status: "active",
    created_at: "2026-03-09",
    tech_stack: ["TypeScript", "Node.js"],
    architecture: {
      pattern: "cli-tool",
      storage: "yaml-files",
      primary_interface: "cli",
    },
    notes: "",
  };

  it("validates a correct project fixture", () => {
    const result = ProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it("rejects a project with lowercase code", () => {
    const result = ProjectSchema.safeParse({ ...validProject, code: "pm" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/2-6 uppercase/i);
    }
  });

  it("rejects a project with code that has numbers", () => {
    const result = ProjectSchema.safeParse({ ...validProject, code: "PM123" });
    expect(result.success).toBe(false);
  });

  it("rejects a project with code too short (1 char)", () => {
    const result = ProjectSchema.safeParse({ ...validProject, code: "P" });
    expect(result.success).toBe(false);
  });

  it("rejects a project with code too long (7 chars)", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      code: "TOOLONG",
    });
    expect(result.success).toBe(false);
  });

  it("accepts code of exactly 2 chars", () => {
    const result = ProjectSchema.safeParse({ ...validProject, code: "PM" });
    expect(result.success).toBe(true);
  });

  it("accepts code of exactly 6 chars", () => {
    const result = ProjectSchema.safeParse({ ...validProject, code: "SIXSIX" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      status: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "paused", "complete", "archived"]) {
      const result = ProjectSchema.safeParse({ ...validProject, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid date format", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      created_at: "09/03/2026",
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional fields", () => {
    const minimal = {
      code: "PM",
      name: "Test",
      status: "active",
      created_at: "2026-01-01",
    };
    const result = ProjectSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
      expect(result.data.tech_stack).toEqual([]);
      expect(result.data.notes).toBe("");
    }
  });
});

// ── Story schema ──────────────────────────────────────────────────────────────

describe("StorySchema", () => {
  const validStory = {
    id: "S001",
    code: "PM-E001-S001",
    title: "Initialize TypeScript project",
    description: "Set up the project structure.",
    acceptance_criteria: ["Build works", "Tests pass"],
    status: "backlog",
    priority: "high",
    story_points: 3,
    notes: "",
  };

  it("validates a correct story fixture", () => {
    const result = StorySchema.safeParse(validStory);
    expect(result.success).toBe(true);
  });

  it("rejects invalid story_points (4 is not in Fibonacci set)", () => {
    const result = StorySchema.safeParse({ ...validStory, story_points: 4 });
    expect(result.success).toBe(false);
  });

  it("accepts all valid story_points values", () => {
    for (const points of [1, 2, 3, 5, 8]) {
      const result = StorySchema.safeParse({
        ...validStory,
        story_points: points,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects story_points 0", () => {
    const result = StorySchema.safeParse({ ...validStory, story_points: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = StorySchema.safeParse({ ...validStory, status: "todo" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid priority", () => {
    const result = StorySchema.safeParse({
      ...validStory,
      priority: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid story id format", () => {
    const result = StorySchema.safeParse({ ...validStory, id: "Story1" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid story code format", () => {
    const result = StorySchema.safeParse({
      ...validStory,
      code: "pm-e001-s001",
    });
    expect(result.success).toBe(false);
  });
});

describe("StoryPointsSchema", () => {
  it("accepts 1", () =>
    expect(StoryPointsSchema.safeParse(1).success).toBe(true));
  it("accepts 2", () =>
    expect(StoryPointsSchema.safeParse(2).success).toBe(true));
  it("accepts 3", () =>
    expect(StoryPointsSchema.safeParse(3).success).toBe(true));
  it("accepts 5", () =>
    expect(StoryPointsSchema.safeParse(5).success).toBe(true));
  it("accepts 8", () =>
    expect(StoryPointsSchema.safeParse(8).success).toBe(true));
  it("rejects 4", () =>
    expect(StoryPointsSchema.safeParse(4).success).toBe(false));
  it("rejects 6", () =>
    expect(StoryPointsSchema.safeParse(6).success).toBe(false));
  it("rejects 0", () =>
    expect(StoryPointsSchema.safeParse(0).success).toBe(false));
  it("rejects 13", () =>
    expect(StoryPointsSchema.safeParse(13).success).toBe(false));
});

// ── Epic schema ───────────────────────────────────────────────────────────────

describe("EpicSchema", () => {
  const validStory = {
    id: "S001",
    code: "PM-E001-S001",
    title: "Story One",
    description: "Desc",
    acceptance_criteria: ["Criterion 1"],
    status: "backlog",
    priority: "high",
    story_points: 3,
    notes: "",
  };

  const validStory2 = {
    id: "S002",
    code: "PM-E001-S002",
    title: "Story Two",
    description: "Desc",
    acceptance_criteria: [],
    status: "done",
    priority: "medium",
    story_points: 2,
    notes: "",
  };

  const validEpic = {
    id: "E001",
    code: "PM-E001",
    title: "Foundation & Core Infrastructure",
    description: "Establish the foundation.",
    status: "in_progress",
    priority: "high",
    created_at: "2026-03-09",
    stories: [validStory, validStory2],
  };

  it("validates a correct epic fixture with 2+ stories", () => {
    const result = EpicSchema.safeParse(validEpic);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories).toHaveLength(2);
    }
  });

  it("validates an epic with empty stories array", () => {
    const result = EpicSchema.safeParse({ ...validEpic, stories: [] });
    expect(result.success).toBe(true);
  });

  it("rejects invalid epic id format", () => {
    const result = EpicSchema.safeParse({ ...validEpic, id: "Epic1" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid epic code format", () => {
    const result = EpicSchema.safeParse({ ...validEpic, code: "pm-e001" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid epic status", () => {
    const result = EpicSchema.safeParse({ ...validEpic, status: "todo" });
    expect(result.success).toBe(false);
  });

  it("applies default empty stories array", () => {
    const noStories = { ...validEpic };
    // @ts-expect-error testing missing field
    delete noStories.stories;
    const result = EpicSchema.safeParse(noStories);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories).toEqual([]);
    }
  });

  it("rejects duplicate story IDs and reports Duplicate story ID in the issue message", () => {
    const duplicateStory = { ...validStory, code: "PM-E001-S003" };
    const result = EpicSchema.safeParse({
      ...validEpic,
      stories: [validStory, duplicateStory],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dupIssue = result.error.issues.find((i) =>
        i.message.includes("Duplicate story ID"),
      );
      expect(dupIssue).toBeDefined();
      expect(dupIssue!.message).toBe("Duplicate story ID: S001");
      expect(dupIssue!.path).toContain("stories");
      expect(dupIssue!.path).toContain(1);
      expect(dupIssue!.path).toEqual(["stories", 1, "id"]);
    }
  });

  it("accepts an epic with unique story IDs (S001 and S002)", () => {
    const result = EpicSchema.safeParse({
      ...validEpic,
      stories: [validStory, validStory2],
    });
    expect(result.success).toBe(true);
  });
});
