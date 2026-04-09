import { describe, expect, it } from "vitest";
import {
  CommandContractSchema,
  CommandRegistrySchema,
} from "../command-contract.schema.js";

describe("CommandContractSchema", () => {
  const validContract = {
    id: "story.add",
    summary: "Add a story",
    docs: {
      purpose: "Create a story under an epic.",
      examples: ["pm story add PM-E001 --title Test"],
    },
    sideEffects: {
      level: "write",
      notes: "Creates a new story record.",
    },
    handler: {
      importPath: "./commands/story.js",
      exportName: "storyAdd",
      invocation: "positionals+options",
    },
    cli: {
      path: ["story", "add"],
      description: "Add a story",
    },
    mcp: {
      toolName: "pm_story_add",
      description: "Create a story through MCP.",
    },
    args: [
      {
        name: "epicCode",
        description: "Epic code",
        type: "string",
        cli: { kind: "positional", token: "<epicCode>", required: true },
        mcp: { name: "epic", required: true },
      },
      {
        name: "force",
        description: "Force the action",
        type: "boolean",
        cli: { kind: "flag", token: "--force" },
      },
      {
        name: "criteria",
        description: "Acceptance criteria",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--criteria <criteria...>" },
        mcp: { name: "criteria" },
      },
    ],
  };

  it("accepts a valid contract with CLI and MCP projections", () => {
    const result = CommandContractSchema.safeParse(validContract);
    expect(result.success).toBe(true);
  });

  it("rejects an argument without CLI or MCP projection", () => {
    const result = CommandContractSchema.safeParse({
      ...validContract,
      args: [
        {
          name: "epicCode",
          description: "Epic code",
          type: "string",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a flag that is not boolean", () => {
    const result = CommandContractSchema.safeParse({
      ...validContract,
      args: [
        {
          name: "verbose",
          description: "Verbose output",
          type: "string",
          cli: { kind: "flag", token: "--verbose" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects repeatable arguments without string[] type", () => {
    const result = CommandContractSchema.safeParse({
      ...validContract,
      args: [
        {
          name: "criteria",
          description: "Acceptance criteria",
          type: "string",
          multiple: true,
          cli: { kind: "option", token: "--criteria <criteria...>" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("CommandRegistrySchema", () => {
  const baseContract = {
    id: "status",
    summary: "Show status",
    docs: { purpose: "Display status.", examples: [] },
    sideEffects: { level: "read", notes: "Reads project data." },
    handler: {
      importPath: "./commands/status.js",
      exportName: "status",
      invocation: "positionals+options",
    },
    cli: {
      path: ["status"],
      description: "Show project status",
      requiresProjectsDir: false,
    },
    args: [],
  };

  it("accepts unique command ids, CLI paths, and MCP tool names", () => {
    const result = CommandRegistrySchema.safeParse([
      baseContract,
      {
        ...baseContract,
        id: "story.add",
        cli: { path: ["story", "add"], description: "Add a story" },
        handler: {
          importPath: "./commands/story.js",
          exportName: "storyAdd",
          invocation: "positionals+options",
        },
        mcp: {
          toolName: "pm_story_add",
          description: "Create a story through MCP.",
        },
      },
    ]);

    expect(result.success).toBe(true);
  });

  it("rejects duplicate command ids", () => {
    const result = CommandRegistrySchema.safeParse([
      baseContract,
      baseContract,
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate MCP tool names", () => {
    const result = CommandRegistrySchema.safeParse([
      {
        ...baseContract,
        mcp: { toolName: "pm_status", description: "Status via MCP." },
      },
      {
        ...baseContract,
        id: "other.status",
        cli: { path: ["other", "status"], description: "Other status" },
        mcp: { toolName: "pm_status", description: "Duplicate name." },
      },
    ]);

    expect(result.success).toBe(false);
  });
});
