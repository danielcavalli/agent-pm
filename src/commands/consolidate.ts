import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";
import { readYaml, fileExists } from "../lib/fs.js";
import { getPmDir, parseStoryCode, getProjectCode } from "../lib/codes.js";
import { AgentExecutionReportSchema } from "../schemas/index.js";
import { createLLMClient } from "../lib/llm.js";
import { semanticClustering } from "./semantic-clustering.js";
import { routeOutput } from "./consolidate-output.js";

export interface SynthesisCandidate {
  type: "confirmed_decision" | "rejected_alternative" | "lesson_learned";
  content: string;
  sourceReportIds: string[];
}

export interface SynthesisResult {
  candidates: SynthesisCandidate[];
  unmatched: {
    reportId: string;
    category: "decision" | "assumption";
    text: string;
  }[];
  summary: string;
}

function findReportFiles(): string[] {
  const pmDir = getPmDir();
  const reportsDir = path.join(pmDir, "reports");

  if (!fileExists(reportsDir)) {
    return [];
  }

  const files = fs.readdirSync(reportsDir);
  return files
    .filter((f) => f.endsWith("-report.yaml"))
    .map((f) => path.join(reportsDir, f));
}

async function synthesizeReports(
  reportPaths: string[],
): Promise<SynthesisResult> {
  if (reportPaths.length === 0) {
    return { candidates: [], unmatched: [], summary: "No reports found" };
  }

  const reports = [];
  for (const reportPath of reportPaths) {
    try {
      const data = readYaml(reportPath, AgentExecutionReportSchema);
      reports.push(data);
    } catch {
      // Skip invalid reports
    }
  }

  if (reports.length === 0) {
    return { candidates: [], unmatched: [], summary: "No valid reports found" };
  }

  const llm = createLLMClient();

  const decisionsText = reports
    .flatMap((r) =>
      (r.decisions || []).map((d: { type: string; text: string }) => ({
        reportId: r.task_id,
        category: "decision" as const,
        text: d.text,
      })),
    )
    .map((d, i) => `${i + 1}. [DECISION] "${d.text}" (source: ${d.reportId})`)
    .join("\n");

  const assumptionsText = reports
    .flatMap((r) =>
      (r.assumptions || []).map((a: { type: string; text: string }) => ({
        reportId: r.task_id,
        category: "assumption" as const,
        text: a.text,
      })),
    )
    .map((a, i) => `${i + 1}. [ASSUMPTION] "${a.text}" (source: ${a.reportId})`)
    .join("\n");

  const prompt = `You are an architect analyzing agent execution reports. Review the following decisions and assumptions from multiple execution reports and identify:

1. **Confirmed decisions** - Architectural choices that were explicitly decided and should be preserved
2. **Rejected alternatives** - Options that were considered but explicitly rejected
3. **Lessons learned** - Insights worth capturing for future work
4. **Unmatched items** - Items that don't fit the above categories

Respond in JSON format:
{
  "candidates": [
    {
      "type": "confirmed_decision|rejected_alternative|lesson_learned",
      "content": "the decision or insight text",
      "sourceReportIds": ["PM-E001-S001", "PM-E001-S002"]
    }
  ],
  "unmatched": [
    {
      "reportId": "PM-E001-S001",
      "category": "decision|assumption",
      "text": "the text"
    }
  ],
  "summary": "2-3 sentence summary of what was learned across all reports"
}

Decisions:
${decisionsText}

Assumptions:
${assumptionsText}

Respond with valid JSON only, no other text.`;

  const response = await llm.complete(prompt);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);

    return {
      candidates: parsed.candidates || [],
      unmatched: parsed.unmatched || [],
      summary: parsed.summary || "Synthesis complete",
    };
  } catch {
    return {
      candidates: [],
      unmatched: reports.flatMap((r) => [
        ...(r.decisions || []).map((d: { type: string; text: string }) => ({
          reportId: r.task_id,
          category: "decision" as const,
          text: d.text,
        })),
        ...(r.assumptions || []).map((a: { type: string; text: string }) => ({
          reportId: r.task_id,
          category: "assumption" as const,
          text: a.text,
        })),
      ]),
      summary: "Synthesis failed to parse, raw items provided",
    };
  }
}

export async function consolidate(_projectCode?: string): Promise<void> {
  console.log(chalk.bold("\n📊 Consolidating Execution Reports\n"));

  const reportPaths = findReportFiles();
  console.log(chalk.dim(`Found ${reportPaths.length} report(s)`));

  if (reportPaths.length === 0) {
    console.log(chalk.yellow("No reports found to consolidate"));
    return;
  }

  console.log(chalk.dim("Synthesizing reports..."));
  const synthesisResult = await synthesizeReports(reportPaths);

  console.log(chalk.green("✓") + " Synthesis complete");
  console.log(
    chalk.dim(
      `  - ${synthesisResult.candidates.length} candidate(s) identified`,
    ),
  );
  console.log(
    chalk.dim(`  - ${synthesisResult.unmatched.length} unmatched item(s)`),
  );

  if (synthesisResult.unmatched.length > 0) {
    console.log(chalk.dim("Performing semantic clustering..."));
    const clusteringResult = await semanticClustering(
      synthesisResult.unmatched,
    );
    console.log(
      chalk.green("✓") +
        ` Clustering complete: ${clusteringResult.clusters.length} cluster(s)`,
    );

    const projectCode = getProjectCode() || _projectCode || "PROJECT";
    const outputResult = await routeOutput(
      projectCode,
      synthesisResult,
      clusteringResult,
    );

    console.log(chalk.green("\n✓ Consolidation complete"));
    if (outputResult.adrsCreated.length > 0) {
      console.log(
        chalk.green("  ADRs created:") +
          ` ${outputResult.adrsCreated.join(", ")}`,
      );
    }
    if (outputResult.tasksCreated.length > 0) {
      console.log(
        chalk.green("  Tasks created:") +
          ` ${outputResult.tasksCreated.join(", ")}`,
      );
    }
  } else {
    console.log(chalk.dim("\nNo unmatched items to cluster"));
  }
}

interface ConsolidateRunOptions {
  projectCode?: string;
  dryRun?: boolean;
}

export async function consolidateRun(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as ConsolidateRunOptions;
  const projectCode = opts.projectCode?.toUpperCase();

  await consolidate(projectCode);
}

interface ConsolidateConfigOptions {
  projectCode?: string;
  maxReports?: string;
  triggerMode?: string;
}

export async function consolidateConfig(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as ConsolidateConfigOptions;
  const projectCode =
    opts.projectCode?.toUpperCase() || getProjectCode() || "PROJECT";

  console.log(chalk.cyan.bold("\n  Consolidation Config: " + projectCode));
  console.log(
    chalk.dim(
      "  Note: Full configuration not yet implemented - using defaults",
    ),
  );
  console.log(chalk.dim("  trigger_mode: manual"));
  console.log(chalk.dim("  max_reports_per_run: 10"));
}
