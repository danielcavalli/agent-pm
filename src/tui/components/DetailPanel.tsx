import * as fs from "node:fs";
import * as path from "node:path";
import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import { statusIcon, statusColor } from "./Tree.js";
import type { TreeNode, StoryNode } from "../types.js";
import type { ObservedAgentState } from "../../lib/agent-state.js";
import type { EscalationResponseMode } from "../escalationResponse.js";
import { confirmationMessage } from "../escalationResponse.js";
import { theme, tc, priorityColor, statusThemeColor } from "../colors.js";
import { buildStoryUrl, formatTerminalLink } from "../terminalLinks.js";
import { relativeTime } from "../time.js";
import type { EscalationLogEntry } from "../../schemas/escalation-log.schema.js";
import type { SwarmStatusData } from "../types.js";

// ── Escalation type labels ────────────────────────────────────────────────────

const escalationTypeLabels: Record<string, string> = {
  decision: "Decision Required",
  clarification: "Clarification Needed",
  approval: "Approval Required",
  error: "Error",
};

// ── Agent detail line builder (exported for testing) ─────────────────────────

export interface AgentDetailLine {
  key: string;
  content: React.ReactNode;
}

export type AgentDetailMode = "info" | "log";

export interface BreadcrumbSegment {
  text: string;
  color: string;
}

interface AgentTimelineEvent {
  key: string;
  title: string;
  timestamp?: string;
  detail?: string;
  color?: string;
  priority: number;
}

export function buildDetailBreadcrumb(
  node: TreeNode | null,
  selectedAgent: ObservedAgentState | null,
): BreadcrumbSegment[] {
  if (selectedAgent) {
    if (
      selectedAgent.status === "needs_attention" &&
      selectedAgent.escalation
    ) {
      return [
        { text: `Agent ${selectedAgent.agent_id}`, color: theme.textMuted },
        { text: "Escalation", color: theme.text },
      ];
    }

    return [{ text: `Agent ${selectedAgent.agent_id}`, color: theme.text }];
  }

  if (!node) {
    return [];
  }

  if (node.kind === "story") {
    return [
      { text: node.epic_code, color: theme.textMuted },
      { text: node.code, color: theme.text },
    ];
  }

  return [{ text: node.code, color: theme.text }];
}

function renderBreadcrumb(
  segments: BreadcrumbSegment[],
  key: string,
): AgentDetailLine {
  return {
    key,
    content: (
      <Text>
        {segments.map((segment, index) => (
          <React.Fragment key={`${key}-${segment.text}-${index}`}>
            {index > 0 ? <Text color={tc(theme.textMuted)}> &gt; </Text> : null}
            <Text color={tc(segment.color)}>{segment.text}</Text>
          </React.Fragment>
        ))}
      </Text>
    ),
  };
}

function criterionStatusIcon(status: "pending" | "done" | "failed"): string {
  switch (status) {
    case "done":
      return "\u2713";
    case "failed":
      return "\u2717";
    default:
      return "\u25CB";
  }
}

function wrapTextUtil(text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const wrappedLines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      if (current) wrappedLines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) wrappedLines.push(current);
  return wrappedLines;
}

function truncateTextUtil(text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (text.length <= maxWidth) {
    return text;
  }

  if (maxWidth <= 3) {
    return text.slice(0, maxWidth);
  }

  return `${text.slice(0, maxWidth - 3).trimEnd()}...`;
}

export function recentExperimentDecisionColor(
  decision: SwarmStatusData["recentResults"][number]["decision"],
): string {
  return decision === "keep" ? theme.success : theme.error;
}

export function buildRecentExperimentLines(
  recentResults: SwarmStatusData["recentResults"],
  maxWidth: number,
): AgentDetailLine[] {
  if (recentResults.length === 0) {
    return [];
  }

  const lines: AgentDetailLine[] = [
    {
      key: "recent-results-section-rule",
      content: (
        <Text color={tc(theme.border)}>
          {"\u2500".repeat(Math.min(maxWidth, 40))}
        </Text>
      ),
    },
    {
      key: "recent-results-section",
      content: (
        <Text bold color={tc(theme.primary)}>
          Recent Experiments
        </Text>
      ),
    },
  ];

  recentResults.forEach((result, index) => {
    const prefix = `${result.decision} ${result.score.toFixed(2)} `;
    const description = truncateTextUtil(
      result.description,
      Math.max(8, maxWidth - prefix.length - 2),
    );

    lines.push({
      key: `recent-result-${index}`,
      content: (
        <Text>
          <Text color={tc(recentExperimentDecisionColor(result.decision))}>
            {result.decision}
          </Text>
          <Text
            color={tc(theme.textMuted)}
          >{` ${result.score.toFixed(2)} `}</Text>
          <Text color={tc(theme.text)}>{description}</Text>
        </Text>
      ),
    });
  });

  return lines;
}

