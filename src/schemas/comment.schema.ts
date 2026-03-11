import { z } from "zod";
import { EpicCodeSchema } from "./epic.schema.js";
import { StoryCodeSchema } from "./story.schema.js";

export const TaskReferenceSchema = z.union([EpicCodeSchema, StoryCodeSchema]);

export const CommentTypeSchema = z.enum(["agent", "human"]);
export type CommentType = z.infer<typeof CommentTypeSchema>;

export const CommentAuthorSchema = z
  .union([
    z.object({
      type: z.literal("agent"),
      agent_id: z
        .string()
        .min(1, "Agent ID is required for agent-authored comments"),
    }),
    z.object({
      type: z.literal("human"),
      name: z.string().min(1, "Human name is required"),
    }),
  ])
  .describe(
    "Author of the comment. Agent-authored comments are consumed by future agents working on or near that task. Human-authored comments are surfaced in TUI/status output for human review.",
  );
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;

export const CrossTaskCommentSchema = z
  .object({
    id: z
      .string()
      .regex(/^C\d{6}$/, "Comment ID must match C######")
      .describe("Auto-generated unique identifier for the comment"),
    target_task_id: TaskReferenceSchema.describe(
      "The task (story or epic) this comment is attached to",
    ),
    comment_type: CommentTypeSchema.describe(
      "Type of comment: 'agent' for agent-to-agent signals, 'human' for human-facing notes",
    ),
    content: z
      .string()
      .min(1, "Comment content is required")
      .describe("Free-form text content of the comment"),
    author: CommentAuthorSchema.describe(
      "Author identity - either agent ID or human name",
    ),
    timestamp: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      })
      .describe("ISO 8601 timestamp when the comment was created"),
    tags: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Optional tags for retrieval filtering"),
    consolidated: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Set to true by the consolidation agent after this comment is ingested. Used for garbage collection eligibility.",
      ),
    consumed_by: z
      .array(z.string())
      .optional()
      .default([])
      .describe(
        "List of agent IDs that have read this comment. Enables dependency-based garbage collection: a comment is eligible for expiry when consolidated is true AND either the target agent ID appears in consumed_by OR the target task status is completed. See PM-E035: ADR Lifecycle and Garbage Collection.",
      ),
    references: z.array(TaskReferenceSchema).optional().default([]),
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      })
      .optional(),
    updated_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.target_task_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_task_id"],
        message: "target_task_id is required",
      });
    }
  });
export type CrossTaskComment = z.infer<typeof CrossTaskCommentSchema>;

export const CommentIndexEntrySchema = z.object({
  comment_id: z.string().regex(/^C\d{6}$/),
  task_reference: TaskReferenceSchema,
  created_at: z.string(),
});
export type CommentIndexEntry = z.infer<typeof CommentIndexEntrySchema>;

export const CommentIndexSchema = z.object({
  comments: z.array(CrossTaskCommentSchema).default([]),
  by_task: z.record(z.string(), z.array(CommentIndexEntrySchema)).default({}),
  last_updated: z.string(),
});
export type CommentIndex = z.infer<typeof CommentIndexSchema>;
