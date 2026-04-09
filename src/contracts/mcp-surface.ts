import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { z } from "zod";
import { listMcpCommandContracts } from "./command-registry.js";
import type {
  CommandArgument,
  CommandContract,
} from "../schemas/command-contract.schema.js";
import { getPmDir } from "../lib/codes.js";
import { ValidationError } from "../lib/errors.js";
import { FileSwarmStore } from "../lib/swarm-store.js";
import { runMutationOperation } from "../lib/mutation-telemetry.js";

type McpToolInputProperty = {
  type?: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: { type: "string" };
};

type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpToolInputProperty>;
    required?: string[];
  };
};

type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type SwarmToolArgs = {
  workdir: string;
  namespace: string;
  key?: string;
  data?: Record<string, unknown>;
};

type CustomMcpTool = {
  definition: McpToolDefinition;
  validator: z.ZodType<SwarmToolArgs>;
  handler: (args: SwarmToolArgs) => Promise<void>;
};

const mcpContracts = listMcpCommandContracts();
const contractByToolName = new Map(
  mcpContracts.map((contract) => [contract.mcp!.toolName, contract]),
);

function describeMcpArgument(arg: CommandArgument): string {
  let description = arg.description;

  if (arg.enum && arg.enum.length > 0) {
    description += `: ${arg.enum.join(" | ")}`;
  }

  if (arg.defaultValue !== undefined) {
    description += " (optional)";
  }

  return description;
}

function buildInputProperty(arg: CommandArgument): McpToolInputProperty {
  switch (arg.type) {
    case "string[]":
      return {
        type: "array",
        items: { type: "string" },
        description: describeMcpArgument(arg),
      };
    case "json":
      return {
        type: "object",
        description: describeMcpArgument(arg),
      };
    default: {
      const property: McpToolInputProperty = {
        type: arg.type,
        description: describeMcpArgument(arg),
      };

      if (arg.enum && arg.type === "string") {
        property.enum = arg.enum;
      }

      return property;
    }
  }
}

function buildZodSchema(arg: CommandArgument): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (arg.type) {
    case "string":
      schema = z.string();
      break;
    case "number":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "string[]":
      schema = z.array(z.string());
      break;
    case "json":
      schema = z.unknown();
      break;
  }

  if (arg.enum && arg.enum.length > 0) {
    if (arg.type === "string") {
      schema = schema.refine((value) => arg.enum!.includes(value as string), {
        message: `Expected one of: ${arg.enum.join(", ")}`,
      });
    }

    if (arg.type === "string[]") {
      schema = schema.refine(
        (value) =>
          Array.isArray(value) &&
          value.every(
            (entry) => typeof entry === "string" && arg.enum!.includes(entry),
          ),
        { message: `Expected entries from: ${arg.enum.join(", ")}` },
      );
    }
  }

  const defaultValue = arg.defaultValue;
  const isRequired = arg.mcp?.required === true;

  if (defaultValue !== undefined) {
    return schema.optional().default(defaultValue);
  }

  return isRequired ? schema : schema.optional();
}

function buildArgsValidator(contract: CommandContract): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const arg of contract.args) {
    if (!arg.mcp) {
      continue;
    }

    shape[arg.mcp.name] = buildZodSchema(arg);
  }

  return z.object(shape).strict();
}

const validatorByToolName = new Map(
  mcpContracts.map((contract) => [
    contract.mcp!.toolName,
    buildArgsValidator(contract),
  ]),
);

function dumpYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

function resolveSwarmStore(): FileSwarmStore {
  const pmDir = getPmDir();
  const swarmDir = path.join(pmDir, "swarm");

  if (!fs.existsSync(swarmDir)) {
    throw new ValidationError(
      "No .pm/swarm directory found. Run 'pm swarm init' first.",
    );
  }

  return new FileSwarmStore(pmDir);
}

const SwarmReadArgsSchema = z
  .object({
    workdir: z.string().min(1, "workdir is required"),
    namespace: z.string().min(1, "namespace is required"),
    key: z.string().min(1, "key is required"),
  })
  .strict();

