import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import { getPmDir } from "../lib/codes.js";
import { PmError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";
import { readYaml, listFiles } from "../lib/fs.js";
import { ProjectSchema, EpicSchema } from "../schemas/index.js";

interface MigrateOptions {
  source?: string;
}

interface ToLocalOptions {
  code: string;
  target: string;
  cleanup?: boolean;
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
 * Migrate project data from a source location to .pm/.
 * In single-project mode, this copies project.yaml, epics/, comments/, adrs/ to .pm/.
 */
export async function migrate(options: Record<string, unknown>): Promise<void> {
  const opts = options as unknown as MigrateOptions;
  const source = path.resolve(opts.source ?? "./projects");
  const dest = getPmDir();

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

  // Check if .pm already has a project.yaml
  const destProjectYaml = path.join(dest, "project.yaml");
  if (fs.existsSync(destProjectYaml)) {
    console.log(
      chalk.yellow("⚠") +
        ` Destination already has a project.yaml. Migration skipped.`,
    );
    console.log(
      chalk.dim("  Use --source to specify a different source directory."),
    );
    return;
  }

  // Look for project.yaml in source (single-project mode)
  const srcProjectYaml = path.join(source, "project.yaml");
  if (fs.existsSync(srcProjectYaml)) {
    // Single-project source
    copyFile(srcProjectYaml, destProjectYaml);

    // Copy epics/
    const srcEpicsDir = path.join(source, "epics");
    if (fs.existsSync(srcEpicsDir) && fs.statSync(srcEpicsDir).isDirectory()) {
      const epicFiles = fs
        .readdirSync(srcEpicsDir)
        .filter((f) => f.endsWith(".yaml"));
      for (const epicFile of epicFiles) {
        copyFile(
          path.join(srcEpicsDir, epicFile),
          path.join(dest, "epics", epicFile),
        );
      }
    }

    // Copy comments/
    const srcCommentsDir = path.join(source, "comments");
    if (
      fs.existsSync(srcCommentsDir) &&
      fs.statSync(srcCommentsDir).isDirectory()
    ) {
      const commentFiles = fs.readdirSync(srcCommentsDir);
      for (const commentFile of commentFiles) {
        copyFile(
          path.join(srcCommentsDir, commentFile),
          path.join(dest, "comments", commentFile),
        );
      }
    }

    // Copy adrs/
    const srcAdrsDir = path.join(source, "adrs");
    if (fs.existsSync(srcAdrsDir) && fs.statSync(srcAdrsDir).isDirectory()) {
      const adrFiles = fs.readdirSync(srcAdrsDir);
      for (const adrFile of adrFiles) {
        copyFile(
          path.join(srcAdrsDir, adrFile),
          path.join(dest, "adrs", adrFile),
        );
      }
    }

    rebuildIndex();

    console.log(
      chalk.green("✓") +
        ` Migrated project from ${chalk.dim(source)} to ${chalk.dim(dest)}`,
    );
    return;
  }

  // Look for multi-project source (projects/{CODE}/project.yaml)
  const entries = fs.readdirSync(source).filter((name) => {
    if (name === "index.yaml") return false;
    const full = path.join(source, name);
    return fs.statSync(full).isDirectory();
  });

  if (entries.length === 0) {
    console.log(chalk.yellow("No projects found in source: ") + source);
    return;
  }

  // In single-project mode, only migrate the first project found
  const firstProject = entries[0];
  if (!firstProject) {
    console.log(chalk.yellow("No projects found in source: ") + source);
    return;
  }

  const srcProjectDir = path.join(source, firstProject);

  // Copy project.yaml
  const srcProjectYamlMulti = path.join(srcProjectDir, "project.yaml");
  if (fs.existsSync(srcProjectYamlMulti)) {
    copyFile(srcProjectYamlMulti, destProjectYaml);
  }

  // Copy epics/
  const srcEpicsDir = path.join(srcProjectDir, "epics");
  if (fs.existsSync(srcEpicsDir) && fs.statSync(srcEpicsDir).isDirectory()) {
    const epicFiles = fs
      .readdirSync(srcEpicsDir)
      .filter((f) => f.endsWith(".yaml"));
    for (const epicFile of epicFiles) {
      copyFile(
        path.join(srcEpicsDir, epicFile),
        path.join(dest, "epics", epicFile),
      );
    }
  }

  // Copy comments/
  const srcCommentsDir = path.join(srcProjectDir, "comments");
  if (
    fs.existsSync(srcCommentsDir) &&
    fs.statSync(srcCommentsDir).isDirectory()
  ) {
    const commentFiles = fs.readdirSync(srcCommentsDir);
    for (const commentFile of commentFiles) {
      copyFile(
        path.join(srcCommentsDir, commentFile),
        path.join(dest, "comments", commentFile),
      );
    }
  }

  // Copy adrs/
  const srcAdrsDir = path.join(srcProjectDir, "adrs");
  if (fs.existsSync(srcAdrsDir) && fs.statSync(srcAdrsDir).isDirectory()) {
    const adrFiles = fs.readdirSync(srcAdrsDir);
    for (const adrFile of adrFiles) {
      copyFile(
        path.join(srcAdrsDir, adrFile),
        path.join(dest, "adrs", adrFile),
      );
    }
  }

  rebuildIndex();

  console.log(
    chalk.green("✓") +
      ` Migrated project ${chalk.bold(firstProject)} from ${chalk.dim(source)} to ${chalk.dim(dest)}`,
  );

  if (entries.length > 1) {
    console.log(
      chalk.yellow("⚠") +
        ` ${entries.length - 1} additional project(s) were not migrated (single-project mode)`,
    );
  }
}

/**
 * Copy a directory recursively from src to dest.
 */
function copyDir(src: string, dest: string): number {
  let count = 0;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

/**
 * Verify that the migrated project loads correctly.
 * Returns true if verification succeeds, false if there are validation errors.
 */
function verifyMigration(pmDir: string): {
  success: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const projectYaml = path.join(pmDir, "project.yaml");
  try {
    readYaml(projectYaml, ProjectSchema);
  } catch (err) {
    if (err instanceof Error) {
      errors.push(`project.yaml: ${err.message}`);
    } else {
      errors.push(`project.yaml: ${String(err)}`);
    }
  }

  const epicsDir = path.join(pmDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml");
  for (const epicFile of epicFiles) {
    try {
      readYaml(epicFile, EpicSchema);
    } catch (err) {
      const fileName = path.basename(epicFile);
      if (err instanceof Error) {
        errors.push(`epics/${fileName}: ${err.message}`);
      } else {
        errors.push(`epics/${fileName}: ${String(err)}`);
      }
    }
  }

  return { success: errors.length === 0, errors };
}

/**
 * Migrate a project from global ~/.pm/projects/{CODE}/ to local .pm/ at target.
 * Flattens the directory structure by removing the {CODE}/ nesting.
 */
export async function toLocal(options: Record<string, unknown>): Promise<void> {
  const opts = options as unknown as ToLocalOptions;
  const { code, target } = opts;

  if (!code) {
    throw new PmError(
      "CODE_REQUIRED",
      "Project code is required. Use --code <CODE>",
    );
  }

  if (!target) {
    throw new PmError(
      "TARGET_REQUIRED",
      "Target directory is required. Use --target <PATH>",
    );
  }

  const homeDir = process.env["HOME"] || os.homedir();
  const globalProjectsDir = path.join(homeDir, ".pm", "projects");
  const sourceDir = path.join(globalProjectsDir, code);
  const targetDir = path.resolve(target);
  const destPmDir = path.join(targetDir, ".pm");

  if (!fs.existsSync(sourceDir)) {
    throw new PmError(
      "PROJECT_NOT_FOUND",
      `Project '${code}' not found in global storage: ${sourceDir}`,
    );
  }

  if (!fs.statSync(sourceDir).isDirectory()) {
    throw new PmError(
      "SOURCE_NOT_DIRECTORY",
      `Source is not a directory: ${sourceDir}`,
    );
  }

  if (fs.existsSync(destPmDir)) {
    throw new PmError(
      "DEST_EXISTS",
      `Destination .pm/ already exists: ${destPmDir}. Remove it first or choose a different target.`,
    );
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const migratedFiles: string[] = [];

  const srcProjectYaml = path.join(sourceDir, "project.yaml");
  if (fs.existsSync(srcProjectYaml)) {
    fs.mkdirSync(destPmDir, { recursive: true });
    fs.copyFileSync(srcProjectYaml, path.join(destPmDir, "project.yaml"));
    migratedFiles.push("project.yaml");
  }

  const srcEpicsDir = path.join(sourceDir, "epics");
  if (fs.existsSync(srcEpicsDir) && fs.statSync(srcEpicsDir).isDirectory()) {
    const destEpicsDir = path.join(destPmDir, "epics");
    const count = copyDir(srcEpicsDir, destEpicsDir);
    migratedFiles.push(`epics/ (${count} files)`);
  }

  const srcCommentsDir = path.join(sourceDir, "comments");
  if (
    fs.existsSync(srcCommentsDir) &&
    fs.statSync(srcCommentsDir).isDirectory()
  ) {
    const destCommentsDir = path.join(destPmDir, "comments");
    const count = copyDir(srcCommentsDir, destCommentsDir);
    migratedFiles.push(`comments/ (${count} files)`);
  }

  const srcAdrsDir = path.join(sourceDir, "adrs");
  if (fs.existsSync(srcAdrsDir) && fs.statSync(srcAdrsDir).isDirectory()) {
    const destAdrsDir = path.join(destPmDir, "adrs");
    const count = copyDir(srcAdrsDir, destAdrsDir);
    migratedFiles.push(`adrs/ (${count} files)`);
  }

  const srcReportsDir = path.join(sourceDir, "reports");
  if (
    fs.existsSync(srcReportsDir) &&
    fs.statSync(srcReportsDir).isDirectory()
  ) {
    const destReportsDir = path.join(destPmDir, "reports");
    const count = copyDir(srcReportsDir, destReportsDir);
    migratedFiles.push(`reports/ (${count} files)`);
  }

  const srcIndexYaml = path.join(sourceDir, "index.yaml");
  if (fs.existsSync(srcIndexYaml)) {
    fs.copyFileSync(srcIndexYaml, path.join(destPmDir, "index.yaml"));
    migratedFiles.push("index.yaml");
  }

  console.log(
    chalk.green("✓") +
      ` Migrated project ${chalk.bold(code)} to ${chalk.dim(destPmDir)}`,
  );
  console.log();
  console.log(chalk.bold("Migrated files:"));
  for (const file of migratedFiles) {
    console.log(`  ${chalk.dim("•")} ${file}`);
  }

  console.log();
  console.log(chalk.dim("Verifying migration..."));
  const verification = verifyMigration(destPmDir);

  if (!verification.success) {
    console.log();
    console.log(chalk.red("✗") + " Migration verification failed:");
    for (const error of verification.errors) {
      console.log(chalk.red("  ✗ ") + error);
    }
    throw new PmError(
      "VERIFICATION_FAILED",
      "Migration verification failed. See errors above.",
    );
  }

  console.log(
    chalk.green("✓") + " Verification successful. Project loads correctly.",
  );

  if (opts.cleanup) {
    console.log();
    console.log(
      chalk.yellow("⚠") +
        ` This will remove the project from global storage: ${chalk.dim(sourceDir)}`,
    );
    console.log(chalk.dim("  The local copy at .pm/ will be preserved."));

    fs.rmSync(sourceDir, { recursive: true, force: true });
    console.log(
      chalk.green("✓") +
        ` Cleaned up global project directory: ${chalk.dim(sourceDir)}`,
    );
  }
}
