import * as path from "node:path";
import * as fs from "node:fs";
import chalk from "chalk";
import { ProjectSchema } from "../schemas/index.js";
import { readYaml, listFiles } from "../lib/fs.js";
import { getPmDir, getProjectCode } from "../lib/codes.js";
import { ProjectNotFoundError, PmError } from "../lib/errors.js";
import { EpicSchema } from "../schemas/index.js";

export async function remove(
  projectCode: string | undefined,
  options: Record<string, unknown>,
): Promise<void> {
  const actualProjectCode = getProjectCode();
  if (!actualProjectCode) {
    throw new PmError(
      "PROJECT_CODE_NOT_FOUND",
      "Cannot determine project code. Run 'pm init' first or specify project code explicitly.",
    );
  }

  const upperCode = actualProjectCode;

  const pmDir = getPmDir();
  const projectYaml = path.join(pmDir, "project.yaml");

  if (!fs.existsSync(projectYaml)) {
    throw new ProjectNotFoundError(upperCode);
  }

  const project = readYaml(projectYaml, ProjectSchema);

  const epicsDir = path.join(pmDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml");
  let storyCount = 0;
  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      storyCount += epic.stories?.length ?? 0;
    } catch {}
  }

  if (!options["force"]) {
    console.log(
      chalk.yellow("⚠ ") +
        `This will permanently delete project ${chalk.bold(upperCode)} (${project.name})`,
    );
    console.log(
      chalk.dim("  ") +
        `${epicFiles.length} epic(s), ${storyCount} story/stories`,
    );
    console.log(chalk.dim("  ") + `Path: ${pmDir}`);
    console.log(
      chalk.dim("  ") +
        `Re-run with ${chalk.cyan("--force")} to confirm deletion.`,
    );
    return;
  }

  const subdirs = ["epics", "comments", "adrs", "reports"];
  for (const subdir of subdirs) {
    const subdirPath = path.join(pmDir, subdir);
    if (fs.existsSync(subdirPath)) {
      fs.rmSync(subdirPath, { recursive: true, force: true });
    }
  }

  const filesToRemove = ["project.yaml", "index.yaml", "ADR-000.yaml"];
  for (const file of filesToRemove) {
    const filePath = path.join(pmDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  fs.rmdirSync(pmDir);

  console.log(
    chalk.green("✓") +
      ` Removed project ${chalk.bold(upperCode)} (${project.name})`,
  );
  console.log(
    chalk.dim("  ") +
      `Deleted ${epicFiles.length} epic(s), ${storyCount} story/stories`,
  );
  console.log(chalk.dim("  ") + `Removed ${pmDir}`);
}
