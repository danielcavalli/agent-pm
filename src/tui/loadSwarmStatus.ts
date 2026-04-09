import * as fs from "node:fs";
import * as path from "node:path";
import { readYaml } from "../lib/fs.js";
import { buildAnalysisSummary } from "../lib/swarm-store.js";
import type { ImprovementTrend } from "../lib/swarm-store.js";
import { StrategySchema } from "../schemas/index.js";
import type { SwarmStatusData } from "./types.js";

const BOARD_MUTATION_DIMENSIONS = [
  "priority_changes",
  "dependency_changes",
  "story_splits",
] as const;

const DEFAULT_RUNTIME_DIMENSIONS = [
  "dispatch.max_concurrent_agents",
  "heartbeat.frequency_seconds",
  "heartbeat.stale_threshold_seconds",
  "escalation.confidence_autonomous",
  "escalation.confidence_review",
  "escalation.max_pending_escalations",
  "experiment.observation_window_stories",
  "experiment.claim_ttl_seconds",
] as const;

function collectParameterPaths(
  value: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (typeof child === "object" && child !== null && !Array.isArray(child)) {
      return collectParameterPaths(
        child as Record<string, unknown>,
        nextPrefix,
      );
    }

    return [nextPrefix];
  });
}

function loadRuntimeDimensions(pmDir: string, discovered: string[]): string[] {
  const strategyPath = path.join(pmDir, "swarm", "strategy.yaml");
  const known = new Set<string>(DEFAULT_RUNTIME_DIMENSIONS);

  try {
    const strategy = readYaml(strategyPath, StrategySchema);
    collectParameterPaths(strategy.parameters).forEach((dimension) => {
      known.add(dimension);
    });
  } catch {
    // Ignore strategy loading errors in the TUI and fall back to discovered data.
  }

  discovered.forEach((dimension) => {
    known.add(dimension);
  });

  return Array.from(known);
}

function buildExplorationCoverage(
  pmDir: string,
  coverage: Awaited<
    ReturnType<typeof buildAnalysisSummary>
  >["exploration_coverage"],
): SwarmStatusData["explorationCoverage"] {
  const boardDimensionSet = new Set<string>(BOARD_MUTATION_DIMENSIONS);
  const runtimeDimensions = loadRuntimeDimensions(
    pmDir,
    Object.keys(coverage.runtime_config),
  ).map((name) => ({
    name,
    count: coverage.runtime_config[name] ?? 0,
  }));

  const boardNames = [
    ...BOARD_MUTATION_DIMENSIONS,
    ...Object.keys(coverage.board_mutations).filter(
      (name) => !boardDimensionSet.has(name),
    ),
  ];

  return [
    {
      key: "runtime",
      label: "Runtime",
      dimensions: runtimeDimensions,
    },
    {
      key: "board",
      label: "Board",
      dimensions: boardNames.map((name) => ({
        name,
        count: coverage.board_mutations[name] ?? 0,
      })),
    },
  ];
}

function isSidebarClaim(
  claim: Awaited<
    ReturnType<typeof buildAnalysisSummary>
  >["active_claims"][number],
): claim is SwarmStatusData["activeExperimentClaims"][number] & {
  key: string;
  expiresAt: string;
} {
  return (
    claim.mutationType === "runtime_config" ||
    claim.mutationType === "board_mutation"
  );
}

const TREND_COLORS: Record<ImprovementTrend, string> = {
  improving: "green",
  plateaued: "yellow",
  regressing: "red",
};

export async function loadSwarmStatus(
  pmDir: string,
): Promise<SwarmStatusData | null> {
  if (!fs.existsSync(path.join(pmDir, "swarm"))) {
    return null;
  }

  const summary = await buildAnalysisSummary(pmDir);

  return {
    trend: summary.improvement_trend,
    trendColor: TREND_COLORS[summary.improvement_trend],
    experimentCount: summary.experiment_count,
    bestScore: summary.global_best?.composite_score ?? null,
    activeClaims: summary.active_claims.length,
    explorationCoverage: buildExplorationCoverage(
      pmDir,
      summary.exploration_coverage,
    ),
    recentResults: summary.recent_results.slice(0, 5).map((result) => ({
      experimentId: result.experiment_id,
      decision: result.decision,
      score: result.composite_score,
      description: result.description,
    })),
    activeExperimentClaims: summary.active_claims
      .filter(isSidebarClaim)
      .map((claim) => ({
        agentId: claim.agentId,
        claimedAt: claim.claimedAt,
        mutationType: claim.mutationType,
      })),
  };
}
