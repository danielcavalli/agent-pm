/**
 * Consolidation pipeline: two-phase deduplication and synthesis.
 *
 * Pipeline order:
 *   1. INGEST     - Load reports and comments, filter already-consolidated items
 *   2. STRUCTURAL - Run structural dedup (exact + fuzzy matching, conflict detection)
 *   3. LLM        - Send only UNMATCHED items from step 2 to LLM semantic clustering
 *   4. MERGE      - Combine structural candidates with LLM candidates into unified set
 *   5. ROUTE      - Output routing operates on the merged set (ADRs, tasks, etc.)
 *   6. MARK       - Mark processed items as consolidated
 */

import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";
import yaml from "js-yaml";
import { readYaml, writeYaml, fileExists } from "../lib/fs.js";
import { getPmDir, getProjectCode } from "../lib/codes.js";
import {
  AgentExecutionReportSchema,
  ConsolidationConfigSchema,
  CrossTaskCommentSchema,
  CommentIndexSchema,
} from "../schemas/index.js";
import type {
  ConsolidationConfig,
  TriggerMode,
  AgentExecutionReport,
  CrossTaskComment,
} from "../schemas/index.js";
import { PmError } from "../lib/errors.js";
import { createLLMClient } from "../lib/llm.js";
import { semanticClustering } from "./semantic-clustering.js";
import { routeOutput } from "./consolidate-output.js";
import { structuralDedup } from "./structural-dedup.js";

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

/**
 * An item that was not matched during structural deduplication,
 * to be passed to the LLM semantic clustering phase.
 */
export interface UnmatchedItem {
  reportId: string;
  category: "decision" | "assumption";
  text: string;
}

/**
 * Default consolidation config used when no config is present in project.yaml.
 */
const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  max_reports_per_run: 10,
  trigger_mode: "manual" as TriggerMode,
};

/**
 * Load consolidation config from project.yaml at runtime.
 * Returns validated config or defaults if not present.
 * Throws PmError with clear messages if config values are invalid.
 */
export function loadConsolidationConfig(): ConsolidationConfig {
  const pmDir = getPmDir();
  const projectYamlPath = path.join(pmDir, "project.yaml");

  if (!fileExists(projectYamlPath)) {
    return { ...DEFAULT_CONSOLIDATION_CONFIG };
  }

  let rawProject: unknown;
  try {
    const content = fs.readFileSync(projectYamlPath, "utf8");
    rawProject = yaml.load(content);
  } catch {
    throw new PmError(
      "CONFIG_LOAD_ERROR",
      `Failed to read project.yaml at ${projectYamlPath}. Ensure the file is valid YAML.`,
    );
  }

  if (
    !rawProject ||
    typeof rawProject !== "object" ||
    !("consolidation" in rawProject)
  ) {
    return { ...DEFAULT_CONSOLIDATION_CONFIG };
  }

  const rawConfig = (rawProject as Record<string, unknown>)["consolidation"];
  if (!rawConfig || typeof rawConfig !== "object") {
    return { ...DEFAULT_CONSOLIDATION_CONFIG };
  }

  const result = ConsolidationConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new PmError(
      "INVALID_CONSOLIDATION_CONFIG",
      `Invalid consolidation config in project.yaml:\n${details}`,
    );
  }

  const config = result.data;

  // Validate trigger condition completeness
  validateTriggerConditions(config);

  return config;
}

/**
 * Validate that trigger conditions are consistent:
 * - event_based requires trigger_event_count
 * - time_based requires trigger_interval_minutes
 * - manual does not require additional fields
 */
function validateTriggerConditions(config: ConsolidationConfig): void {
  if (
    config.trigger_mode === "event_based" &&
    (config.trigger_event_count === undefined ||
      config.trigger_event_count === null)
  ) {
    throw new PmError(
      "INVALID_CONSOLIDATION_CONFIG",
      "Trigger mode 'event_based' requires 'trigger_event_count' to be set in consolidation config.",
    );
  }

  if (
    config.trigger_mode === "time_based" &&
    (config.trigger_interval_minutes === undefined ||
      config.trigger_interval_minutes === null)
  ) {
    throw new PmError(
      "INVALID_CONSOLIDATION_CONFIG",
      "Trigger mode 'time_based' requires 'trigger_interval_minutes' to be set in consolidation config.",
    );
  }
}

