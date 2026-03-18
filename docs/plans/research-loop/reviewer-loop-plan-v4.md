# Plan: `/pm-review-plan` -- Generic Research-Grounded Document Review Pipeline

**Status: COMPLETE** -- v4 implementation finished 2026-03-16. All v4 features implemented in `install/commands/pm-review-plan.md` (1503 lines). v4 delta: `--target <score>` (configurable convergence, default 4.0), `--verbose | --summary` verbosity flags, above-target plateau convergence, oscillation amplitude filter, regression-plateau exit, target-anchoring prevention, agent front-loading, progressive disclosure loop summary, --summary mode condensation. Help registration and install.sh glob coverage verified.

## Context

The user wants a generic slash command that takes ANY plan/design document (ADR, PRD, RFC, research summary, architecture doc -- in any project) and runs an iterative, research-grounded review loop. Unlike `/pm-iterate-plan` (coupled to agent-pm's epic/story model), this command has zero dependencies on `pm` CLI or agent-pm data structures. It is a standalone document improvement pipeline.

The pipeline has 5 agents in a fixed cycle order (with an optional 6th agent spawnable on demand -- see "Dynamic Agent Spawning" below) and a hard constraint: minimum 3 full cycles before the loop can converge. The Evaluator scores on 8 weighted dimensions and must produce at least 3 improvement pointers per round. The iterative refinement architecture draws on established precedents for LLM self-improvement loops, notably Madaan et al.'s Self-Refine [9], which demonstrated that iterative feedback and revision improves output quality without additional training, and Shinn et al.'s Reflexion [10], which showed that verbal reinforcement signals can guide agents toward better performance across successive attempts. The pipeline's multi-agent architecture -- where specialized agents with distinct roles communicate through structured outputs in a fixed sequence -- follows the paradigm established by multi-agent collaboration frameworks such as AutoGen (Wu et al., 2024 [24]), which enables composable multi-agent conversations with defined roles, and MetaGPT (Hong et al., 2024 [30]), which demonstrated that encoding domain-specific SOPs into agent roles produces more coherent multi-agent workflows than unconstrained collaboration. This distinguishes the pipeline from single-agent iterative approaches like Self-Refine and Reflexion: where those systems use one agent reflecting on its own output, this pipeline distributes review, validation, evaluation, integrity checking, and drafting across separate agents with adversarial and complementary incentives.

---

## Files to Create

| File                                 | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `install/commands/pm-review-plan.md` | The slash command (single file, 1382 lines) |

## Files to Modify

| File                          | Change                                         |
| ----------------------------- | ---------------------------------------------- |
| `install/commands/pm-help.md` | Add `/pm-review-plan` row to the command table |

## Conventions to Follow

From existing slash commands (`pm-iterate-plan.md`, `pm-audit.md`, `pm-work-on-project.md`):

- Arguments via `$ARGUMENTS` token with documented expected shape and defaults
- Sequential sub-agent dispatch (each agent depends on previous output)
- Approval gate before writing any files ("plan-only until approved")
- Structured inter-agent output blocks with consistent naming (`C{round}.{N}`, `S{round}.{N}`, etc.)
- Round-by-round status reporting to user

---

## Command Interface

```
/pm-review-plan <path-to-document> "<grounding-prompt>" [--max-loop <N>] [--target <score>] [--verbose | --summary]
```

**Required arguments:**

- `<path-to-document>` -- the file to review (resolved relative to cwd)
- `"<grounding-prompt>"` -- free-text instruction from the user that tells the agents WHAT to focus on. Examples:
  - `"Ensure all distributed systems claims are backed by peer-reviewed papers"`
  - `"Focus on feasibility -- this will be implemented by junior engineers"`
  - `"This is an ADR for a financial system. Emphasize correctness and risk analysis"`
  - The grounding prompt is injected into every agent's system context as the user's review intent.

**Optional:**

- `--max-loop <N>` -- maximum review cycles (default: 5, minimum enforced: 3). Note: the default `--max-loop 5` provides a cost-effective minimum run. For the full benefit of above-target plateau detection, use `--max-loop 7` or higher -- plateau convergence requires 2 consecutive loops of delta < 0.1 after reaching the target, which typically needs 2-3 loops above the target. With `--max-loop 5`, a document that reaches the target at loop 4 has only one post-target loop, which is insufficient to satisfy the 2-loop plateau criterion; the pipeline will exit via max_loop cap rather than plateau convergence (see Convergence Sketch A in Appendix A for a worked example of this trade-off).
- `--target <score>` -- composite score convergence target (default: 4.0, range: 3.0-5.0). Once the target is reached, the pipeline enters a **plateau-detection phase** rather than exiting immediately: it continues iterating until the score plateaus (delta < 0.1 for 2 consecutive loops) or max_loop is reached, whichever comes first. This prevents the convergence ceiling problem where documents can never exceed the target score. See "Convergence Logic" for the full mechanism, and Yang et al. [47] for formal analysis of convergence ceilings in iterative LLM self-correction.
- `--verbose` -- full per-agent output displayed to the user after each agent dispatch (default behavior in v4)
- `--summary` -- condensed output mode. Each agent's output is reduced to a structured summary before display; full output is preserved internally for downstream agents. See "Output Verbosity Control" for details.

- File path resolved relative to cwd

---

## Agent Cycle Architecture

```
[Document V(N)] --> Research Reviewer --> Researcher Validator --> Evaluator --> Integrity Checker --> Drafter --> [Document V(N+1)]
                         ^                                                                              |
                         |______________________________________________________________________________|

                    Agents 1, 2, 5 may spawn Creative Agent (Agent 6) on demand -- see Dynamic Agent Spawning.
```

| #   | Agent                           | Role                                                                                 | Key Output                                      |
| --- | ------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | **Research Reviewer**           | Peer-reviews claims, proposes sources                                                | Claims Inventory + Source Proposals             |
| 2   | **Researcher Validator**        | Verifies proposed + existing sources via web search                                  | Validated Bibliography                          |
| 3   | **Evaluator**                   | Scores on 8 dimensions, generates min 3 pointers                                     | Evaluation Report + Improvement Pointers        |
| 4   | **Evaluator Integrity Checker** | Audits the Evaluator's scores and justifications for soundness                       | Integrity Verdict + Adjusted Scores (if needed) |
| 5   | **Drafter**                     | Revises document addressing pointers + integrating sources                           | Document V(N+1) + Revision Changelog            |
| 6   | **Creative Agent** (on-demand)  | Generates novel approaches and competitor-informed ideas when other agents are stuck | Non-authoritative research-of-ideas proposals   |

Key difference from `/pm-iterate-plan`: cycle starts with REVIEW (document already exists), not DRAFT.

### Architecture rationale

The pipeline uses 5 fixed agents in a sequential cycle because each agent's output is a direct input to the next: claim identification, source verification, quality evaluation, evaluation auditing, and document revision have inherent sequential dependencies. Five agents separates these concerns into roles with distinct (and in some cases adversarial) incentives. Alternative factorizations are possible (e.g., merging Agents 1-2, splitting the Evaluator, parallelizing claim/source work) and may prove preferable as usage data accumulates; Chen et al. [32] show through AgentVerse that dynamic group composition can outperform fixed structures. The optional Creative Agent (Agent 6) is spawned on demand because its role is not needed every iteration. Extension points include parallelizing Agents 1 and 2, adding domain-specific specialists, or promoting the Creative Agent to a fixed stage.

**Context management note.** Each agent receives only the current loop's context -- the latest document version, the current loop's agent outputs, and summary-level information from prior loops (e.g., score trends, the previous evaluation report) -- rather than the full output history of all prior loops. Context accumulation is an implementation concern for documents reviewed across many loops; the orchestrator is responsible for selecting and summarizing prior-loop context to stay within model context window limits.

### Context management

Context load is not uniform across agents. The table below shows the per-agent input composition for a typical 5-page document (~3,000 words / ~4,000 tokens) at loop N >= 2, with approximate token counts. Token estimates assume the document itself is ~4K tokens, each agent's structured output is ~1.5-2.5K tokens, and prior-loop summaries are condensed to ~500 tokens.

| Agent                     | Inputs                                                                                                                            | Approx. tokens (loop N >= 2) |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1 -- Research Reviewer    | Document V(N) + previous evaluation report (full) + previous meta-review summary + score trend array                              | ~8K                          |
| 2 -- Researcher Validator | Document V(N) + existing bibliography + Agent 1 source proposals + previous validated bibliography                                | ~9K                          |
| 3 -- Evaluator            | Document V(N) + validated bibliography + claims inventory + Agent 1 meta-review + previous evaluation reports + score trend array | ~12K                         |
| 4 -- Integrity Checker    | Document V(N) + Evaluator full output + validated bibliography + claims inventory                                                 | ~11K                         |
| 5 -- Drafter              | Document V(N) + integrity-checked evaluation report + validated bibliography + claims inventory + original document V(0)          | ~14K                         |

**Heaviest context loads: Agent 3 (Evaluator) and Agent 5 (Drafter).** Agent 3 accumulates the most diverse inputs -- it must cross-reference claims, bibliography, meta-review, and prior evaluations simultaneously. Agent 5 carries the heaviest absolute load because it receives both the current document and the original document (for voice/format preservation) alongside the full evaluation and bibliography.

**Summarization strategy.** To keep context loads manageable, only the most recent evaluation report is passed to downstream agents in full. Prior loop results are condensed by the orchestrator into two compact artifacts: (a) a **score trend array** -- a JSON array of per-loop composite scores and per-dimension scores (e.g., `[{loop: 1, composite: 3.2, dimensions: [3,2,3,4,3,4,3,3]}, ...]`), typically <200 tokens for 5 loops; and (b) a **prior-loop summary** -- a brief (300-500 token) narrative summarizing which pointers were addressed, which persist, and any notable regressions or integrity adjustments from prior loops. Raw outputs from loops older than N-1 are not forwarded. Downstream agents always receive the current loop's full uncondensed agent outputs; condensation applies only to the user-facing display (see "Output Verbosity Control") and the prior-loop summary narrative. The orchestrator produces both artifacts via prompt instruction: the summarization prompt asks the LLM to generate the narrative summary given the previous loop's full outputs, and the score trend array is mechanically assembled by the orchestrator from the per-loop integrity-checked composite scores (no LLM call required for the array). A known risk of LLM-generated summarization is **condensation infidelity** -- the summary may omit, distort, or hallucinate information relative to the source material. Maynez et al. [52] systematically categorize faithfulness errors in abstractive summarization (intrinsic hallucinations that contradict the source and extrinsic hallucinations that introduce unsupported information), and Tang et al. [53] demonstrate through TofuEval that even state-of-the-art LLMs produce topic-focused summaries with measurable hallucination rates. For this pipeline, the primary risk is that a prior-loop summary might omit a persistent pointer or mischaracterize a regression, causing downstream agents to miss context. The mitigation is structural: the score trend array is mechanically assembled (not LLM-summarized) and provides a factual cross-check against the narrative summary, and the most recent loop's full outputs are always forwarded unabridged, limiting the summarization risk to loops older than N-1.

**Document growth across loops.** The Drafter adds content each loop -- approximately 280 words (~370 tokens) on average, as observed in the worked example (Appendix A, loop 2). Over a 7-loop run, this adds roughly 2K tokens to the document, which compounds with the per-agent input loads described in the table above (those estimates reflect the initial document size at loop 2). The orchestrator should monitor cumulative document growth and emit a warning if the estimated Drafter input (Agent 5, the heaviest context consumer) exceeds 75% of the model's effective context window. For documents that grow beyond the long-document threshold (~20 pages / ~25K tokens) during the review session -- even if they started below it -- the orchestrator should activate section-level chunking strategies mid-session (see "Long documents" below) rather than waiting for a context-window overflow.

**Minimum context window.** Agents should use models with at least 32K token context windows (e.g., GPT-4-32K [45] or models with larger contexts such as Claude 3 [46]) for typical-length documents (up to ~10 pages). The heaviest agent (Drafter at loop 5+) may reach ~18-20K tokens of input for a 10-page document, leaving adequate headroom for the model's output generation within a 32K window.

**Long documents (>20 pages).** For documents exceeding approximately 20 pages (~25K tokens), the per-agent input loads described above may approach or exceed 32K tokens, particularly for Agent 3 and Agent 5. In this regime, the orchestrator should apply additional strategies: (a) section-level chunking -- where agents process the document in sections and the orchestrator merges per-section outputs, following the retrieval-augmented chunking strategies analyzed by Xu et al. (2024) [34], who demonstrate that section-level partitioning with overlap preserves cross-section coherence better than fixed-length windowing (Gao et al. [38] provide a broader survey of retrieval-augmented generation techniques, including chunking and retrieval strategies applicable to long-document processing); (b) more aggressive summarization of prior-loop context, reducing the prior-loop summary to key pointers only; or (c) requiring models with 64K+ context windows. An et al. (2024) [35] provide benchmarks for long-context LLM performance (L-Eval) that can inform model selection when documents exceed the typical context budget. The grounding prompt should note if the document is unusually long so agents can prioritize the most critical sections.

**Pipeline-level operational analysis.** A single review loop dispatches 5 sequential agents (plus optional Creative Agent spawns). With the minimum of 3 loops, this requires at least 15 LLM calls; a typical 5-loop review dispatches 25 base calls. The following estimates assume a 5-page document (~4K tokens) and GPT-4-class pricing (~$0.03/1K input tokens, ~$0.06/1K output tokens) as of early 2024. Token counts are derived from the per-agent prompt template analysis in the context management table above; cost figures are illustrative and will vary with model provider and pricing changes:

- **Total LLM calls per 5-loop run:** 25 base calls (5 agents x 5 loops). Creative Agent spawns add 1-2 calls per invocation (typically 2-4 per run for documents with niche topics). Agent 3 (Evaluator) may receive up to 3 re-dispatches per loop in the worst case: 1 for mechanical check failure (e.g., insufficient pointer count), 1 for an integrity FAIL verdict from Agent 4, and 1 for an EVALUATOR_CAPABILITY_FAILURE escalation. Across 5 loops, worst-case re-dispatches add up to 15 additional calls (3 per loop x 5 loops), though typical runs see 2-5 re-dispatches total.
- **Token budget per loop:** Summing per-agent input loads from the context management table (~8K + ~9K + ~12K + ~11K + ~14K = ~54K input tokens per loop) plus estimated output (~2K per agent x 5 = ~10K output tokens per loop). Per-loop cost estimate: ~$1.60 input + ~$0.60 output = ~$2.20/loop. A 5-loop run costs approximately $11 in LLM calls at these rates, excluding Creative Agent spawns and re-dispatches.
- **Re-dispatch cost cascade (worst case):** When Agent 3 receives all 3 re-dispatches in a single loop, the token overhead is approximately: 3 x ~12K input + 3 x ~2K output = ~42K additional tokens, costing ~$1.26 input + ~$0.36 output = ~$1.62. This nearly doubles the per-loop cost for that loop. In a pathological run where Agent 3 is re-dispatched 3 times in every loop, total cost increases by ~$8.10 (5 loops x $1.62), bringing the run total to ~$19.
- **Latency budget:** Each agent call takes approximately 30-90 seconds depending on context length and model latency (empirical estimate based on internal testing with GPT-4 and Claude 3 at 10-15K token inputs; not derived from published benchmarks). A single loop with 5 sequential agents takes approximately 3-6 minutes wall-clock time. A 5-loop run takes approximately 15-30 minutes. Re-dispatches add 1-2 minutes each. Creative Agent spawns add 30-60 seconds each. Users should plan for a maximum of ~45 minutes for a 5-loop run with moderate re-dispatches.

Users should expect wall-clock times measured in minutes per loop (depending on document length and model latency) and plan token budgets accordingly. The grounding prompt should note any cost constraints so agents can prioritize high-impact feedback.

---

## The 8 Evaluation Dimensions

### Dimension selection rationale

The dimensions are drawn from three complementary evaluation frameworks, each contributing criteria that map to specific document quality concerns. The overall approach of using multiple weighted dimensions for LLM-based evaluation follows the methodology established by rubric-based LLM evaluation research: Liu et al.'s G-Eval [26] demonstrated that decomposing evaluation into fine-grained criteria with chain-of-thought reasoning improves alignment with human judgments, and Kim et al.'s Prometheus [27] showed that training evaluator models on detailed, per-dimension rubrics produces more reliable and explainable scores than holistic assessment. Zheng et al. [6] separately demonstrated through MT-Bench and Chatbot Arena that pairwise comparison and multi-turn evaluation with explicit criteria produce more consistent LLM judgments than single-turn holistic scoring, providing complementary evidence for structured evaluation approaches.

1. **Academic peer review criteria.** The NeurIPS 2024 reviewer guidelines [3] structure evaluation around soundness, significance, novelty, and clarity. These map directly to dimensions 1 (Evidential grounding), 3 (Logical coherence), 7 (Originality), and 6 (Clarity). The explicit rubric used by thousands of reviewers annually provides empirical grounding for separating these concerns.

2. **Software engineering empirical standards.** Ralph et al. [4] define quality criteria for SE research including reproducibility, methodology rigor, and limitation acknowledgment. These contribute dimensions 8 (Reproducibility), 4 (Completeness), and 5 (Feasibility). The standards were developed through community consensus across the ACM SIGSOFT community.

3. **Requirements engineering quality frameworks.** Wieringa et al. (2006) provide a classification taxonomy for RE research that distinguishes problem investigation, solution design, and validation approaches. This classification scheme informs dimension 2 (Problem framing) by highlighting the distinction between problem-space and solution-space artifacts. Empirical studies of RE practice -- notably Hall et al. (2002) [20], who analyzed requirements problems across twelve software companies, and Mendez Fernandez et al. (2017) [22], who surveyed practitioners across 228 organizations -- consistently identify problem-related issues (incomplete requirements, ambiguous scope, inadequate stakeholder involvement) as among the most prevalent and costly RE failures. This reinforces the importance of explicit scoping, constraints, and non-goals in dimension 4 (Completeness).

### Weight derivation

Weights reflect the pipeline's research-driven purpose and are informed by the following considerations:

| #   | Dimension                             | Weight | Derivation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Evidential grounding**              | 0.20   | Highest weight because the pipeline's primary value proposition is research grounding. A well-structured document with unfounded claims fails the pipeline's core purpose. Anchored to the "Soundness" criterion in NeurIPS reviews [3], which structures evaluation around soundness as a primary criterion in acceptance decisions.                                                                                                                                                                                                                                               |
| 2   | **Problem framing**                   | 0.15   | Second tier: a well-grounded document that solves the wrong problem is useless. Empirical RE studies find that problem-related issues -- incomplete requirements, ambiguous scope, and inadequate problem understanding -- are among the most frequently reported requirements engineering failures (Hall et al., 2002 [20]; Mendez Fernandez et al., 2017 [22]). Wieringa et al. (2006) [5] separately classify RE artifacts along a problem-investigation vs. solution-design axis, reinforcing the importance of evaluating problem framing independently from solution quality. |
| 3   | **Logical coherence**                 | 0.15   | Second tier alongside problem framing: sound evidence supporting incoherent reasoning produces unreliable conclusions. Corresponds to the "Logical soundness" criterion weighted equally with "Significance" in NeurIPS reviews [3].                                                                                                                                                                                                                                                                                                                                                |
| 4   | **Completeness**                      | 0.12   | Third tier: an incomplete document that is correct in what it covers is more useful than a complete document with wrong conclusions. Weight reflects Ralph et al.'s [4] treatment of completeness as important but treated as a prerequisite for methodological rigor rather than a standalone quality indicator.                                                                                                                                                                                                                                                                   |
| 5   | **Feasibility and risk**              | 0.12   | Third tier alongside completeness: critical for plan documents where implementation follows directly from the plan. Ralph et al. [4] include feasibility assessment within their empirical standards for software engineering research, supporting its treatment as a core evaluation dimension.                                                                                                                                                                                                                                                                                    |
| 6   | **Clarity and structure**             | 0.10   | Fourth tier: important for adoption but subordinate to substance. A groundbreaking but poorly formatted document is more valuable than a well-polished but vacuous one.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | **Originality and contribution**      | 0.08   | Lowest tier: most plan documents (ADRs, RFCs) do not need to be original -- they need to be correct, complete, and well-grounded. Originality matters more for research summaries and can be emphasized through the grounding prompt.                                                                                                                                                                                                                                                                                                                                               |
| 8   | **Reproducibility and verifiability** | 0.08   | Lowest tier alongside originality: essential for scientific documents but less critical for operational plans. Weight can be effectively increased through the grounding prompt for research-heavy documents.                                                                                                                                                                                                                                                                                                                                                                       |

The cited frameworks justify the relative ordering of dimensions (e.g., evidential grounding above clarity) but do not prescribe exact numerical weights. The specific values (0.20, 0.15, 0.12, etc.) are practitioner-chosen defaults that operationalize the ranking into a convex combination. Users who disagree with the weighting can adjust emphasis through the grounding prompt, which instructs agents to apply greater scrutiny to specific dimensions during evaluation -- the grounding prompt shapes agent attention and qualitative focus, not the mathematical weights in the composite calculation.

**Weights sum to 1.00.** Scoring: 1-5 integer per dimension. Composite = sum(score_i \* weight_i).

---

## Convergence Logic

The convergence logic uses a two-phase approach: (1) a **target-reaching phase** where the pipeline iterates until the composite score reaches the configurable `--target` threshold (default 4.0), and (2) a **plateau-detection phase** where the pipeline continues iterating beyond the target until the score plateaus or max_loop is reached. This two-phase design prevents the convergence ceiling problem -- where a fixed exit threshold caps achievable document quality at the target score -- identified by Yang et al. [47] (noting that [47] models single-agent self-correction; the application to this multi-agent pipeline is an extrapolation, since the multi-agent feedback loop introduces inter-agent dynamics not captured by the single-agent convergence model), who model iterative LLM self-correction as Acc_t = Upp - alpha^t(Upp - Acc_0) and show that a hard ceiling at any fixed threshold prevents the system from approaching its upper performance bound. The pipeline also includes safety mechanisms (oscillation detection, near-threshold exit) to prevent both infinite loops and premature exits.

### Threshold rationale

The default convergence target of 4.0 (configurable via `--target`) and the near-threshold floor of 3.8 (always 0.2 below the target) are practitioner-chosen defaults motivated by LLM scoring variance research. Stureborg et al. [19] and Chiang & Lee [18] demonstrate that LLM scoring is noisy and inconsistent across re-evaluations, with scores for identical inputs varying meaningfully between runs. (Stureborg et al. [19] is an arXiv preprint with growing but sub-50 citation count as of this writing; it is included because its findings on scoring inconsistency are directly relevant and corroborated by the peer-reviewed Chiang & Lee [18] findings. The pipeline's <50-citation rejection heuristic applies to sources backing document claims, not to the pipeline's own design rationale, where practitioner judgment applies.) This motivates a buffer between the convergence target and the near-threshold floor. The default target of 4.0 and the near-threshold floor of 3.8 have a gap of 0.2 that provides tolerance for scoring noise while maintaining meaningful quality thresholds. A target of 4.0 ("good" on the scale) represents a score that is meaningfully above the midpoint (3.0) -- a document scoring 4.0 is unlikely to be a "mediocre" document that was lucky with scoring noise. The near-threshold floor (always target - 0.2) allows a document that has plateaued within scoring noise of the target to exit rather than loop indefinitely. Reaching the target no longer triggers immediate exit; instead, the pipeline enters a plateau-detection phase where it continues iterating to push quality higher until the score stabilizes (see pseudocode below). This addresses the convergence ceiling identified by Yang et al. [47]: in their model of iterative self-correction, a hard exit at any fixed threshold prevents the system from approaching its theoretical upper bound; plateau-based continuation allows the pipeline to capture diminishing but real improvements above the target. The target and floor are configurable via `--target`; the key constraint is that the gap between target and floor should be small enough to catch documents within scoring noise of the target, but large enough that the two thresholds are not operationally identical.

### Secondary threshold rationale

Four additional numeric thresholds (part of the 9-threshold system consolidated in the Threshold Calibration Framework below) govern safety mechanisms in the convergence logic. Like the primary thresholds above, these are practitioner-chosen defaults informed by the same LLM scoring variance research (Stureborg et al. [19]; Chiang & Lee [18]). Each is a tunable parameter, not a hard theoretical constraint.

- **Oscillation window = 3 consecutive loops with amplitude filter.** Oscillation detection triggers when the composite score alternates direction (up, down, up or down, up, down) for 3 consecutive loops, subject to a minimum amplitude filter: each alternating step must have |delta| >= 0.1 to count toward the oscillation window. Steps with |delta| < 0.1 reset the alternation counter, because sub-0.1 movements are within the noise floor identified by the plateau detector and do not constitute meaningful directional changes. A delta of exactly 0.0 also resets the alternation counter (it counts as neither up nor down). The amplitude filter aligns with Astrom & Murray's [57] amplitude-qualified oscillation detection: in classical feedback systems, oscillation is defined not merely by direction alternation but by sustained amplitude above a noise threshold. Without the amplitude filter, a sequence like 3.50 -> 3.55 -> 3.52 -> 3.57 (alternating with |delta| values of 0.05, 0.03, 0.05) would falsely trigger oscillation detection despite all movements falling within the plateau detector's noise floor -- this resolves the contradiction between the oscillation and plateau detectors' treatment of sub-0.1 score changes. The window of 3 requires observing at least one full period (two direction reversals, producing a minimum of 3 data points). A window of 2 would conflate normal single-dip recovery with genuine oscillation; a window of 4+ would waste cycles. Smit et al. [56] provide additional justification: their finding that multi-agent debate does not reliably outperform simpler strategies supports conservative oscillation detection rather than allowing extended debate-like flip-flopping. This is a tunable default; documents with high scoring variance may benefit from a wider window.

- **Single-dimension blocker relaxation at composite >= target + 0.2 (default 4.2).** After loop 4, if the composite score reaches target + 0.2 but one dimension remains below 3, condition 2 (no dimension below 3) is downgraded to a user-visible warning (rather than remaining a hard block). The threshold is set 0.2 above the convergence target, requiring the document to meaningfully exceed the target on aggregate before the single-dimension block is relaxed. If set equal to the target, a document could converge with a weak dimension without demonstrating compensating strength elsewhere. If set much higher (e.g., target + 0.5), the relaxation would rarely trigger, defeating its purpose as a safety valve. Note that this relaxation is most useful for low-weight dimensions (dimensions 7 and 8 at 0.08 weight each), since achieving a target + 0.2 composite with a high-weight dimension at 2 requires the remaining dimensions to average approximately 4.75 -- a condition that is arithmetically possible but unlikely in practice. This threshold auto-adjusts with `--target`. This is a tunable default.

- **Regression detection at delta > 0.2.** The orchestrator flags a regression warning when the composite drops by more than 0.2 between consecutive loops. This threshold is informed by the same scoring noise range identified in the primary threshold rationale: Stureborg et al. [19] show that LLM scoring varies meaningfully between runs, and a drop of 0.2 or less could reflect noise rather than genuine regression. A drop exceeding 0.2 is more likely to indicate that the Drafter's changes caused substantive harm. If set lower (e.g., 0.1), normal scoring variance would trigger frequent false-positive warnings. If set higher (e.g., 0.4), genuine regressions could go undetected for a full loop. This is a tunable default.

- **Plateau detection at delta < 0.1 for 2 consecutive loops.** A plateau is detected when the absolute score change is less than 0.1 for 2 consecutive loops. The 0.1 threshold represents the point below which score changes are likely noise rather than improvement, consistent with the scoring variance findings above. Two consecutive loops (rather than one) are required to distinguish a genuine plateau from a single stalled loop that might recover. If the delta threshold were set higher (e.g., 0.2), genuine incremental improvements would be misclassified as plateaus. If only 1 loop were required, a single noisy evaluation could trigger a premature exit. This is a tunable default.

### Threshold Calibration Framework

The pipeline uses 9 distinct numeric thresholds across the convergence logic, safety mechanisms, and agent spawning conditions. Each is individually justified in the sections above, but they form a coupled system: adjusting one threshold may affect the behavior of others. The following table consolidates all numeric thresholds, their current values, derivation basis, and inter-threshold interactions.

| Threshold                             | Value                                                                                                                   | Derivation basis                                                         | Interacts with                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Convergence target (composite)        | 4.0 (configurable via `--target`, range 3.0-5.0)                                                                        | See "Threshold rationale"; [18], [19], [47]                              | Near-threshold floor, single-dimension blocker relaxation, plateau-detection phase |
| Near-threshold floor                  | target - 0.2 (default 3.8)                                                                                              | See "Threshold rationale"; [18], [19]                                    | Convergence target, plateau detection delta, persistent Major pointer exit         |
| Regression detection delta            | > 0.2                                                                                                                   | See "Secondary threshold rationale"; [18], [19]                          | Plateau detection delta, REGRESSION_CONTEXT trigger                                |
| Plateau detection delta               | < 0.1 for 2 consecutive loops                                                                                           | See "Secondary threshold rationale"; [19]                                | Near-threshold exit (requires plateau), regression detection delta                 |
| Oscillation window                    | 3 consecutive alternating loops, each step                                                                              | delta                                                                    | >= 0.1                                                                             | See "Secondary threshold rationale"; [56], [57] | Convergence target (oscillation exit selects best-scoring version), plateau detection delta (amplitude filter uses same 0.1 noise floor) |
| Single-dimension blocker relaxation   | Composite >= target + 0.2 (default 4.2), after loop 4                                                                   | See "Secondary threshold rationale"                                      | Convergence target, near-threshold floor                                           |
| Ungroundable claim threshold          | > 40% of significant claims                                                                                             | See "Pipeline-level ungroundable threshold"                              | Evidential Grounding cap (3/5), Creative Agent spawn thresholds                    |
| Creative Agent spawn thresholds       | Agent 1: 3+ NO_SOURCE_FOUND; Agent 2: 2+ confirmed NO_SOURCE_FOUND; Agent 5: 1+ Major pointer requesting absent content | See "Dynamic Agent Spawning"                                             | Ungroundable claim threshold, per-loop spawn cap (2)                               |
| Blind spot check false positive range | 25-42%                                                                                                                  | See "Blind spot check false positive disclosure"; [18], [19], [21], [55] | Blind spot check trigger (2-point discrepancy), CHECKER_SILENT_FAILURE advisory    |

These thresholds interact as a system. For example, lowering the convergence target from 4.0 to 3.5 without also lowering the near-threshold floor would widen the near-threshold exit window, potentially allowing more documents to exit at sub-target quality. Similarly, tightening the regression detection delta from 0.2 to 0.1 would generate more regression warnings, some of which would be false positives caused by normal scoring variance -- and if the Drafter receives frequent REGRESSION_CONTEXT blocks for noise-driven regressions, it may over-correct by becoming excessively conservative. The Creative Agent spawn thresholds interact with the ungroundable claim threshold: if the ungroundable threshold is lowered (e.g., to 25%), the pipeline-level advisory fires earlier, but the Creative Agent spawn thresholds (which are count-based, not percentage-based) remain unchanged, potentially leaving a gap where the advisory is active but too few claims meet the spawn threshold.

**Empirical calibration recommendation.** All thresholds are practitioner-chosen starting points. After 10 pipeline runs across varying documents, measure: (a) false-positive regression warnings (composite recovered within 0.1 in the next loop); (b) false-positive oscillation detections; (c) unnecessary Creative Agent spawns (claims later grounded by standard pipeline); (d) premature near-threshold exits (document reached target within one more loop when manually continued) and delayed exits (looped to max despite stable quality with variance < 0.15 across final 3 loops). A **premature exit** is operationally defined as a pipeline run where: (i) the pipeline exited via near-threshold or oscillation exit before max_loop, and (ii) when manually continued for one additional loop, the composite score exceeded the target. This definition distinguishes genuine premature terminations from cases where the pipeline correctly identified a plateau or oscillation pattern. (One additional loop balances measurement cost against detection accuracy; a two-loop horizon would catch more premature exits but doubles calibration cost per run.) **Action thresholds:** false-positive regression rate > 30%: increase delta from 0.2 to 0.3; premature exit rate > 20%: tighten floor to 3.85 or require 3 plateau loops; false-positive oscillation rate > 25%: widen window from 3 to 4. Premature exits get the tightest threshold (20%) because they terminate with a sub-target document; regression warnings and oscillation detections (30%, 25%) are recoverable.

**Model-family dependency note.** Scoring variance data from [18] and [19] was measured on specific model families. Different LLM families exhibit different noise profiles (Wang et al. [39]; Ye et al. [40] show per-dimension variance differs meaningfully across models via FLASK). Consequences: (a) threshold values may not transfer across model families without recalibration; (b) the 10-run calibration should be repeated on model switch; (c) organizations using multiple model backends should maintain per-model calibration baselines; (d) relative threshold ordering should remain stable, but absolute gaps may need adjustment.

### Exit condition precedence

When multiple exit conditions are satisfiable in the same loop, the orchestrator applies the following precedence order. The first matching condition determines the exit path and version selection:

1. **Above-target plateau convergence** (target reached + score plateaued) -- exits with the current version. This is the primary exit path for documents that reach the target: the pipeline continues iterating beyond the target until the score stabilizes, then exits. See "Convergence Logic" pseudocode for the plateau-detection phase.
2. **Oscillation detection** -- exits with the best-scoring version (not necessarily the current one), because oscillation indicates the loop is not making stable progress.
3. **Near-threshold exit** -- exits with the current version and flags the sub-target score to the user.
4. **Regression-plateau exit** -- exits with the best-scoring version when the score has been declining or stagnant below the target for 2 consecutive loops after at least 4 loops. This condition serves as a safety net for documents that briefly reach quality criteria but then regress: if conditions 1-3 of the primary criteria were met in a prior loop but the current composite has dropped below the target and delta < 0.1 for the last 2 loops, the pipeline exits with the best-scoring version rather than continuing to degrade. This replaces the prior "standard plateau detection" condition, which was nearly redundant with condition 1.
5. **Persistent Major pointer exit** -- after loop 5, if composite >= near_floor and only 1 Major pointer persists for 2 consecutive loops, presents the document to the user with the Major pointer highlighted. The user decides whether to accept or continue. This is the lowest-precedence exit: it fires only when no other exit condition is met, ensuring the pipeline exhausts all automated improvement paths before escalating to the user. This condition addresses the edge case where a document is near target quality but one stubborn Major pointer resists automated resolution -- rather than looping to max_loop with no progress on that pointer, the pipeline surfaces the issue for human judgment.

This ordering ensures that plateau-based convergence above the target is always preferred, that oscillation detection preserves the best work product rather than the latest, that near-threshold and regression-plateau exits serve as progressively broader safety nets, and that the persistent Major pointer exit serves as a final escalation to the user when automated improvement has been exhausted. The five conditions span the full range of exit scenarios: successful convergence (1), unstable oscillation (2), near-miss plateau (3), post-target regression (4), and single-pointer stall (5).

```python
loop = 0
converged = false
target = args.target or 4.0       # configurable via --target (range 3.0-5.0)
near_floor = target - 0.2         # always 0.2 below target
target_reached_at = None          # loop number when target was first reached
best_score = 0.0
best_version = None

while loop < max_loop and not converged:
    loop += 1

    # Run 5 agents sequentially
    dispatch Research Reviewer (Agent 1)
    dispatch Researcher Validator (Agent 2)
    dispatch Evaluator (Agent 3)
    dispatch Integrity Checker (Agent 4)

    if integrity_verdict == "FAIL":
        re-dispatch Evaluator with integrity failures as context
        re-dispatch Integrity Checker on corrected output
        # max 1 re-run; if still FAIL, use Integrity Checker's adjustments

    dispatch Drafter (Agent 5) with integrity-checked evaluation

    # Track best-scoring version across all loops
    if composite > best_score:
        best_score = composite
        best_version = current_document

    # Convergence uses the INTEGRITY-CHECKED scores (not raw Evaluator scores)
    if loop >= 3:  # HARD MINIMUM: 3 full cycles

        # Phase 1: Check if target quality criteria are met this loop
        quality_criteria_met = ALL of:
          1. Weighted composite >= target (integrity-adjusted)
          2. No dimension scored below 3 (integrity-adjusted)
          3. No Critical or Major pointers remain (only Minor)

        # Track when the target is first reached
        if quality_criteria_met and target_reached_at is None:
            target_reached_at = loop

        # Phase 2: Exit precedence (first matching condition wins)
        # above-target-plateau > oscillation > near-threshold > regression-plateau > persistent-major-pointer

        # (1) Above-target plateau convergence -- highest precedence
        # Once target is reached, continue until score plateaus.
        # Yang et al. [47] show that hard exit at target creates a
        # convergence ceiling; plateau detection captures diminishing
        # but real improvements above the target.
        if quality_criteria_met
          AND delta < 0.1 for 2 consecutive loops:
          converge with current version.
          Report: "Document converged at {score}/5.0 (target: {target}).
           Score plateaued after {loop - target_reached_at} additional
           loops above target."

        # (2) Oscillation detection -- second precedence
        # Prevents score flip-flopping; preserves best version.
        # Amplitude-qualified: each alternating step must have
        # |delta| >= 0.1 to count. Sub-0.1 steps and delta == 0.0
        # reset the alternation counter (they fall within the
        # plateau detector's noise floor, not genuine oscillation).
        # Aligns with Astrom & Murray [57] amplitude-qualified
        # oscillation detection.
        Oscillation detection: if scores alternate up/down for 3
          consecutive loops (e.g., 3.5 -> 3.8 -> 3.5 -> 3.8)
          AND each step has |delta| >= 0.1
          AND loop >= 4:
          Force exit. Report: "Score oscillation detected across
          loops {N-2} to {N}. Presenting best-scoring version."
          Use best_version.

        # (3) Near-threshold exit -- third precedence
        # A document stuck just below the target that meets all other
        # criteria and has plateaued should exit rather than loop
        # indefinitely.
        near_threshold_exit if ALL of:
          1. Weighted composite >= near_floor (but < target)
          2. No dimension scored below 3
          3. No Critical or Major pointers remain
          4. delta < 0.1 for 2 consecutive loops
          5. loop >= 4  # extra cycle beyond minimum
        On near-threshold exit: flag to user:
          "Document scored {score}/5.0, below the {target} target but
           stable with no Major/Critical issues. Presenting for review."

        # (4) Regression-plateau exit -- fourth precedence
        # Safety net for documents that reached quality criteria in a
        # prior loop but have since regressed and stagnated.
        if target_reached_at is not None
          AND composite < target
          AND delta < 0.1 for 2 consecutive loops
          AND loop >= 4:
          Force exit with best_version. Report:
          "Document reached {target} at loop {target_reached_at} but
           has since regressed to {score}. Presenting best-scoring
           version ({best_score}) from loop {best_version_loop}."

        # (5) Persistent Major pointer exit -- after loop 5, if composite
        #     >= near_floor and only 1 Major pointer persists for 2
        #     consecutive loops, present to user with the Major pointer
        #     highlighted (see edge case table).
        if loop >= 5 and composite >= near_floor
          and exactly 1 Major pointer persists for 2 consecutive loops:
          Present document to user with the persistent Major pointer
          highlighted. User decides whether to accept or continue.

    else:
        report: "Loop {loop}/3 minimum -- continuing regardless of scores."
```

### Convergence edge cases and mitigations

| Edge case                                      | Risk                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| **Near-threshold trap**                        | Document at composite target - 0.05 (e.g., 3.95 at default target) meets conditions 2-3 but not condition 1. The pipeline does not enter plateau-detection phase above target.                                    | Near-threshold exit: at composite >= near_floor with 2 consecutive plateaus at loop >= 4, force convergence and flag to user.                                                                                                                                                                                                                                                                                                                                                            |
| **Mid-range plateau (below near_floor)**       | Document plateaus at a composite more than 0.2 below the target. Too low for near-threshold exit and too low for above-target plateau. The only exit path is max_loop.                                            | This is the intentional design: a document significantly below the target has not demonstrated sufficient quality for any graceful exit. The max_loop cap is the correct exit path -- it prevents infinite looping while signaling to the user that the document did not reach an acceptable threshold. On max_loop exit, the orchestrator reports the plateau and presents the best-scoring version with a recommendation for targeted human revision of the lowest-scoring dimensions. |
| **Convergence ceiling (target caps quality)**  | With a fixed exit-on-target, documents can never score above the target. The pipeline exits the moment the target is reached, preventing further improvement.                                                     | The plateau-detection phase addresses this: reaching the target triggers continued iteration rather than immediate exit. The pipeline keeps improving the document until the score stabilizes (delta < 0.1 for 2 consecutive loops) or max_loop is reached. Yang et al. [47] formally model this ceiling effect and show that plateau-based continuation is necessary to approach the system's upper performance bound.                                                                  |
| **Oscillating scores**                         | Evaluator and Drafter create a cycle where changes that fix one dimension regress another, causing scores to alternate without converging.                                                                        | Oscillation detection: if composite score alternates direction with                                                                                                                                                                                                                                                                                                                                                                                                                      | delta | >= 0.1 per step for 3 consecutive loops at loop >= 4, force exit with the best-scoring version. The amplitude filter ( | delta | >= 0.1) prevents false triggers from noise-level fluctuations. |
| **Single-dimension blocker**                   | One dimension persistently scores 2/5 while all others score 4+. Composite may reach the target but condition 2 (no dimension below 3) prevents entering the plateau-detection phase.                             | After loop 4: if composite >= target + 0.2 and only one dimension is below 3, downgrade condition 2 to a user-visible warning rather than a hard block. User can choose to accept or continue.                                                                                                                                                                                                                                                                                           |
| **Drafter regression**                         | Drafter's changes inadvertently lower the composite by > 0.2. Detected by stall detection but does not prevent the loop from continuing with a worse document.                                                    | On regression > 0.2: warn the user and offer the previous version as an alternative. Track the best-scoring version separately from the latest version. The regression-plateau exit (condition 4) provides an additional safety net for documents that regress after reaching the target.                                                                                                                                                                                                |
| **Integrity re-run loop**                      | Evaluator fails integrity check, is re-run, and fails again.                                                                                                                                                      | Hard cap: maximum 1 re-run per loop. On second failure, proceed with Integrity Checker's adjustments and flag to user.                                                                                                                                                                                                                                                                                                                                                                   |
| **High-quality with persistent Major pointer** | Document at composite near_floor to target - 0.01 with one remaining Major pointer. Near-threshold exit requires no Major pointers; above-target plateau requires composite >= target. Neither exit path applies. | After loop 5: if composite >= near_floor and only 1 Major pointer remains for 2 consecutive loops, present the document to the user with the specific Major pointer highlighted, letting the user decide whether to accept or continue.                                                                                                                                                                                                                                                  |
| **Post-target regression**                     | Document reaches the target and enters plateau-detection phase, but subsequent Drafter changes cause the score to drop back below the target.                                                                     | The regression-plateau exit (condition 4) handles this: if the document reached the target in a prior loop but has since regressed and stagnated (delta < 0.1 for 2 loops), the pipeline exits with the best-scoring version rather than continuing to degrade.                                                                                                                                                                                                                          |
| **Simultaneous exit triggers**                 | Multiple exit conditions (e.g., near-threshold and oscillation) are satisfiable in the same loop, each selecting a different document version.                                                                    | Explicit precedence ordering: above-target plateau > oscillation > near-threshold > regression-plateau > persistent Major pointer. First match wins. See "Exit condition precedence" above.                                                                                                                                                                                                                                                                                              |

---

## Output Verbosity Control

**Generation verbosity vs. display verbosity.** The verbosity problem in a multi-agent pipeline has two distinct facets: (a) **generation verbosity** -- agents producing more tokens than necessary to convey their findings, padding output with boilerplate, hedging, or redundant restatements; and (b) **display verbosity** -- users being presented with more output than they need to understand the pipeline's progress and results. This section addresses display verbosity: controlling how much of the agents' structured output is surfaced to the user. Generation verbosity is intentionally not constrained because agents need full-fidelity output for downstream consumption -- Agent 3 (Evaluator) requires Agent 1's complete claims inventory to cross-check coverage, Agent 4 (Integrity Checker) requires the Evaluator's full evidence quotations and justifications to audit, and Agent 5 (Drafter) requires the complete pointer list and bibliography to make informed revisions. Truncating agent output at the generation stage would degrade downstream agent performance. The `--summary` mode addresses the user-facing problem by condensing agent output for display while preserving full output in the inter-agent pipeline.

Pipeline runs produce substantial output -- five agents per loop, each generating structured reports with claims inventories, bibliographies, score tables, pointer lists, integrity audits, and revision changelogs. For a 5-loop run, this can exceed 50,000 tokens of agent output presented to the user. Research on LLM evaluation biases -- Wu & Aji [50] (COLING 2025) demonstrate that LLM evaluators systematically prefer longer, more stylistically elaborate outputs regardless of substantive quality ("style over substance"), while Zheng et al. [6] corroborate this in the LLM-as-judge context, showing that verbosity bias affects evaluation reliability. Earlier work by Saito et al. [48] and Hu et al. [49] identified and characterized this length-preference bias in LLM preference labeling. The pipeline addresses this through a configurable verbosity mode and agent-level output structuring.

### Verbosity modes

The `--verbose` and `--summary` flags control how much agent output is displayed to the user. Both modes preserve the full agent output internally -- downstream agents always receive complete structured data regardless of the display mode.

| Mode                  | Flag                   | Behavior                                                                                                                                                                                                                     |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verbose** (default) | `--verbose` or omitted | Full agent output displayed after each agent dispatch. All structured sections (claims inventory, bibliography, score tables, pointers, integrity audit, revision changelog) shown in full. This is the current v4 behavior. |
| **Summary**           | `--summary`            | Each agent's output is reduced to a structured summary before display. Full output is preserved internally for downstream agents.                                                                                            |

### Summary mode specifications

In `--summary` mode, each agent's displayed output is condensed using the following per-agent rules. The condensation is performed by the orchestrator (not by the agents themselves) so that agents can operate at full fidelity without concern for display constraints.

**Condensation mechanism.** Summary mode condensation uses **rule-based extraction** from the agents' structured markdown output -- it is not LLM-based summarization. The orchestrator parses known markdown patterns in each agent's output (e.g., `#### Claim C{loop}.{N}:`, `**Severity:**`, `**Verification:**`, dimension score tables, `### Revision Statistics` sections) and extracts the specific fields listed in the per-agent summary rules table below. This extraction is deterministic and zero-cost (no additional LLM calls). The rule-based approach avoids the condensation infidelity risk discussed for inter-loop summaries (Maynez et al. [52], Tang et al. [53]): because the orchestrator extracts verbatim fields rather than generating abstractive summaries, the condensed output cannot omit, distort, or hallucinate information. The distinction is important: inter-loop summaries (the prior-loop narrative described in "Context management") necessarily use LLM-based summarization because they must synthesize across agent outputs; display condensation can be purely mechanical because it reduces a single agent's structured output to a subset of its fields.

| Agent                     | Summary display                                                                                                                                                                   | Extraction patterns                                                                                                                                                                                                                              | Full output preserved for |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1 -- Research Reviewer    | Number of claims inventoried, number with NO_SOURCE_FOUND, top 3 source proposals by priority. Meta-review condensed to 1-sentence verdict.                                       | Count `#### Claim C{loop}.{N}:` headings; count `NO_SOURCE_FOUND` verdicts; extract first 3 source proposal blocks; extract first sentence of `### Meta-Review` section.                                                                         | Agents 2, 3, 5            |
| 2 -- Researcher Validator | Per-source verdict counts (N CONFIRMED, N REPLACED, N REJECTED, N UNVERIFIABLE, N NO_SOURCE_FOUND). Only REJECTED and NO_SOURCE_FOUND sources listed by name.                     | Count occurrences of each verdict keyword in source entry blocks; extract source name field for REJECTED and NO_SOURCE_FOUND entries.                                                                                                            | Agents 3, 4, 5            |
| 3 -- Evaluator            | Dimension scores table (always shown in full). Composite score and delta. Pointer count by severity. Only Critical and Major pointers shown; Minor pointers listed as count only. | Extract full scores table (delimited by `\|` table rows); extract composite from summary line; count `**Severity:** Critical`, `**Severity:** Major`, `**Severity:** Minor` occurrences; extract full text of Critical and Major pointer blocks. | Agents 4, 5               |
| 4 -- Integrity Checker    | Integrity verdict (PASS/CORRECTED/FAIL). Number of challenged dimensions. Blind spot check result (1-line summary). Only CHALLENGED items shown in detail.                        | Extract `### Integrity Verdict` line; count CHALLENGED entries in `### Integrity Audit` table; extract `### Blind Spot Check` table first row summary; extract full `### Challenged Items` section.                                              | Agent 5                   |
| 5 -- Drafter              | Revision statistics table (always shown in full). Changelog condensed to pointer-addressed list (1 line per pointer).                                                             | Extract full `### Revision Statistics` section; for each pointer reference in changelog, extract first line (pointer ID + action taken).                                                                                                         | Next loop                 |

**Reduction estimate derivation.** Using the worked example token counts from Appendix A (loop 2), the per-agent verbose output totals approximately 11,100 tokens (2,100 + 1,800 + 2,400 + 1,600 + 3,200). Under summary mode extraction rules: Agent 1 reduces from ~2,100 to ~400 tokens (claim count + NO_SOURCE_FOUND count + 3 source proposals at ~100 tokens each + 1-sentence meta-review); Agent 2 reduces from ~1,800 to ~300 tokens (5 verdict counts + 2 named sources); Agent 3 reduces from ~2,400 to ~900 tokens (full scores table ~300 tokens + composite line + 2 Major pointers at ~200 tokens each + Minor count line); Agent 4 reduces from ~1,600 to ~400 tokens (verdict line + challenged count + blind spot summary + 0 challenged item details in this loop); Agent 5 reduces from ~3,200 to ~500 tokens (statistics table ~200 tokens + 4 pointer-addressed lines at ~75 tokens each). Summary total: ~2,500 tokens. Reduction: ~8,600 of ~11,100 tokens = ~77%, consistent with the 60-75% range (the range accounts for loops with more Critical/Major pointers and more challenged items, which increase the summary size).

### Progressive disclosure

In both modes, the orchestrator provides a **loop summary** after each complete loop iteration:

```
=== Loop {N}/{max_loop} complete ===
Composite: {score}/5.0 (delta: {delta})  Target: {target}
Pointers: {critical}C / {major}M / {minor}m  |  Sources: +{new} -{removed} ~{replaced}
Status: {ITERATING | TARGET_REACHED_CONTINUING | NEAR_THRESHOLD | OSCILLATING | CONVERGED}
```

This summary is always displayed regardless of verbosity mode, providing the user with the essential loop-level signal without requiring them to parse individual agent outputs.

### Agent-level front-loading

Regardless of verbosity mode, all agents are instructed to **front-load key findings** in their output: the most important result (highest-severity pointer, most significant score change, critical integrity challenge) appears in the first 3 lines of the agent's output block, before the detailed structured sections. This design follows information foraging theory (Pirolli & Card [54]), which models users as rational foragers who allocate attention based on information scent -- placing the highest-value findings at the top of each agent's output maximizes the scent of the output block and reduces the cost of locating critical information. This ensures that even in `--verbose` mode, a user scanning the output can identify the most important information without reading the full agent report. The front-loaded summary follows a consistent format across agents:

```
### Agent {N} -- {Role}: Key Finding
{1-3 sentence summary of the most important result from this agent's work}
```

---

## Anti-Gaming Safeguards

Agents in a review loop can "game" their responsibilities -- inflating scores to converge faster, rubber-stamping sources, producing superficial pointers, or making cosmetic rather than substantive changes. The safeguards below are organized into two tiers:

### Tier 1: Mechanically enforceable checks

These safeguards can be verified by the orchestrator through deterministic inspection of agent output (string matching, count validation, structural checks). No LLM judgment is required. Note that Tier 1 checks enforce _structural_ compliance (e.g., "a quoted passage exists," "at least 3 pointer headings are present") but do not by themselves guarantee the _substantive_ quality of the content that passes the check -- an agent could produce three pointers that are structurally valid but intellectually shallow. The Tier 2 judgment-dependent safeguards, particularly the Integrity Checker's audits, cover this quality gap.

| Check                               | What the orchestrator validates                                                                                                                                                 | Enforcement action                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pointer count**                   | Count the `#### Pointer IP{loop}.{N}:` headings in the Evaluator's output. Must be >= 3.                                                                                        | If < 3: reject the output and re-dispatch the Evaluator with "You produced only N pointers. Minimum is 3. Add pointers for under-addressed dimensions."                                                    |
| **Major pointer in loops 1-3**      | For loops 1-3: at least one pointer heading must contain `**Severity:** Critical` or `**Severity:** Major`.                                                                     | If no Major/Critical found: reject and re-dispatch with "No Major or Critical pointer found. Loops 1-3 require at least one. If no Major issues exist, include a No Major Issues Justification paragraph." |
| **Evidence-backed high scores**     | For each dimension scored 4 or 5: check that the Evidence cell in the scores table contains a quoted string (text between quotation marks that is a substring of the document). | If a score of 4+ lacks a quoted substring match: flag to the Integrity Checker as a priority audit target.                                                                                                 |
| **Validator verification evidence** | For each source verdict: check that the output contains a `**Verification:**` field with non-empty content.                                                                     | If any verdict lacks verification evidence: treat that source as UNVERIFIABLE regardless of the stated verdict.                                                                                            |
| **Claims inventory minimum**        | Count the `#### Claim C{loop}.{N}:` headings in Agent 1's output. Must be >= 5.                                                                                                 | If < 5: reject and re-dispatch Agent 1 with "You inventoried only N claims. Minimum is 5 per loop."                                                                                                        |
| **Drafter statistics presence**     | Check that the Drafter's output contains a `### Revision Statistics` section with non-zero values for "Pointers addressed", "Sections modified", and "Approximate words added". | If statistics are missing or all zeros: flag "stalled improvement" warning to user.                                                                                                                        |
| **Convergence score source**        | The orchestrator uses only the integrity-adjusted composite (from Agent 4 output) for convergence decisions, never the raw Evaluator scores.                                    | Structural: the orchestrator extracts scores from the Integrity Checker's output block, not the Evaluator's.                                                                                               |

**Format compliance dependency.** Tier 1 checks depend on agents producing output in specific markdown patterns (e.g., `#### Pointer IP{loop}.{N}:`, `**Severity:** Major`). This is a prompt-level instruction, not an API-level structural guarantee (cf. JSON schema enforcement, OpenAI [15]). LLM instruction-following is high but not perfect (Zhou et al. [1]), so a check may fail due to format deviation rather than gaming. **Fallback behavior:** on parse failure, re-dispatch once with format correction. On second failure, proceed with best-effort extraction -- the orchestrator passes raw output as an unstructured text block to the next agent, noting which fields could not be extracted. This degradation pattern maps to MAST's [29] "inter-agent miscoordination" category, though the mapping is directional (see MAST applicability caveat in Agent Failure Escalation). MetaGPT [30] shows that SOP-encoded workflows are more resilient to partial output failures because structured role definitions provide fallback expectations.

**Downstream impact of best-effort mode.** When best-effort extraction activates, the downstream degradation depends on which agent failed: (1) Agent 1 unstructured: claims inventory minimum check suspended, Agent 2 cannot reliably identify individual `NO_SOURCE_FOUND` claims. (2) Agent 2 unstructured: ungroundable claim percentage cannot be computed, so the pipeline-level advisory cannot activate this loop. (3) Agent 3 unstructured: pointer-count, evidence-backed score, and severity checks are all suspended; Integrity Checker audits without structured fields. (4) Agent 4 unstructured: convergence tracking falls back to raw Evaluator scores or the previous loop's scores. In all cases, the orchestrator appends a `DEGRADED_MODE` flag to the loop metadata: "Agent {N} output could not be parsed after re-dispatch. Downstream checks are partially suspended for this loop."

### Tier 2: Judgment-dependent safeguards (inter-agent accountability)

These safeguards depend on one agent auditing another's work. They are effective to the degree that the auditing agent follows its instructions, which -- as with any LLM prompt -- is probabilistic rather than guaranteed. Research on multi-agent debate (Du et al. [12]; Khan et al. [7]; Chan et al. [14]) suggests that adversarial review by a separate agent improves factual accuracy over self-review, but does not eliminate errors.

| Risk                         | Gaming behavior                                          | Safeguard                                                                                                                                                                                                                                                                                                                                                      | Auditing agent                        | Known limitation                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shallow review**           | Research Reviewer flags only obvious claims              | Evaluator cross-checks claim inventory against document sections; flags uncovered sections                                                                                                                                                                                                                                                                     | Evaluator                             | Evaluator may also miss the same sections. Mitigated by the 5-claim minimum (Tier 1) as a floor.                                                   |
| **Rubber-stamp validation**  | Validator marks everything CONFIRMED                     | Verification evidence requirement (Tier 1) forces the Validator to show its work; Evaluator penalizes unverified sources in scoring                                                                                                                                                                                                                            | Evaluator + orchestrator              | Validator could fabricate plausible-sounding search summaries. WebSearch tool call logs provide a partial check if the orchestrator inspects them. |
| **Score inflation**          | Evaluator inflates scores to trigger convergence         | Quote-verification (Tier 1) catches missing evidence; Integrity Checker audits score-evidence alignment                                                                                                                                                                                                                                                        | Integrity Checker                     | Both Evaluator and Integrity Checker are LLMs with shared failure modes (see "Integrity Checker limitations" below).                               |
| **Superficial pointers**     | Evaluator produces trivial pointers to meet minimums     | Integrity Checker audits pointer actionability and severity calibration; Research Reviewer meta-review (rounds 2+) audits prior pointer quality                                                                                                                                                                                                                | Integrity Checker + Research Reviewer | Severity assessment is subjective. The mechanical pointer-count check (Tier 1) ensures quantity but not quality.                                   |
| **Fabricated quotes**        | Evaluator cites text that does not exist in the document | Orchestrator substring search (Tier 1) catches exact-match fabrication; Integrity Checker catches paraphrased misattribution. Research on LLM reference hallucination (Agrawal et al., 2024 [16]) shows that models can generate plausible but nonexistent citations, motivating both the mechanical substring check and the Integrity Checker's deeper audit. | Orchestrator + Integrity Checker      | Substring search fails if the Evaluator slightly alters the quote. Integrity Checker is the fallback for near-miss fabrication.                    |
| **Cosmetic drafting**        | Drafter makes token changes                              | Statistics requirement (Tier 1) + score trend tracking across loops                                                                                                                                                                                                                                                                                            | Evaluator (next loop)                 | A Drafter can inflate word counts by adding low-value content. The Evaluator's next-round scoring is the real quality check.                       |
| **Echo-chamber convergence** | All agents agree too quickly                             | Hard minimum of 3 cycles (structural); meta-review requirement (Research Reviewer must challenge prior Evaluator in rounds 2+). Liang et al. (2024) [13] show that multi-agent debate can encourage divergent thinking and reduce premature consensus in LLM groups, supporting the structural separation of reviewer and evaluator roles.                     | Structural + Research Reviewer        | The meta-review is a prompt instruction, not a mechanical check. The 3-cycle minimum is the reliable safeguard.                                    |

### Target-anchoring prevention

The `--target` score is a user-facing convergence parameter, not a scoring input. To prevent circular scoring dependency -- where scoring agents anchor to the target value and produce scores that gravitate toward it rather than reflecting document quality -- the pipeline enforces an architectural separation between scoring and convergence decisions. Specifically: (a) the `--target` value is **not injected** into Agent 3 (Evaluator) or Agent 4 (Integrity Checker) prompt contexts; these agents score the document on evidence alone, without knowledge of the user's convergence threshold; (b) the convergence verdict ("APPROVE/ITERATE" and exit-condition evaluation) is produced by the **orchestrator** based on the integrity-checked scores, not by the Evaluator itself -- the Evaluator scores dimensions and generates improvement pointers, and the orchestrator compares the resulting composite against the target to make convergence decisions; (c) this separation ensures that scoring agents cannot anchor to the target, either consciously (gaming) or through the anchoring bias demonstrated by Echterhoff et al. [21] and the irrelevant-context susceptibility shown by Shi et al. [23]. The grounding prompt (which is injected into all agents) may reference quality expectations in qualitative terms, but the numeric target threshold remains invisible to the scoring agents. The orchestrator is the sole component that holds both the scores and the target, and it applies the convergence logic mechanically (see pseudocode in "Convergence Logic").

### Integrity Checker limitations

The Integrity Checker (Agent 4) is an LLM auditing another LLM's output. Research on LLM self-correction (Huang et al. [11]) demonstrates that LLMs struggle to identify errors in their own reasoning, and Panickssery et al. [8] show that LLM evaluators exhibit self-preference bias. While the Integrity Checker is a _separate_ agent (not self-correction), it shares the same model family and training distribution, which means:

1. **Shared blind spots.** If the Evaluator's error stems from a systematic training-data bias, the Integrity Checker likely shares it. Multi-agent debate improves over single-agent evaluation (Du et al. [12]; Chan et al. [14]) but does not eliminate shared failure modes. The sycophancy risk identified by Xie et al. [2] -- LLMs adapting outputs to align with perceived expectations -- suggests the Checker may defer to the Evaluator's framing even when independent assessment would diverge.

2. **Anchoring effect.** The Integrity Checker sees the Evaluator's scores before auditing them. Research on anchoring bias in LLM evaluation (Echterhoff et al., 2024 [21]) demonstrates that LLMs exhibit anchoring effects when exposed to prior numeric judgments, biasing the Checker toward confirming rather than challenging. Shi et al. (2023) [23] further show that LLMs struggle to ignore irrelevant context even when explicitly instructed to do so, which compounds the anchoring risk when the Integrity Checker is asked to score dimensions "before consulting" scores that are already present in its context window.

   **Design trade-off: instructional isolation vs. two-phase dispatch.** The blind spot check (point 3) uses instructional isolation -- asking the Checker to score dimensions before consulting the Evaluator's scores, despite both being in context. Given [21] and [23], this provides weaker isolation than two-phase dispatch (where the Checker would first receive only the document, score dimensions, then receive the Evaluator's output in a second call). The trade-off accepts weaker isolation for simpler implementation (single dispatch per loop). This is acceptable because: (a) the blind spot check is one of several overlapping safeguards, with failure partially caught by the meta-review and Tier 1 checks; (b) whether instructional isolation suffices is an empirical question. **Recommended upgrade path:** promote to two-phase dispatch if empirical data shows the blind spot check underperforming.

