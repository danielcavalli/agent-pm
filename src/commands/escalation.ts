import chalk from "chalk";
import * as path from "node:path";
import { getPmDir } from "../lib/codes.js";
import { listFiles } from "../lib/fs.js";
import { readEscalationLog } from "../lib/agent-state.js";

interface EscalationListOptions {
  agent?: string;
}

interface EscalationHistoryRow {
  agentId: string;
  timestamp?: string;
  type: string;
  message: string;
  selectedOption?: string;
}

const ESCALATION_LOG_SUFFIX = "-escalation-log.yaml";

function summarizeMessage(message: string, maxLength = 40): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatTimestamp(timestamp?: string): string {
  return timestamp ?? "Pending response";
}

function collectEscalationRows(
  pmDir: string,
  agentFilter?: string,
): EscalationHistoryRow[] {
  const agentsDir = path.join(pmDir, "agents");
  const logFiles = listFiles(agentsDir).filter((filePath) =>
    filePath.endsWith(ESCALATION_LOG_SUFFIX),
  );

  const filteredFiles =
    agentFilter === undefined
      ? logFiles
      : logFiles.filter(
          (filePath) =>
            path.basename(filePath) ===
            `${agentFilter}${ESCALATION_LOG_SUFFIX}`,
        );

  const rows: EscalationHistoryRow[] = [];
  for (const filePath of filteredFiles) {
    const agentId = path
      .basename(filePath)
      .slice(0, -ESCALATION_LOG_SUFFIX.length);

    try {
      const history = readEscalationLog(pmDir, agentId);
      for (const entry of history) {
        rows.push({
          agentId,
          timestamp: entry.responded_at,
          type: entry.type,
          message: summarizeMessage(entry.message),
          selectedOption: entry.selected_option,
        });
      }
    } catch (error) {
      process.stderr.write(
        chalk.yellow("Warning:") +
          ` skipping invalid escalation log for ${agentId}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return rows.sort((left, right) => {
    const leftTime = left.timestamp
      ? Date.parse(left.timestamp)
      : Number.NEGATIVE_INFINITY;
    const rightTime = right.timestamp
      ? Date.parse(right.timestamp)
      : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime;
  });
}

export async function escalationList(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as EscalationListOptions;
  const pmDir = getPmDir();
  const rows = collectEscalationRows(pmDir, opts.agent);

  if (rows.length === 0) {
    console.log(chalk.yellow("No escalation history found"));
    return;
  }

  const header = [
    chalk.bold("Agent ID".padEnd(18)),
    chalk.bold("Timestamp".padEnd(22)),
    chalk.bold("Type".padEnd(15)),
    chalk.bold("Message Summary".padEnd(43)),
    chalk.bold("Selected Option"),
  ].join(" ");

  const lineWidth = 118;
  console.log(chalk.dim("─".repeat(lineWidth)));
  console.log(header);
  console.log(chalk.dim("─".repeat(lineWidth)));

  for (const row of rows) {
    console.log(
      [
        row.agentId.padEnd(18),
        formatTimestamp(row.timestamp).slice(0, 22).padEnd(22),
        row.type.padEnd(15),
        row.message.padEnd(43),
        (row.selectedOption ?? "-").slice(0, 30),
      ].join(" "),
    );
  }

  console.log(chalk.dim("─".repeat(lineWidth)));
}
