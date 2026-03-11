import type { ProjectStatus } from "../schemas/index.js";
import type { EpicStatus } from "../schemas/index.js";
import type {
  StoryStatus,
  Priority,
  StoryPoints,
  ResolutionType,
} from "../schemas/index.js";

interface ConflictingAssumption {
  assumption: string;
  source_report_id: string;
}

export interface StoryNode {
  kind: "story";
  code: string;
  id: string;
  title: string;
  status: StoryStatus;
  priority: Priority;
  story_points: StoryPoints;
  description: string;
  acceptance_criteria: string[];
  resolution_type?: ResolutionType;
  conflicting_assumptions?: ConflictingAssumption[];
  source_reports?: string[];
  proposed_resolution?: string;
  undefined_concept?: string;
  referenced_in?: string[];
}

export interface EpicNode {
  kind: "epic";
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
  kind: "project";
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
  epics: EpicNode[];
  projectName: string;
}

export type FilterMode = "all" | "backlog" | "in_progress" | "done";
