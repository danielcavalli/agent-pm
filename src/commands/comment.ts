import * as path from "node:path";
import * as fs from "node:fs";
import chalk from "chalk";
import { readYaml, writeYaml } from "../lib/fs.js";
import { getPmDir, findEpicFile } from "../lib/codes.js";
import { ValidationError, YamlNotFoundError } from "../lib/errors.js";
import { EpicSchema, Epic } from "../schemas/epic.schema.js";
import {
  CommentIndexSchema,
  CrossTaskCommentSchema,
  CommentTypeSchema,
  type CrossTaskComment,
} from "../schemas/comment.schema.js";

const TARGETABLE_STATUSES = ["backlog", "in_progress", "done"];

function isTargetable(status: string): boolean {
  return TARGETABLE_STATUSES.includes(status);
}

function findTaskInEpic(
  epic: Epic,
  targetTaskId: string,
): { type: "epic" | "story"; status: string } | null {
  if (epic.code === targetTaskId) {
    return { type: "epic", status: epic.status };
  }
  const story = epic.stories?.find((s) => s.code === targetTaskId);
  if (story) {
    return { type: "story", status: story.status };
  }
  return null;
}

function parseTargetTaskId(
  targetTaskId: string,
): { projectCode: string; taskCode: string } | null {
  const match = targetTaskId.match(/^([A-Z]{2,6})-(E\d{3})(?:-S\d{3})?$/);
  if (!match) return null;
  return {
    projectCode: match[1],
    taskCode: match[2],
  };
}

function getNextCommentNumber(): string {
  const commentsDir = path.join(getPmDir(), "comments");
  if (!fs.existsSync(commentsDir)) {
    return "C000001";
  }
  const files = fs
    .readdirSync(commentsDir)
    .filter((f) => /^C\d{6}-.+\.yaml$/.test(f));
  const numbers = files
    .map((f) => {
      const m = f.match(/^C(\d{6})/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const next = numbers.length > 0 ? (numbers[numbers.length - 1] ?? 0) + 1 : 1;
  return `C${String(next).padStart(6, "0")}`;
}

export async function commentAdd(
  options: Record<string, unknown>,
): Promise<void> {
  const targetTaskId = options.target as string;
  const commentType = options.type as string;
  const content = options.content as string;
  const tags = (options.tags as string[]) ?? [];
  const authorName = options.author as string;
  const authorId = options.authorId as string;

  if (!targetTaskId) {
    throw new ValidationError("Missing required option: --target");
  }
  if (!commentType) {
    throw new ValidationError("Missing required option: --type");
  }
  if (!content) {
    throw new ValidationError("Missing required option: --content");
  }

  const parsedType = CommentTypeSchema.safeParse(commentType);
  if (!parsedType.success) {
    throw new ValidationError(
      `Invalid comment_type: must be one of 'agent' or 'human'`,
    );
  }

  const taskInfo = parseTargetTaskId(targetTaskId);
  if (!taskInfo) {
    throw new ValidationError(
      `Invalid target task ID: ${targetTaskId}. Must match PROJECT-ENNN or PROJECT-ENNN-SNNN`,
    );
  }

  const { taskCode } = taskInfo;
  const epicCode = `${taskInfo.projectCode}-${taskCode}`;
  const epicFile = findEpicFile(epicCode);

  if (!epicFile) {
    throw new ValidationError(`Target task not found: ${targetTaskId}`);
  }

  let epic: Epic;
  try {
    epic = readYaml(epicFile, EpicSchema);
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      throw new ValidationError(`Target task not found: ${targetTaskId}`);
    }
    throw err;
  }

  const task = findTaskInEpic(epic, targetTaskId);
  if (!task) {
    throw new ValidationError(`Target task not found: ${targetTaskId}`);
  }

  if (!isTargetable(task.status)) {
    throw new ValidationError(
      `Cannot add comment to task in '${task.status}' state. Tasks must be in one of: ${TARGETABLE_STATUSES.join(", ")}`,
    );
  }

  const pmDir = getPmDir();
  const commentsDir = path.join(pmDir, "comments");
  fs.mkdirSync(commentsDir, { recursive: true });

  const commentId = getNextCommentNumber();
  const now = new Date().toISOString();

  const author =
    authorId && authorId.length > 0
      ? { type: "agent" as const, agent_id: authorId }
      : { type: "human" as const, name: authorName || "anonymous" };

  const comment: CrossTaskComment = {
    id: commentId,
    target_task_id: targetTaskId,
    comment_type: commentType as "agent" | "human",
    content,
    author,
    timestamp: now,
    tags,
    consolidated: false,
    consumed_by: [],
    references: [],
    created_at: now,
    updated_at: now,
  };

  const commentFileName = `${commentId}-${content.slice(0, 30).replace(/[^a-z0-9]/gi, "-")}.yaml`;
  const commentFilePath = path.join(commentsDir, commentFileName);
  writeYaml(commentFilePath, comment);

  const indexPath = path.join(commentsDir, "index.yaml");
  type CommentIndexEntry = {
    comment_id: string;
    task_reference: string;
    created_at: string;
  };
  let index: {
    comments: CrossTaskComment[];
    by_task: Record<string, CommentIndexEntry[]>;
    last_updated: string;
  };
  try {
    index = readYaml(indexPath, CommentIndexSchema);
  } catch {
    index = { comments: [], by_task: {}, last_updated: now };
  }

  index.comments.push(comment);
  index.last_updated = now;

  if (!index.by_task[targetTaskId]) {
    index.by_task[targetTaskId] = [];
  }
  index.by_task[targetTaskId]!.push({
    comment_id: commentId,
    task_reference: targetTaskId,
    created_at: now,
  });

  writeYaml(indexPath, index);

  console.log(chalk.green(`Comment ${commentId} added to ${targetTaskId}`));
}

export async function commentList(
  options: Record<string, unknown>,
): Promise<void> {
  const taskFilter = options.task as string | undefined;
  const typeFilter = options.type as string | undefined;
  const authorFilter = options.author as string | undefined;

  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "comments", "index.yaml");

  let index;
  try {
    index = readYaml(indexPath, CommentIndexSchema);
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      console.log(chalk.yellow("No comments found"));
      return;
    }
    throw err;
  }

  let comments = index.comments ?? [];

  if (taskFilter) {
    comments = comments.filter((c) => c.target_task_id === taskFilter);
  }

  if (typeFilter) {
    const parsedType = CommentTypeSchema.safeParse(typeFilter);
    if (!parsedType.success) {
      throw new ValidationError(
        `Invalid comment_type filter: must be 'agent' or 'human'`,
      );
    }
    comments = comments.filter((c) => c.comment_type === typeFilter);
  }

  if (authorFilter) {
    comments = comments.filter((c) => {
      if (c.author.type === "agent") {
        return c.author.agent_id === authorFilter;
      }
      return c.author.name === authorFilter;
    });
  }

  if (comments.length === 0) {
    console.log(chalk.yellow("No comments match the filter"));
    return;
  }

  for (const comment of comments) {
    const authorStr =
      comment.author.type === "agent"
        ? `agent:${comment.author.agent_id}`
        : comment.author.name;
    console.log(chalk.bold(`[${comment.id}]`));
    console.log(
      `  Type: ${comment.comment_type} | Author: ${authorStr} | Target: ${comment.target_task_id}`,
    );
    console.log(`  ${comment.timestamp}`);
    console.log(`  ${comment.content}`);
    if (comment.tags && comment.tags.length > 0) {
      console.log(`  Tags: ${comment.tags.join(", ")}`);
    }
    console.log();
  }
}
