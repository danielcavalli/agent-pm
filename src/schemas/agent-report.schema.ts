import { z } from "zod";

const MAX_ITEMS_DEFAULT = 10;
const MAX_CHARS_DEFAULT = 500;

export const ItemTypeSchema = z.enum(["episodic", "semantic"], {
  errorMap: () => ({
    message:
      'Type must be either "episodic" (historical narrative for consolidation context) or "semantic" (ADR candidate, eligible for promotion)',
  }),
});
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const ExecutionReportStatusSchema = z.enum(["complete", "partial"]);
export type ExecutionReportStatus = z.infer<typeof ExecutionReportStatusSchema>;

export const DecisionItemSchema = z.object({
  type: ItemTypeSchema,
  text: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Text must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
});
export type DecisionItem = z.infer<typeof DecisionItemSchema>;

export const AssumptionItemSchema = z.object({
  type: ItemTypeSchema,
  text: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Text must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
});
export type AssumptionItem = z.infer<typeof AssumptionItemSchema>;

export const TradeoffItemSchema = z.object({
  alternative: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Alternative must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
  reason: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Reason must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
});
export type TradeoffItem = z.infer<typeof TradeoffItemSchema>;

export const OutOfScopeItemSchema = z.object({
  observation: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Observation must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
  note: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Note must not exceed ${MAX_CHARS_DEFAULT} characters`,
    )
    .optional(),
});
export type OutOfScopeItem = z.infer<typeof OutOfScopeItemSchema>;

export const PotentialConflictItemSchema = z.object({
  assumption: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Assumption must not exceed ${MAX_CHARS_DEFAULT} characters`,
    ),
  confidence: z.enum(["low", "medium", "high"]),
  note: z
    .string()
    .max(
      MAX_CHARS_DEFAULT,
      `Note must not exceed ${MAX_CHARS_DEFAULT} characters`,
    )
    .optional(),
});
export type PotentialConflictItem = z.infer<typeof PotentialConflictItemSchema>;

export const AgentExecutionReportSchema = z.object({
  task_id: z.string().regex(/^[A-Z]{2,6}-E\d{3}-S\d{3}$/, {
    message: "Task ID must match pattern PROJECT-ENNN-SNNN (e.g. PM-E030-S001)",
  }),
  agent_id: z
    .string()
    .min(1, "Agent ID is required")
    .max(100, "Agent ID must not exceed 100 characters"),
  timestamp: z
    .string()
    .datetime({ message: "Timestamp must be ISO 8601 datetime" }),
  status: ExecutionReportStatusSchema,
  decisions: z
    .array(DecisionItemSchema)
    .max(
      MAX_ITEMS_DEFAULT,
      `Decisions must not exceed ${MAX_ITEMS_DEFAULT} items`,
    )
    .default([]),
  assumptions: z
    .array(AssumptionItemSchema)
    .max(
      MAX_ITEMS_DEFAULT,
      `Assumptions must not exceed ${MAX_ITEMS_DEFAULT} items`,
    )
    .default([]),
  tradeoffs: z
    .array(TradeoffItemSchema)
    .max(
      MAX_ITEMS_DEFAULT,
      `Tradeoffs must not exceed ${MAX_ITEMS_DEFAULT} items`,
    )
    .default([]),
  out_of_scope: z
    .array(OutOfScopeItemSchema)
    .max(
      MAX_ITEMS_DEFAULT,
      `Out of scope items must not exceed ${MAX_ITEMS_DEFAULT} items`,
    )
    .default([]),
  potential_conflicts: z
    .array(PotentialConflictItemSchema)
    .max(
      MAX_ITEMS_DEFAULT,
      `Potential conflicts must not exceed ${MAX_ITEMS_DEFAULT} items`,
    )
    .default([]),
});

export type AgentExecutionReport = z.infer<typeof AgentExecutionReportSchema>;

export const AGENT_REPORT_SCHEMA_SPEC = `
# Agent Execution Report Schema
#
# This schema defines the structure for post-task execution reports produced by agents
# after completing a story. Reports capture decisions, assumptions, tradeoffs, and
# observations to support the consolidation agent's work.
#
# Sidecar file naming: <story-id>-report.yaml (e.g., PM-E030-S001-report.yaml)

task_id: string (required)
  Reference to the completed story (e.g., PM-E030-S001).
  Pattern: PROJECT-ENNN-SNNN

agent_id: string (required)
  Identifier for the agent that completed the task.

timestamp: string (required)
  ISO 8601 datetime when the report was created.

status: enum (required)
  Values: "complete" | "partial"

decisions: array<DecisionItem> (optional, max 10 items)
  List of choices made and their rationale.
  DecisionItem:
    - type: enum "episodic" | "semantic" (required)
      "episodic" = historical narrative, for consolidation context only
      "semantic" = ADR candidate, eligible for promotion
    - text: string (required, max 500 chars)

assumptions: array<AssumptionItem> (optional, max 10 items)
  List of priors the agent relied on that were not validated.
  AssumptionItem:
    - type: enum "episodic" | "semantic" (required)
    - text: string (required, max 500 chars)

tradeoffs: array<TradeoffItem> (optional, max 10 items)
  Alternatives considered and rejected.
  TradeoffItem:
    - alternative: string (required, max 500 chars)
    - reason: string (required, max 500 chars)

out_of_scope: array<OutOfScopeItem> (optional, max 10 items)
  Observations that surfaced but were not acted on.
  OutOfScopeItem:
    - observation: string (required, max 500 chars)
    - note: string (optional, max 500 chars)

potential_conflicts: array<PotentialConflictItem> (optional, max 10 items)
  Self-flagged assumptions the agent knows are uncertain or likely to conflict
  with other agents' work. Implements the Reflexion verbal self-reflection pattern,
  converting episodic uncertainty into a prior signal for the consolidation agent.
  PotentialConflictItem:
    - assumption: string (required, max 500 chars)
    - confidence: enum "low" | "medium" | "high" (required)
    - note: string (optional, max 500 chars)
`;
