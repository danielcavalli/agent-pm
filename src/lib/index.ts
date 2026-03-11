import * as path from 'node:path';
import * as fs from 'node:fs';
import { readYaml, writeYaml, listFiles } from './fs.js';
import { ProjectSchema, EpicSchema, IndexSchema } from '../schemas/index.js';
import type { IndexProjectEntry, Index } from '../schemas/index.js';
import { getProjectsDir, listProjectCodes } from './codes.js';

/**
 * Rebuild the projects/index.yaml from the current filesystem state.
 * Called after every mutating CLI command.
 */
export function rebuildIndex(filterCode?: string): void {
  const projectsDir = getProjectsDir();
  const indexPath = path.join(projectsDir, 'index.yaml');
  const today = new Date().toISOString().slice(0, 10);

  const codes = filterCode ? [filterCode] : listProjectCodes();
  const entries: IndexProjectEntry[] = [];

  for (const code of codes) {
    const projectPath = path.join(projectsDir, code, 'project.yaml');
    if (!fs.existsSync(projectPath)) continue;

    let project;
    try {
      project = readYaml(projectPath, ProjectSchema);
    } catch {
      continue;
    }

    const epicsDir = path.join(projectsDir, code, 'epics');
    const epicFiles = listFiles(epicsDir, '.yaml');
    let storyCount = 0;
    let storiesDone = 0;

    for (const epicFile of epicFiles) {
      try {
        const epic = readYaml(epicFile, EpicSchema);
    storyCount += epic.stories?.length ?? 0;
    storiesDone += epic.stories?.filter((s) => s.status === 'done').length ?? 0;
      } catch {
        // skip unreadable epic files
      }
    }

    entries.push({
      code: project.code,
      name: project.name,
      status: project.status,
      epic_count: epicFiles.length,
      story_count: storyCount,
      stories_done: storiesDone,
      last_updated: today,
    });
  }

  // If filtering, merge with existing index
  if (filterCode) {
    let existing: Index = { projects: [] };
    try {
      existing = readYaml(indexPath, IndexSchema);
    } catch {
      // start fresh
    }
    const others = existing.projects.filter((p) => p.code !== filterCode);
    const merged = [...others, ...entries].sort((a, b) => a.code.localeCompare(b.code));
    writeYaml(indexPath, { projects: merged } as Index);
  } else {
    entries.sort((a, b) => a.code.localeCompare(b.code));
    writeYaml(indexPath, { projects: entries } as Index);
  }
}

/**
 * Read the current index.yaml or return an empty index.
 */
export function readIndex(): Index {
  const indexPath = path.join(getProjectsDir(), 'index.yaml');
  try {
    return readYaml(indexPath, IndexSchema);
  } catch {
    return { projects: [] };
  }
}
