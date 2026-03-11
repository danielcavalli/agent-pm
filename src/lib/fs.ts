import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { YamlNotFoundError, YamlParseError, ZodValidationError } from './errors.js';

/**
 * Read and validate a YAML file against a Zod schema.
 * Returns the OUTPUT type of the schema (post-transform/default).
 * Throws YamlNotFoundError if the file does not exist.
 * Throws YamlParseError if the YAML is malformed.
 * Throws ZodValidationError if schema validation fails.
 */
export function readYaml<S extends z.ZodTypeAny>(filePath: string, schema: S): z.output<S> {
  if (!fs.existsSync(filePath)) {
    throw new YamlNotFoundError(filePath);
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
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

  fs.writeFileSync(filePath, content, 'utf8');
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
export function listFiles(dirPath: string, suffix = '.yaml'): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dirPath, name));
}

export { z };
