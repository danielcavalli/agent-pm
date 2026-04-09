import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { readYaml, writeYaml, listFiles, withLock } from "./fs.js";
import {
  AgentProcessSchema,
  AgentStateSchema,
  AgentResponseSchema,
} from "../schemas/agent-state.schema.js";
import {
  EscalationLogEntrySchema,
  EscalationLogSchema,
} from "../schemas/escalation-log.schema.js";
import type {
  AgentProcess,
  AgentState,
  AgentResponse,
} from "../schemas/agent-state.schema.js";
import type {
  EscalationLog,
  EscalationLogEntry,
} from "../schemas/escalation-log.schema.js";
import {
  DEFAULT_STALE_THRESHOLD_SECONDS,
  ProjectSchema,
} from "../schemas/index.js";
import { YamlNotFoundError, ZodValidationError } from "./errors.js";

export const AGENT_HEARTBEAT_STALE_MS = DEFAULT_STALE_THRESHOLD_SECONDS * 1000;

const DERIVED_AGENT_ID_SESSION_SLUG_LENGTH = 24;
const DERIVED_AGENT_ID_HASH_LENGTH = 8;

export interface ObservedAgentState extends AgentState {
  heartbeat_age_ms: number;
  heartbeat_stale: boolean;
  escalation_history?: EscalationLog;
  tracked_pid?: number;
  process_alive?: boolean;
  process_crashed?: boolean;
}

export function isTrackedProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "ESRCH"
    ) {
      return false;
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "EPERM"
    ) {
      return true;
    }

    return true;
  }
}

export interface KillTrackedProcessResult {
  already_dead: boolean;
}

export function killTrackedProcess(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
): KillTrackedProcessResult {
  try {
    process.kill(pid, signal);
    return { already_dead: false };
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "ESRCH"
    ) {
      return { already_dead: true };
    }

    throw err;
  }
}

/**
 * Resolve the agents directory within a .pm directory.
 */
function agentsDir(pmDir: string): string {
  return path.join(pmDir, "agents");
}

function slugifyAgentIdentitySegment(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, DERIVED_AGENT_ID_SESSION_SLUG_LENGTH);

  return slug.length > 0 ? slug : "session";
}

/**
 * Derive the observed agent identity used for persisted worker state.
 *
 * Legacy single-agent flows keep the caller-provided agent_id unchanged.
 * When a session_id is present, the observed identity becomes a deterministic
 * session-scoped id so concurrent workers that share a base agent_id do not
 * overwrite each other.
 */