export function buildExplorationCoverageLines(
  explorationCoverage: SwarmStatusData["explorationCoverage"],
  maxWidth: number,
): AgentDetailLine[] {
  const sections = explorationCoverage.filter(
    (section) => section.dimensions.length > 0,
  );
  if (sections.length === 0) {
    return [];
  }

  const lines: AgentDetailLine[] = [
    {
      key: "coverage-section-rule",
      content: (
        <Text color={tc(theme.border)}>
          {"\u2500".repeat(Math.min(maxWidth, 40))}
        </Text>
      ),
    },
    {
      key: "coverage-section",
      content: (
        <Text bold color={tc(theme.primary)}>
          Exploration Coverage
        </Text>
      ),
    },
  ];

  sections.forEach((section, sectionIndex) => {
    const prefix = `${section.label}: `;
    const availableWidth = Math.max(12, maxWidth - prefix.length);
    let currentLine: Array<{ name: string; text: string; count: number }> = [];
    let currentWidth = 0;
    let renderedLineCount = 0;

    const flushLine = () => {
      const isFirstLine = renderedLineCount === 0;
      const label = isFirstLine ? prefix : " ".repeat(prefix.length);
      lines.push({
        key: `coverage-${section.key}-${renderedLineCount}`,
        content: (
          <Text>
            <Text color={tc(theme.textMuted)}>{label}</Text>
            {currentLine.map((dimension, index) => {
              const isGap = dimension.count === 0;
              return (
                <React.Fragment
                  key={`${section.key}-${renderedLineCount}-${dimension.name}-${index}`}
                >
                  {index > 0 ? (
                    <Text color={tc(theme.textMuted)}>{" · "}</Text>
                  ) : null}
                  <Text
                    color={tc(isGap ? theme.textMuted : theme.text)}
                    dimColor={isGap}
                  >
                    {dimension.text}
                  </Text>
                </React.Fragment>
              );
            })}
          </Text>
        ),
      });
      renderedLineCount += 1;
    };

    section.dimensions.forEach((dimension) => {
      const text = truncateTextUtil(
        `${dimension.name} ${dimension.count}`,
        availableWidth,
      );
      const width = text.length;
      const separatorWidth = currentLine.length > 0 ? 3 : 0;

      if (
        currentLine.length > 0 &&
        currentWidth + separatorWidth + width > availableWidth
      ) {
        flushLine();
        currentLine = [];
        currentWidth = 0;
      }

      currentLine.push({ name: dimension.name, text, count: dimension.count });
      currentWidth += (currentLine.length > 1 ? 3 : 0) + width;
    });

    if (currentLine.length > 0) {
      flushLine();
    }

    if (sectionIndex < sections.length - 1) {
      lines.push({
        key: `coverage-sep-${section.key}`,
        content: <Text color={tc(theme.textMuted)}> </Text>,
      });
    }
  });

  return lines;
}

export function toggleAgentDetailMode(
  currentMode: AgentDetailMode,
  selectedAgent: ObservedAgentState | null,
): AgentDetailMode {
  if (!selectedAgent) {
    return currentMode;
  }

  return currentMode === "info" ? "log" : "info";
}

export function resolveAgentLogFilePath(
  logFile: string | undefined,
  cwd = process.cwd(),
): string | null {
  if (!logFile) {
    return null;
  }

  return path.isAbsolute(logFile) ? logFile : path.resolve(cwd, logFile);
}

function tailLines(content: string, maxLines: number): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }

  return lines.slice(-maxLines);
}

export function buildAgentLogLines(
  agent: ObservedAgentState,
  maxWidth: number,
  maxLogLines = 50,
  cwd = process.cwd(),
): AgentDetailLine[] {
  const lines: AgentDetailLine[] = [];
  const w = Math.max(maxWidth - 2, 10);
  const breadcrumb = buildDetailBreadcrumb(null, agent);

  if (breadcrumb.length > 0) {
    lines.push(renderBreadcrumb(breadcrumb, "breadcrumb"));
    lines.push({ key: "breadcrumb-sep", content: <Text> </Text> });
  }

  lines.push({
    key: "log-header",
    content: (
      <Text bold color={tc(theme.primary)}>
        Log Tail
      </Text>
    ),
  });
  lines.push({ key: "log-sep0", content: <Text> </Text> });

  const resolvedLogPath = resolveAgentLogFilePath(agent.log_file, cwd);
  const logContent =
    resolvedLogPath && fs.existsSync(resolvedLogPath)
      ? fs.readFileSync(resolvedLogPath, "utf8")
      : null;
  const logTail = logContent ? tailLines(logContent, maxLogLines) : [];

  lines.push({
    key: "log-source",
    content: (
      <Text>
        <Text bold color={tc(theme.text)}>
          Source:{" "}
        </Text>
        <Text color={tc(theme.textMuted)}>
          {agent.log_file ?? "No log file"}
        </Text>
      </Text>
    ),
  });
  lines.push({
    key: "log-count",
    content: (
      <Text>
        <Text bold color={tc(theme.text)}>
          Showing:{" "}
        </Text>
        <Text color={tc(theme.textMuted)}>last {maxLogLines} lines</Text>
      </Text>
    ),
  });
  lines.push({ key: "log-sep1", content: <Text> </Text> });

  if (logTail.length === 0) {
    lines.push({
      key: "log-empty",
      content: <Text color={tc(theme.textMuted)}>No log available</Text>,
    });
    return lines;
  }

  for (const [lineIndex, logLine] of logTail.entries()) {
    const wrappedLine = wrapTextUtil(logLine, w);

    if (wrappedLine.length === 0) {
      lines.push({
        key: `log-line-${lineIndex}-0`,
        content: <Text color={tc(theme.textMuted)}> </Text>,
      });
      continue;
    }

    wrappedLine.forEach((segment, segmentIndex) => {
      lines.push({
        key: `log-line-${lineIndex}-${segmentIndex}`,
        content: <Text color={tc(theme.textMuted)}>{segment}</Text>,
      });
    });
  }

  return lines;
}

