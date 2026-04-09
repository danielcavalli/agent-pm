import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ExperimentResultSchema,
  ClaimSchema,
  HypothesisSchema,
  InsightSchema,
  NormalizationStatsSchema,
  StrategySchema,
  TacticsSchema,
} from "../../schemas/index.js";
import { listFiles, readYaml, writeYaml } from "../fs.js";
import { ValidationError, ZodValidationError } from "../errors.js";
import {
  applyBoardMutation,
  applyRuntimeMutation,
  aggregateResults,
  buildAnalysisSummary,
  computeExplorationCoverage,
  computeIdleRatio,
  acquireClaim,
  computeObservationMetadata,
  computeComposite,
  computeEscalationMetrics,
  checkExactDuplicate,
  checkSimilarDuplicate,
  computeMetrics,
  computeBoardHash,
  computeStrategyHash,
  detectTrend,
  EWMA_ALPHA,
  establishBaseline,
  FileSwarmStore,
  formatExperimentResult,
  jaccardWordSimilarity,
  levenshteinRatio,
  loadTactics,
  listInsights,
  normalize,
  parseExperimentResult,
  parseStoryResult,
  readConfigVersion,
  readGlobalBest,
  readObservation,
  revertBoardMutation,
  revertRuntimeMutation,
  searchInsights,
  filterInsightsByTag,
  listHypotheses,
  updateAgentBest,
  updateGlobalBest,
  updateStats,
  verifyBoardFence,
  verifyRuntimeFence,
  writeHypothesis,
  writeInsight,
  writeStrategyWithFence,
  writeObservation,
} from "../swarm-store.js";

const scoringTactics = TacticsSchema.parse({
  version: 1,
  tactics: [
    {
      name: "throughput",
      description: "Stories completed per hour",
      metric: "stories_per_hour",
      direction: "higher_is_better",
      weight: 0.5,
      measurement: "derived",
      source: "story_result",
    },
    {
      name: "quality",
      description: "Criteria pass rate",
      metric: "criteria_pass_rate",
      direction: "higher_is_better",
      weight: 0.3,
      measurement: "derived",
      source: "story_result",
    },
    {
      name: "waste",
      description: "Failed or blocked work ratio",
      metric: "waste_ratio",
      direction: "lower_is_better",
      weight: 0.2,
      measurement: "derived",
      source: "story_result",
    },
  ],
  profiles: {},
});

