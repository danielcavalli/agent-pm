// Central export for all schemas and types
export {
  ProjectSchema,
  ProjectStatusSchema,
  ProjectCodeSchema,
  ProjectArchitectureSchema,
  ConsolidationConfigSchema,
  GcConfigSchema,
  DEFAULT_GC_CONFIG,
  TriggerModeSchema,
} from "./project.schema.js";
export type {
  Project,
  ProjectStatus,
  ProjectArchitecture,
  ConsolidationConfig,
  GcConfig,
  TriggerMode,
} from "./project.schema.js";

export {
  EpicSchema,
  EpicStatusSchema,
  EpicIdSchema,
  EpicCodeSchema,
} from "./epic.schema.js";
export type { Epic, EpicStatus } from "./epic.schema.js";

export {
  StorySchema,
  StoryStatusSchema,
  StoryCodeSchema,
  StoryPointsSchema,
  PrioritySchema,
  ResolutionTypeSchema,
} from "./story.schema.js";
export type {
  Story,
  StoryStatus,
  StoryPoints,
  Priority,
  ResolutionType,
} from "./story.schema.js";

export {
  ReportSchema,
  ReportStatusSchema,
  ReportIdSchema,
  ReportCodeSchema,
  ReportListSchema,
} from "./report.schema.js";
export type { Report, ReportStatus, ReportList } from "./report.schema.js";

export {
  CrossTaskCommentSchema,
  TaskReferenceSchema,
  CommentTypeSchema,
  CommentAuthorSchema,
  CommentIndexSchema,
  CommentIndexEntrySchema,
} from "./comment.schema.js";
export type {
  CrossTaskComment,
  CommentType,
  CommentAuthor,
  CommentIndex,
  CommentIndexEntry,
} from "./comment.schema.js";

export {
  ExecutionReportSchema,
  ExecutionStatusSchema,
  ExecutionResultSchema,
  ExecutionIdSchema,
  ExecutionIndexSchema,
  ExecutionIndexEntrySchema,
} from "./execution.schema.js";
export type {
  ExecutionReport,
  ExecutionStatus,
  ExecutionResult,
  ExecutionIndex,
  ExecutionIndexEntry,
} from "./execution.schema.js";

export {
  AgentExecutionReportSchema,
  ExecutionReportStatusSchema,
  ItemTypeSchema,
  DecisionItemSchema,
  AssumptionItemSchema,
  TradeoffItemSchema,
  OutOfScopeItemSchema,
  PotentialConflictItemSchema,
  AGENT_REPORT_SCHEMA_SPEC,
} from "./agent-report.schema.js";
export type {
  AgentExecutionReport,
  ExecutionReportStatus,
  ItemType,
  DecisionItem,
  AssumptionItem,
  TradeoffItem,
  OutOfScopeItem,
  PotentialConflictItem,
} from "./agent-report.schema.js";

export {
  ADRSchema,
  ADRStatusSchema,
  ADRAuthorSchema,
  ADRSupersessionSchema,
  ADRReferenceSchema,
  ADRIndexSchema,
  ADRIndexEntrySchema,
} from "./adr.schema.js";
export type {
  ADR,
  ADRStatus,
  ADRAuthor,
  ADRSupersession,
  ADRReference,
  ADRIndex,
  ADRIndexEntry,
} from "./adr.schema.js";

export {
  AgentStateSchema,
  AgentStatusSchema,
  AgentResponseSchema,
  EscalationSchema,
  EscalationTypeSchema,
} from "./agent-state.schema.js";
export type {
  AgentState,
  AgentStatus,
  AgentResponse,
  Escalation,
  EscalationType,
} from "./agent-state.schema.js";

// Index schema (single-project)
import { z } from "zod";

export const IndexSchema = z.object({
  code: z.string(),
  name: z.string(),
  status: z.string(),
  epic_count: z.number().int().nonnegative(),
  story_count: z.number().int().nonnegative(),
  stories_done: z.number().int().nonnegative(),
  last_updated: z.string(),
});
export type Index = z.infer<typeof IndexSchema>;
