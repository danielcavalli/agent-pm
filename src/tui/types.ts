import type { ProjectStatus } from "../schemas/index.js";
import type { EpicStatus } from "../schemas/index.js";
import type {
  StoryStatus,
  Priority,
  StoryPoints,
  ResolutionType,
} from "../schemas/index.js";
import type { RecentExperimentResult } from "../lib/swarm-store.js";

export interface ExplorationCoverageDimension {
  name: string;
  count: number;
}

export interface ExplorationCoverageSection {
  key: "runtime" | "board";
  label: string;
  dimensions: ExplorationCoverageDimension[];
}

interface ConflictingAssumption {
  assumption: string;
  source_report_id: string;
}

export interface StoryNode {
  kind: "story";
  epic_code: string;
  code: string;
  id: string;
  title: string;
  status: StoryStatus;
  priority: Priority;
  story_points: StoryPoints;
  description: string;
  acceptance_criteria: string[];
  depends_on: string[];
  notes: string;
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
  created_at: string;
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
  storyLinkTemplate?: string;
}

export interface SwarmStatusData {
  trend: string;
  trendColor: string;
  experimentCount: number;
  bestScore: number | null;
  activeClaims: number;
  explorationCoverage: ExplorationCoverageSection[];
  recentResults: Array<{
    experimentId: string;
    decision: RecentExperimentResult["decision"];
    score: number;
    description: string;
  }>;
  activeExperimentClaims: Array<{
    agentId: string;
    claimedAt: string;
    mutationType: "runtime_config" | "board_mutation";
  }>;
}

export type FilterMode = "all" | "backlog" | "in_progress" | "done";

export type FocusedPanel = "tree" | "detail" | "sidebar";
