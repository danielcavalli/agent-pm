import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSwarmStatus } from "../loadSwarmStatus.js";
import * as swarmStore from "../../lib/swarm-store.js";

describe("loadSwarmStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when swarm storage is not initialized", async () => {
    const pmDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pm-load-swarm-status-"),
    );

    try {
      await expect(loadSwarmStatus(pmDir)).resolves.toBeNull();
    } finally {
      fs.rmSync(pmDir, { recursive: true, force: true });
    }
  });

  it("maps analysis summary fields into TUI status data", async () => {
    const pmDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pm-load-swarm-status-"),
    );
    fs.mkdirSync(path.join(pmDir, "swarm"), { recursive: true });

    const buildAnalysisSummarySpy = vi
      .spyOn(swarmStore, "buildAnalysisSummary")
      .mockResolvedValue({
        global_best: {
          status: "active",
          composite_score: 0.84,
          experiment_id: "exp-04",
          strategy_snapshot: { version: 1, config_version: 4 },
          board_hash: "sha256-best",
          updated_at: "2026-04-04T12:00:00Z",
        },
        recent_results: [
          {
            experiment_id: "exp-06",
            mutation_type: "board_mutation",
            decision: "discard",
            composite_score: 0.31,
            description:
              "Very long board mutation description that should remain available to the detail panel",
            completed_at: "2026-04-06T12:00:00Z",
          },
          {
            experiment_id: "exp-05",
            mutation_type: "runtime_config",
            decision: "keep",
            composite_score: 0.42,
            description: "Experiment five",
            completed_at: "2026-04-05T12:00:00Z",
          },
          {
            experiment_id: "exp-04",
            mutation_type: "board_mutation",
            decision: "keep",
            composite_score: 0.84,
            description: "Experiment four",
            completed_at: "2026-04-04T12:00:00Z",
          },
          {
            experiment_id: "exp-03",
            mutation_type: "runtime_config",
            decision: "keep",
            composite_score: 0.74,
            description: "Experiment three",
            completed_at: "2026-04-03T12:00:00Z",
          },
          {
            experiment_id: "exp-02",
            mutation_type: "board_mutation",
            decision: "discard",
            composite_score: 0.22,
            description: "Experiment two",
            completed_at: "2026-04-02T12:00:00Z",
          },
          {
            experiment_id: "exp-01",
            mutation_type: "runtime_config",
            decision: "keep",
            composite_score: 0.11,
            description: "Experiment one",
            completed_at: "2026-04-01T12:00:00Z",
          },
        ],
        active_claims: [
          {
            key: "raise-throughput",
            agentId: "agent-a",
            expiresAt: "2026-04-08T12:10:00.000Z",
            claimedAt: "2026-04-08T12:00:00.000Z",
            mutationType: "runtime_config",
          },
          {
            key: "split-backlog",
            agentId: "agent-b",
            expiresAt: "2026-04-08T12:20:00.000Z",
            claimedAt: "2026-04-08T12:05:00.000Z",
            mutationType: "board_mutation",
          },
        ],
        unclaimed_hypotheses: 1,
        agent_bests: [],
        trend: "improving",
        count: 4,
        coverage: {
          runtime_config: {},
          board_mutations: {},
        },
        improvement_trend: "improving",
        experiment_count: 4,
        exploration_coverage: {
          runtime_config: {},
          board_mutations: {},
        },
      });

    try {
      await expect(loadSwarmStatus(pmDir)).resolves.toEqual({
        trend: "improving",
        trendColor: "green",
        experimentCount: 4,
        bestScore: 0.84,
        activeClaims: 2,
        explorationCoverage: [
          {
            key: "runtime",
            label: "Runtime",
            dimensions: [
              { name: "dispatch.max_concurrent_agents", count: 0 },
              { name: "heartbeat.frequency_seconds", count: 0 },
              { name: "heartbeat.stale_threshold_seconds", count: 0 },
              { name: "escalation.confidence_autonomous", count: 0 },
              { name: "escalation.confidence_review", count: 0 },
              { name: "escalation.max_pending_escalations", count: 0 },
              { name: "experiment.observation_window_stories", count: 0 },
              { name: "experiment.claim_ttl_seconds", count: 0 },
            ],
          },
          {
            key: "board",
            label: "Board",
            dimensions: [
              { name: "priority_changes", count: 0 },
              { name: "dependency_changes", count: 0 },
              { name: "story_splits", count: 0 },
            ],
          },
        ],
        recentResults: [
          {
            experimentId: "exp-06",
            decision: "discard",
            score: 0.31,
            description:
              "Very long board mutation description that should remain available to the detail panel",
          },
          {
            experimentId: "exp-05",
            decision: "keep",
            score: 0.42,
            description: "Experiment five",
          },
          {
            experimentId: "exp-04",
            decision: "keep",
            score: 0.84,
            description: "Experiment four",
          },
          {
            experimentId: "exp-03",
            decision: "keep",
            score: 0.74,
            description: "Experiment three",
          },
          {
            experimentId: "exp-02",
            decision: "discard",
            score: 0.22,
            description: "Experiment two",
          },
        ],
        activeExperimentClaims: [
          {
            agentId: "agent-a",
            claimedAt: "2026-04-08T12:00:00.000Z",
            mutationType: "runtime_config",
          },
          {
            agentId: "agent-b",
            claimedAt: "2026-04-08T12:05:00.000Z",
            mutationType: "board_mutation",
          },
        ],
      });
      expect(buildAnalysisSummarySpy).toHaveBeenCalledWith(pmDir);
    } finally {
      fs.rmSync(pmDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["improving", "green"],
    ["plateaued", "yellow"],
    ["regressing", "red"],
  ] as const)("maps %s to %s", async (trend, trendColor) => {
    const pmDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pm-load-swarm-status-"),
    );
    fs.mkdirSync(path.join(pmDir, "swarm"), { recursive: true });

    vi.spyOn(swarmStore, "buildAnalysisSummary").mockResolvedValue({
      global_best: null,
      recent_results: [],
      active_claims: [],
      unclaimed_hypotheses: 0,
      agent_bests: [],
      trend,
      count: 0,
      coverage: {
        runtime_config: {},
        board_mutations: {},
      },
      improvement_trend: trend,
      experiment_count: 0,
      exploration_coverage: {
        runtime_config: {},
        board_mutations: {},
      },
    });

    try {
      await expect(loadSwarmStatus(pmDir)).resolves.toMatchObject({
        trend,
        trendColor,
        explorationCoverage: [
          {
            key: "runtime",
            label: "Runtime",
          },
          {
            key: "board",
            label: "Board",
          },
        ],
        recentResults: [],
        activeExperimentClaims: [],
      });
    } finally {
      fs.rmSync(pmDir, { recursive: true, force: true });
    }
  });
});
