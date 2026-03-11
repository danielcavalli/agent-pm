import React, { useState, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { Key } from "ink";
import clipboard from "clipboardy";
import {
  useFileWatcher,
  findCursorKey,
  restoreCursor,
} from "./hooks/useFileWatcher.js";
import { useProjectTree } from "./hooks/useProjectTree.js";
import { getProjectsDir } from "../lib/codes.js";
import { TreePanel, flattenTree } from "./components/Tree.js";
import type { FlatRow } from "./components/Tree.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { StatusBar } from "./components/StatusBar.js";
import type { ProjectNode, TreeNode, FilterMode } from "./types.js";

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 40;

  const leftWidth = Math.floor(termWidth * 0.4);
  const rightWidth = termWidth - leftWidth - 1; // -1 for divider
  const bodyHeight = termHeight - 3; // -1 title, -1 status bar, -1 border

  const { projects, setProjects, reload } = useProjectTree();
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reloading, setReloading] = useState(false);

  // Stable ref to current rows for cursor preservation during reload
  const rowsRef = useRef<Array<{ key: string }>>([]);

  const rows = flattenTree(projects, filter, search);
  rowsRef.current = rows;

  const selectedNode = rows[cursor]?.node ?? null;
  const selectedCode = selectedNode ? selectedNode.code : "";

  const showMessage = useCallback((msg: string, ms = 1500) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), ms);
  }, []);

  useInput((input: string, key: Key) => {
    if (searching) {
      if (key.escape) {
        setSearching(false);
        setSearch("");
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearch((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearch((s) => s + input);
        setCursor(0);
      }
      return;
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (key.upArrow) {
      setCursor((c) => (c <= 0 ? rows.length - 1 : c - 1));
      return;
    }

    if (key.downArrow) {
      setCursor((c) => (c >= rows.length - 1 ? 0 : c + 1));
      return;
    }

    if (key.return) {
      const row = rows[cursor];
      if (!row) return;
      if (row.node.kind === "project") {
        setProjects((prev) =>
          prev.map((p) =>
            p.code === row.node.code ? { ...p, expanded: !p.expanded } : p,
          ),
        );
      } else if (row.node.kind === "epic") {
        setProjects((prev) =>
          prev.map((p) => ({
            ...p,
            epics: p.epics.map((e) =>
              e.code === row.node.code ? { ...e, expanded: !e.expanded } : e,
            ),
          })),
        );
      }
      return;
    }

    if (input === "f") {
      const order: FilterMode[] = ["all", "backlog", "in_progress", "done"];
      setFilter((f) => order[(order.indexOf(f) + 1) % order.length]);
      setCursor(0);
      return;
    }

    if (input === "/") {
      setSearching(true);
      setSearch("");
      return;
    }

    if (input === "c" || input === "y") {
      if (selectedCode) {
        clipboard
          .write(selectedCode)
          .then(() => {
            showMessage(`Copied: ${selectedCode}`);
          })
          .catch(() => {
            showMessage(`Clipboard unavailable — code: ${selectedCode}`);
          });
      }
      return;
    }

    if (key.escape) {
      setSearch("");
      setFilter("all");
      setSearching(false);
      setCursor(0);
    }
  });

  // File watcher: live reload when any project YAML changes
  const handleReload = useCallback(() => {
    const currentKey = findCursorKey(rowsRef.current, cursor);
    setReloading(true);
    setStatusMessage("Reloading…");

    try {
      reload();

      // Restore cursor after state update (use a micro-task so rows re-compute first)
      setTimeout(() => {
        setReloading(false);
        setStatusMessage("");
        // We need the new rows to find the cursor — do it after next render via another timeout
        setTimeout(() => {
          const newRows = rowsRef.current;
          const newCursor = restoreCursor(newRows, currentKey);
          setCursor(newCursor);
        }, 50);
      }, 300);
    } catch {
      setReloading(false);
      setStatusMessage("");
    }
  }, [cursor, reload]);

  useFileWatcher({
    projectsDir: getProjectsDir(),
    onReload: handleReload,
    debounceMs: 300,
  });

  // Suppress unused variable warning — reloading is set by watcher
  void reloading;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Title bar */}
      <Box width={termWidth} height={1}>
        <Text backgroundColor="cyan" color="black" bold>
          {"  pm tui — Project Management Dashboard".padEnd(termWidth)}
        </Text>
      </Box>

      {/* Main body */}
      <Box flexDirection="row" width={termWidth} height={bodyHeight + 1}>
        {/* Left: tree panel */}
        <Box
          flexDirection="column"
          width={leftWidth}
          height={bodyHeight + 1}
          borderStyle="single"
          borderRight={false}
          borderBottom={false}
        >
          <TreePanel
            rows={rows}
            cursor={cursor}
            width={leftWidth - 2}
            height={bodyHeight - 1}
          />
        </Box>

        {/* Divider */}
        <Box flexDirection="column" width={1} height={bodyHeight + 1}>
          {Array.from({ length: bodyHeight + 1 }).map((_, i) => (
            <Text key={i} dimColor>
              │
            </Text>
          ))}
        </Box>

        {/* Right: detail panel */}
        <Box
          flexDirection="column"
          width={rightWidth}
          height={bodyHeight + 1}
          borderStyle="single"
          borderLeft={false}
          borderBottom={false}
        >
          <DetailPanel
            node={selectedNode}
            width={rightWidth - 2}
            height={bodyHeight - 1}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        selectedCode={selectedCode}
        filter={filter}
        search={search}
        searching={searching}
        message={statusMessage}
        width={termWidth}
      />
    </Box>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function launchTui(): Promise<void> {
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