describe("FileSwarmStore", () => {
  let tmpRoot: string;
  let pmDir: string;
  let store: FileSwarmStore;

  const validObservation = {
    story_code: "PM-E057-S001",
    status: "done" as const,
    criteria_verified: ["Schema file exists"],
    criteria_failed: [],
    metrics: { stories_per_hour: 2.3 },
    strategy_hash: "abc123",
    board_hash: "def456",
    config_version: 1,
    started_at: "2026-03-14T10:30:00Z",
    completed_at: "2026-03-14T11:15:00Z",
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pm-swarm-store-"));
    pmDir = path.join(tmpRoot, ".pm");
    fs.mkdirSync(pmDir, { recursive: true });
    store = new FileSwarmStore(pmDir);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeBoardFile(relativePath: string, content: string): void {
    const filePath = path.join(pmDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }

  function writeStrategy(configVersion: number): void {
    writeYaml(path.join(pmDir, "swarm", "strategy.yaml"), {
      version: 1,
      config_version: configVersion,
      parameters: {
        dispatch: { max_concurrent_agents: 5 },
        heartbeat: {
          frequency_seconds: 15,
          stale_threshold_seconds: 60,
        },
        escalation: {
          confidence_autonomous: 0.85,
          confidence_review: 0.5,
          max_pending_escalations: 3,
        },
        experiment: {
          observation_window_stories: 10,
          claim_ttl_seconds: 900,
        },
      },
    });
  }

  function writeAgentState(
    agentId: string,
    state: Partial<{
      status: string;
      current_task: string | undefined;
      started_at: string;
      last_heartbeat: string;
      escalation: {
        type: "decision" | "clarification" | "approval" | "error";
        message: string;
        confidence: number;
        options?: string[];
      };
    }> = {},
  ): void {
    writeYaml(path.join(pmDir, "agents", `${agentId}.yaml`), {
      agent_id: agentId,
      status: state.status ?? "active",
      ...("current_task" in state
        ? state.current_task === undefined
          ? {}
          : { current_task: state.current_task }
        : { current_task: "PM-E059-S005" }),
      started_at: state.started_at ?? "2026-04-08T10:00:00Z",
      last_heartbeat: state.last_heartbeat ?? "2026-04-08T10:09:50Z",
      ...(state.escalation ? { escalation: state.escalation } : {}),
    });
  }

  function writeAgentResponse(agentId: string, respondedAt: string): void {
    writeYaml(path.join(pmDir, "agents", `${agentId}-response.yaml`), {
      responded_at: respondedAt,
    });
  }

  function initGitRepo(): string {
    childProcess.execFileSync("git", ["init"], {
      cwd: tmpRoot,
      encoding: "utf8",
    });
    childProcess.execFileSync("git", ["add", "."], {
      cwd: tmpRoot,
      encoding: "utf8",
    });
    childProcess.execFileSync(
      "git",
      [
        "-c",
        "user.name=PM Test",
        "-c",
        "user.email=pm-test@example.com",
        "commit",
        "-m",
        "initial",
      ],
      { cwd: tmpRoot, encoding: "utf8" },
    );

    return childProcess
      .execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: tmpRoot,
        encoding: "utf8",
      })
      .trim();
  }

  function createExperimentResult(overrides: Record<string, unknown> = {}) {
    return ExperimentResultSchema.parse({
      experiment_id: "2026-04-08T10:30:00Z-agent-exp-01-base-result",
      agent_id: "agent-exp-01",
      mutation_type: "runtime_config",
      description: "Increase max_concurrent_agents from 5 to 7",
      change_details: {
        parameter_path: "dispatch.max_concurrent_agents",
        old_value: 5,
        new_value: 7,
      },
      status: "keep",
      observation_window_stories: 10,
      tactic_scores: {
        throughput: { value: 3.2, direction: "higher_is_better" },
      },
      composite_score: 0.72,
      delta_vs_previous_best: 0.04,
      strategy_snapshot: { version: 1, config_version: 2 },
      board_hash: "sha256-123",
      started_at: "2026-04-08T10:30:00Z",
      completed_at: "2026-04-08T11:15:00Z",
      ...overrides,
    });
  }

  it("writes validated YAML and reads it back", async () => {
    await store.write("observations", "PM-E057-S001", validObservation);

    const filePath = path.join(
      pmDir,
      "swarm",
      "observations",
      "PM-E057-S001.yaml",
    );

    expect(fs.existsSync(filePath)).toBe(true);
    await expect(store.read("observations", "PM-E057-S001")).resolves.toEqual(
      validObservation,
    );
  });

  it("writes and reads observations via dedicated helpers", async () => {
    await writeObservation(pmDir, validObservation);

    await expect(readObservation(pmDir, "PM-E057-S001")).resolves.toEqual(
      validObservation,
    );
  });

  it("lists keys in sorted order", async () => {
    await store.write("observations", "PM-E057-S003", validObservation);
    await store.write("observations", "PM-E057-S001", validObservation);
    await store.write("observations", "PM-E057-S002", validObservation);

    await expect(store.list("observations")).resolves.toEqual([
      "PM-E057-S001",
      "PM-E057-S002",
      "PM-E057-S003",
    ]);
  });

  it("deletes existing files and ignores missing ones", async () => {
    await store.write("observations", "PM-E057-S001", validObservation);

    await expect(
      store.delete("observations", "PM-E057-S001"),
    ).resolves.toBeUndefined();
    await expect(
      store.read("observations", "PM-E057-S001"),
    ).resolves.toBeNull();
    await expect(
      store.delete("observations", "PM-E057-S001"),
    ).resolves.toBeUndefined();
  });

  it("returns null and warns on corrupted YAML", async () => {
    const filePath = path.join(pmDir, "swarm", "observations", "broken.yaml");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "story_code: [broken\n", "utf8");

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      await expect(store.read("observations", "broken")).resolves.toBeNull();
      expect(stderrChunks.some((chunk) => chunk.includes("Warning"))).toBe(
        true,
      );
      expect(stderrChunks.some((chunk) => chunk.includes("broken.yaml"))).toBe(
        true,
      );
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it("rejects invalid writes before persisting", async () => {
    await expect(
      store.write("observations", "invalid", {
        ...validObservation,
        status: "backlog",
      } as Record<string, unknown>),
    ).rejects.toBeInstanceOf(ZodValidationError);

    expect(
      fs.existsSync(path.join(pmDir, "swarm", "observations", "invalid.yaml")),
    ).toBe(false);
  });

  it("returns null for missing or invalid observation helper reads", async () => {
    await expect(readObservation(pmDir, "PM-E057-S404")).resolves.toBeNull();

    const invalidPath = path.join(
      pmDir,
      "swarm",
      "observations",
      "PM-E057-S999.yaml",
    );
    fs.mkdirSync(path.dirname(invalidPath), { recursive: true });
    fs.writeFileSync(invalidPath, "story_code: nope\n", "utf8");

    await expect(readObservation(pmDir, "PM-E057-S999")).resolves.toBeNull();
  });

  it("returns the no-strategy sentinel when strategy.yaml is absent", async () => {
    await expect(computeStrategyHash(pmDir)).resolves.toBe("no-strategy");
  });

  it("updates strategy hash when strategy.yaml changes", async () => {
    const strategyPath = path.join(pmDir, "swarm", "strategy.yaml");
    fs.mkdirSync(path.dirname(strategyPath), { recursive: true });
    fs.writeFileSync(strategyPath, "version: 1\nconfig_version: 1\n", "utf8");

    const initialHash = await computeStrategyHash(pmDir);

    fs.writeFileSync(strategyPath, "version: 1\nconfig_version: 2\n", "utf8");

    await expect(computeStrategyHash(pmDir)).resolves.not.toBe(initialHash);
  });

  it("returns config_version 0 in observation metadata when strategy.yaml is absent", async () => {
    await expect(computeObservationMetadata(pmDir)).resolves.toMatchObject({
      strategy_hash: "no-strategy",
      config_version: 0,
    });
  });

  it("reads config_version from strategy.yaml and falls back to 0 when absent", async () => {
    await expect(readConfigVersion(pmDir)).resolves.toBe(0);

    writeStrategy(4);

    await expect(readConfigVersion(pmDir)).resolves.toBe(4);
  });

  it("applies and reverts board mutations through git history", async () => {
    writeBoardFile("index.yaml", "project: PM\n");
    const initialHead = initGitRepo();

    const commitHash = await applyBoardMutation(pmDir, [
      [
        "node",
        "--input-type=module",
        "-e",
        JSON.stringify(
          [
            'import fs from "node:fs";',
            'import path from "node:path";',
            'const filePath = path.join(process.cwd(), ".pm", "index.yaml");',
            'fs.writeFileSync(filePath, "project: PM\\nupdated: true\\n", "utf8");',
          ].join(" "),
        ),
      ].join(" "),
    ]);

    expect(commitHash).not.toBe(initialHead);
    expect(
      childProcess
        .execFileSync("git", ["log", "-1", "--format=%s"], {
          cwd: tmpRoot,
          encoding: "utf8",
        })
        .trim(),
    ).toContain("swarm-experiment:");
    expect(fs.readFileSync(path.join(pmDir, "index.yaml"), "utf8")).toContain(
      "updated: true",
    );

    await expect(revertBoardMutation(pmDir, commitHash)).resolves.toBe(true);
    expect(
      childProcess
        .execFileSync("git", ["rev-list", "--count", "HEAD"], {
          cwd: tmpRoot,
          encoding: "utf8",
        })
        .trim(),
    ).toBe("3");
    expect(fs.readFileSync(path.join(pmDir, "index.yaml"), "utf8")).toBe(
      "project: PM\n",
    );
  });

  it("applies and reverts runtime mutations while keeping config_version monotonic", async () => {
    writeStrategy(1);
    writeYaml(path.join(pmDir, "swarm", "best", "strategy.yaml"), {
      version: 1,
      config_version: 1,
      parameters: {
        dispatch: { max_concurrent_agents: 5 },
        heartbeat: {
          frequency_seconds: 15,
          stale_threshold_seconds: 60,
        },
        escalation: {
          confidence_autonomous: 0.85,
          confidence_review: 0.5,
          max_pending_escalations: 3,
        },
        experiment: {
          observation_window_stories: 10,
          claim_ttl_seconds: 900,
        },
      },
    });

    await expect(
      applyRuntimeMutation(pmDir, "dispatch.max_concurrent_agents", 7),
    ).resolves.toBe(2);
    expect(
      readYaml(path.join(pmDir, "swarm", "strategy.yaml"), StrategySchema),
    ).toMatchObject({
      config_version: 2,
      parameters: {
        dispatch: { max_concurrent_agents: 7 },
      },
    });

    await expect(revertRuntimeMutation(pmDir)).resolves.toBe(3);
    expect(
      readYaml(path.join(pmDir, "swarm", "strategy.yaml"), StrategySchema),
    ).toMatchObject({
      config_version: 3,
      parameters: {
        dispatch: { max_concurrent_agents: 5 },
      },
    });
  });

  it("writes strategy changes with a matching fence and verifies runtime and board tokens", async () => {
    writeStrategy(2);
    const initialHead = initGitRepo();

    await expect(
      writeStrategyWithFence(
        pmDir,
        {
          version: 1,
          config_version: 999,
          parameters: {
            dispatch: { max_concurrent_agents: 7 },
            heartbeat: {
              frequency_seconds: 15,
              stale_threshold_seconds: 60,
            },
            escalation: {
              confidence_autonomous: 0.85,
              confidence_review: 0.5,
              max_pending_escalations: 3,
            },
            experiment: {
              observation_window_stories: 10,
              claim_ttl_seconds: 900,
            },
          },
        },
        2,
      ),
    ).resolves.toBe(true);

    await expect(readConfigVersion(pmDir)).resolves.toBe(3);
    await expect(verifyRuntimeFence(pmDir, 2)).resolves.toBe(true);
    await expect(verifyBoardFence(pmDir, initialHead)).resolves.toBe(true);
  });

  it("rejects strategy writes when the runtime fence version is stale", async () => {
    writeStrategy(3);

    await expect(
      writeStrategyWithFence(
        pmDir,
        {
          version: 1,
          config_version: 3,
          parameters: {
            dispatch: { max_concurrent_agents: 8 },
            heartbeat: {
              frequency_seconds: 15,
              stale_threshold_seconds: 60,
            },
            escalation: {
              confidence_autonomous: 0.85,
              confidence_review: 0.5,
              max_pending_escalations: 3,
            },
            experiment: {
              observation_window_stories: 10,
              claim_ttl_seconds: 900,
            },
          },
        },
        2,
      ),
    ).resolves.toBe(false);

    await expect(readConfigVersion(pmDir)).resolves.toBe(3);
    await expect(verifyRuntimeFence(pmDir, 3)).resolves.toBe(false);
  });

  it("detects board fence divergence when HEAD changes", async () => {
    writeStrategy(1);
    fs.writeFileSync(path.join(tmpRoot, "tracked.txt"), "first\n", "utf8");
    const initialHead = initGitRepo();

    fs.writeFileSync(path.join(tmpRoot, "tracked.txt"), "second\n", "utf8");
    childProcess.execFileSync("git", ["add", "tracked.txt"], {
      cwd: tmpRoot,
      encoding: "utf8",
    });
    childProcess.execFileSync(
      "git",
      [
        "-c",
        "user.name=PM Test",
        "-c",
        "user.email=pm-test@example.com",
        "commit",
        "-m",
        "advance-head",
      ],
      { cwd: tmpRoot, encoding: "utf8" },
    );

    await expect(verifyBoardFence(pmDir, initialHead)).resolves.toBe(false);
  });

  it("propagates config_version from strategy.yaml into observation files", async () => {
    const strategyPath = path.join(pmDir, "swarm", "strategy.yaml");
    fs.mkdirSync(path.dirname(strategyPath), { recursive: true });
    writeYaml(strategyPath, {
      version: 1,
      config_version: 7,
      parameters: {
        dispatch: { max_concurrent_agents: 5 },
        heartbeat: {
          frequency_seconds: 15,
          stale_threshold_seconds: 60,
        },
        escalation: {
          confidence_autonomous: 0.85,
          confidence_review: 0.5,
          max_pending_escalations: 3,
        },
        experiment: {
          observation_window_stories: 10,
          claim_ttl_seconds: 900,
        },
      },
    });

    const metadata = await computeObservationMetadata(pmDir);
    const record = {
      ...validObservation,
      story_code: "PM-E058-S005",
      ...metadata,
    };

    await writeObservation(pmDir, record);

    await expect(readObservation(pmDir, "PM-E058-S005")).resolves.toEqual(
      record,
    );
  });

  it("keeps board hash stable across file write order and key reserialization", async () => {
    writeBoardFile(
      "index.yaml",
      [
        "status: active",
        "name: Test Project",
        "code: PM",
        "story_count: 2",
        "epic_count: 2",
        "stories_done: 1",
        'last_updated: "2026-04-08"',
        "",
      ].join("\n"),
    );
    writeBoardFile(
      "epics/E002-second.yaml",
      [
        "title: Second Epic",
        "id: E002",
        "description: second",
        "code: PM-E002",
        "priority: medium",
        "status: backlog",
        'created_at: "2026-04-08"',
        "stories: []",
        "",
      ].join("\n"),
    );
    writeBoardFile(
      "epics/E001-first.yaml",
      [
        "stories: []",
        'created_at: "2026-04-08"',
        "priority: high",
        "status: in_progress",
        "description: first",
        "title: First Epic",
        "code: PM-E001",
        "id: E001",
        "",
      ].join("\n"),
    );

    const initialHash = await computeBoardHash(pmDir);

    writeBoardFile(
      "epics/E001-first.yaml",
      [
        "code: PM-E001",
        'created_at: "2026-04-08"',
        "description: first",
        "id: E001",
        "priority: high",
        "status: in_progress",
        "stories: []",
        "title: First Epic",
        "",
      ].join("\n"),
    );
    writeBoardFile(
      "epics/E002-second.yaml",
      [
        "stories: []",
        "status: backlog",
        "priority: medium",
        "id: E002",
        "code: PM-E002",
        "description: second",
        'created_at: "2026-04-08"',
        "title: Second Epic",
        "",
      ].join("\n"),
    );
    writeBoardFile(
      "index.yaml",
      [
        'last_updated: "2026-04-08"',
        "stories_done: 1",
        "story_count: 2",
        "epic_count: 2",
        "status: active",
        "code: PM",
        "name: Test Project",
        "",
      ].join("\n"),
    );

    await expect(computeBoardHash(pmDir)).resolves.toBe(initialHash);
  });

  it("changes board hash when an epic changes", async () => {
    writeBoardFile(
      "index.yaml",
      [
        "code: PM",
        "name: Test Project",
        "status: active",
        "epic_count: 1",
        "story_count: 1",
        "stories_done: 0",
        'last_updated: "2026-04-08"',
        "",
      ].join("\n"),
    );
    writeBoardFile(
      "epics/E001-first.yaml",
      [
        "id: E001",
        "code: PM-E001",
        "title: First Epic",
        "description: before",
        "status: backlog",
        "priority: high",
        'created_at: "2026-04-08"',
        "stories: []",
        "",
      ].join("\n"),
    );

    const initialHash = await computeBoardHash(pmDir);

    writeBoardFile(
      "epics/E001-first.yaml",
      [
        "id: E001",
        "code: PM-E001",
        "title: First Epic",
        "description: after",
        "status: backlog",
        "priority: high",
        'created_at: "2026-04-08"',
        "stories: []",
        "",
      ].join("\n"),
    );

    await expect(computeBoardHash(pmDir)).resolves.not.toBe(initialHash);
  });

  it("computes story_result metrics from matching observations", async () => {
    const tacticsPath = path.join(pmDir, "swarm", "tactics.yaml");
    fs.mkdirSync(path.dirname(tacticsPath), { recursive: true });
    writeYaml(tacticsPath, {
      version: 1,
      tactics: [
        {
          name: "throughput",
          description: "Stories completed per wall-clock hour",
          metric: "stories_per_hour",
          direction: "higher_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "quality",
          description: "Acceptance criteria verified on first pass",
          metric: "criteria_pass_rate",
          direction: "higher_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "waste",
          description: "Failed or blocked attempts",
          metric: "waste_ratio",
          direction: "lower_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "coordination",
          description: "Duplicate story observations",
          metric: "duplicate_and_conflict_ratio",
          direction: "lower_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
      ],
      profiles: {
        balanced: {
          throughput: 0.25,
          quality: 0.25,
          waste: 0.25,
          coordination: 0.25,
        },
      },
    });

    const observations = [
      {
        story_code: "PM-E059-S010",
        status: "done" as const,
        criteria_verified: ["a", "b"],
        criteria_failed: [],
        metrics: {},
        strategy_hash: "strategy-a",
        board_hash: "board-a",
        config_version: 1,
        started_at: "2026-04-08T10:00:00Z",
        completed_at: "2026-04-08T10:30:00Z",
      },
      {
        story_code: "PM-E059-S011",
        status: "done" as const,
        criteria_verified: ["c"],
        criteria_failed: ["d"],
        metrics: {},
        strategy_hash: "strategy-a",
        board_hash: "board-a",
        config_version: 1,
        started_at: "2026-04-08T10:15:00Z",
        completed_at: "2026-04-08T11:00:00Z",
      },
      {
        story_code: "PM-E059-S011",
        status: "blocked" as const,
        criteria_verified: [],
        criteria_failed: ["e"],
        metrics: {},
        strategy_hash: "strategy-a",
        board_hash: "board-a",
        config_version: 1,
        started_at: "2026-04-08T10:20:00Z",
        completed_at: "2026-04-08T12:00:00Z",
      },
    ];

    for (const [index, observation] of observations.entries()) {
      writeYaml(
        path.join(pmDir, "swarm", "observations", `fixture-${index + 1}.yaml`),
        observation,
      );
    }

    writeYaml(path.join(pmDir, "swarm", "observations", "ignored.yaml"), {
      ...observations[0],
      story_code: "PM-E059-S099",
      strategy_hash: "strategy-b",
    });

    await expect(
      computeMetrics(pmDir, "strategy-a", "board-a"),
    ).resolves.toEqual({
      stories_per_hour: 1,
      criteria_pass_rate: 0.6,
      waste_ratio: 1 / 3,
      duplicate_and_conflict_ratio: 1 / 3,
    });
  });

  it("returns 0 for story_result metrics when matching observations lack enough data", async () => {
    const tacticsPath = path.join(pmDir, "swarm", "tactics.yaml");
    fs.mkdirSync(path.dirname(tacticsPath), { recursive: true });
    writeYaml(tacticsPath, {
      version: 1,
      tactics: [
        {
          name: "throughput",
          description: "Stories completed per wall-clock hour",
          metric: "stories_per_hour",
          direction: "higher_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "quality",
          description: "Acceptance criteria verified on first pass",
          metric: "criteria_pass_rate",
          direction: "higher_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "waste",
          description: "Failed or blocked attempts",
          metric: "waste_ratio",
          direction: "lower_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
        {
          name: "coordination",
          description: "Duplicate story observations",
          metric: "duplicate_and_conflict_ratio",
          direction: "lower_is_better",
          weight: 0.25,
          measurement: "derived",
          source: "story_result",
        },
      ],
      profiles: {
        balanced: {
          throughput: 0.25,
          quality: 0.25,
          waste: 0.25,
          coordination: 0.25,
        },
      },
    });

    const observations = [
      {
        story_code: "PM-E059-S020",
        status: "failed" as const,
        criteria_verified: [],
        criteria_failed: [],
        metrics: {},
        strategy_hash: "strategy-z",
        board_hash: "board-z",
        config_version: 2,
        started_at: "2026-04-08T09:00:00Z",
        completed_at: "2026-04-08T09:00:00Z",
      },
      {
        story_code: "PM-E059-S021",
        status: "blocked" as const,
        criteria_verified: [],
        criteria_failed: [],
        metrics: {},
        strategy_hash: "strategy-z",
        board_hash: "board-z",
        config_version: 2,
        started_at: "2026-04-08T09:00:00Z",
        completed_at: "2026-04-08T09:00:00Z",
      },
      {
        story_code: "PM-E059-S022",
        status: "failed" as const,
        criteria_verified: [],
        criteria_failed: [],
        metrics: {},
        strategy_hash: "strategy-other",
        board_hash: "board-z",
        config_version: 3,
        started_at: "2026-04-08T09:00:00Z",
        completed_at: "2026-04-08T10:00:00Z",
      },
    ];

    for (const [index, observation] of observations.entries()) {
      writeYaml(
        path.join(
          pmDir,
          "swarm",
          "observations",
          `zero-fixture-${index + 1}.yaml`,
        ),
        observation,
      );
    }

    await expect(
      computeMetrics(pmDir, "strategy-z", "board-z"),
    ).resolves.toEqual({
      stories_per_hour: 0,
      criteria_pass_rate: 0,
      waste_ratio: 1,
      duplicate_and_conflict_ratio: 0,
    });
  });

  it("returns an idle ratio near zero when all agents are active", () => {
    writeStrategy(1);
    writeAgentState("agent-a", {
      current_task: "PM-E059-S010",
      last_heartbeat: "2026-04-08T10:09:50Z",
    });
    writeAgentState("agent-b", {
      current_task: "PM-E059-S011",
      last_heartbeat: "2026-04-08T10:09:50Z",
    });

    const agentAPath = path.join(pmDir, "agents", "agent-a.yaml");
    fs.utimesSync(
      agentAPath,
      new Date("2020-01-01T00:00:00Z"),
      new Date("2020-01-01T00:00:00Z"),
    );

    expect(
      computeIdleRatio(pmDir, "2026-04-08T10:00:00Z", "2026-04-08T10:10:00Z"),
    ).toBeCloseTo(0, 10);
  });

  it("computes a mixed active and idle heartbeat ratio using default timing when strategy is absent", () => {
    writeAgentState("agent-active", {
      current_task: "PM-E059-S012",
      last_heartbeat: "2026-04-08T10:09:50Z",
    });
    writeAgentState("agent-idle", {
      status: "idle",
      current_task: undefined,
      last_heartbeat: "2026-04-08T10:09:50Z",
    });

    expect(
      computeIdleRatio(pmDir, "2026-04-08T10:00:00Z", "2026-04-08T10:10:00Z"),
    ).toBeCloseTo(0.5, 10);
  });

  it("excludes gone time after an agent becomes stale mid-window", () => {
    writeStrategy(1);
    writeAgentState("agent-gone", {
      current_task: "PM-E059-S013",
      last_heartbeat: "2026-04-08T10:00:30Z",
    });
    writeAgentState("agent-idle", {
      status: "idle",
      current_task: undefined,
      last_heartbeat: "2026-04-08T10:01:50Z",
    });

    expect(
      computeIdleRatio(pmDir, "2026-04-08T10:00:00Z", "2026-04-08T10:02:00Z"),
    ).toBeCloseTo(0.25, 10);
  });

  it("includes heartbeat idle ratio in computed metrics for the observation window", async () => {
    writeStrategy(1);
    writeYaml(path.join(pmDir, "swarm", "tactics.yaml"), {
      version: 1,
      tactics: [
        {
          name: "idle-time",
          description: "Fraction of engaged agent time spent idle",
          metric: "idle_ratio",
          direction: "lower_is_better",
          weight: 1,
          measurement: "derived",
          source: "heartbeat",
        },
      ],
      profiles: {
        balanced: {
          "idle-time": 1,
        },
      },
    });
    writeAgentState("agent-active", {
      current_task: "PM-E059-S014",
      last_heartbeat: "2026-04-08T10:29:50Z",
    });
    writeAgentState("agent-idle", {
      status: "idle",
      current_task: undefined,
      last_heartbeat: "2026-04-08T10:29:50Z",
    });
    writeYaml(path.join(pmDir, "swarm", "observations", "fixture.yaml"), {
      story_code: "PM-E059-S014",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-hb",
      board_hash: "board-hb",
      config_version: 1,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    });

    await expect(
      computeMetrics(pmDir, "strategy-hb", "board-hb"),
    ).resolves.toEqual({
      idle_ratio: 0.5,
    });
  });

  it("computes escalation median response time and ratio from agent state and observations", () => {
    writeYaml(path.join(pmDir, "swarm", "observations", "story-1.yaml"), {
      story_code: "PM-E059-S101",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    });
    writeYaml(path.join(pmDir, "swarm", "observations", "story-2.yaml"), {
      story_code: "PM-E059-S102",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:05:00Z",
      completed_at: "2026-04-08T10:45:00Z",
    });
    writeYaml(path.join(pmDir, "swarm", "observations", "story-3.yaml"), {
      story_code: "PM-E059-S103",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:10:00Z",
      completed_at: "2026-04-08T10:50:00Z",
    });
    writeAgentState("agent-a", {
      status: "needs_attention",
      current_task: "PM-E059-S101",
      last_heartbeat: "2026-04-08T10:05:00Z",
      escalation: {
        type: "decision",
        message: "Need input",
        confidence: 0.8,
      },
    });
    writeAgentResponse("agent-a", "2026-04-08T10:15:00Z");
    writeAgentState("agent-b", {
      status: "needs_attention",
      current_task: "PM-E059-S102",
      last_heartbeat: "2026-04-08T10:20:00Z",
      escalation: {
        type: "clarification",
        message: "Need clarification",
        confidence: 0.6,
      },
    });
    writeAgentResponse("agent-b", "2026-04-08T10:50:00Z");

    expect(
      computeEscalationMetrics(
        pmDir,
        "2026-04-08T10:00:00Z",
        "2026-04-08T11:00:00Z",
      ),
    ).toEqual({
      escalation_response_median_seconds: 1200,
      escalation_ratio: 2 / 3,
    });
  });

  it("returns zero escalation metrics when the window has no escalation data", () => {
    writeYaml(path.join(pmDir, "swarm", "observations", "story-1.yaml"), {
      story_code: "PM-E059-S104",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    });

    expect(
      computeEscalationMetrics(
        pmDir,
        "2026-04-08T10:00:00Z",
        "2026-04-08T11:00:00Z",
      ),
    ).toEqual({
      escalation_response_median_seconds: 0,
      escalation_ratio: 0,
    });
  });

  it("includes escalation metrics in computed metrics for the observation window", async () => {
    writeYaml(path.join(pmDir, "swarm", "tactics.yaml"), {
      version: 1,
      tactics: [
        {
          name: "escalation-responsiveness",
          description: "Median escalation response time",
          metric: "escalation_response_median_seconds",
          direction: "lower_is_better",
          weight: 0.6,
          measurement: "derived",
          source: "escalation",
        },
        {
          name: "escalation-rate",
          description: "Fraction of stories with escalations",
          metric: "escalation_ratio",
          direction: "lower_is_better",
          weight: 0.4,
          measurement: "derived",
          source: "escalation",
        },
      ],
      profiles: {
        balanced: {
          "escalation-responsiveness": 0.6,
          "escalation-rate": 0.4,
        },
      },
    });
    writeYaml(path.join(pmDir, "swarm", "observations", "story-1.yaml"), {
      story_code: "PM-E059-S105",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    });
    writeYaml(path.join(pmDir, "swarm", "observations", "story-2.yaml"), {
      story_code: "PM-E059-S106",
      status: "done",
      criteria_verified: ["done"],
      criteria_failed: [],
      metrics: {},
      strategy_hash: "strategy-esc",
      board_hash: "board-es",
      config_version: 1,
      started_at: "2026-04-08T10:15:00Z",
      completed_at: "2026-04-08T10:45:00Z",
    });
    writeAgentState("agent-a", {
      status: "needs_attention",
      current_task: "PM-E059-S105",
      last_heartbeat: "2026-04-08T10:05:00Z",
      escalation: {
        type: "decision",
        message: "Need decision",
        confidence: 0.8,
      },
    });
    writeAgentResponse("agent-a", "2026-04-08T10:25:00Z");

    await expect(
      computeMetrics(pmDir, "strategy-esc", "board-es"),
    ).resolves.toEqual({
      escalation_response_median_seconds: 1200,
      escalation_ratio: 0.5,
    });
  });

  it("aggregates valid result files and skips invalid fixtures with a warning", async () => {
    const resultFixtures = [
      createExperimentResult({
        experiment_id: "exp-01",
        description: "Increase max_concurrent_agents to 7",
      }),
      createExperimentResult({
        experiment_id: "exp-02",
        description: "Increase max_concurrent_agents to 8",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 7,
          new_value: 8,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-03",
        mutation_type: "runtime_config",
        description: "Raise autonomous confidence",
        change_details: {
          parameter_path: "escalation.confidence_autonomous",
          old_value: 0.85,
          new_value: 0.9,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-04",
        mutation_type: "board_mutation",
        description: "Raise priority for PM-E062-S002",
        change_details: {
          pm_commands: ["pm story update PM-E062-S002 --priority high"],
          board_commit: "abc123",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-05",
        mutation_type: "board_mutation",
        description: "Add dependency to PM-E062-S002",
        change_details: {
          pm_commands: [
            "pm story update PM-E062-S003 --depends-on PM-E062-S002",
          ],
          board_commit: "def456",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-06",
        mutation_type: "board_mutation",
        description: "Split a new story from the epic",
        change_details: {
          pm_commands: ["pm story add PM-E062 Create follow-up analysis view"],
          board_commit: "ghi789",
        },
      }),
    ];

    for (const [index, result] of resultFixtures.entries()) {
      writeYaml(
        path.join(pmDir, "swarm", "results", `fixture-0${index + 1}.yaml`),
        result,
      );
    }

    fs.mkdirSync(path.join(pmDir, "swarm", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(pmDir, "swarm", "results", "invalid.yaml"),
      "experiment_id: broken\nchange_details: [\n",
      "utf8",
    );

    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      const results = await aggregateResults(pmDir);

      expect(results.map((result) => result.experiment_id)).toEqual([
        "exp-01",
        "exp-02",
        "exp-03",
        "exp-04",
        "exp-05",
        "exp-06",
      ]);
      expect(stderrChunks.some((chunk) => chunk.includes("invalid.yaml"))).toBe(
        true,
      );
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("computes exploration coverage for runtime config paths and board mutation categories", () => {
    const results = [
      createExperimentResult({
        experiment_id: "exp-01",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 5,
          new_value: 7,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-02",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 7,
          new_value: 8,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-03",
        change_details: {
          parameter_path: "escalation.confidence_autonomous",
          old_value: 0.85,
          new_value: 0.9,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-04",
        mutation_type: "board_mutation",
        change_details: {
          pm_commands: ["pm story update PM-E062-S002 --priority high"],
          board_commit: "abc123",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-05",
        mutation_type: "board_mutation",
        change_details: {
          pm_commands: [
            "pm story update PM-E062-S003 --depends-on PM-E062-S002",
          ],
          board_commit: "def456",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-06",
        mutation_type: "board_mutation",
        change_details: {
          pm_commands: ["pm story add PM-E062 Create follow-up analysis view"],
          board_commit: "ghi789",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-07",
        mutation_type: "board_mutation",
        change_details: {
          pm_commands: ["pm prioritize PM-E062-S003 high"],
          board_commit: "jkl012",
        },
      }),
    ];

    expect(computeExplorationCoverage(results)).toEqual({
      runtime_config: {
        "dispatch.max_concurrent_agents": 2,
        "escalation.confidence_autonomous": 1,
      },
      board_mutations: {
        priority_changes: 2,
        dependency_changes: 1,
        story_splits: 1,
      },
    });
  });

  it("reads global best metadata and returns null when absent", async () => {
    await expect(readGlobalBest(pmDir)).resolves.toBeNull();

    const metadata = {
      status: "active",
      composite_score: 0.88,
      experiment_id: "exp-best",
      strategy_snapshot: { version: 1, config_version: 4 },
      board_hash: "sha256-best",
      updated_at: "2026-04-08T12:00:00Z",
      previous_best_score: 0.72,
      previous_best_experiment_id: "exp-previous",
    };
    writeYaml(path.join(pmDir, "swarm", "best", "metadata.yaml"), metadata);

    await expect(readGlobalBest(pmDir)).resolves.toEqual(metadata);
  });

  it("updates an agent personal best only when the score improves", async () => {
    const initialBest = createExperimentResult({
      experiment_id: "exp-agent-best-01",
      composite_score: 0.61,
    });
    const improvedBest = createExperimentResult({
      experiment_id: "exp-agent-best-02",
      composite_score: 0.73,
    });
    const lowerScore = createExperimentResult({
      experiment_id: "exp-agent-best-03",
      composite_score: 0.59,
    });
    const filePath = path.join(pmDir, "swarm", "best", "agent-exp-01.yaml");

    await expect(
      updateAgentBest(pmDir, "agent-exp-01", initialBest),
    ).resolves.toBe(true);
    expect(readYaml(filePath, ExperimentResultSchema)).toEqual(initialBest);

    await expect(
      updateAgentBest(pmDir, "agent-exp-01", lowerScore),
    ).resolves.toBe(false);
    expect(readYaml(filePath, ExperimentResultSchema)).toEqual(initialBest);

    await expect(
      updateAgentBest(pmDir, "agent-exp-01", improvedBest),
    ).resolves.toBe(true);
    expect(readYaml(filePath, ExperimentResultSchema)).toEqual(improvedBest);
  });

  it("updates the global best metadata and preserves the previous best for audit", async () => {
    writeYaml(path.join(pmDir, "swarm", "best", "metadata.yaml"), {
      status: "active",
      composite_score: 0.58,
      experiment_id: "exp-baseline",
      strategy_snapshot: { version: 1, config_version: 1 },
      board_hash: "sha256-baseline",
      updated_at: "2026-04-08T09:00:00Z",
    });

    const candidate = createExperimentResult({
      experiment_id: "exp-best-02",
      composite_score: 0.74,
      strategy_snapshot: {
        version: 1,
        config_version: 2,
        parameters: {
          dispatch: { max_concurrent_agents: 7 },
          heartbeat: {
            frequency_seconds: 15,
            stale_threshold_seconds: 60,
          },
          escalation: {
            confidence_autonomous: 0.85,
            confidence_review: 0.5,
            max_pending_escalations: 3,
          },
          experiment: {
            observation_window_stories: 10,
            claim_ttl_seconds: 900,
          },
        },
      },
      board_hash: "sha256-improved",
      completed_at: "2026-04-08T12:35:00Z",
    });

    await expect(updateGlobalBest(pmDir, candidate)).resolves.toBe(true);
    await expect(readGlobalBest(pmDir)).resolves.toEqual({
      status: "active",
      composite_score: 0.74,
      experiment_id: "exp-best-02",
      strategy_snapshot: candidate.strategy_snapshot,
      board_hash: "sha256-improved",
      updated_at: "2026-04-08T12:35:00Z",
      previous_best_score: 0.58,
      previous_best_experiment_id: "exp-baseline",
    });
    expect(
      readYaml(
        path.join(pmDir, "swarm", "best", "strategy.yaml"),
        StrategySchema,
      ),
    ).toEqual(candidate.strategy_snapshot);
  });

  it("rejects non-positive composite scores when updating the global best", async () => {
    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      await expect(
        updateGlobalBest(
          pmDir,
          createExperimentResult({
            experiment_id: "exp-invalid",
            composite_score: 0,
          }),
        ),
      ).resolves.toBe(false);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain("Error result, not updating best");
    await expect(readGlobalBest(pmDir)).resolves.toBeNull();
  });

  it("rejects anomalous best-score jumps", async () => {
    writeYaml(path.join(pmDir, "swarm", "best", "metadata.yaml"), {
      status: "active",
      composite_score: 0.4,
      experiment_id: "exp-current",
      strategy_snapshot: { version: 1, config_version: 1 },
      board_hash: "sha256-current",
      updated_at: "2026-04-08T09:00:00Z",
    });

    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      await expect(
        updateGlobalBest(
          pmDir,
          createExperimentResult({
            experiment_id: "exp-anomalous",
            composite_score: 0.85,
            strategy_snapshot: {
              version: 1,
              config_version: 2,
              parameters: {
                dispatch: { max_concurrent_agents: 8 },
                heartbeat: {
                  frequency_seconds: 15,
                  stale_threshold_seconds: 60,
                },
                escalation: {
                  confidence_autonomous: 0.85,
                  confidence_review: 0.5,
                  max_pending_escalations: 3,
                },
                experiment: {
                  observation_window_stories: 10,
                  claim_ttl_seconds: 900,
                },
              },
            },
          }),
        ),
      ).resolves.toBe(false);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain("Anomalous improvement, skipping");
    await expect(readGlobalBest(pmDir)).resolves.toMatchObject({
      experiment_id: "exp-current",
      composite_score: 0.4,
    });
  });

  it("retries global best writes when a concurrent update changes the current best", async () => {
    const metadataPath = path.join(pmDir, "swarm", "best", "metadata.yaml");
    writeYaml(metadataPath, {
      status: "active",
      composite_score: 0.5,
      experiment_id: "exp-current",
      strategy_snapshot: { version: 1, config_version: 1 },
      board_hash: "sha256-current",
      updated_at: "2026-04-08T09:00:00Z",
    });

    let injectedConcurrentWrite = false;
    const baseCandidate = createExperimentResult({
      experiment_id: "exp-retry",
      composite_score: 0.7,
      strategy_snapshot: {
        version: 1,
        config_version: 3,
        parameters: {
          dispatch: { max_concurrent_agents: 7 },
          heartbeat: {
            frequency_seconds: 15,
            stale_threshold_seconds: 60,
          },
          escalation: {
            confidence_autonomous: 0.85,
            confidence_review: 0.5,
            max_pending_escalations: 3,
          },
          experiment: {
            observation_window_stories: 10,
            claim_ttl_seconds: 900,
          },
        },
      },
      board_hash: "sha256-retry",
      completed_at: "2026-04-08T12:35:00Z",
    });
    const candidate = {
      ...baseCandidate,
      get strategy_snapshot() {
        if (!injectedConcurrentWrite) {
          injectedConcurrentWrite = true;
          writeYaml(metadataPath, {
            status: "active",
            composite_score: 0.55,
            experiment_id: "exp-racing-writer",
            strategy_snapshot: { version: 1, config_version: 2 },
            board_hash: "sha256-race",
            updated_at: "2026-04-08T10:00:00Z",
          });
        }

        return baseCandidate.strategy_snapshot;
      },
    } as unknown as ReturnType<typeof createExperimentResult>;

    await expect(updateGlobalBest(pmDir, candidate)).resolves.toBe(true);
    await expect(readGlobalBest(pmDir)).resolves.toEqual({
      status: "active",
      composite_score: 0.7,
      experiment_id: "exp-retry",
      strategy_snapshot: baseCandidate.strategy_snapshot,
      board_hash: "sha256-retry",
      updated_at: "2026-04-08T12:35:00Z",
      previous_best_score: 0.55,
      previous_best_experiment_id: "exp-racing-writer",
    });
    expect(injectedConcurrentWrite).toBe(true);
  });

  it("establishes an active baseline from matching observations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));

    writeStrategy(1);
    writeYaml(path.join(pmDir, "swarm", "tactics.yaml"), scoringTactics);
    writeYaml(path.join(pmDir, "swarm", "normalization-stats.yaml"), {
      stories_per_hour: {
        count: 2,
        mean: 1,
        variance: 1,
        ewma_mean: 1,
        ewma_variance: 1,
      },
      criteria_pass_rate: {
        count: 2,
        mean: 0.5,
        variance: 0.25,
        ewma_mean: 0.5,
        ewma_variance: 0.25,
      },
      waste_ratio: {
        count: 2,
        mean: 0.5,
        variance: 0.25,
        ewma_mean: 0.5,
        ewma_variance: 0.25,
      },
    });

    const observationMetadata = await computeObservationMetadata(pmDir);
    await writeObservation(pmDir, {
      story_code: "PM-E060-S001",
      status: "done",
      criteria_verified: ["criterion-a", "criterion-b"],
      criteria_failed: [],
      metrics: {},
      ...observationMetadata,
      started_at: "2026-04-08T10:00:00Z",
      completed_at: "2026-04-08T10:30:00Z",
    });
    await writeObservation(pmDir, {
      story_code: "PM-E060-S002",
      status: "done",
      criteria_verified: ["criterion-c"],
      criteria_failed: ["criterion-d"],
      metrics: {},
      ...observationMetadata,
      started_at: "2026-04-08T10:15:00Z",
      completed_at: "2026-04-08T11:00:00Z",
    });
    await writeObservation(pmDir, {
      story_code: "PM-E060-S003",
      status: "failed",
      criteria_verified: [],
      criteria_failed: ["criterion-e"],
      metrics: {},
      ...observationMetadata,
      started_at: "2026-04-08T10:30:00Z",
      completed_at: "2026-04-08T11:00:00Z",
    });

    const best = await establishBaseline(pmDir);

    expect(best.status).toBe("active");
    expect(best.composite_score).toBeCloseTo(0.06, 10);
    expect(best.experiment_id).toBe("baseline");
    expect(best.strategy_snapshot).toEqual(
      readYaml(path.join(pmDir, "swarm", "strategy.yaml"), StrategySchema),
    );
    expect(best.board_hash).toBe(observationMetadata.board_hash);
    expect(best.updated_at).toBe("2026-04-08T12:00:00.000Z");
    await expect(readGlobalBest(pmDir)).resolves.toEqual(best);
    expect(
      fs.readFileSync(
        path.join(pmDir, "swarm", "best", "strategy.yaml"),
        "utf8",
      ),
    ).toBe(fs.readFileSync(path.join(pmDir, "swarm", "strategy.yaml"), "utf8"));
  });

  it("writes an awaiting-baseline placeholder when no matching observations exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T13:00:00Z"));

    writeStrategy(1);
    const best = await establishBaseline(pmDir);

    expect(best).toEqual({
      status: "awaiting-baseline",
      composite_score: null,
      experiment_id: "baseline",
      strategy_snapshot: readYaml(
        path.join(pmDir, "swarm", "strategy.yaml"),
        StrategySchema,
      ),
      board_hash: await computeBoardHash(pmDir),
      updated_at: "2026-04-08T13:00:00.000Z",
    });
    expect(
      fs.readFileSync(
        path.join(pmDir, "swarm", "best", "strategy.yaml"),
        "utf8",
      ),
    ).toBe(fs.readFileSync(path.join(pmDir, "swarm", "strategy.yaml"), "utf8"));
  });

  it("returns the existing best metadata without rewriting baseline files", async () => {
    writeStrategy(1);
    const existingBest = {
      status: "active",
      composite_score: 0.9,
      experiment_id: "exp-existing",
      strategy_snapshot: { version: 1, config_version: 99 },
      board_hash: "sha256-existing",
      updated_at: "2026-04-08T09:00:00Z",
      previous_best_score: 0.7,
      previous_best_experiment_id: "exp-previous",
    };
    writeYaml(path.join(pmDir, "swarm", "best", "metadata.yaml"), existingBest);
    writeYaml(path.join(pmDir, "swarm", "best", "strategy.yaml"), {
      version: 1,
      config_version: 99,
      parameters: {
        dispatch: { max_concurrent_agents: 1 },
        heartbeat: {
          frequency_seconds: 15,
          stale_threshold_seconds: 60,
        },
        escalation: {
          confidence_autonomous: 0.85,
          confidence_review: 0.5,
          max_pending_escalations: 3,
        },
        experiment: {
          observation_window_stories: 10,
          claim_ttl_seconds: 900,
        },
      },
    });
    const originalBestStrategy = fs.readFileSync(
      path.join(pmDir, "swarm", "best", "strategy.yaml"),
      "utf8",
    );

    await expect(establishBaseline(pmDir)).resolves.toEqual(existingBest);
    expect(
      fs.readFileSync(
        path.join(pmDir, "swarm", "best", "strategy.yaml"),
        "utf8",
      ),
    ).toBe(originalBestStrategy);
  });

  it("detects an improving trend from ascending composite scores", () => {
    const results = Array.from({ length: 10 }, (_, index) =>
      createExperimentResult({
        experiment_id: `exp-${index + 1}`,
        composite_score: 0.5 + index * 0.02,
        completed_at: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      }),
    );

    expect(detectTrend(results)).toBe("improving");
  });

  it("detects a plateaued trend from flat composite scores", () => {
    const results = Array.from({ length: 10 }, (_, index) =>
      createExperimentResult({
        experiment_id: `exp-${index + 1}`,
        composite_score: 0.71,
        completed_at: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      }),
    );

    expect(detectTrend(results)).toBe("plateaued");
  });

  it("detects a regressing trend from descending composite scores", () => {
    const results = Array.from({ length: 10 }, (_, index) =>
      createExperimentResult({
        experiment_id: `exp-${index + 1}`,
        composite_score: 0.9 - index * 0.03,
        completed_at: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      }),
    );

    expect(detectTrend(results)).toBe("regressing");
  });

  it("uses all available results for trend detection when fewer than ten exist", () => {
    expect(detectTrend([])).toBe("plateaued");
    expect(
      detectTrend([
        createExperimentResult({
          experiment_id: "exp-01",
          composite_score: 0.6,
          completed_at: "2026-04-01T12:00:00Z",
        }),
      ]),
    ).toBe("plateaued");

    const results = [0.4, 0.45, 0.5, 0.58, 0.64].map((score, index) =>
      createExperimentResult({
        experiment_id: `exp-${index + 1}`,
        composite_score: score,
        completed_at: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      }),
    );

    expect(detectTrend(results)).toBe("improving");
  });

  it("builds a composite analysis summary from swarm state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));

    const results = [
      createExperimentResult({
        experiment_id: "exp-01",
        agent_id: "agent-a",
        mutation_type: "runtime_config",
        composite_score: 0.5,
        description: "Increase max_concurrent_agents to 7",
        completed_at: "2026-04-01T12:00:00Z",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 5,
          new_value: 6,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-02",
        agent_id: "agent-b",
        mutation_type: "board_mutation",
        composite_score: 0.62,
        description: "Raise priority for PM-E062-S002",
        completed_at: "2026-04-02T12:00:00Z",
        change_details: {
          pm_commands: ["pm story update PM-E062-S002 --priority high"],
          board_commit: "board-02",
        },
      }),
      createExperimentResult({
        experiment_id: "exp-03",
        agent_id: "agent-a",
        mutation_type: "runtime_config",
        composite_score: 0.74,
        description: "Raise autonomous confidence",
        completed_at: "2026-04-03T12:00:00Z",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 6,
          new_value: 7,
        },
      }),
      createExperimentResult({
        experiment_id: "exp-04",
        agent_id: "agent-b",
        mutation_type: "board_mutation",
        composite_score: 0.84,
        description: "Split a new story from the epic",
        completed_at: "2026-04-04T12:00:00Z",
        change_details: {
          pm_commands: ["pm story add PM-E062 Add analysis dashboard"],
          board_commit: "board-04",
        },
      }),
    ];

    for (const [index, result] of results.entries()) {
      writeYaml(
        path.join(pmDir, "swarm", "results", `analysis-${index + 1}.yaml`),
        result,
      );
    }

    writeYaml(path.join(pmDir, "swarm", "best", "metadata.yaml"), {
      status: "active",
      composite_score: 0.84,
      experiment_id: "exp-04",
      strategy_snapshot: { version: 1, config_version: 4 },
      board_hash: "sha256-best",
      updated_at: "2026-04-04T12:00:00Z",
    });

    writeYaml(
      path.join(pmDir, "swarm", "claims", "agent-a-raise-throughput.yaml"),
      ClaimSchema.parse({
        agent_id: "agent-a",
        type: "runtime_config",
        description: "Raise throughput",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 7,
        claimed_at: "2026-04-08T11:55:00Z",
        ttl_seconds: 900,
        status: "active",
      }),
    );

    writeYaml(
      path.join(pmDir, "swarm", "hypotheses", "hyp-01.yaml"),
      HypothesisSchema.parse({
        agent_id: "agent-a",
        title: "Increase concurrency again",
        type: "parameter_change",
        hypothesis: "Another concurrency increase may help throughput",
        suggested_change: {
          parameter_path: "dispatch.max_concurrent_agents",
          new_value: 8,
          expected_effect: "Improve throughput",
        },
        evidence_keys: ["exp-03"],
        priority: 4,
        status: "unclaimed",
        created_at: "2026-04-08T11:00:00Z",
      }),
    );

    writeYaml(
      path.join(pmDir, "swarm", "hypotheses", "hyp-02.yaml"),
      HypothesisSchema.parse({
        agent_id: "agent-b",
        title: "Split follow-up analysis story",
        type: "board_mutation",
        hypothesis: "A follow-up story may improve execution clarity",
        suggested_change: {
          pm_commands: ["pm story add PM-E062 Add analysis dashboard"],
          expected_effect: "Reduce coordination overhead",
        },
        evidence_keys: ["exp-04"],
        priority: 3,
        status: "claimed",
        created_at: "2026-04-08T11:10:00Z",
      }),
    );

    await expect(buildAnalysisSummary(pmDir)).resolves.toEqual({
      global_best: {
        status: "active",
        composite_score: 0.84,
        experiment_id: "exp-04",
        strategy_snapshot: { version: 1, config_version: 4 },
        board_hash: "sha256-best",
        updated_at: "2026-04-04T12:00:00Z",
      },
      recent_results: [
        {
          experiment_id: "exp-04",
          mutation_type: "board_mutation",
          decision: "keep",
          composite_score: 0.84,
          description: "Split a new story from the epic",
          completed_at: "2026-04-04T12:00:00Z",
        },
        {
          experiment_id: "exp-03",
          mutation_type: "runtime_config",
          decision: "keep",
          composite_score: 0.74,
          description: "Raise autonomous confidence",
          completed_at: "2026-04-03T12:00:00Z",
        },
        {
          experiment_id: "exp-02",
          mutation_type: "board_mutation",
          decision: "keep",
          composite_score: 0.62,
          description: "Raise priority for PM-E062-S002",
          completed_at: "2026-04-02T12:00:00Z",
        },
        {
          experiment_id: "exp-01",
          mutation_type: "runtime_config",
          decision: "keep",
          composite_score: 0.5,
          description: "Increase max_concurrent_agents to 7",
          completed_at: "2026-04-01T12:00:00Z",
        },
      ],
      active_claims: [
        {
          key: "raise-throughput",
          agentId: "agent-a",
          expiresAt: "2026-04-08T12:10:00.000Z",
          claimedAt: "2026-04-08T11:55:00Z",
          mutationType: "runtime_config",
        },
      ],
      unclaimed_hypotheses: 1,
      agent_bests: [
        {
          agent_id: "agent-b",
          experiment_id: "exp-04",
          mutation_type: "board_mutation",
          decision: "keep",
          composite_score: 0.84,
          description: "Split a new story from the epic",
          completed_at: "2026-04-04T12:00:00Z",
        },
        {
          agent_id: "agent-a",
          experiment_id: "exp-03",
          mutation_type: "runtime_config",
          decision: "keep",
          composite_score: 0.74,
          description: "Raise autonomous confidence",
          completed_at: "2026-04-03T12:00:00Z",
        },
      ],
      trend: "improving",
      count: 4,
      coverage: {
        runtime_config: {
          "dispatch.max_concurrent_agents": 2,
        },
        board_mutations: {
          priority_changes: 1,
          story_splits: 1,
        },
      },
      improvement_trend: "improving",
      experiment_count: 4,
      exploration_coverage: {
        runtime_config: {
          "dispatch.max_concurrent_agents": 2,
        },
        board_mutations: {
          priority_changes: 1,
          story_splits: 1,
        },
      },
    });
  });

  it("exports a Levenshtein ratio helper for direct testing", () => {
    expect(levenshteinRatio("exact match", "exact match")).toBe(1);
    expect(levenshteinRatio("hello", "hallo")).toBeCloseTo(0.8, 5);
  });

  it("writes and lists hypotheses with timestamp-based filenames", async () => {
    vi.setSystemTime(new Date("2026-04-08T12:34:56.000Z"));

    const written = await writeHypothesis(pmDir, {
      agent_id: "agent-exp-01",
      title: "Raise concurrency",
      type: "parameter_change",
      hypothesis: "A higher concurrency limit may improve throughput.",
      suggested_change: {
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 8,
        expected_effect: "Increase throughput",
      },
      evidence_keys: ["exp-06"],
      priority: 2,
      status: "unclaimed",
    });

    const files = listFiles(path.join(pmDir, "swarm", "hypotheses"));
    expect(files).toEqual([
      path.join(
        pmDir,
        "swarm",
        "hypotheses",
        "2026-04-08T12-34-56.000Z-agent-exp-01-raise-concurrency.yaml",
      ),
    ]);

    expect(readYaml(files[0]!, HypothesisSchema)).toEqual(written);
    await expect(listHypotheses(pmDir)).resolves.toEqual([written]);
  });

  it("lists hypotheses filtered by status and sorted by ascending priority", async () => {
    const low = await writeHypothesis(pmDir, {
      agent_id: "agent-low",
      title: "Low priority idea",
      type: "board_mutation",
      hypothesis: "Later work may still help.",
      suggested_change: {
        pm_commands: ["pm story add PM-E062 --title Follow-up"],
        expected_effect: "Track more work",
      },
      evidence_keys: [],
      priority: 5,
      status: "unclaimed",
      created_at: "2026-04-08T10:00:00.000Z",
    });

    const medium = await writeHypothesis(pmDir, {
      agent_id: "agent-medium",
      title: "Medium priority idea",
      type: "parameter_change",
      hypothesis: "A smaller heartbeat interval may reduce lag.",
      suggested_change: {
        parameter_path: "heartbeat.frequency_seconds",
        new_value: 12,
        expected_effect: "Lower response lag",
      },
      evidence_keys: [],
      priority: 3,
      status: "unclaimed",
      created_at: "2026-04-08T11:00:00.000Z",
    });

    const high = await writeHypothesis(pmDir, {
      agent_id: "agent-high",
      title: "High priority idea",
      type: "parameter_change",
      hypothesis: "Another concurrency bump may help throughput.",
      suggested_change: {
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 9,
        expected_effect: "Increase throughput",
      },
      evidence_keys: [],
      priority: 1,
      status: "unclaimed",
      created_at: "2026-04-08T12:00:00.000Z",
    });

    const claimed = await writeHypothesis(pmDir, {
      agent_id: "agent-claimed",
      title: "Claimed idea",
      type: "board_mutation",
      hypothesis: "A claimed change should be hidden by default.",
      suggested_change: {
        pm_commands: ["pm story update PM-E062-S004 --priority high"],
        expected_effect: "Advance scheduling",
      },
      evidence_keys: [],
      priority: 2,
      status: "claimed",
      created_at: "2026-04-08T09:00:00.000Z",
    });

    await expect(listHypotheses(pmDir)).resolves.toEqual([high, medium, low]);
    await expect(listHypotheses(pmDir, { status: "claimed" })).resolves.toEqual(
      [claimed],
    );
  });

  it("forces tactic suggestions into human review", async () => {
    const written = await writeHypothesis(pmDir, {
      agent_id: "agent-exp-02",
      title: "Add a new tactic",
      type: "tactic_suggestion",
      hypothesis: "A coordination score may improve decisions.",
      suggested_change: {
        expected_effect: "Improve ranking quality",
      },
      evidence_keys: ["exp-07"],
      priority: 2,
      status: "unclaimed",
      requires_human_review: false,
      created_at: "2026-04-08T13:00:00.000Z",
    });

    expect(written.requires_human_review).toBe(true);

    const [stored] = await listHypotheses(pmDir);
    expect(stored?.requires_human_review).toBe(true);
  });

  it("writes and lists insights with recency ordering and an optional limit", async () => {
    vi.setSystemTime(new Date("2026-04-08T12:34:56.000Z"));

    const newest = await writeInsight(pmDir, {
      agent_id: "agent-exp-01",
      insight:
        "Higher dispatch concurrency improved throughput without increasing waste.",
      evidence_keys: ["exp-02"],
      tags: ["runtime_config", "throughput"],
    });

    const older = await writeInsight(pmDir, {
      agent_id: "agent-exp-02",
      insight: "Longer observation windows reduced noisy reversions.",
      evidence_keys: ["exp-01"],
      tags: ["evaluation", "stability"],
      posted_at: "2026-04-08T12:00:00.000Z",
    });

    const files = listFiles(path.join(pmDir, "swarm", "insights"));
    expect(files).toHaveLength(2);
    expect(path.basename(files[0]!)).toMatch(
      /^2026-04-08T12-00-00.000Z-agent-exp-02-.*\.yaml$/,
    );
    expect(path.basename(files[1]!)).toMatch(
      /^2026-04-08T12-34-56.000Z-agent-exp-01-.*\.yaml$/,
    );

    expect(readYaml(files[1]!, InsightSchema)).toEqual(newest);
    await expect(listInsights(pmDir)).resolves.toEqual([newest, older]);
    await expect(listInsights(pmDir, 1)).resolves.toEqual([newest]);
  });

  it("filters insights by tag", async () => {
    const matching = await writeInsight(pmDir, {
      agent_id: "agent-exp-01",
      insight:
        "Higher dispatch concurrency improved throughput without increasing waste.",
      evidence_keys: ["exp-02"],
      tags: ["runtime_config", "throughput"],
      posted_at: "2026-04-08T12:34:56.000Z",
    });

    await writeInsight(pmDir, {
      agent_id: "agent-exp-02",
      insight: "Board batching reduced scheduling churn.",
      evidence_keys: ["exp-03"],
      tags: ["board_mutation"],
      posted_at: "2026-04-08T12:00:00.000Z",
    });

    await expect(filterInsightsByTag(pmDir, "runtime_config")).resolves.toEqual(
      [matching],
    );
    await expect(filterInsightsByTag(pmDir, "missing")).resolves.toEqual([]);
  });

  it("searches insights by similarity via the swarm store", async () => {
    await writeInsight(pmDir, {
      agent_id: "agent-exp-01",
      insight:
        "Higher dispatch concurrency improved throughput without increasing waste.",
      evidence_keys: ["exp-02"],
      tags: ["runtime_config", "throughput"],
      posted_at: "2026-04-08T12:34:56.000Z",
    });

    await writeInsight(pmDir, {
      agent_id: "agent-exp-02",
      insight:
        "Higher dispatch parallelism improved throughput without increasing waste.",
      evidence_keys: ["exp-03"],
      tags: ["runtime_config"],
      posted_at: "2026-04-08T12:00:00.000Z",
    });

    await writeInsight(pmDir, {
      agent_id: "agent-exp-03",
      insight: "Board batching reduced planning churn.",
      evidence_keys: ["exp-04"],
      tags: ["board_mutation"],
      posted_at: "2026-04-08T11:00:00.000Z",
    });

    const results = await searchInsights(
      pmDir,
      "Higher dispatch concurrency improved throughput without increasing waste.",
      0.7,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      key: expect.stringMatching(/^2026-04-08T12-34-56.000Z-agent-exp-01-/),
      score: 1,
    });
    expect(results[1]?.key).toMatch(/^2026-04-08T12-00-00.000Z-agent-exp-02-/);
    expect(results[1]?.score).toBeGreaterThanOrEqual(0.7);
    expect(results[1]?.score).toBeLessThan(1);
  });

  it("exports a Jaccard word similarity helper for direct testing", () => {
    expect(
      jaccardWordSimilarity(
        "raise concurrency limit",
        "raise concurrency limit",
      ),
    ).toBe(1);
    expect(jaccardWordSimilarity("", "")).toBe(0);
    expect(jaccardWordSimilarity("raise concurrency", "lower budget")).toBe(0);
    expect(
      jaccardWordSimilarity("raise concurrency limit", "raise budget limit"),
    ).toBeCloseTo(0.5, 5);
  });

  it("detects exact runtime_config duplicates by parameter path and new value", () => {
    const activeClaims = [
      {
        type: "runtime_config" as const,
        description: "Increase max concurrent agents from 5 to 7",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 7,
      },
    ];

    expect(
      checkExactDuplicate(activeClaims, {
        type: "runtime_config",
        description: "Raise max concurrent agents to 7",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 7,
      }),
    ).toBe(true);

    expect(
      checkExactDuplicate(activeClaims, {
        type: "runtime_config",
        description: "Raise max concurrent agents to 9",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 9,
      }),
    ).toBe(false);
  });

  it("detects exact board_mutation duplicates by change description", () => {
    const activeClaims = [
      {
        type: "board_mutation" as const,
        description: "Move PM-E060-S004 to high priority",
      },
    ];

    expect(
      checkExactDuplicate(activeClaims, {
        type: "board_mutation",
        description: "Move PM-E060-S004 to high priority",
      }),
    ).toBe(true);

    expect(
      checkExactDuplicate(activeClaims, {
        type: "board_mutation",
        description: "Move PM-E060-S004 to medium priority",
      }),
    ).toBe(false);
  });

  it("uses the hybrid claim similarity gate for duplicate detection", () => {
    const activeClaims = [
      {
        type: "runtime_config" as const,
        description: "Increase max concurrent agents from 5 to 7",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 7,
      },
      {
        type: "board_mutation" as const,
        description: "Prioritize PM-E060-S003 before PM-E060-S004",
      },
    ];

    const matchingPairs = [
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Increase max concurrent agents from 5 to 8",
        },
        expected: true,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Raise max concurrent agents from 5 to 7",
        },
        expected: true,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Increase max concurrent agents from 4 to 7",
        },
        expected: true,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Decrease max concurrent agents from 5 to 3",
        },
        expected: false,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Reduce max concurrent agents from 5 to 3",
        },
        expected: false,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "Increase story dispatch delay from 5 to 7 seconds",
        },
        expected: false,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "",
        },
        expected: false,
      },
      {
        candidate: {
          type: "runtime_config" as const,
          description: "increase",
        },
        expected: false,
      },
      {
        candidate: {
          type: "board_mutation" as const,
          description: "Prioritize PM-E060-S003 before story PM-E060-S004",
        },
        expected: true,
      },
      {
        candidate: {
          type: "board_mutation" as const,
          description: "Demote PM-E060-S003 below PM-E060-S004",
        },
        expected: false,
      },
      {
        candidate: {
          type: "board_mutation" as const,
          description: "Reassign PM-E061-S001 to another epic",
        },
        expected: false,
      },
      {
        candidate: {
          type: "board_mutation" as const,
          description: "prioritize PM-E060-S003 before PM-E060-S004",
        },
        expected: true,
      },
    ];

    for (const { candidate, expected } of matchingPairs) {
      expect(checkSimilarDuplicate(activeClaims, candidate)).toBe(expected);
    }
  });

  it("searches descriptions, filters by threshold, and sorts by score", async () => {
    await store.write("fixtures", "exact", { description: "hello" });
    await store.write("fixtures", "similar", { description: "hallo" });
    await store.write("fixtures", "unrelated", { description: "goodbye" });
    await store.write("fixtures", "missing-description", { note: "skip me" });

    await expect(store.search("fixtures", "hello", 0.5)).resolves.toEqual([
      { key: "exact", score: 1 },
      { key: "similar", score: 0.8 },
    ]);
  });

  it("returns an empty search result for an empty namespace", async () => {
    await expect(store.search("fixtures", "hello", 0.5)).resolves.toEqual([]);
  });

  it("writes claim files, returns active claims, and preserves completed claims", async () => {
    const now = new Date("2026-04-08T12:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());

    await expect(
      store.claim("claims", "Increase max concurrent agents", "agent-1", 60),
    ).resolves.toEqual({
      acquired: true,
      claimKey: "increase-max-concurrent-agents",
    });

    const filePath = path.join(
      pmDir,
      "swarm",
      "claims",
      "agent-1-increase-max-concurrent-agents.yaml",
    );
    expect(fs.existsSync(filePath)).toBe(true);
    expect(readYaml(filePath, ClaimSchema)).toMatchObject({
      agent_id: "agent-1",
      description: "Increase max concurrent agents",
      ttl_seconds: 60,
      status: "active",
      claimed_at: now.toISOString(),
    });

    await expect(store.listActiveClaims("claims")).resolves.toEqual([
      {
        key: "increase-max-concurrent-agents",
        agentId: "agent-1",
        expiresAt: "2026-04-08T12:01:00.000Z",
        claimedAt: "2026-04-08T12:00:00.000Z",
        mutationType: "board_mutation",
      },
    ]);

    await expect(
      store.releaseClaim("claims", "Increase max concurrent agents", "agent-1"),
    ).resolves.toBeUndefined();
    expect(readYaml(filePath, ClaimSchema)).toMatchObject({
      status: "completed",
      agent_id: "agent-1",
    });
    await expect(store.listActiveClaims("claims")).resolves.toEqual([]);
  });

  it("excludes expired claims from the active list without deleting them", async () => {
    const initialNow = new Date("2026-04-08T12:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(initialNow.getTime());

    await store.claim("claims", "Tune dispatch window", "agent-2", 30);

    nowSpy.mockReturnValue(initialNow.getTime() + 31_000);

    await expect(store.listActiveClaims("claims")).resolves.toEqual([]);
    expect(
      fs.existsSync(
        path.join(
          pmDir,
          "swarm",
          "claims",
          "agent-2-tune-dispatch-window.yaml",
        ),
      ),
    ).toBe(true);
    expect(
      readYaml(
        path.join(
          pmDir,
          "swarm",
          "claims",
          "agent-2-tune-dispatch-window.yaml",
        ),
        ClaimSchema,
      ),
    ).toMatchObject({ status: "active" });
  });

  it("acquires a claim after writing and verifying the agent id", async () => {
    const now = new Date("2026-04-08T12:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());

    await expect(
      acquireClaim(
        pmDir,
        {
          type: "board_mutation",
          description: "Verify claim acquisition",
          ttl_seconds: 45,
        },
        "agent-verify",
        { waitMs: 0 },
      ),
    ).resolves.toEqual({
      acquired: true,
      claimKey: "verify-claim-acquisition",
    });

    expect(
      readYaml(
        path.join(
          pmDir,
          "swarm",
          "claims",
          "agent-verify-verify-claim-acquisition.yaml",
        ),
        ClaimSchema,
      ),
    ).toMatchObject({
      agent_id: "agent-verify",
      ttl_seconds: 45,
      status: "active",
      claimed_at: now.toISOString(),
    });
  });

  it("deletes a contested claim file and returns failure", async () => {
    vi.useFakeTimers();

    const filePath = path.join(
      pmDir,
      "swarm",
      "claims",
      "agent-1-contested-mutation.yaml",
    );
    const claimPromise = acquireClaim(
      pmDir,
      {
        type: "board_mutation",
        description: "Contested mutation",
        ttl_seconds: 30,
      },
      "agent-1",
      { waitMs: 2_000 },
    );

    await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(true));

    writeYaml(filePath, {
      agent_id: "agent-2",
      type: "board_mutation",
      description: "Contested mutation",
      claimed_at: new Date("2026-04-08T12:00:00.000Z").toISOString(),
      ttl_seconds: 30,
      status: "active",
    });

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(claimPromise).resolves.toEqual({
      acquired: false,
      reason: "claim-verification-failed",
    });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("falls back to solo mode after five consecutive verification failures", async () => {
    vi.useFakeTimers();

    const claimData = {
      type: "board_mutation" as const,
      description: "Fallback mutation",
      ttl_seconds: 30,
    };
    const filePath = path.join(
      pmDir,
      "swarm",
      "claims",
      "agent-fallback-fallback-mutation.yaml",
    );

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimPromise = acquireClaim(pmDir, claimData, "agent-fallback", {
        waitMs: 2_000,
      });

      await vi.waitFor(() => expect(fs.existsSync(filePath)).toBe(true));

      writeYaml(filePath, {
        agent_id: `agent-rival-${attempt}`,
        ...claimData,
        claimed_at: new Date("2026-04-08T12:00:00.000Z").toISOString(),
        status: "active",
      });

      await vi.advanceTimersByTimeAsync(2_000);

      if (attempt < 5) {
        await expect(claimPromise).resolves.toEqual({
          acquired: false,
          reason: "claim-verification-failed",
        });
      } else {
        await expect(claimPromise).resolves.toEqual({
          acquired: false,
          reason: "fallback-solo",
          soloMode: true,
        });
      }

      expect(fs.existsSync(filePath)).toBe(false);
    }
  });
});

describe("loadTactics", () => {
  let tmpRoot: string;
  let pmDir: string;
  let tacticsPath: string;

  const tacticsFixture = {
    version: 1,
    tactics: [
      {
        name: "throughput",
        description: "Stories completed per wall-clock hour",
        metric: "stories_per_hour",
        direction: "higher_is_better" as const,
        weight: 0.25,
        measurement: "derived" as const,
        source: "story_result" as const,
      },
      {
        name: "quality",
        description: "Acceptance criteria verified on first pass",
        metric: "criteria_pass_rate",
        direction: "higher_is_better" as const,
        weight: 0.75,
        measurement: "derived" as const,
        source: "story_result" as const,
      },
    ],
    profiles: {
      balanced: {
        throughput: 0.25,
        quality: 0.75,
      },
      velocity: {
        throughput: 0.6,
        quality: 0.4,
      },
    },
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pm-load-tactics-"));
    pmDir = path.join(tmpRoot, ".pm");
    tacticsPath = path.join(pmDir, "swarm", "tactics.yaml");
    fs.mkdirSync(path.dirname(tacticsPath), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("loads tactics with the default weights from tactics.yaml", () => {
    writeYaml(tacticsPath, tacticsFixture);

    expect(loadTactics(pmDir)).toEqual(tacticsFixture);
  });

  it("loads tactics with a named profile", () => {
    writeYaml(tacticsPath, tacticsFixture);

    expect(loadTactics(pmDir, "velocity").tactics).toEqual([
      { ...tacticsFixture.tactics[0], weight: 0.6 },
      { ...tacticsFixture.tactics[1], weight: 0.4 },
    ]);
  });

  it("falls back to the default balanced tactics template when tactics.yaml is missing", () => {
    const templatePath = new URL(
      "../../../docs/templates/swarm-default-tactics.yaml",
      import.meta.url,
    ).pathname;

    expect(loadTactics(pmDir)).toEqual(readYaml(templatePath, TacticsSchema));
  });

  it("rejects tactics whose weights do not sum to 1.0 within tolerance", () => {
    writeYaml(tacticsPath, {
      ...tacticsFixture,
      tactics: tacticsFixture.tactics.map((tactic, index) => ({
        ...tactic,
        weight: index === 0 ? 0.2 : 0.79,
      })),
    });

    expect(() => loadTactics(pmDir)).toThrowError(ValidationError);
    expect(() => loadTactics(pmDir)).toThrowError(
      /must sum to 1\.0 within 0\.001/,
    );
  });

  it("throws a descriptive error when the requested profile is missing", () => {
    writeYaml(tacticsPath, tacticsFixture);

    expect(() => loadTactics(pmDir, "focus")).toThrowError(ValidationError);
    expect(() => loadTactics(pmDir, "focus")).toThrowError(
      /Available profiles: balanced, velocity/,
    );
  });
});

describe("parseStoryResult", () => {
  const expected = {
    code: "PM-E058-S002",
    title: "Parse STORY_RESULT from sub-agent stdout",
    status: "done" as const,
    criteria_verified: ["parser returns typed object"],
    criteria_failed: [],
    blockers: [],
    discoveries: [],
    reflection: "",
  };

  it("parses a STORY_RESULT block at the end of stdout", () => {
    const stdout = [
      "running tests",
      "---",
      "STORY_RESULT:",
      "  code: PM-E058-S002",
      '  title: "Parse STORY_RESULT from sub-agent stdout"',
      "  status: done",
      "  criteria_verified:",
      "    - parser returns typed object",
      "  criteria_failed: []",
      "  blockers: []",
      "  discoveries: []",
      '  reflection: ""',
      "",
    ].join("\n");

    expect(parseStoryResult(stdout)).toEqual(expected);
  });

  it("parses a STORY_RESULT block in the middle of stdout", () => {
    const stdout = [
      "before",
      "---",
      "STORY_RESULT:",
      "  code: PM-E058-S002",
      '  title: "Parse STORY_RESULT from sub-agent stdout"',
      "  status: done",
      "  criteria_verified:",
      "    - parser returns typed object",
      "  criteria_failed: []",
      "  blockers: []",
      "  discoveries: []",
      '  reflection: ""',
      "---",
      "after",
    ].join("\n");

    expect(parseStoryResult(stdout)).toEqual(expected);
  });

  it("takes the last STORY_RESULT block when multiple are present", () => {
    const stdout = [
      "---",
      "STORY_RESULT:",
      "  code: PM-E058-S001",
      '  title: "Old result"',
      "  status: failed",
      "  criteria_verified: []",
      '  criteria_failed: ["old criterion"]',
      "  blockers: []",
      "  discoveries: []",
      '  reflection: "old failure"',
      "---",
      "logs",
      "---",
      "STORY_RESULT:",
      "  code: PM-E058-S002",
      '  title: "Parse STORY_RESULT from sub-agent stdout"',
      "  status: done",
      "  criteria_verified:",
      "    - parser returns typed object",
      "  criteria_failed: []",
      "  blockers: []",
      "  discoveries: []",
      '  reflection: ""',
      "---",
    ].join("\n");

    expect(parseStoryResult(stdout)).toEqual(expected);
  });

  it("returns null when stdout does not contain a STORY_RESULT block", () => {
    expect(parseStoryResult("plain logs only")).toBeNull();
  });

  it("returns null when the last STORY_RESULT block has malformed YAML", () => {
    const stdout = [
      "---",
      "STORY_RESULT:",
      "  code: PM-E058-S002",
      '  title: "Parse STORY_RESULT from sub-agent stdout"',
      "  status: done",
      "  criteria_verified:",
      "    - parser returns typed object",
      "  criteria_failed: []",
      "  blockers: []",
      "  discoveries: []",
      '  reflection: ""',
      "---",
      "---",
      "STORY_RESULT:",
      "  code: [broken",
    ].join("\n");

    expect(parseStoryResult(stdout)).toBeNull();
  });

  it("returns null when the STORY_RESULT block fails typed validation", () => {
    const stdout = [
      "---",
      "STORY_RESULT:",
      '  title: "Parse STORY_RESULT from sub-agent stdout"',
      "  status: done",
      "  criteria_verified: []",
      "  criteria_failed: []",
      "  blockers: []",
      "  discoveries: []",
      '  reflection: ""',
      "---",
    ].join("\n");

    expect(parseStoryResult(stdout)).toBeNull();
  });
});

describe("EXPERIMENT_RESULT structured output", () => {
  const expected = {
    experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
    mutation_type: "runtime_config" as const,
    hypothesis:
      "Increasing max_concurrent_agents from 5 to 7 will improve throughput",
    change_description: "dispatch.max_concurrent_agents: 5 -> 7",
    observation_window: 10,
    composite_score: 0.72,
    previous_best_score: 0.68,
    decision: "keep" as const,
    insight:
      "Higher concurrency improved throughput by 12% without increasing waste ratio",
  };

  it("formats EXPERIMENT_RESULT as a delimited YAML block", () => {
    expect(formatExperimentResult(expected)).toBe(
      [
        "---",
        "EXPERIMENT_RESULT:",
        "  experiment_id: 2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency",
        "  mutation_type: runtime_config",
        "  hypothesis: Increasing max_concurrent_agents from 5 to 7 will improve throughput",
        "  change_description: 'dispatch.max_concurrent_agents: 5 -> 7'",
        "  observation_window: 10",
        "  composite_score: 0.72",
        "  previous_best_score: 0.68",
        "  decision: keep",
        "  insight: Higher concurrency improved throughput by 12% without increasing waste ratio",
        "---",
      ].join("\n"),
    );
  });

  it("parses an EXPERIMENT_RESULT block from arbitrary stdout", () => {
    const stdout = [
      "running experiment loop",
      "---",
      "EXPERIMENT_RESULT:",
      '  experiment_id: "2026-03-14T10:30:00Z-agent-exp-01-raise-concurrency"',
      "  mutation_type: runtime_config",
      '  hypothesis: "Increasing max_concurrent_agents from 5 to 7 will improve throughput"',
      '  change_description: "dispatch.max_concurrent_agents: 5 -> 7"',
      "  observation_window: 10",
      "  composite_score: 0.72",
      "  previous_best_score: 0.68",
      "  decision: keep",
      '  insight: "Higher concurrency improved throughput by 12% without increasing waste ratio"',
      "---",
      "published insight",
    ].join("\n");

    expect(parseExperimentResult(stdout)).toEqual(expected);
  });

  it("round-trips formatted EXPERIMENT_RESULT output", () => {
    expect(parseExperimentResult(formatExperimentResult(expected))).toEqual(
      expected,
    );
  });
});

describe("normalization stats", () => {
  let tmpRoot: string;
  let pmDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pm-normalization-"));
    pmDir = path.join(tmpRoot, ".pm");
    fs.mkdirSync(pmDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("updates phase 1 stats with Welford's algorithm", async () => {
    for (const value of [10, 20, 30]) {
      await updateStats(pmDir, "stories_per_hour", value);
    }

    const stats = readYaml(
      path.join(pmDir, "swarm", "normalization-stats.yaml"),
      NormalizationStatsSchema,
    );

    expect(stats.stories_per_hour).toEqual({
      count: 3,
      mean: 20,
      variance: 100,
      ewma_mean: 14.275,
      ewma_variance: 54.474375,
    });
    expect(normalize(pmDir, "stories_per_hour", 30)).toBeCloseTo(1, 10);
  });

  it("switches normalization to EWMA statistics at count 11", async () => {
    for (let index = 0; index < 10; index += 1) {
      await updateStats(pmDir, "criteria_pass_rate", 10);
    }
    await updateStats(pmDir, "criteria_pass_rate", 20);

    const stats = readYaml(
      path.join(pmDir, "swarm", "normalization-stats.yaml"),
      NormalizationStatsSchema,
    );
    const metric = stats.criteria_pass_rate;

    expect(metric.count).toBe(11);
    expect(metric.mean).toBeCloseTo(10.9090909091, 10);
    expect(metric.variance).toBeCloseTo(9.0909090909, 10);
    expect(metric.ewma_mean).toBeCloseTo(11.5, 10);
    expect(metric.ewma_variance).toBeCloseTo(12.75, 10);
    expect(EWMA_ALPHA).toBe(0.15);
    expect(normalize(pmDir, "criteria_pass_rate", 20)).toBeCloseTo(
      (20 - 11.5) / Math.sqrt(12.75),
      10,
    );
  });

  it("writes normalization stats without leaving partial temp files", async () => {
    await updateStats(pmDir, "waste_ratio", 0.25);

    expect(
      readYaml(
        path.join(pmDir, "swarm", "normalization-stats.yaml"),
        NormalizationStatsSchema,
      ).waste_ratio,
    ).toEqual({
      count: 1,
      mean: 0.25,
      variance: 0,
      ewma_mean: 0.25,
      ewma_variance: 0,
    });
    expect(
      fs
        .readdirSync(path.join(pmDir, "swarm"))
        .filter((entry) => entry.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("keeps the stats file valid under concurrent writes", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        updateStats(pmDir, "duplicate_and_conflict_ratio", index + 1),
      ),
    );

    const stats = readYaml(
      path.join(pmDir, "swarm", "normalization-stats.yaml"),
      NormalizationStatsSchema,
    );

    expect(stats.duplicate_and_conflict_ratio.count).toBe(8);
    expect(
      fs
        .readdirSync(path.join(pmDir, "swarm"))
        .filter((entry) => entry.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("returns zero when normalization lacks enough variance", () => {
    expect(normalize(pmDir, "missing_metric", 123)).toBe(0);
  });
});

describe("computeComposite", () => {
  it("returns the balanced Tchebycheff composite score", () => {
    expect(
      computeComposite(
        {
          stories_per_hour: 2,
          criteria_pass_rate: 2,
          waste_ratio: -2,
        },
        scoringTactics,
      ),
    ).toBe(0.4);
  });

  it("uses the weakest weighted tactic as the composite score", () => {
    expect(
      computeComposite(
        {
          stories_per_hour: 5,
          criteria_pass_rate: 1,
          waste_ratio: -3,
        },
        scoringTactics,
      ),
    ).toBe(0.3);
  });

  it("excludes zero-weight tactics from the min computation", () => {
    const tactics = TacticsSchema.parse({
      ...scoringTactics,
      tactics: scoringTactics.tactics.map((tactic) =>
        tactic.name === "quality" ? { ...tactic, weight: 0 } : tactic,
      ),
    });

    expect(
      computeComposite(
        {
          stories_per_hour: 2,
          criteria_pass_rate: -100,
          waste_ratio: -2,
        },
        tactics,
      ),
    ).toBe(0.4);
  });

  it("negates lower-is-better metrics before scalarization", () => {
    expect(
      computeComposite(
        {
          stories_per_hour: 3,
          criteria_pass_rate: 3,
          waste_ratio: 4,
        },
        scoringTactics,
      ),
    ).toBe(-0.8);
  });

  it("returns NaN when no valid weighted metrics are available", () => {
    expect(
      computeComposite(
        {
          stories_per_hour: Number.NaN,
          criteria_pass_rate: Number.POSITIVE_INFINITY,
        },
        TacticsSchema.parse({
          ...scoringTactics,
          tactics: scoringTactics.tactics.map((tactic) => ({
            ...tactic,
            weight: tactic.name === "waste" ? 0 : tactic.weight,
          })),
        }),
      ),
    ).toBeNaN();
  });
});
