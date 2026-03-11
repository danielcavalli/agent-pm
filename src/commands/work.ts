import chalk from "chalk";
import { EpicSchema, ProjectSchema } from "../schemas/index.js";
import { readYaml, writeYaml } from "../lib/fs.js";
import { resolveStoryCode, findEpicFile, getPmDir } from "../lib/codes.js";
import { StoryNotFoundError } from "../lib/errors.js";
import * as path from "node:path";

export async function work(storyCode: string): Promise<void> {
  const parsed = resolveStoryCode(storyCode);

  const epicFile = findEpicFile(parsed.epicCode);
  if (!epicFile) {
    throw new StoryNotFoundError(
      `${parsed.projectCode}-${parsed.epicId}-${parsed.storyId}`,
    );
  }

  const epic = readYaml(epicFile, EpicSchema);
  const stories = epic.stories ?? [];
  const fullStoryCode = `${parsed.projectCode}-${parsed.epicId}-${parsed.storyId}`;
  const storyIdx = stories.findIndex((s) => s.code === fullStoryCode);

  if (storyIdx === -1) {
    throw new StoryNotFoundError(fullStoryCode);
  }

  const story = stories[storyIdx];
  if (!story) {
    throw new StoryNotFoundError(fullStoryCode);
  }

  if (story.status === "done") {
    console.log(
      chalk.yellow(`⚠  Warning: story ${fullStoryCode} is already done.`),
    );
    console.log(
      chalk.dim("  No changes made. Use pm story update to change status."),
    );
    return;
  }

  if (story.status === "in_progress") {
    console.log(
      chalk.yellow(
        `⚠  Warning: story ${fullStoryCode} is already in_progress.`,
      ),
    );
  }

  if (story.status !== "in_progress") {
    const updatedStories = [...stories];
    updatedStories[storyIdx] = { ...story, status: "in_progress" };
    writeYaml(epicFile, { ...epic, stories: updatedStories });
  }

  const projectYaml = path.join(getPmDir(), "project.yaml");
  let projectName = parsed.projectCode;
  try {
    const project = readYaml(projectYaml, ProjectSchema);
    projectName = project.name;
  } catch {}

  console.log("");
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log(chalk.cyan.bold("  STORY CONTEXT"));
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log("");
  console.log(chalk.bold("  Code:    ") + chalk.cyan(fullStoryCode));
  console.log(chalk.bold("  Title:   ") + story.title);
  console.log(
    chalk.bold("  Epic:    ") + epic.code + chalk.dim(" — ") + epic.title,
  );
  console.log(
    chalk.bold("  Project: ") +
      parsed.projectCode +
      chalk.dim(" — ") +
      projectName,
  );
  console.log(
    chalk.bold("  Status:  ") +
      chalk.yellow("in_progress") +
      chalk.dim("  Points: ") +
      story.story_points +
      chalk.dim("  Priority: ") +
      story.priority,
  );
  console.log("");

  if (story.description && story.description.trim()) {
    console.log(chalk.bold("  Description:"));
    const lines = story.description.trim().split("\n");
    for (const line of lines) {
      console.log("    " + line);
    }
    console.log("");
  }

  if (story.acceptance_criteria && story.acceptance_criteria.length > 0) {
    console.log(chalk.bold("  Acceptance Criteria:"));
    story.acceptance_criteria.forEach((criterion, i) => {
      console.log(`    ${chalk.dim(`${i + 1}.`)} ${criterion}`);
    });
    console.log("");
  }

  if (story.notes && story.notes.trim()) {
    console.log(chalk.bold("  Notes:"));
    console.log("    " + story.notes.trim());
    console.log("");
  }

  if (story.depends_on && story.depends_on.length > 0) {
    console.log(chalk.bold("  Depends On:"));
    story.depends_on.forEach((dep) => {
      console.log(`    ${chalk.dim("→")} ${dep}`);
    });
    console.log("");
  }

  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log(
    chalk.dim("  When done, run: ") +
      chalk.cyan(`pm story update ${fullStoryCode} --status done`),
  );
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log("");
}
