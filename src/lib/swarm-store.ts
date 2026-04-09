import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as childProcess from "node:child_process";
import * as yaml from "js-yaml";
import { z } from "zod";
import {
  AgentStateSchema,
  AgentResponseSchema,
  BestMetadataSchema,
  ClaimSchema,
  ExperimentResultSchema,
  ExperimentResultOutputSchema,
  HypothesisSchema,
  InsightSchema,
  IndexSchema,
  NormalizationStatsSchema,
  ObservationRecordSchema,
  StoryResultSchema,
  StrategySchema,
  TacticsSchema,
  EpicSchema,
} from "../schemas/index.js";
import type {
  AgentState,
  BestMetadata,
  Claim,
  ExperimentResult,
  ExperimentResultOutput,
  Hypothesis,
  HypothesisStatus,
  Insight,
  NormalizationStats,
  ObservationRecord,
  StoryResult,
  Tactics,
} from "../schemas/index.js";
import { toKebabSlug } from "./codes.js";
import {
  ValidationError,
  YamlNotFoundError,
  ZodValidationError,
} from "./errors.js";
import { listFiles, readYaml, withLock, writeYaml } from "./fs.js";

export interface SwarmStore {
  read(namespace: string, key: string): Promise<Record<string, unknown> | null>;
  write(
    namespace: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  list(namespace: string): Promise<string[]>;
  delete(namespace: string, key: string): Promise<void>;
  search(
    namespace: string,
    query: string,
    threshold: number,
  ): Promise<Array<{ key: string; score: number }>>;
  claim(
    namespace: string,
    key: string,
    agentId: string,
    ttlSeconds: number,
  ): Promise<ClaimAcquisitionResult>;
  releaseClaim(namespace: string, key: string, agentId: string): Promise<void>;
  listActiveClaims(namespace: string): Promise<
    Array<{
      key: string;
      agentId: string;
      expiresAt: string;
      claimedAt: string;
      mutationType: Claim["type"];
    }>
  >;
}

export type ClaimAcquisitionData = Omit<
  Claim,
  "agent_id" | "claimed_at" | "status"
>;

export type ClaimAcquisitionResult =
  | { acquired: true; claimKey: string }
  | { acquired: false; reason: string; soloMode?: true };

interface ClaimAcquisitionOptions {
  waitMs?: number;
}

const RootNamespaceSchemas = {
  tactics: TacticsSchema,
  strategy: StrategySchema,
} satisfies Record<string, z.ZodTypeAny>;

const NestedNamespaceSchemas = {
  observations: ObservationRecordSchema,
  claims: ClaimSchema,
  results: ExperimentResultSchema,
  hypotheses: HypothesisSchema,
  insights: InsightSchema,
} satisfies Record<string, z.ZodTypeAny>;

const GenericRecordSchema = z.record(z.string(), z.unknown());
const WEIGHT_SUM_TARGET = 1;
const WEIGHT_SUM_TOLERANCE = 0.001;
const CLAIM_LEVENSHTEIN_THRESHOLD = 0.85;
const CLAIM_JACCARD_THRESHOLD = 0.7;
const CLAIM_VERIFY_WAIT_MS = 2_000;
const CLAIM_SOLO_MODE_FAILURE_THRESHOLD = 5;
const claimAcquisitionFailures = new Map<string, number>();
export const EWMA_ALPHA = 0.15;
const NORMALIZATION_PHASE_ONE_COUNT = 10;
const DEFAULT_HEARTBEAT_FREQUENCY_SECONDS = 15;
const DEFAULT_HEARTBEAT_STALE_THRESHOLD_SECONDS = 60;
const MAX_BEST_IMPROVEMENT = 0.3;
const BEST_UPDATE_MAX_ATTEMPTS = 2;

type DuplicateCheckClaim = Pick<
  Claim,
  "type" | "description" | "parameter_path" | "new_value"
> & {
  change_description?: string;
};

function getDefaultTacticsTemplatePath(): string {
  return new URL(
    "../../docs/templates/swarm-default-tactics.yaml",
    import.meta.url,
  ).pathname;
}

function validateWeightSum(
  weights: number[],
  label: string,
  filePath: string,
): void {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (Math.abs(sum - WEIGHT_SUM_TARGET) <= WEIGHT_SUM_TOLERANCE) {
    return;
  }

  throw new ValidationError(
    `${label} weights in ${filePath} must sum to 1.0 within ${WEIGHT_SUM_TOLERANCE}; got ${sum.toFixed(3)}`,
  );
}

function validateTacticsConfig(tactics: Tactics, filePath: string): void {
  validateWeightSum(
    tactics.tactics.map((tactic) => tactic.weight),
    "Tactic",
    filePath,
  );

  for (const [profileName, weights] of Object.entries(tactics.profiles)) {
    validateWeightSum(
      Object.values(weights),
      `Profile \"${profileName}\"`,
      filePath,
    );
  }
}

function applyProfileWeights(
  tactics: Tactics,
  profileName: string,
  filePath: string,
): Tactics {
  const profile = tactics.profiles[profileName];
  if (!profile) {
    const availableProfiles = Object.keys(tactics.profiles).sort();
    const formattedProfiles =
      availableProfiles.length > 0 ? availableProfiles.join(", ") : "none";
    throw new ValidationError(
      `Profile \"${profileName}\" not found in ${filePath}. Available profiles: ${formattedProfiles}`,
    );
  }

  const profiledTactics = {
    ...tactics,
    tactics: tactics.tactics.map((tactic) => ({
      ...tactic,
      weight:
        profile[tactic.name] !== undefined
          ? profile[tactic.name]
          : tactic.weight,
    })),
  };

  validateWeightSum(
    profiledTactics.tactics.map((tactic) => tactic.weight),
    `Profile \"${profileName}\"`,
    filePath,
  );

  return profiledTactics;
}

export function loadTactics(pmDir: string, profileName?: string): Tactics {
  const tacticsPath = path.join(pmDir, "swarm", "tactics.yaml");
  let sourcePath = tacticsPath;
  let tactics: Tactics;

  try {
    tactics = readYaml(tacticsPath, TacticsSchema);
  } catch (err) {
    if (!(err instanceof YamlNotFoundError)) {
      throw err;
    }

    sourcePath = getDefaultTacticsTemplatePath();
    tactics = readYaml(sourcePath, TacticsSchema);
  }

  validateTacticsConfig(tactics, sourcePath);

  return profileName
    ? applyProfileWeights(tactics, profileName, sourcePath)
    : tactics;
}

export function levenshteinRatio(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftLength = left.length;
  const rightLength = right.length;
  const maxLength = Math.max(leftLength, rightLength);

  if (maxLength === 0) {
    return 1;
  }

  if (leftLength === 0 || rightLength === 0) {
    return 0;
  }

  let previousRow = Array.from(
    { length: rightLength + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 1; leftIndex <= leftLength; leftIndex += 1) {
    const currentRow = [leftIndex];

    for (let rightIndex = 1; rightIndex <= rightLength; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      currentRow[rightIndex] = Math.min(
        previousRow[rightIndex] + 1,
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex - 1] + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return (maxLength - previousRow[rightLength]) / maxLength;
}

export function jaccardWordSimilarity(left: string, right: string): number {
  const leftWords = new Set(
    left
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean),
  );
  const rightWords = new Set(
    right
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean),
  );

  const union = new Set([...leftWords, ...rightWords]);
  if (union.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      intersectionSize += 1;
    }
  }

  return intersectionSize / union.size;
}

function claimDescription(claim: DuplicateCheckClaim): string {
  return (claim.change_description ?? claim.description ?? "").trim();
}

function sameRuntimeConfigChange(
  left: DuplicateCheckClaim,
  right: DuplicateCheckClaim,
): boolean {
  if (
    left.type !== "runtime_config" ||
    right.type !== "runtime_config" ||
    left.parameter_path === undefined ||
    right.parameter_path === undefined ||
    left.parameter_path !== right.parameter_path
  ) {
    return false;
  }

  return stableYamlString(left.new_value) === stableYamlString(right.new_value);
}

function sameBoardMutationChange(
  left: DuplicateCheckClaim,
  right: DuplicateCheckClaim,
): boolean {
  return (
    left.type === "board_mutation" &&
    right.type === "board_mutation" &&
    claimDescription(left) !== "" &&
    claimDescription(left) === claimDescription(right)
  );
}

export function checkExactDuplicate(
  activeClaims: DuplicateCheckClaim[],
  newClaim: DuplicateCheckClaim,
): boolean {
  return activeClaims.some(
    (activeClaim) =>
      sameRuntimeConfigChange(activeClaim, newClaim) ||
      sameBoardMutationChange(activeClaim, newClaim),
  );
}

export function checkSimilarDuplicate(
  activeClaims: DuplicateCheckClaim[],
  newClaim: DuplicateCheckClaim,
): boolean {
  const newDescription = claimDescription(newClaim);
  if (newDescription === "") {
    return false;
  }

  return activeClaims.some((activeClaim) => {
    const activeDescription = claimDescription(activeClaim);
    if (activeDescription === "") {
      return false;
    }

    return (
      levenshteinRatio(activeDescription, newDescription) >=
        CLAIM_LEVENSHTEIN_THRESHOLD &&
      jaccardWordSimilarity(activeDescription, newDescription) >=
        CLAIM_JACCARD_THRESHOLD
    );
  });
}

function warn(filePath: string, err: unknown): void {
  process.stderr.write(
    `Warning: skipping invalid swarm file ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
}

function warnBestTracking(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableYamlString(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: true,
  });
}

function normalizationStatsPath(pmDir: string): string {
  return path.join(pmDir, "swarm", "normalization-stats.yaml");
}

function loadNormalizationStats(pmDir: string): NormalizationStats {
  const filePath = normalizationStatsPath(pmDir);

  try {
    return readYaml(filePath, NormalizationStatsSchema);
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      return {};
    }

    throw err;
  }
}

function writeNormalizationStatsAtomically(
  pmDir: string,
  stats: NormalizationStats,
): void {
  const filePath = normalizationStatsPath(pmDir);
  const validated = NormalizationStatsSchema.parse(stats);
  writeYaml(filePath, validated);
}

function nextSampleVariance(
  count: number,
  variance: number,
  delta: number,
  delta2: number,
): number {
  if (count <= 0) {
    return 0;
  }

  const previousM2 = count > 1 ? variance * (count - 1) : 0;
  const nextM2 = previousM2 + delta * delta2;
  return count + 1 > 1 ? nextM2 / count : 0;
}

function nextEwmaVariance(
  previousVariance: number,
  previousMean: number,
  newValue: number,
): number {
  const delta = newValue - previousMean;
  return (1 - EWMA_ALPHA) * (previousVariance + EWMA_ALPHA * delta * delta);
}

export async function updateStats(
  pmDir: string,
  metricKey: string,
  newValue: number,
): Promise<void> {
  const filePath = normalizationStatsPath(pmDir);

  await withLock(filePath, () => {
    const stats = loadNormalizationStats(pmDir);
    const current = stats[metricKey] ?? {
      count: 0,
      mean: 0,
      variance: 0,
      ewma_mean: 0,
      ewma_variance: 0,
    };
    const nextCount = current.count + 1;
    const delta = newValue - current.mean;
    const nextMean = current.mean + delta / nextCount;
    const delta2 = newValue - nextMean;
    const nextVariance = nextSampleVariance(
      current.count,
      current.variance,
      delta,
      delta2,
    );
    const nextEwmaMean =
      current.count === 0
        ? newValue
        : EWMA_ALPHA * newValue + (1 - EWMA_ALPHA) * current.ewma_mean;
    const updatedEwmaVariance =
      current.count === 0
        ? 0
        : nextEwmaVariance(current.ewma_variance, current.ewma_mean, newValue);

    writeNormalizationStatsAtomically(pmDir, {
      ...stats,
      [metricKey]: {
        count: nextCount,
        mean: nextMean,
        variance: nextVariance,
        ewma_mean: nextEwmaMean,
        ewma_variance: updatedEwmaVariance,
      },
    });
  });
}

export function normalize(
  pmDir: string,
  metricKey: string,
  rawValue: number,
): number {
  const stats = loadNormalizationStats(pmDir);
  const entry = stats[metricKey];

  if (!entry || entry.count < 2) {
    return 0;
  }

  const mean =
    entry.count <= NORMALIZATION_PHASE_ONE_COUNT ? entry.mean : entry.ewma_mean;
  const variance =
    entry.count <= NORMALIZATION_PHASE_ONE_COUNT
      ? entry.variance
      : entry.ewma_variance;

  if (!Number.isFinite(variance) || variance <= 0) {
    return 0;
  }

  return (rawValue - mean) / Math.sqrt(variance);
}

export function computeComposite(
  normalizedMetrics: Record<string, number>,
  tactics: Tactics,
): number {
  let composite = Number.POSITIVE_INFINITY;

  for (const tactic of tactics.tactics) {
    if (tactic.weight === 0) {
      continue;
    }

    const normalizedMetric = normalizedMetrics[tactic.metric];
    if (!Number.isFinite(normalizedMetric)) {
      continue;
    }

    const adjustedMetric =
      tactic.direction === "lower_is_better"
        ? -normalizedMetric
        : normalizedMetric;
    const weightedScore = tactic.weight * adjustedMetric;
    if (weightedScore < composite) {
      composite = weightedScore;
    }
  }

  return composite === Number.POSITIVE_INFINITY ? Number.NaN : composite;
}

function collectStoryResultBlocks(stdout: string): string[] {
  return collectStructuredYamlBlocks(stdout, "STORY_RESULT:");
}

function collectStructuredYamlBlocks(
  stdout: string,
  blockHeader: string,
): string[] {
  const lines = stdout.split(/\r?\n/);
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== blockHeader) {
      continue;
    }

    const blockLines = [lines[index]];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (line.trim() === "---") {
        break;
      }

      if (line.trim() === blockHeader && !/^\s/.test(line)) {
        break;
      }

      blockLines.push(line);
    }

    blocks.push(blockLines.join("\n"));
  }

  return blocks;
}

export function formatExperimentResult(data: ExperimentResultOutput): string {
  const parsed = ExperimentResultOutputSchema.parse(data);
  const content = yaml
    .dump(
      {
        EXPERIMENT_RESULT: {
          experiment_id: parsed.experiment_id,
          mutation_type: parsed.mutation_type,
          hypothesis: parsed.hypothesis,
          change_description: parsed.change_description,
          observation_window: parsed.observation_window,
          composite_score: parsed.composite_score,
          previous_best_score: parsed.previous_best_score,
          decision: parsed.decision,
          insight: parsed.insight,
        },
      },
      {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
      },
    )
    .trimEnd();

  return `---\n${content}\n---`;
}

export function parseExperimentResult(
  stdout: string,
): ExperimentResultOutput | null {
  const lastBlock = collectStructuredYamlBlocks(
    stdout,
    "EXPERIMENT_RESULT:",
  ).at(-1);

  if (!lastBlock) {
    return null;
  }

  try {
    const parsed = yaml.load(lastBlock);
    const experimentResult =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).EXPERIMENT_RESULT
        : parsed;

    return ExperimentResultOutputSchema.parse(experimentResult);
  } catch {
    return null;
  }
}

export function parseStoryResult(stdout: string): StoryResult | null {
  const lastBlock = collectStoryResultBlocks(stdout).at(-1);

  if (!lastBlock) {
    return null;
  }

  try {
    const parsed = yaml.load(lastBlock);
    const storyResult =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).STORY_RESULT
        : parsed;

    return StoryResultSchema.parse(storyResult);
  } catch {
    return null;
  }
}

export async function writeObservation(
  pmDir: string,
  record: ObservationRecord,
): Promise<void> {
  const parsed = ObservationRecordSchema.parse(record);
  const filePath = path.join(
    pmDir,
    "swarm",
    "observations",
    `${parsed.story_code}.yaml`,
  );

  await withLock(filePath, () => {
    writeYaml(filePath, parsed);
  });
}

export async function readObservation(
  pmDir: string,
  storyCode: string,
): Promise<ObservationRecord | null> {
  const filePath = path.join(
    pmDir,
    "swarm",
    "observations",
    `${storyCode}.yaml`,
  );

  try {
    return readYaml(filePath, ObservationRecordSchema);
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      return null;
    }

    warn(filePath, err);
    return null;
  }
}

export async function computeStrategyHash(pmDir: string): Promise<string> {
  const filePath = path.join(pmDir, "swarm", "strategy.yaml");
  if (!fs.existsSync(filePath)) {
    return "no-strategy";
  }

  return sha256Hex(fs.readFileSync(filePath, "utf8"));
}

export async function computeBoardHash(pmDir: string): Promise<string> {
  const serializedParts: string[] = [];
  const indexPath = path.join(pmDir, "index.yaml");

  if (fs.existsSync(indexPath)) {
    serializedParts.push(stableYamlString(readYaml(indexPath, IndexSchema)));
  }

  const epicPaths = listFiles(path.join(pmDir, "epics"), ".yaml").sort((a, b) =>
    a.localeCompare(b),
  );

  for (const epicPath of epicPaths) {
    serializedParts.push(stableYamlString(readYaml(epicPath, EpicSchema)));
  }

  return sha256Hex(serializedParts.join("\n---\n"));
}

export async function readConfigVersion(pmDir: string): Promise<number> {
  const filePath = path.join(pmDir, "swarm", "strategy.yaml");

  try {
    return readYaml(filePath, StrategySchema).config_version;
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      return 0;
    }

    warn(filePath, err);
    return 0;
  }
}

export const readStrategyConfigVersion = readConfigVersion;

function runShellCommand(command: string, cwd: string): void {
  childProcess.execFileSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
    stdio: "pipe",
  });
}

function setNestedValue(
  target: Record<string, unknown>,
  parameterPath: string,
  newValue: unknown,
): void {
  const segments = parameterPath
    .split(".")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new ValidationError(
      `Invalid strategy parameter path: ${parameterPath}`,
    );
  }

  let current: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new ValidationError(
        `Invalid strategy parameter path: ${parameterPath}`,
      );
    }
    current = next as Record<string, unknown>;
  }

  current[segments.at(-1) as string] = newValue;
}

export async function applyBoardMutation(
  pmDir: string,
  pmCommands: string[],
): Promise<string> {
  const repoRoot = path.dirname(pmDir);

  for (const command of pmCommands) {
    runShellCommand(command, repoRoot);
  }

  childProcess.execFileSync("git", ["add", ".pm"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  childProcess.execFileSync(
    "git",
    [
      "-c",
      "user.name=PM Swarm",
      "-c",
      "user.email=pm-swarm@example.com",
      "commit",
      "-m",
      `swarm-experiment: ${pmCommands.join(" ; ")}`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  return childProcess
    .execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
    .trim();
}

export async function revertBoardMutation(
  pmDir: string,
  commitHash: string,
): Promise<boolean> {
  const repoRoot = path.dirname(pmDir);

  try {
    childProcess.execFileSync("git", ["revert", "--no-edit", commitHash], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

export async function applyRuntimeMutation(
  pmDir: string,
  parameterPath: string,
  newValue: unknown,
): Promise<number> {
  const filePath = path.join(pmDir, "swarm", "strategy.yaml");
  const currentStrategy = readYaml(filePath, StrategySchema);
  const nextStrategy = structuredClone(currentStrategy) as Record<
    string,
    unknown
  >;

  setNestedValue(nextStrategy, `parameters.${parameterPath}`, newValue);

  const validatedStrategy = StrategySchema.parse({
    ...nextStrategy,
    config_version: currentStrategy.config_version + 1,
  });
  writeYaml(filePath, validatedStrategy);

  return validatedStrategy.config_version;
}

export async function revertRuntimeMutation(pmDir: string): Promise<number> {
  const filePath = path.join(pmDir, "swarm", "strategy.yaml");
  const bestPath = path.join(pmDir, "swarm", "best", "strategy.yaml");
  const currentVersion = fs.existsSync(filePath)
    ? readYaml(filePath, StrategySchema).config_version
    : 0;
  const bestStrategy = readYaml(bestPath, StrategySchema);
  const restoredStrategy = StrategySchema.parse({
    ...bestStrategy,
    config_version: currentVersion + 1,
  });

  writeYaml(filePath, restoredStrategy);

  return restoredStrategy.config_version;
}

export async function writeStrategyWithFence(
  pmDir: string,
  newStrategy: z.input<typeof StrategySchema>,
  expectedVersion: number,
): Promise<boolean> {
  const filePath = path.join(pmDir, "swarm", "strategy.yaml");
  let didWrite = false;

  await withLock(filePath, () => {
    const currentVersion = fs.existsSync(filePath)
      ? readYaml(filePath, StrategySchema).config_version
      : 0;

    if (currentVersion !== expectedVersion) {
      return;
    }

    const strategy = StrategySchema.parse({
      ...newStrategy,
      config_version: expectedVersion + 1,
    });
    writeYaml(filePath, strategy);
    didWrite = true;
  });

  return didWrite;
}

export async function verifyRuntimeFence(
  pmDir: string,
  expectedVersion: number,
): Promise<boolean> {
  const currentVersion = await readConfigVersion(pmDir);
  return currentVersion === expectedVersion + 1;
}

export async function verifyBoardFence(
  pmDir: string,
  expectedCommitHash: string,
): Promise<boolean> {
  try {
    const currentCommitHash = childProcess
      .execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: path.dirname(pmDir),
        encoding: "utf8",
      })
      .trim();
    return currentCommitHash === expectedCommitHash;
  } catch {
    return false;
  }
}

export async function computeObservationMetadata(
  pmDir: string,
): Promise<
  Pick<ObservationRecord, "strategy_hash" | "board_hash" | "config_version">
> {
  const [strategyHash, boardHash, configVersion] = await Promise.all([
    computeStrategyHash(pmDir),
    computeBoardHash(pmDir),
    readConfigVersion(pmDir),
  ]);

  return {
    strategy_hash: strategyHash,
    board_hash: boardHash,
    config_version: configVersion,
  };
}

async function listMatchingObservations(
  pmDir: string,
  strategyHash: string,
  boardHash: string,
): Promise<ObservationRecord[]> {
  const observationDir = path.join(pmDir, "swarm", "observations");
  const observations: ObservationRecord[] = [];

  for (const filePath of listFiles(observationDir, ".yaml").sort((a, b) =>
    a.localeCompare(b),
  )) {
    try {
      const observation = readYaml(filePath, ObservationRecordSchema);
      if (
        observation.strategy_hash === strategyHash &&
        observation.board_hash === boardHash
      ) {
        observations.push(observation);
      }
    } catch (err) {
      warn(filePath, err);
    }
  }

  return observations;
}

function computeStoriesPerHour(observations: ObservationRecord[]): number {
  const doneCount = observations.filter(
    (observation) => observation.status === "done",
  ).length;

  if (doneCount === 0 || observations.length === 0) {
    return 0;
  }

  const startedAt = observations
    .map((observation) => new Date(observation.started_at).getTime())
    .reduce(
      (earliest, current) => Math.min(earliest, current),
      Number.POSITIVE_INFINITY,
    );
  const completedAt = observations
    .map((observation) => new Date(observation.completed_at).getTime())
    .reduce(
      (latest, current) => Math.max(latest, current),
      Number.NEGATIVE_INFINITY,
    );
  const elapsedHours = (completedAt - startedAt) / 3_600_000;

  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) {
    return 0;
  }

  return doneCount / elapsedHours;
}

function computeCriteriaPassRate(observations: ObservationRecord[]): number {
  const verifiedCount = observations.reduce(
    (total, observation) => total + observation.criteria_verified.length,
    0,
  );
  const failedCount = observations.reduce(
    (total, observation) => total + observation.criteria_failed.length,
    0,
  );
  const totalCriteria = verifiedCount + failedCount;

  return totalCriteria === 0 ? 0 : verifiedCount / totalCriteria;
}

function computeWasteRatio(observations: ObservationRecord[]): number {
  if (observations.length === 0) {
    return 0;
  }

  const wastedCount = observations.filter(
    (observation) =>
      observation.status === "failed" || observation.status === "blocked",
  ).length;

  return wastedCount / observations.length;
}

function computeDuplicateAndConflictRatio(
  observations: ObservationRecord[],
): number {
  if (observations.length === 0) {
    return 0;
  }

  const storyCounts = new Map<string, number>();
  for (const observation of observations) {
    storyCounts.set(
      observation.story_code,
      (storyCounts.get(observation.story_code) ?? 0) + 1,
    );
  }

  let duplicateCount = 0;
  for (const count of storyCounts.values()) {
    duplicateCount += Math.max(0, count - 1);
  }

  return duplicateCount / observations.length;
}

function readHeartbeatTimingConfig(pmDir: string): {
  frequencySeconds: number;
  staleThresholdSeconds: number;
} {
  const strategyPath = path.join(pmDir, "swarm", "strategy.yaml");

  if (!fs.existsSync(strategyPath)) {
    return {
      frequencySeconds: DEFAULT_HEARTBEAT_FREQUENCY_SECONDS,
      staleThresholdSeconds: DEFAULT_HEARTBEAT_STALE_THRESHOLD_SECONDS,
    };
  }

  const strategy = (yaml.load(fs.readFileSync(strategyPath, "utf8")) ?? {}) as {
    parameters?: {
      heartbeat?: {
        frequency_seconds?: unknown;
        stale_threshold_seconds?: unknown;
      };
    };
  };

  return {
    frequencySeconds:
      typeof strategy.parameters?.heartbeat?.frequency_seconds === "number"
        ? strategy.parameters.heartbeat.frequency_seconds
        : DEFAULT_HEARTBEAT_FREQUENCY_SECONDS,
    staleThresholdSeconds:
      typeof strategy.parameters?.heartbeat?.stale_threshold_seconds ===
      "number"
        ? strategy.parameters.heartbeat.stale_threshold_seconds
        : DEFAULT_HEARTBEAT_STALE_THRESHOLD_SECONDS,
  };
}

function listAgentStates(pmDir: string): AgentState[] {
  const agentsDir = path.join(pmDir, "agents");
  const agentStates: AgentState[] = [];

  for (const filePath of listFiles(agentsDir, ".yaml").sort((a, b) =>
    a.localeCompare(b),
  )) {
    const basename = path.basename(filePath);
    if (
      basename.endsWith("-response.yaml") ||
      basename.endsWith("-escalation-log.yaml") ||
      basename.endsWith("-process.yaml")
    ) {
      continue;
    }

    try {
      agentStates.push(readYaml(filePath, AgentStateSchema));
    } catch (err) {
      warn(filePath, err);
    }
  }

  return agentStates;
}

function listObservationsInWindow(
  pmDir: string,
  windowStartMs: number,
  windowEndMs: number,
): ObservationRecord[] {
  const observationDir = path.join(pmDir, "swarm", "observations");
  const observations: ObservationRecord[] = [];

  for (const filePath of listFiles(observationDir, ".yaml").sort((a, b) =>
    a.localeCompare(b),
  )) {
    try {
      const observation = readYaml(filePath, ObservationRecordSchema);
      const startedAtMs = Date.parse(observation.started_at);
      const completedAtMs = Date.parse(observation.completed_at);

      if (
        !Number.isFinite(startedAtMs) ||
        !Number.isFinite(completedAtMs) ||
        completedAtMs < windowStartMs ||
        startedAtMs > windowEndMs
      ) {
        continue;
      }

      observations.push(observation);
    } catch (err) {
      warn(filePath, err);
    }
  }

  return observations;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middleIndex - 1] + sorted[middleIndex]) / 2
    : sorted[middleIndex];
}

export function computeEscalationMetrics(
  pmDir: string,
  windowStart: string,
  windowEnd: string,
): {
  escalation_response_median_seconds: number;
  escalation_ratio: number;
} {
  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = Date.parse(windowEnd);

  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowEndMs <= windowStartMs
  ) {
    return {
      escalation_response_median_seconds: 0,
      escalation_ratio: 0,
    };
  }

  const storiesInWindow = new Set(
    listObservationsInWindow(pmDir, windowStartMs, windowEndMs).map(
      (observation) => observation.story_code,
    ),
  );
  const responseTimesSeconds: number[] = [];
  const escalatedStories = new Set<string>();

  for (const agentState of listAgentStates(pmDir)) {
    if (
      agentState.status !== "needs_attention" ||
      agentState.escalation === undefined ||
      typeof agentState.current_task !== "string" ||
      agentState.current_task.length === 0
    ) {
      continue;
    }

    const escalatedAtMs = Date.parse(agentState.last_heartbeat);
    if (
      !Number.isFinite(escalatedAtMs) ||
      escalatedAtMs < windowStartMs ||
      escalatedAtMs > windowEndMs
    ) {
      continue;
    }

    if (storiesInWindow.has(agentState.current_task)) {
      escalatedStories.add(agentState.current_task);
    }

    const responsePath = path.join(
      pmDir,
      "agents",
      `${agentState.agent_id}-response.yaml`,
    );

    try {
      const response = readYaml(responsePath, AgentResponseSchema);
      const respondedAtMs = Date.parse(response.responded_at);

      if (
        Number.isFinite(respondedAtMs) &&
        respondedAtMs >= escalatedAtMs &&
        respondedAtMs <= windowEndMs
      ) {
        responseTimesSeconds.push((respondedAtMs - escalatedAtMs) / 1000);
      }
    } catch (err) {
      if (!(err instanceof YamlNotFoundError)) {
        warn(responsePath, err);
      }
    }
  }

  return {
    escalation_response_median_seconds: median(responseTimesSeconds),
    escalation_ratio:
      storiesInWindow.size === 0
        ? 0
        : escalatedStories.size / storiesInWindow.size,
  };
}

export function computeIdleRatio(
  pmDir: string,
  windowStart: string,
  windowEnd: string,
): number {
  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = Date.parse(windowEnd);

  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowEndMs <= windowStartMs
  ) {
    return 0;
  }

  const { frequencySeconds, staleThresholdSeconds } =
    readHeartbeatTimingConfig(pmDir);
  const frequencyMs = frequencySeconds * 1000;
  const staleThresholdMs = staleThresholdSeconds * 1000;

  let activeMs = 0;
  let idleMs = 0;

  for (const agentState of listAgentStates(pmDir)) {
    const lastHeartbeatMs = Date.parse(agentState.last_heartbeat);
    if (!Number.isFinite(lastHeartbeatMs)) {
      continue;
    }

    const activeWindowStart = Math.max(
      windowStartMs,
      lastHeartbeatMs - frequencyMs,
    );
    const activeWindowEnd = Math.min(
      windowEndMs,
      lastHeartbeatMs + staleThresholdMs,
    );

    if (activeWindowEnd <= activeWindowStart) {
      continue;
    }

    const durationMs = activeWindowEnd - activeWindowStart;
    const isActive =
      agentState.status === "active" &&
      typeof agentState.current_task === "string" &&
      agentState.current_task.length > 0;

    if (isActive) {
      activeMs += durationMs;
    } else {
      idleMs += durationMs;
    }
  }

  const engagedMs = activeMs + idleMs;
  return engagedMs === 0 ? 0 : idleMs / engagedMs;
}

export async function computeMetrics(
  pmDir: string,
  strategyHash: string,
  boardHash: string,
): Promise<Record<string, number>> {
  const tactics = loadTactics(pmDir);
  const storyResultMetricKeys = Array.from(
    new Set(
      tactics.tactics
        .filter((tactic) => tactic.source === "story_result")
        .map((tactic) => tactic.metric),
    ),
  );
  const heartbeatMetricKeys = Array.from(
    new Set(
      tactics.tactics
        .filter((tactic) => tactic.source === "heartbeat")
        .map((tactic) => tactic.metric),
    ),
  );
  const escalationMetricKeys = Array.from(
    new Set(
      tactics.tactics
        .filter((tactic) => tactic.source === "escalation")
        .map((tactic) => tactic.metric),
    ),
  );
  const observations = await listMatchingObservations(
    pmDir,
    strategyHash,
    boardHash,
  );

  const metricValues: Record<string, number> = {
    stories_per_hour: computeStoriesPerHour(observations),
    criteria_pass_rate: computeCriteriaPassRate(observations),
    waste_ratio: computeWasteRatio(observations),
    duplicate_and_conflict_ratio:
      computeDuplicateAndConflictRatio(observations),
  };

  if (heartbeatMetricKeys.includes("idle_ratio") && observations.length > 0) {
    const windowStart = observations
      .map((observation) => observation.started_at)
      .reduce((earliest, current) =>
        Date.parse(current) < Date.parse(earliest) ? current : earliest,
      );
    const windowEnd = observations
      .map((observation) => observation.completed_at)
      .reduce((latest, current) =>
        Date.parse(current) > Date.parse(latest) ? current : latest,
      );

    metricValues.idle_ratio = computeIdleRatio(pmDir, windowStart, windowEnd);
  }

  if (escalationMetricKeys.length > 0 && observations.length > 0) {
    const windowStart = observations
      .map((observation) => observation.started_at)
      .reduce((earliest, current) =>
        Date.parse(current) < Date.parse(earliest) ? current : earliest,
      );
    const windowEnd = observations
      .map((observation) => observation.completed_at)
      .reduce((latest, current) =>
        Date.parse(current) > Date.parse(latest) ? current : latest,
      );

    Object.assign(
      metricValues,
      computeEscalationMetrics(pmDir, windowStart, windowEnd),
    );
  }

  return [
    ...storyResultMetricKeys,
    ...heartbeatMetricKeys,
    ...escalationMetricKeys,
  ].reduce<Record<string, number>>((metrics, key) => {
    metrics[key] = metricValues[key] ?? 0;
    return metrics;
  }, {});
}

export interface ExplorationCoverage {
  runtime_config: Record<string, number>;
  board_mutations: Record<string, number>;
}

export type ImprovementTrend = "improving" | "plateaued" | "regressing";

export interface RecentExperimentResult {
  experiment_id: string;
  mutation_type: ExperimentResult["mutation_type"];
  decision: ExperimentResult["status"];
  composite_score: number;
  description: string;
  completed_at: string;
}

export interface AgentBestSummary extends RecentExperimentResult {
  agent_id: string;
}

export interface AnalysisSummary {
  global_best: BestMetadata | null;
  recent_results: RecentExperimentResult[];
  active_claims: Array<{
    key: string;
    agentId: string;
    expiresAt: string;
    claimedAt: string;
    mutationType: Claim["type"];
  }>;
  unclaimed_hypotheses: number;
  agent_bests: AgentBestSummary[];
  trend: ImprovementTrend;
  count: number;
  coverage: ExplorationCoverage;
  improvement_trend: ImprovementTrend;
  experiment_count: number;
  exploration_coverage: ExplorationCoverage;
}

export interface ListHypothesesFilter {
  status?: HypothesisStatus;
}

export type HypothesisWriteInput = Omit<
  Hypothesis,
  "created_at" | "requires_human_review"
> & {
  created_at?: string;
  requires_human_review?: boolean;
};

export type InsightWriteInput = Omit<Insight, "posted_at"> & {
  posted_at?: string;
};

function compareByCompletedAt(
  left: Pick<ExperimentResult, "completed_at">,
  right: Pick<ExperimentResult, "completed_at">,
): number {
  return (
    new Date(left.completed_at).getTime() -
    new Date(right.completed_at).getTime()
  );
}

function averageCompositeScore(results: ExperimentResult[]): number {
  return (
    results.reduce((total, result) => total + result.composite_score, 0) /
    results.length
  );
}

function summarizeResult(result: ExperimentResult): RecentExperimentResult {
  return {
    experiment_id: result.experiment_id,
    mutation_type: result.mutation_type,
    decision: result.status,
    composite_score: result.composite_score,
    description: result.description,
    completed_at: result.completed_at,
  };
}

function countUnclaimedHypotheses(pmDir: string): number {
  const hypothesesDir = path.join(pmDir, "swarm", "hypotheses");
  let count = 0;

  for (const filePath of listFiles(hypothesesDir, ".yaml")) {
    try {
      const hypothesis = readYaml(filePath, HypothesisSchema);
      if (hypothesis.status === "unclaimed") {
        count += 1;
      }
    } catch (err) {
      warn(filePath, err);
    }
  }

  return count;
}

function hypothesisFileName(
  hypothesis: Pick<Hypothesis, "created_at" | "agent_id" | "title">,
): string {
  const timestamp = hypothesis.created_at.replace(/:/g, "-");
  return `${timestamp}-${hypothesis.agent_id}-${toKebabSlug(hypothesis.title)}.yaml`;
}

function compareHypotheses(left: Hypothesis, right: Hypothesis): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function insightFileName(
  insight: Pick<Insight, "posted_at" | "agent_id" | "insight">,
): string {
  const timestamp = insight.posted_at.replace(/:/g, "-");
  const slug = toKebabSlug(insight.insight).slice(0, 48) || "insight";
  return `${timestamp}-${insight.agent_id}-${slug}.yaml`;
}

function compareInsights(left: Insight, right: Insight): number {
  return (
    new Date(right.posted_at).getTime() - new Date(left.posted_at).getTime()
  );
}

export async function writeHypothesis(
  pmDir: string,
  hypothesis: HypothesisWriteInput,
): Promise<Hypothesis> {
  const createdAt = hypothesis.created_at ?? new Date(Date.now()).toISOString();
  const parsed = HypothesisSchema.parse({
    ...hypothesis,
    created_at: createdAt,
    requires_human_review:
      hypothesis.type === "tactic_suggestion"
        ? true
        : hypothesis.requires_human_review,
  });
  const filePath = path.join(
    pmDir,
    "swarm",
    "hypotheses",
    hypothesisFileName(parsed),
  );

  await withLock(filePath, () => {
    writeYaml(filePath, parsed);
  });

  return parsed;
}

export async function writeInsight(
  pmDir: string,
  insight: InsightWriteInput,
): Promise<Insight> {
  const postedAt = insight.posted_at ?? new Date(Date.now()).toISOString();
  const parsed = InsightSchema.parse({
    ...insight,
    posted_at: postedAt,
  });
  const filePath = path.join(
    pmDir,
    "swarm",
    "insights",
    insightFileName(parsed),
  );

  await withLock(filePath, () => {
    writeYaml(filePath, parsed);
  });

  return parsed;
}

export async function listHypotheses(
  pmDir: string,
  filter: ListHypothesesFilter = {},
): Promise<Hypothesis[]> {
  const status = filter.status ?? "unclaimed";
  const hypothesesDir = path.join(pmDir, "swarm", "hypotheses");
  const hypotheses: Hypothesis[] = [];

  for (const filePath of listFiles(hypothesesDir, ".yaml")) {
    try {
      const hypothesis = readYaml(filePath, HypothesisSchema);
      if (hypothesis.status === status) {
        hypotheses.push(hypothesis);
      }
    } catch (err) {
      warn(filePath, err);
    }
  }

  return hypotheses.sort(compareHypotheses);
}

export async function listInsights(
  pmDir: string,
  limit?: number,
): Promise<Insight[]> {
  const insightsDir = path.join(pmDir, "swarm", "insights");
  const insights: Insight[] = [];

  for (const filePath of listFiles(insightsDir, ".yaml")) {
    try {
      insights.push(readYaml(filePath, InsightSchema));
    } catch (err) {
      warn(filePath, err);
    }
  }

  const ordered = insights.sort(compareInsights);
  return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
}

export async function searchInsights(
  pmDir: string,
  query: string,
  threshold: number,
): Promise<Array<{ key: string; score: number }>> {
  return new FileSwarmStore(pmDir).search("insights", query, threshold);
}

export async function filterInsightsByTag(
  pmDir: string,
  tag: string,
): Promise<Insight[]> {
  return (await listInsights(pmDir)).filter((insight) =>
    insight.tags.includes(tag),
  );
}

function summarizeAgentBests(results: ExperimentResult[]): AgentBestSummary[] {
  const bestByAgent = new Map<string, ExperimentResult>();

  for (const result of results) {
    const currentBest = bestByAgent.get(result.agent_id);
    if (
      currentBest === undefined ||
      result.composite_score > currentBest.composite_score ||
      (result.composite_score === currentBest.composite_score &&
        compareByCompletedAt(result, currentBest) > 0)
    ) {
      bestByAgent.set(result.agent_id, result);
    }
  }

  return Array.from(bestByAgent.values())
    .sort((left, right) => {
      if (right.composite_score !== left.composite_score) {
        return right.composite_score - left.composite_score;
      }

      return compareByCompletedAt(right, left);
    })
    .map((result) => ({
      agent_id: result.agent_id,
      ...summarizeResult(result),
    }));
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function classifyBoardMutationCategories(
  result: ExperimentResult,
): Set<keyof ExplorationCoverage["board_mutations"]> {
  const categories = new Set<keyof ExplorationCoverage["board_mutations"]>();

  if (result.mutation_type !== "board_mutation") {
    return categories;
  }

  if (!("pm_commands" in result.change_details)) {
    return categories;
  }

  for (const command of result.change_details.pm_commands) {
    const normalizedCommand = command.toLowerCase();

    if (
      normalizedCommand.includes("priority") ||
      normalizedCommand.includes("pm prioritize")
    ) {
      categories.add("priority_changes");
    }

    if (normalizedCommand.includes("depends-on")) {
      categories.add("dependency_changes");
    }

    if (normalizedCommand.includes("story add")) {
      categories.add("story_splits");
    }
  }

  return categories;
}

export async function aggregateResults(
  pmDir: string,
): Promise<ExperimentResult[]> {
  const resultsDir = path.join(pmDir, "swarm", "results");
  const results: ExperimentResult[] = [];

  for (const filePath of listFiles(resultsDir, ".yaml").sort((a, b) =>
    a.localeCompare(b),
  )) {
    try {
      results.push(readYaml(filePath, ExperimentResultSchema));
    } catch (err) {
      warn(filePath, err);
    }
  }

  return results;
}

export function detectTrend(results: ExperimentResult[]): ImprovementTrend {
  if (results.length < 2) {
    return "plateaued";
  }

  const orderedResults = [...results].sort(compareByCompletedAt);
  const comparisonWindow = orderedResults.slice(-10);
  const splitIndex = Math.floor(comparisonWindow.length / 2);
  const preceding = comparisonWindow.slice(0, splitIndex);
  const recent = comparisonWindow.slice(splitIndex);

  if (preceding.length === 0 || recent.length === 0) {
    return "plateaued";
  }

  const delta =
    averageCompositeScore(recent) - averageCompositeScore(preceding);
  if (delta > 0.02) {
    return "improving";
  }

  if (delta < -0.02) {
    return "regressing";
  }

  return "plateaued";
}

export function computeExplorationCoverage(
  results: ExperimentResult[],
): ExplorationCoverage {
  const coverage: ExplorationCoverage = {
    runtime_config: {},
    board_mutations: {},
  };

  for (const result of results) {
    if (result.mutation_type === "runtime_config") {
      if ("parameter_path" in result.change_details) {
        incrementCount(
          coverage.runtime_config,
          result.change_details.parameter_path,
        );
      }
      continue;
    }

    for (const category of classifyBoardMutationCategories(result)) {
      incrementCount(coverage.board_mutations, category);
    }
  }

  return coverage;
}

export async function readGlobalBest(
  pmDir: string,
): Promise<BestMetadata | null> {
  const filePath = path.join(pmDir, "swarm", "best", "metadata.yaml");

  try {
    return readYaml(filePath, BestMetadataSchema);
  } catch (err) {
    if (err instanceof YamlNotFoundError) {
      return null;
    }

    warn(filePath, err);
    return null;
  }
}

function agentBestPath(pmDir: string, agentId: string): string {
  return path.join(pmDir, "swarm", "best", `${agentId}.yaml`);
}

function globalBestMetadataPath(pmDir: string): string {
  return path.join(pmDir, "swarm", "best", "metadata.yaml");
}

function globalBestStrategyPath(pmDir: string): string {
  return path.join(pmDir, "swarm", "best", "strategy.yaml");
}

function bestSnapshot(metadata: BestMetadata | null): string {
  if (metadata === null) {
    return "null";
  }

  return stableYamlString({
    composite_score: metadata.composite_score,
    experiment_id: metadata.experiment_id,
  });
}

function buildBestMetadata(
  result: ExperimentResult,
  currentBest: BestMetadata | null,
): BestMetadata {
  const hasPreviousBest =
    currentBest?.composite_score !== null && currentBest !== null;

  return BestMetadataSchema.parse({
    status: "active",
    composite_score: result.composite_score,
    experiment_id: result.experiment_id,
    strategy_snapshot: result.strategy_snapshot,
    board_hash: result.board_hash,
    updated_at: result.completed_at,
    previous_best_score: hasPreviousBest ? currentBest.composite_score : null,
    previous_best_experiment_id: hasPreviousBest
      ? currentBest.experiment_id
      : undefined,
  });
}

export async function updateAgentBest(
  pmDir: string,
  agentId: string,
  result: ExperimentResult,
): Promise<boolean> {
  const filePath = agentBestPath(pmDir, agentId);

  return withLock(filePath, async () => {
    let currentBest: ExperimentResult | null = null;

    try {
      currentBest = readYaml(filePath, ExperimentResultSchema);
    } catch (err) {
      if (!(err instanceof YamlNotFoundError)) {
        throw err;
      }
    }

    if (
      currentBest !== null &&
      result.composite_score <= currentBest.composite_score
    ) {
      return false;
    }

    writeYaml(filePath, ExperimentResultSchema.parse(result));
    return true;
  });
}

export async function updateGlobalBest(
  pmDir: string,
  result: ExperimentResult,
): Promise<boolean> {
  if (result.composite_score <= 0) {
    warnBestTracking("Error result, not updating best");
    return false;
  }

  const metadataPath = globalBestMetadataPath(pmDir);
  const bestStrategy = StrategySchema.parse(result.strategy_snapshot);

  for (let attempt = 0; attempt < BEST_UPDATE_MAX_ATTEMPTS; attempt += 1) {
    const outcome = await withLock(metadataPath, async () => {
      const currentBest = await readGlobalBest(pmDir);
      const currentScore = currentBest?.composite_score ?? null;

      if (
        currentScore !== null &&
        result.composite_score - currentScore > MAX_BEST_IMPROVEMENT
      ) {
        warnBestTracking("Anomalous improvement, skipping");
        return { updated: false, retry: false };
      }

      if (currentScore !== null && result.composite_score <= currentScore) {
        return { updated: false, retry: false };
      }

      const nextMetadata = buildBestMetadata(result, currentBest);
      const verificationRead = await readGlobalBest(pmDir);

      if (bestSnapshot(currentBest) !== bestSnapshot(verificationRead)) {
        return { updated: false, retry: true };
      }

      writeYaml(metadataPath, nextMetadata);
      writeYaml(globalBestStrategyPath(pmDir), bestStrategy);
      return { updated: true, retry: false };
    });

    if (!outcome.retry) {
      return outcome.updated;
    }
  }

  return false;
}

export async function establishBaseline(pmDir: string): Promise<BestMetadata> {
  const metadataPath = globalBestMetadataPath(pmDir);

  return withLock(metadataPath, async () => {
    const existingBest = await readGlobalBest(pmDir);
    if (existingBest) {
      return existingBest;
    }

    const strategyPath = path.join(pmDir, "swarm", "strategy.yaml");
    const bestStrategyPath = globalBestStrategyPath(pmDir);
    const strategySnapshot = readYaml(strategyPath, StrategySchema);
    const [boardHash, strategyHash] = await Promise.all([
      computeBoardHash(pmDir),
      computeStrategyHash(pmDir),
    ]);
    const observations = await listMatchingObservations(
      pmDir,
      strategyHash,
      boardHash,
    );

    fs.mkdirSync(path.dirname(bestStrategyPath), { recursive: true });
    fs.copyFileSync(strategyPath, bestStrategyPath);

    const metadata =
      observations.length === 0
        ? BestMetadataSchema.parse({
            status: "awaiting-baseline",
            composite_score: null,
            experiment_id: "baseline",
            strategy_snapshot: strategySnapshot,
            board_hash: boardHash,
            updated_at: new Date(Date.now()).toISOString(),
          })
        : BestMetadataSchema.parse({
            status: "active",
            composite_score: computeComposite(
              Object.fromEntries(
                Object.entries(
                  await computeMetrics(pmDir, strategyHash, boardHash),
                ).map(([metricKey, rawValue]) => [
                  metricKey,
                  normalize(pmDir, metricKey, rawValue),
                ]),
              ),
              loadTactics(pmDir),
            ),
            experiment_id: "baseline",
            strategy_snapshot: strategySnapshot,
            board_hash: boardHash,
            updated_at: new Date(Date.now()).toISOString(),
          });

    writeYaml(metadataPath, metadata);

    return metadata;
  });
}

export async function buildAnalysisSummary(
  pmDir: string,
): Promise<AnalysisSummary> {
  const [results, globalBest] = await Promise.all([
    aggregateResults(pmDir),
    readGlobalBest(pmDir),
  ]);
  const orderedResults = [...results].sort(compareByCompletedAt);
  const recentResults = orderedResults
    .slice(-10)
    .reverse()
    .map(summarizeResult);
  const coverage = computeExplorationCoverage(results);
  const activeClaims = await new FileSwarmStore(pmDir).listActiveClaims(
    "claims",
  );
  const trend = detectTrend(orderedResults);
  const count = results.length;

  return {
    global_best: globalBest,
    recent_results: recentResults,
    active_claims: activeClaims,
    unclaimed_hypotheses: countUnclaimedHypotheses(pmDir),
    agent_bests: summarizeAgentBests(results),
    trend,
    count,
    coverage,
    improvement_trend: trend,
    experiment_count: count,
    exploration_coverage: coverage,
  };
}

function claimTargetKey(
  pmDir: string,
  description: string,
  agentId: string,
): string {
  return `${pmDir}:claims:${agentId}:${toKebabSlug(description)}`;
}

function claimFilePath(
  pmDir: string,
  description: string,
  agentId: string,
): string {
  return path.join(
    pmDir,
    "swarm",
    "claims",
    `${agentId}-${toKebabSlug(description)}.yaml`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireClaim(
  pmDir: string,
  claimData: ClaimAcquisitionData,
  agentId: string,
  options: ClaimAcquisitionOptions = {},
): Promise<ClaimAcquisitionResult> {
  const waitMs = options.waitMs ?? CLAIM_VERIFY_WAIT_MS;
  const targetKey = claimTargetKey(pmDir, claimData.description, agentId);
  const filePath = claimFilePath(pmDir, claimData.description, agentId);
  const claimKey = toKebabSlug(claimData.description);
  const claim: Claim = ClaimSchema.parse({
    ...claimData,
    agent_id: agentId,
    claimed_at: new Date(Date.now()).toISOString(),
    status: "active",
  });

  await withLock(filePath, () => {
    writeYaml(filePath, claim);
  });

  await sleep(waitMs);

  try {
    const persistedClaim = readYaml(filePath, ClaimSchema);
    if (persistedClaim.agent_id === agentId) {
      claimAcquisitionFailures.delete(targetKey);
      return { acquired: true, claimKey };
    }

    await withLock(filePath, () => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    if (!(err instanceof YamlNotFoundError)) {
      throw err;
    }
  }

  const failures = (claimAcquisitionFailures.get(targetKey) ?? 0) + 1;
  claimAcquisitionFailures.set(targetKey, failures);
  if (failures >= CLAIM_SOLO_MODE_FAILURE_THRESHOLD) {
    return { acquired: false, reason: "fallback-solo", soloMode: true };
  }

  return { acquired: false, reason: "claim-verification-failed" };
}

export class FileSwarmStore implements SwarmStore {
  constructor(private readonly pmDir: string) {}

  async read(
    namespace: string,
    key: string,
  ): Promise<Record<string, unknown> | null> {
    const filePath = this.resolveFilePath(namespace, key);
    const schema = this.schemaFor(namespace, key);

    try {
      return readYaml(filePath, schema) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof YamlNotFoundError) {
        return null;
      }

      warn(filePath, err);
      return null;
    }
  }

  async write(
    namespace: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const schema = this.schemaFor(namespace, key);
    const filePath = this.resolveFilePath(namespace, key);
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new ZodValidationError(filePath, result.error);
    }

    writeYaml(filePath, result.data);
  }

  async list(namespace: string): Promise<string[]> {
    if (this.isRootNamespace(namespace)) {
      return fs.existsSync(this.resolveFilePath(namespace, namespace))
        ? [namespace]
        : [];
    }

    return listFiles(this.namespaceDir(namespace))
      .map((filePath) => path.basename(filePath, ".yaml"))
      .sort((a, b) => a.localeCompare(b));
  }

  async delete(namespace: string, key: string): Promise<void> {
    const filePath = this.resolveFilePath(namespace, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async search(
    namespace: string,
    query: string,
    threshold: number,
  ): Promise<Array<{ key: string; score: number }>> {
    const filePaths = this.isRootNamespace(namespace)
      ? [this.resolveFilePath(namespace, namespace)]
      : listFiles(this.namespaceDir(namespace));

    const results: Array<{ key: string; score: number }> = [];

    for (const filePath of filePaths) {
      try {
        const record = readYaml(filePath, GenericRecordSchema);
        const searchText =
          typeof record.description === "string"
            ? record.description
            : typeof record.insight === "string"
              ? record.insight
              : null;
        if (searchText === null) {
          continue;
        }

        const score = levenshteinRatio(searchText, query);
        if (score >= threshold) {
          results.push({
            key: path.basename(filePath, ".yaml"),
            score,
          });
        }
      } catch (err) {
        if (err instanceof YamlNotFoundError) {
          continue;
        }

        warn(filePath, err);
      }
    }

    return results.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.key.localeCompare(right.key);
    });
  }

  async claim(
    namespace: string,
    key: string,
    agentId: string,
    ttlSeconds: number,
  ): Promise<ClaimAcquisitionResult> {
    if (namespace !== "claims") {
      throw new ValidationError(
        `Claim acquisition is only supported for the claims namespace; received ${namespace}`,
      );
    }

    return acquireClaim(
      this.pmDir,
      {
        type: "board_mutation",
        description: key,
        ttl_seconds: ttlSeconds,
      },
      agentId,
    );
  }

  async releaseClaim(
    namespace: string,
    key: string,
    agentId: string,
  ): Promise<void> {
    const filePath = this.claimFilePath(namespace, key, agentId);

    await withLock(filePath, () => {
      const claim = readYaml(filePath, ClaimSchema);
      writeYaml(filePath, { ...claim, status: "completed" });
    });
  }

  async listActiveClaims(namespace: string): Promise<
    Array<{
      key: string;
      agentId: string;
      expiresAt: string;
      claimedAt: string;
      mutationType: Claim["type"];
    }>
  > {
    const now = Date.now();
    const filePaths = listFiles(this.namespaceDir(namespace));
    const activeClaims: Array<{
      key: string;
      agentId: string;
      expiresAt: string;
      claimedAt: string;
      mutationType: Claim["type"];
    }> = [];

    for (const filePath of filePaths) {
      try {
        const claim = readYaml(filePath, ClaimSchema);
        const expiresAt = this.claimExpiresAt(claim);

        if (claim.status !== "active" || new Date(expiresAt).getTime() <= now) {
          continue;
        }

        activeClaims.push({
          key: this.claimKeyFromFilePath(filePath, claim.agent_id),
          agentId: claim.agent_id,
          expiresAt,
          claimedAt: claim.claimed_at,
          mutationType: claim.type,
        });
      } catch (err) {
        if (err instanceof YamlNotFoundError) {
          continue;
        }

        warn(filePath, err);
      }
    }

    return activeClaims.sort((left, right) =>
      left.key.localeCompare(right.key),
    );
  }

  private swarmDir(): string {
    return path.join(this.pmDir, "swarm");
  }

  private namespaceDir(namespace: string): string {
    return path.join(this.swarmDir(), namespace);
  }

  private claimFilePath(
    namespace: string,
    key: string,
    agentId: string,
  ): string {
    return path.join(
      this.namespaceDir(namespace),
      `${agentId}-${toKebabSlug(key)}.yaml`,
    );
  }

  private claimExpiresAt(claim: Claim): string {
    return new Date(
      new Date(claim.claimed_at).getTime() + claim.ttl_seconds * 1000,
    ).toISOString();
  }

  private claimKeyFromFilePath(filePath: string, agentId: string): string {
    const basename = path.basename(filePath, ".yaml");
    const prefix = `${agentId}-`;
    return basename.startsWith(prefix)
      ? basename.slice(prefix.length)
      : basename;
  }

  private resolveFilePath(namespace: string, key: string): string {
    if (this.isRootNamespace(namespace)) {
      return path.join(this.swarmDir(), `${namespace}.yaml`);
    }

    return path.join(this.namespaceDir(namespace), `${key}.yaml`);
  }

  private isRootNamespace(
    namespace: string,
  ): namespace is keyof typeof RootNamespaceSchemas {
    return namespace in RootNamespaceSchemas;
  }

  private schemaFor(namespace: string, key: string): z.ZodTypeAny {
    if (this.isRootNamespace(namespace)) {
      return RootNamespaceSchemas[namespace];
    }

    if (namespace === "best") {
      if (key === "metadata") {
        return BestMetadataSchema;
      }

      if (key === "strategy") {
        return StrategySchema;
      }
    }

    return (
      NestedNamespaceSchemas[
        namespace as keyof typeof NestedNamespaceSchemas
      ] ?? GenericRecordSchema
    );
  }
}
