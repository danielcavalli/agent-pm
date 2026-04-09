import { AsyncLocalStorage } from "node:async_hooks";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CommandContract } from "../schemas/command-contract.schema.js";
import { getPmDir } from "./codes.js";

type MutationLevel = "write" | "destructive";
type MutationEvent = "start" | "success" | "failure";

type MutationCounters = {
  atomic_writes: number;
  recovered_temp_files: number;
  lock_attempts: number;
  locks_acquired: number;
};

type MutationContext = {
  operationId: string;
  command: string;
  level: MutationLevel;
  startedAtMs: number;
  counters: MutationCounters;
  emittedAnomalyKeys: Set<string>;
};

export type MutationAnomalyKind = "failure" | "warning" | "lock_contention";

export type MutationAnomalyRecord = {
  timestamp: string;
  operation_id: string;
  command: string;
  mutation_level: MutationLevel;
  kind: MutationAnomalyKind;
  summary: string;
  affected_path?: string;
  details?: string[];
};

type MutationTelemetryEvent = {
  type: "mutation";
  event: MutationEvent;
  operation_id: string;
  command: string;
  mutation_level: MutationLevel;
  timestamp: string;
  duration_ms?: number;
  counters?: MutationCounters;
  error?: {
    name: string;
    message: string;
  };
};

const mutationStorage = new AsyncLocalStorage<MutationContext>();
const MUTATION_DIAGNOSTICS_FILE = "mutation-anomalies.jsonl";

function getMutationDiagnosticsPath(): string | null {
  try {
    return path.join(getPmDir(), "diagnostics", MUTATION_DIAGNOSTICS_FILE);
  } catch {
    return null;
  }
}

function appendMutationAnomaly(record: MutationAnomalyRecord): void {
  const diagnosticsPath = getMutationDiagnosticsPath();
  if (!diagnosticsPath) {
    return;
  }

  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.appendFileSync(diagnosticsPath, `${JSON.stringify(record)}\n`, "utf8");
}

function recordMutationAnomaly(
  context: MutationContext,
  record: MutationAnomalyRecord,
  dedupeKey?: string,
): void {
  if (dedupeKey && context.emittedAnomalyKeys.has(dedupeKey)) {
    return;
  }

  if (dedupeKey) {
    context.emittedAnomalyKeys.add(dedupeKey);
  }

  appendMutationAnomaly(record);
}

function createOperationId(command: string): string {
  const slug = command
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "pm-mutation"}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function emitEvent(event: MutationTelemetryEvent): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

function emitSummary(
  context: MutationContext,
  status: "success" | "failure",
): void {
  const durationMs = Date.now() - context.startedAtMs;
  process.stderr.write(
    [
      "mutation_summary",
      `operation_id=${context.operationId}`,
      `command=${JSON.stringify(context.command)}`,
      `status=${status}`,
      `writes=${context.counters.atomic_writes}`,
      `recovered=${context.counters.recovered_temp_files}`,
      `lock_attempts=${context.counters.lock_attempts}`,
      `locks_acquired=${context.counters.locks_acquired}`,
      `duration_ms=${durationMs}`,
    ].join(" ") + "\n",
  );
}

function isMutationLevel(level: string): level is MutationLevel {
  return level === "write" || level === "destructive";
}

export function getCurrentMutationOperationId(): string | undefined {
  return mutationStorage.getStore()?.operationId;
}

export function recordAtomicWrite(
  recoveredTempFileCount: number,
  filePath?: string,
): void {
  const context = mutationStorage.getStore();
  if (!context) {
    return;
  }

  context.counters.atomic_writes += 1;
  context.counters.recovered_temp_files += recoveredTempFileCount;

  if (recoveredTempFileCount > 0) {
    recordMutationAnomaly(
      context,
      {
        timestamp: new Date().toISOString(),
        operation_id: context.operationId,
        command: context.command,
        mutation_level: context.level,
        kind: "warning",
        summary: `Recovered ${recoveredTempFileCount} orphan temp file${recoveredTempFileCount === 1 ? "" : "s"} before publishing`,
        affected_path: filePath,
        details:
          filePath === undefined
            ? undefined
            : [`target_path=${path.resolve(filePath)}`],
      },
      `warning:${filePath ?? "-"}`,
    );
  }
}

export function recordLockAttempt(acquired: boolean, filePath?: string): void {
  const context = mutationStorage.getStore();
  if (!context) {
    return;
  }

  context.counters.lock_attempts += 1;
  if (acquired) {
    context.counters.locks_acquired += 1;
  } else {
    recordMutationAnomaly(
      context,
      {
        timestamp: new Date().toISOString(),
        operation_id: context.operationId,
        command: context.command,
        mutation_level: context.level,
        kind: "lock_contention",
        summary:
          "Lock acquisition retried because the target was already locked",
        affected_path: filePath,
        details:
          filePath === undefined
            ? undefined
            : [`target_path=${path.resolve(filePath)}`],
      },
      `lock_contention:${filePath ?? "-"}`,
    );
  }
}

export async function runMutationOperation<T>(
  contract: CommandContract,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isMutationLevel(contract.sideEffects.level)) {
    return await fn();
  }

  const activeContext = mutationStorage.getStore();
  if (activeContext) {
    return await fn();
  }

  const context: MutationContext = {
    operationId: createOperationId(`pm ${contract.cli.path.join(" ")}`),
    command: `pm ${contract.cli.path.join(" ")}`,
    level: contract.sideEffects.level,
    startedAtMs: Date.now(),
    counters: {
      atomic_writes: 0,
      recovered_temp_files: 0,
      lock_attempts: 0,
      locks_acquired: 0,
    },
    emittedAnomalyKeys: new Set(),
  };

  emitEvent({
    type: "mutation",
    event: "start",
    operation_id: context.operationId,
    command: context.command,
    mutation_level: context.level,
    timestamp: new Date(context.startedAtMs).toISOString(),
  });

  try {
    const result = await mutationStorage.run(context, fn);
    emitEvent({
      type: "mutation",
      event: "success",
      operation_id: context.operationId,
      command: context.command,
      mutation_level: context.level,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - context.startedAtMs,
      counters: { ...context.counters },
    });
    emitSummary(context, "success");
    return result;
  } catch (error) {
    recordMutationAnomaly(context, {
      timestamp: new Date().toISOString(),
      operation_id: context.operationId,
      command: context.command,
      mutation_level: context.level,
      kind: "failure",
      summary: error instanceof Error ? error.message : String(error),
      details:
        error instanceof Error ? [`error_name=${error.name}`] : undefined,
    });
    emitEvent({
      type: "mutation",
      event: "failure",
      operation_id: context.operationId,
      command: context.command,
      mutation_level: context.level,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - context.startedAtMs,
      counters: { ...context.counters },
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    emitSummary(context, "failure");
    throw error;
  }
}
