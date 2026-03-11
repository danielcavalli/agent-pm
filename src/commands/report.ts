import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import { ReportSchema, ReportListSchema } from "../schemas/index.js";
import { getProjectsDir } from "../lib/codes.js";
import { ProjectNotFoundError, ReportNotFoundError } from "../lib/errors.js";

const STATUS_ICON: Record<string, string> = {
  success: chalk.green("✓"),
  failed: chalk.red("✗"),
  partial: chalk.yellow("●"),
};

function getReportsDir(projectCode: string): string {
  return path.join(getProjectsDir(), projectCode, "reports");
}

function getReportFile(projectCode: string, reportId: string): string {
  return path.join(getReportsDir(projectCode), `${reportId}.yaml`);
}

export async function reportView(
  projectCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  const reportsDir = getReportsDir(projectCode);

  if (!fs.existsSync(reportsDir)) {
    throw new ReportNotFoundError(`${projectCode}-R001`);
  }

  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  if (files.length === 0) {
    console.log(
      chalk.dim("No reports found") + " in project " + chalk.bold(projectCode),
    );
    return;
  }

  const reports: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const filePath = path.join(reportsDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(
      JSON.stringify(require("js-yaml").load(content) || {}),
    );
    const result = ReportSchema.safeParse(data);
    if (result.success) {
      reports.push(result.data);
    }
  }

  reports.sort((a, b) => {
    return (b.code || "").localeCompare(a.code || "");
  });

  const header = [
    chalk.bold("Code".padEnd(14)),
    chalk.bold("Title".padEnd(30)),
    chalk.bold("Target".padEnd(20)),
    chalk.bold("Status".padEnd(10)),
    chalk.bold("Date"),
  ].join(" ");

  console.log(chalk.dim("─".repeat(90)));
  console.log(header);
  console.log(chalk.dim("─".repeat(90)));

  for (const report of reports) {
    const icon = STATUS_ICON[report.status as string] ?? "?";
    const row = [
      (icon + " " + (report.code as string)).padEnd(14),
      (report.title as string).slice(0, 29).padEnd(30),
      `${report.target_type}:${report.target_code}`.padEnd(20),
      (report.status as string).padEnd(10),
      (report.created_at as string).slice(0, 10),
    ].join(" ");
    console.log(row);
  }
  console.log(chalk.dim("─".repeat(90)));
  console.log(chalk.dim(`Total: ${reports.length} report(s)`));
}
