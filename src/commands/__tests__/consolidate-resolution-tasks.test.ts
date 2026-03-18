import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  routeOutput,
  addResolutionStory,
  resolveResolutionPriority,
} from "../consolidate-output.js";
import type { SynthesisResult } from "../consolidate.js";
import type { ConflictPair } from "../structural-dedup.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  seedEpic,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { resetProjectCodeCache } from "../../lib/codes.js";

/**
 * Read all stories across all epic YAML files in the .pm/epics directory.
 */
function readAllStories(
  projectsDir: string,
): Array<Record<string, unknown>> {
  const epicsDir = path.join(projectsDir, "epics");
  if (!fs.existsSync(epicsDir)) return [];

  const stories: Array<Record<string, unknown>> = [];
  const files = fs.readdirSync(epicsDir);
  for (const file of files) {
    if (!file.endsWith(".yaml")) continue;
    const filePath = path.join(epicsDir, file);
    try {
      const content = yaml.load(
        fs.readFileSync(filePath, "utf8"),
      ) as Record<string, unknown>;
      const epicStories = content.stories as Array<Record<string, unknown>>;
      if (Array.isArray(epicStories)) {
        stories.push(...epicStories);
      }
    } catch {
      // skip
    }
  }
  return stories;
}

describe("conflict and gap resolution tasks (E042-S006)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    resetProjectCodeCache();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
    resetProjectCodeCache();
  });

  // ── AC1: Contradicting decisions create stories with resolution_type: conflict ──

  describe("AC1: Contradicting decisions create conflict resolution stories", () => {
    it("creates a story with resolution_type conflict from a ConflictPair", async () => {
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const conflicts: ConflictPair[] = [
        {
          itemA: {
            reportId: "TEST-E001-S001",
            category: "decision",
            text: "Use Redux for state management",
            normalizedText: "use redux for state management",
          },
          itemB: {
            reportId: "TEST-E001-S002",
            category: "decision",
            text: "Do not use Redux for state management",
            normalizedText: "do not use redux for state management",
          },
          reason:
            '"Use Redux for state management" contradicts "Do not use Redux for state management"',
        },
      ];

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      const result = await routeOutput(
        "TEST",
        emptySynthesis,
        { clusters: [] },
        conflicts,
      );

      expect(result.conflictTasksCreated).toHaveLength(1);

      // Verify the created story has resolution_type: conflict
      const stories = readAllStories(tmp.projectsDir);
      const conflictStory = stories.find(
        (s) => s.resolution_type === "conflict",
      );
      expect(conflictStory).toBeDefined();
      expect(conflictStory!.resolution_type).toBe("conflict");
    });

    it("creates conflict stories with conflicting_assumptions metadata", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const conflicts: ConflictPair[] = [
        {
          itemA: {
            reportId: "TEST-E001-S001",
            category: "decision",
            text: "Use React",
            normalizedText: "use react",
          },
          itemB: {
            reportId: "TEST-E001-S002",
            category: "decision",
            text: "Avoid React",
            normalizedText: "avoid react",
          },
          reason: '"Use React" contradicts "Avoid React"',
        },
      ];

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      await routeOutput("TEST", emptySynthesis, { clusters: [] }, conflicts);

      const stories = readAllStories(tmp.projectsDir);
      const conflictStory = stories.find(
        (s) => s.resolution_type === "conflict",
      );
      expect(conflictStory).toBeDefined();

      const assumptions = conflictStory!.conflicting_assumptions as Array<{
        assumption: string;
        source_report_id: string;
      }>;
      expect(assumptions).toHaveLength(2);
      expect(assumptions[0]!.assumption).toBe("Use React");
      expect(assumptions[0]!.source_report_id).toBe("TEST-E001-S001");
      expect(assumptions[1]!.assumption).toBe("Avoid React");
      expect(assumptions[1]!.source_report_id).toBe("TEST-E001-S002");
    });
  });

  // ── AC2: Conflict tasks are created with priority: high ──

  describe("AC2: Conflict tasks have priority high", () => {
    it("conflict resolution stories are created with priority high", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const conflicts: ConflictPair[] = [
        {
          itemA: {
            reportId: "TEST-E001-S001",
            category: "decision",
            text: "Use SQL database",
            normalizedText: "use sql database",
          },
          itemB: {
            reportId: "TEST-E001-S002",
            category: "decision",
            text: "Do not use SQL database",
            normalizedText: "do not use sql database",
          },
          reason:
            '"Use SQL database" contradicts "Do not use SQL database"',
        },
      ];

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      await routeOutput("TEST", emptySynthesis, { clusters: [] }, conflicts);

      const stories = readAllStories(tmp.projectsDir);
      const conflictStory = stories.find(
        (s) => s.resolution_type === "conflict",
      );
      expect(conflictStory).toBeDefined();
      expect(conflictStory!.priority).toBe("high");
    });
  });

  // ── AC3: Identified gaps create stories with resolution_type: gap ──

  describe("AC3: Gap clusters create gap resolution stories", () => {
    it("creates a story with resolution_type gap from a create_task cluster", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const clusteringResult = {
        clusters: [
          {
            id: "cluster-1",
            theme: "Missing error handling in API layer",
            synthesis:
              "Multiple reports note that the API layer lacks proper error handling",
            recommendation: "create_task",
            items: [
              { reportId: "TEST-E001-S001" },
              { reportId: "TEST-E001-S002" },
            ],
          },
        ],
      };

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      const result = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
      );

      expect(result.gapTasksCreated).toHaveLength(1);
      expect(result.tasksCreated).toHaveLength(1);

      const stories = readAllStories(tmp.projectsDir);
      const gapStory = stories.find((s) => s.resolution_type === "gap");
      expect(gapStory).toBeDefined();
      expect(gapStory!.resolution_type).toBe("gap");
    });
  });

  // ── AC4: Gap tasks are created with priority: medium ──

  describe("AC4: Gap tasks have priority medium", () => {
    it("gap resolution stories are created with priority medium", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const clusteringResult = {
        clusters: [
          {
            id: "cluster-1",
            theme: "Add monitoring infrastructure",
            synthesis: "No monitoring setup exists",
            recommendation: "create_task",
            items: [{ reportId: "TEST-E001-S001" }],
          },
        ],
      };

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      await routeOutput("TEST", emptySynthesis, clusteringResult);

      const stories = readAllStories(tmp.projectsDir);
      const gapStory = stories.find((s) => s.resolution_type === "gap");
      expect(gapStory).toBeDefined();
      expect(gapStory!.priority).toBe("medium");
    });
  });

  // ── E046-S003: Priority is enforced by resolution_type, not left to caller ──

  describe("E046-S003: Priority enforcement", () => {
    it("resolveResolutionPriority returns high for conflict", () => {
      expect(resolveResolutionPriority("conflict")).toBe("high");
    });

    it("resolveResolutionPriority returns medium for gap", () => {
      expect(resolveResolutionPriority("gap")).toBe("medium");
    });

    it("addResolutionStory enforces high priority for conflict even if caller passes low", async () => {
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const storyCode = await addResolutionStory(epicCode, {
        title: "Enforced conflict priority test",
        description: "Should be high regardless of caller value",
        resolution_type: "conflict",
        priority: "low",
        source_reports: ["TEST-E001-S001"],
        acceptance_criteria: ["Priority must be high"],
      });

      const stories = readAllStories(tmp.projectsDir);
      const created = stories.find((s) => s.code === storyCode);
      expect(created).toBeDefined();
      expect(created!.priority).toBe("high");
    });

    it("addResolutionStory enforces medium priority for gap even if caller passes high", async () => {
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const storyCode = await addResolutionStory(epicCode, {
        title: "Enforced gap priority test",
        description: "Should be medium regardless of caller value",
        resolution_type: "gap",
        priority: "high",
        source_reports: ["TEST-E001-S001"],
        acceptance_criteria: ["Priority must be medium"],
      });

      const stories = readAllStories(tmp.projectsDir);
      const created = stories.find((s) => s.code === storyCode);
      expect(created).toBeDefined();
      expect(created!.priority).toBe("medium");
    });

    it("addResolutionStory works without specifying priority (uses enforced default)", async () => {
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const storyCode = await addResolutionStory(epicCode, {
        title: "No priority specified gap task",
        description: "Should default to medium for gap",
        resolution_type: "gap",
        source_reports: ["TEST-E001-S001"],
        acceptance_criteria: ["Priority derived from resolution_type"],
      });

      const stories = readAllStories(tmp.projectsDir);
      const created = stories.find((s) => s.code === storyCode);
      expect(created).toBeDefined();
      expect(created!.priority).toBe("medium");
    });
  });

  // ── AC5: Each resolution task includes source_reports references ──

  describe("AC5: Resolution tasks include source_reports references", () => {
    it("conflict tasks include source_reports from both conflicting items", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const conflicts: ConflictPair[] = [
        {
          itemA: {
            reportId: "TEST-E001-S001",
            category: "decision",
            text: "Use microservices",
            normalizedText: "use microservices",
          },
          itemB: {
            reportId: "TEST-E001-S003",
            category: "decision",
            text: "Avoid microservices",
            normalizedText: "avoid microservices",
          },
          reason:
            '"Use microservices" contradicts "Avoid microservices"',
        },
      ];

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      await routeOutput("TEST", emptySynthesis, { clusters: [] }, conflicts);

      const stories = readAllStories(tmp.projectsDir);
      const conflictStory = stories.find(
        (s) => s.resolution_type === "conflict",
      );
      expect(conflictStory).toBeDefined();
      const sourceReports = conflictStory!.source_reports as string[];
      expect(sourceReports).toContain("TEST-E001-S001");
      expect(sourceReports).toContain("TEST-E001-S003");
    });

    it("gap tasks include source_reports from all cluster items", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const clusteringResult = {
        clusters: [
          {
            id: "cluster-1",
            theme: "Implement logging framework",
            synthesis: "Multiple reports identify logging gaps",
            recommendation: "create_task",
            items: [
              { reportId: "TEST-E001-S001" },
              { reportId: "TEST-E001-S002" },
              { reportId: "TEST-E001-S003" },
            ],
          },
        ],
      };

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      await routeOutput("TEST", emptySynthesis, clusteringResult);

      const stories = readAllStories(tmp.projectsDir);
      const gapStory = stories.find((s) => s.resolution_type === "gap");
      expect(gapStory).toBeDefined();
      const sourceReports = gapStory!.source_reports as string[];
      expect(sourceReports).toContain("TEST-E001-S001");
      expect(sourceReports).toContain("TEST-E001-S002");
      expect(sourceReports).toContain("TEST-E001-S003");
    });

    it("addResolutionStory directly creates stories with source_reports", async () => {
      const epicCode = await seedEpic("TEST", {
        title: "Test Epic for Resolution",
        description: "Test epic",
      });

      const storyCode = await addResolutionStory(epicCode, {
        title: "Test resolution task",
        description: "A test resolution",
        resolution_type: "gap",
        priority: "medium",
        source_reports: ["TEST-E001-S001", "TEST-E002-S003"],
        acceptance_criteria: ["Resolve the gap"],
      });

      expect(storyCode).toMatch(/^TEST-E\d{3}-S\d{3}$/);

      const stories = readAllStories(tmp.projectsDir);
      const created = stories.find((s) => s.code === storyCode);
      expect(created).toBeDefined();
      expect(created!.resolution_type).toBe("gap");
      expect(created!.priority).toBe("medium");
      const sourceReports = created!.source_reports as string[];
      expect(sourceReports).toContain("TEST-E001-S001");
      expect(sourceReports).toContain("TEST-E002-S003");
    });
  });

  // ── Integration: both conflict and gap tasks created in same run ──

  describe("Integration: mixed conflicts and gaps in same run", () => {
    it("creates both conflict and gap tasks in a single routeOutput call", async () => {
      await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      const conflicts: ConflictPair[] = [
        {
          itemA: {
            reportId: "TEST-E001-S001",
            category: "decision",
            text: "Use REST API",
            normalizedText: "use rest api",
          },
          itemB: {
            reportId: "TEST-E001-S002",
            category: "decision",
            text: "Do not use REST API",
            normalizedText: "do not use rest api",
          },
          reason: '"Use REST API" contradicts "Do not use REST API"',
        },
      ];

      const clusteringResult = {
        clusters: [
          {
            id: "cluster-1",
            theme: "Add authentication layer",
            synthesis: "No auth mechanism exists",
            recommendation: "create_task",
            items: [{ reportId: "TEST-E001-S003" }],
          },
        ],
      };

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      const result = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
        conflicts,
      );

      expect(result.conflictTasksCreated).toHaveLength(1);
      expect(result.gapTasksCreated).toHaveLength(1);

      const stories = readAllStories(tmp.projectsDir);
      const conflictStories = stories.filter(
        (s) => s.resolution_type === "conflict",
      );
      const gapStories = stories.filter((s) => s.resolution_type === "gap");

      expect(conflictStories).toHaveLength(1);
      expect(gapStories).toHaveLength(1);

      // Verify correct priorities
      expect(conflictStories[0]!.priority).toBe("high");
      expect(gapStories[0]!.priority).toBe("medium");

      // Verify source_reports on both
      expect(conflictStories[0]!.source_reports).toBeDefined();
      expect(gapStories[0]!.source_reports).toBeDefined();
    });
  });
});
