import chalk from 'chalk';
import { EpicSchema } from '../schemas/index.js';
import { readYaml, listFiles } from '../lib/fs.js';
import { getProjectsDir, findEpicFile } from '../lib/codes.js';
import { ProjectNotFoundError, EpicNotFoundError } from '../lib/errors.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface PrioritizeOptions {
  epic?: string;
  strategy?: string;
}

export async function prioritize(
  projectCode: string,
  options: Record<string, unknown>,
): Promise<void> {
  const opts = options as PrioritizeOptions;
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, projectCode);

  if (!fs.existsSync(projectDir)) {
    throw new ProjectNotFoundError(projectCode);
  }

  const strategy = opts.strategy ?? '(no strategy provided)';

  const STATUS_ICON: Record<string, string> = {
    backlog: '○',
    in_progress: '●',
    done: '✓',
    cancelled: '✗',
  };

  // If a specific epic is targeted
  if (opts.epic) {
    const epicCode = opts.epic.includes('-') ? opts.epic : `${projectCode}-${opts.epic}`;
    const epicFile = findEpicFile(epicCode);
    if (!epicFile) {
      throw new EpicNotFoundError(epicCode);
    }

    const epic = readYaml(epicFile, EpicSchema);
    const stories = epic.stories ?? [];

    console.log('');
    console.log(chalk.cyan.bold('━'.repeat(72)));
    console.log(chalk.cyan.bold('  PRIORITIZATION CONTEXT'));
    console.log(chalk.cyan.bold('━'.repeat(72)));
    console.log('');
    console.log(chalk.bold('  Epic:     ') + epicCode + chalk.dim(' — ') + epic.title);
    console.log(chalk.bold('  Strategy: ') + strategy);
    console.log('');
    console.log(chalk.bold('  Current Story Order:'));
    console.log('');

    const backlog = stories.filter((s) => s.status === 'backlog');
    const inProgress = stories.filter((s) => s.status === 'in_progress');
    const done = stories.filter((s) => s.status === 'done');
    const cancelled = stories.filter((s) => s.status === 'cancelled');

    if (inProgress.length > 0) {
      console.log(chalk.yellow('  In Progress:'));
      inProgress.forEach((s, i) => {
        console.log(`    ${i + 1}. ${chalk.yellow(STATUS_ICON['in_progress'] ?? '●')} ${chalk.bold(s.code)} — ${s.title} [${s.priority}] (${s.story_points}pts)`);
      });
      console.log('');
    }

    if (backlog.length > 0) {
      console.log(chalk.bold('  Backlog (current order):'));
      backlog.forEach((s, i) => {
        console.log(`    ${i + 1}. ${chalk.dim(STATUS_ICON['backlog'] ?? '○')} ${chalk.bold(s.code)} — ${s.title} [${s.priority}] (${s.story_points}pts)`);
      });
      console.log('');
    }

    if (done.length > 0) {
      console.log(chalk.dim(`  Done: ${done.length} stories`));
      console.log('');
    }

    if (cancelled.length > 0) {
      console.log(chalk.dim(`  Cancelled: ${cancelled.length} stories`));
      console.log('');
    }

    console.log(chalk.cyan.bold('━'.repeat(72)));
    console.log(chalk.bold('\n  AGENT PROMPT'));
    console.log(chalk.dim('  ─────────────────────────────────────────────────────\n'));
    console.log(`  You are re-prioritizing stories in epic ${epicCode} (${epic.title}).`);
    console.log(`  Strategy: "${strategy}"`);
    console.log('');
    console.log('  Re-order the backlog stories in the epic YAML file by:');
    console.log('    1. Updating the `priority` field of each story (high/medium/low)');
    console.log('    2. Reordering the stories array so high-priority items appear first');
    console.log('    3. Keeping in_progress/done/cancelled stories in place');
    console.log('');
    console.log('  After re-ordering, explain your reasoning for the new order.');
    console.log(chalk.cyan.bold('━'.repeat(72)));
    console.log('');
    return;
  }

  // Project-level: show all epics with their backlog stories
  const epicsDir = path.join(projectDir, 'epics');
  const epicFiles = listFiles(epicsDir, '.yaml').sort();

  if (epicFiles.length === 0) {
    console.log(chalk.dim('No epics found for project ') + chalk.bold(projectCode));
    return;
  }

  console.log('');
  console.log(chalk.cyan.bold('━'.repeat(72)));
  console.log(chalk.cyan.bold('  PRIORITIZATION CONTEXT'));
  console.log(chalk.cyan.bold('━'.repeat(72)));
  console.log('');
  console.log(chalk.bold('  Project:  ') + projectCode);
  console.log(chalk.bold('  Strategy: ') + strategy);
  console.log('');
  console.log(chalk.bold('  Backlog Stories by Epic:'));
  console.log('');

  for (const epicFile of epicFiles) {
    try {
      const epic = readYaml(epicFile, EpicSchema);
      const backlog = (epic.stories ?? []).filter((s) => s.status === 'backlog');
      if (backlog.length === 0) continue;

      console.log(`  ${chalk.bold(epic.code)} — ${epic.title} [${epic.priority}]`);
      backlog.forEach((s, i) => {
        console.log(`    ${i + 1}. ${chalk.dim('○')} ${chalk.bold(s.code)} — ${s.title} [${s.priority}] (${s.story_points}pts)`);
      });
      console.log('');
    } catch {
      // skip
    }
  }

  console.log(chalk.cyan.bold('━'.repeat(72)));
  console.log(chalk.bold('\n  AGENT PROMPT'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────────\n'));
  console.log(`  You are re-prioritizing the backlog for project ${projectCode}.`);
  console.log(`  Strategy: "${strategy}"`);
  console.log('');
  console.log('  Re-order and re-prioritize by:');
  console.log('    1. Updating `priority` fields on stories and epics in the YAML files');
  console.log('    2. Reordering story arrays within each epic (high priority first)');
  console.log('    3. Explaining your rationale for the new order');
  console.log(chalk.cyan.bold('━'.repeat(72)));
  console.log('');
}
