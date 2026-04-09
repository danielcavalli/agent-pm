import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { agentEscalate } from "../../commands/agent.js";
import { swarmInit } from "../../commands/swarm.js";
import {
  captureOutput,
  seedProject,
  setupTmpDir,
  type CapturedOutput,
  type TmpDirHandle,
} from "../../__tests__/integration-helpers.js";
import { readAgentState } from "../agent-state.js";
import { readYaml, writeYaml } from "../fs.js";
import {
  FileSwarmStore,
  acquireClaim,
  aggregateResults,
  applyBoardMutation,
  applyRuntimeMutation,
  computeComposite,
  computeMetrics,
  computeObservationMetadata,
  loadTactics,
  normalize,
  readGlobalBest,
  revertBoardMutation,
  revertRuntimeMutation,
  updateStats,
  writeObservation,
} from "../swarm-store.js";
import {
  BestMetadataSchema,
  ExperimentResultSchema,
  InsightSchema,
  StrategySchema,
} from "../../schemas/index.js";

describe("experiment loop integration", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(() => {
    tmp = setupTmpDir();
    out = captureOutput();
  });

  afterEach(() => {
    vi.useRealTimers();
    out.restore();
    tmp.teardown();
  });

  async function initSwarmProject(): Promise<string> {
    await seedProject({ code: "TEST", name: "Experiment Loop Test" });
    await swarmInit();
    return path.join(tmp.projectsDir, "swarm");
  }

  async function seedNormalizationHistory(pmDir: string): Promise<void> {
    for (const value of [0.5, 0.75, 1, 1.25, 1.5]) {
      await updateStats(pmDir, "stories_per_hour", value);
    }
    for (const value of [0.25, 0.4, 0.55, 0.7, 0.85]) {
      await updateStats(pmDir, "criteria_pass_rate", value);
    }
    for (const value of [0.7, 0.5, 0.35, 0.2, 0.1]) {
      await updateStats(pmDir, "waste_ratio", value);
    }
    for (const value of [0.6, 0.45, 0.3, 0.15, 0.05]) {
      await updateStats(pmDir, "duplicate_and_conflict_ratio", value);
    }
  }

  async function scoreState(
    pmDir: string,
    strategyHash: string,
    boardHash: string,
  ) {
    const tactics = loadTactics(pmDir);
    const rawMetrics = await computeMetrics(pmDir, strategyHash, boardHash);
    const normalizedMetrics = Object.fromEntries(
      tactics.tactics.map((tactic) => [
        tactic.metric,
        normalize(pmDir, tactic.metric, rawMetrics[tactic.metric] ?? 0),
      ]),
    );

    return {
      rawMetrics,
      normalizedMetrics,
      compositeScore: computeComposite(normalizedMetrics, tactics),
    };
  }

  async function writeObservations(
    pmDir: string,
    metadata: Awaited<ReturnType<typeof computeObservationMetadata>>,
    observations: Array<{
      story_code: string;
      status: "done" | "blocked" | "failed";
      criteria_verified: string[];
      criteria_failed: string[];
      started_at: string;
      completed_at: string;
    }>,
  ): Promise<void> {
    for (const observation of observations) {
      await writeObservation(pmDir, {
        ...observation,
        metrics: {},
        ...metadata,
      });
    }
  }

  function initGitRepo(): void {
    childProcess.execFileSync("git", ["init"], {
      cwd: tmp.dir,
      encoding: "utf8",
    });
    childProcess.execFileSync("git", ["add", "."], {
      cwd: tmp.dir,
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
      {
        cwd: tmp.dir,
        encoding: "utf8",
      },
    );
  }

  it("runs one runtime experiment iteration end to end and publishes result artifacts", async () => {
    const swarmDir = await initSwarmProject();
    const pmDir = tmp.projectsDir;
    const store = new FileSwarmStore(pmDir);
    const experimentId =
      "2026-04-08T12:00:00Z-agent-exp-01-increase-concurrency";

    await seedNormalizationHistory(pmDir);

    const baselineMetadata = await computeObservationMetadata(pmDir);
    await writeObservations(pmDir, baselineMetadata, [
      {
        story_code: "TEST-E001-S001",
        status: "done",
        criteria_verified: ["baseline-a", "baseline-b"],
        criteria_failed: [],
        started_at: "2026-04-08T09:00:00Z",
        completed_at: "2026-04-08T10:00:00Z",
      },
      {
        story_code: "TEST-E001-S002",
        status: "done",
        criteria_verified: ["baseline-c"],
        criteria_failed: ["baseline-d"],
        started_at: "2026-04-08T09:15:00Z",
        completed_at: "2026-04-08T10:15:00Z",
      },
      {
        story_code: "TEST-E001-S002",
        status: "blocked",
        criteria_verified: [],
        criteria_failed: ["baseline-e"],
        started_at: "2026-04-08T09:20:00Z",
        completed_at: "2026-04-08T11:20:00Z",
      },
    ]);

    const baselineScore = await scoreState(
      pmDir,
      baselineMetadata.strategy_hash,
      baselineMetadata.board_hash,
    );
    const baselineStrategy = readYaml(
      path.join(swarmDir, "strategy.yaml"),
      StrategySchema,
    );

    writeYaml(path.join(swarmDir, "best", "strategy.yaml"), baselineStrategy);
    writeYaml(
      path.join(swarmDir, "best", "metadata.yaml"),
      BestMetadataSchema.parse({
        status: "active",
        composite_score: baselineScore.compositeScore,
        experiment_id: "baseline",
        strategy_snapshot: baselineStrategy,
        board_hash: baselineMetadata.board_hash,
        updated_at: "2026-04-08T11:30:00Z",
      }),
    );

    await expect(
      acquireClaim(
        pmDir,
        {
          type: "runtime_config",
          description: "Increase max concurrent agents from 5 to 7",
          parameter_path: "dispatch.max_concurrent_agents",
          new_value: 7,
          ttl_seconds: 60,
        },
        "agent-exp-01",
        { waitMs: 0 },
      ),
    ).resolves.toEqual({
      acquired: true,
      claimKey: "increase-max-concurrent-agents-from-5-to-7",
    });

    await expect(
      applyRuntimeMutation(pmDir, "dispatch.max_concurrent_agents", 7),
    ).resolves.toBe(2);

    const candidateMetadata = await computeObservationMetadata(pmDir);
    await writeObservations(pmDir, candidateMetadata, [
      {
        story_code: "TEST-E001-S003",
        status: "done",
        criteria_verified: ["candidate-a", "candidate-b"],
        criteria_failed: [],
        started_at: "2026-04-08T12:00:00Z",
        completed_at: "2026-04-08T12:30:00Z",
      },
      {
        story_code: "TEST-E001-S004",
        status: "done",
        criteria_verified: ["candidate-c", "candidate-d"],
        criteria_failed: [],
        started_at: "2026-04-08T12:05:00Z",
        completed_at: "2026-04-08T12:35:00Z",
      },
    ]);

    const candidateScore = await scoreState(
      pmDir,
      candidateMetadata.strategy_hash,
      candidateMetadata.board_hash,
    );
    expect(candidateScore.compositeScore).toBeGreaterThan(
      baselineScore.compositeScore,
    );

    await store.write("results", experimentId, {
      experiment_id: experimentId,
      agent_id: "agent-exp-01",
      mutation_type: "runtime_config",
      description: "Increase max concurrent agents from 5 to 7",
      change_details: {
        parameter_path: "dispatch.max_concurrent_agents",
        old_value: 5,
        new_value: 7,
      },
      status: "keep",
      observation_window_stories: 10,
      tactic_scores: {
        throughput: {
          value: candidateScore.normalizedMetrics.stories_per_hour,
          direction: "higher_is_better",
        },
        quality: {
          value: candidateScore.normalizedMetrics.criteria_pass_rate,
          direction: "higher_is_better",
        },
        waste: {
          value: candidateScore.normalizedMetrics.waste_ratio,
          direction: "lower_is_better",
        },
      },
      composite_score: candidateScore.compositeScore,
      delta_vs_previous_best:
        candidateScore.compositeScore - baselineScore.compositeScore,
      strategy_snapshot: readYaml(
        path.join(swarmDir, "strategy.yaml"),
        StrategySchema,
      ),
      board_hash: candidateMetadata.board_hash,
      started_at: "2026-04-08T12:00:00Z",
      completed_at: "2026-04-08T12:35:00Z",
    });
    await store.write("insights", experimentId, {
      agent_id: "agent-exp-01",
      insight:
        "Higher dispatch concurrency improved throughput without increasing waste in the observation window.",
      evidence_keys: [experimentId],
      tags: ["runtime_config", "throughput"],
      posted_at: "2026-04-08T12:35:00Z",
    });

    writeYaml(
      path.join(swarmDir, "best", "strategy.yaml"),
      readYaml(path.join(swarmDir, "strategy.yaml"), StrategySchema),
    );
    writeYaml(
      path.join(swarmDir, "best", "metadata.yaml"),
      BestMetadataSchema.parse({
        status: "active",
        composite_score: candidateScore.compositeScore,
        experiment_id: experimentId,
        strategy_snapshot: readYaml(
          path.join(swarmDir, "strategy.yaml"),
          StrategySchema,
        ),
        board_hash: candidateMetadata.board_hash,
        updated_at: "2026-04-08T12:35:00Z",
        previous_best_score: baselineScore.compositeScore,
        previous_best_experiment_id: "baseline",
      }),
    );

    const publishedResult = readYaml(
      path.join(swarmDir, "results", `${experimentId}.yaml`),
      ExperimentResultSchema,
    );
    const publishedInsight = readYaml(
      path.join(swarmDir, "insights", `${experimentId}.yaml`),
      InsightSchema,
    );

    expect(publishedResult.status).toBe("keep");
    expect(publishedResult.composite_score).toBe(candidateScore.compositeScore);
    expect(publishedInsight.evidence_keys).toEqual([experimentId]);
    await expect(aggregateResults(pmDir)).resolves.toHaveLength(1);
    await expect(readGlobalBest(pmDir)).resolves.toMatchObject({
      experiment_id: experimentId,
      previous_best_experiment_id: "baseline",
    });
  });

  it("logs and escalates when a board mutation revert conflicts", async () => {
    await initSwarmProject();
    const pmDir = tmp.projectsDir;
    const indexPath = path.join(pmDir, "index.yaml");

    initGitRepo();

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
            'const content = fs.readFileSync(filePath, "utf8");',
            'fs.writeFileSync(filePath, content.replace("name: Experiment Loop Test", "name: Mutated Board"), "utf8");',
          ].join(" "),
        ),
      ].join(" "),
    ]);

    const conflictingContent = fs
      .readFileSync(indexPath, "utf8")
      .replace("name: Mutated Board", "name: Human Override");
    fs.writeFileSync(indexPath, conflictingContent, "utf8");
    childProcess.execFileSync("git", ["add", ".pm/index.yaml"], {
      cwd: tmp.dir,
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
        "conflicting board change",
      ],
      { cwd: tmp.dir, encoding: "utf8" },
    );

    const reverted = await revertBoardMutation(pmDir, commitHash);
    if (!reverted) {
      console.error(`Git revert failed for experiment commit ${commitHash}`);
      await agentEscalate({
        agentId: "agent-exp-02",
        type: "error",
        message: `git revert failed for ${commitHash}`,
        confidence: 0.95,
      });
    }

    expect(reverted).toBe(false);
    expect(out.error().join("\n")).toContain("Git revert failed");
    expect(readAgentState(pmDir, "agent-exp-02")).toMatchObject({
      status: "needs_attention",
      escalation: {
        type: "error",
        message: `git revert failed for ${commitHash}`,
      },
    });
  });

  it("aborts cleanly when the experiment claim expires mid-iteration", async () => {
    const swarmDir = await initSwarmProject();
    const pmDir = tmp.projectsDir;
    const store = new FileSwarmStore(pmDir);
    const baselineStrategy = readYaml(
      path.join(swarmDir, "strategy.yaml"),
      StrategySchema,
    );

    writeYaml(path.join(swarmDir, "best", "strategy.yaml"), baselineStrategy);

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(new Date("2026-04-08T12:00:00Z").getTime());

    await expect(
      acquireClaim(
        pmDir,
        {
          type: "runtime_config",
          description: "Short-lived experiment claim",
          parameter_path: "dispatch.max_concurrent_agents",
          new_value: 7,
          ttl_seconds: 1,
        },
        "agent-exp-03",
        { waitMs: 0 },
      ),
    ).resolves.toMatchObject({ acquired: true });

    await expect(
      applyRuntimeMutation(pmDir, "dispatch.max_concurrent_agents", 7),
    ).resolves.toBe(2);

    nowSpy.mockReturnValue(new Date("2026-04-08T12:00:02Z").getTime());
    await expect(store.listActiveClaims("claims")).resolves.toEqual([]);

    await expect(revertRuntimeMutation(pmDir)).resolves.toBe(3);

    expect(
      readYaml(path.join(swarmDir, "strategy.yaml"), StrategySchema),
    ).toMatchObject({
      config_version: 3,
      parameters: {
        dispatch: { max_concurrent_agents: 5 },
      },
    });
    expect(fs.existsSync(path.join(swarmDir, "results"))).toBe(true);
    expect(fs.readdirSync(path.join(swarmDir, "results"))).toEqual([]);
    expect(fs.readdirSync(path.join(swarmDir, "insights"))).toEqual([]);
  });

  it("falls back to the best strategy when strategy.yaml is corrupted mid-iteration", async () => {
    const swarmDir = await initSwarmProject();
    const pmDir = tmp.projectsDir;
    const baselineStrategy = readYaml(
      path.join(swarmDir, "strategy.yaml"),
      StrategySchema,
    );

    writeYaml(path.join(swarmDir, "best", "strategy.yaml"), baselineStrategy);

    const nextVersion = await applyRuntimeMutation(
      pmDir,
      "dispatch.max_concurrent_agents",
      7,
    );

    fs.writeFileSync(
      path.join(swarmDir, "strategy.yaml"),
      "version: 1\nconfig_version: [broken\n",
      "utf8",
    );

    try {
      readYaml(path.join(swarmDir, "strategy.yaml"), StrategySchema);
    } catch {
      console.error(
        "strategy.yaml became unreadable during experiment evaluation",
      );
      writeYaml(path.join(swarmDir, "strategy.yaml"), {
        ...baselineStrategy,
        config_version: nextVersion + 1,
      });
    }

    expect(out.error().join("\n")).toContain("strategy.yaml became unreadable");
    expect(
      readYaml(path.join(swarmDir, "strategy.yaml"), StrategySchema),
    ).toEqual({
      ...baselineStrategy,
      config_version: 3,
    });
    expect(fs.readdirSync(path.join(swarmDir, "results"))).toEqual([]);
    expect(fs.readdirSync(path.join(swarmDir, "insights"))).toEqual([]);
  });
});
