/**
 * Structural deduplication phase for consolidation.
 *
 * Runs before the LLM semantic clustering phase. Identifies:
 * 1. Exact duplicate decisions/assumptions across reports
 * 2. Fuzzy near-duplicates with minor wording differences
 * 3. Contradicting decisions (conflicts)
 *
 * Matched items are grouped into synthesis candidates.
 * Unmatched items are passed through to the LLM semantic phase.
 */

import type { SynthesisCandidate, LoadedReport } from "./consolidate.js";

/**
 * An extracted item from a report, normalized for comparison.
 */
export interface ExtractedItem {
  reportId: string;
  category: "decision" | "assumption";
  text: string;
  normalizedText: string;
}

/**
 * A group of structurally matched items.
 */
export interface StructuralMatch {
  type: "exact" | "fuzzy";
  items: ExtractedItem[];
}

/**
 * A detected conflict between contradicting decisions.
 */
export interface ConflictPair {
  itemA: ExtractedItem;
  itemB: ExtractedItem;
  reason: string;
}

/**
 * Result of the structural deduplication phase.
 */
export interface StructuralDedupResult {
  /** Matched items grouped as synthesis candidates */
  candidates: SynthesisCandidate[];
  /** Detected conflicts between contradicting decisions */
  conflicts: ConflictPair[];
  /** Items that did not match anything structurally */
  unmatched: {
    reportId: string;
    category: "decision" | "assumption";
    text: string;
  }[];
  /** Summary statistics */
  stats: {
    totalItems: number;
    exactMatches: number;
    fuzzyMatches: number;
    conflicts: number;
    unmatchedCount: number;
  };
}

/**
 * Normalize text for comparison: lowercase, collapse whitespace, strip
 * leading/trailing whitespace, and remove common punctuation differences.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''"""`]/g, "'")
    .replace(/[—–-]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute bigrams (2-character substrings) from a string.
 * Used for Dice coefficient similarity.
 */
export function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  const s = text.toLowerCase();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.substring(i, i + 2));
  }
  return result;
}

/**
 * Compute the Dice coefficient between two strings.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function diceSimilarity(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) {
    return a === b ? 1 : 0;
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) {
      intersection++;
    }
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Default fuzzy similarity threshold (Dice coefficient).
 * Items scoring above this are considered near-duplicates.
 */
export const FUZZY_THRESHOLD = 0.8;

/**
 * Negation patterns that indicate contradicting decisions.
 * Used for simple structural conflict detection.
 */
const NEGATION_PREFIXES = [
  "do not ",
  "don't ",
  "avoid ",
  "never ",
  "not ",
  "stop ",
  "remove ",
  "disable ",
  "reject ",
  "skip ",
];

/**
 * Common action verb prefixes that precede the object of a decision.
 * Used to extract the core object when comparing decisions.
 */
const ACTION_PREFIXES = [
  "use ",
  "adopt ",
  "implement ",
  "enable ",
  "add ",
  "create ",
  "keep ",
  "prefer ",
  "choose ",
];

/**
 * Strip a leading action verb from a normalized string to get the object.
 * e.g., "use redux" -> "redux", "adopt typescript" -> "typescript"
 */
function stripActionPrefix(s: string): string {
  for (const prefix of ACTION_PREFIXES) {
    if (s.startsWith(prefix)) {
      return s.slice(prefix.length);
    }
  }
  return s;
}

/**
 * Strip a leading negation prefix from a normalized string.
 * e.g., "do not use redux" -> "use redux", "avoid redux" -> "redux"
 */
function stripNegationPrefix(s: string): { stripped: string; hadNegation: boolean } {
  for (const prefix of NEGATION_PREFIXES) {
    if (s.startsWith(prefix)) {
      return { stripped: s.slice(prefix.length), hadNegation: true };
    }
  }
  return { stripped: s, hadNegation: false };
}

/**
 * Check if two decision texts are contradictory by detecting
 * negation patterns. One item says "use X" while another says "do not use X".
 */
export function detectContradiction(
  textA: string,
  textB: string,
): string | null {
  const normA = normalizeText(textA);
  const normB = normalizeText(textB);

  // Same text is not a contradiction
  if (normA === normB) return null;

  // Strategy 1: Direct negation - one is "X", the other is "not X"
  // e.g., "use redux" vs "do not use redux"
  for (const prefix of NEGATION_PREFIXES) {
    if (normB.startsWith(prefix) && normB.slice(prefix.length) === normA) {
      return `"${textA}" contradicts "${textB}"`;
    }
    if (normA.startsWith(prefix) && normA.slice(prefix.length) === normB) {
      return `"${textA}" contradicts "${textB}"`;
    }
  }

  // Strategy 2: Same object, one positive and one negative
  // e.g., "use redux" vs "avoid redux"
  const negA = stripNegationPrefix(normA);
  const negB = stripNegationPrefix(normB);

  // Exactly one has a negation prefix
  if (negA.hadNegation !== negB.hadNegation) {
    // Extract the core object from both
    const objA = negA.hadNegation ? stripActionPrefix(negA.stripped) : stripActionPrefix(normA);
    const objB = negB.hadNegation ? stripActionPrefix(negB.stripped) : stripActionPrefix(normB);

    // If the objects are the same or very similar, it's a contradiction
    if (objA === objB) {
      return `"${textA}" contradicts "${textB}"`;
    }
    if (objA.length > 3 && objB.length > 3 && diceSimilarity(objA, objB) > 0.85) {
      return `"${textA}" may contradict "${textB}" (negation detected)`;
    }
  }

  return null;
}

/**
 * Extract decisions and assumptions from loaded reports into a flat list
 * of items with normalized text for comparison.
 */
