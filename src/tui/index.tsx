import React, { useState, useCallback, useRef, useMemo } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { Key } from "ink";
import clipboard from "clipboardy";
import {
  useFileWatcher,
  findCursorKey,
  restoreCursor,
} from "./hooks/useFileWatcher.js";
import { useProjectTree } from "./hooks/useProjectTree.js";
import { getPmDir } from "../lib/codes.js";
import { PmError } from "../lib/errors.js";
import { TreePanel, flattenTree } from "./components/Tree.js";
import type { FlatRow } from "./components/Tree.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { StatusBar } from "./components/StatusBar.js";
import type { EpicNode, TreeNode, FilterMode } from "./types.js";
import { NoPmDirectoryError } from "./loadTree.js";

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 40;

  const leftWidth = Math.floor(termWidth * 0.4);
  const rightWidth = termWidth - leftWidth - 1;
  const bodyHeight = termHeight - 3;

  const { epics, projectName, error, setEpics, reload } = useProjectTree();
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reloading, setReloading] = useState(false);

  const rowsRef = useRef<Array<{ key: string }>>([]);

  const rows = flattenTree(epics, filter, search);
  rowsRef.current = rows;

  const selectedNode = rows[cursor]?.node ?? null;
  const selectedCode = selectedNode ? selectedNode.code : "";

  const showMessage = useCallback((msg: string, ms = 1500) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), ms);
  }, []);

  useInput((input: string, key: Key) => {
    if (error) {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
      }
      return;
    }

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
      if (row.node.kind === "epic") {
        setEpics((prev) =>
          prev.map((e) =>
            e.code === row.node.code ? { ...e, expanded: !e.expanded } : e,
          ),
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

  const handleReload = useCallback(() => {
    const currentKey = findCursorKey(rowsRef.current, cursor);
    setReloading(true);
    setStatusMessage("Reloading…");

    try {
      reload();

      setTimeout(() => {
        setReloading(false);
        setStatusMessage("");
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

  const pmDir = useMemo(() => {
    try {
      return getPmDir();
    } catch {
      return null;
    }
  }, []);

  useFileWatcher({
    projectsDir: pmDir ?? "",
    onReload: handleReload,
    debounceMs: 300,
  });

  void reloading;

  if (error) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <Box width={termWidth} height={1}>
          <Text backgroundColor="red" color="white" bold>
            {"  pm tui — Error".padEnd(termWidth)}
          </Text>
        </Box>
        <Box flexDirection="column" width={termWidth} height={bodyHeight + 1}>
          <Text color="red" bold>
            Error: {error}
          </Text>
          <Text dimColor>Press q to quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <Box width={termWidth} height={1}>
        <Text backgroundColor="cyan" color="black" bold>
          {`  pm tui — ${projectName}`.padEnd(termWidth)}
        </Text>
      </Box>

      <Box flexDirection="row" width={termWidth} height={bodyHeight + 1}>
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

        <Box flexDirection="column" width={1} height={bodyHeight + 1}>
          {Array.from({ length: bodyHeight + 1 }).map((_, i) => (
            <Text key={i} dimColor>
              │
            </Text>
          ))}
        </Box>

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
  try {
    getPmDir();
  } catch (e) {
    if (e instanceof PmError) {
      console.error(`\n  Error: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }

  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
