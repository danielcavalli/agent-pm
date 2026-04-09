import { z } from "zod";
import { StoryCodeSchema } from "./story.schema.js";

const IsoDatetimeSchema = z
  .string()
  .datetime({ message: "Must be ISO 8601 datetime" });

export const MetricDirectionSchema = z.enum([
  "higher_is_better",
  "lower_is_better",
]);
export type MetricDirection = z.infer<typeof MetricDirectionSchema>;

export const MeasurementMethodSchema = z.enum(["derived"]);
export type MeasurementMethod = z.infer<typeof MeasurementMethodSchema>;

export const MeasurementSourceSchema = z.enum([
  "story_result",
  "heartbeat",
  "escalation",
]);
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;

export const TacticSchema = z.object({
  name: z.string().min(1, "Tactic name is required"),
  description: z.string().min(1, "Tactic description is required"),
  metric: z.string().min(1, "Metric key is required"),
  direction: MetricDirectionSchema,
  weight: z.number().min(0).max(1),
  measurement: MeasurementMethodSchema,
  source: MeasurementSourceSchema,
});
export type Tactic = z.infer<typeof TacticSchema>;

export const TacticsSchema = z.object({
  version: z.number().int().positive(),
  tactics: z.array(TacticSchema),
  profiles: z.record(
    z.string(),
    z.record(z.string(), z.number().min(0).max(1)),
  ),
});
export type Tactics = z.infer<typeof TacticsSchema>;

export const StrategySchema = z
  .object({
    version: z.number().int().positive(),
    config_version: z.number().int().nonnegative(),
    parameters: z.object({
      dispatch: z.object({
        max_concurrent_agents: z.number().int().min(1).max(20),
      }),
      heartbeat: z.object({
        frequency_seconds: z.number().int().min(5).max(60),
        stale_threshold_seconds: z.number().int().min(30).max(300),
      }),
      escalation: z.object({
        confidence_autonomous: z.number().min(0.5).max(1),
        confidence_review: z.number().min(0).max(0.85),
        max_pending_escalations: z.number().int().min(1).max(10),
      }),
      experiment: z.object({
        observation_window_stories: z.number().int().min(5).max(50),
        claim_ttl_seconds: z.number().int().min(300).max(3600),
      }),
    }),
  })
  .refine(
    (strategy) =>
      strategy.parameters.heartbeat.stale_threshold_seconds >=
      strategy.parameters.heartbeat.frequency_seconds * 3,
    {
      message:
        "parameters.heartbeat.stale_threshold_seconds must be at least 3x parameters.heartbeat.frequency_seconds",
      path: ["parameters", "heartbeat", "stale_threshold_seconds"],
    },
  );
export type Strategy = z.infer<typeof StrategySchema>;

export const ObservationStatusSchema = z.enum(["done", "blocked", "failed"]);
export type ObservationStatus = z.infer<typeof ObservationStatusSchema>;

export const StoryResultSchema = z.object({
  code: StoryCodeSchema,
  title: z.string().min(1, "title is required"),
  status: ObservationStatusSchema,
  criteria_verified: z.array(z.string()).default([]),
  criteria_failed: z.array(z.string()).default([]),
  blockers: z.array(StoryCodeSchema).default([]),
  discoveries: z.array(StoryCodeSchema).default([]),
  reflection: z.string().default(""),
});
export type StoryResult = z.infer<typeof StoryResultSchema>;

export const ObservationRecordSchema = z.object({
  story_code: StoryCodeSchema,
  status: ObservationStatusSchema,
  criteria_verified: z.array(z.string()),
  criteria_failed: z.array(z.string()),
  metrics: z.record(z.string(), z.number()),
  strategy_hash: z.string().min(1, "strategy_hash is required"),
  board_hash: z.string().min(1, "board_hash is required"),
  config_version: z.number().int().nonnegative().default(0),
  started_at: IsoDatetimeSchema,
  completed_at: IsoDatetimeSchema,
});
export type ObservationRecord = z.infer<typeof ObservationRecordSchema>;

