import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { withLock, lockPath } from "../fs.js";
import { PmError } from "../errors.js";

describe("withLock", () => {
  let tmpDir: string;
  let pmDir: string;
  let epicsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-lock-test-"));
    pmDir = path.join(tmpDir, ".pm");
    epicsDir = path.join(pmDir, "epics");
    fs.mkdirSync(epicsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes the function and returns its result", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const result = await withLock(targetFile, () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it("executes async functions and returns their result", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const result = await withLock(targetFile, async () => {
      return "hello";
    });
    expect(result).toBe("hello");
  });

  it("creates a lock file during execution and removes it after", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(targetFile))
      .digest("hex")
      .slice(0, 8);
    const expectedLockFile = path.join(pmDir, `.lock-${hash}`);

    let lockExistedDuringExecution = false;

    await withLock(targetFile, () => {
      lockExistedDuringExecution = fs.existsSync(expectedLockFile);
    });

    expect(lockExistedDuringExecution).toBe(true);
    // Lock should be released after withLock completes
    expect(fs.existsSync(expectedLockFile)).toBe(false);
  });

  it("lock file contains pid and created_at", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(targetFile))
      .digest("hex")
      .slice(0, 8);
    const expectedLockFile = path.join(pmDir, `.lock-${hash}`);

    let lockContent: { pid: number; created_at: string } | null = null;

    await withLock(targetFile, () => {
      const raw = fs.readFileSync(expectedLockFile, "utf8");
      lockContent = JSON.parse(raw);
    });

    expect(lockContent).not.toBeNull();
    expect(lockContent!.pid).toBe(process.pid);
    expect(typeof lockContent!.created_at).toBe("string");
    // Verify it's a valid ISO date string
    expect(new Date(lockContent!.created_at).toISOString()).toBe(
      lockContent!.created_at,
    );
  });

  it("releases lock even if fn throws", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(targetFile))
      .digest("hex")
      .slice(0, 8);
    const expectedLockFile = path.join(pmDir, `.lock-${hash}`);

    await expect(
      withLock(targetFile, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Lock should still be released
    expect(fs.existsSync(expectedLockFile)).toBe(false);
  });

  it("breaks stale locks older than 30 seconds", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(targetFile))
      .digest("hex")
      .slice(0, 8);
    const lockFile = path.join(pmDir, `.lock-${hash}`);

    // Create a stale lock (31 seconds ago)
    const staleTime = new Date(Date.now() - 31_000).toISOString();
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ pid: 99999, created_at: staleTime }),
    );

    // Should still be able to acquire the lock
    const result = await withLock(targetFile, () => "success");
    expect(result).toBe("success");
  });

  it("throws PmError with LOCK_ACQUISITION_FAILED after retries on non-stale lock", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(targetFile))
      .digest("hex")
      .slice(0, 8);
    const lockFile = path.join(pmDir, `.lock-${hash}`);

    // Create a fresh (non-stale) lock held by "another process"
    const freshTime = new Date().toISOString();
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ pid: 99999, created_at: freshTime }),
    );

    try {
      await withLock(targetFile, () => "should not reach");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PmError);
      if (err instanceof PmError) {
        expect(err.code).toBe("LOCK_ACQUISITION_FAILED");
        expect(err.message).toContain("after 3 retries");
        expect(err.message).toContain(targetFile);
      }
    }

    // Clean up the lock so afterEach doesn't fail
    fs.unlinkSync(lockFile);
  });

  it("serializes concurrent access to the same file", async () => {
    const targetFile = path.join(epicsDir, "E001-test.yaml");
    const order: number[] = [];

    // First lock should succeed; second should succeed after first releases
    const p1 = withLock(targetFile, async () => {
      order.push(1);
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push(2);
    });

    // Small delay to ensure p1 acquires first
    await new Promise((resolve) => setTimeout(resolve, 10));

    const p2 = withLock(targetFile, async () => {
      order.push(3);
    });

    await Promise.all([p1, p2]);

    // p1 should complete (1,2) before p2 starts (3)
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("lockPath", () => {
  it("produces a path inside .pm/ for files under .pm/epics/", () => {
    const filePath = "/some/project/.pm/epics/E001-test.yaml";
    const result = lockPath(filePath);
    expect(result).toMatch(/^\/some\/project\/\.pm\/\.lock-[a-f0-9]{8}$/);
  });

  it("produces deterministic paths for the same input", () => {
    const filePath = "/some/project/.pm/epics/E001-test.yaml";
    expect(lockPath(filePath)).toBe(lockPath(filePath));
  });

  it("produces different paths for different files", () => {
    const a = lockPath("/some/project/.pm/epics/E001-test.yaml");
    const b = lockPath("/some/project/.pm/epics/E002-other.yaml");
    expect(a).not.toBe(b);
  });

  it("uses sha256 hash of the resolved file path", () => {
    const filePath = "/some/project/.pm/epics/E001-test.yaml";
    const hash = crypto
      .createHash("sha256")
      .update(path.resolve(filePath))
      .digest("hex")
      .slice(0, 8);
    const result = lockPath(filePath);
    expect(result).toContain(`.lock-${hash}`);
  });
});
