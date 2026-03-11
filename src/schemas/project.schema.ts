import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "active",
  "paused",
  "complete",
  "archived",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectCodeSchema = z.string().regex(/^[A-Z]{2,6}$/, {
  message: "Project code must be 2-6 uppercase letters (e.g. PM, MYAPP)",
});

export const ProjectArchitectureSchema = z.object({
  pattern: z.string(),
  storage: z.string(),
  primary_interface: z.string(),
  location: z.string().optional(),
});
export type ProjectArchitecture = z.infer<typeof ProjectArchitectureSchema>;

export const TriggerModeSchema = z.enum(
  ["manual", "event_based", "time_based"],
  {
    errorMap: () => ({
      message: "Trigger mode must be: manual, event_based, or time_based",
    }),
  },
);
export type TriggerMode = z.infer<typeof TriggerModeSchema>;

export const ConsolidationConfigSchema = z.object({
  max_reports_per_run: z.number().int().positive().default(10),
  trigger_mode: TriggerModeSchema.default("manual"),
  trigger_event_count: z.number().int().positive().optional(),
  trigger_interval_minutes: z.number().int().positive().optional(),
  last_consolidated_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "ISO datetime")
    .optional(),
});
export type ConsolidationConfig = z.infer<typeof ConsolidationConfigSchema>;

export const ProjectSchema = z.object({
  code: ProjectCodeSchema,
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional().default(""),
  vision: z.string().optional().default(""),
  status: ProjectStatusSchema,
  created_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  tech_stack: z.array(z.string()).optional().default([]),
  architecture: ProjectArchitectureSchema.optional(),
  consolidation: ConsolidationConfigSchema.optional(),
  notes: z.string().optional().default(""),
});
export type Project = z.infer<typeof ProjectSchema>;