function formatEscalationTimestamp(
  timestamp: string | undefined,
  nowMs: number,
): string {
  if (!timestamp) {
    return "Unknown";
  }

  return relativeTime(timestamp, nowMs);
}

function summarizeEscalationMessage(message: string, maxWidth: number): string {
  const summaryWidth = Math.max(12, maxWidth - 20);
  if (message.length <= summaryWidth) {
    return message;
  }

  return `${message.slice(0, Math.max(0, summaryWidth - 3)).trimEnd()}...`;
}

function parseTimelineTimestamp(timestamp: string | undefined): number | null {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimelineTimestamp(
  timestamp: string | undefined,
  nowMs: number,
): string {
  if (!timestamp) {
    return "Unknown time";
  }

  return relativeTime(timestamp, nowMs);
}

function buildAgentTimelineEvents(
  agent: ObservedAgentState,
  nowMs: number,
): AgentTimelineEvent[] {
  const events: AgentTimelineEvent[] = [
    {
      key: "timeline-started",
      title: "Started",
      timestamp: agent.started_at,
      color: theme.primary,
      priority: 0,
    },
  ];

  for (const [index, entry] of (agent.escalation_history ?? []).entries()) {
    const typeLabel = escalationTypeLabels[entry.type] ?? entry.type;
    const responseSuffix = entry.selected_option
      ? ` -> ${entry.selected_option}`
      : "";

    events.push({
      key: `timeline-history-${index}`,
      title: `${typeLabel} responded`,
      timestamp: entry.responded_at,
      detail: `${entry.message}${responseSuffix}`,
      color: theme.warning,
      priority: 1,
    });
  }

  events.push({
    key: "timeline-heartbeat",
    title: "Heartbeat",
    timestamp: agent.last_heartbeat,
    detail: `Last heartbeat ${formatTimelineTimestamp(agent.last_heartbeat, nowMs)}`,
    color: agent.heartbeat_stale ? theme.warning : theme.success,
    priority: 2,
  });

  if (agent.status === "needs_attention" && agent.escalation) {
    const typeLabel =
      escalationTypeLabels[agent.escalation.type] ?? agent.escalation.type;
    events.push({
      key: "timeline-escalation-active",
      title: `${typeLabel} open`,
      timestamp: agent.last_heartbeat,
      detail: agent.escalation.message,
      color: theme.warning,
      priority: 3,
    });
  }

  if (agent.process_crashed) {
    events.push({
      key: "timeline-crashed",
      title: "Crashed",
      timestamp: agent.last_heartbeat,
      detail: agent.tracked_pid
        ? `Tracked process ${agent.tracked_pid} is no longer running`
        : "Tracked process is no longer running",
      color: theme.error,
      priority: 4,
    });
  } else if (agent.status === "completed") {
    events.push({
      key: "timeline-completed",
      title: "Completed",
      timestamp: agent.last_heartbeat,
      color: theme.success,
      priority: 4,
    });
  }

  return events.sort((left, right) => {
    const leftTime = parseTimelineTimestamp(left.timestamp);
    const rightTime = parseTimelineTimestamp(right.timestamp);

    if (leftTime === null && rightTime === null) {
      return left.priority - right.priority;
    }
    if (leftTime === null) {
      return 1;
    }
    if (rightTime === null) {
      return -1;
    }
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.priority - right.priority;
  });
}

function addTimelineSection(
  lines: AgentDetailLine[],
  agent: ObservedAgentState,
  maxWidth: number,
  nowMs: number,
) {
  lines.push({
    key: "timeline-rule",
    content: (
      <Text color={tc(theme.border)}>
        {"\u2500".repeat(Math.min(maxWidth, 40))}
      </Text>
    ),
  });
  lines.push({
    key: "timeline-header",
    content: (
      <Text bold color={tc(theme.primary)}>
        Timeline
      </Text>
    ),
  });

  const events = buildAgentTimelineEvents(agent, nowMs);

  events.forEach((event, index) => {
    lines.push({
      key: `timeline-item-${index}`,
      content: (
        <Text>
          <Text color={tc(event.color ?? theme.text)}>● </Text>
          <Text bold color={tc(theme.text)}>
            {event.title}
          </Text>
          <Text color={tc(theme.textMuted)}>
            {" "}
            {formatTimelineTimestamp(event.timestamp, nowMs)}
          </Text>
        </Text>
      ),
    });

    if (event.detail) {
      for (const [detailIndex, line] of wrapTextUtil(
        event.detail,
        maxWidth - 2,
      ).entries()) {
        lines.push({
          key: `timeline-detail-${index}-${detailIndex}`,
          content: <Text color={tc(theme.textMuted)}> {line}</Text>,
        });
      }
    }
  });
}

function addEscalationHistorySection(
  lines: AgentDetailLine[],
  history: EscalationLogEntry[],
  maxWidth: number,
  nowMs: number,
) {
  lines.push({
    key: "history-rule",
    content: (
      <Text color={tc(theme.border)}>
        {"\u2500".repeat(Math.min(maxWidth, 40))}
      </Text>
    ),
  });
  lines.push({
    key: "history-header",
    content: (
      <Text bold color={tc(theme.primary)}>
        Escalation History
      </Text>
    ),
  });

  const reversedHistory = [...history].reverse();
  if (reversedHistory.length === 0) {
    lines.push({
      key: "history-empty",
      content: <Text color={tc(theme.textMuted)}> No past escalations</Text>,
    });
    return;
  }

  reversedHistory.forEach((entry, index) => {
    const typeLabel = escalationTypeLabels[entry.type] ?? entry.type;
    const timestamp = formatEscalationTimestamp(entry.responded_at, nowMs);
    const summary = summarizeEscalationMessage(entry.message, maxWidth);
    const selectedOption = entry.selected_option ?? "No option selected";

    lines.push({
      key: `history-item-${index}`,
      content: (
        <Text color={tc(theme.textMuted)}>
          {timestamp} | {typeLabel}
        </Text>
      ),
    });
    lines.push({
      key: `history-message-${index}`,
      content: <Text color={tc(theme.text)}> {summary}</Text>,
    });
    lines.push({
      key: `history-selected-${index}`,
      content: (
        <Text>
          <Text bold color={tc(theme.text)}>
            Selected:{" "}
          </Text>
          <Text color={tc(theme.textMuted)}>{selectedOption}</Text>
        </Text>
      ),
    });
  });
}

export function buildAgentDetailLines(
  agent: ObservedAgentState,
  maxWidth: number,
  responseMode: EscalationResponseMode = "idle",
  confirmedOption: number | null = null,
): AgentDetailLine[] {
  const lines: AgentDetailLine[] = [];
  const w = Math.max(maxWidth - 2, 10);
  const nowMs = Date.now();

  const breadcrumb = buildDetailBreadcrumb(null, agent);
  if (breadcrumb.length > 0) {
    lines.push(renderBreadcrumb(breadcrumb, "breadcrumb"));
    lines.push({ key: "breadcrumb-sep", content: <Text> </Text> });
  }

  function addField(label: string, value: string, key: string) {
    lines.push({
      key,
      content: (
        <Text>
          <Text bold color={tc(theme.text)}>
            {label}:{" "}
          </Text>
          <Text color={tc(theme.textMuted)}>{value}</Text>
        </Text>
      ),
    });
  }

  function addLine(content: React.ReactNode, key: string) {
    lines.push({ key, content });
  }

  function addSection(title: string, key: string) {
    addLine(
      <Text color={tc(theme.border)}>{"\u2500".repeat(Math.min(w, 40))}</Text>,
      `${key}-rule`,
    );
    addLine(
      <Text bold color={tc(theme.primary)}>
        {title}
      </Text>,
      key,
    );
  }

  if (agent.status === "needs_attention" && agent.escalation) {
    const esc = agent.escalation;
    const typeLabel = escalationTypeLabels[esc.type] ?? esc.type;

    addLine(
      <Text bold color={tc(theme.warning)}>
        ESCALATION
      </Text>,
      "esc-header",
    );
    addLine(<Text> </Text>, "esc-sep0");

    addField("Agent", agent.agent_id, "esc-agent");
    addField("Type", typeLabel, "esc-type");

    addLine(<Text> </Text>, "esc-sep1");
    addLine(
      <Text bold color={tc(theme.text)}>
        Message:
      </Text>,
      "esc-msg-label",
    );
    for (const [i, line] of wrapTextUtil(esc.message, w).entries()) {
      addLine(<Text color={tc(theme.text)}> {line}</Text>, `esc-msg-${i}`);
    }

    addLine(<Text> </Text>, "esc-sep2");
    addField(
      "Confidence",
      `${Math.round(esc.confidence * 100)}%`,
      "esc-confidence",
    );

    if (esc.options && esc.options.length > 0) {
      addLine(<Text> </Text>, "esc-sep3");
      addLine(
        <Text bold color={tc(theme.text)}>
          Options:
        </Text>,
        "esc-options-label",
      );
      esc.options.forEach((opt, i) => {
        for (const [j, line] of wrapTextUtil(
          `[${i + 1}] ${opt}`,
          w,
        ).entries()) {
          addLine(
            <Text color={tc(theme.text)}> {line}</Text>,
            `esc-opt-${i}-${j}`,
          );
        }
      });

      if (responseMode === "selecting") {
        addLine(<Text> </Text>, "resp-sep");
        addLine(
          <Text bold color={tc(theme.primary)}>
            Select option [1-{esc.options.length}]
          </Text>,
          "resp-prompt",
        );
      } else if (responseMode === "confirmed" && confirmedOption !== null) {
        addLine(<Text> </Text>, "resp-sep");
        addLine(
          <Text bold color={tc(theme.success)}>
            {confirmationMessage(confirmedOption)}
          </Text>,
          "resp-confirmation",
        );
      }
    }

    addLine(<Text> </Text>, "timeline-sep");
    addTimelineSection(lines, agent, w, nowMs);

    addLine(<Text> </Text>, "history-sep");
    addEscalationHistorySection(
      lines,
      agent.escalation_history ?? [],
      w,
      nowMs,
    );
  } else {
    addLine(
      <Text bold color={tc(theme.primary)}>
        Agent Details
      </Text>,
      "agent-header",
    );
    addLine(<Text> </Text>, "agent-sep0");

    addField("Agent ID", agent.agent_id, "agent-id");
    addField("Status", agent.status, "agent-status");

    if (agent.session_id) {
      addField("Session", agent.session_id, "agent-session");
    }

    if (agent.current_task) {
      addField("Current Task", agent.current_task, "agent-task");
    }

    addField(
      "Started At",
      relativeTime(agent.started_at, nowMs),
      "agent-started",
    );
    addField(
      "Last Heartbeat",
      relativeTime(agent.last_heartbeat, nowMs),
      "agent-heartbeat",
    );

    if (agent.heartbeat_stale) {
      addField("Heartbeat Health", "stale", "agent-heartbeat-health");
    }

    if (agent.progress) {
      addLine(<Text> </Text>, "agent-sep1");
      addSection("Progress", "agent-progress-label");
      addLine(
        <Text>
          <Text bold color={tc(theme.primary)}>
            Current Step:{" "}
          </Text>
          <Text color={tc(theme.text)}>{agent.progress.current_step}</Text>
        </Text>,
        "agent-progress-current-step",
      );

      agent.progress.criteria_status.forEach((criterion, criterionIndex) => {
        const isCurrentStep =
          criterion.criterion.trim().toLowerCase() ===
          agent.progress?.current_step.trim().toLowerCase();
        const color =
          criterion.status === "done"
            ? theme.success
            : criterion.status === "failed"
              ? theme.error
              : isCurrentStep
                ? theme.primary
                : theme.text;
        const wrappedCriterion = wrapTextUtil(
          `${criterionStatusIcon(criterion.status)} ${criterion.criterion}`,
          w,
        );

        wrappedCriterion.forEach((line, lineIndex) => {
          addLine(
            <Text
              bold={isCurrentStep}
              color={tc(lineIndex === 0 ? color : theme.textMuted)}
            >
              {lineIndex === 0 ? " " : "   "}
              {line}
            </Text>,
            `agent-progress-criterion-${criterionIndex}-${lineIndex}`,
          );
        });
      });

      if (agent.progress_summary) {
        addLine(<Text> </Text>, "agent-progress-summary-sep");
        for (const [i, line] of wrapTextUtil(
          agent.progress_summary,
          w,
        ).entries()) {
          addLine(
            <Text color={tc(theme.textMuted)}> {line}</Text>,
            `agent-progress-summary-${i}`,
          );
        }
      }
    } else if (agent.progress_summary) {
      addLine(<Text> </Text>, "agent-sep1");
      addSection("Progress", "agent-progress-label");
      for (const [i, line] of wrapTextUtil(
        agent.progress_summary,
        w,
      ).entries()) {
        addLine(
          <Text color={tc(theme.text)}> {line}</Text>,
          `agent-progress-${i}`,
        );
      }
    }

    addLine(<Text> </Text>, "timeline-sep");
    addTimelineSection(lines, agent, w, nowMs);

    addLine(<Text> </Text>, "history-sep");
    addEscalationHistorySection(
      lines,
      agent.escalation_history ?? [],
      w,
      nowMs,
    );
  }

  return lines;
}

// ── Render agent detail (with scroll) ────────────────────────────────────────

function renderAgentDetail(
  agent: ObservedAgentState,
  width: number,
  height: number,
  scrollOffset: number,
  maxScrollRef: React.MutableRefObject<number>,
  responseMode: EscalationResponseMode = "idle",
  confirmedOption: number | null = null,
): React.ReactElement {
  const agentLines = buildAgentDetailLines(
    agent,
    width,
    responseMode,
    confirmedOption,
  );

  const reactLines = agentLines.map((l) => (
    <Box key={l.key}>
      {typeof l.content === "string" ? <Text>{l.content}</Text> : l.content}
    </Box>
  ));

  const maxScroll = Math.max(0, reactLines.length - height);
  maxScrollRef.current = maxScroll;
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = reactLines.slice(clampedOffset, clampedOffset + height);

  const scrollIndicator =
    maxScroll > 0
      ? `[${clampedOffset + 1}-${Math.min(clampedOffset + height, reactLines.length)}/${reactLines.length}]`
      : "";

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      paddingLeft={1}
      overflow="hidden"
    >
      {scrollIndicator && (
        <Box width={width - 2} justifyContent="flex-end">
          <Text color={tc(theme.textMuted)}>{scrollIndicator}</Text>
        </Box>
      )}
      {scrollIndicator ? visibleLines.slice(0, height - 1) : visibleLines}
    </Box>
  );
}

