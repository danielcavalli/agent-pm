import chalk from "chalk";
import { getPmDir } from "../lib/codes.js";
import {
  deriveObservedAgentId,
  writeAgentState,
  readAgentState,
  readAgentResponse,
} from "../lib/agent-state.js";
import { ValidationError } from "../lib/errors.js";
import type {
  AgentProgress,
  AgentState,
  AgentResponse,
  Escalation,
  EscalationType,
} from "../schemas/agent-state.schema.js";
import { YamlNotFoundError } from "../lib/errors.js";

/**
 * pm agent heartbeat --agent-id X [--session-id S] [--log-file F] [--status S] [--current-task T] [--progress-summary P]
 *
 * Creates or updates .pm/agents/{observed_agent_id}.yaml with last_heartbeat
 * set to the current ISO timestamp. If session_id is present, the observed
 * agent_id is derived from agent_id + session_id so parallel workers do not
 * overwrite each other. Existing single-agent flows still persist directly to
 * .pm/agents/{agent_id}.yaml.
 */
export async function agentHeartbeat(
  options: Record<string, unknown>,
): Promise<void> {
  const agentId = options["agentId"] as string | undefined;
  if (!agentId) {
    throw new ValidationError("Missing required option: --agent-id");
  }

  const sessionId = options["sessionId"] as string | undefined;
  const logFile = options["logFile"] as string | undefined;
  const status = options["status"] as string | undefined;
  const currentTask = options["currentTask"] as string | undefined;
  const progressSummary = options["progressSummary"] as string | undefined;
  const totalCriteria = options["totalCriteria"];
  const completedCriteria = options["completedCriteria"];
  const currentStep = options["currentStep"] as string | undefined;
  const criteriaStatusJson = options["criteriaStatus"] as string | undefined;
  const observedAgentId = deriveObservedAgentId(agentId, sessionId);

  const pmDir = getPmDir();
  const now = new Date().toISOString();

  // Try to read existing state; if it doesn't exist, create a new one
  let existing: AgentState | null = null;
  try {
    existing = readAgentState(pmDir, observedAgentId);
  } catch (err) {
    if (!(err instanceof YamlNotFoundError)) {
      throw err;
    }
    // File doesn't exist yet — will create new state below
  }

  let parsedCriteriaStatus: AgentProgress["criteria_status"] | undefined;
  if (criteriaStatusJson !== undefined) {
    parsedCriteriaStatus = JSON.parse(
      criteriaStatusJson,
    ) as AgentProgress["criteria_status"];
  }

  const progressUpdates: Partial<AgentProgress> = {
    ...(totalCriteria !== undefined
      ? { total_criteria: Number(totalCriteria) }
      : {}),
    ...(completedCriteria !== undefined
      ? { completed_criteria: Number(completedCriteria) }
      : {}),
    ...(currentStep !== undefined ? { current_step: currentStep } : {}),
    ...(parsedCriteriaStatus !== undefined
      ? { criteria_status: parsedCriteriaStatus }
      : {}),
  };
  const hasProgressUpdates = Object.keys(progressUpdates).length > 0;
  const progress = hasProgressUpdates
    ? ({
        ...(existing?.progress ?? {}),
        ...progressUpdates,
      } as AgentProgress)
    : existing?.progress;

  const agentState: AgentState = existing
    ? {
        ...existing,
        last_heartbeat: now,
        ...(sessionId !== undefined ? { session_id: sessionId } : {}),
        ...(logFile !== undefined ? { log_file: logFile } : {}),
        ...(status !== undefined
          ? { status: status as AgentState["status"] }
          : {}),
        ...(currentTask !== undefined ? { current_task: currentTask } : {}),
        ...(progressSummary !== undefined
          ? { progress_summary: progressSummary }
          : {}),
        ...(progress !== undefined ? { progress } : {}),
      }
    : {
        agent_id: observedAgentId,
        status: (status as AgentState["status"]) || "active",
        started_at: now,
        last_heartbeat: now,
        ...(sessionId !== undefined ? { session_id: sessionId } : {}),
        ...(logFile !== undefined ? { log_file: logFile } : {}),
        ...(currentTask !== undefined ? { current_task: currentTask } : {}),
        ...(progressSummary !== undefined
          ? { progress_summary: progressSummary }
          : {}),
        ...(progress !== undefined ? { progress } : {}),
      };

  writeAgentState(pmDir, agentState);

  const verb = existing ? "Updated" : "Created";
  console.log(
    chalk.green(`${verb} agent state for ${observedAgentId}`) +
      chalk.dim(` (last_heartbeat: ${now})`),
  );
}

/**
 * pm agent escalate --agent-id X --type T --message M [--confidence C] [--options o1,o2]
 *
 * Sets the agent's status to needs_attention and populates the escalation field
 * in .pm/agents/{agent_id}.yaml. If the file does not exist, creates it with
 * started_at set to now.
 */
export async function agentEscalate(
  options: Record<string, unknown>,
): Promise<void> {
  const agentId = options["agentId"] as string | undefined;
  if (!agentId) {
    throw new ValidationError("Missing required option: --agent-id");
  }

  const type = options["type"] as string | undefined;
  if (!type) {
    throw new ValidationError("Missing required option: --type");
  }

  const message = options["message"] as string | undefined;
  if (!message) {
    throw new ValidationError("Missing required option: --message");
  }

  const confidence =
    options["confidence"] !== undefined
      ? Number(options["confidence"])
      : undefined;

  const rawOptions = options["options"] as string[] | string | undefined;
  const escalationOptions: string[] | undefined = Array.isArray(rawOptions)
    ? rawOptions
    : typeof rawOptions === "string"
      ? rawOptions.split(",").map((s) => s.trim())
      : undefined;

  const pmDir = getPmDir();
  const now = new Date().toISOString();

  // Build the escalation object
  const escalation: Escalation = {
    type: type as EscalationType,
    message,
    confidence: confidence ?? 0.5,
    ...(escalationOptions ? { options: escalationOptions } : {}),
  };

  // Try to read existing state; if it doesn't exist, create a new one
  let existing: AgentState | null = null;
  try {
    existing = readAgentState(pmDir, agentId);
  } catch (err) {
    if (!(err instanceof YamlNotFoundError)) {
      throw err;
    }
    // File doesn't exist yet — will create new state below
  }

  const agentState: AgentState = existing
    ? {
        ...existing,
        status: "needs_attention",
        last_heartbeat: now,
        escalation,
      }
    : {
        agent_id: agentId,
        status: "needs_attention",
        started_at: now,
        last_heartbeat: now,
        escalation,
      };

  writeAgentState(pmDir, agentState);

  const verb = existing ? "Updated" : "Created";
  console.log(
    chalk.green(`${verb} agent state for ${agentId}`) +
      chalk.dim(` — escalation type: ${type}`),
  );
}

/**
 * pm agent check-response --agent-id X
 *
 * Checks for a human response file at .pm/agents/{agent_id}-response.yaml.
 * If found, returns its contents and deletes the file (read-once semantics).
 * If no response file exists, outputs {status: no_response}.
 */
export async function agentCheckResponse(
  options: Record<string, unknown>,
): Promise<void> {
  const agentId = options["agentId"] as string | undefined;
  if (!agentId) {
    throw new ValidationError("Missing required option: --agent-id");
  }

  const pmDir = getPmDir();
  const response = await readAgentResponse(pmDir, agentId);

  if (response === null) {
    console.log(JSON.stringify({ status: "no_response" }));
  } else {
    console.log(JSON.stringify(response));
  }
}
