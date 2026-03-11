#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnSync } from "node:child_process";

const server = new Server(
  { name: "pm-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// tools/list — advertise all three PM tools
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "pm_status",
      description:
        "Show current project management status. Use this to understand what projects exist, what work is in progress, and what's in the backlog before filing new items or picking up work.",
      inputSchema: {
        type: "object" as const,
        properties: {
          project: {
            type: "string",
            description: "Project code (optional — omit for all projects)",
          },
        },
      },
    },
    {
      name: "pm_epic_add",
      description:
        "File a new epic to the project management system. Use this when decomposing a large goal into trackable work (new feature, major refactor, multi-part initiative) or when you discover a significant area of work that should be tracked. An epic is a theme with multiple independent stories — create the epic first, then file stories under it. Do NOT use this for small fixes — use story_add instead.",
      inputSchema: {
        type: "object" as const,
        properties: {
          project: {
            type: "string",
            description: "Project code, e.g. 'PM', 'MYAPP'",
          },
          title: {
            type: "string",
            description: "Epic title — concise, actionable",
          },
          description: {
            type: "string",
            description:
              "What this epic covers and why it matters. 1-3 sentences.",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Priority level (default: medium)",
          },
        },
        required: ["project", "title", "description"],
      },
    },
    {
      name: "pm_story_add",
      description:
        "File a new story to the project management system. Use this to break down work into independently completable tasks that can be executed by you or picked up by parallel agents. Also use this when you discover a specific, actionable piece of work (bug, improvement, tech debt) while working on something else. Write clear acceptance criteria so any agent can verify completion. The story will be added to an existing epic's backlog.",
      inputSchema: {
        type: "object" as const,
        properties: {
          epic: {
            type: "string",
            description: "Epic code, e.g. 'PM-E001'",
          },
          title: {
            type: "string",
            description: "Story title — specific and actionable",
          },
          description: {
            type: "string",
            description: "What needs to be done and why",
          },
          points: {
            type: "string",
            enum: ["1", "2", "3", "5", "8"],
            description: "Complexity estimate (default: 3)",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Priority level (default: medium)",
          },
          criteria: {
            type: "array",
            items: { type: "string" },
            description: "Acceptance criteria items",
          },
        },
        required: ["epic", "title", "description"],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// tools/call — dispatch to the pm CLI
// ---------------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  switch (name) {
    case "pm_status": {
      const cliArgs = ["status"];
      if (typeof args["project"] === "string" && args["project"]) {
        cliArgs.push(args["project"]);
      }
      return runPm(cliArgs);
    }

    case "pm_epic_add": {
      const project = args["project"] as string;
      const title = args["title"] as string;
      const description = args["description"] as string;
      const priority =
        typeof args["priority"] === "string" ? args["priority"] : "medium";

      return runPm([
        "epic",
        "add",
        project,
        "--title",
        title,
        "--description",
        description,
        "--priority",
        priority,
      ]);
    }

    case "pm_story_add": {
      const epic = args["epic"] as string;
      const title = args["title"] as string;
      const description = args["description"] as string;
      const points = typeof args["points"] === "string" ? args["points"] : "3";
      const priority =
        typeof args["priority"] === "string" ? args["priority"] : "medium";

      const cliArgs = [
        "story",
        "add",
        epic,
        "--title",
        title,
        "--description",
        description,
        "--points",
        points,
        "--priority",
        priority,
      ];

      if (Array.isArray(args["criteria"])) {
        for (const criterion of args["criteria"]) {
          if (typeof criterion === "string") {
            cliArgs.push("--criteria", criterion);
          }
        }
      }

      return runPm(cliArgs);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Helper: invoke the pm CLI and return an MCP tool result
// ---------------------------------------------------------------------------
function runPm(cliArgs: string[]): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const result = spawnSync("pm", cliArgs, { encoding: "utf-8" });

  if (result.status !== 0) {
    return {
      content: [
        {
          type: "text",
          text: result.stderr || result.stdout || "pm command failed",
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: result.stdout }],
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PM MCP server error: ${message}\n`);
  process.exit(1);
});
