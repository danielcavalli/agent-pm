import * as fs from "node:fs";
import * as path from "node:path";
import { readYaml } from "../lib/fs.js";
import { ProjectSchema, EpicSchema } from "../schemas/index.js";
import { getProjectsDir } from "../lib/codes.js";
import type { ProjectNode, EpicNode, StoryNode, TreeData } from "./types.js";

export function loadTree(): TreeData {
  const projectsDir = getProjectsDir();
  if (!fs.existsSync(projectsDir)) return { projects: [] };

  const entries = fs.readdirSync(projectsDir).filter((name) => {
    if (name === "index.yaml") return false;
    return fs.statSync(path.join(projectsDir, name)).isDirectory();
  });

  const projects: ProjectNode[] = [];

  for (const code of entries) {
    const projectFile = path.join(projectsDir, code, "project.yaml");
    if (!fs.existsSync(projectFile)) continue;

    let project;
    try {
      project = readYaml(projectFile, ProjectSchema);
    } catch {
      continue;
    }

    const epicsDir = path.join(projectsDir, code, "epics");
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

    projects.push({
      kind: "project" as const,
      code: project.code,
      name: project.name,
      status: project.status,
      description: project.description ?? "",
      vision: project.vision ?? "",
      tech_stack: project.tech_stack ?? [],
      epics,
      expanded: true,
    });
  }

  return { projects };
}
