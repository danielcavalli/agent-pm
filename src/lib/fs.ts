import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as yaml from "js-yaml";
import { z } from "zod";
import {
  PmError,
  YamlNotFoundError,
  YamlParseError,
  ZodValidationError,
} from "./errors.js";

/**
 * Read and validate a YAML file against a Zod schema.
 * Returns the OUTPUT type of the schema (post-transform/default).
 * Throws YamlNotFoundError if the file does not exist.
 * Throws YamlParseError if the YAML is malformed.
 * Throws ZodValidationError if schema validation fails.
 */
export function readYaml<S extends z.ZodTypeAny>(
  filePath: string,
  schema: S,
): z.output<S> {
  if (!fs.existsSync(filePath)) {
    throw new YamlNotFoundError(filePath);
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    raw = yaml.load(content);
  } catch (err) {
    throw new YamlParseError(filePath, err);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ZodValidationError(filePath, result.error);
  }

  return result.data as z.output<S>;
}

/**
 * Write a value as YAML to the given path.
 * Creates parent directories if they do not exist.
 */
export function writeYaml(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Read a YAML file, apply a transformation, then write it back.
 */
export function updateYaml<S extends z.ZodTypeAny>(
  filePath: string,
  schema: S,
  updater: (data: z.output<S>) => z.output<S>,
): z.output<S> {
  const current = readYaml(filePath, schema);
  const updated = updater(current);
  writeYaml(filePath, updated);
  return updated;
}

/**
 * Check if a file exists (simple wrapper for clarity).
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * List immediate child directories of a directory.
 * Returns [] if the directory does not exist.
 */
export function listDirs(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter((name) => {
    const full = path.join(dirPath, name);
    return fs.statSync(full).isDirectory();
  });
}

/**
 * List files matching a glob-style suffix in a directory.
 * Returns [] if the directory does not exist.
 */
export function listFiles(dirPath: string, suffix = ".yaml"): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dirPath, name));
}

/**
 * Compute the lock file path for a given file.
 * Lock files live at .pm/.lock-{sha256(filePath).slice(0,8)}.
 *
 * Walks up the directory tree from filePath to find the nearest .pm/ directory.
 * If none is found, places the lock file next to the target file's parent directory.
 */
export function lockPath(filePath: string): string {
  // Walk up the directory tree to find .pm/
  const absPath = path.resolve(filePath);
  const hash = crypto
    .createHash("sha256")
    .update(absPath)
    .digest("hex")
    .slice(0, 8);
  let dir = path.dirname(absPath);
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === ".pm") {
      return path.join(dir, `.lock-${hash}`);
    }
    dir = path.dirname(dir);
  }

  // Fallback: place lock next to the file
  return path.join(path.dirname(absPath), `.lock-${hash}`);
}

interface LockInfo {
  pid: number;
  created_at: string;
}

const LOCK_STALE_MS = 30_000; // 30 seconds
const LOCK_RETRY_COUNT = 3;
const LOCK_RETRY_DELAY_MS = 100;

/**
 * Check if a lock is stale (older than LOCK_STALE_MS).
 */
function isLockStale(lockFile: string): boolean {
  try {
    const content = fs.readFileSync(lockFile, "utf8");
    const info: LockInfo = JSON.parse(content);
    const age = Date.now() - new Date(info.created_at).getTime();
    return age > LOCK_STALE_MS;
  } catch {
    // If we can't read it, treat it as stale so we can clean up
    return true;
  }
}

/**
 * Attempt to acquire an advisory lock for the given file path.
 * Returns true if the lock was acquired, false otherwise.
 */
function tryAcquireLock(lockFile: string): boolean {
  // Check for existing lock
  if (fs.existsSync(lockFile)) {
    if (isLockStale(lockFile)) {
      // Break stale lock
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // Another process may have already removed it
      }
    } else {
      return false;
    }
  }

  const info: LockInfo = {
    pid: process.pid,
    created_at: new Date().toISOString(),
  };

  try {
    // Use wx flag to atomically create; fails if file already exists
    fs.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Release an advisory lock.
 */
function releaseLock(lockFile: string): void {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // Lock file may already be gone — that's fine
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function while holding an advisory file lock.
 *
 * Creates a lock file at .pm/.lock-{sha256(filePath).slice(0,8)} containing
 * {pid, created_at}. Stale locks (older than 30s) are automatically broken.
 * Retries up to 3 times (100ms apart) before throwing a PmError.
 *
 * @param filePath - The file path to lock (used to derive the lock file name)
 * @param fn - The function to execute while holding the lock
 * @returns The return value of fn
 */
export async function withLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const lock = lockPath(filePath);

  // Ensure the directory for the lock file exists
  const lockDir = path.dirname(lock);
  fs.mkdirSync(lockDir, { recursive: true });

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt++) {
    if (tryAcquireLock(lock)) {
      try {
        return await fn();
      } finally {
        releaseLock(lock);
      }
    }
    if (attempt < LOCK_RETRY_COUNT - 1) {
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }

  throw new PmError(
    "LOCK_ACQUISITION_FAILED",
    `Failed to acquire lock for ${filePath} after ${LOCK_RETRY_COUNT} retries. ` +
      `Lock file: ${lock}. Another agent may be writing to this file.`,
  );
}

export { z };
