import * as fs from "node:fs";
import * as path from "node:path";
import { readYaml, writeYaml, listFiles } from "./fs.js";
import {
  AgentStateSchema,
  AgentResponseSchema,
} from "../schemas/agent-state.schema.js";
import type {
  AgentState,
  AgentResponse,
} from "../schemas/agent-state.schema.js";
import { YamlNotFoundError, ZodValidationError } from "./errors.js";

/**
 * Resolve the agents directory within a .pm directory.
 */
function agentsDir(pmDir: string): string {
  return path.join(pmDir, "agents");
}

/**
 * Resolve the file path for an agent state file.
 */
function agentStatePath(pmDir: string, agentId: string): string {
  return path.join(agentsDir(pmDir), `${agentId}.yaml`);
}

/**
 * Resolve the file path for an agent response file.
 */
function agentResponsePath(pmDir: string, agentId: string): string {
  return path.join(agentsDir(pmDir), `${agentId}-response.yaml`);
}

/**
 * Write a Zod-validated agent state to .pm/agents/{agent_id}.yaml.
 * Creates the .pm/agents/ directory if it does not exist.
 * Throws ZodValidationError if the state fails schema validation.
 */
export function writeAgentState(pmDir: string, agentState: AgentState): void {
  const result = AgentStateSchema.safeParse(agentState);
  if (!result.success) {
    throw new ZodValidationError(
      agentStatePath(pmDir, agentState.agent_id ?? "unknown"),
      result.error,
    );
  }
  const filePath = agentStatePath(pmDir, result.data.agent_id);
  writeYaml(filePath, result.data);
}

/**
 * Read and validate a single agent state file.
 * Throws YamlNotFoundError if the file does not exist.
 * Throws YamlParseError if the YAML is malformed.
 * Throws ZodValidationError if schema validation fails.
 */
export function readAgentState(pmDir: string, agentId: string): AgentState {
  const filePath = agentStatePath(pmDir, agentId);
  return readYaml(filePath, AgentStateSchema);
}

/**
 * List all valid agent state files in .pm/agents/.
 * Returns an array of parsed AgentState objects.
 * Skips invalid files with stderr warnings.
 */
export function listAgents(pmDir: string): AgentState[] {
  const dir = agentsDir(pmDir);
  const files = listFiles(dir, ".yaml");

  const agents: AgentState[] = [];
  for (const filePath of files) {
    const basename = path.basename(filePath);
    // Skip response files (e.g. agent-id-response.yaml)
    if (basename.endsWith("-response.yaml")) {
      continue;
    }
    try {
      const state = readYaml(filePath, AgentStateSchema);
      agents.push(state);
    } catch (err) {
      process.stderr.write(
        `Warning: skipping invalid agent state file ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return agents;
}

/**
 * Write a response YAML to .pm/agents/{agent_id}-response.yaml.
 * Creates the .pm/agents/ directory if it does not exist.
 * Throws ZodValidationError if the response fails schema validation.
 */
export function writeAgentResponse(
  pmDir: string,
  agentId: string,
  response: AgentResponse,
): void {
  const result = AgentResponseSchema.safeParse(response);
  if (!result.success) {
    throw new ZodValidationError(
      agentResponsePath(pmDir, agentId),
      result.error,
    );
  }
  const filePath = agentResponsePath(pmDir, agentId);
  writeYaml(filePath, result.data);
}

/**
 * Read and delete the response file atomically (read-once semantics).
 * Returns the parsed AgentResponse, or null if no response file exists.
 * The response file is deleted after a successful read.
 */
export function readAgentResponse(
  pmDir: string,
  agentId: string,
): AgentResponse | null {
  const filePath = agentResponsePath(pmDir, agentId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const response = readYaml(filePath, AgentResponseSchema);
  fs.unlinkSync(filePath);
  return response;
}
