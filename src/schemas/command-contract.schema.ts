import { z } from "zod";

export const CommandArgumentTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "string[]",
  "json",
]);
export type CommandArgumentType = z.infer<typeof CommandArgumentTypeSchema>;

export const CommandSideEffectLevelSchema = z.enum([
  "read",
  "write",
  "destructive",
]);
export type CommandSideEffectLevel = z.infer<
  typeof CommandSideEffectLevelSchema
>;

export const CommandCliArgumentKindSchema = z.enum([
  "positional",
  "option",
  "flag",
]);
export type CommandCliArgumentKind = z.infer<
  typeof CommandCliArgumentKindSchema
>;

export const CommandCliArgumentProjectionSchema = z.object({
  kind: CommandCliArgumentKindSchema,
  token: z.string().min(1, "CLI token is required"),
  required: z.boolean().optional().default(false),
});
export type CommandCliArgumentProjection = z.infer<
  typeof CommandCliArgumentProjectionSchema
>;

export const CommandMcpArgumentProjectionSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "MCP argument name must be snake_case"),
  required: z.boolean().optional().default(false),
});
export type CommandMcpArgumentProjection = z.infer<
  typeof CommandMcpArgumentProjectionSchema
>;

export const CommandArgumentSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][A-Za-z0-9]*$/, "Argument name must be camelCase"),
    description: z.string().min(1, "Argument description is required"),
    type: CommandArgumentTypeSchema,
    multiple: z.boolean().optional().default(false),
    enum: z.array(z.string().min(1)).optional(),
    defaultValue: z
      .union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.record(z.unknown()),
      ])
      .optional(),
    cli: CommandCliArgumentProjectionSchema.optional(),
    mcp: CommandMcpArgumentProjectionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.cli && !value.mcp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Argument must define a CLI or MCP projection",
        path: ["cli"],
      });
    }

    if (value.cli?.kind === "flag" && value.type !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CLI flags must use boolean type",
        path: ["type"],
      });
    }

    if (value.multiple && value.type !== "string[]") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Repeatable arguments must use string[] type",
        path: ["type"],
      });
    }

    if (value.enum && !["string", "string[]"].includes(value.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enum is only supported for string and string[] types",
        path: ["enum"],
      });
    }
  });
export type CommandArgument = z.infer<typeof CommandArgumentSchema>;

export const CommandDocsSchema = z.object({
  purpose: z.string().min(1, "Command purpose is required"),
  examples: z.array(z.string().min(1)).optional().default([]),
});
export type CommandDocs = z.infer<typeof CommandDocsSchema>;

export const CommandHandlerSchema = z.object({
  importPath: z
    .string()
    .regex(/^\.\/.+\.js$/, "Handler import must be a .js module path"),
  exportName: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, "Handler export name is required"),
  invocation: z.enum(["none", "options", "positionals", "positionals+options"]),
});
export type CommandHandler = z.infer<typeof CommandHandlerSchema>;

export const CommandCliProjectionSchema = z.object({
  path: z
    .array(z.string().min(1))
    .min(1, "CLI path must include at least one segment"),
  description: z.string().min(1, "CLI description is required"),
  requiresProjectsDir: z.boolean().optional().default(true),
});
export type CommandCliProjection = z.infer<typeof CommandCliProjectionSchema>;

export const CommandMcpProjectionSchema = z.object({
  toolName: z
    .string()
    .regex(/^pm_[a-z0-9_]+$/, "MCP tool name must start with pm_"),
  description: z.string().min(1, "MCP description is required"),
});
export type CommandMcpProjection = z.infer<typeof CommandMcpProjectionSchema>;

export const CommandContractSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z][a-z0-9]*(\.[a-z0-9-]+)*$/,
      "Command id must be dot-delimited lowercase text",
    ),
  summary: z.string().min(1, "Command summary is required"),
  docs: CommandDocsSchema,
  sideEffects: z.object({
    level: CommandSideEffectLevelSchema,
    notes: z.string().min(1, "Side-effect notes are required"),
  }),
  handler: CommandHandlerSchema,
  cli: CommandCliProjectionSchema,
  mcp: CommandMcpProjectionSchema.optional(),
  args: z.array(CommandArgumentSchema),
});
export type CommandContract = z.infer<typeof CommandContractSchema>;

export const CommandRegistrySchema = z
  .array(CommandContractSchema)
  .superRefine((contracts, ctx) => {
    const ids = new Map<string, number>();
    const cliPaths = new Map<string, number>();
    const mcpTools = new Map<string, number>();

    contracts.forEach((contract, index) => {
      const previousId = ids.get(contract.id);
      if (previousId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate command id: ${contract.id}`,
          path: [index, "id"],
        });
      }
      ids.set(contract.id, index);

      const cliPath = contract.cli.path.join(" ");
      const previousCliPath = cliPaths.get(cliPath);
      if (previousCliPath !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate CLI path: ${cliPath}`,
          path: [index, "cli", "path"],
        });
      }
      cliPaths.set(cliPath, index);

      if (contract.mcp) {
        const previousTool = mcpTools.get(contract.mcp.toolName);
        if (previousTool !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate MCP tool name: ${contract.mcp.toolName}`,
            path: [index, "mcp", "toolName"],
          });
        }
        mcpTools.set(contract.mcp.toolName, index);
      }
    });
  });
export type CommandRegistry = z.infer<typeof CommandRegistrySchema>;
