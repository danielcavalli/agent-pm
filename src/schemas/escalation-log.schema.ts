import { z } from "zod";
import { EscalationSchema, AgentResponseSchema } from "./agent-state.schema.js";

export const EscalationLogEntrySchema = EscalationSchema.extend({
  selected_option: AgentResponseSchema.shape.selected_option,
  additional_context: AgentResponseSchema.shape.additional_context,
  responded_at: AgentResponseSchema.shape.responded_at.optional(),
});
export type EscalationLogEntry = z.infer<typeof EscalationLogEntrySchema>;

export const EscalationLogSchema = z.array(EscalationLogEntrySchema);
export type EscalationLog = z.infer<typeof EscalationLogSchema>;
