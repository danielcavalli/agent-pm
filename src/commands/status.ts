import * as path from "node:path";
import * as fs from "node:fs";
import chalk from "chalk";
import { ProjectSchema, EpicSchema } from "../schemas/index.js";
import { readYaml, listFiles } from "../lib/fs.js";
import { getProjectsDir, listProjectCodes } from "../lib/codes.js";
import { ProjectNotFoundError } from "../lib/errors.js";

interface StatusOptions {
  json?: boolean;
}

type StoryData = {
  code: string;
  title: string;
  status: string;
  priority: string;
  story_points: number;
  description: string;
  acceptance_criteria: string[];
  notes: string;
};

type EpicData = {
  code: string;
  title: string;
  status: string;
  priority: string;
  description: string;
  stories: StoryData[];
};

const STATUS_ICON: Record<string, string> = {
  backlog: chalk.dim("○"),
  in_progress: chalk.yellow("●"),
  done: chalk.green("✓"),
  cancelled: chalk.red("✗"),
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function progressBar(done: number, total: number, width = 16): string {
  if (total === 0) return chalk.dim("[" + "─".repeat(width) + "]");
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  return (
    chalk.dim("[") +
    chalk.green("█".repeat(filled)) +
    chalk.dim("░".repeat(empty)) +
    chalk.dim("]") +
    chalk.dim(` ${done}/${total}`)
  );
}

/**
 * Derive what an epic's status should be based on its stories.
 * - No stories: keep the YAML status as-is (needs refinement).
 * - All stories done/cancelled: "done".
 * - Any story in_progress: "in_progress".
 * - Otherwise (has backlog stories): "backlog".
 */
function deriveEpicStatus(yamlStatus: string, stories: StoryData[]): string {
  if (stories.length === 0) return yamlStatus;

  const allFinished = stories.every(
    (s) => s.status === "done" || s.status === "cancelled",
  );
  if (allFinished) return "done";

  const anyInProgress = stories.some((s) => s.status === "in_progress");
  if (anyInProgress) return "in_progress";

  return "backlog";
}

/**
 * Load all epic data for a project directory.
 * Returns the list of parsed epics (never filters any out).
 * Epic status is auto-derived from story statuses for display purposes.
 * When warnOnError is true, YAML parse failures are logged to stderr.
 */
function loadProjectEpics(projectDir: string, warnOnError = false): EpicData[] {
  const epicsDir = path.join(projectDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml").sort();
  const epicsData: EpicData[] = [];

  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      const stories = epic.stories ?? [];
      const mappedStories = stories.map((s) => ({
        code: s.code,
        title: s.title,
        status: s.status,
        priority: s.priority,
        story_points: s.story_points,
        description: s.description ?? "",
        acceptance_criteria: s.acceptance_criteria ?? [],
        notes: s.notes ?? "",
      }));
      epicsData.push({
        code: epic.code,
        title: epic.title,
        status: deriveEpicStatus(epic.status, mappedStories),
        priority: epic.priority,
        description: epic.description ?? "",
        stories: mappedStories,
      });
    } catch (err) {
      if (warnOnError) {
        const reason = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          chalk.yellow("  warning: ") +
            `Failed to parse ${epicFile}: ${reason}\n`,
        );
      }
    }
  }

  return epicsData;
}

/**
 * Find the next recommended backlog story across a list of epics.
 */
function findNextRecommended(
  epicsData: EpicData[],
): { code: string; title: string } | null {
  let nextRecommended: { code: string; title: string } | null = null;
  let highestPriority = 2;

  for (const epic of epicsData) {
    for (const story of epic.stories) {
      if (story.status === "backlog") {
        const rank = PRIORITY_RANK[story.priority] ?? 2;
        if (rank < highestPriority || nextRecommended === null) {
          highestPriority = rank;
          nextRecommended = { code: story.code, title: story.title };
        }
      }
    }
  }

  return nextRecommended;
}

/**
 * Count done stories across all epics.
 * Cancelled stories are excluded from the total so the progress bar
 * accurately reflects remaining actionable work.
 */
