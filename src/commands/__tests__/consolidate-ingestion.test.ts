import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  ingestReports,
  ingestComments,
  findCommentFiles,
  markReportsConsolidated,
  markCommentsConsolidated,
  updateLastConsolidatedAt,
  loadConsolidationConfig,
} from "../consolidate.js";
import type { LoadedReport, LoadedComment } from "../consolidate.js";
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
 * Helper to create a valid cross-task comment YAML file and index entry.
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
 * Helper to create the comments index.yaml.
 */
function createCommentIndex(
  commentsDir: string,
  comments: Array<{
    id: string;
    target_task_id: string;
    timestamp: string;
    consolidated: boolean;
    content: string;
  }>,
): void {
  fs.mkdirSync(commentsDir, { recursive: true });
  const index = {
    comments: comments.map((c) => ({
      id: c.id,
      target_task_id: c.target_task_id,
      comment_type: "agent",
      content: c.content,
      author: { type: "agent", agent_id: "test-agent" },
      timestamp: c.timestamp,
      tags: [],
      consolidated: c.consolidated,
      consumed_by: [],
      references: [],
      created_at: c.timestamp,
      updated_at: c.timestamp,
    })),
    by_task: {} as Record<
      string,
      Array<{ comment_id: string; task_reference: string; created_at: string }>
    >,
    last_updated: new Date().toISOString(),
  };

  for (const c of comments) {
    if (!index.by_task[c.target_task_id]) {
      index.by_task[c.target_task_id] = [];
    }
    index.by_task[c.target_task_id]!.push({
      comment_id: c.id,
      task_reference: c.target_task_id,
      created_at: c.timestamp,
    });
  }

  const indexPath = path.join(commentsDir, "index.yaml");
  fs.writeFileSync(indexPath, yaml.dump(index), "utf8");
}

