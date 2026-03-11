import chalk from "chalk";
import * as path from "node:path";
import { readYaml, writeYaml, fileExists } from "../lib/fs.js";
import { findEpicFile, getPmDir, parseStoryCode } from "../lib/codes.js";
import { EpicSchema, AgentExecutionReportSchema } from "../schemas/index.js";
import type { AgentExecutionReport } from "../schemas/index.js";
import {
  EpicNotFoundError,
  StoryNotFoundError,
  ValidationError,
} from "../lib/errors.js";

interface ReportCreateOptions {
  taskId: string;
  agentId?: string;
  timestamp?: string;
  status?: string;
  decisions?: string[];
  assumptions?: string[];
  tradeoffs?: string[];
  outOfScope?: string[];
  potentialConflicts?: string[];
  force?: boolean;
}

function parseDecisionItem(input: string): {
  type: "episodic" | "semantic";
  text: string;
} {
  const match = input.match(/^(episodic|semantic):(.+)$/);
  if (!match) {
    return { type: "episodic", text: input };
  }
  return { type: match[1] as "episodic" | "semantic", text: match[2] };
}

function parseAssumptionItem(input: string): {
  type: "episodic" | "semantic";
  text: string;
} {
  const match = input.match(/^(episodic|semantic):(.+)$/);
  if (!match) {
    return { type: "episodic", text: input };
  }
  return { type: match[1] as "episodic" | "semantic", text: match[2] };
}

function parseTradeoffItem(input: string): {
  alternative: string;
  reason: string;
} {
  const parts = input.split("|");
  return {
    alternative: parts[0]?.trim() || "",
    reason: parts[1]?.trim() || "",
  };
}

function parseOutOfScopeItem(input: string): {
  observation: string;
  note?: string;
} {
  const parts = input.split("|");
  return {
    observation: parts[0]?.trim() || "",
    note: parts[1]?.trim() || undefined,
  };
}

function parsePotentialConflictItem(input: string): {
  assumption: string;
  confidence: "low" | "medium" | "high";
  note?: string;
} {
  const parts = input.split("|");
  const confidence =
    (parts[1]?.trim() as "low" | "medium" | "high") || "medium";
  if (!["low", "medium", "high"].includes(confidence)) {
    return {
      assumption: parts[0]?.trim() || "",
      confidence: "medium",
      note: parts[1]?.trim(),
    };
  }
  return {
    assumption: parts[0]?.trim() || "",
    confidence,
    note: parts[2]?.trim() || undefined,
  };
}

function getReportFilePath(storyCode: string): string {
  const parsed = parseStoryCode(storyCode);
  if (!parsed) {
    throw new ValidationError(`Invalid story code format: ${storyCode}`);
  }
  const reportsDir = path.join(getPmDir(), "reports");
  return path.join(reportsDir, `${storyCode}-report.yaml`);
}

export async function reportCreate(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as ReportCreateOptions;

  if (!opts.taskId) {
    throw new ValidationError("--task-id is required");
  }

  const parsed = parseStoryCode(opts.taskId);
  if (!parsed) {
    throw new ValidationError(
      `Invalid task ID '${opts.taskId}': expected format PROJECT-E###-S### (e.g. PM-E030-S001)`,
    );
  }

  const epicFile = findEpicFile(parsed.epicCode);
  if (!epicFile) {
    throw new EpicNotFoundError(parsed.epicCode);
  }

  const epic = readYaml(epicFile, EpicSchema);
  const story = epic.stories?.find((s) => s.code === opts.taskId);
  if (!story) {
    throw new StoryNotFoundError(opts.taskId);
  }

  const reportFilePath = getReportFilePath(opts.taskId);
  const existingReport = fileExists(reportFilePath);

  if (existingReport && !opts.force) {
    throw new ValidationError(
      `Report already exists for ${opts.taskId}. Use --force to overwrite.`,
    );
  }

  if (existingReport && opts.force) {
    console.log(
      chalk.yellow("⚠") + ` Overwriting existing report for ${opts.taskId}`,
    );
  }

  const reportData: Partial<AgentExecutionReport> = {
    task_id: opts.taskId,
    agent_id: opts.agentId || "",
    timestamp: opts.timestamp || new Date().toISOString(),
    status: (opts.status as "complete" | "partial") || "complete",
    decisions: (opts.decisions || []).map(parseDecisionItem),
    assumptions: (opts.assumptions || []).map(parseAssumptionItem),
    tradeoffs: (opts.tradeoffs || []).map(parseTradeoffItem),
    out_of_scope: (opts.outOfScope || []).map(parseOutOfScopeItem),
    potential_conflicts: (opts.potentialConflicts || []).map(
      parsePotentialConflictItem,
    ),
  };

  const result = AgentExecutionReportSchema.safeParse(reportData);
  if (!result.success) {
    const fieldDetails = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ValidationError(
      `Validation failed:\n${fieldDetails}`,
      result.error,
    );
  }

  // Ensure reports directory exists
  const reportsDir = path.dirname(reportFilePath);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(reportsDir, { recursive: true });

  writeYaml(reportFilePath, result.data);

  console.log(chalk.green("✓") + " Report created: " + chalk.bold(opts.taskId));
  console.log(chalk.dim("  File: ") + reportFilePath);
}

export async function reportView(taskId: string): Promise<void> {
  if (!taskId) {
    throw new ValidationError("task ID is required");
  }

  const parsed = parseStoryCode(taskId);
  if (!parsed) {
    throw new ValidationError(
      `Invalid task ID '${taskId}': expected format PROJECT-E###-S### (e.g. PM-E030-S001)`,
    );
  }

  const reportFilePath = getReportFilePath(taskId);

  if (!fileExists(reportFilePath)) {
    throw new ValidationError(`No report found for ${taskId}`);
  }

  const report = readYaml(reportFilePath, AgentExecutionReportSchema);

  console.log(chalk.bold(`\nExecution Report: ${report.task_id}\n`));
  console.log(chalk.bold("Agent:") + " " + report.agent_id);
  console.log(chalk.bold("Timestamp:") + " " + report.timestamp);
  console.log(chalk.bold("Status:") + " " + report.status);

  if (report.decisions && report.decisions.length > 0) {
    console.log(chalk.bold("\nDecisions:"));
    for (const d of report.decisions) {
      console.log(`  [${d.type}] ${d.text}`);
    }
  }

  if (report.assumptions && report.assumptions.length > 0) {
    console.log(chalk.bold("\nAssumptions:"));
    for (const a of report.assumptions) {
      console.log(`  [${a.type}] ${a.text}`);
    }
  }

  if (report.tradeoffs && report.tradeoffs.length > 0) {
    console.log(chalk.bold("\nTradeoffs:"));
    for (const t of report.tradeoffs) {
      console.log(`  - ${t.alternative}`);
      console.log(chalk.dim(`    Reason: ${t.reason}`));
    }
  }

  if (report.out_of_scope && report.out_of_scope.length > 0) {
    console.log(chalk.bold("\nOut of Scope:"));
    for (const o of report.out_of_scope) {
      console.log(`  - ${o.observation}`);
      if (o.note) console.log(chalk.dim(`    Note: ${o.note}`));
    }
  }

  if (report.potential_conflicts && report.potential_conflicts.length > 0) {
    console.log(chalk.bold("\nPotential Conflicts:"));
    for (const p of report.potential_conflicts) {
      console.log(`  - ${p.assumption} (${p.confidence})`);
      if (p.note) console.log(chalk.dim(`    Note: ${p.note}`));
    }
  }

  console.log();
}
