// Central export for all schemas and types
export {
  ProjectSchema,
  ProjectStatusSchema,
  ProjectCodeSchema,
  ProjectArchitectureSchema,
} from './project.schema.js';
export type { Project, ProjectStatus, ProjectArchitecture } from './project.schema.js';

export {
  EpicSchema,
  EpicStatusSchema,
  EpicIdSchema,
  EpicCodeSchema,
} from './epic.schema.js';
export type { Epic, EpicStatus } from './epic.schema.js';

export {
  StorySchema,
  StoryStatusSchema,
  StoryCodeSchema,
  StoryPointsSchema,
  PrioritySchema,
} from './story.schema.js';
export type { Story, StoryStatus, StoryPoints, Priority } from './story.schema.js';

// Index schema
import { z } from 'zod';

export const IndexProjectEntrySchema = z.object({
  code: z.string(),
  name: z.string(),
  status: z.string(),
  epic_count: z.number().int().nonnegative(),
  story_count: z.number().int().nonnegative(),
  stories_done: z.number().int().nonnegative(),
  last_updated: z.string(),
});
export type IndexProjectEntry = z.infer<typeof IndexProjectEntrySchema>;

export const IndexSchema = z.object({
  projects: z.array(IndexProjectEntrySchema).default([]),
});
export type Index = z.infer<typeof IndexSchema>;