describe("consolidation ingestion (E042-S002)", () => {
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

  // ── AC1: Both execution reports and cross-task comments are ingested ──

  describe("AC1: Both reports and comments are ingested", () => {
    it("ingestReports loads report files", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001");
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002");

      const { loaded, skipped } = ingestReports([fp1, fp2]);
      expect(loaded).toHaveLength(2);
      expect(skipped).toBe(0);
      expect(loaded[0]!.data.task_id).toBe("TEST-E001-S001");
      expect(loaded[1]!.data.task_id).toBe("TEST-E001-S002");
    });

    it("ingestComments loads comment files", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp1 = createCommentFile(commentsDir, "C000001", "TEST-E001-S001");
      const fp2 = createCommentFile(commentsDir, "C000002", "TEST-E001-S002");

      const { loaded, skipped } = ingestComments([fp1, fp2]);
      expect(loaded).toHaveLength(2);
      expect(skipped).toBe(0);
      expect(loaded[0]!.data.id).toBe("C000001");
      expect(loaded[1]!.data.id).toBe("C000002");
    });

    it("findCommentFiles discovers YAML files excluding index.yaml", async () => {
      const epicCode = await seedEpic("TEST", { title: "Test Epic" });
      const commentsDir = path.join(tmp.projectsDir, "comments");
      createCommentFile(commentsDir, "C000001", `${epicCode}-S001`, {
        content: "First",
      });
      createCommentFile(commentsDir, "C000002", `${epicCode}-S001`, {
        content: "Second",
      });
      // Create an index.yaml that should be excluded
      createCommentIndex(commentsDir, []);

      const files = findCommentFiles();
      expect(files).toHaveLength(2);
      expect(files.every((f) => !f.endsWith("index.yaml"))).toBe(true);
    });
  });

  // ── AC2: Items with consolidated: true are skipped ──

  describe("AC2: Items with consolidated: true are skipped", () => {
    it("skips consolidated reports", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        consolidated: true,
      });
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        consolidated: false,
      });

      const { loaded, skipped } = ingestReports([fp1, fp2]);
      expect(loaded).toHaveLength(1);
      expect(skipped).toBe(1);
      expect(loaded[0]!.data.task_id).toBe("TEST-E001-S002");
    });

    it("skips consolidated comments", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp1 = createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
        consolidated: true,
      });
      const fp2 = createCommentFile(commentsDir, "C000002", "TEST-E001-S002", {
        consolidated: false,
      });

      const { loaded, skipped } = ingestComments([fp1, fp2]);
      expect(loaded).toHaveLength(1);
      expect(skipped).toBe(1);
      expect(loaded[0]!.data.id).toBe("C000002");
    });

    it("skips all reports when all are consolidated", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        consolidated: true,
      });
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        consolidated: true,
      });

      const { loaded, skipped } = ingestReports([fp1, fp2]);
      expect(loaded).toHaveLength(0);
      expect(skipped).toBe(2);
    });
  });

  // ── AC3: last_consolidated_at timestamp is used to filter items ──

  describe("AC3: last_consolidated_at filters items by timestamp", () => {
    it("skips reports older than last_consolidated_at", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fpOld = createReportFile(reportsDir, "TEST-E001-S001", {
        timestamp: "2026-03-10T08:00:00Z",
      });
      const fpNew = createReportFile(reportsDir, "TEST-E001-S002", {
        timestamp: "2026-03-12T10:00:00Z",
      });

      const cutoff = "2026-03-11T00:00:00";
      const { loaded, skipped } = ingestReports([fpOld, fpNew], cutoff);
      expect(loaded).toHaveLength(1);
      expect(skipped).toBe(1);
      expect(loaded[0]!.data.task_id).toBe("TEST-E001-S002");
    });

    it("skips comments older than last_consolidated_at", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fpOld = createCommentFile(
        commentsDir,
        "C000001",
        "TEST-E001-S001",
        {
          timestamp: "2026-03-09T08:00:00.000Z",
        },
      );
      const fpNew = createCommentFile(
        commentsDir,
        "C000002",
        "TEST-E001-S002",
        {
          timestamp: "2026-03-12T10:00:00.000Z",
        },
      );

      const cutoff = "2026-03-11T00:00:00";
      const { loaded, skipped } = ingestComments([fpOld, fpNew], cutoff);
      expect(loaded).toHaveLength(1);
      expect(skipped).toBe(1);
      expect(loaded[0]!.data.id).toBe("C000002");
    });

    it("loads all items when no last_consolidated_at is set", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        timestamp: "2026-03-01T08:00:00Z",
      });
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        timestamp: "2026-03-12T10:00:00Z",
      });

      const { loaded, skipped } = ingestReports([fp1, fp2], undefined);
      expect(loaded).toHaveLength(2);
      expect(skipped).toBe(0);
    });

    it("skips report exactly at cutoff time", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fpExact = createReportFile(reportsDir, "TEST-E001-S001", {
        timestamp: "2026-03-11T00:00:00Z",
      });

      const cutoff = "2026-03-11T00:00:00";
      const { loaded, skipped } = ingestReports([fpExact], cutoff);
      expect(loaded).toHaveLength(0);
      expect(skipped).toBe(1);
    });
  });

  // ── AC4: Processed items are marked consolidated: true ──

  describe("AC4: Processed items marked consolidated: true", () => {
    it("markReportsConsolidated sets consolidated: true in report files", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp = createReportFile(reportsDir, "TEST-E001-S001");

      // Read to get the loaded report structure
      const { loaded } = ingestReports([fp]);
      expect(loaded).toHaveLength(1);

      // Mark it
      markReportsConsolidated(loaded);

      // Verify the file was updated
      const content = fs.readFileSync(fp, "utf8");
      const updated = yaml.load(content) as Record<string, unknown>;
      expect(updated.consolidated).toBe(true);
    });

    it("markCommentsConsolidated sets consolidated: true in comment files", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp = createCommentFile(commentsDir, "C000001", "TEST-E001-S001");

      const { loaded } = ingestComments([fp]);
      expect(loaded).toHaveLength(1);

      markCommentsConsolidated(loaded);

      // Verify individual file
      const content = fs.readFileSync(fp, "utf8");
      const updated = yaml.load(content) as Record<string, unknown>;
      expect(updated.consolidated).toBe(true);
    });

    it("markCommentsConsolidated updates the comment index", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp = createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
        content: "Index test",
      });

      // Create index with this comment
      createCommentIndex(commentsDir, [
        {
          id: "C000001",
          target_task_id: "TEST-E001-S001",
          timestamp: "2026-03-12T10:00:00.000Z",
          consolidated: false,
          content: "Index test",
        },
      ]);

      const { loaded } = ingestComments([fp]);
      markCommentsConsolidated(loaded);

      // Verify index was updated
      const indexPath = path.join(commentsDir, "index.yaml");
      const indexContent = fs.readFileSync(indexPath, "utf8");
      const index = yaml.load(indexContent) as {
        comments: Array<{ id: string; consolidated: boolean }>;
      };
      const entry = index.comments.find((c) => c.id === "C000001");
      expect(entry?.consolidated).toBe(true);
    });

    it("marked reports are skipped on subsequent ingestion", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const fp = createReportFile(reportsDir, "TEST-E001-S001");

      // First ingestion
      const { loaded: first } = ingestReports([fp]);
      expect(first).toHaveLength(1);

      // Mark as consolidated
      markReportsConsolidated(first);

      // Second ingestion should skip
      const { loaded: second, skipped } = ingestReports([fp]);
      expect(second).toHaveLength(0);
      expect(skipped).toBe(1);
    });

    it("marked comments are skipped on subsequent ingestion", () => {
      const commentsDir = path.join(tmp.projectsDir, "comments");
      const fp = createCommentFile(commentsDir, "C000001", "TEST-E001-S001");

      // First ingestion
      const { loaded: first } = ingestComments([fp]);
      expect(first).toHaveLength(1);

      // Mark as consolidated
      markCommentsConsolidated(first);

      // Second ingestion should skip
      const { loaded: second, skipped } = ingestComments([fp]);
      expect(second).toHaveLength(0);
      expect(skipped).toBe(1);
    });
  });

  // ── AC5: Ingestion summary lists counts ──

  describe("AC5: Ingestion summary lists counts", () => {
    it("returns correct counts for mixed ingestion", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");
      const commentsDir = path.join(tmp.projectsDir, "comments");

      // 2 reports: 1 new, 1 consolidated
      const rpNew = createReportFile(reportsDir, "TEST-E001-S001");
      const rpOld = createReportFile(reportsDir, "TEST-E001-S002", {
        consolidated: true,
      });

      // 3 comments: 2 new, 1 consolidated
      const cpNew1 = createCommentFile(
        commentsDir,
        "C000001",
        "TEST-E001-S001",
      );
      const cpNew2 = createCommentFile(
        commentsDir,
        "C000002",
        "TEST-E001-S002",
      );
      const cpOld = createCommentFile(
        commentsDir,
        "C000003",
        "TEST-E001-S003",
        { consolidated: true },
      );

      const reports = ingestReports([rpNew, rpOld]);
      const comments = ingestComments([cpNew1, cpNew2, cpOld]);

      expect(reports.loaded).toHaveLength(1);
      expect(reports.skipped).toBe(1);
      expect(comments.loaded).toHaveLength(2);
      expect(comments.skipped).toBe(1);
    });

    it("returns zero counts when nothing to process", () => {
      const reports = ingestReports([]);
      const comments = ingestComments([]);

      expect(reports.loaded).toHaveLength(0);
      expect(reports.skipped).toBe(0);
      expect(comments.loaded).toHaveLength(0);
      expect(comments.skipped).toBe(0);
    });
  });

  // ── updateLastConsolidatedAt ──

  describe("updateLastConsolidatedAt", () => {
    it("updates last_consolidated_at in project.yaml with existing consolidation section", () => {
      const projectYaml = path.join(tmp.projectsDir, "project.yaml");
      const project = yaml.load(
        fs.readFileSync(projectYaml, "utf8"),
      ) as Record<string, unknown>;
      project.consolidation = {
        max_reports_per_run: 10,
        trigger_mode: "manual",
      };
      fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

      updateLastConsolidatedAt("2026-03-12T15:00:00");

      resetProjectCodeCache();
      const config = loadConsolidationConfig();
      expect(config.last_consolidated_at).toBe("2026-03-12T15:00:00");
    });

    it("creates consolidation section if missing", () => {
      const projectYaml = path.join(tmp.projectsDir, "project.yaml");
      const project = yaml.load(
        fs.readFileSync(projectYaml, "utf8"),
      ) as Record<string, unknown>;
      delete project.consolidation;
      fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

      updateLastConsolidatedAt("2026-03-12T15:00:00");

      resetProjectCodeCache();
      const config = loadConsolidationConfig();
      expect(config.last_consolidated_at).toBe("2026-03-12T15:00:00");
      expect(config.max_reports_per_run).toBe(10);
      expect(config.trigger_mode).toBe("manual");
    });
  });

  // ── Combined filtering (consolidated + timestamp) ──

  describe("Combined filtering", () => {
    it("applies both consolidated and timestamp filters", () => {
      const reportsDir = path.join(tmp.projectsDir, "reports");

      // Report 1: consolidated=true, recent timestamp -> skipped (consolidated)
      const fp1 = createReportFile(reportsDir, "TEST-E001-S001", {
        consolidated: true,
        timestamp: "2026-03-12T10:00:00Z",
      });

      // Report 2: consolidated=false, old timestamp -> skipped (timestamp)
      const fp2 = createReportFile(reportsDir, "TEST-E001-S002", {
        consolidated: false,
        timestamp: "2026-03-08T10:00:00Z",
      });

      // Report 3: consolidated=false, recent timestamp -> loaded
      const fp3 = createReportFile(reportsDir, "TEST-E001-S003", {
        consolidated: false,
        timestamp: "2026-03-12T10:00:00Z",
      });

      const cutoff = "2026-03-10T00:00:00";
      const { loaded, skipped } = ingestReports([fp1, fp2, fp3], cutoff);
      expect(loaded).toHaveLength(1);
      expect(skipped).toBe(2);
      expect(loaded[0]!.data.task_id).toBe("TEST-E001-S003");
    });
  });
});
