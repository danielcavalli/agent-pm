import { z } from "zod";

export const AgentStatusSchema = z.enum([
  "active",
  "idle",
  "needs_attention",
  "blocked",
  "completed",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

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

const IsoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "Must be an ISO 8601 datetime (e.g. 2026-03-13T10:00:00Z)",
  );

export const AgentStateSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  session_id: z.string().optional(),
  status: AgentStatusSchema,
  current_task: z.string().optional(),
  started_at: IsoDateTimeSchema,
  last_heartbeat: IsoDateTimeSchema,
  progress_summary: z.string().optional(),
  escalation: EscalationSchema.optional(),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentResponseSchema = z.object({
  selected_option: z.string().optional(),
  additional_context: z.string().optional(),
  responded_at: IsoDateTimeSchema,
});
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
