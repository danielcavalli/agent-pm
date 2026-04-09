import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { Key } from "ink";
import clipboard from "clipboardy";
import {
  useFileWatcher,
  findCursorKey,
  restoreCursor,
} from "./hooks/useFileWatcher.js";
import { useProjectTree } from "./hooks/useProjectTree.js";
import { useAgentList } from "./hooks/useAgentList.js";
import { useMouseScroll } from "./hooks/useMouseScroll.js";
import type { MouseClickEvent } from "./hooks/useMouseScroll.js";
import { getPmDir } from "../lib/codes.js";
import { writeAgentProcess, writeAgentResponse } from "../lib/agent-state.js";
import { PmError } from "../lib/errors.js";
import { TreePanel, flattenTree } from "./components/Tree.js";
import type { FlatRow } from "./components/Tree.js";
import { DetailPanel } from "./components/DetailPanel.js";
import type { DetailScrollHandle } from "./components/DetailPanel.js";
import { toggleAgentDetailMode } from "./components/DetailPanel.js";
import type { AgentDetailMode } from "./components/DetailPanel.js";
import {
  AgentSidebar,
  nextAgentFilter,
  filterAgents,
} from "./components/AgentSidebar.js";
import type { AgentFilterMode } from "./components/AgentSidebar.js";
import { StatusBar } from "./components/StatusBar.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import type {
  EpicNode,
  TreeNode,
  FilterMode,
  FocusedPanel,
  SwarmStatusData,
} from "./types.js";
import { NoPmDirectoryError } from "./loadTree.js";
import { nextFocusedPanel } from "./focusCycling.js";
import {
  INITIAL_RESPONSE_STATE,
  enterResponseMode,
  exitResponseMode,
  selectOption,
  confirmationMessage,
} from "./escalationResponse.js";
import type { EscalationResponseState } from "./escalationResponse.js";
import {
  isClaudeAvailable,
  isTmuxAvailable,
  buildStoryCommand,
  buildEpicCommand,
  buildDispatchedAgentId,
  dispatch as dispatchAgent,
} from "./dispatch.js";
import { theme, tc } from "./colors.js";
import { supportsTerminalLinks } from "./terminalLinks.js";
import { buildProjectProgressBar, truncateTitleSegment } from "./titleBar.js";
import {
  collectEscalationKeys,
  hasNewEscalation,
  shouldEmitEscalationBell,
} from "./escalationNotification.js";
import {
  buildKillConfirmationMessage,
  getAgentKillTarget,
  killAgentTarget,
} from "./agentKill.js";
import { resolveAppClick } from "./clickHandlers.js";
import {
  INITIAL_STORY_STATUS_PICKER_STATE,
  buildStoryStatusPickerMessage,
  cycleStoryStatusPicker,
  enterStoryStatusPicker,
  updateStoryStatus,
} from "./storyStatus.js";
import { loadSwarmStatus } from "./loadSwarmStatus.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SCROLL_LINES = 3; // lines per mouse scroll tick

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 40;

  // Title bar (1) + status bar (1) = 2 reserved rows
  const bodyHeight = termHeight - 2;

  const { epics, projectName, storyLinkTemplate, error, setEpics, reload } =
    useProjectTree();
  const { agents, hasAgents, reload: reloadAgents } = useAgentList();
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>("tree");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilterMode>("all");
  const [agentCursor, setAgentCursor] = useState(0);
  const [helpVisible, setHelpVisible] = useState(false);
  const [agentDetailMode, setAgentDetailMode] =
    useState<AgentDetailMode>("info");
  const [responseState, setResponseState] = useState<EscalationResponseState>(
    INITIAL_RESPONSE_STATE,
  );
  const [dispatchPending, setDispatchPending] = useState<{
    code: string;
    kind: "story" | "epic";
  } | null>(null);
  const [killPending, setKillPending] = useState<{
    agentId: string;
    pid: number;
  } | null>(null);
  const [storyStatusPicker, setStoryStatusPicker] = useState(
    INITIAL_STORY_STATUS_PICKER_STATE,
  );
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatusData | null>(null);

  // Detect dispatch capabilities on mount
  const claudeAvailable = useMemo(() => isClaudeAvailable(), []);
  const dispatchAvailable = claudeAvailable;
  const hyperlinksEnabled = useMemo(() => supportsTerminalLinks(), []);

  const pmDir = useMemo(() => {
    try {
      return getPmDir();
    } catch (err) {
      process.stderr.write(
        `[pm tui] getPmDir error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return null;
    }
  }, []);

  // Ref for external scroll control of DetailPanel
  const detailScrollRef = useRef<DetailScrollHandle>({ scrollBy: () => {} });

  // Project-level stats
  const { totalStories, doneStories } = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const epic of epics) {
      total += epic.stories.length;
      done += epic.stories.filter((s) => s.status === "done").length;
    }
    return { totalStories: total, doneStories: done };
  }, [epics]);

  // Sidebar is visible when agents exist AND user hasn't toggled it off
  const sidebarVisible = hasAgents && !sidebarHidden;

  const filteredAgents = filterAgents(agents, agentFilter);
  const clampedAgentCursor =
    filteredAgents.length > 0
      ? Math.min(agentCursor, filteredAgents.length - 1)
      : 0;

  // Layout widths
  const sidebarWidth = sidebarVisible ? 22 : 0;
  const sidebarGap = sidebarVisible ? 1 : 0;
  const contentWidth = termWidth - sidebarWidth - sidebarGap;
  const leftWidth = Math.floor(contentWidth * 0.4);
  const treeGap = 1;
  const rightWidth = contentWidth - leftWidth - treeGap;

  const effectiveFocusedPanel: FocusedPanel =
    focusedPanel === "sidebar" && !sidebarVisible ? "tree" : focusedPanel;

  const selectedAgent =
    effectiveFocusedPanel === "sidebar" && filteredAgents.length > 0
      ? (filteredAgents[clampedAgentCursor] ?? null)
      : null;
  const previousEscalationKeysRef = useRef<Set<string> | null>(null);

  // Track previous agent id to reset response state on agent change
  const prevAgentIdRef = useRef<string | null>(null);
  const currentAgentId = selectedAgent?.agent_id ?? null;
  if (currentAgentId !== prevAgentIdRef.current) {
    prevAgentIdRef.current = currentAgentId;
    if (responseState.mode !== "idle") {
      setResponseState(INITIAL_RESPONSE_STATE);
    }
  }

  const rowsRef = useRef<Array<{ key: string }>>([]);

  const rows = flattenTree(epics, filter, search);
  rowsRef.current = rows;

  const selectedNode = rows[cursor]?.node ?? null;
  const selectedCode = selectedNode ? selectedNode.code : "";

  const filterLabels: Record<FilterMode, string> = {
    all: "All",
    backlog: "Backlog",
    in_progress: "In Progress",
    done: "Done",
  };

  const showMessage = useCallback((msg: string, ms = 1500) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), ms);
  }, []);

  const refreshTreeSelection = useCallback(() => {
    const currentKey = findCursorKey(rowsRef.current, cursor);
    reload();
    const newRows = rowsRef.current;
    const newCursor = restoreCursor(newRows, currentKey);
    setCursor(newCursor);
  }, [cursor, reload]);

  // ── Mouse scroll handler ─────────────────────────────────────────────────
  useMouseScroll(
    useCallback(
      (direction: "up" | "down") => {
        const delta = direction === "up" ? -SCROLL_LINES : SCROLL_LINES;

        if (effectiveFocusedPanel === "tree") {
          setCursor((c) => {
            const next = c + delta;
            return Math.max(0, Math.min(rows.length - 1, next));
          });
        } else if (effectiveFocusedPanel === "detail") {
          detailScrollRef.current.scrollBy(delta);
        } else if (
          effectiveFocusedPanel === "sidebar" &&
          filteredAgents.length > 0
        ) {
          setAgentCursor((c) => {
            const next = c + delta;
            return Math.max(0, Math.min(filteredAgents.length - 1, next));
          });
        }
      },
      [effectiveFocusedPanel, rows.length, filteredAgents.length],
    ),
    useCallback(
      ({ col, row }: MouseClickEvent) => {
        const clickResult = resolveAppClick({
          col,
          row,
          sidebarWidth,
          leftWidth,
          termWidth,
          bodyHeight,
          treeCursor: cursor,
          rows,
          filteredAgents,
          selectedAgentIndex: clampedAgentCursor,
        });
        if (!clickResult) {
          return;
        }

        setFocusedPanel(clickResult.focusedPanel);

        if (typeof clickResult.agentCursor === "number") {
          setAgentCursor(clickResult.agentCursor);
        }

        if (typeof clickResult.cursor === "number") {
          setCursor(clickResult.cursor);
        }

        if (clickResult.toggleEpicCode) {
          setEpics((prev) =>
            prev.map((epic) =>
              epic.code === clickResult.toggleEpicCode
                ? { ...epic, expanded: !epic.expanded }
                : epic,
            ),
          );
        }
      },
      [
        bodyHeight,
        clampedAgentCursor,
        cursor,
        filteredAgents,
        leftWidth,
        rows,
        setEpics,
        sidebarWidth,
        termWidth,
      ],
    ),
  );

  // ── Keyboard input ───────────────────────────────────────────────────────
  useInput((input: string, key: Key) => {
    if (error) {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
      }
      return;
    }

    if (helpVisible) {
      if (input === "?" || key.escape) {
        setHelpVisible(false);
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

    if (dispatchPending) {
      if (input === "y") {
        const command =
          dispatchPending.kind === "story"
            ? buildStoryCommand(dispatchPending.code)
            : buildEpicCommand();
        const result = dispatchAgent(command);
        if (result.success) {
          if (pmDir && result.pid) {
            try {
              writeAgentProcess(
                pmDir,
                buildDispatchedAgentId(dispatchPending.code),
                {
                  pid: result.pid,
                  spawned_at: new Date()
                    .toISOString()
                    .replace(/\.\d{3}Z$/, "Z"),
                  command,
                  method: result.method,
                },
              );
            } catch (err) {
              process.stderr.write(
                `[pm tui] writeAgentProcess error: ${err instanceof Error ? err.message : String(err)}\n`,
              );
            }
          }
          const method =
            result.method === "tmux"
              ? "tmux pane"
              : `background (${result.detail})`;
          showMessage(`Agent dispatched in ${method}`, 2500);
        } else {
          showMessage(`Dispatch failed: ${result.detail}`, 3000);
        }
        setDispatchPending(null);
        return;
      }
      if (input === "n" || key.escape) {
        setDispatchPending(null);
        setStatusMessage("");
        return;
      }
      return;
    }

    if (killPending) {
      if (input === "y") {
        try {
          showMessage(killAgentTarget(killPending), 2500);
          reloadAgents();
        } catch (err) {
          showMessage(
            `Kill failed: ${err instanceof Error ? err.message : String(err)}`,
            3000,
          );
        }
        setKillPending(null);
        return;
      }
      if (input === "n" || key.escape) {
        setKillPending(null);
        setStatusMessage("");
        return;
      }
      return;
    }

    if (storyStatusPicker.mode === "selecting") {
      if (key.escape) {
        setStoryStatusPicker(INITIAL_STORY_STATUS_PICKER_STATE);
        setStatusMessage("");
        return;
      }

      if (input === "s") {
        setStoryStatusPicker((current) => cycleStoryStatusPicker(current));
        return;
      }

      if (key.return) {
        try {
          updateStoryStatus(storyStatusPicker.code, storyStatusPicker.status);
          setStoryStatusPicker(INITIAL_STORY_STATUS_PICKER_STATE);
          refreshTreeSelection();
          showMessage(
            `Updated ${storyStatusPicker.code} to ${storyStatusPicker.status}`,
            2500,
          );
        } catch (err) {
          setStoryStatusPicker(INITIAL_STORY_STATUS_PICKER_STATE);
          showMessage(
            `Status update failed: ${err instanceof Error ? err.message : String(err)}`,
            3000,
          );
        }
        return;
      }

      return;
    }

    if (responseState.mode === "selecting") {
      if (key.escape) {
        const next = exitResponseMode(responseState);
        if (next) setResponseState(next);
        return;
      }
      const result = selectOption(responseState, input, selectedAgent);
      if (result) {
        setResponseState(result.newState);
        if (pmDir && selectedAgent) {
          try {
            writeAgentResponse(pmDir, selectedAgent.agent_id, {
              responded_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
              selected_option: String(result.optionNumber),
              additional_context: "",
            });
          } catch (err) {
            process.stderr.write(
              `[pm tui] writeAgentResponse error: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        }
        showMessage(confirmationMessage(result.optionNumber), 2000);
        setTimeout(() => {
          setResponseState(INITIAL_RESPONSE_STATE);
        }, 2000);
        return;
      }
      return;
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (input === "?") {
      setHelpVisible(true);
      return;
    }

    if (key.tab) {
      setFocusedPanel((current) => nextFocusedPanel(current, sidebarVisible));
      return;
    }

    if (input === "a" && hasAgents) {
      setSidebarHidden((h) => !h);
      if (!sidebarHidden && focusedPanel === "sidebar") {
        setFocusedPanel("tree");
      }
      return;
    }

    if (input === "l") {
      setAgentDetailMode((currentMode) =>
        toggleAgentDetailMode(currentMode, selectedAgent),
      );
      return;
    }

    if (effectiveFocusedPanel === "tree") {
      if (key.upArrow || input === "k") {
        setCursor((c) => (c <= 0 ? rows.length - 1 : c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => (c >= rows.length - 1 ? 0 : c + 1));
        return;
      }
      if (key.ctrl && input === "u") {
        const half = Math.max(1, Math.floor(bodyHeight / 2));
        setCursor((c) => Math.max(0, c - half));
        return;
      }
      if (key.ctrl && input === "d") {
        const half = Math.max(1, Math.floor(bodyHeight / 2));
        setCursor((c) => Math.min(rows.length - 1, c + half));
        return;
      }
      if (input === "g") {
        setCursor(0);
        return;
      }
      if (input === "G") {
        setCursor(rows.length > 0 ? rows.length - 1 : 0);
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
      if (input === "x" && dispatchAvailable) {
        const row = rows[cursor];
        if (row && (row.node.kind === "story" || row.node.kind === "epic")) {
          setDispatchPending({ code: row.node.code, kind: row.node.kind });
          setStatusMessage(`Dispatch agent for ${row.node.code}? [y/n]`);
        }
        return;
      }
      if (input === "s") {
        const next = enterStoryStatusPicker(selectedNode);
        if (next) {
          setStoryStatusPicker(next);
        }
        return;
      }
    }

    if (effectiveFocusedPanel === "sidebar" && filteredAgents.length > 0) {
      if (key.upArrow || input === "k") {
        setAgentCursor((c) => (c <= 0 ? filteredAgents.length - 1 : c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setAgentCursor((c) => (c >= filteredAgents.length - 1 ? 0 : c + 1));
        return;
      }
      if (key.ctrl && input === "u") {
        const half = Math.max(1, Math.floor(bodyHeight / 2));
        setAgentCursor((c) => Math.max(0, c - half));
        return;
      }
      if (key.ctrl && input === "d") {
        const half = Math.max(1, Math.floor(bodyHeight / 2));
        setAgentCursor((c) => Math.min(filteredAgents.length - 1, c + half));
        return;
      }
      if (input === "g") {
        setAgentCursor(0);
        return;
      }
      if (input === "G") {
        setAgentCursor(filteredAgents.length - 1);
        return;
      }
      if (input === "K") {
        const killTarget = getAgentKillTarget(selectedAgent);
        if (killTarget) {
          setKillPending(killTarget);
          setStatusMessage(buildKillConfirmationMessage(killTarget.agentId));
        }
        return;
      }
    }

    if (input === "e") {
      const next = enterResponseMode(responseState, selectedAgent);
      if (next) {
        setResponseState(next);
        return;
      }
      return;
    }

    if (input === "f") {
      if (effectiveFocusedPanel === "sidebar") {
        setAgentFilter((current) => nextAgentFilter(current));
        return;
      }
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
            showMessage(`Clipboard unavailable -- code: ${selectedCode}`);
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

  const refreshSwarmStatus = useCallback(async () => {
    if (!pmDir) {
      setSwarmStatus(null);
      return;
    }

    try {
      setSwarmStatus(await loadSwarmStatus(pmDir));
    } catch (err) {
      process.stderr.write(
        `[pm tui] loadSwarmStatus error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      setSwarmStatus(null);
    }
  }, [pmDir]);

  const handleReload = useCallback(() => {
    const currentKey = findCursorKey(rowsRef.current, cursor);
    setReloading(true);
    setStatusMessage("Reloading...");

    try {
      reload();
      reloadAgents();
      void refreshSwarmStatus();
      setTimeout(() => {
        setReloading(false);
        setStatusMessage("");
        setTimeout(() => {
          const newRows = rowsRef.current;
          const newCursor = restoreCursor(newRows, currentKey);
          setCursor(newCursor);
        }, 50);
      }, 300);
    } catch (err) {
      process.stderr.write(
        `[pm tui] reload error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      setReloading(false);
      setStatusMessage("");
    }
  }, [cursor, pmDir, refreshSwarmStatus, reload, reloadAgents]);

  useFileWatcher({
    projectsDir: pmDir ?? "",
    onReload: handleReload,
    debounceMs: 300,
  });

  useEffect(() => {
    void refreshSwarmStatus();
  }, [refreshSwarmStatus]);

  useEffect(() => {
    const currentEscalationKeys = collectEscalationKeys(agents);
    const previousEscalationKeys = previousEscalationKeysRef.current;

    if (previousEscalationKeys === null) {
      previousEscalationKeysRef.current = currentEscalationKeys;
      return;
    }

    if (
      hasNewEscalation(previousEscalationKeys, currentEscalationKeys) &&
      shouldEmitEscalationBell(Boolean(stdout?.isTTY))
    ) {
      stdout?.write("\x07");
    }

    previousEscalationKeysRef.current = currentEscalationKeys;
  }, [agents, stdout]);

  void reloading;

  if (error) {
    return (
      <Box
        flexDirection="column"
        width={termWidth}
        height={termHeight}
        backgroundColor={tc(theme.bg)}
      >
        <Box width={termWidth} height={1}>
          <Text
            backgroundColor={tc(theme.bgDarker)}
            color={tc(theme.error)}
            bold
          >
            {"  pm tui -- Error".padEnd(termWidth)}
          </Text>
        </Box>
        <Box flexDirection="column" width={termWidth} height={bodyHeight}>
          <Text color={tc(theme.error)} bold>
            Error: {error}
          </Text>
          <Text color={tc(theme.textMuted)}>Press q to quit</Text>
        </Box>
      </Box>
    );
  }

  // Title bar content
  const titleLeft = `  pm tui`;
  const minTitleGap = 1;
  const progressBar = buildProjectProgressBar(
    doneStories,
    totalStories,
    Math.max(termWidth - titleLeft.length - minTitleGap, 0),
  );
  const titleRight = ` ${progressBar}  `;
  const maxTitleMidWidth = Math.max(
    termWidth - titleLeft.length - titleRight.length - minTitleGap,
    0,
  );
  const titleMid = truncateTitleSegment(` | ${projectName}`, maxTitleMidWidth);
  const titlePad = Math.max(
    0,
    termWidth - titleLeft.length - titleMid.length - titleRight.length,
  );

  return (
    <Box
      flexDirection="column"
      width={termWidth}
      height={termHeight}
      backgroundColor={tc(theme.bg)}
    >
      {/* Title bar */}
      <Box width={termWidth} height={1}>
        <Text
          backgroundColor={tc(theme.bgDarker)}
          color={tc(theme.primary)}
          bold
        >
          {titleLeft}
        </Text>
        <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.textMuted)}>
          {titleMid}
        </Text>
        <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.textMuted)}>
          {" ".repeat(titlePad)}
        </Text>
        <Text backgroundColor={tc(theme.bgDarker)} color={tc(theme.textMuted)}>
          {titleRight}
        </Text>
      </Box>

      {/* Body */}
      <Box flexDirection="row" width={termWidth} height={bodyHeight}>
        {/* Agent Sidebar */}
        {sidebarVisible && (
          <>
            <Box
              flexDirection="column"
              width={sidebarWidth}
              height={bodyHeight}
              backgroundColor={tc(theme.bgPanel)}
              paddingX={1}
            >
              <AgentSidebar
                agents={agents}
                activeExperimentClaims={
                  swarmStatus?.activeExperimentClaims ?? []
                }
                width={sidebarWidth - 2}
                height={bodyHeight}
                agentFilter={agentFilter}
                selectedIndex={clampedAgentCursor}
                focused={effectiveFocusedPanel === "sidebar"}
              />
            </Box>

            {/* Gap between sidebar and tree */}
            <Box width={sidebarGap} height={bodyHeight}>
              <Text
                color={tc(
                  effectiveFocusedPanel === "sidebar"
                    ? theme.borderFocused
                    : theme.border,
                )}
              >
                {"\u2502".repeat(1)}
              </Text>
            </Box>
          </>
        )}

        {/* Tree Panel */}
        <Box
          flexDirection="column"
          width={leftWidth}
          height={bodyHeight}
          backgroundColor={tc(theme.bgPanel)}
          paddingX={1}
        >
          {/* Panel header */}
          <Box width={leftWidth - 2} height={1}>
            <Text color={tc(theme.primary)} bold>
              {"Tree"}
            </Text>
            <Text
              color={tc(theme.textMuted)}
            >{` [${filterLabels[filter]}]`}</Text>
          </Box>
          <TreePanel
            rows={rows}
            cursor={cursor}
            width={leftWidth - 2}
            height={bodyHeight - 1}
            storyLinkTemplate={storyLinkTemplate}
            hyperlinksEnabled={hyperlinksEnabled}
          />
        </Box>

        {/* Gap between tree and detail */}
        <Box width={treeGap} height={bodyHeight}>
          <Text
            color={tc(
              effectiveFocusedPanel === "tree"
                ? theme.borderFocused
                : theme.border,
            )}
          >
            {"\u2502"}
          </Text>
        </Box>

        {/* Detail Panel */}
        <Box
          flexDirection="column"
          width={rightWidth}
          height={bodyHeight}
          backgroundColor={tc(theme.bgPanel)}
          paddingX={1}
        >
          {/* Panel header */}
          <Box width={rightWidth - 2} height={1}>
            <Text color={tc(theme.primary)} bold>
              {"Detail"}
            </Text>
            {selectedCode && (
              <Text color={tc(theme.textMuted)}>{` | ${selectedCode}`}</Text>
            )}
          </Box>
          <DetailPanel
            node={selectedNode}
            width={rightWidth - 2}
            height={bodyHeight - 1}
            focused={effectiveFocusedPanel === "detail"}
            swarmStatus={swarmStatus}
            selectedAgent={selectedAgent}
            agentDetailMode={agentDetailMode}
            responseMode={responseState.mode}
            confirmedOption={responseState.confirmedOption}
            storyLinkTemplate={storyLinkTemplate}
            hyperlinksEnabled={hyperlinksEnabled}
            scrollRef={detailScrollRef}
          />
        </Box>
      </Box>

      {/* Status Bar */}
      <StatusBar
        selectedCode={selectedCode}
        filter={filter}
        search={search}
        searching={searching}
        message={
          storyStatusPicker.mode === "selecting"
            ? buildStoryStatusPickerMessage(storyStatusPicker)
            : statusMessage
        }
        width={termWidth}
        agents={agents}
        sidebarHidden={sidebarHidden}
        focusedPanel={effectiveFocusedPanel}
        dispatchAvailable={dispatchAvailable}
        swarmStatus={swarmStatus}
      />

      {/* Help Overlay */}
      {helpVisible && (
        <Box
          position="absolute"
          width={termWidth}
          height={termHeight}
          flexDirection="column"
        >
          <Box width={termWidth} height={1}>
            <Text
              backgroundColor={tc(theme.bgDarker)}
              color={tc(theme.primary)}
              bold
            >
              {"  Help -- Keyboard Shortcuts".padEnd(termWidth)}
            </Text>
          </Box>
          <Box width={termWidth} height={bodyHeight}>
            <HelpOverlay width={termWidth} height={bodyHeight} />
          </Box>
          <Box width={termWidth} height={1}>
            <Text
              backgroundColor={tc(theme.bgDarker)}
              color={tc(theme.textMuted)}
            >
              {" Press ? or Esc to close".padEnd(termWidth)}
            </Text>
          </Box>
        </Box>
      )}
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
