import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { swarmAnalyze, swarmInit } from "../swarm.js";
import {
  captureOutput,
  seedProject,
  setupTmpDir,
  type CapturedOutput,
  type TmpDirHandle,
} from "../../__tests__/integration-helpers.js";
import { readYaml, writeYaml } from "../../lib/fs.js";
import { StrategySchema } from "../../schemas/index.js";
import { ValidationError } from "../../lib/errors.js";
import {
  ClaimSchema,
  ExperimentResultSchema,
  HypothesisSchema,
} from "../../schemas/index.js";

describe("pm swarm init (integration)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(() => {
    tmp = setupTmpDir();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
  });

  it("creates the expected swarm directories and default files", async () => {
    await seedProject({ code: "TEST", name: "Test Project" });

    await swarmInit();

    const swarmDir = path.join(tmp.projectsDir, "swarm");
    for (const subdirectory of [
      "observations",
      "results",
      "claims",
      "hypotheses",
      "insights",
      "best",
    ]) {
      const subdirectoryPath = path.join(swarmDir, subdirectory);
      expect(fs.existsSync(subdirectoryPath)).toBe(true);
      expect(fs.statSync(subdirectoryPath).isDirectory()).toBe(true);
    }

    const templatePath = path.join(
      new URL(
        "../../../docs/templates/swarm-default-tactics.yaml",
        import.meta.url,
      ).pathname,
    );
    expect(fs.readFileSync(path.join(swarmDir, "tactics.yaml"), "utf8")).toBe(
      fs.readFileSync(templatePath, "utf8"),
    );

    const strategy = readYaml(
      path.join(swarmDir, "strategy.yaml"),
      StrategySchema,
    );
    expect(strategy).toEqual({
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
  });

  it("warns and does not overwrite when .pm/swarm already exists", async () => {
    await seedProject({ code: "TEST", name: "Test Project" });
    const swarmDir = path.join(tmp.projectsDir, "swarm");
    fs.mkdirSync(swarmDir, { recursive: true });
    fs.writeFileSync(path.join(swarmDir, "strategy.yaml"), "sentinel: true\n");

    await swarmInit();

    expect(out.log().join("\n")).toContain("already exists");
    expect(fs.readFileSync(path.join(swarmDir, "strategy.yaml"), "utf8")).toBe(
      "sentinel: true\n",
    );
    expect(fs.existsSync(path.join(swarmDir, "tactics.yaml"))).toBe(false);
  });

  it("fails with a clear error when no project exists", async () => {
    await expect(swarmInit()).rejects.toThrow(ValidationError);
    await expect(swarmInit()).rejects.toThrow(
      "No project found. Run pm init first.",
    );
  });

  it("prints a YAML analysis summary with the expected fields", async () => {
    await seedProject({ code: "TEST", name: "Test Project" });
    await swarmInit();

    const swarmDir = path.join(tmp.projectsDir, "swarm");
    writeYaml(path.join(swarmDir, "best", "metadata.yaml"), {
      status: "active",
      composite_score: 0.84,
      experiment_id: "exp-06",
      strategy_snapshot: { version: 1, config_version: 6 },
      board_hash: "sha256-best",
      updated_at: "2026-04-06T12:00:00Z",
    });

    for (const result of [
      {
        experiment_id: "exp-01",
        agent_id: "agent-a",
        mutation_type: "runtime_config",
        status: "keep",
        composite_score: 0.4,
        completed_at: "2026-04-01T12:00:00Z",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 5,
          new_value: 6,
        },
      },
      {
        experiment_id: "exp-02",
        agent_id: "agent-b",
        mutation_type: "board_mutation",
        status: "keep",
        composite_score: 0.48,
        completed_at: "2026-04-02T12:00:00Z",
        change_details: {
          pm_commands: ["pm story add TEST-E001 --title Split analysis work"],
          board_commit: "commit-02",
        },
      },
      {
        experiment_id: "exp-03",
        agent_id: "agent-a",
        mutation_type: "runtime_config",
        status: "keep",
        composite_score: 0.57,
        completed_at: "2026-04-03T12:00:00Z",
        change_details: {
          parameter_path: "dispatch.max_concurrent_agents",
          old_value: 6,
          new_value: 7,
        },
      },
      {
        experiment_id: "exp-04",
        agent_id: "agent-b",
        mutation_type: "board_mutation",
        status: "discard",
        composite_score: 0.53,
        completed_at: "2026-04-04T12:00:00Z",
        change_details: {
          pm_commands: ["pm prioritize TEST --epic TEST-E001 --strategy focus"],
          board_commit: "commit-04",
        },
      },
      {
        experiment_id: "exp-05",
        agent_id: "agent-c",
        mutation_type: "runtime_config",
        status: "keep",
        composite_score: 0.69,
        completed_at: "2026-04-05T12:00:00Z",
        change_details: {
          parameter_path: "heartbeat.frequency_seconds",
          old_value: 15,
          new_value: 10,
        },
      },
      {
        experiment_id: "exp-06",
        agent_id: "agent-b",
        mutation_type: "board_mutation",
        status: "keep",
        composite_score: 0.84,
        completed_at: "2026-04-06T12:00:00Z",
        change_details: {
          pm_commands: [
            "pm story update TEST-E001-S001 --depends-on TEST-E001-S002",
          ],
          board_commit: "commit-06",
        },
      },
    ]) {
      writeYaml(
        path.join(swarmDir, "results", `${result.experiment_id}.yaml`),
        ExperimentResultSchema.parse({
          description: `${result.mutation_type} experiment ${result.experiment_id}`,
          observation_window_stories: 10,
          tactic_scores: {
            throughput: {
              value: result.composite_score,
              direction: "higher_is_better",
            },
          },
          delta_vs_previous_best: 0.1,
          strategy_snapshot: { version: 1, config_version: 1 },
          board_hash: `sha256-${result.experiment_id}`,
          started_at: `${result.completed_at.replace("12:00:00Z", "11:00:00Z")}`,
          ...result,
        }),
      );
    }

    writeYaml(
      path.join(swarmDir, "claims", "agent-a-raise-throughput.yaml"),
      ClaimSchema.parse({
        agent_id: "agent-a",
        type: "runtime_config",
        description: "Raise throughput",
        parameter_path: "dispatch.max_concurrent_agents",
        new_value: 8,
        ttl_seconds: 7200,
        claimed_at: "2026-04-08T13:30:00Z",
        status: "active",
      }),
    );

    writeYaml(
      path.join(swarmDir, "hypotheses", "hyp-01.yaml"),
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
        evidence_keys: ["exp-06"],
        priority: 4,
        status: "unclaimed",
        created_at: "2026-04-08T11:00:00Z",
      }),
    );

    writeYaml(
      path.join(swarmDir, "hypotheses", "hyp-02.yaml"),
      HypothesisSchema.parse({
        agent_id: "agent-b",
        title: "Tune heartbeat later",
        type: "parameter_change",
        hypothesis: "Lower heartbeat frequency may help noise",
        suggested_change: {
          parameter_path: "heartbeat.frequency_seconds",
          new_value: 12,
          expected_effect: "Reduce chatter",
        },
        evidence_keys: ["exp-05"],
        priority: 2,
        status: "claimed",
        created_at: "2026-04-08T11:10:00Z",
      }),
    );

    await swarmAnalyze();

    const analysisOutput = out
      .log()
      .join("\n")
      .slice(out.log().join("\n").lastIndexOf("global_best:"));
    const summary = yaml.load(analysisOutput) as Record<string, unknown>;

    expect(summary["global_best"]).toEqual({
      status: "active",
      composite_score: 0.84,
      experiment_id: "exp-06",
      strategy_snapshot: { version: 1, config_version: 6 },
      board_hash: "sha256-best",
      updated_at: "2026-04-06T12:00:00Z",
    });
    expect(summary["improvement_trend"]).toBe("improving");
    expect(summary["experiment_count"]).toBe(6);
    expect(summary["active_claims"]).toBe(1);
    expect(summary["unclaimed_hypotheses"]).toBe(1);
    expect(summary["recent_results"]).toHaveLength(5);
    expect(summary["recent_results"]).toEqual([
      expect.objectContaining({ experiment_id: "exp-06" }),
      expect.objectContaining({ experiment_id: "exp-05" }),
      expect.objectContaining({ experiment_id: "exp-04" }),
      expect.objectContaining({ experiment_id: "exp-03" }),
      expect.objectContaining({ experiment_id: "exp-02" }),
    ]);
    expect(summary["exploration_coverage"]).toEqual({
      runtime_config: {
        "dispatch.max_concurrent_agents": 2,
        "heartbeat.frequency_seconds": 1,
      },
      board_mutations: {
        story_splits: 1,
        priority_changes: 1,
        dependency_changes: 1,
      },
    });
  });

  it("fails with a clear error when swarm storage is missing", async () => {
    await seedProject({ code: "TEST", name: "Test Project" });

    await expect(swarmAnalyze()).rejects.toThrow(ValidationError);
    await expect(swarmAnalyze()).rejects.toThrow(
      "Swarm not initialized. Run pm swarm init first.",
    );
  });
});