/**
 * Result of the ingestion phase: tracks what was collected for synthesis.
 */
export interface IngestionSummary {
  reportsProcessed: number;
  commentsProcessed: number;
  reportsSkipped: number;
  commentsSkipped: number;
}

/**
 * A loaded report with its file path for later marking.
 */
export interface LoadedReport {
  filePath: string;
  data: AgentExecutionReport;
}

/**
 * A loaded comment with its file path for later marking.
 */
export interface LoadedComment {
  filePath: string;
  data: CrossTaskComment;
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

/**
 * Find all individual comment YAML files in .pm/comments/.
 * Excludes the index.yaml file.
 */
export function findCommentFiles(): string[] {
  const pmDir = getPmDir();
  const commentsDir = path.join(pmDir, "comments");

  if (!fileExists(commentsDir)) {
    return [];
  }

  const files = fs.readdirSync(commentsDir);
  return files
    .filter((f) => f.endsWith(".yaml") && f !== "index.yaml")
    .map((f) => path.join(commentsDir, f));
}

/**
 * Load and filter reports: skip consolidated ones and those older than last_consolidated_at.
 */
export function ingestReports(
  reportPaths: string[],
  lastConsolidatedAt?: string,
): { loaded: LoadedReport[]; skipped: number } {
  const loaded: LoadedReport[] = [];
  let skipped = 0;

  for (const filePath of reportPaths) {
    try {
      const data = readYaml(filePath, AgentExecutionReportSchema);

      // Skip already consolidated reports
      if (data.consolidated) {
        skipped++;
        continue;
      }

      // Skip reports older than last_consolidated_at
      if (lastConsolidatedAt && data.timestamp) {
        const reportTime = new Date(data.timestamp).getTime();
        const cutoffTime = new Date(lastConsolidatedAt).getTime();
        if (reportTime <= cutoffTime) {
          skipped++;
          continue;
        }
      }

      loaded.push({ filePath, data });
    } catch {
      // Skip invalid reports
    }
  }

  return { loaded, skipped };
}

/**
 * Load and filter comments: skip consolidated ones and those older than last_consolidated_at.
 */
export function ingestComments(
  commentPaths: string[],
  lastConsolidatedAt?: string,
): { loaded: LoadedComment[]; skipped: number } {
  const loaded: LoadedComment[] = [];
  let skipped = 0;

  for (const filePath of commentPaths) {
    try {
      const data = readYaml(filePath, CrossTaskCommentSchema);

      // Skip already consolidated comments
      if (data.consolidated) {
        skipped++;
        continue;
      }

      // Skip comments older than last_consolidated_at
      if (lastConsolidatedAt && data.timestamp) {
        const commentTime = new Date(data.timestamp).getTime();
        const cutoffTime = new Date(lastConsolidatedAt).getTime();
        if (commentTime <= cutoffTime) {
          skipped++;
          continue;
        }
      }

      loaded.push({ filePath, data });
    } catch {
      // Skip invalid comments
    }
  }

  return { loaded, skipped };
}

/**
 * Mark processed reports as consolidated by setting consolidated: true
 * in their YAML files.
 */
export function markReportsConsolidated(reports: LoadedReport[]): void {
  for (const report of reports) {
    try {
      const content = fs.readFileSync(report.filePath, "utf8");
      const raw = yaml.load(content) as Record<string, unknown>;
      raw.consolidated = true;
      const updated = yaml.dump(raw, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
      });
      fs.writeFileSync(report.filePath, updated, "utf8");
    } catch {
      // Best-effort marking
    }
  }
}

/**
 * Mark processed comments as consolidated by setting consolidated: true
 * in both their individual YAML files and the comment index.
 */