function renderAgentLogDetail(
  agent: ObservedAgentState,
  width: number,
  height: number,
  scrollOffset: number,
  maxScrollRef: React.MutableRefObject<number>,
): React.ReactElement {
  const logLines = buildAgentLogLines(agent, width);
  const reactLines = logLines.map((line) => (
    <Box key={line.key}>
      {typeof line.content === "string" ? (
        <Text>{line.content}</Text>
      ) : (
        line.content
      )}
    </Box>
  ));

  const maxScroll = Math.max(0, reactLines.length - height);
  maxScrollRef.current = maxScroll;
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = reactLines.slice(clampedOffset, clampedOffset + height);

  const scrollIndicator =
    maxScroll > 0
      ? `[${clampedOffset + 1}-${Math.min(clampedOffset + height, reactLines.length)}/${reactLines.length}]`
      : "";

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      paddingLeft={1}
      overflow="hidden"
    >
      {scrollIndicator && (
        <Box width={width - 2} justifyContent="flex-end">
          <Text color={tc(theme.textMuted)}>{scrollIndicator}</Text>
        </Box>
      )}
      {scrollIndicator ? visibleLines.slice(0, height - 1) : visibleLines}
    </Box>
  );
}

// ── Scroll handle for external control (mouse scroll) ────────────────────────

