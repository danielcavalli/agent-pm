import { describe, expect, it } from "vitest";
import {
  renderCommandReference,
  writeCommandReference,
} from "../command-reference.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("command reference generation", () => {
  it("renders command descriptions, arguments, and examples from contract metadata", () => {
    const content = renderCommandReference();

    expect(content).toContain("# Command Reference");
    expect(content).toContain("## `pm init`");
    expect(content).toContain("Initialize a new project.");
    expect(content).toContain(
      "| Argument | Type | CLI | MCP | Required | Default | Description |",
    );
    expect(content).toContain("`--name <name>`");
    expect(content).toContain('pm init --name "Project" --code PM');
    expect(content).toContain("`pm_story_add`");
  });

  it("is deterministic for a fixed registry", () => {
    expect(renderCommandReference()).toBe(renderCommandReference());
  });

  it("writes the generated artifact to disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-command-docs-"));
    const outputPath = path.join(tmpDir, "commands.md");

    writeCommandReference(outputPath);

    const written = fs.readFileSync(outputPath, "utf8");
    expect(written).toBe(renderCommandReference());

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
