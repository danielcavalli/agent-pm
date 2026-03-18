import * as path from "node:path";
import * as fs from "node:fs";
import { readYaml, writeYaml, listFiles } from "./fs.js";
import { ProjectSchema, EpicSchema, IndexSchema } from "../schemas/index.js";
import type { Index } from "../schemas/index.js";
import { getPmDir, getProjectCode } from "./codes.js";

export { getProjectCode };

function buildIndexEntry(pmDir: string): Index | null {
  const projectYaml = path.join(pmDir, "project.yaml");
  if (!fs.existsSync(projectYaml)) return null;

  let project;
  try {
    project = readYaml(projectYaml, ProjectSchema);
  } catch {
    return null;
  }

  const epicsDir = path.join(pmDir, "epics");
  const epicFiles = listFiles(epicsDir, ".yaml");
  let storyCount = 0;
  let storiesDone = 0;

  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      const activeStories =
        epic.stories?.filter((s) => s.status !== "cancelled") ?? [];
      storyCount += activeStories.length;
      storiesDone += activeStories.filter((s) => s.status === "done").length;
    } catch {
      // skip unreadable epic files
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    epic_count: epicFiles.length,
    story_count: storyCount,
    stories_done: storiesDone,
    last_updated: today,
  };
}

export function rebuildIndex(_filterCode?: string): void {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "index.yaml");

  const entry = buildIndexEntry(pmDir);
  if (entry) {
    writeYaml(indexPath, entry);
  }
}

export function readIndex(): Index | null {
  const indexPath = path.join(getPmDir(), "index.yaml");
  try {
    return readYaml(indexPath, IndexSchema);
  } catch {
    return null;
  }
}
