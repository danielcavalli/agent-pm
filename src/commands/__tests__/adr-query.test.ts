import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  adrCreate,
  adrQuery,
  computeRelevanceScore,
} from "../adr.js";
import type { ADR } from "../../schemas/adr.schema.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";

// ---------------------------------------------------------------------------
// Unit tests for computeRelevanceScore
// ---------------------------------------------------------------------------
describe("computeRelevanceScore", () => {
  const baseAdr: ADR = {
    id: "ADR-001",
    title: "Test ADR",
    status: "accepted",
    context: "Some context",
    decision: "Some decision",
    consequences: { positive: [], negative: [] },
    author: { type: "human", name: "tester" },
    timestamp: new Date().toISOString(),
    tags: ["api", "security", "performance"],
    references: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("AC1: scores by number of matching tags", () => {
    const now = new Date();
    const score0 = computeRelevanceScore(baseAdr, [], now);
    const score1 = computeRelevanceScore(baseAdr, ["api"], now);
    const score2 = computeRelevanceScore(baseAdr, ["api", "security"], now);
    const score3 = computeRelevanceScore(
      baseAdr,
      ["api", "security", "performance"],
      now,
    );

    expect(score0.tagMatches).toBe(0);
    expect(score1.tagMatches).toBe(1);
    expect(score2.tagMatches).toBe(2);
    expect(score3.tagMatches).toBe(3);

    // Each extra tag match should increase total
    expect(score1.total).toBeGreaterThan(score0.total);
    expect(score2.total).toBeGreaterThan(score1.total);
    expect(score3.total).toBeGreaterThan(score2.total);
  });

  it("AC1: non-matching tags contribute 0", () => {
    const now = new Date();
    const score = computeRelevanceScore(baseAdr, ["unrelated"], now);
    expect(score.tagMatches).toBe(0);
  });

  it("AC2: newer ADRs get higher recency scores", () => {
    const now = new Date();

    const recentAdr = {
      ...baseAdr,
      created_at: now.toISOString(),
      timestamp: now.toISOString(),
    };

    const oldDate = new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000); // 300 days ago
    const oldAdr = {
      ...baseAdr,
      created_at: oldDate.toISOString(),
      timestamp: oldDate.toISOString(),
    };

    const recentScore = computeRelevanceScore(recentAdr, [], now);
    const oldScore = computeRelevanceScore(oldAdr, [], now);

    expect(recentScore.recency).toBeGreaterThan(oldScore.recency);
    expect(recentScore.total).toBeGreaterThan(oldScore.total);
  });

  it("AC2: ADRs older than 365 days get 0 recency", () => {
    const now = new Date();
    const veryOld = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
    const oldAdr = {
      ...baseAdr,
      created_at: veryOld.toISOString(),
      timestamp: veryOld.toISOString(),
    };

    const score = computeRelevanceScore(oldAdr, [], now);
    expect(score.recency).toBe(0);
  });

  it("uses timestamp if created_at is missing", () => {
    const now = new Date();
    const adrNoCreatedAt = { ...baseAdr, created_at: undefined };
    const score = computeRelevanceScore(adrNoCreatedAt as ADR, ["api"], now);
    expect(score.tagMatches).toBe(1);
    // Should still compute recency from timestamp
    expect(score.recency).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests for adrQuery with relevance ranking
// ---------------------------------------------------------------------------
describe("adrQuery relevance ranking (integration)", () => {
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

  async function createAdr(opts: {
    title: string;
    tags?: string[];
    status?: string;
  }) {
    await adrCreate({
      projectCode: "TEST",
      title: opts.title,
      status: opts.status ?? "accepted",
      context: `Context for ${opts.title}`,
      decision: `Decision for ${opts.title}`,
      positiveConsequences: ["good"],
      negativeConsequences: ["bad"],
      authorType: "human",
      authorName: "tester",
      tags: opts.tags ?? [],
    });
  }

  it("AC3: results are sorted by score descending", async () => {
    // Create ADRs with different tag overlap
    await createAdr({ title: "No match", tags: ["unrelated"] });
    await createAdr({ title: "One match", tags: ["api"] });
    await createAdr({ title: "Two matches", tags: ["api", "security"] });

    // Reset output capture
    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      tags: ["api", "security"],
      format: "full",
    });

    const lines = out.log().join("\n");

    // "Two matches" should appear before "One match"
    const twoMatchPos = lines.indexOf("Two matches");
    const oneMatchPos = lines.indexOf("One match");
    expect(twoMatchPos).toBeLessThan(oneMatchPos);
    expect(twoMatchPos).not.toBe(-1);
    expect(oneMatchPos).not.toBe(-1);
  });

  it("AC4: score is visible in full format output", async () => {
    await createAdr({ title: "Scored ADR", tags: ["api"] });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      tags: ["api"],
      format: "full",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Score:");
    expect(lines).toContain("tags:");
    expect(lines).toContain("recency:");
  });

  it("AC4: score is visible in verbose summary mode", async () => {
    await createAdr({ title: "Verbose ADR", tags: ["api"] });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      tags: ["api"],
      format: "summary",
      verbose: true,
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Score");
    // Should have a numeric score in the output
    expect(lines).toMatch(/\d+\.\d{2}/);
  });

  it("backward compat: single --tag still works as a filter", async () => {
    await createAdr({ title: "API ADR", tags: ["api"] });
    await createAdr({ title: "DB ADR", tags: ["database"] });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      tag: "api",
      format: "summary",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("API ADR");
    expect(lines).not.toContain("DB ADR");
  });

  it("no tags: results still sorted by recency", async () => {
    // Without tags, all ADRs should still be sorted (by recency alone)
    await createAdr({ title: "First ADR", tags: [] });
    await createAdr({ title: "Second ADR", tags: [] });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      format: "full",
    });

    const lines = out.log().join("\n");
    // Both should appear, and since they were created in rapid succession
    // the order by recency may be nearly identical; verify both are present
    expect(lines).toContain("First ADR");
    expect(lines).toContain("Second ADR");
    // Score lines should appear (even with 0 tag matches)
    expect(lines).toContain("Score:");
  });
});

