import React, { useState, useEffect, useRef, useImperativeHandle } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import { statusIcon, statusColor } from "./Tree.js";
import type { TreeNode, StoryNode } from "../types.js";
import type { AgentState } from "../../schemas/agent-state.schema.js";
import type { EscalationResponseMode } from "../escalationResponse.js";
import { confirmationMessage } from "../escalationResponse.js";
import { theme, tc, priorityColor, statusThemeColor } from "../colors.js";

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

export function buildAgentDetailLines(
  agent: AgentState,
  maxWidth: number,
  responseMode: EscalationResponseMode = "idle",
  confirmedOption: number | null = null,
): AgentDetailLine[] {
  const lines: AgentDetailLine[] = [];
  const w = Math.max(maxWidth - 2, 10);

  function addField(label: string, value: string, key: string) {
    lines.push({
      key,
      content: (
        <Text>
          <Text bold color={tc(theme.text)}>{label}: </Text>
          <Text color={tc(theme.textMuted)}>{value}</Text>
        </Text>
      ),
    });
  }

  function addLine(content: React.ReactNode, key: string) {
    lines.push({ key, content });
  }

  function addSection(title: string, key: string) {
    addLine(<Text color={tc(theme.border)}>{"\u2500".repeat(Math.min(w, 40))}</Text>, `${key}-rule`);
    addLine(<Text bold color={tc(theme.primary)}>{title}</Text>, key);
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
    addLine(<Text bold color={tc(theme.text)}>Message:</Text>, "esc-msg-label");
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
      addLine(<Text bold color={tc(theme.text)}>Options:</Text>, "esc-options-label");
      esc.options.forEach((opt, i) => {
        for (const [j, line] of wrapTextUtil(
          `[${i + 1}] ${opt}`,
          w,
        ).entries()) {
          addLine(<Text color={tc(theme.text)}> {line}</Text>, `esc-opt-${i}-${j}`);
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
  } else {
    addLine(
      <Text bold color={tc(theme.primary)}>Agent Details</Text>,
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

    addField("Started At", agent.started_at, "agent-started");
    addField("Last Heartbeat", agent.last_heartbeat, "agent-heartbeat");

    if (agent.progress_summary) {
      addLine(<Text> </Text>, "agent-sep1");
      addLine(<Text bold color={tc(theme.text)}>Progress:</Text>, "agent-progress-label");
      for (const [i, line] of wrapTextUtil(
        agent.progress_summary,
        w,
      ).entries()) {
        addLine(<Text color={tc(theme.text)}> {line}</Text>, `agent-progress-${i}`);
      }
    }
  }

  return lines;
}

// ── Render agent detail (with scroll) ────────────────────────────────────────

function renderAgentDetail(
  agent: AgentState,
  width: number,
  height: number,
  scrollOffset: number,
  maxScrollRef: React.MutableRefObject<number>,
  responseMode: EscalationResponseMode = "idle",
  confirmedOption: number | null = null,
): React.ReactElement {
  const agentLines = buildAgentDetailLines(agent, width, responseMode, confirmedOption);

  const reactLines = agentLines.map((l) => (
    <Box key={l.key}>
      {typeof l.content === "string" ? <Text>{l.content}</Text> : l.content}
    </Box>
  ));

  const maxScroll = Math.max(0, reactLines.length - height);
  maxScrollRef.current = maxScroll;
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = reactLines.slice(clampedOffset, clampedOffset + height);

  const scrollIndicator = maxScroll > 0
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
      {scrollIndicator
        ? visibleLines.slice(0, height - 1)
        : visibleLines}
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
  selectedAgent?: AgentState | null;
  responseMode?: EscalationResponseMode;
  confirmedOption?: number | null;
  /** Ref for external scroll control (e.g., mouse scroll from parent) */
  scrollRef?: React.MutableRefObject<DetailScrollHandle>;
}

export function DetailPanel({
  node,
  width,
  height,
  focused = false,
  selectedAgent = null,
  responseMode = "idle",
  confirmedOption = null,
  scrollRef,
}: DetailPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const nodeCode = selectedAgent
    ? selectedAgent.agent_id
    : node ? (node.kind === "story" ? (node as StoryNode).code : node.code) : null;

  useEffect(() => {
    setScrollOffset(0);
  }, [nodeCode]);

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
    return renderAgentDetail(selectedAgent, width, height, scrollOffset, maxScrollRef, responseMode, confirmedOption);
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
        <Text bold color={tc(theme.text)}>{label}: </Text>
        <Text color={tc(theme.textMuted)}>{value}</Text>
      </Text>,
      key,
    );
  }

  function addColoredField(label: string, value: string, color: string | undefined, key: string) {
    addLine(
      <Text>
        <Text bold color={tc(theme.text)}>{label}: </Text>
        <Text color={color ? tc(color) : tc(theme.textMuted)}>{value}</Text>
      </Text>,
      key,
    );
  }

  function addSection(title: string, key: string) {
    addLine(<Text color={tc(theme.border)}>{"\u2500".repeat(Math.min(w, 40))}</Text>, `${key}-rule`);
    addLine(<Text bold color={tc(theme.primary)}>{title}</Text>, key);
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

  if (node.kind === "story") {
    const story = node as StoryNode;
    addField("Code", story.code, "code");
    addField("Title", story.title, "title");
    addColoredField("Status", story.status, statusThemeColor(story.status), "status");
    addColoredField("Priority", story.priority, priorityColor(story.priority) ?? undefined, "priority");
    addField("Points", String(story.story_points), "points");

    if (story.depends_on && story.depends_on.length > 0) {
      addSection("Depends On", "deps-section");
      story.depends_on.forEach((dep, i) => {
        addLine(<Text color={tc(theme.textMuted)}>  {"\u2192"} {dep}</Text>, `dep-${i}`);
      });
    }

    if (story.resolution_type) {
      addLine(<Text> </Text>, "sep-res");
      addLine(
        <Text bold color={tc(story.resolution_type === "conflict" ? theme.error : theme.warning)}>
          {story.resolution_type === "conflict" ? "CONFLICT" : "GAP"}
        </Text>,
        "res-type",
      );
      if (story.resolution_type === "conflict" && story.conflicting_assumptions) {
        addLine(<Text bold color={tc(theme.text)}>Conflicting Assumptions:</Text>, "conf-assum-label");
        story.conflicting_assumptions.forEach((ca, i) => {
          const label = `  ${i + 1}. ${ca.assumption} (from ${ca.source_report_id})`;
          for (const [j, line] of wrapText(label, w).entries()) {
            addLine(<Text color={tc(theme.text)}> {line}</Text>, `ca-${i}-${j}`);
          }
        });
        if (story.source_reports && story.source_reports.length > 0) {
          addLine(<Text color={tc(theme.text)}>Source Reports:</Text>, "src-rep-label");
          story.source_reports.forEach((sr, i) => {
            addLine(<Text color={tc(theme.textMuted)}> - {sr}</Text>, `sr-${i}`);
          });
        }
        if (story.proposed_resolution) {
          addLine(<Text color={tc(theme.text)}>Proposed Resolution:</Text>, "prop-res-label");
          for (const [i, line] of wrapText(`  ${story.proposed_resolution}`, w).entries()) {
            addLine(<Text color={tc(theme.text)}>{line}</Text>, `pr-${i}`);
          }
        }
      }
      if (story.resolution_type === "gap" && story.undefined_concept) {
        addLine(<Text color={tc(theme.text)}>Undefined Concept:</Text>, "undef-conc-label");
        addLine(<Text color={tc(theme.textMuted)}> {story.undefined_concept}</Text>, "undef-concept");
        if (story.referenced_in && story.referenced_in.length > 0) {
          addLine(<Text color={tc(theme.text)}>Referenced In:</Text>, "ref-in-label");
          story.referenced_in.forEach((ri, i) => {
            addLine(<Text color={tc(theme.textMuted)}> - {ri}</Text>, `ri-${i}`);
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
    addColoredField("Status", node.status, statusThemeColor(node.status), "status");
    addColoredField("Priority", node.priority, priorityColor(node.priority) ?? undefined, "priority");
    addField("Created", node.created_at, "created_at");

    addSection("Description", "desc-section");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text color={tc(theme.text)}> {line}</Text>, `desc-${i}`);
    }

    addSection("Stories", "stories-section");
    const backlog = node.stories.filter((s) => s.status === "backlog").length;
    const inProgress = node.stories.filter((s) => s.status === "in_progress").length;
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
          <Text color={tc(theme.text)}>{epic.code} {epic.title}</Text>
        </Text>,
        `epic-${i}`,
      );
    });
  }

  const maxScroll = Math.max(0, lines.length - height);
  maxScrollRef.current = maxScroll;
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = lines.slice(clampedOffset, clampedOffset + height);

  const scrollIndicator = maxScroll > 0
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
      {scrollIndicator
        ? visibleLines.slice(0, height - 1)
        : visibleLines}
    </Box>
  );
}