export interface DetailScrollHandle {
  scrollBy: (delta: number) => void;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

export interface DetailPanelProps {
  node: TreeNode | null;
  width: number;
  height: number;
  focused?: boolean;
  swarmStatus?: SwarmStatusData | null;
  selectedAgent?: ObservedAgentState | null;
  agentDetailMode?: AgentDetailMode;
  responseMode?: EscalationResponseMode;
  confirmedOption?: number | null;
  storyLinkTemplate?: string;
  hyperlinksEnabled?: boolean;
  /** Ref for external scroll control (e.g., mouse scroll from parent) */
  scrollRef?: React.MutableRefObject<DetailScrollHandle>;
}

export function DetailPanel({
  node,
  width,
  height,
  focused = false,
  swarmStatus = null,
  selectedAgent = null,
  agentDetailMode = "info",
  responseMode = "idle",
  confirmedOption = null,
  storyLinkTemplate,
  hyperlinksEnabled = false,
  scrollRef,
}: DetailPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const nodeCode = selectedAgent
    ? selectedAgent.agent_id
    : node
      ? node.kind === "story"
        ? (node as StoryNode).code
        : node.code
      : null;

  useEffect(() => {
    setScrollOffset(0);
  }, [nodeCode]);

  const agentLogKeys =
    selectedAgent && agentDetailMode === "log"
      ? buildAgentLogLines(selectedAgent, width)
          .map((line) => line.key)
          .join("|")
      : null;

  const maxScrollRef = useRef(0);

  // Expose scroll control to parent via ref
  useEffect(() => {
    if (scrollRef) {
      scrollRef.current = {
        scrollBy: (delta: number) => {
          setScrollOffset((s) => {
            const next = s + delta;
            return Math.min(Math.max(0, next), maxScrollRef.current);
          });
        },
      };
    }
  }, [scrollRef]);

  useEffect(() => {
    if (!selectedAgent || agentDetailMode !== "log") {
      return;
    }

    const nextLogLines = buildAgentLogLines(selectedAgent, width).length;
    setScrollOffset(Math.max(0, nextLogLines - height));
  }, [agentDetailMode, agentLogKeys, height, selectedAgent, width]);

  useInput(
    (input: string, key: Key) => {
      if (key.downArrow || input === "j") {
        setScrollOffset((s) => Math.min(s + 1, maxScrollRef.current));
        return;
      }
      if (key.upArrow || input === "k") {
        setScrollOffset((s) => Math.max(s - 1, 0));
        return;
      }
      if (key.ctrl && input === "u") {
        const half = Math.max(1, Math.floor(height / 2));
        setScrollOffset((s) => Math.max(0, s - half));
        return;
      }
      if (key.ctrl && input === "d") {
        const half = Math.max(1, Math.floor(height / 2));
        setScrollOffset((s) => Math.min(s + half, maxScrollRef.current));
        return;
      }
      if (input === "g") {
        setScrollOffset(0);
        return;
      }
      if (input === "G") {
        setScrollOffset(maxScrollRef.current);
        return;
      }
    },
    { isActive: focused && (node !== null || selectedAgent !== null) },
  );

  if (selectedAgent) {
    if (agentDetailMode === "log") {
      return renderAgentLogDetail(
        selectedAgent,
        width,
        height,
        scrollOffset,
        maxScrollRef,
      );
    }

    return renderAgentDetail(
      selectedAgent,
      width,
      height,
      scrollOffset,
      maxScrollRef,
      responseMode,
      confirmedOption,
    );
  }

  if (!node) {
    return (
      <Box width={width} height={height} flexDirection="column" paddingLeft={1}>
        <Text color={tc(theme.textMuted)}>No item selected</Text>
      </Box>
    );
  }

  const lines: React.ReactNode[] = [];
  const w = width - 2;
  const breadcrumb = buildDetailBreadcrumb(node, null);

  function addLine(content: React.ReactNode, key: string) {
    lines.push(
      <Box key={key}>
        {typeof content === "string" ? <Text>{content}</Text> : content}
      </Box>,
    );
  }

  function addField(label: string, value: string, key: string) {
    addLine(
      <Text>
        <Text bold color={tc(theme.text)}>
          {label}:{" "}
        </Text>
        <Text color={tc(theme.textMuted)}>{value}</Text>
      </Text>,
      key,
    );
  }

  function addColoredField(
    label: string,
    value: string,
    color: string | undefined,
    key: string,
  ) {
    addLine(
      <Text>
        <Text bold color={tc(theme.text)}>
          {label}:{" "}
        </Text>
        <Text color={color ? tc(color) : tc(theme.textMuted)}>{value}</Text>
      </Text>,
      key,
    );
  }

  function addSection(title: string, key: string) {
    addLine(
      <Text color={tc(theme.border)}>{"\u2500".repeat(Math.min(w, 40))}</Text>,
      `${key}-rule`,
    );
    addLine(
      <Text bold color={tc(theme.primary)}>
        {title}
      </Text>,
      key,
    );
  }

  function wrapText(text: string, maxWidth: number): string[] {
    if (!text) return [];
    const words = text.split(" ");
    const wrappedLines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > maxWidth) {
        if (current) wrappedLines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) wrappedLines.push(current);
    return wrappedLines;
  }