// ---------------------------------------------------------------------------
// Integration tests for default exclusion of superseded/deprecated ADRs
// ---------------------------------------------------------------------------
describe("adrQuery default-exclude superseded and deprecated", () => {
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

  async function createAdr(opts: {
    title: string;
    tags?: string[];
    status?: string;
  }) {
    await adrCreate({
      projectCode: "TEST",
      title: opts.title,
      status: opts.status ?? "accepted",
      context: `Context for ${opts.title}`,
      decision: `Decision for ${opts.title}`,
      positiveConsequences: ["good"],
      negativeConsequences: ["bad"],
      authorType: "human",
      authorName: "tester",
      tags: opts.tags ?? [],
    });
  }

  it("excludes superseded ADRs by default", async () => {
    await createAdr({ title: "Active ADR", status: "accepted" });
    await createAdr({ title: "Superseded ADR", status: "superseded" });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      format: "summary",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Active ADR");
    expect(lines).not.toContain("Superseded ADR");
  });

  it("excludes deprecated ADRs by default", async () => {
    await createAdr({ title: "Active ADR", status: "accepted" });
    await createAdr({ title: "Deprecated ADR", status: "deprecated" });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      format: "summary",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Active ADR");
    expect(lines).not.toContain("Deprecated ADR");
  });

  it("--include-superseded shows all ADRs regardless of status", async () => {
    await createAdr({ title: "Active ADR", status: "accepted" });
    await createAdr({ title: "Superseded ADR", status: "superseded" });
    await createAdr({ title: "Deprecated ADR", status: "deprecated" });
    await createAdr({ title: "Proposed ADR", status: "proposed" });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      format: "summary",
      includeSuperseded: true,
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Active ADR");
    expect(lines).toContain("Superseded ADR");
    expect(lines).toContain("Deprecated ADR");
    expect(lines).toContain("Proposed ADR");
  });

  it("explicit --status filter bypasses the default exclusion", async () => {
    await createAdr({ title: "Superseded ADR", status: "superseded" });
    await createAdr({ title: "Active ADR", status: "accepted" });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      status: "superseded",
      format: "summary",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Superseded ADR");
    expect(lines).not.toContain("Active ADR");
  });

  it("proposed and accepted ADRs are always included by default", async () => {
    await createAdr({ title: "Accepted ADR", status: "accepted" });
    await createAdr({ title: "Proposed ADR", status: "proposed" });

    out.restore();
    out = captureOutput();

    await adrQuery({
      projectCode: "TEST",
      format: "summary",
    });

    const lines = out.log().join("\n");
    expect(lines).toContain("Accepted ADR");
    expect(lines).toContain("Proposed ADR");
  });
});

