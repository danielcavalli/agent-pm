import { z } from "zod";
import { StoryCodeSchema, StoryStatusSchema } from "./story.schema.js";
import { EpicCodeSchema } from "./epic.schema.js";

export const ReadyTaskSchema = z.object({
  code: StoryCodeSchema,
  title: z.string().min(1),
  status: StoryStatusSchema,
  priority: z.enum(["high", "medium", "low"]),
  story_points: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(8),
  ]),
  epic_code: EpicCodeSchema,
  epic_title: z.string().min(1),
  project_code: z.string().min(1),
  project_name: z.string().min(1),
  depends_on: z.array(StoryCodeSchema).default([]),
  dependencies_resolved: z.boolean(),
});
export type ReadyTask = z.infer<typeof ReadyTaskSchema>;

export const TaskStartQuerySchema = z.object({
  project_code: z.string().min(2).optional(),
  epic_code: EpicCodeSchema.optional(),
  include_blocked: z.boolean().default(false),
  limit: z.number().int().positive().max(50).default(20),
});
export type TaskStartQuery = z.infer<typeof TaskStartQuerySchema>;

export const TaskStartResponseSchema = z.object({
  tasks: z.array(ReadyTaskSchema),
  total: z.number().int().nonnegative(),
  query: TaskStartQuerySchema,
});
export type TaskStartResponse = z.infer<typeof TaskStartResponseSchema>;
