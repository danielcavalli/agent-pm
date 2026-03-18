import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  structuralDedup,
  normalizeText,
  diceSimilarity,
  bigrams,
  detectContradiction,
  extractItems,
  FUZZY_THRESHOLD,
} from "../structural-dedup.js";
import type { LoadedReport } from "../consolidate.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { resetProjectCodeCache } from "../../lib/codes.js";

/**
 * Helper to create a LoadedReport in-memory (no filesystem needed).
 */
function makeReport(
  taskId: string,
  decisions: Array<{ type: "episodic" | "semantic"; text: string }> = [],
  assumptions: Array<{ type: "episodic" | "semantic"; text: string }> = [],
): LoadedReport {
  return {
    filePath: `/tmp/fake/${taskId}-report.yaml`,
    data: {
      task_id: taskId,
      agent_id: "test-agent",
      timestamp: "2026-03-12T10:00:00Z",
      status: "complete",
      decisions,
      assumptions,
      tradeoffs: [],
      out_of_scope: [],
      potential_conflicts: [],
      consolidated: false,
    },
  };
}

// ── Unit tests for helper functions ──────────────────────────────────────────

describe("normalizeText", () => {
  it("lowercases text", () => {
    expect(normalizeText("Use TypeScript")).toBe("use typescript");
  });

  it("collapses whitespace", () => {
    expect(normalizeText("use   typescript   for   all")).toBe(
      "use typescript for all",
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  use typescript  ")).toBe("use typescript");
  });

  it("normalizes quotes", () => {
    expect(normalizeText("use 'single' and \"double\" quotes")).toBe(
      "use 'single' and 'double' quotes",
    );
  });

  it("normalizes dashes", () => {
    expect(normalizeText("use em\u2014dash and en\u2013dash")).toBe(
      "use em-dash and en-dash",
    );
  });
});

describe("bigrams", () => {
  it("produces correct bigrams", () => {
    const result = bigrams("abc");
    expect(result).toEqual(new Set(["ab", "bc"]));
  });

  it("returns empty set for single char", () => {
    expect(bigrams("a").size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    expect(bigrams("").size).toBe(0);
  });
});

describe("diceSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(diceSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(diceSimilarity("abc", "xyz")).toBe(0);
  });

  it("returns high similarity for near-duplicates", () => {
    const sim = diceSimilarity(
      "use typescript for all modules",
      "use typescript for all module",
    );
    expect(sim).toBeGreaterThan(0.9);
  });

  it("returns moderate similarity for related strings", () => {
    const sim = diceSimilarity(
      "use typescript",
      "avoid typescript",
    );
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.8);
  });

  it("handles empty strings", () => {
    expect(diceSimilarity("", "")).toBe(1);
    expect(diceSimilarity("a", "")).toBe(0);
  });
});

describe("detectContradiction", () => {
  it("detects 'use X' vs 'do not use X'", () => {
    const result = detectContradiction("use Redux", "do not use Redux");
    expect(result).not.toBeNull();
    expect(result).toContain("contradicts");
  });

  it("detects 'use X' vs 'avoid X'", () => {
    const result = detectContradiction("use Redux", "avoid Redux");
    expect(result).not.toBeNull();
  });

  it("returns null for identical texts", () => {
    expect(detectContradiction("use Redux", "use Redux")).toBeNull();
  });

  it("returns null for unrelated texts", () => {
    expect(
      detectContradiction("use TypeScript", "prefer Zod for validation"),
    ).toBeNull();
  });

  it("detects negation with 'never'", () => {
    const result = detectContradiction("use mutable state", "never use mutable state");
    expect(result).not.toBeNull();
  });

  it("is case-insensitive", () => {
    const result = detectContradiction("Use Redux", "Do Not Use Redux");
    expect(result).not.toBeNull();
  });
});

