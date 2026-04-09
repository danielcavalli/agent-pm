import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import * as yaml from "js-yaml";
import type { Strategy } from "../schemas/index.js";
import { writeYaml } from "../lib/fs.js";
import { ValidationError } from "../lib/errors.js";
import { getPmDir } from "../lib/codes.js";
import { buildAnalysisSummary } from "../lib/swarm-store.js";

const SWARM_SUBDIRECTORIES = [
  "observations",
  "results",
  "claims",
  "hypotheses",
  "insights",
  "best",
] as const;

export const DEFAULT_STRATEGY: Strategy = {
  version: 1,
  config_version: 1,
  parameters: {
    dispatch: {
      max_concurrent_agents: 5,
    },
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
};

function getTemplatePath(): string {
  return new URL(
    "../../docs/templates/swarm-default-tactics.yaml",
    import.meta.url,
  ).pathname;
}

function dumpYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

function resolveSwarmPmDir(): string {
  const pmDir = getPmDir();
  const swarmDir = path.join(pmDir, "swarm");

  if (!fs.existsSync(swarmDir)) {
    throw new ValidationError(
      "Swarm not initialized. Run pm swarm init first.",
    );
  }

  return pmDir;
}

export async function swarmInit(): Promise<void> {
  let pmDir: string;
  try {
    pmDir = getPmDir();
  } catch {
    throw new ValidationError("No project found. Run pm init first.");
  }

  if (!fs.existsSync(path.join(pmDir, "project.yaml"))) {
    throw new ValidationError("No project found. Run pm init first.");
  }

  const swarmDir = path.join(pmDir, "swarm");
  if (fs.existsSync(swarmDir)) {
    console.log(
      chalk.yellow("Warning:") +
        " .pm/swarm/ already exists. No files were overwritten.",
    );
    return;
  }

  for (const subdirectory of SWARM_SUBDIRECTORIES) {
    fs.mkdirSync(path.join(swarmDir, subdirectory), { recursive: true });
  }

  fs.copyFileSync(getTemplatePath(), path.join(swarmDir, "tactics.yaml"));
  writeYaml(path.join(swarmDir, "strategy.yaml"), DEFAULT_STRATEGY);

  console.log(chalk.green("✓") + " Swarm storage initialized");
  console.log(chalk.dim("  Path: ") + swarmDir);
}

export async function swarmAnalyze(): Promise<void> {
  const pmDir = resolveSwarmPmDir();
  const summary = await buildAnalysisSummary(pmDir);
  const formattedSummary = {
    global_best: summary.global_best,
    improvement_trend: summary.improvement_trend,
    experiment_count: summary.experiment_count,
    exploration_coverage: summary.exploration_coverage,
    recent_results: summary.recent_results.slice(0, 5),
    active_claims: summary.active_claims.length,
    unclaimed_hypotheses: summary.unclaimed_hypotheses,
  };

  console.log(dumpYaml(formattedSummary).trimEnd());
}
