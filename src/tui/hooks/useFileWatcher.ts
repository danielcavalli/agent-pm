import { useEffect, useCallback } from "react";
import * as fs from "node:fs";

interface UseFileWatcherOptions {
  projectsDir: string;
  onReload: () => void;
  debounceMs?: number;
}

/**
 * Watch the projects directory recursively for *.yaml changes.
 * Debounces rapid successive changes to avoid flicker.
 * Calls onReload when a change is detected.
 */
export function useFileWatcher({
  projectsDir,
  onReload,
  debounceMs = 300,
}: UseFileWatcherOptions): void {
  const stableOnReload = useCallback(onReload, [onReload]);

  useEffect(() => {
    if (!fs.existsSync(projectsDir)) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleReload() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        stableOnReload();
      }, debounceMs);
    }

    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(
        projectsDir,
        { recursive: true },
        (_event: fs.WatchEventType, filename: string | Buffer | null) => {
          if (!filename) return;
          const name =
            typeof filename === "string" ? filename : filename.toString("utf8");
          if (name.endsWith(".yaml")) {
            scheduleReload();
          }
        },
      );
    } catch {
      // fs.watch with recursive may not be supported on all platforms;
      // fail silently — TUI remains functional, just without live reload.
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (watcher) watcher.close();
    };
  }, [projectsDir, debounceMs, stableOnReload]);
}

/**
 * Find the key of the currently selected node so we can restore cursor
 * after a reload.
 */
export function findCursorKey(
  rows: Array<{ key: string }>,
  cursor: number,
): string | null {
  return rows[cursor]?.key ?? null;
}

/**
 * Find the row index for a given key in a new set of rows.
 * Returns 0 if not found.
 */
export function restoreCursor(
  rows: Array<{ key: string }>,
  key: string | null,
): number {
  if (!key) return 0;
  const idx = rows.findIndex((r) => r.key === key);
  return idx >= 0 ? idx : 0;
}