  if (breadcrumb.length > 0) {
    addLine(renderBreadcrumb(breadcrumb, "breadcrumb").content, "breadcrumb");
    addLine(<Text> </Text>, "breadcrumb-sep");
  }

  if (node.kind === "story") {
    const story = node as StoryNode;
    addField(
      "Code",
      formatTerminalLink(
        story.code,
        buildStoryUrl(storyLinkTemplate, story.code),
        hyperlinksEnabled,
      ),
      "code",
    );
    addField("Title", story.title, "title");
    addColoredField(
      "Status",
      story.status,
      statusThemeColor(story.status),
      "status",
    );
    addColoredField(
      "Priority",
      story.priority,
      priorityColor(story.priority) ?? undefined,
      "priority",
    );
    addField("Points", String(story.story_points), "points");

    if (story.depends_on && story.depends_on.length > 0) {
      addSection("Depends On", "deps-section");
      story.depends_on.forEach((dep, i) => {
        addLine(
          <Text color={tc(theme.textMuted)}>
            {" "}
            {"\u2192"} {dep}
          </Text>,
          `dep-${i}`,
        );
      });
    }

    if (story.resolution_type) {
      addLine(<Text> </Text>, "sep-res");
      addLine(
        <Text
          bold
          color={tc(
            story.resolution_type === "conflict" ? theme.error : theme.warning,
          )}
        >
          {story.resolution_type === "conflict" ? "CONFLICT" : "GAP"}
        </Text>,
        "res-type",
      );
      if (
        story.resolution_type === "conflict" &&
        story.conflicting_assumptions
      ) {
        addLine(
          <Text bold color={tc(theme.text)}>
            Conflicting Assumptions:
          </Text>,
          "conf-assum-label",
        );
        story.conflicting_assumptions.forEach((ca, i) => {
          const label = `  ${i + 1}. ${ca.assumption} (from ${ca.source_report_id})`;
          for (const [j, line] of wrapText(label, w).entries()) {
            addLine(
              <Text color={tc(theme.text)}> {line}</Text>,
              `ca-${i}-${j}`,
            );
          }
        });
        if (story.source_reports && story.source_reports.length > 0) {
          addLine(
            <Text color={tc(theme.text)}>Source Reports:</Text>,
            "src-rep-label",
          );
          story.source_reports.forEach((sr, i) => {
            addLine(
              <Text color={tc(theme.textMuted)}> - {sr}</Text>,
              `sr-${i}`,
            );
          });
        }
        if (story.proposed_resolution) {
          addLine(
            <Text color={tc(theme.text)}>Proposed Resolution:</Text>,
            "prop-res-label",
          );
          for (const [i, line] of wrapText(
            `  ${story.proposed_resolution}`,
            w,
          ).entries()) {
            addLine(<Text color={tc(theme.text)}>{line}</Text>, `pr-${i}`);
          }
        }
      }
      if (story.resolution_type === "gap" && story.undefined_concept) {
        addLine(
          <Text color={tc(theme.text)}>Undefined Concept:</Text>,
          "undef-conc-label",
        );
        addLine(
          <Text color={tc(theme.textMuted)}> {story.undefined_concept}</Text>,
          "undef-concept",
        );
        if (story.referenced_in && story.referenced_in.length > 0) {
          addLine(
            <Text color={tc(theme.text)}>Referenced In:</Text>,
            "ref-in-label",
          );
          story.referenced_in.forEach((ri, i) => {
            addLine(
              <Text color={tc(theme.textMuted)}> - {ri}</Text>,
              `ri-${i}`,
            );
          });
        }
      }
    }

    addSection("Description", "desc-section");
    for (const [i, line] of wrapText(story.description, w).entries()) {
      addLine(<Text color={tc(theme.text)}> {line}</Text>, `desc-${i}`);
    }

    if (story.acceptance_criteria.length > 0) {
      addSection("Acceptance Criteria", "ac-section");
      story.acceptance_criteria.forEach((ac, i) => {
        for (const [j, line] of wrapText(`${i + 1}. ${ac}`, w).entries()) {
          addLine(<Text color={tc(theme.text)}> {line}</Text>, `ac-${i}-${j}`);
        }
      });
    }

    if (story.notes && story.notes.trim()) {
      addSection("Notes", "notes-section");
      for (const [i, line] of wrapText(story.notes, w).entries()) {
        addLine(<Text color={tc(theme.text)}> {line}</Text>, `notes-${i}`);
      }
    }
  } else if (node.kind === "epic") {
    addField("Code", node.code, "code");
    addField("Title", node.title, "title");
    addColoredField(
      "Status",
      node.status,
      statusThemeColor(node.status),
      "status",
    );
    addColoredField(
      "Priority",
      node.priority,
      priorityColor(node.priority) ?? undefined,
      "priority",
    );
    addField("Created", node.created_at, "created_at");

    addSection("Description", "desc-section");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text color={tc(theme.text)}> {line}</Text>, `desc-${i}`);
    }

    addSection("Stories", "stories-section");
    const backlog = node.stories.filter((s) => s.status === "backlog").length;
    const inProgress = node.stories.filter(
      (s) => s.status === "in_progress",
    ).length;
    const done = node.stories.filter((s) => s.status === "done").length;
    addLine(
      <Text>
        {"  "}
        <Text color={tc(theme.text)}>{backlog} backlog</Text>
        {"  "}
        <Text color={tc(theme.warning)}>{inProgress} in_progress</Text>
        {"  "}
        <Text color={tc(theme.success)}>{done} done</Text>
      </Text>,
      "story-counts",
    );
  } else {
    addField("Code", node.code, "code");
    addField("Name", node.name, "name");
    addField("Status", node.status, "status");

    addSection("Description", "desc-section");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text color={tc(theme.text)}> {line}</Text>, `desc-${i}`);
    }

    for (const line of buildRecentExperimentLines(
      swarmStatus?.recentResults ?? [],
      w,
    )) {
      addLine(line.content, line.key);
    }

    for (const line of buildExplorationCoverageLines(
      swarmStatus?.explorationCoverage ?? [],
      w,
    )) {
      addLine(line.content, line.key);
    }

    if (node.vision) {
      addSection("Vision", "vision-section");
      for (const [i, line] of wrapText(node.vision, w).entries()) {
        addLine(<Text color={tc(theme.text)}> {line}</Text>, `vision-${i}`);
      }
    }
    if (node.tech_stack.length > 0) {
      addLine(<Text> </Text>, "sep3");
      addField("Tech Stack", node.tech_stack.join(", "), "tech");
    }

    addSection("Epics", "epics-section");
    node.epics.forEach((epic, i) => {
      addLine(
        <Text>
          {"  "}
          <Text color={tc(statusThemeColor(epic.status))}>
            {statusIcon(epic.status)}
          </Text>{" "}
          <Text color={tc(theme.text)}>
            {epic.code} {epic.title}
          </Text>
        </Text>,
        `epic-${i}`,
      );
    });
  }

  const maxScroll = Math.max(0, lines.length - height);
  maxScrollRef.current = maxScroll;
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = lines.slice(clampedOffset, clampedOffset + height);

  const scrollIndicator =
    maxScroll > 0
      ? `[${clampedOffset + 1}-${Math.min(clampedOffset + height, lines.length)}/${lines.length}]`
      : "";

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      paddingLeft={1}
      overflow="hidden"
    >
      {scrollIndicator && (
        <Box width={width - 2} justifyContent="flex-end">
          <Text color={tc(theme.textMuted)}>{scrollIndicator}</Text>
        </Box>
      )}
      {scrollIndicator ? visibleLines.slice(0, height - 1) : visibleLines}
    </Box>
  );
}
