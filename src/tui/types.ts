import type { ProjectStatus } from '../schemas/index.js';
import type { EpicStatus } from '../schemas/index.js';
import type { StoryStatus, Priority, StoryPoints } from '../schemas/index.js';

export interface StoryNode {
  kind: 'story';
  code: string;
  id: string;
  title: string;
  status: StoryStatus;
  priority: Priority;
  story_points: StoryPoints;
  description: string;
  acceptance_criteria: string[];
}

export interface EpicNode {
  kind: 'epic';
  code: string;
  id: string;
  title: string;
  status: EpicStatus;
  priority: Priority;
  description: string;
  stories: StoryNode[];
  expanded: boolean;
}

export interface ProjectNode {
  kind: 'project';
  code: string;
  name: string;
  status: ProjectStatus;
  description: string;
  vision: string;
  tech_stack: string[];
  epics: EpicNode[];
  expanded: boolean;
}

export type TreeNode = ProjectNode | EpicNode | StoryNode;

export interface TreeData {
  projects: ProjectNode[];
}

export type FilterMode = 'all' | 'backlog' | 'in_progress' | 'done';
