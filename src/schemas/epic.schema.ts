import { z } from "zod";
import {
  StoryStatusSchema,
  PrioritySchema,
  StorySchema,
} from "./story.schema.js";

export const EpicStatusSchema = StoryStatusSchema; // same enum values
export type EpicStatus = z.infer<typeof EpicStatusSchema>;

export const EpicIdSchema = z.string().regex(/^E\d{3}$/, {
  message: "Epic ID must match E### (e.g. E001)",
});

export const EpicCodeSchema = z.string().regex(/^[A-Z]{2,6}-E\d{3}$/, {
  message: "Epic code must match PROJECT-ENNN (e.g. PM-E001)",
});

export const EpicSchema = z
  .object({
    id: EpicIdSchema,
    code: EpicCodeSchema,
    title: z.string().min(1, "Epic title is required"),
    description: z.string().optional().default(""),
    status: EpicStatusSchema,
    priority: PrioritySchema,
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    stories: z.array(StorySchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.stories.length; i++) {
      const storyId = data.stories[i]!.id;
      if (seen.has(storyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stories", i, "id"],
          message: `Duplicate story ID: ${storyId}`,
        });
      } else {
        seen.add(storyId);
      }
    }
  });
export type Epic = z.infer<typeof EpicSchema>;
