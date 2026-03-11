#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnSync } from "node:child_process";

const server = new Server(
  { name: "pm-tools", version: "0.0.6-alpha" },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// tools/list — advertise all PM tools
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "pm_status",
      description:
        "Show current project management status. Use this to understand what projects exist, what work is in progress, and what's in the backlog before filing new items or picking up work. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
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
        "File a new epic to the project management system. Use this when decomposing a large goal into trackable work (new feature, major refactor, multi-part initiative) or when you discover a significant area of work that should be tracked. An epic is a theme with multiple independent stories — create the epic first, then file stories under it. Do NOT use this for small fixes — use story_add instead. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
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
        "File a new story to the project management system. Use this to break down work into independently completable tasks that can be executed by you or picked up by parallel agents. Also use this when you discover a specific, actionable piece of work (bug, improvement, tech debt) while working on something else. Write clear acceptance criteria so any agent can verify completion. The story will be added to an existing epic's backlog. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
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
          depends_on: {
            type: "array",
            items: { type: "string" },
            description:
              "Story codes this story depends on (e.g. ['PM-E001-S001']). Use this to declare explicit ordering dependencies for the orchestrator.",
          },
        },
        required: ["epic", "title", "description"],
      },
    },
    {
      name: "pm_project_remove",
      description:
        "Remove a project and all its epics and stories from the project management system. This is a destructive operation — use only when a project is no longer needed. Always confirm with the user before calling this tool. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          project: {
            type: "string",
            description: "Project code to remove, e.g. 'PM', 'MYAPP'",
          },
        },
        required: ["project"],
      },
    },
    {
      name: "pm_comment_add",
      description:
        "Add a comment to a target task for async cross-task communication. Use this to leave notes for other agents or humans working on related tasks. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          target: {
            type: "string",
            description: "Target task ID (e.g. PM-E031-S001 or PM-E031)",
          },
          type: {
            type: "string",
            enum: ["agent", "human"],
            description: "Comment type: 'agent' or 'human'",
          },
          content: {
            type: "string",
            description: "Comment content text",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for retrieval filtering",
          },
          author: {
            type: "string",
            description: "Author name for human comments",
          },
          author_id: {
            type: "string",
            description: "Agent ID for agent-authored comments",
          },
        },
        required: ["target", "type", "content"],
      },
    },
    {
      name: "pm_comment_list",
      description:
        "List comments with optional filters. Use this to retrieve comments for a specific task or filtered by type/author. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          project: {
            type: "string",
            description: "Project code (e.g. PM)",
          },
          task: {
            type: "string",
            description: "Filter by target task ID",
          },
          type: {
            type: "string",
            enum: ["agent", "human"],
            description: "Filter by comment type",
          },
          author: {
            type: "string",
            description: "Filter by author (agent ID or human name)",
          },
        },
        required: ["project"],
      },
    },
    {
      name: "pm_report_create",
      description:
        "Create an execution report for a completed task. The report captures decisions, assumptions, tradeoffs, and observations to support the consolidation agent's work. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          task_id: {
            type: "string",
            description:
              "Task/story ID (e.g. PM-E030-S001). Must match pattern PROJECT-E###-S###",
          },
          agent_id: {
            type: "string",
            description: "Identifier for the agent that completed the task",
          },
          status: {
            type: "string",
            enum: ["complete", "partial"],
            description:
              "Report status: complete or partial (default: complete)",
          },
          decisions: {
            type: "array",
            items: { type: "string" },
            description:
              "Decision items. Format: 'type:text' where type is episodic or semantic, or just text (defaults to episodic)",
          },
          assumptions: {
            type: "array",
            items: { type: "string" },
            description:
              "Assumption items. Format: 'type:text' where type is episodic or semantic, or just text (defaults to episodic)",
          },
          tradeoffs: {
            type: "array",
            items: { type: "string" },
            description:
              "Tradeoff items. Format: 'alternative|reason' (pipe separator)",
          },
          out_of_scope: {
            type: "array",
            items: { type: "string" },
            description:
              "Out of scope items. Format: 'observation|note' (note is optional)",
          },
          potential_conflicts: {
            type: "array",
            items: { type: "string" },
            description:
              "Potential conflict items. Format: 'assumption|confidence|note' (confidence: low/medium/high)",
          },
          force: {
            type: "boolean",
            description:
              "Overwrite existing report without prompting (default: false)",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "pm_report_view",
      description:
        "View an execution report by task ID. Displays the report in human-readable format with section headers. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          task_id: {
            type: "string",
            description:
              "Task/story ID (e.g. PM-E030-S001). Must match pattern PROJECT-E###-S###",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "pm_adr_create",
      description:
        "Create a new Architecture Decision Record (ADR). Use this to document architectural decisions with context, decision rationale, and consequences. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
      inputSchema: {
        type: "object" as const,
        properties: {
          workdir: {
            type: "string",
            description:
              "Working directory — the repo root containing .pm/. If not provided, defaults to process cwd.",
          },
          project: {
            type: "string",
            description: "Project code (e.g. PM)",
          },
          title: {
            type: "string",
            description: "Short descriptive title of the decision",
          },
          status: {
            type: "string",
            enum: ["proposed", "accepted", "deprecated", "superseded"],
            description: "Current status of the ADR",
          },
          context: {
            type: "string",
            description:
              "The issue being addressed - why this decision is needed",
          },
          decision: {
            type: "string",
            description: "What was decided - the actual architectural decision",
          },
          positive_consequences: {
            type: "array",
            items: { type: "string" },
            description: "Positive consequences of this decision",
          },
          negative_consequences: {
            type: "array",
            items: { type: "string" },
            description: "Negative consequences of this decision",
          },
          author_type: {
            type: "string",
            enum: ["agent", "human"],
            description: "Author type (default: human)",
          },
          author_name: {
            type: "string",
            description: "Author name (for human authors)",
          },
          author_id: {
            type: "string",
            description: "Agent ID (for agent authors)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for retrieval filtering",
          },
        },
        required: ["project", "title", "status", "context", "decision"],
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
      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    case "pm_epic_add": {
      const project = args["project"] as string;
      const title = args["title"] as string;
      const description = args["description"] as string;
      const priority =
        typeof args["priority"] === "string" ? args["priority"] : "medium";

      return runPm(
        [
          "epic",
          "add",
          project,
          "--title",
          title,
          "--description",
          description,
          "--priority",
          priority,
        ],
        args["workdir"] as string | undefined,
      );
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

      if (Array.isArray(args["depends_on"])) {
        for (const dep of args["depends_on"]) {
          if (typeof dep === "string") {
            cliArgs.push("--depends-on", dep);
          }
        }
      }

      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    case "pm_project_remove": {
      const project = args["project"] as string;
      return runPm(
        ["remove", project, "--force"],
        args["workdir"] as string | undefined,
      );
    }

    case "pm_comment_add": {
      const target = args["target"] as string;
      const type = args["type"] as string;
      const content = args["content"] as string;
      const author =
        typeof args["author"] === "string" ? args["author"] : "anonymous";
      const authorId =
        typeof args["author_id"] === "string" ? args["author_id"] : "";

      const cliArgs = [
        "comment",
        "add",
        "--target",
        target,
        "--type",
        type,
        "--content",
        content,
        "--author",
        author,
      ];

      if (authorId) {
        cliArgs.push("--author-id", authorId);
      }

      if (Array.isArray(args["tags"])) {
        for (const tag of args["tags"]) {
          if (typeof tag === "string") {
            cliArgs.push("--tags", tag);
          }
        }
      }

      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    case "pm_comment_list": {
      const project = args["project"] as string;

      const cliArgs = ["comment", "list", "--project", project];

      if (typeof args["task"] === "string" && args["task"]) {
        cliArgs.push("--task", args["task"]);
      }

      if (typeof args["type"] === "string" && args["type"]) {
        cliArgs.push("--type", args["type"]);
      }

      if (typeof args["author"] === "string" && args["author"]) {
        cliArgs.push("--author", args["author"]);
      }

      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    case "pm_report_create": {
      const taskId = args["task_id"] as string;
      const agentId = args["agent_id"] as string;
      const status = args["status"] as string;
      const force = args["force"] as boolean;

      const cliArgs = ["report", "create", "--task-id", taskId];
      if (agentId) {
        cliArgs.push("--agent-id", agentId);
      }
      if (status) {
        cliArgs.push("--status", status);
      }
      if (force) {
        cliArgs.push("--force");
      }

      if (Array.isArray(args["decisions"])) {
        for (const d of args["decisions"]) {
          if (typeof d === "string") {
            cliArgs.push("--decisions", d);
          }
        }
      }

      if (Array.isArray(args["assumptions"])) {
        for (const a of args["assumptions"]) {
          if (typeof a === "string") {
            cliArgs.push("--assumptions", a);
          }
        }
      }

      if (Array.isArray(args["tradeoffs"])) {
        for (const t of args["tradeoffs"]) {
          if (typeof t === "string") {
            cliArgs.push("--tradeoffs", t);
          }
        }
      }

      if (Array.isArray(args["out_of_scope"])) {
        for (const o of args["out_of_scope"]) {
          if (typeof o === "string") {
            cliArgs.push("--out-of-scope", o);
          }
        }
      }

      if (Array.isArray(args["potential_conflicts"])) {
        for (const p of args["potential_conflicts"]) {
          if (typeof p === "string") {
            cliArgs.push("--potential-conflicts", p);
          }
        }
      }

      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    case "pm_report_view": {
      const taskId = args["task_id"] as string;
      return runPm(
        ["report", "view", taskId],
        args["workdir"] as string | undefined,
      );
    }

    case "pm_adr_create": {
      const project = args["project"] as string;
      const title = args["title"] as string;
      const status = args["status"] as string;
      const context = args["context"] as string;
      const decision = args["decision"] as string;
      const positiveConsequences = args["positive_consequences"] as string[];
      const negativeConsequences = args["negative_consequences"] as string[];
      const authorType = args["author_type"] as string;
      const authorName = args["author_name"] as string;
      const authorId = args["author_id"] as string;
      const tags = args["tags"] as string[];

      const cliArgs = [
        "adr",
        "create",
        "--project",
        project,
        "--title",
        title,
        "--status",
        status,
        "--context",
        context,
        "--decision",
        decision,
      ];

      if (Array.isArray(positiveConsequences)) {
        for (const c of positiveConsequences) {
          if (typeof c === "string") {
            cliArgs.push("--positive", c);
          }
        }
      }

      if (Array.isArray(negativeConsequences)) {
        for (const c of negativeConsequences) {
          if (typeof c === "string") {
            cliArgs.push("--negative", c);
          }
        }
      }

      if (authorType) {
        cliArgs.push("--author-type", authorType);
      }

      if (authorName) {
        cliArgs.push("--author", authorName);
      }

      if (authorId) {
        cliArgs.push("--author-id", authorId);
      }

      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (typeof tag === "string") {
            cliArgs.push("--tags", tag);
          }
        }
      }

      return runPm(cliArgs, args["workdir"] as string | undefined);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Helper: invoke the pm CLI and return an MCP tool result
// ---------------------------------------------------------------------------
function runPm(
  cliArgs: string[],
  workdir?: string,
): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const cwd = workdir ?? process.cwd();
  const result = spawnSync("pm", cliArgs, { encoding: "utf-8", cwd });

  if (result.status !== 0) {
    const errorMsg = result.stderr || result.stdout || "pm command failed";
    return {
      content: [
        {
          type: "text",
          text: `${errorMsg}\n[working directory: ${cwd}]`,
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
