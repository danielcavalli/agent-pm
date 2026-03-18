import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  loadConsolidationConfig,
  consolidateConfig,
} from "../consolidate.js";
import {
  setupTmpDir,
  captureOutput,
  seedProject,
  type TmpDirHandle,
  type CapturedOutput,
} from "../../__tests__/integration-helpers.js";
import { PmError } from "../../lib/errors.js";
import { resetProjectCodeCache } from "../../lib/codes.js";

describe("consolidation config (E042-S001)", () => {
  let tmp: TmpDirHandle;
  let out: CapturedOutput;

  beforeEach(async () => {
    tmp = setupTmpDir();
    out = captureOutput();
    resetProjectCodeCache();
    await seedProject({ code: "TEST", name: "Test Project" });
  });

  afterEach(() => {
    out.restore();
    tmp.teardown();
    resetProjectCodeCache();
  });

  // ── AC1: Consolidation config is read from project.yaml at runtime ──

  it("AC1: loads consolidation config from project.yaml", () => {
    // Write a project.yaml with consolidation config
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 15,
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.max_reports_per_run).toBe(15);
    expect(config.trigger_mode).toBe("manual");
  });

  it("AC1: returns defaults when no consolidation section in project.yaml", () => {
    // Remove the consolidation section from project.yaml
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    delete project.consolidation;
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.max_reports_per_run).toBe(10);
    expect(config.trigger_mode).toBe("manual");
  });

  // ── AC2: max_reports_per_run is enforced during ingestion ──

  it("AC2: max_reports_per_run is read from config", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 5,
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.max_reports_per_run).toBe(5);
  });

  // ── AC3: Trigger conditions (manual, threshold, scheduled) are validated ──

  it("AC3: validates manual trigger mode", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.trigger_mode).toBe("manual");
  });

  it("AC3: validates event_based trigger mode with required trigger_event_count", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "event_based",
      trigger_event_count: 5,
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.trigger_mode).toBe("event_based");
    expect(config.trigger_event_count).toBe(5);
  });

  it("AC3: rejects event_based trigger mode without trigger_event_count", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "event_based",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "trigger_event_count",
    );
  });

  it("AC3: validates time_based trigger mode with required trigger_interval_minutes", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "time_based",
      trigger_interval_minutes: 60,
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.trigger_mode).toBe("time_based");
    expect(config.trigger_interval_minutes).toBe(60);
  });

  it("AC3: rejects time_based trigger mode without trigger_interval_minutes", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "time_based",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "trigger_interval_minutes",
    );
  });

  // ── AC4: pm consolidate config prints the current configuration ──

  it("AC4: consolidateConfig prints current configuration from project.yaml", async () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 20,
      trigger_mode: "manual",
      last_consolidated_at: "2026-03-11T14:27:07",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");
    resetProjectCodeCache();

    await consolidateConfig({});

    const output = out.log().join("\n");
    expect(output).toContain("Consolidation Config");
    expect(output).toContain("trigger_mode");
    expect(output).toContain("manual");
    expect(output).toContain("max_reports_per_run");
    expect(output).toContain("20");
    expect(output).toContain("last_consolidated_at");
    expect(output).toContain("2026-03-11T14:27:07");
  });

  it("AC4: consolidateConfig prints defaults when no consolidation section", async () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    delete project.consolidation;
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");
    resetProjectCodeCache();

    await consolidateConfig({});

    const output = out.log().join("\n");
    expect(output).toContain("Consolidation Config");
    expect(output).toContain("manual");
    expect(output).toContain("10");
  });

  it("AC4: consolidateConfig prints event_based config with trigger_event_count", async () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "event_based",
      trigger_event_count: 5,
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");
    resetProjectCodeCache();

    await consolidateConfig({});

    const output = out.log().join("\n");
    expect(output).toContain("event_based");
    expect(output).toContain("trigger_event_count");
    expect(output).toContain("5");
  });

  // ── AC5: Invalid config values produce clear error messages ──

  it("AC5: produces clear error for invalid trigger_mode", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "invalid_mode",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "Invalid consolidation config",
    );
  });

  it("AC5: produces clear error for negative max_reports_per_run", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: -5,
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "Invalid consolidation config",
    );
  });

  it("AC5: produces clear error for non-integer max_reports_per_run", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 3.5,
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "Invalid consolidation config",
    );
  });

  it("AC5: produces clear error for string max_reports_per_run", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: "not-a-number",
      trigger_mode: "manual",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    expect(() => loadConsolidationConfig()).toThrow(PmError);
    expect(() => loadConsolidationConfig()).toThrow(
      "Invalid consolidation config",
    );
  });

  it("AC1: loads last_consolidated_at from config", () => {
    const projectYaml = path.join(tmp.projectsDir, "project.yaml");
    const project = yaml.load(
      fs.readFileSync(projectYaml, "utf8"),
    ) as Record<string, unknown>;
    project.consolidation = {
      max_reports_per_run: 10,
      trigger_mode: "manual",
      last_consolidated_at: "2026-03-11T14:27:07",
    };
    fs.writeFileSync(projectYaml, yaml.dump(project), "utf8");

    const config = loadConsolidationConfig();
    expect(config.last_consolidated_at).toBe("2026-03-11T14:27:07");
  });
});
