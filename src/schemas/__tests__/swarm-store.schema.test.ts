import { describe, expect, it } from "vitest";
import {
  BestMetadataSchema,
  ClaimSchema,
  ConfigureStepOutputSchema,
  EvaluateStepOutputSchema,
  ExperimentResultSchema,
  ExperimentResultOutputSchema,
  HypothesisSchema,
  HypothesizeStepOutputSchema,
  InsightSchema,
  LoopStateSchema,
  NormalizationStatsSchema,
  ObservationRecordSchema,
  StoryResultSchema,
  StrategySchema,
  TacticsSchema,
} from "../index.js";

describe("TacticsSchema", () => {
  const validTactics = {
    version: 1,
    tactics: [
      {
        name: "throughput",
        description: "Stories completed per wall-clock hour",
        metric: "stories_per_hour",
        direction: "higher_is_better",
        weight: 0.25,
        measurement: "derived",
        source: "story_result",
      },
    ],
    profiles: {
      balanced: {
        throughput: 0.25,
      },
    },
  };

  it("accepts a valid tactics payload", () => {
    expect(TacticsSchema.safeParse(validTactics).success).toBe(true);
  });

  it("rejects invalid metric direction", () => {
    expect(
      TacticsSchema.safeParse({
        ...validTactics,
        tactics: [{ ...validTactics.tactics[0], direction: "sideways" }],
      }).success,
    ).toBe(false);
  });
});

