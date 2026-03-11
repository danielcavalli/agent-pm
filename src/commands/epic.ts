import * as path from "node:path";
import * as fs from "node:fs";
import chalk from "chalk";
import { EpicSchema, PrioritySchema } from "../schemas/index.js";
import type { Epic, Priority } from "../schemas/index.js";
import { readYaml, writeYaml, listFiles } from "../lib/fs.js";
import { getProjectsDir, nextEpicNumber, toKebabSlug } from "../lib/codes.js";
import { ProjectNotFoundError, ValidationError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";

interface EpicAddOptions {
  title: string;
  description?: string;
  priority?: string;
}

const STATUS_ICON: Record<string, string> = {
  backlog: chalk.dim("○"),
  in_progress: chalk.yellow("●"),
  done: chalk.green("✓"),
  cancelled: chalk.red("✗"),
};

export async function epicAdd(
  projectCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as EpicAddOptions;

  // Validate project exists
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, projectCode);
  if (!fs.existsSync(projectDir)) {
    throw new ProjectNotFoundError(projectCode);
  }

  // Validate priority
  const priorityInput = opts.priority ?? "medium";
  const priorityResult = PrioritySchema.safeParse(priorityInput);
  if (!priorityResult.success) {
    throw new ValidationError(
      `Invalid priority '${priorityInput}': must be one of high | medium | low`,
    );
  }

  const epicId = nextEpicNumber(projectCode);
  const epicNum = epicId; // e.g. "E007"
  const epicCode = `${projectCode}-${epicId}`;
  const slug = toKebabSlug(opts.title);
  const filename = `${epicNum}-${slug}.yaml`;
  const epicPath = path.join(projectDir, "epics", filename);
  const today = new Date().toISOString().slice(0, 10);

  const epic: Epic = {
    id: epicId,
    code: epicCode,
    title: opts.title,
    description: opts.description ?? "",
    status: "backlog",
    priority: priorityResult.data,
    created_at: today,
    stories: [],
  };

  writeYaml(epicPath, epic);
  rebuildIndex(projectCode);

  console.log(chalk.green("✓") + " Epic created: " + chalk.bold(epicCode));
  console.log(chalk.dim("  File: ") + epicPath);
  console.log(chalk.dim("  Title: ") + opts.title);
  console.log(chalk.dim("  Priority: ") + priorityResult.data);
}

export async function epicSync(projectCode: string): Promise<void> {
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, projectCode);
  if (!fs.existsSync(projectDir)) {
    throw new ProjectNotFoundError(projectCode);
  }

  const epicsDir = path.join(projectDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml").sort();
  let updated = 0;

  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      const stories = epic.stories ?? [];

      if (stories.length === 0) continue;

      let derivedStatus: string;
      const allFinished = stories.every(
        (s) => s.status === "done" || s.status === "cancelled",
      );
      if (allFinished) {
        derivedStatus = "done";
      } else if (stories.some((s) => s.status === "in_progress")) {
        derivedStatus = "in_progress";
      } else {
        derivedStatus = "backlog";
      }

      if (epic.status !== derivedStatus) {
        console.log(
          `  ${chalk.bold(epic.code)} ${epic.status} ${chalk.dim("→")} ${derivedStatus}`,
        );
        epic.status = derivedStatus as Epic["status"];
        writeYaml(epicFile, epic);
        updated++;
      }
    } catch {
      // skip unreadable files
    }
  }

  rebuildIndex(projectCode);

  if (updated === 0) {
    console.log(chalk.dim("All epic statuses are already consistent."));
  } else {
    console.log(
      chalk.green(`\n✓ Updated ${updated} epic(s) in ${projectCode}`),
    );
  }
}

export async function epicList(projectCode: string): Promise<void> {
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, projectCode);
  if (!fs.existsSync(projectDir)) {
    throw new ProjectNotFoundError(projectCode);
  }

  const epicsDir = path.join(projectDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml").sort();

  if (epicFiles.length === 0) {
    console.log(
      chalk.dim("No epics found") + " for project " + chalk.bold(projectCode),
    );
    return;
  }

  const epics: Epic[] = [];
  for (const f of epicFiles) {
    try {
      epics.push(readYaml(f, EpicSchema));
    } catch {
      // skip unreadable files
    }
  }

  // Header
  const header = [
    chalk.bold("Code".padEnd(14)),
    chalk.bold("Title".padEnd(36)),
    chalk.bold("Status".padEnd(12)),
    chalk.bold("Priority".padEnd(10)),
    chalk.bold("Stories"),
  ].join(" ");
  console.log(chalk.dim("─".repeat(80)));
  console.log(header);
  console.log(chalk.dim("─".repeat(80)));

  for (const epic of epics) {
    const icon = STATUS_ICON[epic.status] ?? "?";
    const storyCount = epic.stories?.length ?? 0;
    const doneCnt =
      epic.stories?.filter((s) => s.status === "done").length ?? 0;
    const row = [
      (icon + " " + epic.code).padEnd(16),
      epic.title.slice(0, 35).padEnd(36),
      epic.status.padEnd(12),
      epic.priority.padEnd(10),
      `${doneCnt}/${storyCount}`,
    ].join(" ");
    console.log(row);
  }
  console.log(chalk.dim("─".repeat(80)));
}
