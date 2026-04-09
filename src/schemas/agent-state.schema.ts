import { z } from "zod";

export const AgentStatusSchema = z.enum([
  "active",
  "idle",
  "needs_attention",
  "blocked",
  "completed",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentProcessMethodSchema = z.enum(["tmux", "background"]);
export type AgentProcessMethod = z.infer<typeof AgentProcessMethodSchema>;

export const EscalationTypeSchema = z.enum([
  "decision",
  "clarification",
  "approval",
  "error",
]);
export type EscalationType = z.infer<typeof EscalationTypeSchema>;

export const EscalationSchema = z.object({
  type: EscalationTypeSchema,
  message: z.string().min(1, "Escalation message is required"),
  confidence: z.number().min(0).max(1),
  options: z.array(z.string()).optional(),
});
export type Escalation = z.infer<typeof EscalationSchema>;

export const CriterionStatusValueSchema = z.enum(["pending", "done", "failed"]);
export type CriterionStatusValue = z.infer<typeof CriterionStatusValueSchema>;

export const CriterionStatusSchema = z.object({
  criterion: z.string().min(1, "criterion is required"),
  status: CriterionStatusValueSchema,
});
export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;

export const AgentProgressSchema = z.object({
  total_criteria: z.number().int().min(0),
  completed_criteria: z.number().int().min(0),
  current_step: z.string().min(1, "current_step is required"),
  criteria_status: z.array(CriterionStatusSchema),
});
export type AgentProgress = z.infer<typeof AgentProgressSchema>;

const IsoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "Must be an ISO 8601 datetime (e.g. 2026-03-13T10:00:00Z)",
  );

export const AgentStateSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  session_id: z.string().optional(),
  log_file: z.string().optional(),
  status: AgentStatusSchema,
  current_task: z.string().optional(),
  started_at: IsoDateTimeSchema,
  last_heartbeat: IsoDateTimeSchema,
  progress_summary: z.string().optional(),
  progress: AgentProgressSchema.optional(),
  escalation: EscalationSchema.optional(),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentProcessSchema = z.object({
  pid: z.number().int().positive(),
  spawned_at: IsoDateTimeSchema,
  command: z.string().min(1, "command is required"),
  method: AgentProcessMethodSchema,
});
export type AgentProcess = z.infer<typeof AgentProcessSchema>;

export const AgentResponseSchema = z.object({
  selected_option: z.string().optional(),
  additional_context: z.string().optional(),
  responded_at: IsoDateTimeSchema,
});
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
