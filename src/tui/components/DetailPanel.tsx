import React from "react";
import { Box, Text } from "ink";
import { statusIcon, statusColor } from "./Tree.js";
import type { TreeNode, StoryNode } from "../types.js";

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
    const story = node as StoryNode;
    addField("Code", story.code, "code");
    addField("Title", story.title, "title");
    addField("Status", story.status, "status");
    addField("Priority", story.priority, "priority");
    addField("Points", String(story.story_points), "points");
    if (story.resolution_type) {
      addLine(<Text> </Text>, "sep-res");
      addLine(
        <Text
          bold
          color={story.resolution_type === "conflict" ? "red" : "yellow"}
        >
          {story.resolution_type === "conflict" ? "⚠ CONFLICT" : "⚑ GAP"}
        </Text>,
        "res-type",
      );
      if (
        story.resolution_type === "conflict" &&
        story.conflicting_assumptions
      ) {
        addLine(<Text bold>Conflicting Assumptions:</Text>, "conf-assum-label");
        story.conflicting_assumptions.forEach((ca, i) => {
          const label = `  ${i + 1}. ${ca.assumption} (from ${ca.source_report_id})`;
          for (const [j, line] of wrapText(label, w).entries()) {
            addLine(<Text> {line}</Text>, `ca-${i}-${j}`);
          }
        });
        if (story.source_reports && story.source_reports.length > 0) {
          addLine(<Text>Source Reports:</Text>, "src-rep-label");
          story.source_reports.forEach((sr, i) => {
            addLine(<Text> - {sr}</Text>, `sr-${i}`);
          });
        }
        if (story.proposed_resolution) {
          addLine(<Text>Proposed Resolution:</Text>, "prop-res-label");
          for (const [i, line] of wrapText(
            `  ${story.proposed_resolution}`,
            w,
          ).entries()) {
            addLine(<Text>{line}</Text>, `pr-${i}`);
          }
        }
      }
      if (story.resolution_type === "gap" && story.undefined_concept) {
        addLine(<Text>Undefined Concept:</Text>, "undef-conc-label");
        addLine(<Text> {story.undefined_concept}</Text>, "undef-concept");
        if (story.referenced_in && story.referenced_in.length > 0) {
          addLine(<Text>Referenced In:</Text>, "ref-in-label");
          story.referenced_in.forEach((ri, i) => {
            addLine(<Text> - {ri}</Text>, `ri-${i}`);
          });
        }
      }
    }
    addLine(<Text> </Text>, "sep1");
    addLine(<Text bold>Description:</Text>, "desc-label");
    for (const [i, line] of wrapText(story.description, w).entries()) {
      addLine(<Text> {line}</Text>, `desc-${i}`);
    }
    if (story.acceptance_criteria.length > 0) {
      addLine(<Text> </Text>, "sep2");
      addLine(<Text bold>Acceptance Criteria:</Text>, "ac-label");
      story.acceptance_criteria.forEach((ac, i) => {
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
