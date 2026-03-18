import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  ingestReports,
  ingestComments,
  markReportsConsolidated,
  markCommentsConsolidated,
} from "../consolidate.js";
import {
  routeOutput,
  computeAdrDedupKey,
  computeTaskDedupKey,
  adrAlreadyExists,
  taskAlreadyExists,
} from "../consolidate-output.js";
import type { SynthesisResult } from "../consolidate.js";
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
 * Helper to create a valid agent execution report YAML file.
 * Uses "semantic" as the item type to match the schema requirement.
 */
function createReportFile(
  reportsDir: string,
  taskId: string,
  opts: {
    timestamp?: string;
    consolidated?: boolean;
    decisions?: Array<{ type: string; text: string }>;
    assumptions?: Array<{ type: string; text: string }>;
  } = {},
): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = {
    task_id: taskId,
    agent_id: "test-agent",
    timestamp: opts.timestamp || "2026-03-12T10:00:00Z",
    status: "complete",
    decisions: opts.decisions || [],
    assumptions: opts.assumptions || [],
    tradeoffs: [],
    out_of_scope: [],
    potential_conflicts: [],
    consolidated: opts.consolidated ?? false,
  };
  const fileName = `${taskId}-report.yaml`;
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, yaml.dump(report), "utf8");
  return filePath;
}

/**
 * Helper to create a valid cross-task comment YAML file.
 */