3. **Mitigation: blind spot check.** To partially address shared failure modes, the Integrity Checker independently scores 2-3 randomly selected dimensions _without_ seeing the Evaluator's scores for those dimensions, then compares. A discrepancy of 2+ points on any blind-scored dimension triggers a CHALLENGED verdict for that dimension. This is a Tier 2 (instructional) safeguard: the Integrity Checker receives the full Evaluator output in its context and is instructed to score the selected dimensions before consulting the Evaluator's scores (see the design trade-off discussion in point 2 above for the limitations and upgrade path of this approach). A stronger Tier 1 alternative -- two-phase dispatch -- is described as the recommended upgrade path in point 2.

   **Blind spot check coverage probability.** Over a 5-loop run with 3 blind-scored dimensions per loop, each dimension has approximately a 90% probability of being independently checked at least once (1 - (5/8)^5). The blind spot check is designed to catch broad evaluation failures; targeted single-dimension inflation has a residual ~10% non-detection probability across a 5-loop session.

   **Blind spot check false positive disclosure.** The check produces an estimated order-of-magnitude false positive rate of 25-42%, derived from a back-of-envelope calculation: each blind score carries ~1-point noise ([18]; [19] report 0.5-1.5 points depending on dimension). The Evaluator's score carries comparable noise. Two independent noisy scores must differ by >=2 points to trigger CHALLENGED. With per-score sigma of ~0.75 points, the difference has sigma ~1.06 (root-sum-of-squares); P(|diff| >= 2) ~ 6% for truly agreeing scores. However, anchoring bias ([21]) compresses the Checker's variance, and instructional isolation is imperfect, inflating the effective trigger rate to an estimated 25-42% depending on dimension variance. Koo et al. [55] (CoBBLer) independently report ~40% bias rates in LLM evaluators, consistent with the upper bound. This range requires empirical calibration over the first 10 pipeline runs. The rate is acceptable because false-positive cost is low (one dimension re-examined) versus false-negative cost (inflated score passes unchallenged), and the check is one layer in a defense-in-depth strategy.

