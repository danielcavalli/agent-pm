import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { listMcpCommandContracts } from "../contracts/command-registry.js";

// ---------------------------------------------------------------------------
// Test‑scoped MCP client that spawns the compiled pm-mcp-server
// ---------------------------------------------------------------------------

const SERVER_PATH = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../../dist/mcp-server.js",
);

let client: Client;
let transport: StdioClientTransport;
let tmpDir: string;
let origPmHome: string | undefined;

/**
 * We run against a temporary PM_HOME so tests don't pollute the real data.
 * The `pm` CLI reads PM_HOME from the environment.
 */
beforeAll(async () => {
  // --- temp PM_HOME --------------------------------------------------------
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mcp-test-"));
  const pmDir = path.join(tmpDir, ".pm");

  origPmHome = process.env["PM_HOME"];
  process.env["PM_HOME"] = pmDir;

  // --- seed a project so pm_status / pm_epic_add have something to work with
  // We call the pm CLI directly to seed
  const initResult = spawnSync(
    "pm",
    [
      "init",
      "--name",
      "MCP Test Project",
      "--code",
      "MCPT",
      "--description",
      "Test project for MCP e2e",
    ],
    { encoding: "utf-8", env: { ...process.env, PM_HOME: pmDir } },
  );
  if (initResult.status !== 0) {
    throw new Error(
      `Failed to seed project: ${initResult.stderr || initResult.stdout}`,
    );
  }

  const swarmInitResult = spawnSync("pm", ["swarm", "init"], {
    encoding: "utf-8",
    env: { ...process.env, PM_HOME: pmDir },
  });
  if (swarmInitResult.status !== 0) {
    throw new Error(
      `Failed to initialize swarm storage: ${swarmInitResult.stderr || swarmInitResult.stdout}`,
    );
  }

  // --- start MCP client/server pair ----------------------------------------
  transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: { ...(process.env as Record<string, string>), PM_HOME: pmDir },
    stderr: "pipe",
  });

  client = new Client(
    { name: "pm-mcp-test", version: "0.0.1" },
    { capabilities: {} },
  );

  await client.connect(transport);
}, 15_000);

