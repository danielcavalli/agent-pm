import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

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
  const projectsDir = path.join(tmpDir, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });

  origPmHome = process.env["PM_HOME"];
  process.env["PM_HOME"] = tmpDir;

  // --- seed a project so pm_status / pm_epic_add have something to work with
  // We call the pm CLI directly to seed
  const { spawnSync } = await import("node:child_process");
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
    { encoding: "utf-8", env: { ...process.env, PM_HOME: tmpDir } },
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
    env: { ...(process.env as Record<string, string>), PM_HOME: tmpDir },
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
  it("lists all four tools via tools/list", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "pm_epic_add",
      "pm_project_remove",
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

  it("returns an error for unknown tool name", async () => {
    await expect(
      client.callTool({ name: "pm_nonexistent", arguments: {} }),
    ).rejects.toThrow();
  });
});
