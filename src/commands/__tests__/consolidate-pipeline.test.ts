import { describe, it, expect } from "vitest";
import { structuralDedup } from "../structural-dedup.js";
import { mergeResults } from "../consolidate.js";
import type {
  SynthesisCandidate,
  SynthesisResult,
  LoadedReport,
} from "../consolidate.js";
import type { AgentExecutionReport } from "../../schemas/index.js";

/**
 * Helper to create a mock LoadedReport for testing.
 */
function makeReport(
  taskId: string,
  decisions: string[],
  assumptions: string[] = [],
): LoadedReport {
  return {
    filePath: `/tmp/reports/${taskId}-report.yaml`,
    data: {
      task_id: taskId,
      agent_id: "test-agent",
      timestamp: "2026-03-12T10:00:00Z",
      status: "complete",
      decisions: decisions.map((text) => ({ type: "semantic", text })),
      assumptions: assumptions.map((text) => ({ type: "semantic", text })),
      tradeoffs: [],
      out_of_scope: [],
      potential_conflicts: [],
      consolidated: false,
    } as AgentExecutionReport,
  };
}

describe("two-phase pipeline (E042-S007)", () => {
  // ── AC1: Structural dedup runs first and produces grouped findings ──

  describe("AC1: Structural dedup runs first", () => {
    it("structural dedup groups exact duplicates into candidates", () => {
      const reports = [
        makeReport("E001-S001", ["Use TypeScript for type safety"]),
        makeReport("E001-S002", ["Use TypeScript for type safety"]),
      ];

      const result = structuralDedup(reports);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.content).toBe(
        "Use TypeScript for type safety",
      );
      expect(result.candidates[0]!.sourceReportIds).toContain("E001-S001");
      expect(result.candidates[0]!.sourceReportIds).toContain("E001-S002");
      expect(result.unmatched).toHaveLength(0);
    });

    it("structural dedup produces unmatched items for unique decisions", () => {
      const reports = [
        makeReport("E001-S001", ["Use TypeScript"]),
        makeReport("E001-S002", ["Use YAML for config"]),
      ];

      const result = structuralDedup(reports);

      // Short texts won't fuzzy match, and they are from different reports
      // but no cross-report exact matches
      expect(result.candidates).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });
  });

  // ── AC2: LLM semantic clustering receives only unmatched items ──

  describe("AC2: LLM receives only unmatched items from structural phase", () => {
    it("structural dedup produces unmatched items that are separate from matched candidates", () => {
      const reports = [
        makeReport("E001-S001", [
          "Use TypeScript for type safety",
          "Adopt event-driven architecture for scalability",
        ]),
        makeReport("E001-S002", [
          "Use TypeScript for type safety",
          "Use YAML for configuration files",
        ]),
      ];

      const dedupResult = structuralDedup(reports);

      // "Use TypeScript" matches across reports -> candidate
      expect(dedupResult.candidates).toHaveLength(1);
      expect(dedupResult.candidates[0]!.content).toBe(
        "Use TypeScript for type safety",
      );

      // The other two decisions are unmatched
      expect(dedupResult.unmatched).toHaveLength(2);
      const unmatchedTexts = dedupResult.unmatched.map((u) => u.text);
      expect(unmatchedTexts).toContain(
        "Adopt event-driven architecture for scalability",
      );
      expect(unmatchedTexts).toContain("Use YAML for configuration files");
    });

    it("unmatched items from structural dedup have correct shape for LLM input", () => {
      const reports = [
        makeReport(
          "E001-S001",
          ["Unique decision A"],
          ["Unique assumption X"],
        ),
      ];

      const dedupResult = structuralDedup(reports);

      // All items are unmatched since there's only one report
      for (const item of dedupResult.unmatched) {
        expect(item).toHaveProperty("reportId");
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("text");
        expect(["decision", "assumption"]).toContain(item.category);
      }
    });
  });

  // ── AC3: Results from both phases are merged into a unified finding set ──

  describe("AC3: Merged unified finding set", () => {
    it("mergeResults combines structural and LLM candidates", () => {
      const structuralCandidates: SynthesisCandidate[] = [
        {
          type: "confirmed_decision",
          content: "Use TypeScript",
          sourceReportIds: ["E001-S001", "E001-S002"],
        },
      ];

      const llmResult: SynthesisResult = {
        candidates: [
          {
            type: "lesson_learned",
            content: "Error handling needs more attention",
            sourceReportIds: ["E001-S003"],
          },
        ],
        unmatched: [
          {
            reportId: "E001-S004",
            category: "assumption",
            text: "Some orphan assumption",
          },
        ],
        summary: "LLM synthesis summary",
      };

      const merged = mergeResults(structuralCandidates, llmResult);

      // Both candidates should be in the merged set
      expect(merged.candidates).toHaveLength(2);
      expect(merged.candidates[0]!.content).toBe("Use TypeScript");
      expect(merged.candidates[1]!.content).toBe(
        "Error handling needs more attention",
      );

      // Unmatched from LLM is the final unmatched set
      expect(merged.unmatched).toHaveLength(1);
      expect(merged.unmatched[0]!.text).toBe("Some orphan assumption");

      // Summary from LLM is preserved
      expect(merged.summary).toBe("LLM synthesis summary");
    });

    it("mergeResults with empty structural candidates returns only LLM results", () => {
      const structuralCandidates: SynthesisCandidate[] = [];

      const llmResult: SynthesisResult = {
        candidates: [
          {
            type: "confirmed_decision",
            content: "Adopt Zod for validation",
            sourceReportIds: ["E001-S001"],
          },
        ],
        unmatched: [],
        summary: "One decision found",
      };

      const merged = mergeResults(structuralCandidates, llmResult);

      expect(merged.candidates).toHaveLength(1);
      expect(merged.candidates[0]!.content).toBe("Adopt Zod for validation");
      expect(merged.unmatched).toHaveLength(0);
    });

    it("mergeResults with empty LLM results returns only structural results", () => {
      const structuralCandidates: SynthesisCandidate[] = [
        {
          type: "confirmed_decision",
          content: "Use TypeScript",
          sourceReportIds: ["E001-S001", "E001-S002"],
        },
      ];

      const llmResult: SynthesisResult = {
        candidates: [],
        unmatched: [],
        summary: "No items found",
      };

      const merged = mergeResults(structuralCandidates, llmResult);

      expect(merged.candidates).toHaveLength(1);
      expect(merged.candidates[0]!.content).toBe("Use TypeScript");
      expect(merged.unmatched).toHaveLength(0);
    });

    it("mergeResults with both empty returns empty", () => {
      const merged = mergeResults([], {
        candidates: [],
        unmatched: [],
        summary: "No items",
      });

      expect(merged.candidates).toHaveLength(0);
      expect(merged.unmatched).toHaveLength(0);
    });
  });

  // ── AC4: Output routing operates on the merged set, not separate sets ──

  describe("AC4: Output routing uses merged set", () => {
    it("merged result contains candidates from both phases for routing", () => {
      const reports = [
        makeReport("E001-S001", [
          "Use TypeScript for type safety",
          "Adopt event-driven architecture for better decoupling",
        ]),
        makeReport("E001-S002", [
          "Use TypeScript for type safety",
          "Use YAML for all configuration files in the system",
        ]),
      ];

      // Phase 1: Structural dedup
      const dedupResult = structuralDedup(reports);

      // Simulate Phase 2: LLM synthesis (mock result)
      const llmResult: SynthesisResult = {
        candidates: [
          {
            type: "rejected_alternative",
            content: "JSON considered but YAML chosen for readability",
            sourceReportIds: ["E001-S002"],
          },
        ],
        unmatched: [],
        summary: "Synthesis complete",
      };

      // Phase 3: Merge
      const mergedResult = mergeResults(dedupResult.candidates, llmResult);

      // The merged set should include both structural and LLM candidates
      expect(mergedResult.candidates.length).toBeGreaterThanOrEqual(
        dedupResult.candidates.length,
      );
      expect(mergedResult.candidates.length).toBe(
        dedupResult.candidates.length + llmResult.candidates.length,
      );

      // routeOutput would receive this merged set (we verify the shape is correct)
      const confirmedDecisions = mergedResult.candidates.filter(
        (c) => c.type === "confirmed_decision",
      );
      const rejectedAlternatives = mergedResult.candidates.filter(
        (c) => c.type === "rejected_alternative",
      );

      expect(confirmedDecisions.length).toBeGreaterThan(0);
      expect(rejectedAlternatives.length).toBe(1);
      expect(rejectedAlternatives[0]!.content).toBe(
        "JSON considered but YAML chosen for readability",
      );
    });
  });

  // ── AC5: Pipeline order is documented in code comments ──

  describe("AC5: Pipeline order documented", () => {
    it("consolidate.ts module has pipeline documentation comment", async () => {
      // Read the consolidate.ts file to verify documentation
      const fs = await import("node:fs");
      const content = fs.readFileSync(
        new URL("../consolidate.js", import.meta.url).pathname.replace(
          "/dist/",
          "/src/",
        ).replace(".js", ".ts"),
        "utf8",
      );

      // Verify the file-level pipeline documentation exists
      expect(content).toContain("Pipeline order:");
      expect(content).toContain("INGEST");
      expect(content).toContain("STRUCTURAL");
      expect(content).toContain("LLM");
      expect(content).toContain("MERGE");
      expect(content).toContain("ROUTE");
      expect(content).toContain("MARK");
    });

    it("synthesizeItems has pipeline position comment", async () => {
      const fs = await import("node:fs");
      const content = fs.readFileSync(
        new URL("../consolidate.js", import.meta.url).pathname.replace(
          "/dist/",
          "/src/",
        ).replace(".js", ".ts"),
        "utf8",
      );

      // Verify synthesizeItems documents its pipeline position
      expect(content).toContain(
        "Pipeline position: ingest -> structural dedup -> [THIS] -> merge -> route",
      );
    });

    it("mergeResults has pipeline position comment", async () => {
      const fs = await import("node:fs");
      const content = fs.readFileSync(
        new URL("../consolidate.js", import.meta.url).pathname.replace(
          "/dist/",
          "/src/",
        ).replace(".js", ".ts"),
        "utf8",
      );

      // Verify mergeResults documents its pipeline position
      expect(content).toContain(
        "Pipeline position: ingest -> structural dedup -> LLM semantic clustering -> [THIS] -> route",
      );
    });

    it("consolidate function has step comments for each phase", async () => {
      const fs = await import("node:fs");
      const content = fs.readFileSync(
        new URL("../consolidate.js", import.meta.url).pathname.replace(
          "/dist/",
          "/src/",
        ).replace(".js", ".ts"),
        "utf8",
      );

      // Verify each step is commented in the consolidate function
      expect(content).toContain("Step 1: INGEST");
      expect(content).toContain("Step 2: STRUCTURAL DEDUP (Phase 1)");
      expect(content).toContain("Step 3: LLM SEMANTIC CLUSTERING (Phase 2)");
      expect(content).toContain("Step 4: MERGE");
      expect(content).toContain("Step 5: ROUTE");
      expect(content).toContain("Step 6: MARK");
    });
  });

  // ── Integration: Full pipeline data flow ──

  describe("Integration: Pipeline data flow correctness", () => {
    it("items matched structurally are NOT included in unmatched set passed to LLM", () => {
      const reports = [
        makeReport("E001-S001", [
          "Use TypeScript for type safety",
          "Implement caching layer",
        ]),
        makeReport("E001-S002", [
          "Use TypeScript for type safety",
          "Add rate limiting",
        ]),
        makeReport("E001-S003", [
          "Use TypeScript for type safety",
          "Improve error handling",
        ]),
      ];

      const dedupResult = structuralDedup(reports);

      // "Use TypeScript" appears 3 times across 3 reports -> structural candidate
      expect(dedupResult.candidates).toHaveLength(1);
      expect(dedupResult.candidates[0]!.content).toBe(
        "Use TypeScript for type safety",
      );

      // The unique items should be unmatched
      const unmatchedTexts = dedupResult.unmatched.map((u) => u.text);
      expect(unmatchedTexts).not.toContain("Use TypeScript for type safety");
      expect(unmatchedTexts).toContain("Implement caching layer");
      expect(unmatchedTexts).toContain("Add rate limiting");
      expect(unmatchedTexts).toContain("Improve error handling");
    });

    it("full pipeline: structural matches + LLM results merge correctly", () => {
      // Simulate the full pipeline without an actual LLM
      const reports = [
        makeReport("E001-S001", [
          "Use TypeScript for type safety",
          "Adopt event-driven architecture for better decoupling and scalability",
        ]),
        makeReport("E001-S002", [
          "Use TypeScript for type safety",
          "Use YAML for all configuration files in the project",
        ]),
      ];

      // Phase 1: Structural dedup
      const dedupResult = structuralDedup(reports);
      expect(dedupResult.candidates.length).toBeGreaterThanOrEqual(1);

      // Phase 2: Simulated LLM result on unmatched items only
      const mockLlmResult: SynthesisResult = {
        candidates: [
          {
            type: "lesson_learned",
            content: "Configuration format affects developer experience",
            sourceReportIds: ["E001-S002"],
          },
        ],
        unmatched: [
          {
            reportId: "E001-S001",
            category: "decision",
            text: "Adopt event-driven architecture for better decoupling and scalability",
          },
        ],
        summary: "Mixed findings",
      };

      // Phase 3: Merge
      const merged = mergeResults(dedupResult.candidates, mockLlmResult);

      // Verify structural candidates are in merged set
      const hasTypeScript = merged.candidates.some(
        (c) => c.content === "Use TypeScript for type safety",
      );
      expect(hasTypeScript).toBe(true);

      // Verify LLM candidates are in merged set
      const hasLesson = merged.candidates.some(
        (c) => c.type === "lesson_learned",
      );
      expect(hasLesson).toBe(true);

      // Verify total count
      expect(merged.candidates.length).toBe(
        dedupResult.candidates.length + mockLlmResult.candidates.length,
      );

      // Verify unmatched items are from LLM output only
      expect(merged.unmatched).toEqual(mockLlmResult.unmatched);
    });
  });
});