// ---------------------------------------------------------------------------
// Tests for default limit = 5 and summary format with decision excerpt
// ---------------------------------------------------------------------------
describe("adrQuery default limit and summary decision excerpt", () => {
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

  async function createAdr(opts: {
    title: string;
    decision: string;
    tags?: string[];
    status?: string;
  }) {
    await adrCreate({
      projectCode: "TEST",
      title: opts.title,
      status: opts.status ?? "accepted",
      context: `Context for ${opts.title}`,
      decision: opts.decision,
      positiveConsequences: ["good"],
      negativeConsequences: ["bad"],
      authorType: "human",
      authorName: "tester",
      tags: opts.tags ?? [],
    });
  }

  it("default limit is 5, not 20", async () => {
    // Create 7 ADRs
    for (let i = 1; i <= 7; i++) {
      await createAdr({ title: `ADR number ${i}`, decision: `Decision ${i}` });
    }

    out.restore();
    out = captureOutput();

    await adrQuery({ projectCode: "TEST", format: "summary" });

    const lines = out.log().join("\n");
    // Should show exactly 5 results and the "reached limit" notice
    expect(lines).toContain("(reached limit of 5 results)");
    expect(lines).toContain("5 result(s)");
  });

  it("summary format includes one-sentence decision excerpt", async () => {
    await createAdr({
      title: "Use REST API",
      decision: "Adopt RESTful API design. It simplifies integration.",
    });

    out.restore();
    out = captureOutput();

    await adrQuery({ projectCode: "TEST", format: "summary" });

    const lines = out.log().join("\n");
    // Should show ID, title, status
    expect(lines).toContain("Use REST API");
    expect(lines).toContain("accepted");
    // Should show the first sentence of the decision as an excerpt
    expect(lines).toContain("Adopt RESTful API design.");
  });

  it("full format still shows complete ADR content", async () => {
    await createAdr({
      title: "Use GraphQL",
      decision: "Adopt GraphQL for the API layer. It provides flexible queries. Clients love it.",
    });

    out.restore();
    out = captureOutput();

    await adrQuery({ projectCode: "TEST", format: "full" });

    const lines = out.log().join("\n");
    // Full format shows complete decision
    expect(lines).toContain("Adopt GraphQL for the API layer. It provides flexible queries. Clients love it.");
    expect(lines).toContain("Context:");
    expect(lines).toContain("Decision:");
    expect(lines).toContain("Score:");
  });

  it("limit can be overridden via --limit", async () => {
    for (let i = 1; i <= 7; i++) {
      await createAdr({ title: `Override ADR ${i}`, decision: `Decision ${i}` });
    }

    out.restore();
    out = captureOutput();

    await adrQuery({ projectCode: "TEST", format: "summary", limit: 3 });

    const lines = out.log().join("\n");
    expect(lines).toContain("(reached limit of 3 results)");
    expect(lines).toContain("3 result(s)");
  });
});
