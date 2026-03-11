import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readYaml } from "./fs.js";
import { EpicSchema } from "../schemas/index.js";

/**
 * Resolve the root projects directory.
 * Priority: PM_HOME env var > ~/.pm/
 * Never falls back to process.cwd().
 */
export function getProjectsDir(): string {
  if (process.env["PM_HOME"]) {
    return path.join(process.env["PM_HOME"], "projects");
  }
  return path.join(os.homedir(), ".pm", "projects");
}

/**
 * Ensure the projects directory exists, creating it (and parents) if needed.
 * Safe to call multiple times — no-op when the directory already exists.
 * Should be called early in CLI initialization before any command runs.
 */
export function ensureProjectsDir(): void {
  const projectsDir = getProjectsDir();
  fs.mkdirSync(projectsDir, { recursive: true });
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
 * Check if a project code is already taken (projects/{code}/ directory exists).
 */
export function isProjectCodeTaken(code: string): boolean {
  const projectDir = path.join(getProjectsDir(), code);
  return fs.existsSync(projectDir);
}

/**
 * Find the next available epic number for a project.
 * Scans projects/{code}/epics/ for existing E### files and returns the next.
 * e.g. if E001-E003 exist, returns "E004"
 */
export function nextEpicNumber(projectCode: string): string {
  const epicsDir = path.join(getProjectsDir(), projectCode, "epics");

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
 * Scans the project's epics directory for a file starting with "E001-".
 * Returns null if not found.
 */
export function findEpicFile(epicCode: string): string | null {
  const parts = epicCode.split("-");
  if (parts.length !== 2) return null;

  const projectCode = parts[0];
  const epicId = parts[1];

  if (!projectCode || !epicId) return null;

  const epicsDir = path.join(getProjectsDir(), projectCode, "epics");
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
 * List all project codes in the projects directory.
 */
export function listProjectCodes(): string[] {
  const projectsDir = getProjectsDir();
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir).filter((name) => {
    if (name === "index.yaml") return false;
    const full = path.join(projectsDir, name);
    return fs.statSync(full).isDirectory();
  });
}

/**
 * Ensure the reports directory exists for a project, creating it if needed.
 */
export function ensureReportsDir(projectCode: string): string {
  const reportsDir = path.join(getProjectsDir(), projectCode, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

/**
 * Find the next available report number for a project.
 * Scans projects/{code}/reports/ for existing R### files and returns the next.
 * e.g. if R001-R003 exist, returns "R004"
 */
export function nextReportNumber(projectCode: string): string {
  const reportsDir = path.join(getProjectsDir(), projectCode, "reports");

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
 * Scans the project's reports directory for a file starting with "R001-".
 * Returns null if not found.
 */
export function findReportFile(reportCode: string): string | null {
  const parts = reportCode.split("-");
  if (parts.length !== 2) return null;

  const projectCode = parts[0];
  const reportId = parts[1];

  if (!projectCode || !reportId) return null;

  const reportsDir = path.join(getProjectsDir(), projectCode, "reports");
  if (!fs.existsSync(reportsDir)) return null;

  const files = fs.readdirSync(reportsDir);
  const match = files.find(
    (f) => f.startsWith(`${reportId}-`) && f.endsWith(".yaml"),
  );
  return match ? path.join(reportsDir, match) : null;
}