export const ClaimTypeSchema = z.enum([
  "runtime_config",
  "board_mutation",
  "tactic_suggestion",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const ClaimStatusSchema = z.enum(["active", "completed", "expired"]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  type: ClaimTypeSchema,
  description: z.string().min(1, "description is required"),
  parameter_path: z.string().min(1).optional(),
  new_value: z.unknown().optional(),
  pm_commands: z.array(z.string()).optional(),
  claimed_at: IsoDatetimeSchema,
  ttl_seconds: z.number().int().positive(),
  status: ClaimStatusSchema,
});
export type Claim = z.infer<typeof ClaimSchema>;

export const MutationTypeSchema = z.enum(["runtime_config", "board_mutation"]);
export type MutationType = z.infer<typeof MutationTypeSchema>;

export const LoopStepSchema = z.enum([
  "ANALYZE",
  "HYPOTHESIZE",
  "CLAIM",
  "CONFIGURE",
  "OBSERVE",
  "EVALUATE",
  "DECIDE",
  "PUBLISH",
]);
export type LoopStep = z.infer<typeof LoopStepSchema>;

export const ResultStatusSchema = z.enum(["keep", "discard", "error"]);
export type ResultStatus = z.infer<typeof ResultStatusSchema>;

export const TacticScoreSchema = z.object({
  value: z.number(),
  direction: MetricDirectionSchema,
});
export type TacticScore = z.infer<typeof TacticScoreSchema>;

export const LoopResultSummarySchema = z.object({
  experiment_id: z.string().min(1, "experiment_id is required"),
  mutation_type: MutationTypeSchema,
  composite_score: z.number(),
  decision: ResultStatusSchema,
  summary: z.string().min(1, "summary is required"),
  completed_at: IsoDatetimeSchema,
});
export type LoopResultSummary = z.infer<typeof LoopResultSummarySchema>;

export const LoopStateSchema = z.object({
  current_iteration: z.number().int().positive(),
  last_completed_step: LoopStepSchema,
  current_experiment_id: z.string().min(1, "current_experiment_id is required"),
  recent_summaries: z.array(LoopResultSummarySchema).max(3),
  started_at: IsoDatetimeSchema,
});
export type LoopState = z.infer<typeof LoopStateSchema>;

export const HypothesizeStepOutputSchema = z.object({
  mutation_type: MutationTypeSchema,
  description: z.string().min(1, "description is required"),
  expected_effect: z.string().min(1, "expected_effect is required"),
});
export type HypothesizeStepOutput = z.infer<typeof HypothesizeStepOutputSchema>;

export const ConfigureBoardStepOutputSchema = z.object({
  mutation_type: z.literal("board_mutation"),
  commit_hash: z.string().min(1, "commit_hash is required"),
  board_hash: z.string().min(1, "board_hash is required"),
});

export const ConfigureRuntimeStepOutputSchema = z.object({
  mutation_type: z.literal("runtime_config"),
  config_version: z.number().int().nonnegative(),
  strategy_hash: z.string().min(1, "strategy_hash is required"),
});

export const ConfigureStepOutputSchema = z.union([
  ConfigureBoardStepOutputSchema,
  ConfigureRuntimeStepOutputSchema,
]);
export type ConfigureStepOutput = z.infer<typeof ConfigureStepOutputSchema>;

export const EvaluateStepOutputSchema = z.object({
  composite_score: z.number(),
  tactic_scores: z.record(z.string(), TacticScoreSchema),
  previous_best_score: z.number().nullable().optional(),
  delta_vs_previous_best: z.number().optional(),
});
export type EvaluateStepOutput = z.infer<typeof EvaluateStepOutputSchema>;

export const ExperimentResultOutputSchema = z.object({
  experiment_id: z.string().min(1, "experiment_id is required"),
  mutation_type: MutationTypeSchema,
  hypothesis: z.string().min(1, "hypothesis is required"),
  change_description: z.string().min(1, "change_description is required"),
  observation_window: z.number().int().positive(),
  composite_score: z.number(),
  previous_best_score: z.number().nullable(),
  decision: z.enum(["keep", "discard"]),
  insight: z.string().min(1, "insight is required"),
});
export type ExperimentResultOutput = z.infer<
  typeof ExperimentResultOutputSchema
>;

const RuntimeConfigChangeDetailsSchema = z.object({
  parameter_path: z.string().min(1, "parameter_path is required"),
  old_value: z.unknown(),
  new_value: z.unknown(),
});

const BoardMutationChangeDetailsSchema = z.object({
  pm_commands: z.array(z.string()).min(1),
  board_commit: z.string().min(1, "board_commit is required"),
});

export const ChangeDetailsSchema = z.union([
  RuntimeConfigChangeDetailsSchema,
  BoardMutationChangeDetailsSchema,
]);
export type ChangeDetails = z.infer<typeof ChangeDetailsSchema>;

export const ExperimentResultSchema = z.object({
  experiment_id: z.string().min(1, "experiment_id is required"),
  agent_id: z.string().min(1, "agent_id is required"),
  mutation_type: MutationTypeSchema,
  description: z.string().min(1, "description is required"),
  change_details: ChangeDetailsSchema,
  status: ResultStatusSchema,
  observation_window_stories: z.number().int().positive(),
  tactic_scores: z.record(z.string(), TacticScoreSchema),
  composite_score: z.number(),
  delta_vs_previous_best: z.number(),
  strategy_snapshot: z.record(z.string(), z.unknown()),
  board_hash: z.string().min(1, "board_hash is required"),
  started_at: IsoDatetimeSchema,
  completed_at: IsoDatetimeSchema,
});
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;

export const HypothesisTypeSchema = z.enum([
  "parameter_change",
  "board_mutation",
  "tactic_suggestion",
]);
export type HypothesisType = z.infer<typeof HypothesisTypeSchema>;

export const HypothesisStatusSchema = z.enum([
  "unclaimed",
  "claimed",
  "completed",
  "rejected",
]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

export const SuggestedChangeSchema = z.object({
  parameter_path: z.string().min(1).optional(),
  new_value: z.unknown().optional(),
  pm_commands: z.array(z.string()).optional(),
  expected_effect: z.string().min(1, "expected_effect is required"),
});
export type SuggestedChange = z.infer<typeof SuggestedChangeSchema>;

export const HypothesisSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  title: z.string().min(1, "title is required"),
  type: HypothesisTypeSchema,
  hypothesis: z.string().min(1, "hypothesis is required"),
  suggested_change: SuggestedChangeSchema,
  evidence_keys: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5),
  status: HypothesisStatusSchema,
  requires_human_review: z.boolean().default(false),
  created_at: IsoDatetimeSchema,
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const InsightSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  insight: z.string().min(1, "insight is required"),
  evidence_keys: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  posted_at: IsoDatetimeSchema,
});
export type Insight = z.infer<typeof InsightSchema>;

export const BestMetadataStatusSchema = z.enum(["active", "awaiting-baseline"]);
export type BestMetadataStatus = z.infer<typeof BestMetadataStatusSchema>;

export const BestMetadataSchema = z.object({
  status: BestMetadataStatusSchema.default("active"),
  composite_score: z.number().nullable(),
  experiment_id: z.string().min(1, "experiment_id is required"),
  strategy_snapshot: z.record(z.string(), z.unknown()),
  board_hash: z.string().min(1, "board_hash is required"),
  updated_at: IsoDatetimeSchema,
  previous_best_score: z.number().nullable().optional(),
  previous_best_experiment_id: z.string().optional(),
});
export type BestMetadata = z.infer<typeof BestMetadataSchema>;

export const NormalizationStatEntrySchema = z.object({
  count: z.number().int().nonnegative(),
  mean: z.number(),
  variance: z.number().min(0),
  ewma_mean: z.number(),
  ewma_variance: z.number().min(0),
});
export type NormalizationStatEntry = z.infer<
  typeof NormalizationStatEntrySchema
>;

export const NormalizationStatsSchema = z.record(
  z.string(),
  NormalizationStatEntrySchema,
);
export type NormalizationStats = z.infer<typeof NormalizationStatsSchema>;
