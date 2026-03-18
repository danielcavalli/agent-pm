import { z } from "zod";
import { TaskReferenceSchema } from "./comment.schema.js";

export const ADRStatusSchema = z.enum([
  "proposed",
  "accepted",
  "deprecated",
  "superseded",
]);
export type ADRStatus = z.infer<typeof ADRStatusSchema>;

export const ADRAuthorSchema = z
  .union([
    z.object({
      type: z.literal("agent"),
      agent_id: z
        .string()
        .min(1, "Agent ID is required for agent-authored ADRs"),
    }),
    z.object({
      type: z.literal("human"),
      name: z.string().min(1, "Human name is required"),
    }),
  ])
  .describe("Author of the ADR - either an agent or human");
export type ADRAuthor = z.infer<typeof ADRAuthorSchema>;

export const ADRSupersessionSchema = z.object({
  by_adr_id: z
    .string()
    .regex(/^ADR-\d{3}$/, "Superseding ADR ID must match ADR-###"),
  note: z.string().optional(),
});
export type ADRSupersession = z.infer<typeof ADRSupersessionSchema>;

export const ADRReferenceSchema = z.object({
  type: z.enum(["comment", "report", "adr", "task", "supersedes"]),
  id: z.string(),
  description: z.string().optional(),
});
export type ADRReference = z.infer<typeof ADRReferenceSchema>;

export const ADRSchema = z
  .object({
    id: z
      .string()
      .regex(/^ADR-\d{3}$/, "ADR ID must match ADR-###")
      .describe("Auto-generated unique identifier for the ADR (e.g., ADR-021)"),
    title: z
      .string()
      .min(1, "ADR title is required")
      .describe("Short descriptive title of the decision"),
    status: ADRStatusSchema.describe(
      "Current status: proposed, accepted, deprecated, or superseded",
    ),
    context: z
      .string()
      .min(1, "Context is required")
      .describe("The issue being addressed - why this decision is needed"),
    decision: z
      .string()
      .min(1, "Decision is required")
      .describe("What was decided - the actual architectural decision"),
    consequences: z
      .object({
        positive: z.array(z.string()).default([]),
        negative: z.array(z.string()).default([]),
      })
      .describe("Consequences of this decision"),
    author: ADRAuthorSchema.describe(
      "Author identity - either agent ID or human name",
    ),
    timestamp: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: "Timestamp must be ISO 8601 format",
      })
      .describe("ISO 8601 timestamp when the ADR was created"),
    tags: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Optional tags for retrieval filtering"),
    superseded_by: ADRSupersessionSchema.optional(),
    references: z.array(ADRReferenceSchema).optional().default([]),
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
    if (!data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "id is required",
      });
    }
  });
export type ADR = z.infer<typeof ADRSchema>;

export const ADRIndexEntrySchema = z.object({
  adr_id: z.string().regex(/^ADR-\d{3}$/),
  title: z.string(),
  status: ADRStatusSchema,
  created_at: z.string(),
  tags: z.array(z.string()).default([]),
});
export type ADRIndexEntry = z.infer<typeof ADRIndexEntrySchema>;

export const ADRIndexSchema = z.object({
  adrs: z.array(ADRSchema).default([]),
  by_status: z.record(z.string(), z.array(ADRIndexEntrySchema)).default({}),
  by_tag: z.record(z.string(), z.array(ADRIndexEntrySchema)).default({}),
  last_updated: z.string(),
});
export type ADRIndex = z.infer<typeof ADRIndexSchema>;
