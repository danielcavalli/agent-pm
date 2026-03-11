import { z } from "zod";

export const StoryStatusSchema = z.enum([
  "backlog",
  "in_progress",
  "done",
  "cancelled",
]);
export type StoryStatus = z.infer<typeof StoryStatusSchema>;

export const PrioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const StoryPointsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
]);
export type StoryPoints = z.infer<typeof StoryPointsSchema>;

export const StoryCodeSchema = z.string().regex(/^[A-Z]{2,6}-E\d{3}-S\d{3}$/, {
  message:
    "Story code must match pattern PROJECT-ENNN-SNNN (e.g. PM-E001-S001)",
});

export const ResolutionTypeSchema = z.enum(["conflict", "gap"]);
export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;

export const StorySchema = z.object({
  id: z.string().regex(/^S\d{3}$/, "Story ID must match S###"),
  code: StoryCodeSchema,
  title: z.string().min(1, "Story title is required"),
  description: z.string().optional().default(""),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  status: StoryStatusSchema,
  priority: PrioritySchema,
  story_points: StoryPointsSchema,
  depends_on: z.array(StoryCodeSchema).optional().default([]),
  notes: z.string().optional().default(""),
  resolution_type: ResolutionTypeSchema.optional(),
  conflicting_assumptions: z
    .array(
      z.object({
        assumption: z.string(),
        source_report_id: z.string(),
      }),
    )
    .optional(),
  source_reports: z.array(z.string()).optional(),
  proposed_resolution: z.string().optional(),
  undefined_concept: z.string().optional(),
  referenced_in: z.array(z.string()).optional(),
});
export type Story = z.infer<typeof StorySchema>;
