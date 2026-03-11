import { ZodError } from "zod";

export class PmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PmError";
  }
}

export class YamlNotFoundError extends PmError {
  constructor(public readonly filePath: string) {
    super("YAML_NOT_FOUND", `File not found: ${filePath}`);
    this.name = "YamlNotFoundError";
  }
}

export class YamlParseError extends PmError {
  constructor(
    public readonly filePath: string,
    cause: unknown,
  ) {
    super(
      "YAML_PARSE_ERROR",
      `Failed to parse YAML at ${filePath}: ${String(cause)}`,
    );
    this.name = "YamlParseError";
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class ZodValidationError extends PmError {
  constructor(
    public readonly filePath: string,
    public readonly zodError: ZodError,
  ) {
    const fieldDetails = zodError.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    super(
      "VALIDATION_ERROR",
      `Validation failed for ${filePath}:\n${fieldDetails}`,
    );
    this.name = "ZodValidationError";
  }

  get fieldErrors(): Array<{ path: string; message: string }> {
    return this.zodError.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  }
}

export class ProjectNotFoundError extends PmError {
  constructor(public readonly projectCode: string) {
    super("PROJECT_NOT_FOUND", `Project not found: ${projectCode}`);
    this.name = "ProjectNotFoundError";
  }
}

export class EpicNotFoundError extends PmError {
  constructor(public readonly epicCode: string) {
    super("EPIC_NOT_FOUND", `Epic not found: ${epicCode}`);
    this.name = "EpicNotFoundError";
  }
}

export class StoryNotFoundError extends PmError {
  constructor(public readonly storyCode: string) {
    super("STORY_NOT_FOUND", `Story not found: ${storyCode}`);
    this.name = "StoryNotFoundError";
  }
}

export class ReportNotFoundError extends PmError {
  constructor(public readonly reportCode: string) {
    super("REPORT_NOT_FOUND", `Report not found: ${reportCode}`);
    this.name = "ReportNotFoundError";
  }
}

export class DuplicateProjectCodeError extends PmError {
  constructor(public readonly projectCode: string) {
    super(
      "DUPLICATE_PROJECT_CODE",
      `Project code already exists: ${projectCode}`,
    );
    this.name = "DuplicateProjectCodeError";
  }
}

export class ValidationError extends PmError {
  constructor(
    message: string,
    public readonly zodError?: ZodError,
  ) {
    const detail = zodError
      ? "\n" +
        zodError.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n")
      : "";
    super("VALIDATION_ERROR", message + detail);
    this.name = "ValidationError";
  }

  get fieldErrors(): Array<{ path: string; message: string }> | undefined {
    return this.zodError?.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  }
}

export class PmAlreadyExistsError extends PmError {
  constructor(public readonly pmDir: string) {
    super(
      "PM_ALREADY_EXISTS",
      `.pm/ directory already exists at ${pmDir}. Use 'pm status' to view the existing project.`,
    );
    this.name = "PmAlreadyExistsError";
  }
}
