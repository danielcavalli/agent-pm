import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createProgram } from "../cli-surface.js";

describe("createProgram", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-cli-surface-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeProgram() {
    return createProgram("test", (_contract, fn) => fn);
  }

  it("builds the command tree and representative help from the registry", () => {
    const program = makeProgram();

    expect(program.helpInformation()).toContain("init");
    expect(program.helpInformation()).toContain("story");
    expect(program.helpInformation()).toContain("report");
    expect(program.helpInformation()).toContain("swarm");

    const storyCommand = program.commands.find(
      (command) => command.name() === "story",
    );
    const swarmCommand = program.commands.find(
      (command) => command.name() === "swarm",
    );
    const storyAddCommand = storyCommand?.commands.find(
      (command) => command.name() === "add",
    );
    const swarmAnalyzeCommand = swarmCommand?.commands.find(
      (command) => command.name() === "analyze",
    );
    const swarmInitCommand = swarmCommand?.commands.find(
      (command) => command.name() === "init",
    );

    expect(storyCommand?.helpInformation()).toContain(
      "Manage stories within an epic",
    );
    expect(swarmCommand?.helpInformation()).toContain(
      "Manage SwarmStore initialization and storage",
    );
    expect(swarmCommand?.helpInformation()).toContain("analyze");
    expect(swarmCommand?.helpInformation()).toContain("init");
    expect(swarmAnalyzeCommand?.helpInformation()).toContain(
      "Analyze swarm experiment state and print an operator-friendly YAML summary",
    );
    expect(swarmInitCommand?.helpInformation()).toContain(
      "Initialize optional swarm storage under .pm/swarm with default templates",
    );
    expect(storyAddCommand?.helpInformation()).toContain("<epicCode>");
    expect(storyAddCommand?.helpInformation()).toContain(
      "--depends-on <storyCode...>",
    );
    expect(storyAddCommand?.helpInformation()).toContain(
      "--criteria <criteria...>",
    );
  });

  it("preserves representative command behavior through the generated CLI surface", async () => {
    await makeProgram().parseAsync([
      "node",
      "pm",
      "init",
      "--name",
      "Generated CLI Test",
      "--code",
      "GCLI",
      "--description",
      "Contract-driven CLI registration test",
      "--tech-stack",
      "TypeScript",
      "Node.js",
    ]);

    await makeProgram().parseAsync(["node", "pm", "swarm", "init"]);

    await makeProgram().parseAsync([
      "node",
      "pm",
      "epic",
      "add",
      "GCLI",
      "--title",
      "Registry Epic",
    ]);

    await makeProgram().parseAsync([
      "node",
      "pm",
      "story",
      "add",
      "GCLI-E001",
      "--title",
      "Registry Story",
      "--criteria",
      "First criterion",
      "Second criterion",
      "--depends-on",
      "GCLI-E001-S099",
    ]);

    await makeProgram().parseAsync([
      "node",
      "pm",
      "adr",
      "create",
      "--project",
      "GCLI",
      "--title",
      "Generated CLI ADR",
      "--status",
      "accepted",
      "--context",
      "Need one contract-driven command surface",
      "--decision",
      "Build Commander wiring from the registry",
      "--positive",
      "Shared metadata",
      "--negative",
      "Initial generator complexity",
      "--author-type",
      "agent",
      "--author-id",
      "cli-surface-test",
      "--tags",
      "cli",
      "contract",
    ]);

    const epicFile = path.join(
      tmpDir,
      ".pm",
      "epics",
      "E001-registry-epic.yaml",
    );
    const epicContent = fs.readFileSync(epicFile, "utf8");
    expect(epicContent).toContain("code: GCLI-E001-S001");
    expect(epicContent).toContain("First criterion");
    expect(epicContent).toContain("GCLI-E001-S099");

    expect(
      fs.existsSync(path.join(tmpDir, ".pm", "swarm", "tactics.yaml")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pm", "swarm", "strategy.yaml")),
    ).toBe(true);

    const adrDir = path.join(tmpDir, ".pm", "adrs");
    const adrFiles = fs.readdirSync(adrDir);
    expect(adrFiles).toContain("ADR-001.yaml");

    const adrContent = fs.readFileSync(
      path.join(adrDir, "ADR-001.yaml"),
      "utf8",
    );
    expect(adrContent).toContain("Generated CLI ADR");
    expect(adrContent).toContain("agent_id: cli-surface-test");
    expect(adrContent).toContain("- cli");
  });
});