describe("extractItems", () => {
  it("extracts decisions and assumptions from reports", () => {
    const reports = [
      makeReport(
        "PM-E001-S001",
        [{ type: "semantic", text: "Use TypeScript" }],
        [{ type: "episodic", text: "API is stable" }],
      ),
    ];

    const items = extractItems(reports);
    expect(items).toHaveLength(2);
    expect(items[0]!.category).toBe("decision");
    expect(items[0]!.text).toBe("Use TypeScript");
    expect(items[1]!.category).toBe("assumption");
    expect(items[1]!.text).toBe("API is stable");
  });

  it("extracts from multiple reports", () => {
    const reports = [
      makeReport("PM-E001-S001", [
        { type: "semantic", text: "Use TypeScript" },
      ]),
      makeReport("PM-E001-S002", [{ type: "semantic", text: "Use Zod" }]),
    ];

    const items = extractItems(reports);
    expect(items).toHaveLength(2);
    expect(items[0]!.reportId).toBe("PM-E001-S001");
    expect(items[1]!.reportId).toBe("PM-E001-S002");
  });

  it("returns empty for reports with no decisions or assumptions", () => {
    const reports = [makeReport("PM-E001-S001")];
    const items = extractItems(reports);
    expect(items).toHaveLength(0);
  });
});

// ── Integration tests for structuralDedup ────────────────────────────────────

