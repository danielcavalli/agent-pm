import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { getProjectsDir } from "../lib/codes.js";
import { PmError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";

interface MigrateOptions {
  source?: string;
}

/**
 * Copy a file from src to dest, creating parent directories as needed.
 */
function copyFile(src: string, dest: string): void {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Migrate project directories from a source location to PM_HOME/projects/.
 * Recursively copies project.yaml and epics/*.yaml files.
 */
export async function migrate(options: Record<string, unknown>): Promise<void> {
  const opts = options as unknown as MigrateOptions;
  const source = path.resolve(opts.source ?? "./projects");
  const dest = getProjectsDir();

  // Validate source exists
  if (!fs.existsSync(source)) {
    throw new PmError(
      "SOURCE_NOT_FOUND",
      `Source directory not found: ${source}`,
    );
  }

  if (!fs.statSync(source).isDirectory()) {
    throw new PmError(
      "SOURCE_NOT_DIRECTORY",
      `Source is not a directory: ${source}`,
    );
  }

  // If source and dest are the same, nothing to do
  const resolvedSource = fs.realpathSync(source);
  const resolvedDest = fs.existsSync(dest)
    ? fs.realpathSync(dest)
    : path.resolve(dest);
  if (resolvedSource === resolvedDest) {
    throw new PmError(
      "SAME_DIRECTORY",
      `Source and destination are the same directory: ${resolvedSource}`,
    );
  }

  // Enumerate project directories in source
  const entries = fs.readdirSync(source).filter((name) => {
    if (name === "index.yaml") return false;
    const full = path.join(source, name);
    return fs.statSync(full).isDirectory();
  });

  if (entries.length === 0) {
    console.log(chalk.yellow("No projects found in source: ") + source);
    return;
  }

  const migrated: string[] = [];
  const skipped: string[] = [];

  for (const projectCode of entries) {
    const srcProjectDir = path.join(source, projectCode);
    const destProjectDir = path.join(dest, projectCode);

    // Skip projects that already exist in the target directory
    if (fs.existsSync(destProjectDir)) {
      skipped.push(projectCode);
      continue;
    }

    // Copy project.yaml if it exists
    const srcProjectYaml = path.join(srcProjectDir, "project.yaml");
    if (fs.existsSync(srcProjectYaml)) {
      copyFile(srcProjectYaml, path.join(destProjectDir, "project.yaml"));
    }

    // Copy epics/*.yaml if the epics directory exists
    const srcEpicsDir = path.join(srcProjectDir, "epics");
    if (fs.existsSync(srcEpicsDir) && fs.statSync(srcEpicsDir).isDirectory()) {
      const epicFiles = fs
        .readdirSync(srcEpicsDir)
        .filter((f) => f.endsWith(".yaml"));
      for (const epicFile of epicFiles) {
        copyFile(
          path.join(srcEpicsDir, epicFile),
          path.join(destProjectDir, "epics", epicFile),
        );
      }
    }

    migrated.push(projectCode);
  }

  // Rebuild index after migration
  rebuildIndex();

  // Print warnings for skipped projects
  if (skipped.length > 0) {
    console.log(
      chalk.yellow("⚠") +
        ` Skipped ${chalk.bold(String(skipped.length))} project(s) (already exist in target):`,
    );
    for (const code of skipped) {
      console.log(chalk.yellow("  • ") + chalk.bold(code));
    }
  }

  // Print summary of migrated projects
  if (migrated.length > 0) {
    console.log(
      chalk.green("✓") +
        ` Migrated ${chalk.bold(String(migrated.length))} project(s) from ${chalk.dim(source)} to ${chalk.dim(dest)}`,
    );
    for (const code of migrated) {
      console.log(chalk.dim("  • ") + chalk.bold(code));
    }
  } else if (skipped.length > 0) {
    console.log(
      chalk.dim("No new projects to migrate — all already exist in target."),
    );
  }
}
