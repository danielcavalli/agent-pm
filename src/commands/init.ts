import * as path from 'node:path';
import * as fs from 'node:fs';
import chalk from 'chalk';
import { ProjectCodeSchema } from '../schemas/index.js';
import type { Project } from '../schemas/index.js';
import { writeYaml } from '../lib/fs.js';
import { isProjectCodeTaken, getProjectsDir } from '../lib/codes.js';
import { DuplicateProjectCodeError, ValidationError } from '../lib/errors.js';
import { rebuildIndex } from '../lib/index.js';

interface InitOptions {
  name: string;
  code: string;
  description?: string;
  vision?: string;
  techStack?: string[];
  architecture?: string;
}

export async function init(options: Record<string, unknown>): Promise<void> {
  const opts = options as unknown as InitOptions;
  const { name, code } = opts;

  // Validate code format
  const codeResult = ProjectCodeSchema.safeParse(code);
  if (!codeResult.success) {
    throw new ValidationError(
      `Invalid project code '${code}': ${codeResult.error.issues[0]?.message ?? 'invalid format'}`,
    );
  }

  const upperCode = codeResult.data;

  // Check for duplicates
  if (isProjectCodeTaken(upperCode)) {
    throw new DuplicateProjectCodeError(upperCode);
  }

  const today = new Date().toISOString().slice(0, 10);
  const techStack: string[] = Array.isArray(opts.techStack) ? opts.techStack : [];

  // Build architecture object if pattern provided
  const architecturePattern = opts.architecture ?? '';

  const project: Project = {
    code: upperCode,
    name,
    description: opts.description ?? '',
    vision: opts.vision ?? '',
    status: 'active',
    created_at: today,
    tech_stack: techStack,
    architecture: architecturePattern
      ? {
          pattern: architecturePattern,
          storage: 'yaml-files',
          primary_interface: 'cli',
        }
      : undefined,
    notes: '',
  };

  // Create directory structure
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, upperCode);
  const epicsDir = path.join(projectDir, 'epics');

  fs.mkdirSync(epicsDir, { recursive: true });

  // Write project.yaml
  const projectYaml = path.join(projectDir, 'project.yaml');
  writeYaml(projectYaml, project);

  // Rebuild index
  rebuildIndex();

  console.log(chalk.green('✓') + ' Project created: ' + chalk.bold(upperCode));
  console.log(chalk.dim('  Path: ') + projectYaml);
  console.log(chalk.dim('  Name: ') + name);
  console.log(chalk.dim('  Status: ') + 'active');
  if (techStack.length > 0) {
    console.log(chalk.dim('  Tech Stack: ') + techStack.join(', '));
  }
}