function createCommentFile(
  commentsDir: string,
  commentId: string,
  targetTaskId: string,
  opts: {
    timestamp?: string;
    consolidated?: boolean;
    content?: string;
  } = {},
): string {
  fs.mkdirSync(commentsDir, { recursive: true });
  const timestamp = opts.timestamp || "2026-03-12T10:00:00.000Z";
  const comment = {
    id: commentId,
    target_task_id: targetTaskId,
    comment_type: "agent",
    content: opts.content || "Test comment content",
    author: { type: "agent", agent_id: "test-agent" },
    timestamp,
    tags: [],
    consolidated: opts.consolidated ?? false,
    consumed_by: [],
    references: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
  const slug = (opts.content || "test-comment")
    .slice(0, 30)
    .replace(/[^a-z0-9]/gi, "-");
  const fileName = `${commentId}-${slug}.yaml`;
  const filePath = path.join(commentsDir, fileName);
  fs.writeFileSync(filePath, yaml.dump(comment), "utf8");
  return filePath;
}

/**
 * Find the epic file created by seedEpic by scanning the epics directory.
 */
function findEpicFileByCode(
  projectsDir: string,
  epicCode: string,
): string | null {
  const epicsDir = path.join(projectsDir, "epics");
  if (!fs.existsSync(epicsDir)) return null;
  const files = fs.readdirSync(epicsDir);
  for (const file of files) {
    if (!file.endsWith(".yaml")) continue;
    const filePath = path.join(epicsDir, file);
    try {
      const content = yaml.load(
        fs.readFileSync(filePath, "utf8"),
      ) as Record<string, unknown>;
      if (content.code === epicCode) return filePath;
    } catch {
      // skip
    }
  }
  return null;
}

describe("consolidation idempotency (E042-S005)", () => {
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

  // ── AC1: Re-running consolidation does not process already-consolidated items ──

  describe("AC1: Already-consolidated items are skipped on re-run", () => {
    it("reports marked consolidated are skipped on second ingestion", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp = createReportFile(reportsDir, "TEST-E001-S001", {
        decisions: [{ type: "semantic", text: "Use TypeScript" }],
      });

      // First run: ingest and mark
      const { loaded: first } = ingestReports([fp]);
      expect(first).toHaveLength(1);
      markReportsConsolidated(first);

      // Second run: should skip
      const { loaded: second, skipped } = ingestReports([fp]);
      expect(second).toHaveLength(0);
      expect(skipped).toBe(1);
    });

    it("comments marked consolidated are skipped on second ingestion", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp = createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
        content: "Consider alternative approach",
      });

      // First run: ingest and mark
      const { loaded: first } = ingestComments([fp]);
      expect(first).toHaveLength(1);
      markCommentsConsolidated(first);

      // Second run: should skip
      const { loaded: second, skipped } = ingestComments([fp]);
      expect(second).toHaveLength(0);
      expect(skipped).toBe(1);
    });

    it("mixed consolidated and new items are correctly filtered on re-run", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");

      // Create two reports
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        decisions: [{ type: "semantic", text: "Use Zod for validation" }],
      });
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        decisions: [{ type: "semantic", text: "Use YAML for storage" }],
      });

      // First run: ingest and mark only the first
      const { loaded: firstRun } = ingestReports([fp1, fp2]);
      expect(firstRun).toHaveLength(2);
      markReportsConsolidated([firstRun[0]!]);

      // Second run: only the second should be loaded
      const { loaded: secondRun, skipped } = ingestReports([fp1, fp2]);
      expect(secondRun).toHaveLength(1);
      expect(secondRun[0]!.data.task_id).toBe("TEST-E001-S002");
      expect(skipped).toBe(1);
    });
  });

  // ── AC2: Re-running does not create duplicate ADRs ──

  describe("AC2: No duplicate ADRs on re-run", () => {
    it("computeAdrDedupKey is stable and deterministic", () => {
      const key1 = computeAdrDedupKey("Use TypeScript for type safety");
      const key2 = computeAdrDedupKey("Use TypeScript for type safety");
      const key3 = computeAdrDedupKey("  Use TypeScript for type safety  ");
      const key4 = computeAdrDedupKey("use typescript for type safety");

      expect(key1).toBe(key2);
      expect(key1).toBe(key3); // Trimmed whitespace
      expect(key1).toBe(key4); // Case insensitive
    });

    it("computeAdrDedupKey produces different keys for different content", () => {
      const key1 = computeAdrDedupKey("Use TypeScript");
      const key2 = computeAdrDedupKey("Use JavaScript");

      expect(key1).not.toBe(key2);
    });

    it("adrAlreadyExists returns false when no ADRs exist", async () => {
      const exists = await adrAlreadyExists("Some new decision");
      expect(exists).toBe(false);
    });

    it("routeOutput skips ADR creation when same decision already exists", async () => {
      const synthesisResult: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Use TypeScript for type safety",
            sourceReportIds: ["TEST-E001-S001"],
          },
        ],
        unmatched: [],
        summary: "Test synthesis",
      };

      const clusteringResult = { clusters: [] };

      // First call: creates the ADR
      const result1 = await routeOutput(
        "TEST",
        synthesisResult,
        clusteringResult,
      );
      expect(result1.adrsCreated).toHaveLength(1);
      expect(result1.adrsSkippedDuplicate).toHaveLength(0);

      // Second call: should skip as duplicate
      const result2 = await routeOutput(
        "TEST",
        synthesisResult,
        clusteringResult,
      );
      expect(result2.adrsCreated).toHaveLength(0);
      expect(result2.adrsSkippedDuplicate).toHaveLength(1);
    });

    it("routeOutput creates ADR for new decision while skipping existing one", async () => {
      // First: create an ADR for one decision
      const synthesis1: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Use Zod for schema validation",
            sourceReportIds: ["TEST-E001-S001"],
          },
        ],
        unmatched: [],
        summary: "First synthesis",
      };
      await routeOutput("TEST", synthesis1, { clusters: [] });

      // Second: try to create both the existing and a new decision
      const synthesis2: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Use Zod for schema validation", // duplicate
            sourceReportIds: ["TEST-E001-S001"],
          },
          {
            type: "confirmed_decision",
            content: "Use YAML for config files", // new
            sourceReportIds: ["TEST-E001-S002"],
          },
        ],
        unmatched: [],
        summary: "Second synthesis",
      };
      const result = await routeOutput("TEST", synthesis2, { clusters: [] });

      expect(result.adrsCreated).toHaveLength(1);
      expect(result.adrsSkippedDuplicate).toHaveLength(1);
    });
  });

  // ── AC3: Re-running does not create duplicate resolution tasks ──

  describe("AC3: No duplicate resolution tasks on re-run", () => {
    it("computeTaskDedupKey is stable and deterministic", () => {
      const key1 = computeTaskDedupKey("Fix error handling gaps");
      const key2 = computeTaskDedupKey("Fix error handling gaps");
      const key3 = computeTaskDedupKey("  Fix error handling gaps  ");
      const key4 = computeTaskDedupKey("fix error handling gaps");

      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
      expect(key1).toBe(key4);
    });

    it("computeTaskDedupKey produces different keys for different titles", () => {
      const key1 = computeTaskDedupKey("Fix error handling");
      const key2 = computeTaskDedupKey("Add test coverage");

      expect(key1).not.toBe(key2);
    });

    it("taskAlreadyExists returns false when no stories exist", () => {
      const exists = taskAlreadyExists("Some new task");
      expect(exists).toBe(false);
    });

    it("routeOutput skips task creation when same title already exists", async () => {
      // Seed a backlog epic for task creation
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      // Epic created by seedEpic defaults to status "backlog" already
      // but let's verify we can find it
      const epicFile = findEpicFileByCode(tmp.projectsDir, epicCode);
      expect(epicFile).not.toBeNull();

      const clusteringResult = {
        clusters: [
          {
            id: "cluster-1",
            theme: "Fix error handling gaps",
            synthesis: "Multiple reports highlight error handling issues",
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

      // First call: creates the task
      const result1 = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
      );
      expect(result1.tasksCreated).toHaveLength(1);
      expect(result1.tasksSkippedDuplicate).toHaveLength(0);

      // Second call: should skip as duplicate
      const result2 = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
      );
      expect(result2.tasksCreated).toHaveLength(0);
      expect(result2.tasksSkippedDuplicate).toHaveLength(1);
    });
  });

  // ── AC4: Idempotency verified by running consolidation twice and comparing output ──

  describe("AC4: Full idempotency verified by running twice", () => {
    it("ingestion + marking produces zero items on second run", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const commentsDir = path.join(tmp.projectsDir, "comments");

      // Create reports and comments (use "semantic" type for schema compliance)
      const rp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        decisions: [{ type: "semantic", text: "Use TypeScript" }],
      });
      const rp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        decisions: [{ type: "semantic", text: "Use Vitest for testing" }],
      });
      const cp1 = createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
        content: "Agreed on TypeScript choice",
      });

      // First run: ingest all
      const reportPaths = [rp1, rp2];
      const commentPaths = [cp1];

      const { loaded: reports1 } = ingestReports(reportPaths);
      const { loaded: comments1 } = ingestComments(commentPaths);
      expect(reports1).toHaveLength(2);
      expect(comments1).toHaveLength(1);

      // Mark all as consolidated
      markReportsConsolidated(reports1);
      markCommentsConsolidated(comments1);

      // Second run: all should be skipped
      const { loaded: reports2, skipped: rSkipped } =
        ingestReports(reportPaths);
      const { loaded: comments2, skipped: cSkipped } =
        ingestComments(commentPaths);
      expect(reports2).toHaveLength(0);
      expect(comments2).toHaveLength(0);
      expect(rSkipped).toBe(2);
      expect(cSkipped).toBe(1);
    });

    it("ADR output dedup produces zero new ADRs on second run", async () => {
      const synthesisResult: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Adopt event-driven architecture",
            sourceReportIds: ["TEST-E001-S001", "TEST-E001-S002"],
          },
          {
            type: "confirmed_decision",
            content: "Use Commander.js for CLI",
            sourceReportIds: ["TEST-E001-S003"],
          },
        ],
        unmatched: [],
        summary: "Two confirmed decisions",
      };

      // First run: creates 2 ADRs
      const result1 = await routeOutput("TEST", synthesisResult, {
        clusters: [],
      });
      expect(result1.adrsCreated).toHaveLength(2);
      expect(result1.adrsSkippedDuplicate).toHaveLength(0);

      // Second run: skips both as duplicates
      const result2 = await routeOutput("TEST", synthesisResult, {
        clusters: [],
      });
      expect(result2.adrsCreated).toHaveLength(0);
      expect(result2.adrsSkippedDuplicate).toHaveLength(2);
    });

    it("task output dedup produces zero new tasks on second run", async () => {
      // Seed a backlog epic (defaults to backlog status)
      const epicCode = await seedEpic("TEST", {
        title: "Backlog",
        description: "Backlog epic",
      });

      // Verify the epic exists
      const epicFile = findEpicFileByCode(tmp.projectsDir, epicCode);
      expect(epicFile).not.toBeNull();

      const emptySynthesis: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "Test",
      };

      const clusteringResult = {
        clusters: [
          {
            id: "c1",
            theme: "Improve error messages",
            synthesis: "Several reports note unclear error messages",
            recommendation: "create_task",
            items: [{ reportId: "TEST-E001-S001" }],
          },
          {
            id: "c2",
            theme: "Add logging infrastructure",
            synthesis: "Multiple reports request better logging",
            recommendation: "create_task",
            items: [{ reportId: "TEST-E001-S002" }],
          },
        ],
      };

      // First run: creates 2 tasks
      const result1 = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
      );
      expect(result1.tasksCreated).toHaveLength(2);
      expect(result1.tasksSkippedDuplicate).toHaveLength(0);

      // Second run: skips both as duplicates
      const result2 = await routeOutput(
        "TEST",
        emptySynthesis,
        clusteringResult,
      );
      expect(result2.tasksCreated).toHaveLength(0);
      expect(result2.tasksSkippedDuplicate).toHaveLength(2);
    });

    it("combined ingestion + output idempotency: full pipeline twice", async () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");

      // Create reports with decisions (using "semantic" type)
      const rp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        decisions: [
          { type: "semantic", text: "Use TypeScript for type safety" },
        ],
      });

      // First run ingestion
      const { loaded: reports1 } = ingestReports([rp1]);
      expect(reports1).toHaveLength(1);

      // First run output: creates ADR
      const synthesis: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Use TypeScript for type safety",
            sourceReportIds: ["TEST-E001-S001"],
          },
        ],
        unmatched: [],
        summary: "TypeScript decision confirmed",
      };
      const output1 = await routeOutput("TEST", synthesis, { clusters: [] });
      expect(output1.adrsCreated).toHaveLength(1);

      // Mark reports as consolidated
      markReportsConsolidated(reports1);

      // Second run ingestion: reports should be skipped
      const { loaded: reports2, skipped: rSkipped } = ingestReports([rp1]);
      expect(reports2).toHaveLength(0);
      expect(rSkipped).toBe(1);

      // Even if we somehow re-run output, ADRs should be deduped
      const output2 = await routeOutput("TEST", synthesis, { clusters: [] });
      expect(output2.adrsCreated).toHaveLength(0);
      expect(output2.adrsSkippedDuplicate).toHaveLength(1);
    });
  });
});
