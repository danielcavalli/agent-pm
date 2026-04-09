import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectCommandArtifactDrift,
  getCliSurfaceOutputPath,
  getMcpSurfaceOutputPath,
  writeGeneratedCommandArtifacts,
} from "../command-artifacts.js";
import { getCommandReferenceOutputPath } from "../command-reference.js";

describe("command artifact drift detection", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-command-artifacts-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes all generated command artifacts", () => {
    const outputPaths = writeGeneratedCommandArtifacts();

    expect(outputPaths).toEqual([
      getCliSurfaceOutputPath(),
      getMcpSurfaceOutputPath(),
      getCommandReferenceOutputPath(),
    ]);

    for (const outputPath of outputPaths) {
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("flags a stale generated artifact fixture", () => {
    writeGeneratedCommandArtifacts();
    fs.writeFileSync(getMcpSurfaceOutputPath(), "[]\n", "utf8");

    expect(detectCommandArtifactDrift()).toEqual([
      {
        label: "MCP surface",
        outputPath: getMcpSurfaceOutputPath(),
        status: "stale",
      },
    ]);
  });
});
