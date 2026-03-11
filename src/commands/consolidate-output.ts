import * as path from "node:path";
import * as fs from "node:fs";
import yaml from "js-yaml";
import { fileExists } from "../lib/fs.js";
import { getPmDir } from "../lib/codes.js";
import type { SynthesisResult } from "./consolidate.js";
import { adrCreate, nextAdrNumber } from "./adr.js";

export interface OutputResult {
  adrsCreated: string[];
  tasksCreated: string[];
}

export async function routeOutput(
  projectCode: string,
  synthesisResult: SynthesisResult,
  clusteringResult: {
    clusters: {
      id: string;
      theme: string;
      synthesis: string;
      recommendation: string;
      items: { reportId: string }[];
    }[];
  },
): Promise<OutputResult> {
  const result: OutputResult = { adrsCreated: [], tasksCreated: [] };

  const confirmedDecisions = synthesisResult.candidates.filter(
    (c) => c.type === "confirmed_decision",
  );

  for (const decision of confirmedDecisions) {
    try {
      const adrId = await nextAdrNumber();
      const title = decision.content.substring(0, 60);
      const context =
        "Consolidated from execution reports: " +
        decision.sourceReportIds.join(", ");
      const decisionText = decision.content;

      await adrCreate({
        projectCode,
        title,
        status: "proposed",
        context,
        decision: decisionText,
        positiveConsequences: ["Consolidated from multiple execution reports"],
        negativeConsequences: [],
        authorType: "agent",
        authorId: "consolidation-agent",
        tags: ["consolidated", "auto-generated"],
      });

      result.adrsCreated.push(adrId);
    } catch {
      // Skip on error
    }
  }

  const taskClusters = clusteringResult.clusters.filter(
    (c) => c.recommendation === "create_task",
  );

  for (const cluster of taskClusters) {
    try {
      const backlogEpic = findBacklogEpic();
      if (backlogEpic) {
        const { storyAdd } = await import("./story.js");
        await storyAdd(backlogEpic, {
          title: cluster.theme,
          description: cluster.synthesis,
          criteria: cluster.items.map((i) => "Source: " + i.reportId),
          priority: "medium",
          points: "3",
        });
        result.tasksCreated.push(cluster.theme);
      }
    } catch {
      // Skip on error
    }
  }

  return result;
}

function findBacklogEpic(): string | null {
  const pmDir = getPmDir();
  const epicsDir = path.join(pmDir, "epics");

  if (!fileExists(epicsDir)) {
    return null;
  }

  const files = fs.readdirSync(epicsDir);

  for (const file of files) {
    if (file.endsWith(".yaml")) {
      const filePath = path.join(epicsDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const epic = yaml.load(content) as { code?: string; status?: string };
        if (epic?.status === "backlog") {
          return epic?.code || null;
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  return null;
}
