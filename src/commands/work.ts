import chalk from "chalk";
import { EpicSchema, ProjectSchema } from "../schemas/index.js";
import { readYaml, writeYaml } from "../lib/fs.js";
import { parseStoryCode, findEpicFile, getProjectsDir } from "../lib/codes.js";
import { StoryNotFoundError, ValidationError } from "../lib/errors.js";
import * as path from "node:path";

export async function work(storyCode: string): Promise<void> {
  // Parse the story code
  const parsed = parseStoryCode(storyCode);
  if (!parsed) {
    throw new ValidationError(
      `Invalid story code '${storyCode}': expected format PROJECT-E###-S### (e.g. PM-E001-S001)`,
    );
  }

  // Find the epic file
  const epicFile = findEpicFile(parsed.epicCode);
  if (!epicFile) {
    throw new StoryNotFoundError(storyCode);
  }

  // Read epic
  const epic = readYaml(epicFile, EpicSchema);
  const stories = epic.stories ?? [];
  const storyIdx = stories.findIndex((s) => s.code === storyCode);

  if (storyIdx === -1) {
    throw new StoryNotFoundError(storyCode);
  }

  const story = stories[storyIdx];
  if (!story) {
    throw new StoryNotFoundError(storyCode);
  }

  // Handle already-done stories
  if (story.status === "done") {
    console.log(
      chalk.yellow(`⚠  Warning: story ${storyCode} is already done.`),
    );
    console.log(
      chalk.dim("  No changes made. Use pm story update to change status."),
    );
    return;
  }

  // Print warning if already in_progress, but continue
  if (story.status === "in_progress") {
    console.log(
      chalk.yellow(`⚠  Warning: story ${storyCode} is already in_progress.`),
    );
  }

  // Mark as in_progress if not already
  if (story.status !== "in_progress") {
    const updatedStories = [...stories];
    updatedStories[storyIdx] = { ...story, status: "in_progress" };
    writeYaml(epicFile, { ...epic, stories: updatedStories });
  }

  // Try to read parent project for context
  const projectYaml = path.join(
    getProjectsDir(),
    parsed.projectCode,
    "project.yaml",
  );
  let projectName = parsed.projectCode;
  try {
    const project = readYaml(projectYaml, ProjectSchema);
    projectName = project.name;
  } catch {
    // non-fatal, project context is optional
  }

  // Print structured summary
  console.log("");
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log(chalk.cyan.bold("  STORY CONTEXT"));
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log("");
  console.log(chalk.bold("  Code:    ") + chalk.cyan(storyCode));
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
      chalk.cyan(`pm story update ${storyCode} --status done`),
  );
  console.log(chalk.cyan.bold("━".repeat(72)));
  console.log("");
}
