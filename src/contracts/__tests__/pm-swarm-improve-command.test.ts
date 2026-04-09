import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("/pm-swarm-improve command prompt", () => {
  it("documents loop-state resume and publish requirements", () => {
    const commandPath = path.resolve(
      process.cwd(),
      "install/commands/pm-swarm-improve.md",
    );
    const content = fs.readFileSync(commandPath, "utf8");

    expect(content).toContain(".pm/swarm/loop-state.yaml");
    expect(content).toContain(
      "If `.pm/swarm/loop-state.yaml` exists, read it first",
    );
    expect(content).toContain("Validate the file against `LoopStateSchema`");
    expect(content).toContain(
      "Write `.pm/swarm/loop-state.yaml` after publishing",
    );
    expect(content).toContain("`recent_summaries` (last 3 only)");
  });

  it("documents step validation and retry-once behavior", () => {
    const commandPath = path.resolve(
      process.cwd(),
      "install/commands/pm-swarm-improve.md",
    );
    const content = fs.readFileSync(commandPath, "utf8");

    expect(content).toContain("HypothesizeStepOutputSchema");
    expect(content).toContain("ConfigureStepOutputSchema");
    expect(content).toContain("EvaluateStepOutputSchema");
    expect(content).toContain("retry that step once");
    expect(content).toContain(
      "skip the rest of the iteration and restart at ANALYZE",
    );
  });

  it("documents the publish context budget", () => {
    const commandPath = path.resolve(
      process.cwd(),
      "install/commands/pm-swarm-improve.md",
    );
    const content = fs.readFileSync(commandPath, "utf8");

    expect(content).toContain("carry forward only");
    expect(content).toContain("current best from `metadata.yaml`");
    expect(content).toContain("the last 3 result summaries");
    expect(content).toContain("Discard all other prior context");
  });
});
