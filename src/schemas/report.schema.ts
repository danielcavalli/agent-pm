import { z } from "zod";

export const ReportStatusSchema = z.enum(["success", "failed", "partial"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportIdSchema = z.string().regex(/^R\d{3}$/, {
  message: "Report ID must match R### (e.g. R001)",
});

export const ReportCodeSchema = z.string().regex(/^[A-Z]{2,6}-R\d{3}$/, {
  message: "Report code must match PROJECT-RNNN (e.g. PM-R001)",
});

export const ReportSchema = z.object({
  id: ReportIdSchema,
  code: ReportCodeSchema,
  title: z.string().min(1, "Report title is required"),
  description: z.string().optional().default(""),
  target_type: z.enum(["story", "epic", "project"]),
  target_code: z.string(),
  agent: z.string().optional().default(""),
  status: ReportStatusSchema,
  execution_started: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "ISO datetime"),
  execution_ended: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "ISO datetime")
    .optional(),
  created_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  notes: z.string().optional().default(""),
});
export type Report = z.infer<typeof ReportSchema>;

export const ReportListSchema = z.array(ReportSchema);
export type ReportList = z.infer<typeof ReportListSchema>;