function countStories(epicsData: EpicData[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const epic of epicsData) {
    const active = epic.stories.filter((s) => s.status !== "cancelled");
    total += active.length;
    done += active.filter((s) => s.status === "done").length;
  }
  return { total, done };
}

export async function status(
  projectCode: string | undefined,
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as StatusOptions;
  const projectsDir = getProjectsDir();

  if (projectCode) {
    await statusSingleProject(projectCode, projectsDir, opts);
  } else {
    await statusAllProjects(projectsDir, opts);
  }
}

// ── Single project detailed view ─────────────────────────────────────

async function statusSingleProject(
  projectCode: string,
  projectsDir: string,
  opts: StatusOptions,
): Promise<void> {
  const projectDir = path.join(projectsDir, projectCode);
  if (!fs.existsSync(projectDir)) {
    throw new ProjectNotFoundError(projectCode);
  }

  const projectYaml = path.join(projectDir, "project.yaml");
  const project = readYaml(projectYaml, ProjectSchema);
  const epicsData = loadProjectEpics(projectDir, !opts.json);
  const { total: totalStories, done: totalDone } = countStories(epicsData);
  const nextRecommended = findNextRecommended(epicsData);

  if (opts.json) {
    const output = {
      project: {
        code: project.code,
        name: project.name,
        description: project.description,
        vision: project.vision,
        status: project.status,
        created_at: project.created_at,
        tech_stack: project.tech_stack,
        architecture: project.architecture,
        notes: project.notes,
      },
      summary: {
        epic_count: epicsData.length,
        story_count: totalStories,
        stories_done: totalDone,
      },
      next_recommended: nextRecommended,
      epics: epicsData,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ── Human-readable output ──

  const statusColor = project.status === "active" ? chalk.green : chalk.dim;
  console.log("");
  console.log(
    chalk.bold.cyan("  " + project.code) +
      chalk.dim(" — ") +
      chalk.bold(project.name),
  );
  console.log(
    chalk.dim("  Status: ") +
      statusColor(project.status) +
      chalk.dim("  ·  Progress: ") +
      progressBar(totalDone, totalStories),
  );
  if (project.tech_stack && project.tech_stack.length > 0) {
    console.log(chalk.dim("  Stack: ") + project.tech_stack.join(", "));
  }
  console.log("");

  // Partition epics into active vs completed/closed.
  // An epic is "active" if it has backlog or in_progress stories,
  // OR it has no stories yet (still needs refinement).
  // An epic is "completed" if all stories are done/cancelled, or if
  // the epic itself is marked done/cancelled and has no remaining work.
  const activeEpics: EpicData[] = [];
  const completedEpics: EpicData[] = [];

  for (const epic of epicsData) {
    const hasUnfinished = epic.stories.some(
      (s) => s.status === "backlog" || s.status === "in_progress",
    );
    const hasNoStories = epic.stories.length === 0;
    const epicExplicitlyDone =
      epic.status === "done" || epic.status === "cancelled";

    if (hasUnfinished || (hasNoStories && !epicExplicitlyDone)) {
      activeEpics.push(epic);
    } else {
      completedEpics.push(epic);
    }
  }

  // Active epics: full detail with stories
  if (activeEpics.length > 0) {
    console.log(chalk.bold("  Active Epics"));
    console.log("");

    for (const epic of activeEpics) {
      const epicIcon = STATUS_ICON[epic.status] ?? "?";
      const activeStories = epic.stories.filter(
        (s) => s.status !== "cancelled",
      );
      const epicDone = activeStories.filter((s) => s.status === "done").length;
      console.log(
        `  ${epicIcon} ${chalk.bold(epic.code)} ${epic.title.padEnd(40)} ${progressBar(epicDone, activeStories.length)}`,
      );

      for (const story of epic.stories) {
        const icon = STATUS_ICON[story.status] ?? "?";
        const inProg =
          story.status === "in_progress" ? chalk.yellow(" ← in_progress") : "";
        console.log(
          `       ${icon} ${chalk.dim(story.code)} ${story.title.slice(0, 50)}${inProg}`,
        );
      }
      console.log("");
    }
  }

  // Completed/empty epics: compact listing
  if (completedEpics.length > 0) {
    console.log(chalk.bold("  Completed / Closed Epics"));
    console.log("");

    for (const epic of completedEpics) {
      const epicIcon = STATUS_ICON[epic.status] ?? "?";
      const activeStories = epic.stories.filter(
        (s) => s.status !== "cancelled",
      );
      const storyCount = activeStories.length;
      const doneCount = activeStories.filter((s) => s.status === "done").length;
      const suffix =
        storyCount === 0
          ? chalk.dim("(no stories)")
          : chalk.dim(`(${doneCount}/${storyCount} stories)`);
      console.log(
        `  ${epicIcon} ${chalk.bold(epic.code)} ${epic.title.slice(0, 45).padEnd(45)} ${suffix}`,
      );
    }
    console.log("");
  }

  if (nextRecommended) {
    console.log(
      chalk.dim("  Next: ") +
        chalk.cyan(nextRecommended.code) +
        chalk.dim(" — ") +
        nextRecommended.title,
    );
    console.log("");
  }
}

// ── All projects summary view ────────────────────────────────────────

async function statusAllProjects(
  projectsDir: string,
  opts: StatusOptions,
): Promise<void> {
  const codes = listProjectCodes();

  if (codes.length === 0) {
    console.log(chalk.dim("No projects found in ") + projectsDir);
    return;
  }

  // Always load live data from YAML files (not the index cache)
  // so the output is always accurate and includes epic details.
  type ProjectSummary = {
    code: string;
    name: string;
    status: string;
    epics: EpicData[];
    totalStories: number;
    totalDone: number;
  };

  const projects: ProjectSummary[] = [];

  for (const code of codes) {
    const projectDir = path.join(projectsDir, code);
    const projectYaml = path.join(projectDir, "project.yaml");
    if (!fs.existsSync(projectYaml)) continue;

    try {
      const project = readYaml(projectYaml, ProjectSchema);
      const epicsData = loadProjectEpics(projectDir, !opts.json);
      const { total, done } = countStories(epicsData);

      projects.push({
        code: project.code,
        name: project.name,
        status: project.status,
        epics: epicsData,
        totalStories: total,
        totalDone: done,
      });
    } catch {
      // skip unreadable projects
    }
  }

  if (opts.json) {
    const output = {
      projects: projects.map((p) => ({
        code: p.code,
        name: p.name,
        status: p.status,
        summary: {
          epic_count: p.epics.length,
          story_count: p.totalStories,
          stories_done: p.totalDone,
        },
        next_recommended: findNextRecommended(p.epics),
        epics: p.epics,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ── Human-readable: project headers with epic breakdowns ──

  for (const proj of projects) {
    const statusColor = proj.status === "active" ? chalk.green : chalk.dim;
    console.log("");
    console.log(
      chalk.bold.cyan("  " + proj.code) +
        chalk.dim(" — ") +
        chalk.bold(proj.name) +
        chalk.dim("  [") +
        statusColor(proj.status) +
        chalk.dim("]  ") +
        progressBar(proj.totalDone, proj.totalStories),
    );
    console.log("");

    if (proj.epics.length === 0) {
      console.log(chalk.dim("    No epics yet"));
    } else {
      for (const epic of proj.epics) {
        const epicIcon = STATUS_ICON[epic.status] ?? "?";
        const activeStories = epic.stories.filter(
          (s) => s.status !== "cancelled",
        );
        const epicDone = activeStories.filter(
          (s) => s.status === "done",
        ).length;
        const storyCount = activeStories.length;
        const storyLabel =
          storyCount === 0
            ? chalk.dim("(no stories)")
            : chalk.dim(`(${epicDone}/${storyCount})`);
        console.log(
          `    ${epicIcon} ${chalk.bold(epic.code)}  ${epic.title.slice(0, 45).padEnd(45)} ${storyLabel}`,
        );
      }
    }

    console.log("");
  }
  console.log(chalk.dim("─".repeat(84)));
  console.log("");
}