export function markCommentsConsolidated(comments: LoadedComment[]): void {
  const commentIds = new Set(comments.map((c) => c.data.id));

  // Mark individual comment files
  for (const comment of comments) {
    try {
      const content = fs.readFileSync(comment.filePath, "utf8");
      const raw = yaml.load(content) as Record<string, unknown>;
      raw.consolidated = true;
      const updated = yaml.dump(raw, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
      });
      fs.writeFileSync(comment.filePath, updated, "utf8");
    } catch {
      // Best-effort marking
    }
  }

  // Update the comment index
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "comments", "index.yaml");
  if (fileExists(indexPath)) {
    try {
      const index = readYaml(indexPath, CommentIndexSchema);
      for (const entry of index.comments) {
        if (commentIds.has(entry.id)) {
          entry.consolidated = true;
        }
      }
      writeYaml(indexPath, index);
    } catch {
      // Best-effort index update
    }
  }
}

/**
 * Update last_consolidated_at in project.yaml.
 */
export function updateLastConsolidatedAt(timestamp: string): void {
  const pmDir = getPmDir();
  const projectYamlPath = path.join(pmDir, "project.yaml");

  if (!fileExists(projectYamlPath)) {
    return;
  }

  try {
    const content = fs.readFileSync(projectYamlPath, "utf8");
    const rawProject = yaml.load(content) as Record<string, unknown>;

    if (
      !rawProject.consolidation ||
      typeof rawProject.consolidation !== "object"
    ) {
      rawProject.consolidation = {
        max_reports_per_run: 10,
        trigger_mode: "manual",
        last_consolidated_at: timestamp,
      };
    } else {
      (
        rawProject.consolidation as Record<string, unknown>
      ).last_consolidated_at = timestamp;
    }

    const updated = yaml.dump(rawProject, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(projectYamlPath, updated, "utf8");
  } catch {
    // Best-effort update
  }
}

/**
 * Phase 2: LLM semantic synthesis on items NOT matched by structural dedup.
 *
 * This function receives only the unmatched items from Phase 1 (structural
 * dedup) plus any cross-task comments, and uses an LLM to identify semantic
 * clusters and synthesize findings.
 *
 * Pipeline position: ingest -> structural dedup -> [THIS] -> merge -> route
 */
async function synthesizeItems(
  unmatchedItems: UnmatchedItem[],
  comments: LoadedComment[],
): Promise<SynthesisResult> {
  if (unmatchedItems.length === 0 && comments.length === 0) {
    return { candidates: [], unmatched: [], summary: "No items found" };
  }

  const llm = createLLMClient();

  // Separate unmatched items by category for the prompt
  const decisions = unmatchedItems.filter((i) => i.category === "decision");
  const assumptions = unmatchedItems.filter(
    (i) => i.category === "assumption",
  );

  const decisionsText = decisions
    .map(
      (d, i) =>
        `${i + 1}. [DECISION] "${d.text}" (source: ${d.reportId})`,
    )
    .join("\n");

  const assumptionsText = assumptions
    .map(
      (a, i) =>
        `${i + 1}. [ASSUMPTION] "${a.text}" (source: ${a.reportId})`,
    )
    .join("\n");

  const commentsText = comments
    .map(
      (c, i) =>
        `${i + 1}. [COMMENT] "${c.data.content}" (target: ${c.data.target_task_id}, id: ${c.data.id})`,
    )
    .join("\n");

  const prompt = `You are an architect analyzing agent execution reports and cross-task comments. Review the following decisions, assumptions, and comments from multiple sources and identify:

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
  "summary": "2-3 sentence summary of what was learned across all reports and comments"
}

Decisions:
${decisionsText}

Assumptions:
${assumptionsText}

Comments:
${commentsText}

Respond with valid JSON only, no other text.`;

  const response = await llm.complete(prompt);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : JSON.parse(response);

    return {
      candidates: parsed.candidates || [],
      unmatched: parsed.unmatched || [],
      summary: parsed.summary || "Synthesis complete",
    };
  } catch {
    // On parse failure, return the raw unmatched items + comments as-is
    return {
      candidates: [],
      unmatched: [
        ...unmatchedItems,
        ...comments.map((c) => ({
          reportId: c.data.target_task_id,
          category: "decision" as const,
          text: c.data.content,
        })),
      ],
      summary: "Synthesis failed to parse, raw items provided",
    };
  }
}