export function deriveObservedAgentId(
  agentId: string,
  sessionId?: string,
): string {
  if (!sessionId) {
    return agentId;
  }

  const sessionSlug = slugifyAgentIdentitySegment(sessionId);
  const sessionHash = createHash("sha1")
    .update(sessionId)
    .digest("hex")
    .slice(0, DERIVED_AGENT_ID_HASH_LENGTH);
  const derivedSuffix = `--${sessionSlug}-${sessionHash}`;

  return agentId.endsWith(derivedSuffix)
    ? agentId
    : `${agentId}${derivedSuffix}`;
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
 * Resolve the file path for an agent process file.
 */
function agentProcessPath(pmDir: string, agentId: string): string {
  return path.join(agentsDir(pmDir), `${agentId}-process.yaml`);
}

/**
 * Resolve the file path for an agent escalation log file.
 */
function escalationLogPath(pmDir: string, agentId: string): string {
  return path.join(agentsDir(pmDir), `${agentId}-escalation-log.yaml`);
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
 * Write a Zod-validated agent process record to .pm/agents/{agent_id}-process.yaml.
 */
export function writeAgentProcess(
  pmDir: string,
  agentId: string,
  agentProcess: AgentProcess,
): void {
  const filePath = agentProcessPath(pmDir, agentId);
  const result = AgentProcessSchema.safeParse(agentProcess);
  if (!result.success) {
    throw new ZodValidationError(filePath, result.error);
  }

  writeYaml(filePath, result.data);
}

/**
 * Read and validate a single agent process file.
 */
export function readAgentProcess(pmDir: string, agentId: string): AgentProcess {
  return readYaml(agentProcessPath(pmDir, agentId), AgentProcessSchema);
}

/**
 * Compute the current heartbeat age for an agent state.
 */
export function getHeartbeatAgeMs(
  agentState: AgentState,
  now = Date.now(),
): number {
  const lastHeartbeatMs = Date.parse(agentState.last_heartbeat);
  if (!Number.isFinite(lastHeartbeatMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, now - lastHeartbeatMs);
}

/**
 * Detect whether an agent heartbeat is stale.
 */
export function isAgentHeartbeatStale(
  agentState: AgentState,
  now = Date.now(),
  staleAfterMs = AGENT_HEARTBEAT_STALE_MS,
): boolean {
  if (agentState.status === "completed") {
    return false;
  }

  return getHeartbeatAgeMs(agentState, now) > staleAfterMs;
}

/**
 * Load the configured heartbeat staleness threshold from project.yaml.
 */
export function getHeartbeatStaleThresholdMs(pmDir: string): number {
  const projectFile = path.join(pmDir, "project.yaml");

  try {
    const project = readYaml(projectFile, ProjectSchema);
    return project.stale_threshold_seconds * 1000;
  } catch {
    return AGENT_HEARTBEAT_STALE_MS;
  }
}

/**
 * Attach derived heartbeat health fields for TUI and monitoring consumers.
 */
export function observeAgentState(
  agentState: AgentState,
  now = Date.now(),
  staleAfterMs = AGENT_HEARTBEAT_STALE_MS,
  escalationHistory: EscalationLog = [],
): ObservedAgentState {
  const heartbeat_age_ms = getHeartbeatAgeMs(agentState, now);

  return {
    ...agentState,
    heartbeat_age_ms,
    heartbeat_stale: isAgentHeartbeatStale(agentState, now, staleAfterMs),
    escalation_history: escalationHistory,
  };
}

function observeAgentProcess(
  pmDir: string,
  agentState: AgentState,
  observedState: ObservedAgentState,
): ObservedAgentState {
  try {
    const agentProcess = readAgentProcess(pmDir, agentState.agent_id);
    const process_alive = isTrackedProcessAlive(agentProcess.pid);

    return {
      ...observedState,
      tracked_pid: agentProcess.pid,
      process_alive,
      process_crashed: agentState.status === "active" && !process_alive,
    };
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      return observedState;
    }

    process.stderr.write(
      `Warning: unable to load agent process file for ${agentState.agent_id}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return observedState;
  }
}

/**
 * List all valid agent state files in .pm/agents/.
 * Returns an array of parsed AgentState objects.
 * Skips invalid files with stderr warnings.
 */
export function listAgents(
  pmDir: string,
  staleAfterMs = AGENT_HEARTBEAT_STALE_MS,
): ObservedAgentState[] {
  const dir = agentsDir(pmDir);
  const files = listFiles(dir, ".yaml");

  const agents: ObservedAgentState[] = [];
  const now = Date.now();
  for (const filePath of files) {
    const basename = path.basename(filePath);
    // Skip response files (e.g. agent-id-response.yaml)
    if (
      basename.endsWith("-response.yaml") ||
      basename.endsWith("-escalation-log.yaml") ||
      basename.endsWith("-process.yaml")
    ) {
      continue;
    }
    try {
      const state = readYaml(filePath, AgentStateSchema);
      let escalationHistory: EscalationLog = [];
      try {
        escalationHistory = readEscalationLog(pmDir, state.agent_id);
      } catch (logError) {
        process.stderr.write(
          `Warning: skipping invalid escalation log for ${state.agent_id}: ${logError instanceof Error ? logError.message : String(logError)}\n`,
        );
      }
      const observedState = observeAgentState(
        state,
        now,
        staleAfterMs,
        escalationHistory,
      );
      agents.push(observeAgentProcess(pmDir, state, observedState));
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
export async function readAgentResponse(
  pmDir: string,
  agentId: string,
): Promise<AgentResponse | null> {
  const filePath = agentResponsePath(pmDir, agentId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const response = readYaml(filePath, AgentResponseSchema);

  try {
    const agentState = readAgentState(pmDir, agentId);
    if (agentState.escalation) {
      await appendEscalationLogEntry(pmDir, agentId, {
        ...agentState.escalation,
        ...response,
      });
    }
  } catch (error) {
    if (!(error instanceof YamlNotFoundError)) {
      process.stderr.write(
        `Warning: failed to archive escalation response for ${agentId}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  } finally {
    fs.unlinkSync(filePath);
  }

  return response;
}

/**
 * Write a validated escalation log array to .pm/agents/{agent_id}-escalation-log.yaml.
 */
export async function writeEscalationLog(
  pmDir: string,
  agentId: string,
  escalationLog: EscalationLog,
): Promise<void> {
  const filePath = escalationLogPath(pmDir, agentId);
  const result = EscalationLogSchema.safeParse(escalationLog);
  if (!result.success) {
    throw new ZodValidationError(filePath, result.error);
  }

  await withLock(filePath, () => {
    writeYaml(filePath, result.data);
  });
}

/**
 * Read a validated escalation log array, returning [] when the file does not exist.
 */
export function readEscalationLog(
  pmDir: string,
  agentId: string,
): EscalationLog {
  const filePath = escalationLogPath(pmDir, agentId);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return readYaml(filePath, EscalationLogSchema);
}

/**
 * Append a single validated escalation log entry to the agent's log file.
 */
export async function appendEscalationLogEntry(
  pmDir: string,
  agentId: string,
  escalationLogEntry: EscalationLogEntry,
): Promise<void> {
  const filePath = escalationLogPath(pmDir, agentId);
  const entryResult = EscalationLogEntrySchema.safeParse(escalationLogEntry);
  if (!entryResult.success) {
    throw new ZodValidationError(filePath, entryResult.error);
  }

  await withLock(filePath, () => {
    const log = fs.existsSync(filePath)
      ? readYaml(filePath, EscalationLogSchema)
      : [];
    log.push(entryResult.data);
    writeYaml(filePath, log);
  });
}
