import * as fs from "node:fs";
import * as path from "node:path";
import { readYaml } from "../lib/fs.js";
import { ProjectSchema, EpicSchema } from "../schemas/index.js";
import { getPmDir } from "../lib/codes.js";
import { PmError } from "../lib/errors.js";
import type { EpicNode, StoryNode, TreeData } from "./types.js";

export class NoPmDirectoryError extends PmError {
  constructor() {
    super(
      "PM_DIR_NOT_FOUND",
      "No .pm directory found. Run 'pm init' to create one, or run 'pm tui' from a project directory.",
    );
  }
}

export function loadTree(): TreeData {
  let pmDir: string;
  try {
    pmDir = getPmDir();
  } catch {
    throw new NoPmDirectoryError();
  }

  if (!fs.existsSync(pmDir)) {
    throw new NoPmDirectoryError();
  }

  const projectFile = path.join(pmDir, "project.yaml");
  if (!fs.existsSync(projectFile)) {
    throw new NoPmDirectoryError();
  }

  let project;
  try {
    project = readYaml(projectFile, ProjectSchema);
  } catch {
    throw new NoPmDirectoryError();
  }

  const epicsDir = path.join(pmDir, "epics");
  const epicFiles = fs.existsSync(epicsDir)
    ? fs
        .readdirSync(epicsDir)
        .filter((f) => /^E\d{3}-.+\.yaml$/.test(f))
        .sort()
        .map((f) => path.join(epicsDir, f))
    : [];

  const epics: EpicNode[] = [];

  for (const epicFile of epicFiles) {
    let epic;
    try {
      epic = readYaml(epicFile, EpicSchema);
    } catch {
      continue;
    }

    const stories: StoryNode[] = (epic.stories ?? []).map((s) => ({
      kind: "story" as const,
      code: s.code,
      id: s.id,
      title: s.title,
      status: s.status,
      priority: s.priority,
      story_points: s.story_points,
      description: s.description ?? "",
      acceptance_criteria: s.acceptance_criteria ?? [],
      resolution_type: s.resolution_type,
      conflicting_assumptions: s.conflicting_assumptions,
      source_reports: s.source_reports,
      proposed_resolution: s.proposed_resolution,
      undefined_concept: s.undefined_concept,
      referenced_in: s.referenced_in,
    }));

    epics.push({
      kind: "epic" as const,
      code: epic.code,
      id: epic.code,
      title: epic.title,
      status: epic.status,
      priority: epic.priority,
      description: epic.description ?? "",
      stories,
      expanded: true,
    });
  }

  return { epics, projectName: project.name };
}