const SwarmWriteArgsSchema = z
  .object({
    workdir: z.string().min(1, "workdir is required"),
    namespace: z.string().min(1, "namespace is required"),
    key: z.string().min(1, "key is required"),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const SwarmListArgsSchema = z
  .object({
    workdir: z.string().min(1, "workdir is required"),
    namespace: z.string().min(1, "namespace is required"),
  })
  .strict();

const customMcpTools: CustomMcpTool[] = [
  {
    definition: {
      name: "pm_swarm_read",
      description:
        "Read YAML content from a swarm namespace/key. Requires workdir, namespace, and key.",
      inputSchema: {
        type: "object",
        properties: {
          workdir: {
            type: "string",
            description: "Working directory containing the target .pm project",
          },
          namespace: {
            type: "string",
            description: "Swarm namespace to read from",
          },
          key: {
            type: "string",
            description: "Swarm record key to read",
          },
        },
        required: ["workdir", "namespace", "key"],
      },
    },
    validator: SwarmReadArgsSchema,
    handler: async ({ namespace, key }) => {
      const store = resolveSwarmStore();
      const record = await store.read(namespace, key!);

      if (!record) {
        process.stdout.write(
          `No swarm entry found for namespace '${namespace}' and key '${key}'.\n`,
        );
        return;
      }

      process.stdout.write(dumpYaml(record));
    },
  },
  {
    definition: {
      name: "pm_swarm_write",
      description:
        "Write validated data into a swarm namespace/key. Requires workdir, namespace, key, and data.",
      inputSchema: {
        type: "object",
        properties: {
          workdir: {
            type: "string",
            description: "Working directory containing the target .pm project",
          },
          namespace: {
            type: "string",
            description: "Swarm namespace to write into",
          },
          key: {
            type: "string",
            description: "Swarm record key to write",
          },
          data: {
            type: "object",
            description: "JSON object payload to validate and persist as YAML",
          },
        },
        required: ["workdir", "namespace", "key", "data"],
      },
    },
    validator: SwarmWriteArgsSchema,
    handler: async ({ namespace, key, data }) => {
      const store = resolveSwarmStore();
      await store.write(namespace, key!, data!);
      process.stdout.write(
        `Wrote swarm entry '${namespace}/${key}' successfully.\n`,
      );
    },
  },
  {
    definition: {
      name: "pm_swarm_list",
      description:
        "List keys in a swarm namespace. Requires workdir and namespace.",
      inputSchema: {
        type: "object",
        properties: {
          workdir: {
            type: "string",
            description: "Working directory containing the target .pm project",
          },
          namespace: {
            type: "string",
            description: "Swarm namespace to inspect",
          },
        },
        required: ["workdir", "namespace"],
      },
    },
    validator: SwarmListArgsSchema,
    handler: async ({ namespace }) => {
      const store = resolveSwarmStore();
      const keys = await store.list(namespace);
      process.stdout.write(keys.length > 0 ? `${keys.join("\n")}\n` : "\n");
    },
  },
];

const customToolByName = new Map(
  customMcpTools.map((tool) => [tool.definition.name, tool]),
);

function resolveHandlerImportPath(importPath: string): string {
  const srcRoot = new URL("../", import.meta.url);
  return new URL(importPath.replace(/^\.\//, ""), srcRoot).href;
}

function getHandlerPositionalArgs(
  contract: CommandContract,
): CommandArgument[] {
  if (
    contract.handler.invocation === "none" ||
    contract.handler.invocation === "options"
  ) {
    return [];
  }

  return contract.args.filter((arg) => {
    if (arg.name === "workdir") {
      return false;
    }

    return (
      arg.cli?.kind === "positional" ||
      (arg.mcp !== undefined && arg.cli === undefined)
    );
  });
}

function buildInternalValues(
  contract: CommandContract,
  mcpArgs: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const arg of contract.args) {
    if (!arg.mcp) {
      continue;
    }

    const value = mcpArgs[arg.mcp.name];
    if (value === undefined) {
      continue;
    }

    values[arg.name] = arg.type === "json" ? JSON.stringify(value) : value;
  }

  return values;
}

async function invokeContractHandler(
  contract: CommandContract,
  values: Record<string, unknown>,
): Promise<void> {
  await runMutationOperation(contract, async () => {
    const handlerModule = (await import(
      resolveHandlerImportPath(contract.handler.importPath)
    )) as Record<string, unknown>;
    const handler = handlerModule[contract.handler.exportName];

    if (typeof handler !== "function") {
      throw new Error(
        `Handler '${contract.handler.exportName}' not found in ${contract.handler.importPath}`,
      );
    }

    const positionalValues = getHandlerPositionalArgs(contract).map(
      (arg) => values[arg.name],
    );
    const positionalNames = new Set(
      getHandlerPositionalArgs(contract).map((arg) => arg.name),
    );
    const optionsObject = Object.fromEntries(
      Object.entries(values).filter(
        ([key]) => key !== "workdir" && !positionalNames.has(key),
      ),
    );

    switch (contract.handler.invocation) {
      case "none":
        await handler();
        return;
      case "positionals":
        await handler(...positionalValues);
        return;
      case "options":
        await handler(optionsObject);
        return;
      case "positionals+options":
        if (positionalValues.length === 0) {
          await handler(undefined, optionsObject);
        } else {
          await handler(...positionalValues, optionsObject);
        }
    }
  });
}

async function captureCommandOutput(
  workdir: string | undefined,
  fn: () => Promise<void>,
): Promise<{ stdout: string; stderr: string }> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  const previousCwd = process.cwd();

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  }) as typeof process.stderr.write;

  try {
    if (workdir) {
      process.chdir(workdir);
    }

    await fn();
    return { stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    if (process.cwd() !== previousCwd) {
      process.chdir(previousCwd);
    }
  }
}

export function listMcpTools(): McpToolDefinition[] {
  const commandTools: McpToolDefinition[] = mcpContracts.map((contract) => {
    const properties: Record<string, McpToolInputProperty> = {};
    const required: string[] = [];

    for (const arg of contract.args) {
      if (!arg.mcp) {
        continue;
      }

      properties[arg.mcp.name] = buildInputProperty(arg);
      if (arg.mcp.required) {
        required.push(arg.mcp.name);
      }
    }

    return {
      name: contract.mcp!.toolName,
      description: contract.mcp!.description,
      inputSchema: {
        type: "object" as const,
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  });

  return [...commandTools, ...customMcpTools.map((tool) => tool.definition)];
}

export async function dispatchMcpToolCall(
  toolName: string,
  rawArgs: Record<string, unknown>,
): Promise<McpToolResult> {
  const customTool = customToolByName.get(toolName);
  if (customTool) {
    try {
      const parsedArgs = customTool.validator.parse(rawArgs ?? {});
      const output = await captureCommandOutput(
        parsedArgs.workdir,
        async () => {
          await customTool.handler(parsedArgs);
        },
      );

      return {
        content: [{ type: "text", text: output.stdout }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const workdir =
        typeof rawArgs["workdir"] === "string"
          ? (rawArgs["workdir"] as string)
          : process.cwd();

      return {
        content: [
          {
            type: "text",
            text: `${message}\n[working directory: ${workdir}]`,
          },
        ],
        isError: true,
      };
    }
  }

  const contract = contractByToolName.get(toolName);
  if (!contract) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  try {
    const validator = validatorByToolName.get(toolName);
    const parsedArgs = validator?.parse(rawArgs ?? {}) ?? {};
    const values = buildInternalValues(contract, parsedArgs);
    const workdir =
      typeof parsedArgs["workdir"] === "string"
        ? (parsedArgs["workdir"] as string)
        : undefined;
    const output = await captureCommandOutput(workdir, async () => {
      await invokeContractHandler(contract, values);
    });

    return {
      content: [{ type: "text", text: output.stdout }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const workdir =
      typeof rawArgs["workdir"] === "string"
        ? (rawArgs["workdir"] as string)
        : process.cwd();

    return {
      content: [
        {
          type: "text",
          text: `${message}\n[working directory: ${workdir}]`,
        },
      ],
      isError: true,
    };
  }
}
