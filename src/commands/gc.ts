import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { readYaml, writeYaml } from "../lib/fs.js";
import { getPmDir, findEpicFile, getProjectCode } from "../lib/codes.js";
import {
  CommentIndexSchema,
  CrossTaskCommentSchema,
  type CrossTaskComment,
} from "../schemas/comment.schema.js";
import { EpicSchema, type Epic } from "../schemas/epic.schema.js";
import {
  ProjectSchema,
  DEFAULT_GC_CONFIG,
  type GcConfig,
} from "../schemas/project.schema.js";
import { ValidationError } from "../lib/errors.js";

export interface GcOptions {
  dryRun?: boolean;
  "dry-run"?: boolean;
  verbose?: boolean;
}

interface GcResult {
  commentsDeleted: number;
  reportsArchived: number;
  adrsSuperseded: number;
}

/**
 * Load gc_config from project.yaml, falling back to defaults.
 */
export function loadGcConfig(): GcConfig {
  try {
    const pmDir = getPmDir();
    const projectYaml = path.join(pmDir, "project.yaml");
    const project = readYaml(projectYaml, ProjectSchema);
    return { ...DEFAULT_GC_CONFIG, ...project.gc_config };
  } catch {
    return { ...DEFAULT_GC_CONFIG };
  }
}

/**
 * Calculate the age in days of an item based on its timestamp.
 * Returns Infinity if the timestamp is missing or unparseable.
 */
