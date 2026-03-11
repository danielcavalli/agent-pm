import { createLLMClient } from "../lib/llm.js";
import type { SynthesisResult } from "./consolidate.js";

export interface SemanticCluster {
  id: string;
  theme: string;
  items: {
    reportId: string;
    text: string;
    category: "decision" | "assumption";
  }[];
  synthesis: string;
  recommendation: "create_adr" | "create_task" | "noop";
}

export interface SemanticClusteringResult {
  clusters: SemanticCluster[];
  totalUnmatched: number;
}

export async function semanticClustering(
  unmatched: SynthesisResult["unmatched"],
): Promise<SemanticClusteringResult> {
  if (unmatched.length === 0) {
    return { clusters: [], totalUnmatched: 0 };
  }

  const llm = createLLMClient();

  const itemsText = unmatched
    .map(
      (item, idx) =>
        `${idx + 1}. [${item.category.toUpperCase()}] "${item.text}" (source: ${item.reportId})`,
    )
    .join("\n");

  const prompt = `You are a software architecture reasoning assistant. Analyze the following unmatched decisions and assumptions from agent execution reports and cluster them by semantic similarity.

For each cluster, provide:
1. A theme that captures the common topic
2. A synthesis that explains the combined meaning
3. A recommendation: "create_adr" if this represents a significant architectural decision worth documenting, "create_task" if this identifies a gap requiring follow-up work, or "noop" if it's routine

Respond in JSON format:
{
  "clusters": [
    {
      "theme": "brief theme (max 10 words)",
      "items": [{"reportId": "...", "text": "...", "category": "decision|assumption"}],
      "synthesis": "2-3 sentence synthesis of what these items collectively mean",
      "recommendation": "create_adr|create_task|noop"
    }
  ]
}

Items to analyze:
${itemsText}

Respond with valid JSON only, no other text.`;

  const response = await llm.complete(prompt);

  let parsed: { clusters?: SemanticCluster[] };
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(response);
    }
  } catch {
    return {
      clusters: [],
      totalUnmatched: unmatched.length,
    };
  }

  const clusters: SemanticCluster[] = (parsed.clusters ?? []).map(
    (cluster: {
      theme: string;
      items: {
        reportId: string;
        text: string;
        category: "decision" | "assumption";
      }[];
      synthesis: string;
      recommendation: "create_adr" | "create_task" | "noop";
    }) => ({
      id: Math.random().toString(36).substring(2, 9),
      theme: cluster.theme,
      items: cluster.items,
      synthesis: cluster.synthesis,
      recommendation: cluster.recommendation,
    }),
  );

  return {
    clusters,
    totalUnmatched: unmatched.length,
  };
}
