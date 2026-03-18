import { spawn, execSync } from "node:child_process";

// ── Tmux detection ───────────────────────────────────────────────────────────

/** Check if the current session is inside tmux */
export function isTmuxAvailable(): boolean {
  return !!process.env.TMUX;
}

/** Check if the claude CLI is available on PATH */
export function isClaudeAvailable(): boolean {
  try {
    execSync("command -v claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Command building ─────────────────────────────────────────────────────────

/** Build the shell command string for dispatching a story */
export function buildStoryCommand(storyCode: string): string {
  return `claude -p "/pm-work-on ${storyCode}"`;
}

/** Build the shell command string for dispatching an epic (full project) */
export function buildEpicCommand(): string {
  return `claude -p "/pm-work-on-project"`;
}

// ── Dispatch mechanisms ──────────────────────────────────────────────────────

export interface DispatchResult {
  success: boolean;
  method: "tmux" | "background";
  detail?: string;
}

/**
 * Dispatch an agent command in a new tmux pane (horizontal split).
 * Returns the result of the dispatch attempt.
 */
export function dispatchInTmuxPane(command: string): DispatchResult {
  try {
    execSync(`tmux split-window -h '${command.replace(/'/g, "'\\''")}'`, {
      stdio: "ignore",
    });
    return { success: true, method: "tmux", detail: "New tmux pane opened" };
  } catch (err) {
    return {
      success: false,
      method: "tmux",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Dispatch an agent command as a detached background process.
 * Returns the result with the PID if successful.
 */
export function dispatchBackground(command: string): DispatchResult {
  try {
    const child = spawn("sh", ["-c", command], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.unref();
    const pid = child.pid;
    return {
      success: true,
      method: "background",
      detail: pid ? `PID ${pid}` : "spawned",
    };
  } catch (err) {
    return {
      success: false,
      method: "background",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * High-level dispatch: tries tmux first, falls back to background.
 */
export function dispatch(command: string): DispatchResult {
  if (isTmuxAvailable()) {
    return dispatchInTmuxPane(command);
  }
  return dispatchBackground(command);
}