export function extractItems(reports: LoadedReport[]): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  for (const report of reports) {
    for (const decision of report.data.decisions || []) {
      items.push({
        reportId: report.data.task_id,
        category: "decision",
        text: decision.text,
        normalizedText: normalizeText(decision.text),
      });
    }
    for (const assumption of report.data.assumptions || []) {
      items.push({
        reportId: report.data.task_id,
        category: "assumption",
        text: assumption.text,
        normalizedText: normalizeText(assumption.text),
      });
    }
  }

  return items;
}

/**
 * Run the structural deduplication phase on loaded reports.
 *
 * Algorithm:
 * 1. Extract and normalize all decision/assumption texts
 * 2. Group exact duplicates (same normalized text across different reports)
 * 3. Fuzzy match remaining items using Dice coefficient
 * 4. Detect contradictions among decisions
 * 5. Return candidates, conflicts, and unmatched items
 */
export function structuralDedup(
  reports: LoadedReport[],
  options: { fuzzyThreshold?: number } = {},
): StructuralDedupResult {
  const threshold = options.fuzzyThreshold ?? FUZZY_THRESHOLD;
  const items = extractItems(reports);

  if (items.length === 0) {
    return {
      candidates: [],
      conflicts: [],
      unmatched: [],
      stats: {
        totalItems: 0,
        exactMatches: 0,
        fuzzyMatches: 0,
        conflicts: 0,
        unmatchedCount: 0,
      },
    };
  }

  // Phase 1: Exact matching - group by normalized text
  const exactGroups = new Map<string, ExtractedItem[]>();
  for (const item of items) {
    const existing = exactGroups.get(item.normalizedText);
    if (existing) {
      existing.push(item);
    } else {
      exactGroups.set(item.normalizedText, [item]);
    }
  }

  const candidates: SynthesisCandidate[] = [];
  const exactMatchedIndices = new Set<number>();
  let exactMatchCount = 0;

  // Collect exact matches (groups with items from multiple reports)
  for (const [, group] of exactGroups) {
    const uniqueReports = new Set(group.map((g) => g.reportId));
    if (uniqueReports.size > 1) {
      // This is a cross-report duplicate
      exactMatchCount += group.length;
      for (const item of group) {
        exactMatchedIndices.add(items.indexOf(item));
      }

      candidates.push({
        type: "confirmed_decision",
        content: group[0]!.text,
        sourceReportIds: [...uniqueReports],
      });
    }
  }

  // Phase 2: Fuzzy matching on remaining (non-exact-matched) items
  // Minimum normalized text length for fuzzy matching to avoid false positives
  // on very short strings (e.g., "Decision A" vs "Decision B").
  const MIN_FUZZY_LENGTH = 20;

  const remaining = items.filter((_, i) => !exactMatchedIndices.has(i));
  const fuzzyMatchedIndices = new Set<number>();
  let fuzzyMatchCount = 0;

  // Compare all remaining pairs for fuzzy similarity
  for (let i = 0; i < remaining.length; i++) {
    if (fuzzyMatchedIndices.has(i)) continue;

    // Skip short texts for fuzzy matching (too prone to false positives)
    if (remaining[i]!.normalizedText.length < MIN_FUZZY_LENGTH) continue;

    const cluster: ExtractedItem[] = [remaining[i]!];

    for (let j = i + 1; j < remaining.length; j++) {
      if (fuzzyMatchedIndices.has(j)) continue;
      if (remaining[j]!.normalizedText.length < MIN_FUZZY_LENGTH) continue;

      const sim = diceSimilarity(
        remaining[i]!.normalizedText,
        remaining[j]!.normalizedText,
      );

      if (sim >= threshold) {
        // Only count as fuzzy match if from different reports
        if (remaining[j]!.reportId !== remaining[i]!.reportId) {
          cluster.push(remaining[j]!);
          fuzzyMatchedIndices.add(j);
        }
      }
    }

    if (cluster.length > 1) {
      const uniqueReports = new Set(cluster.map((c) => c.reportId));
      if (uniqueReports.size > 1) {
        fuzzyMatchCount += cluster.length;
        fuzzyMatchedIndices.add(i);

        candidates.push({
          type: "confirmed_decision",
          content: cluster[0]!.text,
          sourceReportIds: [...uniqueReports],
        });
      }
    }
  }

  // Phase 3: Conflict detection among decisions
  const decisions = items.filter((item) => item.category === "decision");
  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      // Only flag conflicts across different reports
      if (decisions[i]!.reportId === decisions[j]!.reportId) continue;

      const reason = detectContradiction(
        decisions[i]!.text,
        decisions[j]!.text,
      );
      if (reason) {
        conflicts.push({
          itemA: decisions[i]!,
          itemB: decisions[j]!,
          reason,
        });
      }
    }
  }

  // Collect unmatched items (not in any exact or fuzzy group)
  const allMatchedIndices = new Set<number>();
  for (const idx of exactMatchedIndices) {
    allMatchedIndices.add(idx);
  }
  // Map fuzzy matched indices back to original item indices
  for (const fuzzyIdx of fuzzyMatchedIndices) {
    const originalIdx = items.indexOf(remaining[fuzzyIdx]!);
    if (originalIdx >= 0) {
      allMatchedIndices.add(originalIdx);
    }
  }

  const unmatched = items
    .filter((_, i) => !allMatchedIndices.has(i))
    .map((item) => ({
      reportId: item.reportId,
      category: item.category,
      text: item.text,
    }));

  return {
    candidates,
    conflicts,
    unmatched,
    stats: {
      totalItems: items.length,
      exactMatches: exactMatchCount,
      fuzzyMatches: fuzzyMatchCount,
      conflicts: conflicts.length,
      unmatchedCount: unmatched.length,
    },
  };
}
