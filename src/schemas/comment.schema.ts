import { z } from "zod";
import { EpicCodeSchema } from "./epic.schema.js";
import { StoryCodeSchema } from "./story.schema.js";

export const TaskReferenceSchema = z.union([EpicCodeSchema, StoryCodeSchema]);

export const CommentAuthorSchema = z.object({
  name: z.string().min(1, "Author name is required"),
  email: z.string().email("Valid email is required").optional(),
});
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;

export const CrossTaskCommentSchema = z
  .object({
    id: z.string().regex(/^C\d{6}$/, "Comment ID must match C######"),
    content: z.string().min(1, "Comment content is required"),
    author: CommentAuthorSchema,
    references: z
      .array(TaskReferenceSchema)
      .min(1, "At least one task reference is required"),
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      }),
    updated_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const projectCodes = new Set<string>();
    const epicCodes = new Set<string>();
    const storyCodes = new Set<string>();

    for (let i = 0; i < data.references.length; i++) {
      const ref = data.references[i]!;
      const parts = ref.split("-");
      const projectCode = parts[0];
      const epicPart = parts[1];

      if (!projectCode || !epicPart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["references", i],
          message: `Invalid reference format: ${ref}`,
        });
        continue;
      }

      if (projectCodes.size > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["references", i],
          message: "Comments cannot reference tasks from more than one project",
        });
      }

      projectCodes.add(projectCode);

      if (epicPart.startsWith("E") && !epicPart.startsWith("E")) {
        epicCodes.add(ref);
      } else if (epicPart.startsWith("S")) {
        const epicCode = `${projectCode}-${epicPart.replace(/^S\d{3}$/, (m) => {
          const num = m.slice(1);
          return `E${num.slice(0, 3)}`;
        })}`;
        if (epicCodes.size > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["references", i],
            message:
              "Comments cannot reference stories from more than one epic within the same project",
          });
        }
        epicCodes.add(epicCode);
      }
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
