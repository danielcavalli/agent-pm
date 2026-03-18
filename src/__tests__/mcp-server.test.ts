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
  it("lists all fourteen tools via tools/list", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "pm_adr_create",
      "pm_adr_query",
      "pm_agent_check_response",
      "pm_agent_escalate",
      "pm_agent_heartbeat",
      "pm_comment_add",
      "pm_comment_list",
      "pm_epic_add",
      "pm_gc_run",
      "pm_project_remove",
      "pm_report_create",
      "pm_report_view",
      "pm_status",
      "pm_story_add",
    ]);

    // Verify each tool has a description and inputSchema
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
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
});
