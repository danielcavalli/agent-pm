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
  llm_timeout_ms: z.number().int().positive().default(30000),
  llm_max_retries: z.number().int().min(0).default(2),
  last_consolidated_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "ISO datetime")
    .optional(),
});
export type ConsolidationConfig = z.infer<typeof ConsolidationConfigSchema>;

export const GcConfigSchema = z
  .object({
    ttl_comments_days: z
      .number()
      .int()
      .positive()
      .default(30)
      .describe("TTL in days for consolidated/consumed comments (default: 30)"),
    ttl_reports_days: z
      .number()
      .int()
      .positive()
      .default(7)
      .describe(
        "TTL in days for consolidated reports before archival (default: 7)",
      ),
    ttl_adrs_days: z
      .number()
      .int()
      .positive()
      .default(90)
      .describe(
        "TTL in days for deprecated/superseded ADRs before cleanup (default: 90)",
      ),
  })
  .describe(
    "Garbage collection configuration. TTL thresholds control the minimum age an item must reach before it becomes eligible for GC.",
  );
export type GcConfig = z.infer<typeof GcConfigSchema>;

export const DEFAULT_GC_CONFIG: GcConfig = {
  ttl_comments_days: 30,
  ttl_reports_days: 7,
  ttl_adrs_days: 90,
};

export const DEFAULT_STALE_THRESHOLD_SECONDS = 60;

export const ProjectTuiLinksSchema = z.object({
  story_url_template: z
    .string()
    .min(1, "Story URL template cannot be empty")
    .refine((value) => value.includes("{code}"), {
      message: "Story URL template must include {code} placeholder",
    })
    .refine((value) => /^https?:\/\//.test(value), {
      message: "Story URL template must start with http:// or https://",
    })
    .optional(),
});
export type ProjectTuiLinks = z.infer<typeof ProjectTuiLinksSchema>;

export const ProjectTuiSchema = z.object({
  links: ProjectTuiLinksSchema.optional(),
});
export type ProjectTui = z.infer<typeof ProjectTuiSchema>;

export const ProjectThemeColorsSchema = z.object({
  bg: z.string().optional(),
  bgPanel: z.string().optional(),
  bgDarker: z.string().optional(),
  bgSelected: z.string().optional(),
  text: z.string().optional(),
  textMuted: z.string().optional(),
  textBright: z.string().optional(),
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  success: z.string().optional(),
  warning: z.string().optional(),
  error: z.string().optional(),
  info: z.string().optional(),
  border: z.string().optional(),
  borderFocused: z.string().optional(),
});
export type ProjectThemeColors = z.infer<typeof ProjectThemeColorsSchema>;

export const ProjectThemeConfigSchema = z.object({
  name: z.string().optional(),
  colors: ProjectThemeColorsSchema.optional(),
});
export type ProjectThemeConfig = z.infer<typeof ProjectThemeConfigSchema>;

export const ProjectThemeSchema = z.union([
  z.string(),
  ProjectThemeConfigSchema,
]);
export type ProjectTheme = z.infer<typeof ProjectThemeSchema>;

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
  gc_config: GcConfigSchema.optional(),
  stale_threshold_seconds: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_STALE_THRESHOLD_SECONDS),
  theme: ProjectThemeSchema.optional(),
  tui: ProjectTuiSchema.optional(),
  notes: z.string().optional().default(""),
});
export type Project = z.infer<typeof ProjectSchema>;
