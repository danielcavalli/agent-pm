import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { commandRegistry } from "../command-registry.js";

const repoRoot = path.resolve(__dirname, "../../..");
const policyPath = path.join(repoRoot, "docs/reference/mutation-operations.md");
const contributingPath = path.join(repoRoot, "CONTRIBUTING.md");
const readmePath = path.join(repoRoot, "README.md");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("mutation policy documentation", () => {
  it("documents every mutable CLI command path from the registry", () => {
    const policy = read(policyPath);
    const documented = Array.from(
      policy.matchAll(/\|\s*`(pm [^`]+)`\s*\|/g),
      (match) => match[1],
    ).sort();
    const mutableCommands = commandRegistry
      .filter(
        (contract) =>
          contract.sideEffects.level === "write" ||
          contract.sideEffects.level === "destructive",
      )
      .map((contract) => `pm ${contract.cli.path.join(" ")}`)
      .sort();

    expect(documented).toEqual(mutableCommands);
    expect(policy).toContain("## Safety Levels");
    expect(policy).toContain("## Lock Classes");
    expect(policy).toContain("## Mutable Command Map");
  });

  it("is referenced by contributor-facing docs and checklists", () => {
    const contributing = read(contributingPath);
    const readme = read(readmePath);

    expect(contributing).toContain("docs/reference/mutation-operations.md");
    expect(contributing).toContain("Mutation policy conformance is explicit");
    expect(readme).toContain("docs/reference/mutation-operations.md");
  });
});
