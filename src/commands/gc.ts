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
import { ValidationError } from "../lib/errors.js";

interface GcOptions {
  dryRun?: boolean;
  "dry-run"?: boolean;
}

interface GcResult {
  commentsDeleted: number;
  reportsArchived: number;
  adrsSuperseded: number;
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
  } catch {
    return false;
  }
}

function extractEpicCode(targetTaskId: string): string | null {
  const match = targetTaskId.match(/^([A-Z]{2,6})-(E\d{3})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

async function gcComments(dryRun: boolean): Promise<number> {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "comments", "index.yaml");

  if (!fs.existsSync(indexPath)) {
    return 0;
  }

  const index = readYaml(indexPath, CommentIndexSchema);
  const comments = index.comments ?? [];

  const toDelete: string[] = [];

  for (const comment of comments) {
    if (!comment.consolidated) {
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
      toDelete.push(comment.id);
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

async function gcReports(dryRun: boolean): Promise<number> {
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

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  let archived = 0;
  for (const reportFile of reportFiles) {
    const sourcePath = path.join(reportsDir, reportFile);
    const destPath = path.join(archiveDir, reportFile);

    if (dryRun) {
      console.log(
        chalk.yellow(`  [dry-run] Would archive report: ${reportFile}`),
      );
    } else {
      fs.renameSync(sourcePath, destPath);
    }
    archived++;
  }

  if (!dryRun && archived > 0) {
    console.log(chalk.green(`  Archived ${archived} report(s)`));
  }

  return archived;
}

async function gcAdrs(dryRun: boolean): Promise<number> {
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
      references?: Array<{ type: string; adr_id: string }>;
    }>;
    last_updated?: string;
  };

  const adrs = raw.adrs || [];
  const acceptedAdrs = adrs.filter((a) => a.status === "accepted");
  const toSupersede: string[] = [];

  for (const adr of acceptedAdrs) {
    const supersedes = adr.references
      ?.filter((r) => r.type === "supersedes")
      .map((r) => r.adr_id);

    if (supersedes && supersedes.length > 0) {
      for (const supersededId of supersedes) {
        const supersededAdr = adrs.find((a) => a.id === supersededId);
        if (supersededAdr && supersededAdr.status !== "superseded") {
          toSupersede.push(supersededId);
        }
      }
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

  const pmDir = getPmDir();
  const projectCode = getProjectCode() || "PROJECT";

  console.log(
    chalk.bold("\nGarbage Collection") +
      (dryRun ? chalk.yellow(" [dry-run]") : ""),
  );
  console.log(chalk.dim("─".repeat(50)));

  console.log(chalk.bold(`\n${projectCode}:`));

  const totalComments = await gcComments(dryRun);
  const totalReports = await gcReports(dryRun);
  const totalAdrs = await gcAdrs(dryRun);

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
