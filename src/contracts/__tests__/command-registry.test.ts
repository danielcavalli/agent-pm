import { describe, expect, it } from "vitest";
import {
  commandRegistry,
  listMcpCommandContracts,
  shouldEnsureProjectsDir,
} from "../command-registry.js";

describe("commandRegistry", () => {
  it("loads a centralized registry with MCP-capable command metadata", () => {
    expect(commandRegistry.length).toBeGreaterThan(10);
    expect(
      commandRegistry.some(
        (contract) =>
          contract.id === "story.add" &&
          contract.mcp?.toolName === "pm_story_add",
      ),
    ).toBe(true);
    expect(
      commandRegistry.some(
        (contract) =>
          contract.id === "agent.heartbeat" &&
          contract.args.some((arg) => arg.mcp?.name === "criteria_status") &&
          contract.args.some((arg) => arg.mcp?.name === "log_file"),
      ),
    ).toBe(true);
    expect(
      commandRegistry.some((contract) => contract.id === "escalation.list"),
    ).toBe(true);
  });

  it("exposes the current MCP command subset", () => {
    const tools = listMcpCommandContracts().map(
      (contract) => contract.mcp?.toolName,
    );
    expect(tools).toContain("pm_status");
    expect(tools).toContain("pm_story_add");
    expect(tools).toContain("pm_agent_heartbeat");
  });

  it("derives CLI bootstrap policy from registry metadata", () => {
    expect(shouldEnsureProjectsDir(["init"])).toBe(false);
    expect(shouldEnsureProjectsDir(["swarm", "init"])).toBe(false);
    expect(shouldEnsureProjectsDir(["status"])).toBe(false);
    expect(shouldEnsureProjectsDir(["tui"])).toBe(false);
    expect(shouldEnsureProjectsDir(["gc", "run"])).toBe(false);
    expect(shouldEnsureProjectsDir(["story", "add"])).toBe(true);
  });
});