/**
 * Merge structural dedup results with LLM semantic clustering results.
 *
 * Pipeline position: ingest -> structural dedup -> LLM semantic clustering -> [THIS] -> route
 *
 * Combines:
 * - Structural candidates (exact/fuzzy matches) from Phase 1
 * - LLM candidates (semantic matches) from Phase 2
 * - Remaining unmatched items from the LLM phase
 *
 * The merged set is the single unified finding set used for all output routing.
 */
export function mergeResults(
  structuralCandidates: SynthesisCandidate[],
  llmResult: SynthesisResult,
): SynthesisResult {
  // Combine candidates from both phases into a unified set
  const mergedCandidates = [
    ...structuralCandidates,
    ...llmResult.candidates,
  ];

  // The LLM already only processed unmatched items from structural phase,
  // so its unmatched output is the final set of truly unmatched items.
  const mergedUnmatched = llmResult.unmatched;

  return {
    candidates: mergedCandidates,
    unmatched: mergedUnmatched,
    summary: llmResult.summary,
  };
}

export async function consolidate(
  _projectCode?: string,
  options?: { dryRun?: boolean },
): Promise<IngestionSummary> {
  const dryRun = options?.dryRun ?? false;

  if (dryRun) {
    console.log(
      chalk.bold.yellow("\n  [DRY RUN] Consolidation Preview\n"),
    );
    console.log(
      chalk.yellow(
        "  No files will be written. Showing what would be created.\n",
      ),
    );
  } else {
    console.log(chalk.bold("\n  Consolidating Reports and Comments\n"));
  }

  // ── Step 1: INGEST ──
  // Load consolidation config from project.yaml
  const config = loadConsolidationConfig();
  console.log(
    chalk.dim(
      `  Config: max_reports_per_run=${config.max_reports_per_run}, trigger_mode=${config.trigger_mode}`,
    ),
  );

  // Ingest reports
  const reportPaths = findReportFiles();
  const { loaded: loadedReports, skipped: reportsSkipped } = ingestReports(
    reportPaths,
    config.last_consolidated_at,
  );

  // Ingest comments
  const commentPaths = findCommentFiles();
  const { loaded: loadedComments, skipped: commentsSkipped } = ingestComments(
    commentPaths,
    config.last_consolidated_at,
  );

  console.log(
    chalk.dim(
      `  Found ${reportPaths.length} report(s), ${commentPaths.length} comment(s)`,
    ),
  );
  console.log(
    chalk.dim(
      `  After filtering: ${loadedReports.length} report(s), ${loadedComments.length} comment(s) to process`,
    ),
  );
  if (reportsSkipped > 0 || commentsSkipped > 0) {
    console.log(
      chalk.dim(
        `  Skipped: ${reportsSkipped} report(s), ${commentsSkipped} comment(s) (already consolidated or before cutoff)`,
      ),
    );
  }

  if (loadedReports.length === 0 && loadedComments.length === 0) {
    console.log(chalk.yellow("  No new items to consolidate"));
    return {
      reportsProcessed: 0,
      commentsProcessed: 0,
      reportsSkipped,
      commentsSkipped,
    };
  }

  // Enforce max_reports_per_run (applies to reports only)
  let reportsToProcess = loadedReports;
  if (reportsToProcess.length > config.max_reports_per_run) {
    console.log(
      chalk.dim(
        `  Limiting to ${config.max_reports_per_run} reports (max_reports_per_run)`,
      ),
    );
    reportsToProcess = reportsToProcess.slice(0, config.max_reports_per_run);
  }

  // ── Step 2: STRUCTURAL DEDUP (Phase 1) ──
  // Runs first: identifies exact/fuzzy duplicates and contradictions.
  // Produces grouped candidates and a set of unmatched items.
  console.log(chalk.dim("  Phase 1: Structural deduplication..."));
  const dedupResult = structuralDedup(reportsToProcess);

  console.log(
    chalk.green("  [ok]") +
      ` Structural dedup: ${dedupResult.stats.exactMatches} exact, ${dedupResult.stats.fuzzyMatches} fuzzy matches`,
  );
  if (dedupResult.conflicts.length > 0) {
    console.log(
      chalk.yellow(
        `  [!] ${dedupResult.conflicts.length} conflict(s) detected:`,
      ),
    );
    for (const conflict of dedupResult.conflicts) {
      console.log(chalk.yellow(`      - ${conflict.reason}`));
    }
  }
  console.log(
    chalk.dim(
      `  - ${dedupResult.candidates.length} structural candidate(s), ${dedupResult.unmatched.length} unmatched item(s)`,
    ),
  );

  // ── Step 3: LLM SEMANTIC CLUSTERING (Phase 2) ──
  // Receives ONLY unmatched items from structural dedup phase, not all items.
  // This ensures the LLM does not re-process items already grouped structurally.
  console.log(chalk.dim("  Phase 2: LLM synthesis on remaining items..."));
  const synthesisResult = await synthesizeItems(
    dedupResult.unmatched,
    loadedComments,
  );

  // ── Step 4: MERGE ──
  // Combine structural candidates with LLM candidates into a unified finding set.
  // Output routing operates on this merged set, not on separate sets.
  const mergedResult = mergeResults(dedupResult.candidates, synthesisResult);

  console.log(chalk.green("  [ok]") + " Synthesis complete");
  console.log(
    chalk.dim(
      `  - ${mergedResult.candidates.length} total candidate(s) identified (${dedupResult.candidates.length} structural + ${synthesisResult.candidates.length} semantic)`,
    ),
  );
  console.log(
    chalk.dim(`  - ${mergedResult.unmatched.length} unmatched item(s)`),
  );

  if (dryRun) {
    // ── Dry-run output: print proposed ADRs ──
    const confirmedDecisions = mergedResult.candidates.filter(
      (c) => c.type === "confirmed_decision",
    );
    if (confirmedDecisions.length > 0) {
      console.log(
        chalk.yellow.bold("\n  [DRY RUN] Proposed ADRs that would be created:"),
      );
      for (const decision of confirmedDecisions) {
        const title = decision.content.substring(0, 60);
        const sources = decision.sourceReportIds.join(", ");
        console.log(chalk.yellow(`    - ADR: "${title}"`));
        console.log(chalk.dim(`      Sources: ${sources}`));
      }
    } else {
      console.log(
        chalk.yellow("\n  [DRY RUN] No ADRs would be created"),
      );
    }

    // ── Dry-run output: print proposed gap resolution tasks ──
    if (mergedResult.unmatched.length > 0) {
      console.log(chalk.dim("  Performing semantic clustering..."));
      const clusteringResult = await semanticClustering(
        mergedResult.unmatched,
      );
      console.log(
        chalk.green("  [ok]") +
          ` Clustering complete: ${clusteringResult.clusters.length} cluster(s)`,
      );

      const taskClusters = clusteringResult.clusters.filter(
        (c) => c.recommendation === "create_task",
      );
      if (taskClusters.length > 0) {
        console.log(
          chalk.yellow.bold(
            `\n  [DRY RUN] ${taskClusters.length} gap task(s) would be created (priority: medium):`,
          ),
        );
        for (const cluster of taskClusters) {
          console.log(chalk.yellow(`    - Gap: "${cluster.theme}"`));
          console.log(chalk.dim(`      Synthesis: ${cluster.synthesis}`));
          console.log(
            chalk.dim(
              `      Sources: ${cluster.items.map((i) => i.reportId).join(", ")}`,
            ),
          );
        }
      } else {
        console.log(
          chalk.yellow("\n  [DRY RUN] No gap tasks would be created"),
        );
      }
    } else {
      console.log(chalk.dim("  No unmatched items to cluster"));
      console.log(
        chalk.yellow("\n  [DRY RUN] No gap tasks would be created"),
      );
    }

    // ── Dry-run output: print items that would be marked consolidated ──
    console.log(
      chalk.yellow.bold(
        "\n  [DRY RUN] Items that would be marked consolidated:",
      ),
    );
    if (reportsToProcess.length > 0) {
      console.log(
        chalk.yellow(
          `    - ${reportsToProcess.length} report(s):`,
        ),
      );
      for (const report of reportsToProcess) {
        console.log(
          chalk.dim(`      - ${report.data.task_id} (${path.basename(report.filePath)})`),
        );
      }
    }
    if (loadedComments.length > 0) {
      console.log(
        chalk.yellow(
          `    - ${loadedComments.length} comment(s):`,
        ),
      );
      for (const comment of loadedComments) {
        console.log(
          chalk.dim(`      - ${comment.data.id} (${path.basename(comment.filePath)})`),
        );
      }
    }

    // Print summary
    const summary: IngestionSummary = {
      reportsProcessed: reportsToProcess.length,
      commentsProcessed: loadedComments.length,
      reportsSkipped,
      commentsSkipped,
    };

    console.log(chalk.yellow("\n  [DRY RUN] Consolidation preview complete"));
    console.log(
      chalk.white(
        `  Would process: ${summary.reportsProcessed} report(s), ${summary.commentsProcessed} comment(s)`,
      ),
    );
    if (summary.reportsSkipped > 0 || summary.commentsSkipped > 0) {
      console.log(
        chalk.dim(
          `  Skipped: ${summary.reportsSkipped} report(s), ${summary.commentsSkipped} comment(s)`,
        ),
      );
    }
    console.log(
      chalk.yellow("  No files were written."),
    );

    return summary;
  }

  // ── Step 5: ROUTE ──
  // Output routing operates on the MERGED set (structural + LLM combined).
  if (mergedResult.unmatched.length > 0) {
    console.log(chalk.dim("  Performing semantic clustering..."));
    const clusteringResult = await semanticClustering(
      mergedResult.unmatched,
    );
    console.log(
      chalk.green("  [ok]") +
        ` Clustering complete: ${clusteringResult.clusters.length} cluster(s)`,
    );

    const projectCode = getProjectCode() || _projectCode || "PROJECT";
    const outputResult = await routeOutput(
      projectCode,
      mergedResult,
      clusteringResult,
    );

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
    console.log(chalk.dim("  No unmatched items to cluster"));
  }

  // ── Step 6: MARK ──
  // Mark processed items as consolidated
  markReportsConsolidated(reportsToProcess);
  markCommentsConsolidated(loadedComments);

  // Update last_consolidated_at timestamp
  const now = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace("Z", "");
  updateLastConsolidatedAt(now);

  // Print ingestion summary
  const summary: IngestionSummary = {
    reportsProcessed: reportsToProcess.length,
    commentsProcessed: loadedComments.length,
    reportsSkipped,
    commentsSkipped,
  };

  console.log(chalk.green("\n  Consolidation complete"));
  console.log(
    chalk.white(
      `  Ingestion summary: ${summary.reportsProcessed} report(s), ${summary.commentsProcessed} comment(s) processed`,
    ),
  );
  if (summary.reportsSkipped > 0 || summary.commentsSkipped > 0) {
    console.log(
      chalk.dim(
        `  Skipped: ${summary.reportsSkipped} report(s), ${summary.commentsSkipped} comment(s)`,
      ),
    );
  }

  return summary;
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

  await consolidate(projectCode, { dryRun: opts.dryRun });
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

  const config = loadConsolidationConfig();

  console.log(chalk.cyan.bold("\n  Consolidation Config: " + projectCode));
  console.log(
    chalk.white("  trigger_mode: ") + chalk.green(config.trigger_mode),
  );
  console.log(
    chalk.white("  max_reports_per_run: ") +
      chalk.green(String(config.max_reports_per_run)),
  );
  if (config.trigger_event_count !== undefined) {
    console.log(
      chalk.white("  trigger_event_count: ") +
        chalk.green(String(config.trigger_event_count)),
    );
  }
  if (config.trigger_interval_minutes !== undefined) {
    console.log(
      chalk.white("  trigger_interval_minutes: ") +
        chalk.green(String(config.trigger_interval_minutes)),
    );
  }
  if (config.last_consolidated_at !== undefined) {
    console.log(
      chalk.white("  last_consolidated_at: ") +
        chalk.green(config.last_consolidated_at),
    );
  }
}
