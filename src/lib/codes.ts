import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { readYaml } from "./fs.js";
import { PmError } from "./errors.js";
import { EpicSchema, ProjectSchema } from "../schemas/index.js";

/**
 * Find the git repository root directory.
 * Returns null if not in a git repository.
 */
export function findGitRoot(): string | null {
  try {
    const root = childProcess
      .execSync("git rev-parse --show-toplevel", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
      .trim();
    return root || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the .pm directory for the current project.
 * Priority: PM_HOME > git-root/.pm > cwd/.pm
 * Throws if no .pm directory can be resolved.
 */
export function getPmDir(): string {
  if (process.env["PM_HOME"]) {
    return process.env["PM_HOME"];
  }

  const gitRoot = findGitRoot();
  if (gitRoot) {
    const gitPmDir = path.join(gitRoot, ".pm");
    if (fs.existsSync(gitPmDir)) {
      return gitPmDir;
    }
  }

  const cwdPmDir = path.join(process.cwd(), ".pm");
  if (fs.existsSync(cwdPmDir)) {
    return cwdPmDir;
  }

  throw new PmError(
    "PM_DIR_NOT_FOUND",
    "No .pm directory found. Run 'pm init' to create one, or set PM_HOME.",
  );
}

/**
 * Legacy alias for getPmDir() - returns the .pm directory.
 * @deprecated Use getPmDir() instead.
 */
export function getProjectsDir(): string {
  return getPmDir();
}

/**
 * Ensure the .pm directory exists, creating it (and parents) if needed.
 * Safe to call multiple times — no-op when the directory already exists.
 * Should be called early in CLI initialization before any command runs.
 *
 * Creates .pm/ at git root or cwd, with subdirectories for epics, comments,
 * adrs, reports, and agents. Refuses to create in / or HOME without explicit pm init.
 */
export function ensurePmDir(): void {
  const subdirs = ["epics", "comments", "adrs", "reports", "agents"];

  if (process.env["PM_HOME"]) {
    const pmDir = process.env["PM_HOME"];
    fs.mkdirSync(pmDir, { recursive: true });
    for (const subdir of subdirs) {
      fs.mkdirSync(path.join(pmDir, subdir), { recursive: true });
    }
    return;
  }

  const targetDir = determinePmLocation();
  if (!targetDir) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const subdir of subdirs) {
    fs.mkdirSync(path.join(targetDir, subdir), { recursive: true });
  }
}

/**
 * Determine where .pm/ should be created.
 * Returns null if creation should be refused (e.g., in / or HOME).
 * Priority: git root > cwd, with safety guards.
 */
function determinePmLocation(): string | null {
  const homeDir = process.env["HOME"] || os.homedir();
  const cwd = process.cwd();

  const gitRoot = findGitRoot();
  if (gitRoot) {
    return path.join(gitRoot, ".pm");
  }

  if (cwd === "/" || cwd === homeDir) {
    return null;
  }

  return path.join(cwd, ".pm");
}

/**
 * Legacy alias for ensurePmDir().
 * @deprecated Use ensurePmDir() instead.
 */
export function ensureProjectsDir(): void {
  ensurePmDir();
}

/**
 * Suggest a project code from a project name.
 * Takes the first letter of each word (uppercase), capped at 6 chars.
 * e.g. "My Cool App" -> "MCA", "Project Management" -> "PM"
 */
export function suggestProjectCode(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const code = words
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);

  return code || "PROJ";
}

/**
 * Convert a title string to a kebab-slug for use in epic filenames.
 * e.g. "Authentication & Authorization" -> "authentication-authorization"
 */
export function toKebabSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric (except spaces and hyphens)
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * Check if a project code is already taken.
 * @deprecated In single-project mode, this always returns false.
 * Kept for backward compatibility with existing code.
 */
export function isProjectCodeTaken(_code: string): boolean {
  return false;
}

/**
 * Find the next available epic number for the project.
 * Scans .pm/epics/ for existing E### files and returns the next.
 * e.g. if E001-E003 exist, returns "E004"
 */
export function nextEpicNumber(_projectCode?: string): string {
  const epicsDir = path.join(getPmDir(), "epics");

  if (!fs.existsSync(epicsDir)) {
    return "E001";
  }

  const files = fs
    .readdirSync(epicsDir)
    .filter((f) => /^E\d{3}-.+\.yaml$/.test(f));
  const numbers = files
    .map((f) => {
      const m = f.match(/^E(\d{3})/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const next = numbers.length > 0 ? (numbers[numbers.length - 1] ?? 0) + 1 : 1;
  return `E${String(next).padStart(3, "0")}`;
}

/**
 * Find the next available story number within an epic.
 * Reads the epic YAML and returns the next S### after existing stories.
 * e.g. if S001-S002 exist, returns "S003"
 */
export function nextStoryNumber(epicFilePath: string): string {
  let epic;
  try {
    epic = readYaml(epicFilePath, EpicSchema);
  } catch {
    return "S001";
  }

  if (!epic.stories || epic.stories.length === 0) {
    return "S001";
  }

  const numbers = epic.stories
    .map((s) => {
      const m = s.id.match(/^S(\d{3})$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const next = numbers.length > 0 ? (numbers[numbers.length - 1] ?? 0) + 1 : 1;
  return `S${String(next).padStart(3, "0")}`;
}

/**
 * Find the epic YAML file path for a given epic code (e.g. "PM-E001").
 * Scans .pm/epics/ for a file starting with "E001-".
 * Returns null if not found.
 */
export function findEpicFile(epicCode: string): string | null {
  const parts = epicCode.split("-");
  if (parts.length !== 2) return null;

  const epicId = parts[1];
  if (!epicId) return null;

  const epicsDir = path.join(getPmDir(), "epics");
  if (!fs.existsSync(epicsDir)) return null;

  const files = fs.readdirSync(epicsDir);
  const match = files.find(
    (f) => f.startsWith(`${epicId}-`) && f.endsWith(".yaml"),
  );
  return match ? path.join(epicsDir, match) : null;
}

/**
 * Parse a story code into its components.
 * e.g. "PM-E001-S003" -> { projectCode: "PM", epicId: "E001", storyId: "S003", epicCode: "PM-E001" }
 */
export function parseStoryCode(storyCode: string): {
  projectCode: string;
  epicId: string;
  storyId: string;
  epicCode: string;
} | null {
  const m = storyCode.match(/^([A-Z]{2,6})-(E\d{3})-(S\d{3})$/);
  if (!m) return null;
  const [, projectCode, epicId, storyId] = m;
  if (!projectCode || !epicId || !storyId) return null;
  return {
    projectCode,
    epicId,
    storyId,
    epicCode: `${projectCode}-${epicId}`,
  };
}

/**
 * Resolve an epic code, accepting either full form (PM-E001) or short form (E001).
 * Returns the full epic code with project prefix.
 * Throws PmError if no project code can be determined.
 */
export function resolveEpicCode(input: string): string {
  if (/^[A-Z]{2,6}-E\d{3}$/.test(input)) {
    return input;
  }
  if (/^E\d{3}$/.test(input)) {
    const projectCode = getProjectCode();
    if (!projectCode) {
      throw new PmError(
        "PROJECT_CODE_NOT_FOUND",
        "Cannot resolve epic code: no project found. Run 'pm init' first or use full code (e.g. PM-E001).",
      );
    }
    return `${projectCode}-${input}`;
  }
  throw new PmError(
    "INVALID_EPIC_CODE",
    `Invalid epic code '${input}': expected E### or PROJECT-E### (e.g. E001 or PM-E001)`,
  );
}

/**
 * Resolve a story code, accepting either full form (PM-E001-S001) or short form (E001-S001).
 * Returns parsed components with the full epic code.
 * Throws PmError if no project code can be determined.
 */
export function resolveStoryCode(input: string): {
  projectCode: string;
  epicId: string;
  storyId: string;
  epicCode: string;
} {
  const fullMatch = input.match(/^([A-Z]{2,6})-(E\d{3})-(S\d{3})$/);
  if (fullMatch) {
    const [, projectCode, epicId, storyId] = fullMatch;
    if (!projectCode || !epicId || !storyId) {
      throw new PmError("INVALID_STORY_CODE", `Invalid story code '${input}'`);
    }
    return {
      projectCode,
      epicId,
      storyId,
      epicCode: `${projectCode}-${epicId}`,
    };
  }

  const shortMatch = input.match(/^(E\d{3})-(S\d{3})$/);
  if (shortMatch) {
    const [, epicId, storyId] = shortMatch;
    if (!epicId || !storyId) {
      throw new PmError("INVALID_STORY_CODE", `Invalid story code '${input}'`);
    }
    const projectCode = getProjectCode();
    if (!projectCode) {
      throw new PmError(
        "PROJECT_CODE_NOT_FOUND",
        "Cannot resolve story code: no project found. Run 'pm init' first or use full code (e.g. PM-E001-S001).",
      );
    }
    return {
      projectCode,
      epicId,
      storyId,
      epicCode: `${projectCode}-${epicId}`,
    };
  }

  throw new PmError(
    "INVALID_STORY_CODE",
    `Invalid story code '${input}': expected E###-S### or PROJECT-E###-S### (e.g. E001-S001 or PM-E001-S001)`,
  );
}

/**
 * List all project codes in the projects directory.
 * In single-project mode, returns an array with only the local project code.
 * Returns empty array if no project found.
 */
export function listProjectCodes(): string[] {
  const code = getProjectCode();
  return code ? [code] : [];
}

let cachedProjectCode: string | null | undefined = undefined;

/**
 * Get the project code from .pm/project.yaml.
 * Caches the result to avoid repeated file reads within a single CLI invocation.
 * Returns null if .pm/project.yaml does not exist or is invalid.
 */
export function getProjectCode(): string | null {
  if (cachedProjectCode !== undefined) {
    return cachedProjectCode;
  }

  try {
    const pmDir = getPmDir();
    const projectYaml = path.join(pmDir, "project.yaml");
    const project = readYaml(projectYaml, ProjectSchema);
    cachedProjectCode = project.code;
    return cachedProjectCode;
  } catch {
    cachedProjectCode = null;
    return null;
  }
}

/**
 * Reset the project code cache. For testing only.
 */
export function resetProjectCodeCache(): void {
  cachedProjectCode = undefined;
}

/**
 * Ensure the reports directory exists, creating it if needed.
 */
export function ensureReportsDir(_projectCode?: string): string {
  const reportsDir = path.join(getPmDir(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

/**
 * Find the next available report number for the project.
 * Scans .pm/reports/ for existing R### files and returns the next.
 * e.g. if R001-R003 exist, returns "R004"
 */
export function nextReportNumber(_projectCode?: string): string {
  const reportsDir = path.join(getPmDir(), "reports");

  if (!fs.existsSync(reportsDir)) {
    return "R001";
  }

  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => /^R\d{3}-.+\.yaml$/.test(f));
  const numbers = files
    .map((f) => {
      const m = f.match(/^R(\d{3})/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const next = numbers.length > 0 ? (numbers[numbers.length - 1] ?? 0) + 1 : 1;
  return `R${String(next).padStart(3, "0")}`;
}

/**
 * Find the report YAML file path for a given report code (e.g. "PM-R001").
 * Scans .pm/reports/ for a file starting with "R001-".
 * Returns null if not found.
 */
export function findReportFile(reportCode: string): string | null {
  const parts = reportCode.split("-");
  if (parts.length !== 2) return null;

  const reportId = parts[1];
  if (!reportId) return null;

  const reportsDir = path.join(getPmDir(), "reports");
  if (!fs.existsSync(reportsDir)) return null;

  const files = fs.readdirSync(reportsDir);
  const match = files.find(
    (f) => f.startsWith(`${reportId}-`) && f.endsWith(".yaml"),
  );
  return match ? path.join(reportsDir, match) : null;
}
