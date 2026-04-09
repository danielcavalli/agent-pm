import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("/pm-work-on-project command prompt", () => {
  it("documents strategy-driven dispatch concurrency with fallback behavior", () => {
    const commandPath = path.resolve(
      process.cwd(),
      "install/commands/pm-work-on-project.md",
    );
    const content = fs.readFileSync(commandPath, "utf8");

    expect(content).toContain(
      "## Step 3.5: Load dispatch concurrency strategy",
    );
    expect(content).toContain("computeObservationMetadata(pmDir)");
    expect(content).toContain("parameters.dispatch.max_concurrent_agents");
    expect(content).toContain("inclusive range `[1, 20]`");
    expect(content).toContain("warning to stderr");
    expect(content).toContain("dispatch_concurrency_limit");
    expect(content).toContain("config_version");
    expect(content).toContain("If `dispatch_concurrency_limit` is a number");
    expect(content).toContain(
      "keep the remaining stories queued within the same tier",
    );
    expect(content).toContain(
      "**Concurrency Limit:** `dispatch_concurrency_limit`",
    );
  });

  it("documents a direct worker prompt contract with anti-recursion guards", () => {
    const commandPath = path.resolve(
      process.cwd(),
      "install/commands/pm-work-on-project.md",
    );
    const content = fs.readFileSync(commandPath, "utf8");

    expect(content).toContain("direct-execution prompt contract");
    expect(content).toContain(
      "Do **not** pass the literal slash command `/pm-work-on <STORY_CODE>`",
    );
    expect(content).toContain(
      "some sub-agents rediscovered `/pm-work-on` and spawned more workers",
    );
    expect(content).toContain(
      "Run `pm comment list --project <PROJECT_CODE> --task <STORY_CODE> --type agent` first.",
    );
    expect(content).toContain(
      "Run `pm work <STORY_CODE>` to load the full story context and mark it in progress.",
    );
    expect(content).toContain("Anti-recursion guard:");
    expect(content).toContain(
      "Do not invoke `/pm-work-on`, `/pm-work-on-project`, or any other slash command.",
    );
    expect(content).toContain(
      "Do not spawn additional sub-agents or delegate this story.",
    );
    expect(content).toContain(
      "Never delegate by forwarding slash-command tokens to sub-agents",
    );
  });
});
