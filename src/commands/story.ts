import chalk from "chalk";
import {
  EpicSchema,
  StoryPointsSchema,
  StoryStatusSchema,
  PrioritySchema,
} from "../schemas/index.js";
import type { Story } from "../schemas/index.js";
import { readYaml, writeYaml } from "../lib/fs.js";
import {
  getProjectsDir,
  findEpicFile,
  nextStoryNumber,
  parseStoryCode,
} from "../lib/codes.js";
import {
  EpicNotFoundError,
  StoryNotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";
import * as path from "node:path";

const STATUS_ICON: Record<string, string> = {
  backlog: chalk.dim("○"),
  in_progress: chalk.yellow("●"),
  done: chalk.green("✓"),
  cancelled: chalk.red("✗"),
};

interface StoryAddOptions {
  title: string;
  description?: string;
  points?: string;
  priority?: string;
  criteria?: string[];
  dependsOn?: string[];
}

interface StoryUpdateOptions {
  status?: string;
  priority?: string;
  dependsOn?: string[];
}

export async function storyAdd(
  epicCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as StoryAddOptions;

  // Find epic file
  const epicFile = findEpicFile(epicCode);
  if (!epicFile) {
    throw new EpicNotFoundError(epicCode);
  }

  // Validate points
  const pointsRaw = opts.points ? parseInt(opts.points, 10) : 3;
  const pointsResult = StoryPointsSchema.safeParse(pointsRaw);
  if (!pointsResult.success) {
    throw new ValidationError(
      `Invalid story points '${opts.points}': must be one of 1 | 2 | 3 | 5 | 8`,
    );
  }

  // Validate priority
  const priorityInput = opts.priority ?? "medium";
  const priorityResult = PrioritySchema.safeParse(priorityInput);
  if (!priorityResult.success) {
    throw new ValidationError(
      `Invalid priority '${priorityInput}': must be one of high | medium | low`,
    );
  }

  // Read existing epic
  const epic = readYaml(epicFile, EpicSchema);
  const storyId = nextStoryNumber(epicFile);
  const storyCode = `${epicCode}-${storyId}`;

  const story: Story = {
    id: storyId,
    code: storyCode,
    title: opts.title,
    description: opts.description ?? "",
    acceptance_criteria: Array.isArray(opts.criteria) ? opts.criteria : [],
    status: "backlog",
    priority: priorityResult.data,
    story_points: pointsResult.data,
    depends_on: Array.isArray(opts.dependsOn) ? opts.dependsOn : [],
    notes: "",
  };

  const updatedEpic = {
    ...epic,
    stories: [...(epic.stories ?? []), story],
  };

  writeYaml(epicFile, updatedEpic);

  // Get project code from epic code for index rebuild
  const parts = epicCode.split("-");
  if (parts[0]) rebuildIndex(parts[0]);

  console.log(chalk.green("✓") + " Story created: " + chalk.bold(storyCode));
  console.log(chalk.dim("  Title: ") + opts.title);
  console.log(
    chalk.dim("  Points: ") +
      pointsResult.data +
      chalk.dim(" | Priority: ") +
      priorityResult.data,
  );
}

export async function storyList(
  epicCode: string,
  options?: Record<string, unknown>,
): Promise<void> {
  const showDeps = !!options?.deps;

  const epicFile = findEpicFile(epicCode);
  if (!epicFile) {
    throw new EpicNotFoundError(epicCode);
  }

  const epic = readYaml(epicFile, EpicSchema);
  const stories = epic.stories ?? [];

  if (stories.length === 0) {
    console.log(
      chalk.dim("No stories found") + " in epic " + chalk.bold(epicCode),
    );
    return;
  }

  const depsHeader = showDeps ? " " + chalk.bold("Depends On") : "";
  const header =
    [
      chalk.bold("Code".padEnd(18)),
      chalk.bold("Title".padEnd(38)),
      chalk.bold("Status".padEnd(12)),
      chalk.bold("Priority".padEnd(10)),
      chalk.bold("Pts"),
    ].join(" ") + depsHeader;

  const lineWidth = showDeps ? 110 : 84;
  console.log(chalk.dim("─".repeat(lineWidth)));
  console.log(header);
  console.log(chalk.dim("─".repeat(lineWidth)));

  for (const story of stories) {
    const icon = STATUS_ICON[story.status] ?? "?";
    const deps =
      showDeps && story.depends_on && story.depends_on.length > 0
        ? " " + chalk.dim(story.depends_on.join(", "))
        : "";
    const row =
      [
        (icon + " " + story.code).padEnd(20),
        story.title.slice(0, 37).padEnd(38),
        story.status.padEnd(12),
        story.priority.padEnd(10),
        String(story.story_points),
      ].join(" ") + deps;
    console.log(row);
  }
  console.log(chalk.dim("─".repeat(lineWidth)));
}

export async function storyUpdate(
  storyCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as StoryUpdateOptions;

  if (!opts.status && !opts.priority && !opts.dependsOn) {
    throw new ValidationError(
      "At least one of --status, --priority, or --depends-on must be provided",
    );
  }

  // Parse story code to find epic
  const parsed = parseStoryCode(storyCode);
  if (!parsed) {
    throw new ValidationError(
      `Invalid story code '${storyCode}': expected format PROJECT-E###-S### (e.g. PM-E001-S001)`,
    );
  }

  const epicFile = findEpicFile(parsed.epicCode);
  if (!epicFile) {
    throw new EpicNotFoundError(parsed.epicCode);
  }

  // Validate status if provided
  if (opts.status) {
    const statusResult = StoryStatusSchema.safeParse(opts.status);
    if (!statusResult.success) {
      throw new ValidationError(
        `Invalid status '${opts.status}': must be one of backlog | in_progress | done | cancelled`,
      );
    }
  }

  // Validate priority if provided
  if (opts.priority) {
    const priorityResult = PrioritySchema.safeParse(opts.priority);
    if (!priorityResult.success) {
      throw new ValidationError(
        `Invalid priority '${opts.priority}': must be one of high | medium | low`,
      );
    }
  }

  // Read and update epic
  const epic = readYaml(epicFile, EpicSchema);
  const stories = epic.stories ?? [];
  const storyIdx = stories.findIndex((s) => s.code === storyCode);

  if (storyIdx === -1) {
    throw new StoryNotFoundError(storyCode);
  }

  const existingStory = stories[storyIdx];
  if (!existingStory) {
    throw new StoryNotFoundError(storyCode);
  }

  const updatedStory: Story = {
    ...existingStory,
    ...(opts.status ? { status: StoryStatusSchema.parse(opts.status) } : {}),
    ...(opts.priority ? { priority: PrioritySchema.parse(opts.priority) } : {}),
    ...(opts.dependsOn ? { depends_on: opts.dependsOn } : {}),
  };

  const updatedStories = [...stories];
  updatedStories[storyIdx] = updatedStory;

  writeYaml(epicFile, { ...epic, stories: updatedStories });
  rebuildIndex(parsed.projectCode);

  const changes: string[] = [];
  if (opts.status) changes.push(`status → ${opts.status}`);
  if (opts.priority) changes.push(`priority → ${opts.priority}`);
  if (opts.dependsOn)
    changes.push(`depends_on → [${opts.dependsOn.join(", ")}]`);

  console.log(
    chalk.green("✓") +
      " Updated " +
      chalk.bold(storyCode) +
      ": " +
      changes.join(", "),
  );
}
