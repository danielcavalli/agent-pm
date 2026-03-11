import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { toLocal } from "../migrate.js";
import { PmError } from "../../lib/errors.js";

describe("pm migrate to-local", () => {
  let tmpDir: string;
  let globalPmDir: string;
  let targetDir: string;
  let origPmHome: string | undefined;

  beforeEach(() => {
    origPmHome = process.env["PM_HOME"];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-migrate-test-"));
    globalPmDir = path.join(tmpDir, ".pm");
    targetDir = path.join(tmpDir, "target-repo");
    process.env["HOME"] = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origPmHome !== undefined) {
      process.env["PM_HOME"] = origPmHome;
    } else {
      delete process.env["PM_HOME"];
    }
  });

  it("AC1: pm migrate to-local --code PM --target /path/to/repo copies data correctly", async () => {
    const projectCode = "PM";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "comments"), { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "adrs"), { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "reports"), { recursive: true });

    fs.writeFileSync(
      path.join(sourceProjectDir, "project.yaml"),
      "id: PM\ncode: PM\nname: Test Project\nstatus: active\ncreated_at: '2026-03-11'\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "epics", "E001-test.yaml"),
      "id: E001\ncode: PM-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "comments", "C001.yaml"),
      "id: C001\ncontent: Test comment\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "adrs", "ADR-001.yaml"),
      "id: ADR-001\ntitle: Test ADR\nstatus: accepted\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "reports", "R001-test.yaml"),
      "id: R001\ntitle: Test Report\n",
    );

    await toLocal({ code: projectCode, target: targetDir });

    const destPmDir = path.join(targetDir, ".pm");
    expect(fs.existsSync(destPmDir)).toBe(true);
    expect(fs.existsSync(path.join(destPmDir, "project.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(destPmDir, "epics", "E001-test.yaml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(destPmDir, "comments", "C001.yaml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(destPmDir, "adrs", "ADR-001.yaml"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(destPmDir, "reports", "R001-test.yaml")),
    ).toBe(true);
  });

  it("AC2: Directory structure is flattened (CODE/ nesting removed)", async () => {
    const projectCode = "TEST";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

    fs.writeFileSync(
      path.join(sourceProjectDir, "project.yaml"),
      "id: TEST\ncode: TEST\nname: Test\nstatus: active\ncreated_at: '2026-03-11'\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "epics", "E001-test.yaml"),
      "id: E001\ncode: TEST-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
    );

    await toLocal({ code: projectCode, target: targetDir });

    const destPmDir = path.join(targetDir, ".pm");
    expect(fs.existsSync(destPmDir)).toBe(true);
    expect(fs.existsSync(path.join(destPmDir, "project.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(destPmDir, "epics", "E001-test.yaml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(destPmDir, "projects", projectCode))).toBe(
      false,
    );
  });

  it("AC3: All YAML files (project, epics, comments, adrs) are preserved", async () => {
    const projectCode = "YAML";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "comments"), { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "adrs"), { recursive: true });

    const projectYaml =
      "id: YAML\ncode: YAML\nname: YAML Test\nstatus: active\ncreated_at: '2026-03-11'\n";
    const epicYaml =
      "id: E001\ncode: YAML-E001\ntitle: Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n";
    const commentYaml = "id: C001\ncontent: Comment\n";
    const adrYaml = "id: ADR-001\ntitle: ADR\nstatus: accepted\n";

    fs.writeFileSync(path.join(sourceProjectDir, "project.yaml"), projectYaml);
    fs.writeFileSync(
      path.join(sourceProjectDir, "epics", "E001-test.yaml"),
      epicYaml,
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "comments", "C001.yaml"),
      commentYaml,
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "adrs", "ADR-001.yaml"),
      adrYaml,
    );

    await toLocal({ code: projectCode, target: targetDir });

    const destPmDir = path.join(targetDir, ".pm");
    expect(fs.readFileSync(path.join(destPmDir, "project.yaml"), "utf8")).toBe(
      projectYaml,
    );
    expect(
      fs.readFileSync(path.join(destPmDir, "epics", "E001-test.yaml"), "utf8"),
    ).toBe(epicYaml);
    expect(
      fs.readFileSync(path.join(destPmDir, "comments", "C001.yaml"), "utf8"),
    ).toBe(commentYaml);
    expect(
      fs.readFileSync(path.join(destPmDir, "adrs", "ADR-001.yaml"), "utf8"),
    ).toBe(adrYaml);
  });

  it("AC4: Reports and execution data are preserved", async () => {
    const projectCode = "RPT";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "reports"), { recursive: true });

    fs.writeFileSync(
      path.join(sourceProjectDir, "project.yaml"),
      "id: RPT\ncode: RPT\nname: Report Test\nstatus: active\ncreated_at: '2026-03-11'\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "reports", "R001-test.yaml"),
      "id: R001\ntitle: Report\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "index.yaml"),
      "projects: []\n",
    );

    await toLocal({ code: projectCode, target: targetDir });

    const destPmDir = path.join(targetDir, ".pm");
    expect(
      fs.existsSync(path.join(destPmDir, "reports", "R001-test.yaml")),
    ).toBe(true);
    expect(fs.existsSync(path.join(destPmDir, "index.yaml"))).toBe(true);
  });

  it("AC5: Command prints summary of migrated files", async () => {
    const projectCode = "SUM";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

    fs.writeFileSync(
      path.join(sourceProjectDir, "project.yaml"),
      "id: SUM\ncode: SUM\nname: Summary Test\nstatus: active\ncreated_at: '2026-03-11'\n",
    );
    fs.writeFileSync(
      path.join(sourceProjectDir, "epics", "E001-test.yaml"),
      "id: E001\ncode: SUM-E001\ntitle: Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
    );

    const consoleSpy: string[] = [];
    const origLog = console.log;
    console.log = (...args) => {
      consoleSpy.push(args.join(" "));
    };

    try {
      await toLocal({ code: projectCode, target: targetDir });
    } finally {
      console.log = origLog;
    }

    const output = consoleSpy.join("\n");
    expect(output).toContain("Migrated project SUM");
    expect(output).toContain("Migrated files:");
    expect(output).toContain("project.yaml");
    expect(output).toContain("epics/");
  });

  it("errors when --code is missing", async () => {
    await expect(toLocal({ target: targetDir })).rejects.toThrow(PmError);
  });

  it("errors when --target is missing", async () => {
    await expect(toLocal({ code: "PM" })).rejects.toThrow(PmError);
  });

  it("errors when project not found in global storage", async () => {
    await expect(
      toLocal({ code: "NOTFOUND", target: targetDir }),
    ).rejects.toThrow(PmError);
  });

  it("errors when destination .pm/ already exists", async () => {
    const projectCode = "EXISTS";
    const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
    fs.mkdirSync(sourceProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceProjectDir, "project.yaml"),
      "id: EXISTS\ncode: EXISTS\nname: Test\nstatus: active\ncreated_at: '2026-03-11'\n",
    );

    fs.mkdirSync(path.join(targetDir, ".pm"), { recursive: true });

    await expect(
      toLocal({ code: projectCode, target: targetDir }),
    ).rejects.toThrow(PmError);
  });

  describe("post-migration verification", () => {
    it("AC1: Migration runs verification after copying", async () => {
      const projectCode = "VER";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: VER\ncode: VER\nname: Verification Test\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ncode: VER-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
      );

      const consoleSpy: string[] = [];
      const origLog = console.log;
      console.log = (...args) => {
        consoleSpy.push(args.join(" "));
      };

      try {
        await toLocal({ code: projectCode, target: targetDir });
      } finally {
        console.log = origLog;
      }

      const output = consoleSpy.join("\n");
      expect(output).toContain("Verifying migration");
      expect(output).toContain("Verification successful");
    });

    it("AC2: Schema validation errors are reported with file paths", async () => {
      const projectCode = "INVAL";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: INVAL\ncode: INVAL\nname: Invalid Project\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ntitle: Missing required fields\n",
      );

      const consoleSpy: string[] = [];
      const origLog = console.log;
      console.log = (...args) => {
        consoleSpy.push(args.join(" "));
      };

      try {
        await expect(
          toLocal({ code: projectCode, target: targetDir }),
        ).rejects.toThrow(PmError);
      } finally {
        console.log = origLog;
      }

      const output = consoleSpy.join("\n");
      expect(output).toContain("Migration verification failed");
      expect(output).toContain("epics/E001-test.yaml");
    });

    it("AC3: Migration exits non-zero if verification fails", async () => {
      const projectCode = "FAIL";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: FAIL\ntitle: Missing code field\nstatus: active\n",
      );

      await expect(
        toLocal({ code: projectCode, target: targetDir }),
      ).rejects.toThrow(PmError);
    });

    it("AC4: Success message confirms project loads correctly", async () => {
      const projectCode = "SUCC";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: SUCC\ncode: SUCC\nname: Success Test\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ncode: SUCC-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
      );

      const consoleSpy: string[] = [];
      const origLog = console.log;
      console.log = (...args) => {
        consoleSpy.push(args.join(" "));
      };

      try {
        await toLocal({ code: projectCode, target: targetDir });
      } finally {
        console.log = origLog;
      }

      const output = consoleSpy.join("\n");
      expect(output).toContain("Verification successful");
      expect(output).toContain("Project loads correctly");
    });
  });

  describe("cleanup option", () => {
    it("AC1: Default behavior preserves the global copy", async () => {
      const projectCode = "NOCLN";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: NOCLN\ncode: NOCLN\nname: No Cleanup Test\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ncode: NOCLN-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
      );

      await toLocal({ code: projectCode, target: targetDir });

      expect(fs.existsSync(sourceProjectDir)).toBe(true);
      expect(fs.existsSync(path.join(sourceProjectDir, "project.yaml"))).toBe(
        true,
      );
    });

    it("AC2: --cleanup flag removes the project directory from ~/.pm/projects/", async () => {
      const projectCode = "CLEAN";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: CLEAN\ncode: CLEAN\nname: Cleanup Test\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ncode: CLEAN-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
      );

      await toLocal({ code: projectCode, target: targetDir, cleanup: true });

      expect(fs.existsSync(sourceProjectDir)).toBe(false);
    });

    it("AC3: Cleanup only runs after successful verification", async () => {
      const projectCode = "FAILCLEAN";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: FAILCLEAN\ntitle: Missing code field\nstatus: active\n",
      );

      await expect(
        toLocal({ code: projectCode, target: targetDir, cleanup: true }),
      ).rejects.toThrow(PmError);

      expect(fs.existsSync(sourceProjectDir)).toBe(true);
    });

    it("AC4: Warning message shown before cleanup", async () => {
      const projectCode = "WARN";
      const sourceProjectDir = path.join(globalPmDir, "projects", projectCode);
      fs.mkdirSync(sourceProjectDir, { recursive: true });
      fs.mkdirSync(path.join(sourceProjectDir, "epics"), { recursive: true });

      fs.writeFileSync(
        path.join(sourceProjectDir, "project.yaml"),
        "id: WARN\ncode: WARN\nname: Warning Test\nstatus: active\ncreated_at: '2026-03-11'\n",
      );
      fs.writeFileSync(
        path.join(sourceProjectDir, "epics", "E001-test.yaml"),
        "id: E001\ncode: WARN-E001\ntitle: Test Epic\nstatus: backlog\npriority: high\ncreated_at: '2026-03-11'\nstories: []\n",
      );

      const consoleSpy: string[] = [];
      const origLog = console.log;
      console.log = (...args) => {
        consoleSpy.push(args.join(" "));
      };

      try {
        await toLocal({ code: projectCode, target: targetDir, cleanup: true });
      } finally {
        console.log = origLog;
      }

      const output = consoleSpy.join("\n");
      expect(output).toContain(
        "This will remove the project from global storage",
      );
      expect(output).toContain("Cleaned up global project directory");
    });
  });
});
