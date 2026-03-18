import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { gcRun } from "../gc.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { ADRReferenceSchema } from "../../schemas/adr.schema.js";

/** Return an ISO timestamp N days in the past. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("gc ADR reference type validation (E047-S001)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  // -- Schema-level tests --

  it("AC1: ADRReferenceSchema accepts 'supersedes' as a valid type", () => {
    const result = ADRReferenceSchema.safeParse({
      type: "supersedes",
      id: "ADR-001",
      description: "Supersedes earlier decision",
    });
    expect(result.success).toBe(true);
  });

  it("AC1: ADRReferenceSchema accepts all original types", () => {
    for (const refType of ["comment", "report", "adr", "task"]) {
      const result = ADRReferenceSchema.safeParse({
        type: refType,
        id: "some-id",
      });
      expect(result.success).toBe(true);
    }
  });

  it("AC1: ADRReferenceSchema rejects unknown types", () => {
    const result = ADRReferenceSchema.safeParse({
      type: "unknown_type",
      id: "some-id",
    });
    expect(result.success).toBe(false);
  });

  // -- GC integration tests --

  function writeAdrIndex(pmDir: string, adrs: unknown[]) {
    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const content = yaml.dump(
      { adrs, last_updated: new Date().toISOString() },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  it("AC2: GC detects supersession via reference type 'supersedes' and marks old ADR", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001", description: "Replaces ADR-001" },
        ],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };

    const oldAdr = updated.adrs.find((a) => a.id === "ADR-001");
    const newAdr = updated.adrs.find((a) => a.id === "ADR-002");

    expect(oldAdr?.status).toBe("superseded");
    expect(newAdr?.status).toBe("accepted");
  });

  it("AC2: GC detects supersession via superseded_by field", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        references: [],
        superseded_by: { by_adr_id: "ADR-002" },
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };

    const oldAdr = updated.adrs.find((a) => a.id === "ADR-001");
    expect(oldAdr?.status).toBe("superseded");
  });

  it("AC3: no runtime errors when ADR index has no references", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Decision with no references",
      },
    ]);

    // Should not throw
    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    expect(updated.adrs[0]?.status).toBe("accepted");
  });

  it("AC3: no runtime errors when ADR index file does not exist", async () => {
    // Don't create an index file; gcRun should handle gracefully
    await expect(gcRun({ dryRun: false })).resolves.not.toThrow();
  });

  it("AC3: no runtime errors when references array is empty", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Empty refs",
        references: [],
      },
    ]);

    await expect(gcRun({ dryRun: false })).resolves.not.toThrow();
  });

  it("AC2: already-superseded ADRs are not re-processed", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "superseded",
        title: "Already superseded",
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001" },
        ],
      },
    ]);

    out.restore();
    out = captureOutput();

    await gcRun({ dryRun: true });

    const lines = out.log().join("\n");
    // Should not mention any ADRs to supersede since ADR-001 is already superseded
    expect(lines).not.toContain("Would mark");
  });

  it("AC4: reference type 'supersedes' in schema matches GC filter", () => {
    // Verify the schema and GC code are aligned by checking the schema
    // accepts the exact type string the GC filters on
    const ref = ADRReferenceSchema.parse({
      type: "supersedes",
      id: "ADR-001",
    });
    expect(ref.type).toBe("supersedes");
    expect(ref.id).toBe("ADR-001");
  });
});

describe("gc report consolidation guard (E047-S002)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  function writeReport(
    reportsDir: string,
    filename: string,
    content: Record<string, unknown>,
  ) {
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, yaml.dump(content, { indent: 2 }), "utf8");
    return filePath;
  }

  it("AC1: GC skips reports where consolidated is false", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: new Date().toISOString(),
      status: "complete",
      consolidated: false,
    });

    await gcRun({ dryRun: false });

    // Report should still exist (not archived)
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml"))).toBe(true);
    const archiveDir = path.join(reportsDir, "archive");
    const archived = fs.existsSync(archiveDir)
      ? fs.readdirSync(archiveDir)
      : [];
    expect(archived).toHaveLength(0);
  });

  it("AC1: GC skips reports where consolidated field is absent", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S002-report.yaml", {
      task_id: "TEST-E001-S002",
      agent_id: "test-agent",
      timestamp: new Date().toISOString(),
      status: "complete",
      // no consolidated field at all
    });

    await gcRun({ dryRun: false });

    // Report should still exist (not archived)
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S002-report.yaml"))).toBe(true);
  });

  it("AC2: GC archives reports where consolidated is true", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S003-report.yaml", {
      task_id: "TEST-E001-S003",
      agent_id: "test-agent",
      timestamp: daysAgo(10), // older than default 7-day TTL
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: false });

    // Report should be moved to archive
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S003-report.yaml"))).toBe(false);
    const archiveDir = path.join(reportsDir, "archive");
    expect(fs.existsSync(path.join(archiveDir, "TEST-E001-S003-report.yaml"))).toBe(true);
  });

  it("AC2: GC archives only consolidated reports in a mixed set", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");

    // consolidated: true -> should be archived (old enough to pass TTL)
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });
    // consolidated: false -> should stay
    writeReport(reportsDir, "TEST-E001-S002-report.yaml", {
      task_id: "TEST-E001-S002",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: false,
    });
    // no consolidated field -> should stay
    writeReport(reportsDir, "TEST-E001-S003-report.yaml", {
      task_id: "TEST-E001-S003",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
    });

    await gcRun({ dryRun: false });

    // S001 archived
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml"))).toBe(false);
    expect(fs.existsSync(path.join(reportsDir, "archive", "TEST-E001-S001-report.yaml"))).toBe(true);

    // S002 and S003 remain
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S002-report.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S003-report.yaml"))).toBe(true);
  });

  it("AC3: dry-run shows which reports would be archived and why", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");

    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10), // older than default 7-day TTL
      status: "complete",
      consolidated: true,
    });
    writeReport(reportsDir, "TEST-E001-S002-report.yaml", {
      task_id: "TEST-E001-S002",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: false,
    });

    await gcRun({ "dry-run": true });

    const lines = out.log().join("\n");

    // Should indicate the consolidated report would be archived
    expect(lines).toContain("Would archive report (consolidated)");
    expect(lines).toContain("TEST-E001-S001-report.yaml");

    // Should indicate the non-consolidated report is skipped
    expect(lines).toContain("Skipping report (not consolidated)");
    expect(lines).toContain("TEST-E001-S002-report.yaml");

    // No files should have moved (dry-run)
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(reportsDir, "TEST-E001-S002-report.yaml"))).toBe(true);
  });

  it("AC4: reports without consolidated field are treated as not consolidated", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");

    // Write a minimal report with no consolidated field
    writeReport(reportsDir, "TEST-E001-S004-report.yaml", {
      task_id: "TEST-E001-S004",
      agent_id: "test-agent",
      timestamp: new Date().toISOString(),
      status: "complete",
    });

    await gcRun({ "dry-run": true });

    const lines = out.log().join("\n");

    // Should be reported as skipped (not consolidated)
    expect(lines).toContain("Skipping report (not consolidated)");
    expect(lines).toContain("TEST-E001-S004-report.yaml");
    expect(lines).not.toContain("Would archive report (consolidated): TEST-E001-S004-report.yaml");
  });
});

describe("gc configurable TTL thresholds (E047-S003)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  function writeReport(
    reportsDir: string,
    filename: string,
    content: Record<string, unknown>,
  ) {
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, yaml.dump(content, { indent: 2 }), "utf8");
    return filePath;
  }

  function writeAdrIndex(pmDir: string, adrs: unknown[]) {
    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const content = yaml.dump(
      { adrs, last_updated: new Date().toISOString() },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  function writeCommentIndex(pmDir: string, comments: unknown[]) {
    const commentsDir = path.join(pmDir, "comments");
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
    }
    const indexPath = path.join(commentsDir, "index.yaml");
    const content = yaml.dump(
      {
        comments,
        by_task: {},
        last_updated: new Date().toISOString(),
      },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  function setGcConfig(
    pmDir: string,
    gcConfig: {
      ttl_comments_days?: number;
      ttl_reports_days?: number;
      ttl_adrs_days?: number;
    },
  ) {
    const projectPath = path.join(pmDir, "project.yaml");
    const raw = yaml.load(
      fs.readFileSync(projectPath, "utf8"),
    ) as Record<string, unknown>;
    raw.gc_config = gcConfig;
    fs.writeFileSync(projectPath, yaml.dump(raw, { indent: 2 }), "utf8");
  }

  // ── AC1: Default TTLs ──────────────────────────────────────────────────────

  it("AC1: default TTL for reports is 7 days — young reports are not archived", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    // 3 days old — younger than default 7-day TTL
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(3),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: false });

    // Report should NOT be archived (too young)
    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(true);
    const archiveDir = path.join(reportsDir, "archive");
    const archived = fs.existsSync(archiveDir)
      ? fs.readdirSync(archiveDir)
      : [];
    expect(archived).toHaveLength(0);
  });

  it("AC1: default TTL for reports is 7 days — old reports are archived", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    // 10 days old — older than default 7-day TTL
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: false });

    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(reportsDir, "archive", "TEST-E001-S001-report.yaml"),
      ),
    ).toBe(true);
  });

  it("AC1: default TTL for ADRs is 90 days — young superseded ADRs are not marked", async () => {
    const pmDir = process.env["PM_HOME"]!;
    // ADR-001 is only 30 days old — younger than default 90-day TTL
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(30),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001", description: "Replaces" },
        ],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    // Should NOT be superseded — too young
    expect(updated.adrs.find((a) => a.id === "ADR-001")?.status).toBe(
      "accepted",
    );
  });

  it("AC1: default TTL for ADRs is 90 days — old superseded ADRs are marked", async () => {
    const pmDir = process.env["PM_HOME"]!;
    // ADR-001 is 100 days old — older than default 90-day TTL
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(100),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001", description: "Replaces" },
        ],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    expect(updated.adrs.find((a) => a.id === "ADR-001")?.status).toBe(
      "superseded",
    );
  });

  // ── AC2: TTLs configurable via project.yaml gc_config ──────────────────────

  it("AC2: custom TTL for reports overrides default", async () => {
    const pmDir = process.env["PM_HOME"]!;
    // Set custom TTL to 2 days for reports
    setGcConfig(pmDir, { ttl_reports_days: 2 });

    const reportsDir = path.join(pmDir, "reports");
    // 3 days old — older than custom 2-day TTL
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(3),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: false });

    // Should be archived with custom TTL of 2 days
    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(reportsDir, "archive", "TEST-E001-S001-report.yaml"),
      ),
    ).toBe(true);
  });

  it("AC2: custom TTL for ADRs overrides default", async () => {
    const pmDir = process.env["PM_HOME"]!;
    // Set custom TTL to 10 days for ADRs (instead of 90)
    setGcConfig(pmDir, { ttl_adrs_days: 10 });

    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(15),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001", description: "Replaces" },
        ],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    // With 10-day TTL and 15-day age, should be superseded
    expect(updated.adrs.find((a) => a.id === "ADR-001")?.status).toBe(
      "superseded",
    );
  });

  it("AC2: custom TTL protects young items even when otherwise eligible", async () => {
    const pmDir = process.env["PM_HOME"]!;
    // Set very long TTL: 365 days
    setGcConfig(pmDir, { ttl_reports_days: 365 });

    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(100), // 100 days old, still < 365-day TTL
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: false });

    // Should NOT be archived (under 365-day TTL)
    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(true);
  });

  // ── AC3: Items younger than TTL are never garbage collected ────────────────

  it("AC3: consolidated comment younger than 30-day TTL is not deleted", async () => {
    const pmDir = process.env["PM_HOME"]!;

    // Create a minimal epic so isTaskCompleted can resolve
    const epicsDir = path.join(pmDir, "epics");
    fs.writeFileSync(
      path.join(epicsDir, "E001-test.yaml"),
      yaml.dump({
        id: "E001",
        code: "TEST-E001",
        title: "Test Epic",
        status: "done",
        priority: "medium",
        created_at: "2026-01-01",
        stories: [
          {
            id: "S001",
            code: "TEST-E001-S001",
            title: "Test Story",
            status: "done",
            priority: "medium",
            story_points: 1,
          },
        ],
      }),
      "utf8",
    );

    // Comment is only 5 days old (younger than default 30-day TTL)
    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "A test comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(5),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    // Comment should still exist because it's younger than the TTL
    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeDefined();
  });

  it("AC3: consolidated comment older than 30-day TTL is deleted", async () => {
    const pmDir = process.env["PM_HOME"]!;

    const epicsDir = path.join(pmDir, "epics");
    fs.writeFileSync(
      path.join(epicsDir, "E001-test.yaml"),
      yaml.dump({
        id: "E001",
        code: "TEST-E001",
        title: "Test Epic",
        status: "done",
        priority: "medium",
        created_at: "2026-01-01",
        stories: [
          {
            id: "S001",
            code: "TEST-E001-S001",
            title: "Test Story",
            status: "done",
            priority: "medium",
            story_points: 1,
          },
        ],
      }),
      "utf8",
    );

    // Comment is 35 days old (older than default 30-day TTL)
    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "A test comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    // Comment should be deleted
    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeUndefined();
  });

  it("AC3: superseded_by ADR younger than TTL is not superseded", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(10), // only 10 days old, < 90-day default
        references: [],
        superseded_by: { by_adr_id: "ADR-002" },
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    expect(updated.adrs.find((a) => a.id === "ADR-001")?.status).toBe(
      "accepted",
    );
  });

  // ── AC4: verbose shows TTL evaluation ──────────────────────────────────────

  it("AC4: --verbose shows TTL evaluation for reports", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");

    // One young report, one old report
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(3),
      status: "complete",
      consolidated: true,
    });
    writeReport(reportsDir, "TEST-E001-S002-report.yaml", {
      task_id: "TEST-E001-S002",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ "dry-run": true, verbose: true });

    const lines = out.log().join("\n");

    // Should show TTL header
    expect(lines).toContain("TTLs:");
    expect(lines).toContain("reports=7d");

    // Should show TTL evaluation for the young report (skipped)
    expect(lines).toContain("[ttl] Report TEST-E001-S001-report.yaml:");
    expect(lines).toContain("< TTL 7d, skipping");

    // Should show TTL evaluation for the old report (eligible)
    expect(lines).toContain("[ttl] Report TEST-E001-S002-report.yaml:");
    expect(lines).toContain(">= TTL 7d");
    expect(lines).toContain("eligible");
  });

  it("AC4: --verbose shows TTL evaluation for ADRs", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Young decision",
        created_at: daysAgo(10),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001" },
        ],
      },
    ]);

    await gcRun({ "dry-run": true, verbose: true });

    const lines = out.log().join("\n");

    // Should show TTL evaluation for ADR-001 (too young at 10 days vs 90-day TTL)
    expect(lines).toContain("[ttl] ADR ADR-001:");
    expect(lines).toContain("< TTL 90d, skipping");
  });

  it("AC4: --verbose shows TTL header with configured values", async () => {
    const pmDir = process.env["PM_HOME"]!;
    setGcConfig(pmDir, {
      ttl_comments_days: 15,
      ttl_reports_days: 3,
      ttl_adrs_days: 45,
    });

    await gcRun({ "dry-run": true, verbose: true });

    const lines = out.log().join("\n");
    expect(lines).toContain("comments=15d");
    expect(lines).toContain("reports=3d");
    expect(lines).toContain("ADRs=45d");
  });

  it("AC4: --verbose shows TTL evaluation for comments", async () => {
    const pmDir = process.env["PM_HOME"]!;

    const epicsDir = path.join(pmDir, "epics");
    fs.writeFileSync(
      path.join(epicsDir, "E001-test.yaml"),
      yaml.dump({
        id: "E001",
        code: "TEST-E001",
        title: "Test Epic",
        status: "done",
        priority: "medium",
        created_at: "2026-01-01",
        stories: [
          {
            id: "S001",
            code: "TEST-E001-S001",
            title: "Test Story",
            status: "done",
            priority: "medium",
            story_points: 1,
          },
        ],
      }),
      "utf8",
    );

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Young comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(5),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
      {
        id: "C000002",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Old comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ "dry-run": true, verbose: true });

    const lines = out.log().join("\n");

    // Young comment should show skip
    expect(lines).toContain("[ttl] Comment C000001:");
    expect(lines).toContain("< TTL 30d, skipping");

    // Old comment should show eligible
    expect(lines).toContain("[ttl] Comment C000002:");
    expect(lines).toContain(">= TTL 30d");
    expect(lines).toContain("eligible");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GC test coverage (E047-S005)
// ═══════════════════════════════════════════════════════════════════════════

describe("gc comment expiry based on consumed_by (E047-S005)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  function writeCommentIndex(pmDir: string, comments: unknown[]) {
    const commentsDir = path.join(pmDir, "comments");
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
    }
    const indexPath = path.join(commentsDir, "index.yaml");
    const content = yaml.dump(
      {
        comments,
        by_task: {},
        last_updated: new Date().toISOString(),
      },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  function writeEpic(
    pmDir: string,
    epicId: string,
    stories: Array<{ code: string; status: string }>,
  ) {
    const epicsDir = path.join(pmDir, "epics");
    fs.writeFileSync(
      path.join(epicsDir, `${epicId}-test.yaml`),
      yaml.dump({
        id: epicId,
        code: `TEST-${epicId}`,
        title: "Test Epic",
        status: "in_progress",
        priority: "medium",
        created_at: "2026-01-01",
        stories: stories.map((s, i) => ({
          id: `S${String(i + 1).padStart(3, "0")}`,
          code: s.code,
          title: `Story ${i + 1}`,
          status: s.status,
          priority: "medium",
          story_points: 1,
        })),
      }),
      "utf8",
    );
  }

  it("deletes old consolidated comment when consumed_by includes the target agent", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Consumed comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeUndefined();
  });

  it("does NOT delete old consolidated comment when consumed_by does NOT include the target agent", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Not consumed by target",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["other-agent"], // consumed by a different agent
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    // Should NOT be deleted because consumed_by does not contain author's agent_id
    expect(updated.comments.find((c) => c.id === "C000001")).toBeDefined();
  });

  it("does NOT delete old consolidated comment when consumed_by is empty", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Unconsumed comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: [],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeDefined();
  });

  it("deletes old consolidated comment when task is completed, even without consumed_by", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "done" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Task completed comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: [],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeUndefined();
  });

  it("does NOT delete non-consolidated comments even when consumed and old", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Not consolidated yet",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: false,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    expect(updated.comments.find((c) => c.id === "C000001")).toBeDefined();
  });

  it("selectively deletes only eligible comments in a mixed set", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
      { code: "TEST-E001-S002", status: "done" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Consumed and old",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
      {
        id: "C000002",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Not consumed, task not done",
        author: { type: "agent", agent_id: "agent-2" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: [],
        references: [],
      },
      {
        id: "C000003",
        target_task_id: "TEST-E001-S002",
        comment_type: "agent",
        content: "Task done, not consumed",
        author: { type: "agent", agent_id: "agent-3" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: [],
        references: [],
      },
      {
        id: "C000004",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Young comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(5),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    const remainingIds = updated.comments.map((c) => c.id);

    // C000001: consumed + old -> deleted
    expect(remainingIds).not.toContain("C000001");
    // C000002: not consumed, task not done -> kept
    expect(remainingIds).toContain("C000002");
    // C000003: task done + old -> deleted
    expect(remainingIds).not.toContain("C000003");
    // C000004: young -> kept even though consumed
    expect(remainingIds).toContain("C000004");
  });

  it("handles human-authored comments (no agent_id for consumed_by check)", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "in_progress" },
    ]);

    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "human",
        content: "Human note",
        author: { type: "human", name: "Alice" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: [],
        references: [],
      },
    ]);

    await gcRun({ dryRun: false });

    const indexPath = path.join(pmDir, "comments", "index.yaml");
    const updated = yaml.load(
      fs.readFileSync(indexPath, "utf8"),
    ) as { comments: Array<{ id: string }> };
    // Human-authored comments have no target agent_id, so consumed check is false
    // Task is not done, so this comment should be kept
    expect(updated.comments.find((c) => c.id === "C000001")).toBeDefined();
  });
});

describe("gc --dry-run produces output without side effects (E047-S005)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  function writeCommentIndex(pmDir: string, comments: unknown[]) {
    const commentsDir = path.join(pmDir, "comments");
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
    }
    const indexPath = path.join(commentsDir, "index.yaml");
    const content = yaml.dump(
      {
        comments,
        by_task: {},
        last_updated: new Date().toISOString(),
      },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  function writeEpic(
    pmDir: string,
    epicId: string,
    stories: Array<{ code: string; status: string }>,
  ) {
    const epicsDir = path.join(pmDir, "epics");
    fs.writeFileSync(
      path.join(epicsDir, `${epicId}-test.yaml`),
      yaml.dump({
        id: epicId,
        code: `TEST-${epicId}`,
        title: "Test Epic",
        status: "in_progress",
        priority: "medium",
        created_at: "2026-01-01",
        stories: stories.map((s, i) => ({
          id: `S${String(i + 1).padStart(3, "0")}`,
          code: s.code,
          title: `Story ${i + 1}`,
          status: s.status,
          priority: "medium",
          story_points: 1,
        })),
      }),
      "utf8",
    );
  }

  function writeReport(
    reportsDir: string,
    filename: string,
    content: Record<string, unknown>,
  ) {
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, yaml.dump(content, { indent: 2 }), "utf8");
    return filePath;
  }

  function writeAdrIndex(pmDir: string, adrs: unknown[]) {
    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const content = yaml.dump(
      { adrs, last_updated: new Date().toISOString() },
      { indent: 2 },
    );
    fs.writeFileSync(indexPath, content, "utf8");
    return indexPath;
  }

  it("--dry-run does not delete comments", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "done" },
    ]);

    const indexPath = writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Eligible for deletion",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    const beforeContent = fs.readFileSync(indexPath, "utf8");

    await gcRun({ "dry-run": true });

    const afterContent = fs.readFileSync(indexPath, "utf8");
    expect(afterContent).toBe(beforeContent);

    const lines = out.log().join("\n");
    expect(lines).toContain("Would delete");
    expect(lines).toContain("C000001");
  });

  it("--dry-run does not archive reports", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ "dry-run": true });

    // Report should still exist
    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(true);
    // Archive should not be created
    const archiveDir = path.join(reportsDir, "archive");
    expect(fs.existsSync(archiveDir)).toBe(false);

    const lines = out.log().join("\n");
    expect(lines).toContain("Would archive report");
  });

  it("--dry-run does not mark ADRs as superseded", async () => {
    const pmDir = process.env["PM_HOME"]!;
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(100),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001", description: "Replaces" },
        ],
      },
    ]);

    await gcRun({ "dry-run": true });

    const indexPath = path.join(pmDir, "ADR-000.yaml");
    const updated = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
      adrs: Array<{ id: string; status: string }>;
    };
    // ADR-001 should still be accepted (not superseded)
    expect(updated.adrs.find((a) => a.id === "ADR-001")?.status).toBe(
      "accepted",
    );

    const lines = out.log().join("\n");
    expect(lines).toContain("Would mark");
    expect(lines).toContain("ADR-001");
  });

  it("--dry-run with all three entity types produces combined output", async () => {
    const pmDir = process.env["PM_HOME"]!;

    // Set up eligible comments
    writeEpic(pmDir, "E001", [
      { code: "TEST-E001-S001", status: "done" },
    ]);
    writeCommentIndex(pmDir, [
      {
        id: "C000001",
        target_task_id: "TEST-E001-S001",
        comment_type: "agent",
        content: "Eligible comment",
        author: { type: "agent", agent_id: "agent-1" },
        timestamp: daysAgo(35),
        tags: [],
        consolidated: true,
        consumed_by: ["agent-1"],
        references: [],
      },
    ]);

    // Set up eligible reports
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });

    // Set up eligible ADRs
    writeAdrIndex(pmDir, [
      {
        id: "ADR-001",
        status: "accepted",
        title: "Old decision",
        created_at: daysAgo(100),
        references: [],
      },
      {
        id: "ADR-002",
        status: "accepted",
        title: "New decision",
        references: [
          { type: "supersedes", id: "ADR-001" },
        ],
      },
    ]);

    await gcRun({ "dry-run": true });

    const lines = out.log().join("\n");
    // Should mention all three types
    expect(lines).toContain("Would delete");
    expect(lines).toContain("Would archive report");
    expect(lines).toContain("Would mark");
    // And show the dry-run label
    expect(lines).toContain("dry-run");
  });

  it("dryRun option (camelCase) works the same as dry-run (kebab-case)", async () => {
    const pmDir = process.env["PM_HOME"]!;
    const reportsDir = path.join(pmDir, "reports");
    writeReport(reportsDir, "TEST-E001-S001-report.yaml", {
      task_id: "TEST-E001-S001",
      agent_id: "test-agent",
      timestamp: daysAgo(10),
      status: "complete",
      consolidated: true,
    });

    await gcRun({ dryRun: true });

    // Report should still exist
    expect(
      fs.existsSync(path.join(reportsDir, "TEST-E001-S001-report.yaml")),
    ).toBe(true);

    const lines = out.log().join("\n");
    expect(lines).toContain("dry-run");
  });
});
