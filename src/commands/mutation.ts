import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { getPmDir } from "../lib/codes.js";

const MutationAnomalySchema = z.object({
  timestamp: z.string(),
  operation_id: z.string(),
  command: z.string(),
  mutation_level: z.enum(["write", "destructive"]),
  kind: z.enum(["failure", "warning", "lock_contention"]),
  summary: z.string(),
  affected_path: z.string().optional(),
  details: z.array(z.string()).optional(),
});

type MutationAnomaly = z.infer<typeof MutationAnomalySchema>;

interface MutationDiagnosticsOptions {
  limit?: string | number;
  detailed?: boolean;
}

function diagnosticsFilePath(): string {
  return path.join(getPmDir(), "diagnostics", "mutation-anomalies.jsonl");
}

function readAnomalies(): MutationAnomaly[] {
  const filePath = diagnosticsFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => MutationAnomalySchema.parse(JSON.parse(line)))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function kindLabel(kind: MutationAnomaly["kind"]): string {
  switch (kind) {
    case "failure":
      return chalk.red("failure");
    case "warning":
      return chalk.yellow("warning");
    case "lock_contention":
      return chalk.magenta("lock_contention");
  }
}

function formatPath(anomaly: MutationAnomaly): string {
  return anomaly.affected_path ?? "-";
}

export async function mutationDiagnostics(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as MutationDiagnosticsOptions;
  const parsedLimit = Number(opts.limit ?? 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
  const anomalies = readAnomalies().slice(0, limit);

  if (anomalies.length === 0) {
    console.log(chalk.yellow("No recent mutation anomalies recorded"));
    return;
  }

  if (!opts.detailed) {
    console.log(chalk.bold(`Recent mutation anomalies (${anomalies.length})`));
    for (const anomaly of anomalies) {
      console.log(
        `${anomaly.timestamp} ${kindLabel(anomaly.kind)} ${chalk.cyan(anomaly.operation_id)} ${chalk.dim(anomaly.command)} ${formatPath(anomaly)} ` +
          chalk.dim("- ") +
          anomaly.summary,
      );
    }
    return;
  }

  console.log(chalk.bold(`Recent mutation anomalies (${anomalies.length})`));
  console.log("");

  for (const anomaly of anomalies) {
    console.log(
      `${kindLabel(anomaly.kind)} ${chalk.cyan(anomaly.operation_id)}`,
    );
    console.log(`  Timestamp: ${anomaly.timestamp}`);
    console.log(`  Command:   ${anomaly.command}`);
    console.log(`  Path:      ${formatPath(anomaly)}`);
    console.log(`  Summary:   ${anomaly.summary}`);
    if (anomaly.details && anomaly.details.length > 0) {
      console.log(`  Details:   ${anomaly.details.join("; ")}`);
    }
    console.log("");
  }
}