describe("structural deduplication (E042-S003)", () => {
  // ── AC1: Exact string matching identifies duplicate decisions ──

  describe("AC1: Exact string matching", () => {
    it("identifies exact duplicate decisions across reports", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript for all new modules" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use TypeScript for all new modules" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.content).toBe(
        "Use TypeScript for all new modules",
      );
      expect(result.candidates[0]!.sourceReportIds).toContain("PM-E001-S001");
      expect(result.candidates[0]!.sourceReportIds).toContain("PM-E001-S002");
      expect(result.stats.exactMatches).toBe(2);
    });

    it("identifies exact duplicate assumptions across reports", () => {
      const reports = [
        makeReport(
          "PM-E001-S001",
          [],
          [{ type: "episodic", text: "The API is stable" }],
        ),
        makeReport(
          "PM-E001-S002",
          [],
          [{ type: "episodic", text: "The API is stable" }],
        ),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.content).toBe("The API is stable");
      expect(result.stats.exactMatches).toBe(2);
    });

    it("exact matching is case-insensitive and whitespace-normalized", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "use typescript" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.stats.exactMatches).toBe(2);
    });

    it("does not count items from the same report as duplicates", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Use TypeScript" },
        ]),
      ];

      const result = structuralDedup(reports);

      // Same report, so no cross-report match
      expect(result.candidates).toHaveLength(0);
      expect(result.stats.exactMatches).toBe(0);
    });

    it("groups three reports with the same decision", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Prefer Zod for validation" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Prefer Zod for validation" },
        ]),
        makeReport("PM-E001-S003", [
          { type: "semantic", text: "Prefer Zod for validation" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.sourceReportIds).toHaveLength(3);
      expect(result.stats.exactMatches).toBe(3);
    });
  });

  // ── AC2: Fuzzy matching catches near-duplicates ──

  describe("AC2: Fuzzy matching near-duplicates", () => {
    it("catches near-duplicate decisions with minor wording differences", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          {
            type: "semantic",
            text: "Use TypeScript for all new modules in the project",
          },
        ]),
        makeReport("PM-E001-S002", [
          {
            type: "semantic",
            text: "Use TypeScript for all new module in the project",
          },
        ]),
      ];

      const result = structuralDedup(reports);

      // Should match as fuzzy (the texts differ by one char: "modules" vs "module")
      const totalMatched =
        result.stats.exactMatches + result.stats.fuzzyMatches;
      expect(totalMatched).toBeGreaterThan(0);
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it("does not fuzzy-match very different strings", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript for all modules" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Prefer PostgreSQL for data storage" },
        ]),
      ];

      const result = structuralDedup(reports);

      // These are too different to match
      expect(result.candidates).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it("respects the fuzzy threshold", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript for all new modules" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use TypeScript for some new modules" },
        ]),
      ];

      // With a very high threshold, these shouldn't match
      const strict = structuralDedup(reports, { fuzzyThreshold: 0.99 });
      expect(strict.candidates).toHaveLength(0);

      // With a lower threshold, they should match
      const lenient = structuralDedup(reports, { fuzzyThreshold: 0.7 });
      expect(lenient.candidates.length).toBeGreaterThan(0);
    });
  });

  // ── AC3: Contradicting decisions are flagged as conflicts ──

  describe("AC3: Conflict detection", () => {
    it("flags contradicting decisions across reports", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "use Redux" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "do not use Redux" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.reason).toContain("contradicts");
      expect(result.conflicts[0]!.itemA.reportId).toBe("PM-E001-S001");
      expect(result.conflicts[0]!.itemB.reportId).toBe("PM-E001-S002");
      expect(result.stats.conflicts).toBe(1);
    });

    it("flags 'avoid' as contradicting the positive form", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "use mutable state" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "avoid use mutable state" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it("does not flag same-report decisions as conflicts", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "use Redux" },
          { type: "semantic", text: "do not use Redux" },
        ]),
      ];

      const result = structuralDedup(reports);

      // Same report, so no cross-report conflict
      expect(result.conflicts).toHaveLength(0);
    });

    it("does not flag assumptions as conflicts (only decisions)", () => {
      const reports = [
        makeReport(
          "PM-E001-S001",
          [],
          [{ type: "episodic", text: "use Redux" }],
        ),
        makeReport(
          "PM-E001-S002",
          [],
          [{ type: "episodic", text: "do not use Redux" }],
        ),
      ];

      const result = structuralDedup(reports);

      // Only decisions are checked for conflicts
      expect(result.conflicts).toHaveLength(0);
    });
  });

  // ── AC4: Matched items are grouped into synthesis candidates ──

  describe("AC4: Synthesis candidate grouping", () => {
    it("groups exact matches into synthesis candidates", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use Zod for validation" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use Zod for validation" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.type).toBe("confirmed_decision");
      expect(result.candidates[0]!.content).toBe("Use Zod for validation");
      expect(result.candidates[0]!.sourceReportIds).toEqual(
        expect.arrayContaining(["PM-E001-S001", "PM-E001-S002"]),
      );
    });

    it("produces multiple candidates from different groups", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Use Zod" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Use Zod" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(2);
    });
  });

  // ── AC5: Unmatched items are passed to the LLM semantic phase ──

  describe("AC5: Unmatched items pass-through", () => {
    it("passes unmatched items through", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Unique decision only in S001" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Another unique decision in S002" },
        ]),
      ];

      const result = structuralDedup(reports);

      // "Use TypeScript" matched, the other two are unmatched
      expect(result.candidates).toHaveLength(1);
      expect(result.unmatched).toHaveLength(2);
      expect(result.unmatched.map((u) => u.text)).toContain(
        "Unique decision only in S001",
      );
      expect(result.unmatched.map((u) => u.text)).toContain(
        "Another unique decision in S002",
      );
    });

    it("all items are unmatched when no duplicates exist", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Decision A" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Decision B" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
      expect(result.stats.unmatchedCount).toBe(2);
    });

    it("unmatched items preserve reportId and category", () => {
      const reports = [
        makeReport(
          "PM-E001-S001",
          [{ type: "semantic", text: "Decision X" }],
          [{ type: "episodic", text: "Assumption Y" }],
        ),
      ];

      const result = structuralDedup(reports);

      expect(result.unmatched).toHaveLength(2);
      const decision = result.unmatched.find(
        (u) => u.text === "Decision X",
      );
      const assumption = result.unmatched.find(
        (u) => u.text === "Assumption Y",
      );
      expect(decision).toBeDefined();
      expect(decision!.reportId).toBe("PM-E001-S001");
      expect(decision!.category).toBe("decision");
      expect(assumption).toBeDefined();
      expect(assumption!.category).toBe("assumption");
    });
  });

  // ── Edge cases ──

  describe("Edge cases", () => {
    it("handles empty report list", () => {
      const result = structuralDedup([]);

      expect(result.candidates).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
      expect(result.stats.totalItems).toBe(0);
    });

    it("handles reports with no decisions or assumptions", () => {
      const reports = [makeReport("PM-E001-S001"), makeReport("PM-E001-S002")];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
      expect(result.stats.totalItems).toBe(0);
    });

    it("handles a single report (nothing to deduplicate)", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript" },
          { type: "semantic", text: "Use Zod" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it("stats are consistent: total = exact + fuzzy + unmatched", () => {
      const reports = [
        makeReport("PM-E001-S001", [
          { type: "semantic", text: "Use TypeScript for all new modules" },
          { type: "semantic", text: "Unique to S001" },
        ]),
        makeReport("PM-E001-S002", [
          { type: "semantic", text: "Use TypeScript for all new modules" },
          { type: "semantic", text: "Unique to S002" },
        ]),
      ];

      const result = structuralDedup(reports);

      expect(result.stats.totalItems).toBe(4);
      expect(
        result.stats.exactMatches +
          result.stats.fuzzyMatches +
          result.stats.unmatchedCount,
      ).toBe(result.stats.totalItems);
    });
  });
});
