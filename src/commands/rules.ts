import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { PmError } from "../lib/errors.js";

const START_MARKER = "# PM Autonomous Filing Rules";
const END_MARKER = "# END PM Autonomous Filing Rules";

/**
 * Resolve the path to install/agents-rules.md from the package root.
 * At runtime this file lives at dist/commands/rules.js, so the package
 * root is two directories up.
 */
function getRulesSourcePath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(thisFile), "..", "..");
  return path.join(packageRoot, "install", "agents-rules.md");
}

/**
 * Strip the PM rules section (between markers) from a file's content.
 * Returns the content with the section removed and excess blank lines cleaned up.
 */
function stripExistingRules(content: string): string {
  if (!content.includes(START_MARKER)) return content;

  const lines = content.split("\n");
  const filtered: string[] = [];
  let skip = false;

  for (const line of lines) {
    if (line.trim() === START_MARKER) {
      skip = true;
      continue;
    }
    if (line.trim() === END_MARKER) {
      skip = false;
      continue;
    }
    if (!skip) filtered.push(line);
  }

  return filtered
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

interface RulesOptions {
  path?: string;
}

/**
 * Write PM agent rules into a project-level AGENTS.md file.
 * Idempotent: if the markers already exist, the section is replaced.
 */
export async function initRules(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as RulesOptions;
  const targetPath = path.resolve(opts.path ?? "./AGENTS.md");

  // Read the canonical rules source from the package
  const rulesSourcePath = getRulesSourcePath();
  if (!fs.existsSync(rulesSourcePath)) {
    throw new PmError(
      "RULES_SOURCE_NOT_FOUND",
      `Rules source file not found: ${rulesSourcePath}. Is pm installed correctly?`,
    );
  }
  const rulesContent = fs.readFileSync(rulesSourcePath, "utf8");

  // Read existing target file (or start empty)
  let existing = "";
  const isUpdate = fs.existsSync(targetPath);
  if (isUpdate) {
    existing = fs.readFileSync(targetPath, "utf8");
  }

  // Strip any existing PM rules section
  const cleaned = stripExistingRules(existing);

  // Append fresh rules
  const separator = cleaned.length > 0 ? "\n\n" : "";
  const result = cleaned + separator + rulesContent.trimEnd() + "\n";

  fs.writeFileSync(targetPath, result, "utf8");

  const action =
    isUpdate && existing.includes(START_MARKER)
      ? "Updated"
      : isUpdate
        ? "Added to"
        : "Created";
  console.log(
    chalk.green("✓") + ` ${action} PM agent rules in ${chalk.bold(targetPath)}`,
  );
}

/**
 * Remove PM agent rules from a file (used for cleanup).
 * Returns true if rules were found and removed.
 */
export async function removeRules(
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as unknown as RulesOptions;
  const targetPath = path.resolve(opts.path ?? "./AGENTS.md");

  if (!fs.existsSync(targetPath)) {
    console.log(chalk.dim(`No file at ${targetPath} — nothing to remove.`));
    return;
  }

  const existing = fs.readFileSync(targetPath, "utf8");
  if (!existing.includes(START_MARKER)) {
    console.log(chalk.dim(`No PM rules found in ${targetPath}.`));
    return;
  }

  const cleaned = stripExistingRules(existing);
  fs.writeFileSync(
    targetPath,
    cleaned.length > 0 ? cleaned + "\n" : "",
    "utf8",
  );

  console.log(
    chalk.green("✓") + ` Removed PM agent rules from ${chalk.bold(targetPath)}`,
  );
}