afterAll(async () => {
  // tear down MCP
  await client?.close();

  // restore env
  if (origPmHome === undefined) {
    delete process.env["PM_HOME"];
  } else {
    process.env["PM_HOME"] = origPmHome;
  }

  // clean up temp dir
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MCP PM Server", () => {
  it("lists the registry-derived MCP tools via tools/list", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    const registryNames = listMcpCommandContracts()
      .map((contract) => contract.mcp!.toolName)
      .sort();
    const customNames = ["pm_swarm_list", "pm_swarm_read", "pm_swarm_write"];

    expect(names).toEqual([...registryNames, ...customNames].sort());

    // Verify each tool has a description and inputSchema
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("pm_swarm_write writes validated swarm data and confirms success", async () => {
    const observation = {
      story_code: "MCPT-E001-S001",
      status: "done",
      criteria_verified: ["Swarm write succeeded"],
      criteria_failed: [],
      metrics: { stories_per_hour: 1.5 },
      strategy_hash: "strategy-hash",
      board_hash: "board-hash",
      config_version: 1,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    };

    const result = await client.callTool({
      name: "pm_swarm_write",
      arguments: {
        workdir: tmpDir,
        namespace: "observations",
        key: "MCPT-E001-S001",
        data: observation,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain(
      "Wrote swarm entry 'observations/MCPT-E001-S001' successfully.",
    );

    const stored = yaml.load(
      fs.readFileSync(
        path.join(
          tmpDir,
          ".pm",
          "swarm",
          "observations",
          "MCPT-E001-S001.yaml",
        ),
        "utf8",
      ),
    );
    expect(stored).toEqual(observation);
  });

  it("pm_swarm_write returns a graceful validation error for invalid data", async () => {
    const result = await client.callTool({
      name: "pm_swarm_write",
      arguments: {
        workdir: tmpDir,
        namespace: "observations",
        key: "MCPT-E001-S999",
        data: {
          story_code: "MCPT-E001-S999",
          status: "backlog",
        },
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("Validation failed");
    expect(content[0]?.text).toContain("status");
    expect(content[0]?.text).toContain("[working directory:");
  });

  it("pm_swarm_read returns YAML for an existing swarm record", async () => {
    const result = await client.callTool({
      name: "pm_swarm_read",
      arguments: {
        workdir: tmpDir,
        namespace: "observations",
        key: "MCPT-E001-S001",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("story_code: MCPT-E001-S001");
    expect(content[0]?.text).toContain("status: done");
    expect(content[0]?.text).toContain("criteria_verified:");
  });

  it("pm_swarm_read returns a not-found message for missing keys", async () => {
    const result = await client.callTool({
      name: "pm_swarm_read",
      arguments: {
        workdir: tmpDir,
        namespace: "observations",
        key: "MCPT-E001-S404",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("No swarm entry found");
    expect(content[0]?.text).toContain("MCPT-E001-S404");
  });

  it("pm_swarm_list returns the keys in a namespace", async () => {
    const result = await client.callTool({
      name: "pm_swarm_list",
      arguments: {
        workdir: tmpDir,
        namespace: "observations",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text.trim().split("\n")).toContain("MCPT-E001-S001");
  });

  it("pm_status returns output for the seeded project", async () => {
    const result = await client.callTool({
      name: "pm_status",
      arguments: { project: "MCPT" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("MCPT");
  });

  it("pm_status without project arg returns output", async () => {
    const result = await client.callTool({ name: "pm_status", arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    // Should list the seeded project
    expect(content[0]?.text).toContain("MCPT");
  });

  it("pm_epic_add creates an epic", async () => {
    const result = await client.callTool({
      name: "pm_epic_add",
      arguments: {
        project: "MCPT",
        title: "MCP Test Epic",
        description: "An epic created by MCP e2e test",
        priority: "low",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    // The pm epic add command outputs a confirmation with the epic code
    expect(content[0]?.text).toContain("E001");
  });

  it("pm_story_add creates a story under the test epic", async () => {
    const result = await client.callTool({
      name: "pm_story_add",
      arguments: {
        epic: "MCPT-E001",
        title: "MCP Test Story",
        description: "A story created by MCP e2e test",
        points: "2",
        priority: "high",
        criteria: ["Criterion one", "Criterion two"],
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.text).toContain("S001");
  });

  it("pm_comment_add and pm_comment_list round-trip comments", async () => {
    const addResult = await client.callTool({
      name: "pm_comment_add",
      arguments: {
        target: "MCPT-E001-S001",
        type: "agent",
        content: "Smoke test comment from MCP integration suite",
        author_id: "test-agent",
        tags: ["mcp", "smoke"],
      },
    });

    expect(addResult.isError).toBeFalsy();
    const addContent = addResult.content as Array<{
      type: string;
      text: string;
    }>;
    expect(addContent.length).toBeGreaterThan(0);
    expect(addContent[0]?.text).toContain(
      "Comment C000001 added to MCPT-E001-S001",
    );

    const listResult = await client.callTool({
      name: "pm_comment_list",
      arguments: {
        project: "MCPT",
        task: "MCPT-E001-S001",
        type: "agent",
      },
    });

    expect(listResult.isError).toBeFalsy();
    const listContent = listResult.content as Array<{
      type: string;
      text: string;
    }>;
    expect(listContent.length).toBeGreaterThan(0);
    expect(listContent[0]?.text).toContain("[C000001]");
    expect(listContent[0]?.text).toContain("Author: agent:test-agent");
    expect(listContent[0]?.text).toContain(
      "Smoke test comment from MCP integration suite",
    );
    expect(listContent[0]?.text).toContain("Tags: mcp, smoke");
  });

  it("pm_report_create and pm_report_view round-trip execution reports", async () => {
    const createResult = await client.callTool({
      name: "pm_report_create",
      arguments: {
        task_id: "MCPT-E001-S001",
        agent_id: "test-agent",
        status: "complete",
        decisions: [
          "semantic:Use MCP round-trip tests for comment/report coverage",
        ],
        assumptions: [
          "semantic:MCPT-E001-S001 remains available for integration tests",
        ],
        tradeoffs: ["Single shared fixture|Keeps smoke coverage concise"],
        out_of_scope: [
          "CLI formatting snapshots|Covered by command tests instead",
        ],
        potential_conflicts: [
          "Integration tests share seeded data|low|Current suite executes deterministically",
        ],
      },
    });

    expect(createResult.isError).toBeFalsy();
    const createContent = createResult.content as Array<{
      type: string;
      text: string;
    }>;
    expect(createContent.length).toBeGreaterThan(0);
    expect(createContent[0]?.text).toContain("Report created: MCPT-E001-S001");

    const viewResult = await client.callTool({
      name: "pm_report_view",
      arguments: { task_id: "MCPT-E001-S001" },
    });

    expect(viewResult.isError).toBeFalsy();
    const viewContent = viewResult.content as Array<{
      type: string;
      text: string;
    }>;
    expect(viewContent.length).toBeGreaterThan(0);
    expect(viewContent[0]?.text).toContain("Execution Report: MCPT-E001-S001");
    expect(viewContent[0]?.text).toContain("Agent: test-agent");
    expect(viewContent[0]?.text).toContain(
      "Use MCP round-trip tests for comment/report coverage",
    );
    expect(viewContent[0]?.text).toContain("Single shared fixture");
    expect(viewContent[0]?.text).toContain(
      "Integration tests share seeded data",
    );
  });

  it("pm_adr_query is listed with correct schema", async () => {
    const result = await client.listTools();
    const adrQueryTool = result.tools.find((t) => t.name === "pm_adr_query");

    expect(adrQueryTool).toBeDefined();
    expect(adrQueryTool!.description).toBeTruthy();
    expect(adrQueryTool!.inputSchema).toBeDefined();
    expect(adrQueryTool!.inputSchema.type).toBe("object");

    const props = adrQueryTool!.inputSchema.properties as Record<
      string,
      unknown
    >;
    // All filter parameters should be present
    expect(props).toHaveProperty("status");
    expect(props).toHaveProperty("tags");
    expect(props).toHaveProperty("author");
    expect(props).toHaveProperty("limit");
    expect(props).toHaveProperty("workdir");
  });

  it("pm_agent_heartbeat is listed with progress and log fields", async () => {
    const result = await client.listTools();
    const heartbeatTool = result.tools.find(
      (t) => t.name === "pm_agent_heartbeat",
    );

    expect(heartbeatTool).toBeDefined();
    const props = heartbeatTool!.inputSchema.properties as Record<
      string,
      unknown
    >;
    expect(props).toHaveProperty("total_criteria");
    expect(props).toHaveProperty("completed_criteria");
    expect(props).toHaveProperty("current_step");
    expect(props).toHaveProperty("criteria_status");
    expect(props).toHaveProperty("log_file");
  });

  it("pm_agent_heartbeat delegates progress and log fields to the CLI", async () => {
    const result = await client.callTool({
      name: "pm_agent_heartbeat",
      arguments: {
        agent_id: "mcp-progress-agent",
        log_file: ".pm/agents/mcp-progress-agent.log",
        status: "active",
        total_criteria: 3,
        completed_criteria: 1,
        current_step: "Update schema",
        criteria_status: [
          { criterion: "Schema has progress field", status: "done" },
          { criterion: "MCP accepts progress", status: "pending" },
        ],
      },
    });

    expect(result.isError).toBeFalsy();

    const statePath = path.join(
      tmpDir,
      ".pm",
      "agents",
      "mcp-progress-agent.yaml",
    );
    const content = fs.readFileSync(statePath, "utf8");
    expect(content).toContain("log_file: .pm/agents/mcp-progress-agent.log");
    expect(content).toContain("total_criteria: 3");
    expect(content).toContain("completed_criteria: 1");
    expect(content).toContain("current_step: Update schema");
    expect(content).toContain("criterion: Schema has progress field");
  });

  it("rejects invalid MCP argument types via generated contract validation", async () => {
    const result = await client.callTool({
      name: "pm_epic_add",
      arguments: {
        project: "MCPT",
        title: "Invalid Epic",
        description: "Should fail before command execution",
        priority: 42,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("Expected string, received number");
  });

  it("pm_adr_query delegates to pm adr query CLI", async () => {
    // First create an ADR to query
    const createResult = await client.callTool({
      name: "pm_adr_create",
      arguments: {
        project: "MCPT",
        title: "Query Test ADR",
        status: "accepted",
        context: "Testing ADR query via MCP",
        decision: "Use MCP tool delegation",
        positive_consequences: ["Easy to test"],
        negative_consequences: [],
        author_type: "agent",
        author_id: "test-agent",
        tags: ["mcp", "testing"],
      },
    });

    expect(createResult.isError).toBeFalsy();

    // Now query for it
    const queryResult = await client.callTool({
      name: "pm_adr_query",
      arguments: {
        tags: ["mcp"],
      },
    });

    expect(queryResult.isError).toBeFalsy();
    const content = queryResult.content as Array<{
      type: string;
      text: string;
    }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.text).toContain("Query Test ADR");
  });

  it("pm_adr_query returns empty results when no ADRs exist", async () => {
    // Query with filters that won't match anything
    const result = await client.callTool({
      name: "pm_adr_query",
      arguments: {
        tags: ["nonexistent-tag-xyz"],
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.text).toContain("No ADRs match");
  });

  it("pm_gc_run is listed with correct schema", async () => {
    const result = await client.listTools();
    const gcTool = result.tools.find((t) => t.name === "pm_gc_run");

    expect(gcTool).toBeDefined();
    expect(gcTool!.description).toBeTruthy();
    expect(gcTool!.inputSchema).toBeDefined();
    expect(gcTool!.inputSchema.type).toBe("object");

    const props = gcTool!.inputSchema.properties as Record<string, unknown>;
    expect(props).toHaveProperty("dry_run");
    expect(props).toHaveProperty("workdir");
  });

  it("pm_gc_run delegates to pm gc run CLI and returns summary", async () => {
    const result = await client.callTool({
      name: "pm_gc_run",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.type).toBe("text");
    // GC output includes the summary line
    expect(content[0]?.text).toContain("Garbage Collection");
  });

  it("pm_gc_run supports dry_run parameter", async () => {
    const result = await client.callTool({
      name: "pm_gc_run",
      arguments: { dry_run: true },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]?.text).toContain("dry-run");
  });

  it("returns an error for unknown tool name", async () => {
    await expect(
      client.callTool({ name: "pm_nonexistent", arguments: {} }),
    ).rejects.toThrow();
  });

  describe("workdir parameter (with PM_HOME set)", () => {
    it("pm_status operates in correct directory when workdir is provided", async () => {
      const result = await client.callTool({
        name: "pm_status",
        arguments: { workdir: tmpDir },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("MCPT");
    });

    it("pm_epic_add operates in correct directory when workdir is provided", async () => {
      const result = await client.callTool({
        name: "pm_epic_add",
        arguments: {
          workdir: tmpDir,
          project: "MCPT",
          title: "Workdir Test Epic",
          description: "Epic created with explicit workdir",
          priority: "medium",
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("E002");
    });

    it("pm_story_add operates in correct directory when workdir is provided", async () => {
      const result = await client.callTool({
        name: "pm_story_add",
        arguments: {
          workdir: tmpDir,
          epic: "MCPT-E002",
          title: "Workdir Test Story",
          description: "Story created with explicit workdir",
          points: "1",
          priority: "low",
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("S001");
    });

    it("pm_comment_list operates in correct directory when workdir is provided", async () => {
      const result = await client.callTool({
        name: "pm_comment_list",
        arguments: {
          workdir: tmpDir,
          project: "MCPT",
          task: "MCPT-E001-S001",
          type: "agent",
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain(
        "Smoke test comment from MCP integration suite",
      );
    });

    it("pm_report_view operates in correct directory when workdir is provided", async () => {
      const result = await client.callTool({
        name: "pm_report_view",
        arguments: {
          workdir: tmpDir,
          task_id: "MCPT-E001-S001",
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("Execution Report: MCPT-E001-S001");
    });

    it("falls back to process.cwd() when workdir is omitted", async () => {
      const result = await client.callTool({
        name: "pm_status",
        arguments: { project: "MCPT" },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("MCPT");
    });
  });
});

// ---------------------------------------------------------------------------
// Workdir tests without PM_HOME (local-first mode)
// ---------------------------------------------------------------------------

describe("MCP PM Server workdir (local-first mode)", () => {
  let localClient: Client;
  let localTransport: StdioClientTransport;
  let localTmpDir: string;
  let localOrigPmHome: string | undefined;

  beforeAll(async () => {
    localOrigPmHome = process.env["PM_HOME"];
    delete process.env["PM_HOME"];

    localTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mcp-local-"));

    const initResult = spawnSync(
      "pm",
      [
        "init",
        "--name",
        "Local Test Project",
        "--code",
        "LOCAL",
        "--description",
        "Test project for local-first MCP",
      ],
      { encoding: "utf-8", cwd: localTmpDir },
    );
    if (initResult.status !== 0) {
      throw new Error(
        `Failed to seed local project: ${initResult.stderr || initResult.stdout}`,
      );
    }

    localTransport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
      env: { ...process.env } as Record<string, string>,
      stderr: "pipe",
    });

    localClient = new Client(
      { name: "pm-mcp-local-test", version: "0.0.1" },
      { capabilities: {} },
    );

    await localClient.connect(localTransport);
  }, 15_000);

  afterAll(async () => {
    await localClient?.close();

    if (localOrigPmHome === undefined) {
      delete process.env["PM_HOME"];
    } else {
      process.env["PM_HOME"] = localOrigPmHome;
    }

    if (localTmpDir) {
      fs.rmSync(localTmpDir, { recursive: true, force: true });
    }
  });

  it("pm_status works with workdir pointing to valid .pm/ directory", async () => {
    const result = await localClient.callTool({
      name: "pm_status",
      arguments: { workdir: localTmpDir },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("LOCAL");
  });

  it("pm_epic_add works with workdir pointing to valid .pm/ directory", async () => {
    const result = await localClient.callTool({
      name: "pm_epic_add",
      arguments: {
        workdir: localTmpDir,
        project: "LOCAL",
        title: "Local Workdir Epic",
        description: "Epic created with workdir in local-first mode",
        priority: "high",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("E001");
  });

  it("pm_story_add works with workdir pointing to valid .pm/ directory", async () => {
    const result = await localClient.callTool({
      name: "pm_story_add",
      arguments: {
        workdir: localTmpDir,
        epic: "LOCAL-E001",
        title: "Local Workdir Story",
        description: "Story created with workdir in local-first mode",
        points: "2",
        priority: "medium",
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("S001");
  });

  it("pm_comment_add and pm_comment_list work in local-first mode", async () => {
    const addResult = await localClient.callTool({
      name: "pm_comment_add",
      arguments: {
        workdir: localTmpDir,
        target: "LOCAL-E001-S001",
        type: "agent",
        content: "Local-first MCP comment smoke test",
        author_id: "local-test-agent",
      },
    });

    expect(addResult.isError).toBeFalsy();

    const listResult = await localClient.callTool({
      name: "pm_comment_list",
      arguments: {
        workdir: localTmpDir,
        project: "LOCAL",
        task: "LOCAL-E001-S001",
        type: "agent",
      },
    });

    expect(listResult.isError).toBeFalsy();
    const content = listResult.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("Local-first MCP comment smoke test");
  });

  it("pm_report_create and pm_report_view work in local-first mode", async () => {
    const createResult = await localClient.callTool({
      name: "pm_report_create",
      arguments: {
        workdir: localTmpDir,
        task_id: "LOCAL-E001-S001",
        agent_id: "local-test-agent",
        status: "complete",
        decisions: ["semantic:Verify local-first MCP report delegation"],
      },
    });

    expect(createResult.isError).toBeFalsy();

    const viewResult = await localClient.callTool({
      name: "pm_report_view",
      arguments: {
        workdir: localTmpDir,
        task_id: "LOCAL-E001-S001",
      },
    });

    expect(viewResult.isError).toBeFalsy();
    const content = viewResult.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("Execution Report: LOCAL-E001-S001");
    expect(content[0]?.text).toContain(
      "Verify local-first MCP report delegation",
    );
  });

  it("returns error when workdir points to directory without project.yaml", async () => {
    const noProjectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pm-no-project-"),
    );

    try {
      const result = await localClient.callTool({
        name: "pm_status",
        arguments: { workdir: noProjectDir },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("No .pm directory found");
      expect(content[0]?.text).toContain(noProjectDir);
    } finally {
      fs.rmSync(noProjectDir, { recursive: true, force: true });
    }
  });

  it("error message includes working directory for debugging", async () => {
    const noPmDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-no-pm-"));

    try {
      const result = await localClient.callTool({
        name: "pm_status",
        arguments: { workdir: noPmDir },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("[working directory:");
      expect(content[0]?.text).toContain(noPmDir);
    } finally {
      fs.rmSync(noPmDir, { recursive: true, force: true });
    }
  });

  it("pm_swarm_list returns a graceful error when swarm storage is missing", async () => {
    const noSwarmDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-no-swarm-"));

    try {
      const initResult = spawnSync(
        "pm",
        [
          "init",
          "--name",
          "No Swarm Project",
          "--code",
          "NOSWRM",
          "--description",
          "Project without swarm storage",
        ],
        { encoding: "utf-8", cwd: noSwarmDir, env: { ...process.env } },
      );
      if (initResult.status !== 0) {
        throw new Error(initResult.stderr || initResult.stdout);
      }

      const result = await localClient.callTool({
        name: "pm_swarm_list",
        arguments: {
          workdir: noSwarmDir,
          namespace: "observations",
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toContain("No .pm/swarm directory found");
      expect(content[0]?.text).toContain("[working directory:");
    } finally {
      fs.rmSync(noSwarmDir, { recursive: true, force: true });
    }
  });
});