4. **Mitigation: high-adjustment flag.** If the Integrity Checker adjusts 3 or more dimensions in a single loop, the orchestrator flags this to the user: "Integrity Checker made {N} adjustments in loop {loop}, suggesting systematic evaluation issues. Human review of scores recommended." This is a Tier 1 (mechanically enforceable) check.

5. **Honest framing.** The Integrity Checker adds genuine value via fabricated-quote detection (substring matching), score-pointer contradiction flagging, and circular-justification identification. It does not match independent human review. Shen et al. [17] show LLM evaluators do not yet reach human-level judgment on nuanced quality distinctions; Huang et al. [31] demonstrate that dedicated inspector agents improve resilience when the primary agent's capability is exceeded. For high-stakes documents, treat the pipeline's output as a strong draft requiring human sign-off.

---

## Agent Failure Escalation

The pipeline's fixed sequential architecture assumes each agent can fulfill its role. In practice, agents may encounter **capability failures** -- situations where the task itself exceeds what the agent can accomplish, distinct from format/gaming failures handled by Tier 1 checks. Cemri et al. [29] provide a systematic taxonomy (MAST) of 14 failure modes across 3 categories in multi-agent systems. The escalation paths below focus on task-level capability gaps (MAST's third category); the mapping is directional rather than comprehensive, since this pipeline's fixed-sequence architecture constrains the failure surface differently than the general-purpose systems MAST describes. MAST's "inter-agent miscoordination" category applies to format-compliance failures (see Anti-Gaming Safeguards, Tier 1). Park et al. [25] show that well-specified agents can produce emergent failures when capability boundaries interact with downstream constraints, motivating structured escalation for inter-agent dependency failures.

