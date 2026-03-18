import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { ProjectCodeSchema } from "../schemas/index.js";
import type { Project } from "../schemas/index.js";
import { writeYaml } from "../lib/fs.js";
import { ValidationError, PmAlreadyExistsError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";

const LOCAL_PM_DIR = ".pm";

function findGitRoot(): string | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return root || null;
  } catch {
    return null;
  }
}

function deriveCodeFromDirName(dirPath: string): string {
  const dirName = path.basename(dirPath);
  const code = dirName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
  return code || "PROJ";
}

function getTargetDir(): string {
  // If PM_HOME is set, it points to the .pm directory itself
  // so we need to use its parent as the target
  if (process.env["PM_HOME"]) {
    return path.dirname(process.env["PM_HOME"]);
  }
  const gitRoot = findGitRoot();
  return gitRoot || process.cwd();
}

interface InitOptions {
  name: string;
  code?: string;
  description?: string;
  vision?: string;
  techStack?: string[];
  architecture?: string;
  _targetDir?: string;
}

export async function init(options: Record<string, unknown>): Promise<void> {
  const opts = options as unknown as InitOptions;
  const { name } = opts;

  const targetDir = opts._targetDir || getTargetDir();
  const pmDir = path.join(targetDir, LOCAL_PM_DIR);

  if (fs.existsSync(pmDir)) {
    throw new PmAlreadyExistsError(pmDir);
  }

  let code: string;
  if (opts.code) {
    const codeResult = ProjectCodeSchema.safeParse(opts.code);
    if (!codeResult.success) {
      throw new ValidationError(
        `Invalid project code '${opts.code}': ${codeResult.error.issues[0]?.message ?? "invalid format"}`,
      );
    }
    code = codeResult.data;
  } else {
    code = deriveCodeFromDirName(targetDir);
    const codeResult = ProjectCodeSchema.safeParse(code);
    if (!codeResult.success) {
      code = "PROJ";
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const techStack: string[] = Array.isArray(opts.techStack)
    ? opts.techStack
    : [];

  const architecturePattern = opts.architecture ?? "";

  const project: Project = {
    code,
    name,
    description: opts.description ?? "",
    vision: opts.vision ?? "",
    status: "active",
    created_at: today,
    tech_stack: techStack,
    architecture: architecturePattern
      ? {
          pattern: architecturePattern,
          storage: "yaml-files",
          primary_interface: "cli",
        }
      : undefined,
    notes: "",
  };

  const subdirs = ["epics", "comments", "adrs", "reports", "agents"];
  for (const subdir of subdirs) {
    fs.mkdirSync(path.join(pmDir, subdir), { recursive: true });
  }

  const projectYaml = path.join(pmDir, "project.yaml");
  writeYaml(projectYaml, project);

  rebuildIndex();

  console.log(chalk.green("✓") + " Project created: " + chalk.bold(code));
  console.log(chalk.dim("  Path: ") + projectYaml);
  console.log(chalk.dim("  Name: ") + name);
  console.log(chalk.dim("  Status: ") + "active");
  if (techStack.length > 0) {
    console.log(chalk.dim("  Tech Stack: ") + techStack.join(", "));
  }
}