function ageDays(timestamp: string | undefined): number {
  if (!timestamp) return Infinity;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return Infinity;
  return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

function isTaskCompleted(epicCode: string, taskId: string): boolean {
  const epicFile = findEpicFile(epicCode);
  if (!epicFile) {
    return false;
  }

  try {
    const epic = readYaml(epicFile, EpicSchema);
    if (epic.code === taskId) {
      return epic.status === "done";
    }
    const story = epic.stories?.find((s) => s.code === taskId);
    return story?.status === "done";
  } catch (err) {
    process.stderr.write(`[pm gc] isTaskCompleted error for ${epicCode}/${taskId}: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

function extractEpicCode(targetTaskId: string): string | null {
  const match = targetTaskId.match(/^([A-Z]{2,6})-(E\d{3})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

async function gcComments(
  dryRun: boolean,
  gcConfig: GcConfig,
  verbose: boolean,
): Promise<number> {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "comments", "index.yaml");

  if (!fs.existsSync(indexPath)) {
    return 0;
  }

  const index = readYaml(indexPath, CommentIndexSchema);
  const comments = index.comments ?? [];

  const toDelete: string[] = [];
  const ttlDays = gcConfig.ttl_comments_days;

  for (const comment of comments) {
    const age = ageDays(comment.timestamp ?? comment.created_at);

    if (!comment.consolidated) {
      if (verbose) {
        console.log(
          chalk.dim(
            `  [ttl] Comment ${comment.id}: not consolidated, skipping`,
          ),
        );
      }
      continue;
    }

    // TTL check: skip items younger than the threshold
    if (age < ttlDays) {
      if (verbose) {
        console.log(
          chalk.dim(
            `  [ttl] Comment ${comment.id}: age ${age.toFixed(1)}d < TTL ${ttlDays}d, skipping`,
          ),
        );
      }
      continue;
    }

    const epicCode = extractEpicCode(comment.target_task_id);
    if (!epicCode) continue;

    const targetAgentId =
      comment.author.type === "agent" ? comment.author.agent_id : null;
    const consumed = targetAgentId
      ? comment.consumed_by?.includes(targetAgentId)
      : false;
    const taskCompleted = isTaskCompleted(epicCode, comment.target_task_id);

    if (consumed || taskCompleted) {
      if (verbose) {
        const reason = consumed ? "consumed" : "task completed";
        console.log(
          chalk.dim(
            `  [ttl] Comment ${comment.id}: age ${age.toFixed(1)}d >= TTL ${ttlDays}d, ${reason} -> eligible`,
          ),
        );
      }
      toDelete.push(comment.id);
    } else if (verbose) {
      console.log(
        chalk.dim(
          `  [ttl] Comment ${comment.id}: age ${age.toFixed(1)}d >= TTL ${ttlDays}d, but not consumed/completed -> skipping`,
        ),
      );
    }
  }

  if (toDelete.length === 0) {
    return 0;
  }

  if (dryRun) {
    console.log(
      chalk.yellow(`  [dry-run] Would delete ${toDelete.length} comment(s):`) +
        toDelete.map((id) => `\n    - ${id}`).join(""),
    );
  } else {
    const commentsDir = path.join(pmDir, "comments");
    for (const commentId of toDelete) {
      const commentFiles = fs
        .readdirSync(commentsDir)
        .filter((f) => f.startsWith(commentId));
      for (const file of commentFiles) {
        fs.unlinkSync(path.join(commentsDir, file));
      }
    }

    index.comments = index.comments.filter((c) => !toDelete.includes(c.id));
    index.last_updated = new Date().toISOString();

    for (const taskId of Object.keys(index.by_task)) {
      index.by_task[taskId] = index.by_task[taskId]!.filter(
        (entry) => !toDelete.includes(entry.comment_id),
      );
    }

    writeYaml(indexPath, index);
    console.log(chalk.green(`  Deleted ${toDelete.length} comment(s)`));
  }

  return toDelete.length;
}

async function gcReports(
  dryRun: boolean,
  gcConfig: GcConfig,
  verbose: boolean,
): Promise<number> {
  const pmDir = getPmDir();
  const reportsDir = path.join(pmDir, "reports");

  if (!fs.existsSync(reportsDir)) {
    return 0;
  }

  const archiveDir = path.join(reportsDir, "archive");
  const reportFiles = fs
    .readdirSync(reportsDir)
    .filter((f) => f.endsWith("-report.yaml"));

  if (reportFiles.length === 0) {
    return 0;
  }

  const yaml = await import("js-yaml");
  const ttlDays = gcConfig.ttl_reports_days;

  let archived = 0;
  let skipped = 0;
  for (const reportFile of reportFiles) {
    const sourcePath = path.join(reportsDir, reportFile);

    // Read the report to check consolidated and timestamp fields
    let consolidated = false;
    let timestamp: string | undefined;
    try {
      const raw = yaml.load(fs.readFileSync(sourcePath, "utf8")) as {
        consolidated?: boolean;
        timestamp?: string;
      } | null;
      consolidated = raw?.consolidated === true;
      timestamp = raw?.timestamp;
    } catch {
      // If we can't read/parse the report, treat as not consolidated
      consolidated = false;
    }

    if (!consolidated) {
      if (dryRun) {
        console.log(
          chalk.dim(`  [dry-run] Skipping report (not consolidated): ${reportFile}`),
        );
      }
      if (verbose && !dryRun) {
        console.log(
          chalk.dim(
            `  [ttl] Report ${reportFile}: not consolidated, skipping`,
          ),
        );
      }
      skipped++;
      continue;
    }

    // TTL check: skip reports younger than the threshold
    const age = ageDays(timestamp);
    if (age < ttlDays) {
      if (verbose) {
        console.log(
          chalk.dim(
            `  [ttl] Report ${reportFile}: age ${age.toFixed(1)}d < TTL ${ttlDays}d, skipping`,
          ),
        );
      }
      skipped++;
      continue;
    }

    if (verbose) {
      console.log(
        chalk.dim(
          `  [ttl] Report ${reportFile}: age ${age.toFixed(1)}d >= TTL ${ttlDays}d, consolidated -> eligible`,
        ),
      );
    }

    const destPath = path.join(archiveDir, reportFile);

    if (dryRun) {
      console.log(
        chalk.yellow(`  [dry-run] Would archive report (consolidated): ${reportFile}`),
      );
    } else {
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      fs.renameSync(sourcePath, destPath);
    }
    archived++;
  }

  if (!dryRun && archived > 0) {
    console.log(chalk.green(`  Archived ${archived} report(s)`));
  }

  return archived;
}

async function gcAdrs(
  dryRun: boolean,
  gcConfig: GcConfig,
  verbose: boolean,
): Promise<number> {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "ADR-000.yaml");

  if (!fs.existsSync(indexPath)) {
    return 0;
  }

  const yaml = await import("js-yaml");
  const raw = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
    adrs?: Array<{
      id: string;
      status: string;
      created_at?: string;
      updated_at?: string;
      references?: Array<{ type: string; id: string }>;
      superseded_by?: { by_adr_id: string; note?: string };
    }>;
    last_updated?: string;
  };

  const adrs = raw.adrs || [];
  const acceptedAdrs = adrs.filter((a) => a.status === "accepted");
  const toSupersede: string[] = [];
  const ttlDays = gcConfig.ttl_adrs_days;

  for (const adr of acceptedAdrs) {
    // Check references with type "supersedes" (the new ADR declares it supersedes another)
    const supersedes = adr.references
      ?.filter((r) => r.type === "supersedes")
      .map((r) => r.id);

    if (supersedes && supersedes.length > 0) {
      for (const supersededId of supersedes) {
        const supersededAdr = adrs.find((a) => a.id === supersededId);
        if (supersededAdr && supersededAdr.status !== "superseded") {
          // TTL check on the superseded ADR's age
          const age = ageDays(
            supersededAdr.updated_at ?? supersededAdr.created_at,
          );
          if (age < ttlDays) {
            if (verbose) {
              console.log(
                chalk.dim(
                  `  [ttl] ADR ${supersededId}: age ${age.toFixed(1)}d < TTL ${ttlDays}d, skipping supersession`,
                ),
              );
            }
            continue;
          }
          if (verbose) {
            console.log(
              chalk.dim(
                `  [ttl] ADR ${supersededId}: age ${age.toFixed(1)}d >= TTL ${ttlDays}d, superseded by ${adr.id} -> eligible`,
              ),
            );
          }
          toSupersede.push(supersededId);
        }
      }
    }
  }

  // Also detect supersession via the superseded_by field on the target ADR
  for (const adr of adrs) {
    if (
      adr.superseded_by?.by_adr_id &&
      adr.status !== "superseded" &&
      !toSupersede.includes(adr.id)
    ) {
      const age = ageDays(adr.updated_at ?? adr.created_at);
      if (age < ttlDays) {
        if (verbose) {
          console.log(
            chalk.dim(
              `  [ttl] ADR ${adr.id}: age ${age.toFixed(1)}d < TTL ${ttlDays}d, skipping supersession`,
            ),
          );
        }
        continue;
      }
      if (verbose) {
        console.log(
          chalk.dim(
            `  [ttl] ADR ${adr.id}: age ${age.toFixed(1)}d >= TTL ${ttlDays}d, superseded_by ${adr.superseded_by.by_adr_id} -> eligible`,
          ),
        );
      }
      toSupersede.push(adr.id);
    }
  }

  if (toSupersede.length === 0) {
    return 0;
  }

  if (dryRun) {
    console.log(
      chalk.yellow(
        `  [dry-run] Would mark ${toSupersede.length} ADR(s) as superseded:`,
      ) + toSupersede.map((id) => `\n    - ${id}`).join(""),
    );
  } else {
    for (const adr of adrs) {
      if (toSupersede.includes(adr.id)) {
        adr.status = "superseded";
      }
    }

    raw.last_updated = new Date().toISOString();

    const content = yaml.dump(raw, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(indexPath, content, "utf8");

    console.log(
      chalk.green(`  Marked ${toSupersede.length} ADR(s) as superseded`),
    );
  }

  return toSupersede.length;
}

export async function gcRun(options: GcOptions): Promise<void> {
  const dryRun = options.dryRun || options["dry-run"] || false;
  const verbose = options.verbose || false;

  const pmDir = getPmDir();
  const projectCode = getProjectCode() || "PROJECT";
  const gcConfig = loadGcConfig();

  console.log(
    chalk.bold("\nGarbage Collection") +
      (dryRun ? chalk.yellow(" [dry-run]") : ""),
  );
  console.log(chalk.dim("─".repeat(50)));

  if (verbose) {
    console.log(
      chalk.dim(
        `  TTLs: comments=${gcConfig.ttl_comments_days}d, reports=${gcConfig.ttl_reports_days}d, ADRs=${gcConfig.ttl_adrs_days}d`,
      ),
    );
  }

  console.log(chalk.bold(`\n${projectCode}:`));

  const totalComments = await gcComments(dryRun, gcConfig, verbose);
  const totalReports = await gcReports(dryRun, gcConfig, verbose);
  const totalAdrs = await gcAdrs(dryRun, gcConfig, verbose);

  console.log(chalk.dim("\n─".repeat(50)));
  const total = totalComments + totalReports + totalAdrs;
  if (total === 0) {
    console.log(chalk.green("No items to collect."));
  } else {
    console.log(
      chalk.green("✓") +
        ` Collected: ${totalComments} comments, ${totalReports} reports, ${totalAdrs} ADRs`,
    );
  }
}