describe("StrategySchema", () => {
  const validStrategy = {
    version: 1,
    config_version: 1,
    parameters: {
      dispatch: { max_concurrent_agents: 5 },
      heartbeat: { frequency_seconds: 15, stale_threshold_seconds: 60 },
      escalation: {
        confidence_autonomous: 0.85,
        confidence_review: 0.5,
        max_pending_escalations: 3,
      },
      experiment: { observation_window_stories: 10, claim_ttl_seconds: 900 },
    },
  };

  it("accepts a valid strategy payload", () => {
    expect(StrategySchema.safeParse(validStrategy).success).toBe(true);
  });

  it("rejects out-of-range dispatch parameters", () => {
    expect(
      StrategySchema.safeParse({
        ...validStrategy,
        parameters: {
          ...validStrategy.parameters,
          dispatch: { max_concurrent_agents: 21 },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects heartbeat thresholds below three heartbeat intervals", () => {
    const result = StrategySchema.safeParse({
      ...validStrategy,
      parameters: {
        ...validStrategy.parameters,
        heartbeat: {
          frequency_seconds: 15,
          stale_threshold_seconds: 30,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 3x");
    }
  });
});

describe("ObservationRecordSchema", () => {
  const validObservation = {
    story_code: "PM-E057-S001",
    status: "done",
    criteria_verified: ["Schema file exists"],
    criteria_failed: [],
    metrics: { stories_per_hour: 2.3 },
    strategy_hash: "abc123",
    board_hash: "def456",
    config_version: 1,
    started_at: "2026-03-14T10:30:00Z",
    completed_at: "2026-03-14T11:15:00Z",
  };

  it("accepts a valid observation record", () => {
    expect(ObservationRecordSchema.safeParse(validObservation).success).toBe(
      true,
    );
  });

  it("rejects invalid status values", () => {
    expect(
      ObservationRecordSchema.safeParse({
        ...validObservation,
        status: "backlog",
      }).success,
    ).toBe(false);
  });

  it("defaults config_version to 0 when omitted", () => {
    const { config_version: _configVersion, ...legacyObservation } =
      validObservation;

    const parsed = ObservationRecordSchema.parse(legacyObservation);
    expect(parsed.config_version).toBe(0);
  });
});

describe("StoryResultSchema", () => {
  const validStoryResult = {
    code: "PM-E058-S002",
    title: "Parse STORY_RESULT from sub-agent stdout",
    status: "done",
    criteria_verified: ["parser returns typed object"],
    criteria_failed: [],
    blockers: [],
    discoveries: [],
    reflection: "",
  };

  it("accepts a valid STORY_RESULT payload", () => {
    expect(StoryResultSchema.safeParse(validStoryResult).success).toBe(true);
  });

  it("rejects invalid blocker story codes", () => {
    expect(
      StoryResultSchema.safeParse({
        ...validStoryResult,
        blockers: ["not-a-story"],
      }).success,
    ).toBe(false);
  });
});

describe("ClaimSchema", () => {
  const validClaim = {
    agent_id: "agent-exp-01",
    type: "runtime_config",
    description: "Increase max_concurrent_agents from 5 to 7",
    parameter_path: "dispatch.max_concurrent_agents",
    new_value: 7,
    claimed_at: "2026-03-14T10:30:00Z",
    ttl_seconds: 900,
    status: "active",
  };

  it("accepts a valid claim payload", () => {
    expect(ClaimSchema.safeParse(validClaim).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { agent_id: _agentId, ...invalidClaim } = validClaim;
    expect(ClaimSchema.safeParse(invalidClaim).success).toBe(false);
  });
});

describe("ExperimentResultSchema", () => {
  const validResult = {
    experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
    agent_id: "agent-exp-01",
    mutation_type: "runtime_config",
    description: "Increase max_concurrent_agents from 5 to 7",
    change_details: {
      parameter_path: "dispatch.max_concurrent_agents",
      old_value: 5,
      new_value: 7,
    },
    status: "keep",
    observation_window_stories: 10,
    tactic_scores: {
      throughput: { value: 3.2, direction: "higher_is_better" },
    },
    composite_score: 0.72,
    delta_vs_previous_best: 0.04,
    strategy_snapshot: { version: 1 },
    board_hash: "sha256-123",
    started_at: "2026-03-14T10:30:00Z",
    completed_at: "2026-03-14T11:15:00Z",
  };

  it("accepts a valid experiment result", () => {
    expect(ExperimentResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("rejects invalid result status", () => {
    expect(
      ExperimentResultSchema.safeParse({
        ...validResult,
        status: "completed",
      }).success,
    ).toBe(false);
  });
});

describe("LoopStateSchema", () => {
  const validLoopState = {
    current_iteration: 3,
    last_completed_step: "PUBLISH",
    current_experiment_id:
      "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
    recent_summaries: [
      {
        experiment_id: "2026-03-14T08:00:00Z-agent-exp-01-baseline",
        mutation_type: "runtime_config",
        composite_score: 0.68,
        decision: "keep",
        summary: "Baseline established under the current strategy.",
        completed_at: "2026-03-14T08:15:00Z",
      },
      {
        experiment_id: "2026-03-14T09:00:00Z-agent-exp-01-raise-concurrency",
        mutation_type: "runtime_config",
        composite_score: 0.72,
        decision: "keep",
        summary: "Higher concurrency improved throughput.",
        completed_at: "2026-03-14T09:20:00Z",
      },
      {
        experiment_id: "2026-03-14T10:00:00Z-agent-exp-01-priority-shift",
        mutation_type: "board_mutation",
        composite_score: 0.7,
        decision: "discard",
        summary: "Priority shift increased churn without improving output.",
        completed_at: "2026-03-14T10:25:00Z",
      },
    ],
    started_at: "2026-03-14T07:45:00Z",
  };

  it("accepts valid loop state payloads", () => {
    expect(LoopStateSchema.safeParse(validLoopState).success).toBe(true);
  });

  it("rejects more than three recent summaries", () => {
    expect(
      LoopStateSchema.safeParse({
        ...validLoopState,
        recent_summaries: [
          ...validLoopState.recent_summaries,
          {
            experiment_id: "2026-03-14T11:00:00Z-agent-exp-01-another",
            mutation_type: "runtime_config",
            composite_score: 0.69,
            decision: "error",
            summary: "Fallback run after invalid write.",
            completed_at: "2026-03-14T11:30:00Z",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid loop step names", () => {
    expect(
      LoopStateSchema.safeParse({
        ...validLoopState,
        last_completed_step: "REPEAT",
      }).success,
    ).toBe(false);
  });
});

describe("step output schemas", () => {
  it("accepts valid HYPOTHESIZE output", () => {
    expect(
      HypothesizeStepOutputSchema.safeParse({
        mutation_type: "runtime_config",
        description: "Increase max_concurrent_agents from 5 to 7",
        expected_effect: "Improve throughput without increasing idle time",
      }).success,
    ).toBe(true);
  });

  it("rejects HYPOTHESIZE output missing expected_effect", () => {
    expect(
      HypothesizeStepOutputSchema.safeParse({
        mutation_type: "runtime_config",
        description: "Increase max_concurrent_agents from 5 to 7",
      }).success,
    ).toBe(false);
  });

  it("accepts CONFIGURE output for board mutations", () => {
    expect(
      ConfigureStepOutputSchema.safeParse({
        mutation_type: "board_mutation",
        commit_hash: "abc123def456",
        board_hash: "sha256-board",
      }).success,
    ).toBe(true);
  });

  it("accepts CONFIGURE output for runtime mutations", () => {
    expect(
      ConfigureStepOutputSchema.safeParse({
        mutation_type: "runtime_config",
        config_version: 2,
        strategy_hash: "sha256-strategy",
      }).success,
    ).toBe(true);
  });

  it("rejects CONFIGURE output without commit hash or config version", () => {
    expect(
      ConfigureStepOutputSchema.safeParse({
        mutation_type: "runtime_config",
        strategy_hash: "sha256-strategy",
      }).success,
    ).toBe(false);
  });

  it("accepts valid EVALUATE output", () => {
    expect(
      EvaluateStepOutputSchema.safeParse({
        composite_score: 0.74,
        tactic_scores: {
          throughput: { value: 3.2, direction: "higher_is_better" },
          waste: { value: 0.12, direction: "lower_is_better" },
        },
        previous_best_score: 0.7,
        delta_vs_previous_best: 0.04,
      }).success,
    ).toBe(true);
  });

  it("rejects EVALUATE output missing tactic_scores", () => {
    expect(
      EvaluateStepOutputSchema.safeParse({
        composite_score: 0.74,
      }).success,
    ).toBe(false);
  });

  it("accepts valid EXPERIMENT_RESULT output", () => {
    expect(
      ExperimentResultOutputSchema.safeParse({
        experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
        mutation_type: "runtime_config",
        hypothesis:
          "Increasing max_concurrent_agents from 5 to 7 will improve throughput",
        change_description: "dispatch.max_concurrent_agents: 5 -> 7",
        observation_window: 10,
        composite_score: 0.72,
        previous_best_score: 0.68,
        decision: "keep",
        insight:
          "Higher concurrency improved throughput by 12% without increasing waste ratio",
      }).success,
    ).toBe(true);
  });

  it("rejects EXPERIMENT_RESULT output with invalid decision", () => {
    expect(
      ExperimentResultOutputSchema.safeParse({
        experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
        mutation_type: "runtime_config",
        hypothesis:
          "Increasing max_concurrent_agents from 5 to 7 will improve throughput",
        change_description: "dispatch.max_concurrent_agents: 5 -> 7",
        observation_window: 10,
        composite_score: 0.72,
        previous_best_score: 0.68,
        decision: "error",
        insight:
          "Higher concurrency improved throughput by 12% without increasing waste ratio",
      }).success,
    ).toBe(false);
  });
});

describe("HypothesisSchema", () => {
  const validHypothesis = {
    agent_id: "agent-exp-01",
    title: "Reprioritize E057-S003 to high",
    type: "board_mutation",
    hypothesis:
      "Raising S003 priority will unblock the evaluation engine earlier.",
    suggested_change: {
      pm_commands: ["pm story update PM-E057-S003 --priority high"],
      expected_effect: "S003 scheduled in an earlier tier",
    },
    evidence_keys: ["2026-03-14T09:00:00Z-agent-exp-02-sequential-same-epic"],
    priority: 2,
    status: "unclaimed",
    created_at: "2026-03-14T10:30:00Z",
  };

  it("accepts a valid hypothesis", () => {
    expect(HypothesisSchema.safeParse(validHypothesis).success).toBe(true);
  });

  it("defaults requires_human_review to false", () => {
    const result = HypothesisSchema.parse(validHypothesis);

    expect(result.requires_human_review).toBe(false);
  });

  it("rejects invalid priority values", () => {
    expect(
      HypothesisSchema.safeParse({
        ...validHypothesis,
        priority: 6,
      }).success,
    ).toBe(false);
  });
});

describe("InsightSchema", () => {
  const validInsight = {
    agent_id: "agent-exp-01",
    insight: "Higher concurrency improved throughput without increasing waste.",
    evidence_keys: ["2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency"],
    tags: ["concurrency", "throughput"],
    posted_at: "2026-03-14T11:16:00Z",
  };

  it("accepts a valid insight", () => {
    expect(InsightSchema.safeParse(validInsight).success).toBe(true);
  });

  it("rejects invalid timestamps", () => {
    expect(
      InsightSchema.safeParse({
        ...validInsight,
        posted_at: "03/14/2026 11:16",
      }).success,
    ).toBe(false);
  });
});

describe("BestMetadataSchema", () => {
  const validMetadata = {
    status: "active",
    composite_score: 0.72,
    experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
    strategy_snapshot: { version: 1, config_version: 2 },
    board_hash: "sha256-123",
    updated_at: "2026-03-14T11:16:00Z",
    previous_best_score: 0.68,
    previous_best_experiment_id: "2026-03-14T08:00:00Z-agent-exp-02-baseline",
  };

  it("accepts active best metadata", () => {
    expect(BestMetadataSchema.safeParse(validMetadata).success).toBe(true);
  });

  it("accepts awaiting-baseline placeholder metadata", () => {
    expect(
      BestMetadataSchema.safeParse({
        ...validMetadata,
        status: "awaiting-baseline",
        composite_score: null,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid status values", () => {
    expect(
      BestMetadataSchema.safeParse({
        ...validMetadata,
        status: "pending",
      }).success,
    ).toBe(false);
  });
});

describe("NormalizationStatsSchema", () => {
  const validStats = {
    stories_per_hour: {
      count: 11,
      mean: 2.5,
      variance: 0.4,
      ewma_mean: 2.7,
      ewma_variance: 0.35,
    },
  };

  it("accepts valid per-metric normalization stats", () => {
    expect(NormalizationStatsSchema.safeParse(validStats).success).toBe(true);
  });

  it("rejects invalid per-metric entries", () => {
    expect(
      NormalizationStatsSchema.safeParse({
        stories_per_hour: {
          ...validStats.stories_per_hour,
          count: -1,
        },
      }).success,
    ).toBe(false);
  });
});
