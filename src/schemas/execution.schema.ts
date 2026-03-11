import { z } from "zod";

export const ExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionResultSchema = z.enum([
  "success",
  "failure",
  "cancelled",
  "timeout",
]);
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const ExecutionIdSchema = z.string().regex(/^X\d{6}$/, {
  message: "Execution ID must match XNNNNNN (e.g. X000001)",
});

export const ExecutionReportSchema = z.object({
  id: ExecutionIdSchema,
  story_code: z.string().regex(/^[A-Z]{2,6}-E\d{3}-S\d{3}$/, {
    message: "Story code must match pattern PROJECT-ENNN-SNNN",
  }),
  status: ExecutionStatusSchema,
  result: ExecutionResultSchema.optional(),
  started_at: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  completed_at: z
    .string()
    .datetime({ message: "Must be ISO 8601 datetime" })
    .optional(),
  executor: z.string().optional(),
  error_message: z.string().optional().default(""),
  output: z.string().optional().default(""),
});
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;

export const ExecutionIndexEntrySchema = z.object({
  story_code: z.string(),
  last_execution_id: ExecutionIdSchema.optional(),
  last_run: z.string().datetime().optional(),
  last_result: ExecutionResultSchema.optional(),
});
export type ExecutionIndexEntry = z.infer<typeof ExecutionIndexEntrySchema>;

export const ExecutionIndexSchema = z.object({
  reports: z.array(ExecutionReportSchema).default([]),
  by_story: z.record(z.string(), ExecutionIndexEntrySchema).default({}),
});
export type ExecutionIndex = z.infer<typeof ExecutionIndexSchema>;
