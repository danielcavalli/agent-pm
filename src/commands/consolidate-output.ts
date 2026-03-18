import * as path from "node:path";
import * as fs from "node:fs";
import yaml from "js-yaml";
import { fileExists, readYaml, writeYaml, withLock } from "../lib/fs.js";
import { getPmDir, findEpicFile, nextStoryNumber } from "../lib/codes.js";
import type { SynthesisResult } from "./consolidate.js";
import type { ConflictPair } from "./structural-dedup.js";
import { adrCreate, nextAdrNumber, getAdrIndex } from "./adr.js";
import { EpicSchema } from "../schemas/epic.schema.js";
import type { Story, ResolutionType } from "../schemas/story.schema.js";
import { rebuildIndex } from "../lib/index.js";
import * as crypto from "node:crypto";

export interface OutputResult {
  adrsCreated: string[];
  adrsSkippedDuplicate: string[];
  tasksCreated: string[];
  tasksSkippedDuplicate: string[];
  conflictTasksCreated: string[];
  gapTasksCreated: string[];
}

/**
 * Compute a stable dedup key for an ADR candidate based on its decision content.
 * Uses a SHA-256 hash of the normalized (lowercased, trimmed) decision text.
 */
export function computeAdrDedupKey(decisionText: string): string {
  const normalized = decisionText.trim().toLowerCase();
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Compute a stable dedup key for a resolution task based on its theme/title.
 * Uses a SHA-256 hash of the normalized (lowercased, trimmed) title.
 */
export function computeTaskDedupKey(title: string): string {
  const normalized = title.trim().toLowerCase();
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Check if an ADR with the same decision content already exists.
 * Compares by dedup key (content hash) stored in tags, or by exact decision text match.
 */
export async function adrAlreadyExists(
  decisionText: string,
): Promise<boolean> {
  const dedupKey = computeAdrDedupKey(decisionText);
  const index = await getAdrIndex();

  for (const adr of index.adrs) {
    // Check dedup key in tags
    if (adr.tags?.some((t) => t === `dedup:${dedupKey}`)) {
      return true;
    }
    // Fallback: exact decision text match (for ADRs created before dedup keys)
    const normalizedExisting = adr.decision.trim().toLowerCase();
    const normalizedNew = decisionText.trim().toLowerCase();
    if (normalizedExisting === normalizedNew) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a resolution task with the same theme/title already exists
 * in any epic's stories.
 */
export function taskAlreadyExists(title: string): boolean {
  const dedupKey = computeTaskDedupKey(title);
  const pmDir = getPmDir();
  const epicsDir = path.join(pmDir, "epics");

  if (!fileExists(epicsDir)) {
    return false;
  }

  const files = fs.readdirSync(epicsDir);
  for (const file of files) {
    if (!file.endsWith(".yaml")) continue;
    const filePath = path.join(epicsDir, file);
    try {
      const epic = readYaml(filePath, EpicSchema);
      for (const story of epic.stories ?? []) {
        // Check dedup key in acceptance_criteria
        if (
          story.acceptance_criteria?.some((c) => c === `dedup:${dedupKey}`)
        ) {
          return true;
        }
        // Fallback: exact title match (normalized)
        const normalizedExisting = story.title.trim().toLowerCase();
        const normalizedNew = title.trim().toLowerCase();
        if (normalizedExisting === normalizedNew) {
          return true;
        }
      }
    } catch {
      // Skip unreadable epic files
    }
  }

  return false;
}

/**
 * Add a resolution story (conflict or gap) directly to an epic, bypassing
 * the storyAdd guard that blocks resolution_type from CLI usage.
 * This is the consolidation agent's internal mechanism for creating
 * resolution tasks with the appropriate metadata.
 */
/**
 * Map resolution_type to its enforced priority.
 * Conflict tasks are always high priority; gap tasks are always medium.
 */
export function resolveResolutionPriority(
  resolutionType: ResolutionType,
): "high" | "medium" {
  return resolutionType === "conflict" ? "high" : "medium";
}

export async function addResolutionStory(
  epicCode: string,
  options: {
    title: string;
    description: string;
    resolution_type: ResolutionType;
    priority?: "high" | "medium" | "low";
    source_reports: string[];
    acceptance_criteria: string[];
    conflicting_assumptions?: { assumption: string; source_report_id: string }[];
    proposed_resolution?: string;
    undefined_concept?: string;
    referenced_in?: string[];
  },
): Promise<string> {
  const epicFile = findEpicFile(epicCode);
  if (!epicFile) {
    throw new Error(`Epic not found: ${epicCode}`);
  }

  // Enforce priority based on resolution_type; ignore caller-supplied value.
  const enforcedPriority = resolveResolutionPriority(options.resolution_type);

  const epic = readYaml(epicFile, EpicSchema);
  const storyId = nextStoryNumber(epicFile);
  const storyCode = `${epicCode}-${storyId}`;

  const story: Story = {
    id: storyId,
    code: storyCode,
    title: options.title,
    description: options.description,
    acceptance_criteria: options.acceptance_criteria,
    status: "backlog",
    priority: enforcedPriority,
    story_points: 3,
    depends_on: [],
    notes: "",
    resolution_type: options.resolution_type,
    source_reports: options.source_reports,
    ...(options.conflicting_assumptions
      ? { conflicting_assumptions: options.conflicting_assumptions }
      : {}),
    ...(options.proposed_resolution
      ? { proposed_resolution: options.proposed_resolution }
      : {}),
    ...(options.undefined_concept
      ? { undefined_concept: options.undefined_concept }
      : {}),
    ...(options.referenced_in
      ? { referenced_in: options.referenced_in }
      : {}),
  };

  const updatedEpic = {
    ...epic,
    stories: [...(epic.stories ?? []), story],
  };

  await withLock(epicFile, () => {
    writeYaml(epicFile, updatedEpic);
  });

  rebuildIndex();

  return storyCode;
}

export async function routeOutput(
  projectCode: string,
  synthesisResult: SynthesisResult,
  clusteringResult: {
    clusters: {
      id: string;
      theme: string;
      synthesis: string;
      recommendation: string;
      items: { reportId: string }[];
    }[];
  },
  conflicts?: ConflictPair[],
): Promise<OutputResult> {
  const result: OutputResult = {
    adrsCreated: [],
    adrsSkippedDuplicate: [],
    tasksCreated: [],
    tasksSkippedDuplicate: [],
    conflictTasksCreated: [],
    gapTasksCreated: [],
  };

  const confirmedDecisions = synthesisResult.candidates.filter(
    (c) => c.type === "confirmed_decision",
  );

  for (const decision of confirmedDecisions) {
    try {
      const decisionText = decision.content;

      // Deduplication: skip if an ADR with the same decision already exists
      if (await adrAlreadyExists(decisionText)) {
        const title = decisionText.substring(0, 60);
        result.adrsSkippedDuplicate.push(title);
        continue;
      }

      const adrId = await nextAdrNumber();
      const title = decisionText.substring(0, 60);
      const context =
        "Consolidated from execution reports: " +
        decision.sourceReportIds.join(", ");
      const dedupKey = computeAdrDedupKey(decisionText);

      await adrCreate({
        projectCode,
        title,
        status: "proposed",
        context,
        decision: decisionText,
        positiveConsequences: ["Consolidated from multiple execution reports"],
        negativeConsequences: [],
        authorType: "agent",
        authorId: "consolidation-agent",
        tags: ["consolidated", "auto-generated", `dedup:${dedupKey}`],
      });

      result.adrsCreated.push(adrId);
    } catch (err) {
      process.stderr.write(
        `[pm consolidate-output] ADR creation failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // ── Create conflict resolution tasks ──────────────────────────────────
  if (conflicts && conflicts.length > 0) {
    for (const conflict of conflicts) {
      try {
        const conflictTitle = `Resolve conflict: ${conflict.reason.substring(0, 80)}`;

        // Deduplication: skip if a task with the same title already exists
        if (taskAlreadyExists(conflictTitle)) {
          result.tasksSkippedDuplicate.push(conflictTitle);
          continue;
        }

        const backlogEpic = findBacklogEpic();
        if (backlogEpic) {
          const sourceReports = [
            ...new Set([conflict.itemA.reportId, conflict.itemB.reportId]),
          ];
          const dedupKey = computeTaskDedupKey(conflictTitle);

          const storyCode = await addResolutionStory(backlogEpic, {
            title: conflictTitle,
            description: `Contradicting decisions detected during consolidation: ${conflict.reason}`,
            resolution_type: "conflict",
            priority: "high",
            source_reports: sourceReports,
            acceptance_criteria: [
              `Resolve contradiction between: "${conflict.itemA.text}" and "${conflict.itemB.text}"`,
              `dedup:${dedupKey}`,
            ],
            conflicting_assumptions: [
              {
                assumption: conflict.itemA.text,
                source_report_id: conflict.itemA.reportId,
              },
              {
                assumption: conflict.itemB.text,
                source_report_id: conflict.itemB.reportId,
              },
            ],
          });
          result.conflictTasksCreated.push(storyCode);
        }
      } catch (err) {
        process.stderr.write(
          `[pm consolidate-output] conflict task creation failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  // ── Create gap resolution tasks from clustering ───────────────────────
  const taskClusters = clusteringResult.clusters.filter(
    (c) => c.recommendation === "create_task",
  );

  for (const cluster of taskClusters) {
    try {
      // Deduplication: skip if a task with the same title already exists
      if (taskAlreadyExists(cluster.theme)) {
        result.tasksSkippedDuplicate.push(cluster.theme);
        continue;
      }

      const backlogEpic = findBacklogEpic();
      if (backlogEpic) {
        const dedupKey = computeTaskDedupKey(cluster.theme);
        const sourceReports = [
          ...new Set(cluster.items.map((i) => i.reportId)),
        ];

        const storyCode = await addResolutionStory(backlogEpic, {
          title: cluster.theme,
          description: cluster.synthesis,
          resolution_type: "gap",
          priority: "medium",
          source_reports: sourceReports,
          acceptance_criteria: [
            ...cluster.items.map((i) => "Source: " + i.reportId),
            `dedup:${dedupKey}`,
          ],
        });
        result.gapTasksCreated.push(storyCode);
        result.tasksCreated.push(cluster.theme);
      }
    } catch (err) {
      process.stderr.write(
        `[pm consolidate-output] gap task creation failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  return result;
}

function findBacklogEpic(): string | null {
  const pmDir = getPmDir();
  const epicsDir = path.join(pmDir, "epics");

  if (!fileExists(epicsDir)) {
    return null;
  }

  const files = fs.readdirSync(epicsDir);

  for (const file of files) {
    if (file.endsWith(".yaml")) {
      const filePath = path.join(epicsDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const epic = yaml.load(content) as { code?: string; status?: string };
        if (epic?.status === "backlog") {
          return epic?.code || null;
        }
      } catch (err) {
        process.stderr.write(
          `[pm consolidate-output] failed to read epic file ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  return null;
}