### Failure types and escalation paths

**Agent 1 (Research Reviewer): source-finding failure.** When the Research Reviewer cannot find suitable sources for a claim, it must emit a structured `NO_SOURCE_FOUND` verdict for that claim rather than silently omitting it from the claims inventory or proposing low-quality sources to meet the minimum count. The verdict must include:

- The claim text as it appears in the document
- A search explanation: what types of sources were sought (conference papers, journal articles, canonical references), what search strategies were attempted, and why they failed (topic too niche, claim is an original contribution by the document author, claim is common knowledge not typically cited, etc.)
- A classification: `NICHE_TOPIC` (sources likely exist but are hard to find), `ORIGINAL_CLAIM` (the claim appears to be the document's own contribution), `COMMON_KNOWLEDGE` (the claim is widely accepted and does not require citation), or `UNGROUNDABLE` (the claim makes a specific factual assertion that the reviewer cannot find evidence for or against)

This addresses the failure mode where Agent 1 reports "I can't find sources" without structured explanation, leaving downstream agents and the Drafter with no information about why the gap exists or how to address it.

**Agent 2 (Researcher Validator): independent search on NO_SOURCE_FOUND.** When Agent 2 receives claims with `NO_SOURCE_FOUND` verdicts from Agent 1, it must attempt independent source searches before accepting the verdict. For each `NO_SOURCE_FOUND` claim:

- Conduct at least one independent WebSearch using different search terms or strategies than Agent 1 reported
- If a suitable source is found: override the verdict to `CONFIRMED` or `REPLACED` with standard verification evidence
- If no source is found after independent search: confirm the `NO_SOURCE_FOUND` verdict with its own search explanation appended

This prevents a dead zone where claims go unaddressed by either agent. Distributing search across agents with different strategies follows the role-based decomposition demonstrated in AutoGen [24] and MetaGPT [30].

**Agent 2 (Researcher Validator): Creative Agent spawn failure.** When Agent 2 spawns the Creative Agent and receives empty or unusable output (no source proposals, incoherent suggestions, or proposals that do not address the requested claims), Agent 2 must not silently discard the failure. Instead:

- Log the spawn failure in the validated bibliography under a `### Creative Agent Spawn Log` section, recording the claims that triggered the spawn, the Creative Agent's raw output (or "empty output"), and a one-sentence explanation of why the output was unusable.
- Proceed with the `NO_SOURCE_FOUND` verdict unchanged for the affected claims -- the Creative Agent failure does not alter the evidential status of the claim.
- The orchestrator counts Creative Agent spawn failures. If the Creative Agent produces unusable output in 2 or more spawns within a single loop, the orchestrator emits a `CREATIVE_AGENT_DEGRADED` advisory to the user: "Creative Agent produced unusable output in {N} of {M} spawns in loop {loop}. Non-authoritative exploration may be ineffective for this document's subject matter. Consider disabling Creative Agent spawns or adjusting the grounding prompt." This advisory does not halt the pipeline.

**Agent 3 (Evaluator): semantic incoherence failure.** When the Integrity Checker challenges more than 50% of the Evaluator's dimension scores in a single loop, this indicates a fundamental capability failure rather than isolated scoring errors. The orchestrator emits an `EVALUATOR_CAPABILITY_FAILURE` signal and takes the following escalation steps:

- The Evaluator is re-dispatched with the full set of Integrity Checker challenges appended, plus an explicit preamble: "Your evaluation was found to be fundamentally unreliable: {N} of 8 dimension scores were challenged by the Integrity Checker. Re-evaluate the document from scratch, paying particular attention to the challenged dimensions."
- If the re-dispatched Evaluator again fails integrity (>50% challenged on the second attempt), the orchestrator proceeds with the Integrity Checker's adjusted scores and flags to the user: "Evaluator produced unreliable scores in two consecutive attempts for loop {loop}. Proceeding with Integrity Checker adjustments. Human review of this loop's evaluation is strongly recommended."
- The `EVALUATOR_CAPABILITY_FAILURE` signal is logged in the score trend metadata so that downstream agents (particularly the Drafter) and future loops can account for reduced evaluation confidence in this loop.

This maps directionally to MAST's [29] "task verification failures," though the specific dynamics here (evaluation-judgment verification via blind scoring) differ from MAST's task-execution verification. The >50% threshold marks the point where the Evaluator's output is more wrong than right, warranting full re-evaluation rather than targeted corrections. Huang et al. [31] demonstrate that hierarchical review mechanisms improve resilience when the primary agent's capability is exceeded, supporting the Integrity Checker's adjusted scores as a reasonable fallback.

**Agent 4 (Integrity Checker): silent failure detection.** The Integrity Checker can fail silently -- producing PASS verdicts that do not challenge genuinely problematic Evaluator scores. This is difficult to detect because a PASS verdict is indistinguishable from correct operation when the Evaluator's scores are genuinely sound. The orchestrator monitors for the following heuristic signal:

- If the blind spot check produces zero discrepancies for 3 or more consecutive loops AND the composite score is stagnating (delta < 0.1) or regressing (delta < 0) during that same span, the orchestrator flags a `CHECKER_SILENT_FAILURE` advisory: "Integrity Checker has reported zero blind spot discrepancies for {N} consecutive loops while scores are {stagnating/regressing}. This may indicate anchoring bias or shared blind spots between Evaluator and Integrity Checker. Consider enabling two-phase dispatch (see Integrity Checker limitations, point 2) or requesting human review of the current loop's integrity audit."
- The advisory does not halt the pipeline but is surfaced to the user and logged in the score trend metadata.
- If two-phase dispatch is available (as a configurable upgrade), the orchestrator automatically enables it for the next loop when this advisory fires.

This monitoring heuristic addresses the scenario where both the Evaluator and Integrity Checker share a systematic blind spot. The 3-loop window with stagnation/regression is a conservative trigger -- zero discrepancies during active improvement is expected and benign, but zero discrepancies during stagnation suggests the Integrity Checker is not catching the issues preventing progress.

**Agent 5 (Drafter): destructive revision detection and recovery.** When the Drafter's changes cause a composite score regression exceeding 0.2, the next loop's Drafter receives a structured `REGRESSION_CONTEXT` block in addition to its standard inputs. This block contains:

- The pre-regression document version (V(N-1)) and its integrity-checked scores
- The post-regression document version (V(N)) and its integrity-checked scores
- A per-dimension delta table showing which dimensions regressed and by how much
- The specific changes the previous Drafter made (extracted from its revision changelog)
- An explicit instruction: "The previous revision caused a regression of {delta} points. The per-dimension deltas above identify which changes were harmful. Prioritize reverting or reworking the changes that caused the largest regressions while preserving changes that improved other dimensions."

This structured context replaces the previous approach where the next-loop Drafter received only the standard inputs with no information about what went wrong. Without `REGRESSION_CONTEXT`, the Drafter is likely to repeat the same destructive patterns or over-correct by discarding all prior changes. Huang et al. (2025) [31] demonstrate that providing agents with structured feedback about prior failures (analogous to their Inspector mechanism) significantly improves recovery in subsequent attempts.

**Agent 5 (Drafter): Creative Agent spawn failure.** When the Drafter spawns the Creative Agent and receives empty or unusable output, the Drafter must not block on the missing creative input. Instead:

- Log the spawn failure in the revision changelog under a `### Creative Agent Spawn Attempt` entry.
- Proceed with the revision using only the standard pipeline outputs (integrity-checked evaluation, validated bibliography, claims inventory). The Drafter should note in the changelog that the Creative Agent spawn was attempted but produced no usable output, and identify which improvement pointers could not be fully addressed as a result.
- The orchestrator applies the same `CREATIVE_AGENT_DEGRADED` counting logic described under Agent 2's spawn failure handling.

**Pipeline-level ungroundable threshold.** If, after both Agent 1 and Agent 2 have searched, more than 40% of significant claims in the document carry confirmed `NO_SOURCE_FOUND` verdicts with classification `UNGROUNDABLE`, the orchestrator signals a pipeline-level advisory to the user:

> "Cannot adequately ground this document: {N} of {M} significant claims ({percentage}%) remain ungroundable after independent searches by both the Research Reviewer and Researcher Validator. The document may contain claims outside the reach of available research literature, or may require domain-expert human review to identify appropriate sources. Continuing the review loop will evaluate other quality dimensions but cannot resolve the evidential grounding gap."

The 40% threshold is a practitioner-chosen default set below the 50% majority boundary as an early warning: at this density, further automated review yields diminishing returns on evidential grounding. This is tunable (25% for grounding-critical documents, 60% for feasibility/clarity-focused ones). Only `UNGROUNDABLE` claims count -- `ORIGINAL_CLAIM` and `COMMON_KNOWLEDGE` are excluded. The pipeline continues running but the Evaluator caps Evidential Grounding at 3/5 when the advisory is active.

### Interaction with the Creative Agent

When `NO_SOURCE_FOUND` verdicts persist after Agent 2's independent search, the spawning agents (1, 2, or 5) may invoke the Creative Agent (Agent 6) to explore non-authoritative sources -- competitor landscape, engineering blogs, product-oriented references -- that might provide directional support for the ungroundable claims. See "Dynamic Agent Spawning" below for the full specification. Creative Agent outputs do not override `NO_SOURCE_FOUND` verdicts in the validated bibliography but may provide the Drafter with alternative framing or supporting context for claims that lack formal citations.

---

## Dynamic Agent Spawning: Creative Agent (Agent 6)

### Role and purpose

The Creative Agent is an on-demand agent that Agents 1, 2, and 5 can spawn when the fixed pipeline cannot resolve a problem through standard research and revision. It is dynamically invoked when creative exploration would be more productive than repeating the same failing approach. Research on dynamic agent composition supports this pattern: Liu et al. [28] and Chen et al. [32] (AgentVerse) show that adjusting group composition based on task-phase requirements outperforms static role assignment; Wang et al. [44] observe that effective multi-agent systems assign differentiated roles with distinct capability profiles.

The Creative Agent shares all pipeline agents' core directives (structured output, grounding prompt awareness, honesty) but operates with relaxed constraints to broaden the search space when authoritative sources are unavailable. Distinct behavioral profiles improve task coverage in multi-agent systems (Li et al. [41], CAMEL; Qian et al. [42], ChatDev), and integrating heterogeneous source types improves coverage when any single category is insufficient (Mialon et al. [33]). The relaxations reflect common practice in product-oriented workflows where engineering blogs, preprints, and competitor analysis provide directional signal that peer-reviewed literature does not yet cover:

- **Relaxed confidence thresholds.** Where the Research Reviewer requires peer-reviewed sources at major venues, the Creative Agent may draw from a broader landscape including preprints, engineering blogs, product announcements, and competitor analysis.
- **Competitor landscape access.** The Creative Agent may reference a "Competitor Landscape" -- ideas drawn from public profiles and blogs of scientists, engineers, and product teams (e.g., x.com profiles, personal research blogs, company engineering blogs). These references provide directional insight, not authoritative evidence.
- **Product-oriented improvement profiles.** The Creative Agent may suggest improvements grounded in product thinking (user experience, adoption, operational simplicity) in addition to research rigor.
- **Non-authoritative output.** All Creative Agent outputs are explicitly marked as "research of ideas" -- they represent exploration of the solution space, not validated findings. They require downstream validation before integration into the document.

### Spawning conditions

The Creative Agent may be spawned by:

| Spawning agent                     | Condition                                                                                                                                                                                                                        | Spawn threshold                                                                                                                                                                                                                                  | Example scenario                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Agent 1 (Research Reviewer)**    | Multiple claims receive `NO_SOURCE_FOUND` with classification `NICHE_TOPIC` or `UNGROUNDABLE`, suggesting the document is operating at the frontier of available research                                                        | 3 or more `NO_SOURCE_FOUND` claims with classification `NICHE_TOPIC` or `UNGROUNDABLE` in the current loop's claims inventory                                                                                                                    | A plan proposes a novel architecture pattern that has no direct precedents in the literature                    |
| **Agent 2 (Researcher Validator)** | Independent searches confirm `NO_SOURCE_FOUND` for claims where directional (non-authoritative) evidence might exist in the engineering/product landscape                                                                        | 2 or more claims where Agent 2's independent search confirmed `NO_SOURCE_FOUND` and the classification is `NICHE_TOPIC` or `UNGROUNDABLE` (not `ORIGINAL_CLAIM` or `COMMON_KNOWLEDGE`)                                                           | A design decision is justified by industry practice that is documented in blogs but not in peer-reviewed venues |
| **Agent 5 (Drafter)**              | Improvement pointers require novel content that the Drafter cannot generate from the existing pipeline outputs alone (e.g., "add a comparison with alternative approaches" when no alternatives were surfaced by earlier agents) | 1 or more Major/Critical pointers explicitly request content (competitive analysis, alternative approaches, novel framing) that is absent from the current loop's pipeline outputs (claims inventory, validated bibliography, evaluation report) | The Evaluator requests a competitive analysis section but the Research Reviewer found no academic comparisons   |

Each spawn is a single additional agent call within the current loop iteration. The spawning agent includes in the Creative Agent's context: (a) the specific problem or gap that triggered the spawn, (b) the current document version, (c) search strategies already attempted and their results, and (d) the user's grounding prompt.

### Output integration

Creative Agent outputs are integrated back into the pipeline with explicit non-authoritative marking:

1. **Source proposals from Creative Agent** are tagged `[CREATIVE-SOURCE]` in the bibliography and carry an automatic `NON-AUTHORITATIVE` flag. They are never counted as `CONFIRMED` sources in the validated bibliography.
2. **The Researcher Validator (Agent 2)** may attempt to find authoritative equivalents for `[CREATIVE-SOURCE]` proposals in subsequent loops. If a peer-reviewed source is found that supports the same claim, the creative source is replaced.
3. **The Drafter (Agent 5)** may incorporate Creative Agent suggestions into the document but must mark them distinctly (e.g., "Industry practice suggests..." rather than "Research demonstrates...") and note the non-authoritative status in the revision changelog.
4. **The Evaluator (Agent 3)** treats `[CREATIVE-SOURCE]`-backed claims as partially grounded: they contribute to Originality (dimension 7) but do not improve the Evidential Grounding score (dimension 1) unless later validated by authoritative sources.

### Quality constraints

The Integrity Checker (Agent 4) applies the same rigor to Creative Agent-influenced outputs as to any other pipeline output. The Integrity Checker's audit of Creative Agent integration is paramount -- it is the primary safeguard preventing non-authoritative material from contaminating the document's evidential foundation. Specifically:

- If the Drafter integrates a Creative Agent suggestion without adequate marking, the Integrity Checker flags this as a pointer quality issue with severity Major (not Minor), because unmarked non-authoritative content directly undermines the pipeline's primary value proposition of evidential grounding.
- If the Evaluator gives Evidential Grounding credit for `[CREATIVE-SOURCE]`-backed claims, the Integrity Checker challenges the score. This is a mandatory challenge -- the Integrity Checker must flag any Evidential Grounding score that credits non-authoritative sources, regardless of whether those dimensions were selected for the blind spot check.
- The Integrity Checker's blind spot check may randomly select Evidential Grounding as a blind-scored dimension, providing an independent check on whether creative sources are being improperly counted. When Creative Agent outputs are present in the current loop, the orchestrator biases the random dimension selection to include Evidential Grounding with 50% probability (rather than the baseline ~37.5% for selecting 3 of 8 dimensions), increasing audit coverage during loops where non-authoritative content is most likely to be integrated.

### Creative Agent failure handling

The Creative Agent may produce empty, incoherent, or off-topic output. Unlike the fixed pipeline agents, the Creative Agent is not re-dispatched on failure -- its outputs are optional enhancements, not required pipeline inputs. Failure handling follows these rules:

1. **Empty or unparseable output.** If the Creative Agent returns no structured content, or its output cannot be parsed into source proposals or improvement suggestions, the spawning agent logs the failure and proceeds without creative input. The spawn counts toward the per-loop spawn cap but does not trigger a re-dispatch.
2. **Off-topic output.** If the Creative Agent produces suggestions that do not address the claims or gaps specified in the spawn context, the spawning agent may discard them. The spawning agent includes a brief note in its output: "Creative Agent spawn produced off-topic suggestions; discarded."
3. **Degradation tracking.** The orchestrator tracks Creative Agent spawn outcomes (success/failure) across loops. If the Creative Agent fails in 3 or more spawns across the review session (not just within a single loop), the orchestrator emits a persistent `CREATIVE_AGENT_INEFFECTIVE` advisory: "Creative Agent has produced unusable output in {N} of {M} total spawns across {L} loops. Disabling automatic spawns for remaining loops. Agents may still request manual Creative Agent invocation through the orchestrator." This prevents token and latency waste on a Creative Agent that is consistently unhelpful for the current document.
4. **No fallback escalation.** Creative Agent failure does not trigger any pipeline-level escalation (unlike Evaluator capability failure or Integrity Checker silent failure). The pipeline's quality is not dependent on the Creative Agent -- it is a supplementary resource. The spawning agent's primary workflow must be robust to receiving no creative input.

### Implementation complexity and risks

Introducing dynamic agent spawning adds complexity to the orchestrator:

- **Token budget.** Each Creative Agent spawn adds ~2-4K tokens of input and ~1-2K tokens of output. With up to 2 spawning agents per loop (see spawn cap enforcement below), worst-case overhead is ~6-12K tokens per loop. The orchestrator must track cumulative token usage and enforce the per-loop spawn cap.
- **Spawn cap enforcement.** The orchestrator enforces a maximum of 2 Creative Agent spawns per loop across all spawning agents. When a spawning agent requests a Creative Agent spawn, the orchestrator checks the current loop's spawn count. If the cap has been reached, the spawn request is denied and the spawning agent proceeds without creative input. The orchestrator logs denied spawn requests in the loop metadata. Spawn priority when multiple agents request spawns in the same loop: Agent 1 > Agent 2 > Agent 5 (earlier agents have priority because their outputs feed into later agents' work).
- **Latency.** Creative Agent calls are sequential within the spawning agent's execution, adding wall-clock time. The orchestrator should log spawn frequency; if spawns occur in >50% of loops, the Creative Agent may warrant promotion to a fixed pipeline stage.
- **Quality dilution risk.** Non-authoritative sources could lower the document's overall evidential quality if over-integrated. The `NON-AUTHORITATIVE` flag and Evaluator scoring rules (no Evidential Grounding credit) are the primary safeguards. The relaxed confidence thresholds that make the Creative Agent useful also make its outputs less reliable -- this is an inherent tension in the design, not an incidental risk. The safeguards (non-authoritative marking, no Evidential Grounding credit, Integrity Checker audit) manage this tension by ensuring that creative outputs can inform the document without contaminating its evidential foundation.
- **Scope creep.** The Creative Agent's broader mandate could lead to suggestions that drift from the document's original scope. The grounding prompt (injected into the Creative Agent's context) constrains this, and the Evaluator's Problem Framing dimension (dimension 2) penalizes scope drift in subsequent loops.

### Competitor Landscape access: feasibility and constraints

The Creative Agent's Competitor Landscape access relies on web-accessible content subject to practical constraints. Haustein et al. [43] provide a direct precedent: social media and blog content can surface emerging research trends as early attention indicators. Supporting evidence from adjacent domains (Diaz-Aviles et al. [36]; Feldman [37]) confirms the value of social streams as structured intelligence sources.

**Access constraints.** Social media APIs (particularly x.com/Twitter) impose severe rate limits or require paid tiers; blog content varies in structure, accessibility, and longevity. Automated scraping raises legal/ethical concerns (ToS restrictions, CFAA applicability, privacy), though the Creative Agent's use is limited to idea-level inspiration rather than verbatim reproduction.

**Fallback behavior.** When targeted URLs are unreachable, the Creative Agent falls back to general WebSearch queries (author name + topic), preprint repositories (arXiv, SSRN), conference workshop papers, and product documentation. All access failures are logged so the orchestrator can track Competitor Landscape reliability. The `CREATIVE_AGENT_DEGRADED` and `CREATIVE_AGENT_INEFFECTIVE` advisories cover persistent access failures.

---

## Agent Prompt Specifications

### Agent 1: Research Reviewer

**Input:** Document V(N) + previous evaluation report (rounds 2+) + **user's grounding prompt**
**Output:** Meta-Review (rounds 2+) + Claims Inventory + Source Proposals Summary

- **Meta-Review (rounds 2+ only):** Before reviewing the document, audit the previous Evaluator's scores. Identify at least 1 thing the Evaluator missed or underweighted, OR write a "No Gaps Found" justification explaining why the scores were fair. Also audit the previous round's pointer quality -- were they substantive or superficial?
- Inventories every significant claim in the document
- For each: current citation status (None / Adequate / Partial) or `NO_SOURCE_FOUND` with structured explanation (see "Agent Failure Escalation")
- Proposes specific sources -- must include author, title, venue, year
- Source quality standards: papers at major conferences (NeurIPS, ICLR, ICML, EMNLP, CHI, OSDI, ICSE, etc.), peer-reviewed journals, canonical references, official docs from system creators
- REJECT: Medium/dev.to posts, tutorials, unreviewed arXiv-only preprints (<50 citations), Stack Overflow, marketing materials
- **Minimum 5 claims** reviewed per round (including implicit assumptions and methodology choices, not just headline assertions)
- For rounds 2+: focus on claims still inadequately cited, not already-resolved ones
- The **grounding prompt** guides which claims to prioritize -- if the user says "focus on distributed systems correctness", prioritize claims in that domain
- **Creative Agent spawn:** If 3 or more claims receive `NO_SOURCE_FOUND` with classification `NICHE_TOPIC` or `UNGROUNDABLE`, Agent 1 may spawn the Creative Agent to explore non-authoritative sources for those claims (subject to the orchestrator's per-loop spawn cap of 2)

### Agent 2: Researcher Validator

**Input:** Document V(N) + existing bibliography + Agent 1's source proposals + previous validated bibliography + **user's grounding prompt**
**Output:** Validated Bibliography with verdicts per source

- VERIFY each proposed source via WebSearch -- confirm it exists and says what Agent 1 claims
- VALIDATE existing sources for correctness (author, title, venue, year)
- IMPROVE by finding better sources where proposed ones are weak
- **Independent search on NO_SOURCE_FOUND:** For each claim with a `NO_SOURCE_FOUND` verdict from Agent 1, conduct at least one independent WebSearch using different search terms before confirming the verdict (see "Agent Failure Escalation")
- Per-source verdict: CONFIRMED / REPLACED / REJECTED / UNVERIFIABLE / NO_SOURCE_FOUND (confirmed)
- **Anti-gaming:** every verdict must include the search query used and a 1-sentence summary of what was found. Verdicts without verification evidence are treated as UNVERIFIABLE.
- Outputs a clean compiled bibliography for Agents 3 and 4
- For rounds 2+: carry forward previously CONFIRMED sources without re-checking
- **Creative Agent spawn:** If independent searches confirm `NO_SOURCE_FOUND` for 2 or more claims where the engineering/product landscape might offer directional evidence (classification `NICHE_TOPIC` or `UNGROUNDABLE`), Agent 2 may spawn the Creative Agent (subject to the orchestrator's per-loop spawn cap of 2). If the Creative Agent produces unusable output, handle per the failure protocol in "Agent Failure Escalation."

### Agent 3: Evaluator

**Input:** Document V(N) + Validated Bibliography + Claims Inventory + Agent 1's Meta-Review + previous evaluation reports + **user's grounding prompt**
**Output:** Dimension Scores table + Score Trend + Improvement Pointers + Convergence Assessment

- Scores each of the 8 dimensions (1-5 scale)
- **Anti-gaming: evidence-backed scores.** A score of 4 or 5 on any dimension requires quoting the specific document passage that justifies the rating. Scores without textual evidence are invalid.
- **Anti-gaming: cross-check claim coverage.** Compare Agent 1's Claims Inventory against document sections. Flag any sections with significant claims that Agent 1 did not inventory (this prevents shallow reviewing by Agent 1).
- **Anti-gaming: penalize unverified sources.** If the Validated Bibliography contains UNVERIFIABLE sources that the document cites, the Evidential Grounding score must reflect this.
- **Ungroundable claim handling:** If the pipeline-level ungroundable advisory is active (>40% of claims confirmed `UNGROUNDABLE`), cap the Evidential Grounding dimension at 3/5 regardless of the quality of grounding for the remaining claims.
- **HARD CONSTRAINT: Minimum 3 pointers per round**, regardless of scores. If document is excellent, find Minor pointers about phrasing, structure, or secondary claims.
- **HARD CONSTRAINT: At least 1 pointer must be Major or higher for rounds 1-3.** If the Evaluator claims no Major issues exist, it must include a "No Major Issues Justification" paragraph.
- Pointer severity: Critical (document is wrong) / Major (incomplete) / Minor (could be better)
- Each pointer must cite specific text/sections and provide an actionable recommendation (not "consider improving" but "add a paragraph in section X addressing Y, citing source [Z]")
- Must respond to Agent 1's Meta-Review: if the meta-review identified a missed weakness, address it
- For rounds 2+: acknowledge improvements before listing remaining issues
- Convergence verdict: APPROVE / ITERATE with specific conditions cited

### Agent 4: Evaluator Integrity Checker

**Input:** Document V(N) + Evaluator's full output (scores, evidence, pointers) + Validated Bibliography + Claims Inventory + **user's grounding prompt**
**Output:** Integrity Verdict + Adjusted Evaluation Report (if corrections needed)

This agent exists to prevent the Evaluator from "bribing" the loop into convergence through inflated scores or hollow justifications. It reads the Evaluator's output with adversarial intent.

- **Score-evidence alignment audit.** For each dimension score, verify that the quoted textual evidence actually supports the assigned score. Specifically:
  - Does the quoted passage exist in the document? (catch fabricated quotes)
  - Does the passage actually demonstrate what the Evaluator claims? (catch misattribution)
  - Is a score of 4 or 5 justified by the evidence, or is it generic praise? (catch inflation)
  - Is a score of 1 or 2 justified, or is the Evaluator being excessively punitive? (catch deflation)
- **Blind spot check (new).** Before reviewing the Evaluator's scores, independently score 2-3 randomly selected dimensions by reading the document directly, without consulting the Evaluator's output for those dimensions. After completing the blind scores, compare against the Evaluator's scores. A discrepancy of 2 or more points on any blind-scored dimension triggers a CHALLENGED verdict for that dimension.
- **Pointer quality audit.** For each improvement pointer:
  - Is the recommendation actionable and specific? (reject "consider improving X")
  - Does the severity match the actual issue? (a typo is not Critical; a logical fallacy is not Minor)
  - Is the pointer grounded in the document's actual content, not a hypothetical concern?
- **Creative Agent output audit.** If the current loop includes Creative Agent outputs integrated by the Drafter or influencing the Evaluator's scores:
  - Verify that `[CREATIVE-SOURCE]`-backed claims are not credited under Evidential Grounding (dimension 1) -- this is a mandatory challenge, not discretionary
  - Verify that Creative Agent suggestions are marked as non-authoritative in the document
  - Flag any unmarked integration of non-authoritative material as a pointer quality issue with severity Major
- **Justification coherence check.** Read each justification as a standalone argument. Flag:
  - Circular reasoning ("the score is 4 because the quality is high")
  - Tautological evidence ("the problem framing is clear because it frames the problem clearly")
  - Contradictions between scores (e.g., Logical Coherence = 5 but a pointer says "reasoning has gaps")
  - Score-pointer mismatch (dimension scored 4+ but a Critical/Major pointer targets that same dimension)
- **Convergence integrity.** If the Evaluator's verdict is APPROVE, verify that the evidence genuinely supports convergence -- not that the Evaluator simply exhausted its patience.

**Output format:**

```
### Blind Spot Check

| Dimension (randomly selected) | Integrity Checker's blind score | Evaluator's score | Discrepancy | Verdict |
|-------------------------------|-------------------------------|-------------------|-------------|---------|
| <dimension> | X/5 | Y/5 | |Y-X| | PASS / CHALLENGED |

### Integrity Audit

| Dimension | Evaluator Score | Integrity Check | Adjusted Score | Reason |
|-----------|----------------|-----------------|----------------|--------|
| Evidential grounding | X/5 | PASS / CHALLENGED | X/5 or Y/5 | ... |
| ... | ... | ... | ... | ... |

### Challenged Items

For each score or pointer that fails the integrity check:

#### Challenge IC{loop}.{N}: <title>
**Target:** Dimension score / Pointer IP{loop}.{M}
**Issue:** <what is wrong with the Evaluator's justification>
**Evidence:** <the quoted text vs what it actually says>
**Adjustment:** <corrected score or pointer severity>

### Pointer Quality Audit
- Actionable pointers: N of M
- Correctly-severity'd pointers: N of M
- Pointers with fabricated/misattributed evidence: N

### Creative Agent Integration Audit (if applicable)
- Creative sources found in document: N
- Properly marked as non-authoritative: N of M
- Improperly credited under Evidential Grounding: N (mandatory challenges issued)

### Integrity Verdict
- **PASS** -- Evaluator's output is sound. Forward to Drafter as-is.
- **CORRECTED** -- Adjustments made. Forward corrected version to Drafter.
- **FAIL** -- Evaluator's output is fundamentally unreliable (>50% of scores challenged).
  Re-run the Evaluator with the integrity failures as context.
```

**Rules:**

- The Integrity Checker does NOT re-evaluate the document itself (except for the blind spot check on 2-3 dimensions). It primarily audits the Evaluator's work.
- The blind spot check is performed BEFORE reading the Evaluator's scores to reduce anchoring bias (see design trade-off discussion in Integrity Checker limitations, point 2).
- On CORRECTED: the adjusted scores and modified pointers replace the Evaluator's originals before reaching the Drafter.
- On FAIL: the orchestrator re-dispatches the Evaluator with the integrity failures appended as a "you were caught" preamble. This re-run counts within the same loop iteration (does not increment the loop counter).
- Maximum 1 re-run per loop. If the Evaluator fails integrity a second time in the same loop, flag to the user and proceed with the Integrity Checker's adjustments.
- If 3 or more dimensions are adjusted in a single loop, flag to the user: "Integrity Checker made {N} adjustments in loop {loop}, suggesting systematic evaluation issues. Human review of scores recommended."

### Agent 5: Drafter

**Input:** Document V(N) + **Integrity-checked** Evaluation Report + Validated Bibliography + Claims Inventory + Original document (for reference) + **user's grounding prompt** + REGRESSION_CONTEXT (if previous loop regressed; see Agent Failure Escalation)
**Output:** Complete revised Document V(N+1) + Revision Changelog + Statistics

- Address ALL Critical pointers (mandatory)
- Address all Major pointers (expected; justify if declined)
- Address Minor pointers at discretion
- Integrate validated sources using the document's existing citation format
- **Preserve original format**: if ADR, keep ADR template; if RFC, keep RFC structure
- **Preserve original voice**: surgical improvements, not a rewrite
- Output is the COMPLETE revised document (not a diff) -- copy-pasteable into the file
- If document lacks a bibliography section, add one matching its format conventions
- **Regression recovery:** If REGRESSION_CONTEXT is present, prioritize reverting or reworking the changes identified as harmful in the per-dimension delta table before addressing new pointers. The structured context includes the pre-regression version, post-regression version, and per-dimension deltas to enable targeted recovery rather than wholesale rollback.
- **Creative Agent spawn:** If improvement pointers require novel content (e.g., competitive analysis, alternative approach comparison) that is not available in the current pipeline outputs, the Drafter may spawn the Creative Agent before revising (subject to the orchestrator's per-loop spawn cap of 2). Creative Agent outputs are integrated with non-authoritative marking. If the Creative Agent produces unusable output, handle per the failure protocol in "Agent Failure Escalation" and proceed with the revision using available inputs, noting in the changelog which pointers could not be fully addressed.
- **Anti-gaming: quantified changelog.** Must report: words added/removed, sections modified, sources integrated. The orchestrator compares this against the Evaluator's next-round score -- if composite drops by > 0.2 after the Drafter's changes, the orchestrator flags a "stalled improvement" warning to the user.

---

## Orchestrator Validation Protocol

Between each agent dispatch, the orchestrator performs the following mechanical checks on the agent's output before passing it to the next agent. These are deterministic string/structure inspections that do not require LLM judgment.

### After Agent 1 (Research Reviewer):

1. Count `#### Claim C{loop}.{N}:` headings. If count < 5, re-dispatch Agent 1 with: "You inventoried only {N} claims. Minimum is 5 per loop."
2. For loops 2+: verify a `### Meta-Review` section exists. If absent, re-dispatch with: "Meta-Review section is mandatory for loops 2+."
3. For claims with `NO_SOURCE_FOUND` verdicts: verify that each includes a search explanation and classification field. If missing, re-dispatch with: "NO_SOURCE_FOUND verdicts must include search explanation and classification (NICHE_TOPIC / ORIGINAL_CLAIM / COMMON_KNOWLEDGE / UNGROUNDABLE)."
4. Count `NO_SOURCE_FOUND` claims with classification `NICHE_TOPIC` or `UNGROUNDABLE`. If count >= 3, log that Agent 1's Creative Agent spawn threshold is met (spawn decision remains with Agent 1, but the orchestrator verifies the precondition is satisfied before permitting a spawn request).

### After Agent 2 (Researcher Validator):

1. For each source entry, check that a `**Verification:**` field exists with non-empty content. Sources without verification evidence are reclassified as UNVERIFIABLE regardless of stated verdict.
2. For each `NO_SOURCE_FOUND` claim from Agent 1: verify that Agent 2's output contains an independent search record for that claim. If absent, re-dispatch with: "Independent search is required for all NO_SOURCE_FOUND claims from Agent 1."
3. After validation: count confirmed `UNGROUNDABLE` claims and compute the percentage of total significant claims. If >40%, activate the pipeline-level ungroundable advisory.
4. If Agent 2 spawned the Creative Agent: verify that a `### Creative Agent Spawn Log` section exists documenting the spawn outcome (success or failure). If the Creative Agent produced unusable output, verify the log records the failure per the protocol in "Agent Failure Escalation."

### After Agent 3 (Evaluator):

1. Count `#### Pointer IP{loop}.{N}:` headings. If count < 3, re-dispatch with pointer-count instruction.
2. For loops 1-3: scan for at least one `**Severity:** Critical` or `**Severity:** Major`. If absent, re-dispatch with severity instruction.
3. For each dimension scored 4 or 5 in the scores table: extract the Evidence cell and check that it contains a quoted string (text between `"` delimiters) that is a substring of the current document. Flag non-matching quotes to the Integrity Checker as priority audit targets.
4. If the pipeline-level ungroundable advisory is active: verify that the Evidential Grounding score does not exceed 3/5. If it does, re-dispatch with: "Pipeline-level ungroundable advisory is active. Evidential Grounding score must be capped at 3/5."

### After Agent 4 (Integrity Checker):

1. Count the number of CHALLENGED dimensions. If 3 or more, flag to user: "Integrity Checker made {N} adjustments in loop {loop}. Human review of scores recommended."
2. If more than 50% of dimensions (5 or more) are CHALLENGED, emit `EVALUATOR_CAPABILITY_FAILURE` signal and follow the escalation path described in Agent Failure Escalation.
3. Extract the integrity-adjusted composite score for convergence tracking.
4. Log blind spot check results for this loop: dimensions selected for blind scoring, the Integrity Checker's blind scores, the Evaluator's scores for those dimensions, the discrepancy for each, and any CHALLENGED verdicts. If blind spot checks produce zero discrepancies across 3 or more consecutive loops despite composite score stagnation or regression in that span, emit `CHECKER_SILENT_FAILURE` advisory (see Agent Failure Escalation).
5. If Creative Agent outputs were present in this loop: verify that the `### Creative Agent Integration Audit` section exists in the Integrity Checker's output. If absent, re-dispatch with: "Creative Agent outputs were integrated in this loop. A Creative Agent Integration Audit section is required."

### After Agent 5 (Drafter):

1. Verify a `### Revision Statistics` section exists with non-zero values for at least "Pointers addressed" and "Sections modified". If missing or all zeros, flag "stalled improvement" warning.
2. Compare the integrity-adjusted composite from this loop against the previous loop. If drop > 0.2, report regression warning, preserve the previous version as a rollback candidate, and prepare `REGRESSION_CONTEXT` for the next loop's Drafter (see Agent Failure Escalation).

### After Creative Agent spawns (cross-cutting):

1. Increment the per-loop Creative Agent spawn counter. If the counter reaches 2, deny any further spawn requests for the remainder of the loop.
2. If the Creative Agent produced output: verify that all source proposals are tagged `[CREATIVE-SOURCE]` and carry `NON-AUTHORITATIVE` flags. If any source lacks proper tagging, the orchestrator adds the tags before passing the output to the spawning agent.
3. If the Creative Agent produced empty or unparseable output: increment the session-wide spawn failure counter. If failures reach 3, emit `CREATIVE_AGENT_INEFFECTIVE` advisory (see "Creative Agent failure handling").

**Re-dispatch limits:** Each agent may be re-dispatched at most once per loop for failing mechanical checks. If an agent fails the same check twice, proceed with its output and flag the failure to the user. This limit covers mechanical check failures only. The Evaluator (Agent 3) may additionally be re-dispatched once for an integrity failure (see the `integrity_verdict == "FAIL"` branch in the convergence pseudocode) and once for an `EVALUATOR_CAPABILITY_FAILURE` escalation, independent of the mechanical check re-dispatch limit, for a maximum of 3 re-dispatches per loop for Agent 3.

---

## Loop Exit and Approval Gate

### On above-target plateau convergence (loop >= 3, target reached, score plateaued):

Report final composite score, score progression (including how many loops continued above the target before plateau), dimension breakdown, and present the full revised document. Options:

- `approve` -- overwrite original file
- `approve-copy` -- write to `{stem}.reviewed{ext}` alongside original
- `edit <instructions>` -- one more Drafter cycle with human feedback
- `reject` -- discard all changes

### On near-threshold exit (composite >= near_floor, plateau, no Major/Critical pointers):

Report current score, note that the target was not reached but quality is stable. Same options as convergence, plus a note: "The document scored {score}/5.0, below the {target} target. Consider whether the remaining gap warrants additional review cycles."

### On max_loop reached without convergence:

Report current score, outstanding pointers, and present best version. Same options plus:

- `continue <N>` -- run N more loops

### On regression-plateau exit (target reached in prior loop, score since regressed and stagnated):

Report current score, the loop where the target was reached, and present the best-scoring version. Same options as convergence. Note: "The document reached {target} at loop {target_reached_at} but has since regressed. Presenting the best-scoring version ({best_score}) from loop {best_version_loop}."

**Plan-only until approved.** No file writes until explicit user approval.

---

## Verification

After implementation:

1. **Dry run:** Point `/pm-review-plan` at a complex, research-heavy document and verify:
   - All 5 agents execute in sequence
   - Research Reviewer produces a claims inventory with source proposals
   - Researcher Validator uses WebSearch to verify sources
   - Evaluator scores 8 dimensions and produces >= 3 pointers
   - Orchestrator mechanical checks execute between agents (pointer count, quote verification, etc.)
   - Integrity Checker audits the Evaluator's scores and evidence, including blind spot check
   - Drafter produces a complete revised document
   - Loop runs minimum 3 rounds before convergence check
2. **Agent failure escalation:** Test that:
   - Agent 1 emits `NO_SOURCE_FOUND` with structured verdicts when sources are unavailable
   - Agent 2 performs independent searches on `NO_SOURCE_FOUND` claims
   - Pipeline-level ungroundable advisory activates at >40% threshold
   - Evaluator caps Evidential Grounding at 3/5 when advisory is active
   - Agent 3 `EVALUATOR_CAPABILITY_FAILURE` escalation triggers when >50% of scores are challenged and re-dispatch occurs correctly
   - Agent 4 `CHECKER_SILENT_FAILURE` advisory fires when zero blind spot discrepancies persist for 3+ loops during stagnation/regression
   - Agent 5 `REGRESSION_CONTEXT` is correctly assembled and forwarded to the next-loop Drafter after a regression > 0.2
3. **Creative Agent spawning and failure:** Test that:
   - Agents 1, 2, and 5 can spawn the Creative Agent under specified conditions (threshold met)
   - Spawn threshold verification works: Agent 1 requires 3+ NO_SOURCE_FOUND claims, Agent 2 requires 2+ confirmed NO_SOURCE_FOUND, Agent 5 requires 1+ Major pointer requesting absent content
   - Creative Agent outputs are tagged `[CREATIVE-SOURCE]` and `NON-AUTHORITATIVE`
   - Evaluator does not credit `[CREATIVE-SOURCE]` references under Evidential Grounding
   - Integrity Checker catches unmarked Creative Agent integrations with Major severity
   - Maximum 2 spawns per loop is enforced by the orchestrator (spawn priority: Agent 1 > Agent 2 > Agent 5)
   - Creative Agent empty/unusable output is logged and does not block the spawning agent
   - `CREATIVE_AGENT_DEGRADED` advisory fires after 2+ spawn failures in a single loop
   - `CREATIVE_AGENT_INEFFECTIVE` advisory fires after 3+ spawn failures across the session and disables automatic spawns
4. **Convergence edge cases:** Test that:
   - Near-threshold exit triggers at composite 3.8-3.99 with plateau at loop >= 4
   - Oscillation detection triggers after 3 alternating score directions at loop >= 4
   - Single-dimension blocker downgrades to warning after loop 4
   - Exit precedence is respected when multiple conditions trigger simultaneously
5. **Mechanical checks:** Verify orchestrator re-dispatches agents that fail structural validation (e.g., Evaluator with only 2 pointers)
6. **Format compliance fallback:** Verify that format parsing failure triggers re-dispatch with format correction, not silent data loss
7. **Format preservation:** Confirm the Drafter's output maintains the original document template structure
8. **Help registration:** Verify `/pm-review-plan` appears in `/pm-help` output
9. **Install coverage:** Confirm `install/install.sh` glob (`pm-*.md`) picks up the new file

---

## Appendix A: Worked Example -- Single Loop Iteration

This appendix walks through one complete loop iteration (loop 2) for a hypothetical 5-page architecture decision record (ADR) on "Migrating from REST to gRPC for internal service communication." The document is approximately 3,200 words (~4,200 tokens). Loop 1 has already completed with a composite score of 3.2/5.0. The grounding prompt is: "Focus on evidential grounding and feasibility -- this will be implemented by a team with no prior gRPC experience."

### Agent 1 -- Research Reviewer (~2,100 output tokens)

**Input:** Document V(2) (~4.2K tokens) + loop 1 evaluation report (~2K tokens) + loop 1 meta-review summary (~400 tokens) + score trend array (~50 tokens). Total input: ~6.7K tokens.

**Key finding (front-loaded):** 3 of 8 significant claims lack source support; the latency improvement claim (40% reduction) has no empirical backing.

**Output summary:**

- Claims inventoried: 8 (C2.1 through C2.8)
- Source proposals: 5 new sources proposed for claims C2.1, C2.3, C2.5
- NO_SOURCE_FOUND: 1 claim (C2.7: "gRPC adoption reduces onboarding time for new developers") classified as UNGROUNDABLE -- this is an organizational claim not amenable to peer-reviewed sourcing
- Meta-review: "Loop 1 Evaluator under-weighted the missing latency benchmarks. The 40% claim in Section 3.2 remains the document's weakest evidential link."

### Agent 2 -- Researcher Validator (~1,800 output tokens)

**Input:** Document V(2) + existing bibliography (6 sources) + Agent 1 source proposals (5) + loop 1 validated bibliography (~800 tokens). Total input: ~8.4K tokens.

**Output summary:**

- CONFIRMED: 3 sources (including a Google SRE benchmark for latency claims)
- REPLACED: 1 source (Agent 1 proposed a blog post; Validator found a peer-reviewed OSDI paper covering the same data)
- REJECTED: 0
- UNVERIFIABLE: 1 (proposed source URL returned 404; no alternative found)
- NO_SOURCE_FOUND (confirmed): 1 (C2.7 -- independent search using "gRPC developer onboarding empirical study" yielded no peer-reviewed results)
- Independent search record: 1 search conducted for C2.7 NO_SOURCE_FOUND claim

### Agent 3 -- Evaluator (~2,400 output tokens)

**Input:** Document V(2) + validated bibliography + claims inventory + Agent 1 meta-review + loop 1 evaluation report + score trend. Total input: ~11.5K tokens.

**Output summary:**

| #   | Dimension             | Score | Delta from loop 1 |
| --- | --------------------- | ----- | ----------------- |
| 1   | Evidential grounding  | 3     | +1                |
| 2   | Problem framing       | 4     | 0                 |
| 3   | Logical coherence     | 4     | +1                |
| 4   | Completeness          | 3     | 0                 |
| 5   | Feasibility and risk  | 2     | 0                 |
| 6   | Clarity and structure | 4     | 0                 |
| 7   | Originality           | 3     | 0                 |
| 8   | Reproducibility       | 3     | +1                |

Composite: 3.28/5.0 (delta: +0.08 from loop 1's 3.20). Convergence verdict: ITERATE.

Pointers generated: 4

- IP2.1 (Major): Add migration risk analysis for team with no gRPC experience -- Section 5 discusses migration steps but omits learning curve, tooling gaps, and rollback strategy
- IP2.2 (Major): Replace or remove the ungroundable "onboarding time" claim (C2.7) -- either reframe as an explicit assumption or remove
- IP2.3 (Minor): The latency benchmark source (now grounded) should be cited inline in Section 3.2, not just in the bibliography
- IP2.4 (Minor): Section 4 "Alternatives Considered" lists REST and GraphQL but does not explain why GraphQL was rejected

### Agent 4 -- Integrity Checker (~1,600 output tokens)

**Input:** Document V(2) + Evaluator full output + validated bibliography + claims inventory. Total input: ~10.8K tokens.

**Output summary:**

Blind spot check (dimensions 3, 5 randomly selected):

- Logical coherence: blind score 4, Evaluator score 4, discrepancy 0 -- PASS
- Feasibility and risk: blind score 2, Evaluator score 2, discrepancy 0 -- PASS

Challenged items: 0. All score-evidence alignments verified. Pointer severity ratings confirmed appropriate.

**Integrity verdict: PASS.** Forward to Drafter as-is.

### Agent 5 -- Drafter (~3,200 output tokens, plus revised document)

**Input:** Document V(2) + integrity-checked evaluation + validated bibliography + claims inventory + original document V(0). Total input: ~13.8K tokens.

**Key finding (front-loaded):** Addressing 2 Major pointers (migration risk analysis and ungroundable claim). Adding new Section 5.3 on team readiness risks.

**Changes made:**

- IP2.1 (Major) addressed: Added Section 5.3 "Migration Risks for Teams New to gRPC" covering learning curve estimate (cited training time data from OSDI source), tooling gaps (protobuf toolchain setup), and rollback strategy (dual-stack period)
- IP2.2 (Major) addressed: Reframed C2.7 as an explicit assumption: "We assume gRPC adoption will not significantly increase onboarding time, though no empirical data supports this assumption. The team should measure onboarding metrics during the pilot phase."
- IP2.3 (Minor) addressed: Added inline citation for latency benchmark in Section 3.2
- IP2.4 (Minor) addressed: Added 2-sentence GraphQL rejection rationale in Section 4

**Revision statistics:**

- Pointers addressed: 4 of 4 (2 Major, 2 Minor)
- Sections modified: 3 (Sections 3.2, 4, 5)
- Sections added: 1 (Section 5.3)
- Approximate words added: 280
- Approximate words removed: 35
- Sources integrated: 2

### Loop 2 Summary (displayed to user)

```
=== Loop 2/5 complete ===
Composite: 3.28/5.0 (delta: +0.08)  Target: 4.0
Pointers: 0C / 2M / 2m  |  Sources: +3 -0 ~1
Status: ITERATING (loop 2 of 3 minimum)
```

### Token Budget for This Loop

| Agent                     | Input tokens | Output tokens |
| ------------------------- | ------------ | ------------- |
| 1 -- Research Reviewer    | ~6,700       | ~2,100        |
| 2 -- Researcher Validator | ~8,400       | ~1,800        |
| 3 -- Evaluator            | ~11,500      | ~2,400        |
| 4 -- Integrity Checker    | ~10,800      | ~1,600        |
| 5 -- Drafter              | ~13,800      | ~3,200        |
| **Loop total**            | **~51,200**  | **~11,100**   |

Estimated cost for this loop at GPT-4-class pricing (~$0.03/1K input, ~$0.06/1K output): ~$1.54 input + ~$0.67 output = **~$2.21**.

### Convergence Sketch A -- Happy Path (Loops 3-6, `--max-loop 7`)

Continuing the worked example above (loop 1: 3.20, loop 2: 3.28). Dimensions shown as [D1,D2,D3,D4,D5,D6,D7,D8] to verify the `quality_criteria_met` predicate (particularly "no dimension below 3"). Composite values are the integrity-checked scores; dimension vectors are illustrative of the score trajectory.

| Loop | Composite | Dimensions [D1-D8] | Delta | Phase                     | Exit decision                                                                                                          |
| ---- | --------- | ------------------ | ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 3    | 3.60      | [4,4,4,3,3,4,3,3]  | +0.29 | Target-reaching           | ITERATE -- below 4.0 target, minimum 3 loops met. All dimensions >= 3.                                                 |
| 4    | 4.04      | [5,4,4,4,4,4,3,3]  | +0.44 | Plateau-detection entered | CONTINUE -- target reached, `target_reached_at = 4`, no dimension below 3, checking for plateau.                       |
| 5    | 4.12      | [5,4,4,4,4,4,3,4]  | +0.08 | Plateau-detection         | CONTINUE -- delta < 0.1 for 1 loop only; plateau requires 2 consecutive loops with delta < 0.1.                        |
| 6    | 4.20      | [5,4,4,4,4,4,4,4]  | +0.08 | Plateau-detection         | EXIT via **above-target plateau convergence** -- delta < 0.1 for 2 consecutive loops (loops 5-6). All dimensions >= 3. |

The pipeline reports: "Document converged at 4.20/5.0 (target: 4.0). Score plateaued after 2 additional loops above target." Best-scoring version (loop 6, 4.20) is presented.

Note: with the default `--max-loop 5`, loop 5 would exit via **max_loop cap** -- the target was reached and the score was improving, but the plateau criterion (delta < 0.1 for 2 consecutive loops) was not yet met with only one sub-0.1 delta at loop 5. The pipeline would report: "Max loops reached. Document scored 4.12/5.0 (target: 4.0). Target reached at loop 4; score still improving at exit. Presenting best-scoring version." Setting `--max-loop 7` (as shown above) allows the plateau criterion to be satisfied properly at loop 6.

### Convergence Sketch B -- Oscillation Detection

Hypothetical document where Drafter fixes and regressions alternate. Evidential grounding (D1) and completeness (D4) oscillate between 3 and 4, causing the composite to flip-flop.

| Loop | Composite | Dimensions [D1-D8] | Delta | Direction                                             | Exit decision                                                                                                                                  |
| ---- | --------- | ------------------ | ----- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | 3.40      | [3,4,4,3,3,4,3,3]  | +0.09 | Up (sub-threshold; does not count toward oscillation) | ITERATE -- below target, minimum met                                                                                                           |
| 4    | 3.72      | [4,4,4,4,3,4,3,3]  | +0.32 | Up                                                    | ITERATE -- below target                                                                                                                        |
| 5    | 3.40      | [3,4,4,3,3,4,3,3]  | -0.32 | Down                                                  | Alternation sequence: [up, down] (2 of 3 required)                                                                                             |
| 6    | 3.72      | [4,4,4,4,3,4,3,3]  | +0.32 | Up                                                    | Alternation sequence: [up, down, up] (3 consecutive; oscillation threshold met). EXIT via **oscillation detection** -- loops 4-6 at loop >= 4. |

The pipeline presents the best-scoring version (loop 4 or 6, both at 3.72) with: "Score oscillation detected across loops 4 to 6. Presenting best-scoring version." The per-dimension vectors reveal the pattern: D1 and D4 oscillate in tandem, suggesting the Drafter's improvements to evidential grounding and completeness come at the cost of regressing those same dimensions in the next loop.

### Convergence Sketch C -- Near-Threshold Exit

Hypothetical document that plateaus just below the target. Feasibility (D5) remains stubbornly at 3, preventing the composite from reaching 4.0, but only low-weight dimensions (D7, D8) are still improving.

| Loop | Composite | Dimensions [D1-D8] | Delta | Exit decision                                                                                                                                                                                                                                                                        |
| ---- | --------- | ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3    | 3.60      | [4,4,4,3,3,4,3,3]  | +0.29 | ITERATE -- below target, minimum met. All dimensions >= 3.                                                                                                                                                                                                                           |
| 4    | 3.80      | [4,4,4,4,3,4,4,3]  | +0.20 | ITERATE -- at near_floor (3.8), no dimension below 3, no Major/Critical pointers, but delta not yet < 0.1 for 2 consecutive loops.                                                                                                                                                   |
| 5    | 3.88      | [4,4,4,4,3,4,4,4]  | +0.08 | ITERATE -- delta < 0.1 for 1 loop only.                                                                                                                                                                                                                                              |
| 6    | 3.96      | [4,4,4,4,3,4,5,4]  | +0.08 | EXIT via **near-threshold exit** -- composite 3.96 >= near_floor 3.8 (yes), composite 3.96 < target 4.0 (yes, sub-target), no dimension below 3 (yes, min=3 at D5), no Major/Critical pointers (yes), delta < 0.1 for 2 consecutive loops (yes, loops 5-6), loop >= 4 (yes, loop=6). |

The pipeline reports: "Document scored 3.96/5.0, below the 4.0 target but stable with no Major/Critical issues. Presenting for review." The per-dimension vectors show that D5 (Feasibility, weight 0.12) at 3 is the primary bottleneck; all other dimensions are at 4+.

### Convergence Sketch D -- Regression-Plateau Exit

Hypothetical document that reaches the target at loop 4 but regresses when the Drafter's revision weakens evidential grounding (D1 drops from 5 to 4) despite improvements elsewhere. The score then stagnates below the target, triggering the regression-plateau exit with the best version from the pre-regression loop.

| Loop | Composite | Dimensions [D1-D8] | Delta | Exit decision                                                                                            |
| ---- | --------- | ------------------ | ----- | -------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| 3    | 3.60      | [4,4,4,3,3,4,3,3]  | +0.32 | ITERATE -- below target, minimum met. All dimensions >= 3.                                               |
| 4    | 4.00      | [5,4,4,3,4,4,4,3]  | +0.40 | CONTINUE -- target reached, `target_reached_at = 4`. Plateau-detection phase entered.                    |
| 5    | 3.92      | [4,4,4,4,4,4,4,3]  | -0.08 | ITERATE -- composite dropped below target. D1 regressed (5->4); D4 improved (3->4).                      | delta | < 0.1 for 1 loop.                                     |
| 6    | 3.84      | [4,4,4,4,4,4,3,3]  | -0.08 | EXIT via **regression-plateau** -- `target_reached_at` is set (loop 4), composite < target (3.84 < 4.0), | delta | < 0.1 for 2 consecutive loops (loops 5-6), loop >= 4. |

The pipeline presents the best-scoring version (loop 4, composite 4.00) with: "Document reached 4.0 at loop 4 but has since regressed to 3.84. Presenting best-scoring version (4.00) from loop 4." The per-dimension vectors reveal that the Drafter's loop-5 revision traded evidential grounding for completeness, and a subsequent originality regression at loop 6 stalled recovery.

### Convergence Sketch E -- Persistent Major Pointer Exit

Hypothetical document that reaches near-target quality but one Major pointer resists automated resolution across multiple loops. Completeness (D4) improves but a persistent Major pointer on feasibility (D5) cannot be resolved without domain-expert input.

| Loop | Composite | Dimensions [D1-D8] | Delta | Major pointers                                                       | Exit decision                                                                                                                                                                                                                                                                                                          |
| ---- | --------- | ------------------ | ----- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | 3.60      | [4,4,4,3,3,4,3,3]  | +0.32 | 2                                                                    | ITERATE -- below target, minimum met.                                                                                                                                                                                                                                                                                  |
| 4    | 3.80      | [4,4,4,4,3,4,4,3]  | +0.20 | 1 (IP4.3: feasibility risk analysis missing for cold-start scenario) | ITERATE -- at near_floor, 1 Major pointer remains.                                                                                                                                                                                                                                                                     |
| 5    | 3.85      | [4,4,4,4,3,4,4,4]  | +0.05 | 1 (IP5.2: same feasibility pointer persists, reworded)               | ITERATE -- composite >= near_floor (3.80), 1 Major pointer persists for 1 loop only; condition 5 requires 2 consecutive loops. loop >= 5.                                                                                                                                                                              |
| 6    | 3.88      | [4,4,5,4,3,4,4,4]  | +0.03 | 1 (IP6.1: same feasibility pointer persists)                         | ITERATE -- composite >= near_floor, 1 Major pointer persists for 2 consecutive loops (loops 5-6), but loop >= 5 just met. Condition 5 check: loop >= 5 (yes), composite >= near_floor (3.88 >= 3.80, yes), exactly 1 Major pointer persists for 2 consecutive loops (yes). EXIT via **persistent Major pointer exit**. |

The pipeline presents the document with the persistent Major pointer highlighted: "Document scored 3.88/5.0 (near_floor: 3.80). One Major pointer has persisted for 2 consecutive loops despite automated revision attempts: 'Feasibility risk analysis missing for cold-start scenario.' Please review and decide whether to accept or continue." The per-dimension vectors show that D5 (Feasibility, weight 0.12) at 3 is the stubborn dimension; the Drafter improved other dimensions but the feasibility pointer requires domain expertise that the automated pipeline cannot provide.

---

## References

[1] Zhou, J., Lu, T., Mishra, S., et al. (2023). "Instruction-Following Evaluation for Large Language Models." arXiv:2311.07911.
[2] Xie, J., Zhang, K., Chen, J., et al. (2024). "Adaptive Chameleon or Stubborn Sloth." ICLR 2024 (Spotlight).
[3] NeurIPS 2024 Reviewer Guidelines. Conference on Neural Information Processing Systems.
[4] Ralph, P. et al. (2020). "Empirical Standards for Software Engineering Research." arXiv:2010.03525.
[5] Wieringa, R.J., Maiden, N., Mead, N., & Rolland, C. (2006). "Requirements Engineering Paper Classification." RE 11(1), 102-107.
[6] Zheng, L., Chiang, W.-L., et al. (2023). "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena." NeurIPS 2023.
[7] Khan, A., Hughes, J., et al. (2024). "Debating with More Persuasive LLMs Leads to More Truthful Answers." ICML 2024 (Best Paper).
[8] Panickssery, A., Bowman, S.R., & Feng, S. (2024). "LLM Evaluators Recognize and Favor Their Own Generations." NeurIPS 2024.
[9] Madaan, A., Tandon, N., et al. (2023). "Self-Refine: Iterative Refinement with Self-Feedback." NeurIPS 2023.
[10] Shinn, N., Cassano, F., et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning." NeurIPS 2023.
[11] Huang, J., Chen, X., et al. (2024). "Large Language Models Cannot Self-Correct Reasoning Yet." ICLR 2024.
[12] Du, Y., Li, S., et al. (2024). "Improving Factuality and Reasoning in Language Models through Multiagent Debate." ICML 2024.
[13] Liang, T., He, Z., et al. (2024). "Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate." EMNLP 2024.
[14] Chan, C.-M., Chen, W., et al. (2024). "ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate." ICLR 2024.
[15] OpenAI. (2024). "Structured Outputs." OpenAI Platform Documentation.
[16] Agrawal, A., Suzgun, M., Mackey, L., & Kalai, A. (2024). "Do Language Models Know When They're Hallucinating References?" Findings of EACL 2024.
[17] Shen, C., Cheng, L., et al. (2023). "LLMs are Not Yet Human-Level Evaluators." Findings of EMNLP 2023.
[18] Chiang, C.-H. & Lee, H. (2023). "Can Large Language Models Be an Alternative to Human Evaluations?" ACL 2023.
[19] Stureborg, R. et al. (2024). "Large Language Models are Inconsistent and Biased Evaluators." arXiv:2405.01724.
[20] Hall, T., Beecham, S., & Rainer, A. (2002). "Requirements problems in twelve software companies: an empirical analysis." IEE Proceedings -- Software, 149(5), 153-160.
[21] Echterhoff, J., Liu, Y., Alessa, A., McAuley, J., & He, Z. (2024). "Cognitive Bias in Decision-Making with LLMs." Findings of EMNLP 2024.
[22] Mendez Fernandez, D., Wagner, S., et al. (2017). "Naming the pain in requirements engineering." Empirical Software Engineering, 22(5), 2298-2338.
[23] Shi, F., Chen, X., Misra, K., Scales, N., Dohan, D., Chi, E.H., Scharli, N., & Zhou, D. (2023). "Large Language Models Can Be Easily Distracted by Irrelevant Context." ICML 2023.
[24] Wu, C., Yin, S., Qi, W., Wang, X., Tang, Z., & Duan, N. (2024). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." COLM 2024.
[25] Park, J.S., O'Brien, J.C., Cai, C.J., Morris, M.R., Liang, P., & Bernstein, M.S. (2023). "Generative Agents: Interactive Simulacra of Human Behavior." UIST 2023.
[26] Liu, Y., Iter, D., Xu, Y., Wang, S., Xu, R., & Zhu, C. (2023). "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment." EMNLP 2023.
[27] Kim, S., Shin, J., Cho, Y., Jang, J., Longpre, S., Lee, H., Yun, S., Shin, S., Kim, S., Thorne, J., & Seo, M. (2024). "Prometheus: Inducing Fine-Grained Evaluation Capability in Language Models." ICLR 2024.
[28] Liu, Z., Zhang, Y., Li, P., Liu, Y., & Yang, D. (2024). "A Dynamic LLM-Powered Agent Network for Task-Oriented Agent Collaboration." COLM 2024.
[29] Cemri, M., et al. (2025). "Why Do Multi-Agent LLM Systems Fail?" NeurIPS 2025 D&B (Spotlight).
[30] Hong, S., Zhuge, M., Chen, J., Zheng, X., Cheng, Y., Zhang, C., Wang, J., Wang, Z., Yau, S.K.S., Lin, Z., Zhou, L., Ran, C., Xiao, L., Wu, C., & Schmidhuber, J. (2024). "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework." ICLR 2024 (Oral).
[31] Huang, J.-T., et al. (2025). "On the Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents." ICML 2025.
[32] Chen, W., Su, Y., Zuo, J., Yang, C., Yuan, C., Chan, C.-M., Yu, H., Lu, Y., Hung, Y.-H., Qian, C., Qin, Y., Cong, X., Xie, R., Liu, Z., Sun, M., & Zhou, J. (2024). "AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors." ICLR 2024.
[33] Mialon, G., Dessi, R., Lomeli, M., Nalmpantis, C., Pasunuru, R., Raileanu, R., Roziere, B., Schick, T., Dwivedi-Yu, J., Celikyilmaz, A., Grave, E., LeCun, Y., & Scialom, T. (2023). "Augmented Language Models: a Survey." Transactions on Machine Learning Research (TMLR).
[34] Xu, Z., Shi, Z., & Luo, Y. (2024). "Retrieval Meets Long Context Large Language Models." ICLR 2024.
[35] An, C., Gong, S., Zhong, M., Li, M., Zhang, J., Kong, L., & Qiu, X. (2024). "L-Eval: Instituting Standardized Evaluation for Long Context Language Models." ACL 2024.
[36] Diaz-Aviles, E., Stewart, A., Velasco, E., Denecke, K., & Nejdl, W. (2012). "Towards Personalized Learning to Rank for Epidemic Intelligence Based on Social Media Streams." WWW 2012 Companion.
[37] Feldman, R. (2013). "Techniques and Applications for Sentiment Analysis." Communications of the ACM, 56(4), 82-89.
[38] Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun, J., & Wang, H. (2024). "Retrieval-Augmented Generation for Large Language Models: A Survey." arXiv:2312.10997.
[39] Wang, J., Liang, Y., Meng, F., Shi, H., Li, Z., Xu, J., Qu, J., & Zhou, J. (2023). "Is ChatGPT a Good NLG Evaluator? A Preliminary Study." NewSumm Workshop @ EMNLP 2023.
[40] Ye, S., Kim, D., Kim, S., Hwang, H., Kim, S., Jo, Y., Thorne, J., Kim, J., & Seo, M. (2024). "FLASK: Fine-grained Language Model Evaluation based on Alignment Skill Sets." ICLR 2024 (Spotlight).
[41] Li, G., Hammoud, H.A.A.K., Itani, H., Khizbullin, D., & Ghanem, B. (2023). "CAMEL: Communicative Agents for 'Mind' Exploration of Large Language Model Society." NeurIPS 2023.
[42] Qian, C., Liu, W., Liu, H., Chen, N., Dang, Y., Li, J., Yang, C., Chen, W., Su, Y., Cong, X., Xu, J., Li, D., Liu, Z., & Sun, M. (2024). "ChatDev: Communicative Agents for Software Development." ACL 2024 (Long).
[43] Haustein, S., Peters, I., Sugimoto, C.R., Thelwall, M., & Lariviere, V. (2014). "Tweeting Biomedicine: An Analysis of Tweets and Citations in the Biomedical Literature." JASIST, 65(4), 656-669.
[44] Wang, L., Ma, C., Feng, X., Zhang, Z., Yang, H., Zhang, J., Chen, Z., Tang, J., Chen, X., Lin, Y., Zhao, W.X., Wei, Z., & Wen, J.-R. (2024). "A Survey on LLM-based Autonomous Agents." Frontiers of Computer Science, 18, 186345.
[45] OpenAI. (2023). "GPT-4 Technical Report." arXiv:2303.08774.
[46] Anthropic. (2024). "The Claude 3 Model Family: Opus, Sonnet, Haiku." Anthropic Technical Report.
[47] Yang, Z., Zhang, Y., Wang, Y., Xu, Z., Lin, J., & Sui, Z. (2025). "A Probabilistic Inference Scaling Theory for LLM Self-Correction." EMNLP 2025.
[48] Saito, K., Wachi, A., Wataoka, K., & Akimoto, Y. (2023). "Verbosity Bias in Preference Labeling by Large Language Models." arXiv:2310.10076.
[49] Hu, Z., Song, L., Zhang, J., et al. (2024). "Explaining Length Bias in LLM-Based Preference Evaluations." arXiv:2407.01085.
[50] Wu, M. & Aji, A.F. (2025). "Style Over Substance: Evaluation Biases for Large Language Models." COLING 2025. https://aclanthology.org/2025.coling-main.21/
[51] Xiong, W., Dong, H., et al. (2024). "Iterative Preference Learning from Human Feedback." ICML 2024. https://proceedings.mlr.press/v235/xiong24a.html
[52] Maynez, J., Narayan, S., Bohnet, B., & McDonald, R. (2020). "On Faithfulness and Factuality in Abstractive Summarization." ACL 2020. https://aclanthology.org/2020.acl-main.173/
[53] Tang, L., Shalyminov, I., et al. (2024). "TofuEval: Evaluating Hallucinations of LLMs on Topic-Focused Dialogue Summarization." NAACL 2024. https://aclanthology.org/2024.naacl-long.251/
[54] Pirolli, P. & Card, S. (1999). "Information Foraging." Psychological Review, 106(4), 643-675.
[55] Koo, R., Lee, M., Raheja, V., Park, J.I., Kim, Z.M., & Kang, D. (2024). "Benchmarking Cognitive Biases in Large Language Models as Evaluators." Findings of ACL 2024.
[56] Smit, A., Duckworth, P., Grinsztajn, N., Tessera, K., Barrett, T.D., & Pretorius, A. (2024). "Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs." ICML 2024.
[57] Astrom, K.J. & Murray, R.M. (2021). "Feedback Systems: An Introduction for Scientists and Engineers." 2nd ed. Princeton University Press.

---

### Revision History

| Loop       | Pointers addressed                           | Sources added | Key sections modified                                                                                                                                                                                                                                                                                                                                                                                                          | Net lines |
| ---------- | -------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1          | 5/5 (1C, 2M, 2m): IP1.1-IP1.5                | [47]          | Command Interface, Convergence Logic, Exit conditions, Threshold calibration, Anti-Gaming                                                                                                                                                                                                                                                                                                                                      | +900      |
| 2          | 5/5 (3M, 2m): IP2.1-IP2.5                    | [50]-[54]     | Output Verbosity Control, Context management, Convergence Logic, Appendix A                                                                                                                                                                                                                                                                                                                                                    | +1,320    |
| 3          | 4/4 (2M, 2m): IP3.1-IP3.4 + prose tightening | [55]-[57]     | Integrity Checker, Secondary thresholds, Operational analysis, 11 sections tightened                                                                                                                                                                                                                                                                                                                                           | -500      |
| 4          | 4/4 (1M, 3m): IP4.1-IP4.4                    | --            | Changelog collapsed, Threshold Calibration table trimmed, Appendix A convergence sketch                                                                                                                                                                                                                                                                                                                                        | -120      |
| 5          | 4/4 (1M, 3m): IP5.1-IP5.4                    | --            | Convergence sketch exit-path label corrected (IP5.1), per-dimension scores added to sketches (IP5.2), non-happy-path sketches added (IP5.3), premature exit operationally defined (IP5.4)                                                                                                                                                                                                                                      | +27       |
| 6          | 4/4 (4m): IP6.1-IP6.4                        | --            | Premature exit one-loop horizon rationale added (IP6.1), regression-plateau Convergence Sketch D added (IP6.2), --summary output reduction estimate added (IP6.3), loop 2 composite arithmetic corrected 3.31->3.28 (IP6.4)                                                                                                                                                                                                    | +18       |
| 7          | 4/4 (2M, 2m): IP7.1-IP7.4                    | --            | Default --max-loop 5 plateau trade-off surfaced in Command Interface (IP7.1), persistent Major pointer exit added as condition 5 in exit precedence (IP7.2), oscillation detector amplitude filter                                                                                                                                                                                                                             | delta     | >=0.1 added to prose and pseudocode (IP7.3), summary mode rule-based condensation mechanism specified with extraction patterns and reduction derivation (IP7.4) | +8  |
| 8          | 5/5 (2M, 3m): IP8.1-IP8.4 + additional       | --            | Target-anchoring prevention subsection added to Anti-Gaming Safeguards Tier 2 (IP8.1), document growth monitoring paragraph added to Context management (IP8.2), Sketch B alternation annotations clarified with sequence notation (IP8.3), blind spot check coverage probability disclosed (IP8.4), Sketch B intro D1/D3 corrected to D1/D4 (additional)                                                                      | +8        |
| 9          | 5/5 (5m): IP9.1-IP9.5                        | --            | Pseudocode comment "lowest precedence" corrected to "fourth precedence" for condition 4 (IP9.1), redundant "rather than a hard block" phrasing fixed in single-dimension blocker (IP9.2), Sketch B loop 3 "Up" annotated as sub-threshold for oscillation filter (IP9.3), Convergence Sketch E added for persistent Major pointer exit (IP9.4), parenthetical linking secondary thresholds to 9-threshold system added (IP9.5) | +14       |
| 10 (FINAL) | 3/3 (3m): IP10.1-IP10.3                      | --            | Threshold count "at least 8" corrected to "9" in Threshold Calibration Framework intro (IP10.1), uncited reference [38] (Gao et al. RAG survey) cited in long-document chunking discussion (IP10.2), Sketch C near-threshold exit annotated with explicit predicate checks for parallelism with Sketch E (IP10.3)                                                                                                              | +3        |
