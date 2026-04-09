import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createProgram } from "../../contracts/cli-surface.js";

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);

  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return true;
  }) as typeof process.stderr.write;

  return {
    lines,
    restore: () => {
      process.stderr.write = originalWrite;
    },
  };
}

function makeProgram() {
  return createProgram("test", (_contract, fn) => fn);
}

function parseTelemetry(lines: string[]) {
  const raw = lines.join("").trim().split("\n").filter(Boolean);
  const events = raw
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const summary = raw.find((line) => line.startsWith("mutation_summary"));
  return { events, summary };
}

describe("mutation telemetry", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mutation-telemetry-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env["PM_HOME"];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits start and success events plus summary counters for mutable commands", async () => {
    const stderr = captureStderr();

    try {
      await makeProgram().parseAsync([
        "node",
        "pm",
        "init",
        "--name",
        "Telemetry Test",
        "--code",
        "TEL",
      ]);
    } finally {
      stderr.restore();
    }

    const { events, summary } = parseTelemetry(stderr.lines);
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe("start");
    expect(events[1]?.event).toBe("success");
    expect(events[0]?.command).toBe("pm init");
    expect(events[0]?.operation_id).toBe(events[1]?.operation_id);
    expect(events[1]?.counters).toMatchObject({
      atomic_writes: expect.any(Number),
      lock_attempts: expect.any(Number),
    });
    expect(summary).toContain("status=success");
    expect(summary).toContain(`operation_id=${events[0]?.operation_id}`);
    expect(summary).toContain("writes=");
    expect(summary).toContain("lock_attempts=");
  });

  it("emits failure telemetry with the same operation id", async () => {
    const stderr = captureStderr();

    try {
      await expect(
        makeProgram().parseAsync([
          "node",
          "pm",
          "story",
          "update",
          "TEL-E001-S001",
        ]),
      ).rejects.toThrow(
        "At least one of --status, --priority, or --depends-on",
      );
    } finally {
      stderr.restore();
    }

    const { events, summary } = parseTelemetry(stderr.lines);
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe("start");
    expect(events[1]?.event).toBe("failure");
    expect(events[0]?.command).toBe("pm story update");
    expect(events[0]?.operation_id).toBe(events[1]?.operation_id);
    expect(events[1]?.error).toMatchObject({
      message: expect.stringContaining(
        "At least one of --status, --priority, or --depends-on",
      ),
    });
    expect(summary).toContain("status=failure");
    expect(summary).toContain(`operation_id=${events[0]?.operation_id}`);
  });
});
