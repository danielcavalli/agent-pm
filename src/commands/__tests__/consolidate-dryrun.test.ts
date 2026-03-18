import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { resetProjectCodeCache } from "../../lib/codes.js";

// Mock the LLM client so we don't need real API keys
vi.mock("../../lib/llm.js", () => ({
  createLLMClient: () => ({
    complete: vi.fn().mockResolvedValue(
      JSON.stringify({
        candidates: [
          {
            type: "confirmed_decision",
            content: "Use TypeScript for all new modules",
            sourceReportIds: ["TEST-E001-S001", "TEST-E001-S002"],
          },
        ],
        unmatched: [
          {
            reportId: "TEST-E001-S001",
            category: "assumption",
            text: "Performance is not critical",
          },
        ],
        summary: "TypeScript decision confirmed across reports",
      }),
    ),
  }),
}));

// Mock semantic clustering to return predictable results
vi.mock("../semantic-clustering.js", () => ({
  semanticClustering: vi.fn().mockResolvedValue({
    clusters: [
      {
        id: "cluster-1",
        theme: "Fix error handling gaps",
        items: [
          {
            reportId: "TEST-E001-S001",
            text: "Performance is not critical",
            category: "assumption",
          },
        ],
        synthesis: "Several reports note missing error handling",
        recommendation: "create_task",
      },
    ],
    totalUnmatched: 1,
  }),
}));

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

describe("consolidation dry-run (E042-S004)", () => {
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

  // ── AC1: --dry-run prints proposed ADRs that would be created ──

  it("AC1: dry-run prints proposed ADRs that would be created", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript for all new modules" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript for all new modules" }],
    });

    const { consolidate } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    const output = out.log().join("\n");
    expect(output).toContain("Proposed ADRs that would be created");
    expect(output).toContain("ADR:");
  });

  // ── AC2: --dry-run prints proposed resolution tasks that would be created ──

  it("AC2: dry-run prints proposed resolution tasks that would be created", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
      assumptions: [{ type: "semantic", text: "Performance is not critical" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });

    const { consolidate } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    const output = out.log().join("\n");
    expect(output).toContain("gap task(s) would be created");
    expect(output).toContain("Gap:");
    expect(output).toContain("Fix error handling gaps");
  });

  // ── AC3: --dry-run prints items that would be marked consolidated ──

  it("AC3: dry-run prints items that would be marked consolidated", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    const commentsDir = path.join(tmp.projectsDir, "comments");

    createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });
    createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
      content: "Agreed on approach",
    });

    const { consolidate } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    const output = out.log().join("\n");
    expect(output).toContain("Items that would be marked consolidated");
    expect(output).toContain("2 report(s)");
    expect(output).toContain("TEST-E001-S001");
    expect(output).toContain("TEST-E001-S002");
    expect(output).toContain("1 comment(s)");
    expect(output).toContain("C000001");
  });

  // ── AC4: No files are written when --dry-run is active ──

  it("AC4: no files are written when dry-run is active", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    const commentsDir = path.join(tmp.projectsDir, "comments");

    const rpPath = createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript for modules" }],
    });
    const rpPath2 = createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript for modules" }],
    });
    const cpPath = createCommentFile(commentsDir, "C000001", "TEST-E001-S001", {
      content: "Agreed on approach",
    });

    // Record the state of all files before dry-run
    const reportBefore1 = fs.readFileSync(rpPath, "utf8");
    const reportBefore2 = fs.readFileSync(rpPath2, "utf8");
    const commentBefore = fs.readFileSync(cpPath, "utf8");
    const projectYamlPath = path.join(tmp.projectsDir, "project.yaml");
    const projectBefore = fs.readFileSync(projectYamlPath, "utf8");

    // Count ADR files before
    const adrDir = path.join(tmp.projectsDir, "adrs");
    const adrsBefore = fs.existsSync(adrDir)
      ? fs.readdirSync(adrDir).length
      : 0;

    const { consolidate } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    // Verify report files unchanged (not marked consolidated)
    expect(fs.readFileSync(rpPath, "utf8")).toBe(reportBefore1);
    expect(fs.readFileSync(rpPath2, "utf8")).toBe(reportBefore2);

    // Verify comment files unchanged
    expect(fs.readFileSync(cpPath, "utf8")).toBe(commentBefore);

    // Verify project.yaml unchanged (no last_consolidated_at update)
    expect(fs.readFileSync(projectYamlPath, "utf8")).toBe(projectBefore);

    // Verify no new ADR files were created
    const adrsAfter = fs.existsSync(adrDir)
      ? fs.readdirSync(adrDir).length
      : 0;
    expect(adrsAfter).toBe(adrsBefore);
  });

  // ── AC5: Output clearly labels everything as dry-run ──

  it("AC5: output clearly labels everything as dry-run", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript for all modules" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript for all modules" }],
    });

    const { consolidate } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    const output = out.log().join("\n");

    // Header should be clearly labelled
    expect(output).toContain("[DRY RUN]");
    expect(output).toContain("Consolidation Preview");

    // ADR section
    expect(output).toContain("[DRY RUN] Proposed ADRs");

    // Consolidated items section
    expect(output).toContain("[DRY RUN] Items that would be marked consolidated");

    // Footer
    expect(output).toContain("[DRY RUN] Consolidation preview complete");
    expect(output).toContain("No files were written");
  });

  // ── Edge case: dry-run with no items returns early ──

  it("dry-run with no items to process returns early with no errors", async () => {
    // No reports or comments created -- empty state
    const { consolidate } = await import("../consolidate.js");
    const result = await consolidate("TEST", { dryRun: true });

    expect(result.reportsProcessed).toBe(0);
    expect(result.commentsProcessed).toBe(0);

    const output = out.log().join("\n");
    expect(output).toContain("[DRY RUN]");
    expect(output).toContain("No new items to consolidate");
  });

  // ── Edge case: dry-run does not mark reports consolidated ──

  it("reports remain unconsolidated after dry-run", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    const rpPath = createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });

    const { consolidate, ingestReports } = await import("../consolidate.js");
    await consolidate("TEST", { dryRun: true });

    // After dry-run, the report file should still have consolidated: false
    const content = yaml.load(
      fs.readFileSync(rpPath, "utf8"),
    ) as Record<string, unknown>;
    expect(content.consolidated).toBe(false);

    // A subsequent real ingestion should still pick up the reports
    const allReportPaths = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith("-report.yaml"))
      .map((f) => path.join(reportsDir, f));

    const { loaded } = ingestReports(allReportPaths);
    expect(loaded).toHaveLength(2);
  });

  // ── consolidateRun passes dryRun option ──

  it("consolidateRun passes dryRun option through to consolidate", async () => {
    const reportsDir = path.join(tmp.projectsDir, "reports");
    createReportFile(reportsDir, "TEST-E001-S001", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });
    createReportFile(reportsDir, "TEST-E001-S002", {
      decisions: [{ type: "semantic", text: "Use TypeScript" }],
    });

    const { consolidateRun } = await import("../consolidate.js");
    await consolidateRun({ dryRun: true });

    const output = out.log().join("\n");
    expect(output).toContain("[DRY RUN]");
    expect(output).toContain("No files were written");
  });
});
