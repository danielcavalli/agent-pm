import * as path from "node:path";
import * as fs from "node:fs";
import chalk from "chalk";
import { ProjectCodeSchema, ProjectSchema } from "../schemas/index.js";
import { readYaml } from "../lib/fs.js";
import { getProjectsDir, isProjectCodeTaken } from "../lib/codes.js";
import { ProjectNotFoundError, ValidationError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";
import { EpicSchema } from "../schemas/index.js";
import { listFiles } from "../lib/fs.js";

export async function remove(
  projectCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  // Validate code format
  const codeResult = ProjectCodeSchema.safeParse(projectCode);
  if (!codeResult.success) {
    throw new ValidationError(
      `Invalid project code '${projectCode}': ${codeResult.error.issues[0]?.message ?? "invalid format"}`,
    );
  }

  const upperCode = codeResult.data;

  // Check that the project exists
  if (!isProjectCodeTaken(upperCode)) {
    throw new ProjectNotFoundError(upperCode);
  }

  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, upperCode);

  // Read project metadata for confirmation output
  const projectYaml = path.join(projectDir, "project.yaml");
  const project = readYaml(projectYaml, ProjectSchema);

  // Count epics and stories for the summary
  const epicsDir = path.join(projectDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml");
  let storyCount = 0;
  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      storyCount += epic.stories?.length ?? 0;
    } catch {
      // skip unreadable epic files
    }
  }

  // Require --force for safety (destructive operation)
  if (!options["force"]) {
    console.log(
      chalk.yellow("⚠ ") +
        `This will permanently delete project ${chalk.bold(upperCode)} (${project.name})`,
    );
    console.log(
      chalk.dim("  ") +
        `${epicFiles.length} epic(s), ${storyCount} story/stories`,
    );
    console.log(chalk.dim("  ") + `Path: ${projectDir}`);
    console.log(
      chalk.dim("  ") +
        `Re-run with ${chalk.cyan("--force")} to confirm deletion.`,
    );
    return;
  }

  // Delete the project directory
  fs.rmSync(projectDir, { recursive: true, force: true });

  // Rebuild the index (full rebuild — directory is gone, entry will be excluded)
  rebuildIndex();

  console.log(
    chalk.green("✓") +
      ` Removed project ${chalk.bold(upperCode)} (${project.name})`,
  );
  console.log(
    chalk.dim("  ") +
      `Deleted ${epicFiles.length} epic(s), ${storyCount} story/stories`,
  );
}
