import React from "react";
import { Box, Text } from "ink";
import { statusIcon, statusColor } from "./Tree.js";
import type { TreeNode } from "../types.js";

// ── Detail Panel ──────────────────────────────────────────────────────────────

export interface DetailPanelProps {
  node: TreeNode | null;
  width: number;
  height: number;
}

export function DetailPanel({ node, width, height }: DetailPanelProps) {
  if (!node) {
    return (
      <Box width={width} height={height} flexDirection="column">
        <Text dimColor>No item selected</Text>
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
        <Text bold>{label}: </Text>
        <Text>{value}</Text>
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

  if (node.kind === "story") {
    addField("Code", node.code, "code");
    addField("Title", node.title, "title");
    addField("Status", node.status, "status");
    addField("Priority", node.priority, "priority");
    addField("Points", String(node.story_points), "points");
    addLine(<Text> </Text>, "sep1");
    addLine(<Text bold>Description:</Text>, "desc-label");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text> {line}</Text>, `desc-${i}`);
    }
    if (node.acceptance_criteria.length > 0) {
      addLine(<Text> </Text>, "sep2");
      addLine(<Text bold>Acceptance Criteria:</Text>, "ac-label");
      node.acceptance_criteria.forEach((ac, i) => {
        for (const [j, line] of wrapText(`${i + 1}. ${ac}`, w).entries()) {
          addLine(<Text> {line}</Text>, `ac-${i}-${j}`);
        }
      });
    }
  } else if (node.kind === "epic") {
    addField("Code", node.code, "code");
    addField("Title", node.title, "title");
    addField("Status", node.status, "status");
    addField("Priority", node.priority, "priority");
    addLine(<Text> </Text>, "sep1");
    addLine(<Text bold>Description:</Text>, "desc-label");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text> {line}</Text>, `desc-${i}`);
    }
    addLine(<Text> </Text>, "sep2");
    const backlog = node.stories.filter((s) => s.status === "backlog").length;
    const inProgress = node.stories.filter(
      (s) => s.status === "in_progress",
    ).length;
    const done = node.stories.filter((s) => s.status === "done").length;
    addLine(<Text bold>Stories:</Text>, "stories-label");
    addLine(
      <Text>
        {"  "}
        <Text color="white">{backlog} backlog</Text>
        {"  "}
        <Text color="yellow">{inProgress} in_progress</Text>
        {"  "}
        <Text color="green">{done} done</Text>
      </Text>,
      "story-counts",
    );
  } else {
    addField("Code", node.code, "code");
    addField("Name", node.name, "name");
    addField("Status", node.status, "status");
    addLine(<Text> </Text>, "sep1");
    addLine(<Text bold>Description:</Text>, "desc-label");
    for (const [i, line] of wrapText(node.description, w).entries()) {
      addLine(<Text> {line}</Text>, `desc-${i}`);
    }
    if (node.vision) {
      addLine(<Text> </Text>, "sep2");
      addLine(<Text bold>Vision:</Text>, "vision-label");
      for (const [i, line] of wrapText(node.vision, w).entries()) {
        addLine(<Text> {line}</Text>, `vision-${i}`);
      }
    }
    if (node.tech_stack.length > 0) {
      addLine(<Text> </Text>, "sep3");
      addField("Tech Stack", node.tech_stack.join(", "), "tech");
    }
    addLine(<Text> </Text>, "sep4");
    addLine(<Text bold>Epics:</Text>, "epics-label");
    node.epics.forEach((epic, i) => {
      addLine(
        <Text>
          {"  "}
          <Text
            color={
              statusColor(epic.status) as Parameters<typeof Text>[0]["color"]
            }
          >
            {statusIcon(epic.status)}
          </Text>{" "}
          {epic.code} {epic.title}
        </Text>,
        `epic-${i}`,
      );
    });
  }

  const visibleLines = lines.slice(0, height);

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      paddingLeft={1}
      overflow="hidden"
    >
      {visibleLines}
    </Box>
  );
}
