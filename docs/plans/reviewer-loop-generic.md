# Plan: `/pm-review-generic` -- Subject-Adaptive Document Review Pipeline

**Status: COMPLETE** -- v1 -- implemented 2026-03-17

## Context

A generic slash command that takes ANY document (ADR, PRD, RFC, business plan, ops runbook, incident post-mortem, API spec, architecture doc -- in any project, on any subject) and runs an iterative, multi-agent review loop. Unlike `/pm-iterate-plan` (coupled to agent-pm's epic/story model), this command has zero dependencies on `pm` CLI or agent-pm data structures. It is a standalone document improvement pipeline.

The pipeline has 5 agents in a fixed cycle order and a hard constraint: minimum 3 full cycles before the loop can converge. The Evaluator scores on 8 weighted dimensions and must produce at least 3 improvement pointers per round. The iterative refinement architecture draws on established precedents for LLM self-improvement loops, notably Madaan et al.'s Self-Refine [9], which demonstrated that iterative feedback and revision improves output quality without additional training, and Shinn et al.'s Reflexion [10], which showed that verbal reinforcement signals can guide agents toward better performance across successive attempts. The pipeline's multi-agent architecture -- where specialized agents with distinct roles communicate through structured outputs in a fixed sequence -- follows the paradigm established by multi-agent collaboration frameworks such as AutoGen (Wu et al., 2024 [24]) and MetaGPT (Hong et al., 2024 [30]).

**Key design difference from `/pm-review-plan`:** This pipeline is subject-adaptive rather than research-grounded. The grounding prompt is the primary driver of what "quality" means for a given document, not hard-coded academic source standards. The Creative Agent is a permanent pipeline stage (not on-demand), positioned between the Integrity Checker and the Drafter to provide optional improvement suggestions every loop.

---

## Files to Create

| File                                    | Purpose                                     |
| --------------------------------------- | ------------------------------------------- |
| `install/commands/pm-review-generic.md` | The slash command (single file)              |

## Files to Modify

| File                          | Change                                            |
| ----------------------------- | ------------------------------------------------- |
| `install/commands/pm-help.md` | Add `/pm-review-generic` row to the command table |

## Conventions to Follow

From existing slash commands (`pm-iterate-plan.md`, `pm-audit.md`, `pm-work-on-project.md`):

- Arguments via `$ARGUMENTS` token with documented expected shape and defaults
- Sequential sub-agent dispatch (each agent depends on previous output)
- Approval gate before writing any files ("plan-only until approved")
- Structured inter-agent output blocks with consistent naming (`C{round}.{N}`, `IP{round}.{N}`, etc.)
- Round-by-round status reporting to user

---

## Command Interface

```
/pm-review-generic <path-to-document> "<grounding-prompt>" [--max-loop <N>] [--target <score>] [--verbose | --summary]
```

**Required arguments:**

- `<path-to-document>` -- the file to review (resolved relative to cwd)
- `"<grounding-prompt>"` -- free-text instruction from the user that tells the agents WHAT to focus on and HOW to evaluate the document. The grounding prompt is the primary mechanism for adapting the pipeline to the document's subject matter. Examples:
  - `"This is a migration plan from Postgres to CockroachDB. Focus on feasibility, risk coverage, and whether the rollback strategy is credible. Relevant sources are official CockroachDB docs and Postgres migration guides."`
  - `"This is an incident post-mortem. Evaluate whether root cause analysis is thorough, action items are specific and assigned, and timeline is accurate."`
  - `"This is a research summary on federated learning. Ensure all distributed systems claims are backed by peer-reviewed papers."`
  - `"This is a product brief for a B2B SaaS feature. Check that market sizing claims have data backing, competitive analysis is current, and the go-to-market section is actionable."`
  - `"This is an internal RFC for API versioning. Check that the proposed design handles backward compatibility, that alternatives were genuinely considered, and that the migration path is realistic for our team size."`
  - The grounding prompt is injected into every agent's system context as the user's review intent. It shapes which dimensions agents emphasize, what counts as adequate support for claims, and what "quality" means for this specific document.

**Optional:**

- `--max-loop <N>` -- maximum review cycles (default: 5, minimum enforced: 3). Note: the default `--max-loop 5` provides a cost-effective minimum run. For the full benefit of above-target plateau detection, use `--max-loop 7` or higher -- plateau convergence requires 2 consecutive loops of delta < 0.1 after reaching the target, which typically needs 2-3 loops above the target. With `--max-loop 5`, a document that reaches the target at loop 4 has only one post-target loop, insufficient for the 2-loop plateau criterion; the pipeline will exit via max_loop cap rather than plateau convergence.
- `--target <score>` -- composite score convergence target (default: 4.0, range: 3.0-5.0). Once the target is reached, the pipeline enters a **plateau-detection phase** rather than exiting immediately: it continues iterating until the score plateaus (delta < 0.1 for 2 consecutive loops) or max_loop is reached, whichever comes first. This prevents the convergence ceiling problem where documents can never exceed the target score.
- `--verbose` -- full per-agent output displayed to the user after each agent dispatch (default behavior)
- `--summary` -- condensed output mode. Each agent's output is reduced to a structured summary before display; full output is preserved internally for downstream agents. See "Output Verbosity Control" for details.

- File path resolved relative to cwd

---

## Agent Cycle Architecture

```
[Document V(N)] --> Content Reviewer --> Evaluator --> Integrity Checker --> Creative Agent --> Drafter --> [Document V(N+1)]
                         ^                                                                                    |
                         |____________________________________________________________________________________|
```

| #   | Agent                           | Role                                                                                        | Key Output                                      |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | **Content Reviewer**            | Reviews claims, identifies weaknesses, proposes supporting evidence appropriate to doc type  | Claims Inventory + Support Proposals            |
| 2   | **Evaluator**                   | Scores on 8 dimensions, generates min 3 improvement pointers                                | Evaluation Report + Improvement Pointers        |
| 3   | **Evaluator Integrity Checker** | Audits the Evaluator's scores and justifications for soundness                              | Integrity Verdict + Adjusted Scores (if needed) |
| 4   | **Creative Agent**              | Generates optional improvement suggestions based on evaluation pointers                     | Suggestion Brief                                |
| 5   | **Drafter**                     | Revises document addressing pointers, optionally incorporating creative suggestions         | Document V(N+1) + Revision Changelog            |

Key difference from `/pm-review-plan`: the pipeline uses a single Content Reviewer instead of separate Research Reviewer + Researcher Validator, and the Creative Agent is a permanent stage rather than an on-demand spawn.

### Architecture rationale

The pipeline uses 5 fixed agents in a sequential cycle because each agent's output is a direct input to the next: content review, quality evaluation, evaluation auditing, creative suggestion, and document revision have inherent sequential dependencies. The Content Reviewer consolidates claim identification and evidence checking into a single agent because the quality of "evidence" is subject-dependent and best evaluated holistically rather than split across a claim-finder and a citation-verifier. The Creative Agent occupies a permanent slot between Integrity Checker and Drafter because this position gives it access to the finalized evaluation (what's wrong) while feeding directly into the Drafter (who can act on suggestions). Making the Creative Agent permanent eliminates the spawn condition machinery, spawn caps, and spawn failure tracking that complicate on-demand architectures, at the cost of ~1-2K extra tokens per loop when creative suggestions are not needed.

Chen et al. [32] show through AgentVerse that dynamic group composition can outperform fixed structures; the fixed pipeline here trades some adaptability for predictability and simpler orchestration. Extension points include parallelizing Agents 1 and 2, adding domain-specific specialists, or allowing the user to skip the Creative Agent via a `--no-creative` flag.

**Context management note.** Each agent receives only the current loop's context -- the latest document version, the current loop's agent outputs, and summary-level information from prior loops (e.g., score trends, the previous evaluation report) -- rather than the full output history of all prior loops. Context accumulation is an implementation concern for documents reviewed across many loops; the orchestrator is responsible for selecting and summarizing prior-loop context to stay within model context window limits.

### Context management

Context load is not uniform across agents. The table below shows the per-agent input composition for a typical 5-page document (~3,000 words / ~4,000 tokens) at loop N >= 2, with approximate token counts.

| Agent                     | Inputs                                                                                                                         | Approx. tokens (loop N >= 2) |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1 -- Content Reviewer     | Document V(N) + previous evaluation report (full) + previous meta-review summary + score trend array                           | ~8K                          |
| 2 -- Evaluator            | Document V(N) + claims inventory + Agent 1 meta-review + previous evaluation reports + score trend array                       | ~10K                         |
| 3 -- Integrity Checker    | Document V(N) + Evaluator full output + claims inventory                                                                       | ~10K                         |
| 4 -- Creative Agent       | Document V(N) + integrity-checked evaluation report + improvement pointers + grounding prompt                                  | ~8K                          |
| 5 -- Drafter              | Document V(N) + integrity-checked evaluation + claims inventory + Suggestion Brief + original document V(0)                    | ~14K                         |

**Heaviest context load: Agent 5 (Drafter).** The Drafter carries the heaviest absolute load because it receives both the current document and the original document (for voice/format preservation) alongside the full evaluation, claims inventory, and Creative Agent suggestions.

**Summarization strategy.** To keep context loads manageable, only the most recent evaluation report is passed to downstream agents in full. Prior loop results are condensed by the orchestrator into two compact artifacts: (a) a **score trend array** -- a JSON array of per-loop composite scores and per-dimension scores (e.g., `[{loop: 1, composite: 3.2, dimensions: [3,2,3,4,3,4,3,3]}, ...]`), typically <200 tokens for 5 loops; and (b) a **prior-loop summary** -- a brief (300-500 token) narrative summarizing which pointers were addressed, which persist, and any notable regressions or integrity adjustments from prior loops. Raw outputs from loops older than N-1 are not forwarded. Downstream agents always receive the current loop's full uncondensed agent outputs; condensation applies only to the user-facing display (see "Output Verbosity Control") and the prior-loop summary narrative. The orchestrator produces both artifacts via prompt instruction. A known risk of LLM-generated summarization is **condensation infidelity** -- the summary may omit, distort, or hallucinate information (Maynez et al. [52]; Tang et al. [53]). The mitigation is structural: the score trend array is mechanically assembled (not LLM-summarized), and the most recent loop's full outputs are always forwarded unabridged.

**Document growth across loops.** The Drafter adds content each loop -- approximately 200-300 words (~300 tokens) on average. Over a 7-loop run, this adds roughly 2K tokens to the document. The orchestrator should monitor cumulative document growth and emit a warning if the estimated Drafter input exceeds 75% of the model's effective context window. For documents that grow beyond the long-document threshold (~20 pages / ~25K tokens) during the review session, the orchestrator should activate section-level chunking strategies mid-session (see "Long documents" below).

**Minimum context window.** Agents should use models with at least 32K token context windows for typical-length documents (up to ~10 pages). The heaviest agent (Drafter at loop 5+) may reach ~18-20K tokens of input for a 10-page document.

**Long documents (>20 pages).** For documents exceeding approximately 20 pages (~25K tokens), the orchestrator should apply: (a) section-level chunking -- where agents process the document in sections and the orchestrator merges per-section outputs (Xu et al. [34]); (b) more aggressive summarization of prior-loop context; or (c) requiring models with 64K+ context windows. The grounding prompt should note if the document is unusually long so agents can prioritize the most critical sections.

**Pipeline-level operational analysis.** A single review loop dispatches 5 sequential agents. With the minimum of 3 loops, this requires at least 15 LLM calls; a typical 5-loop review dispatches 25 base calls. Token estimates assume a 5-page document (~4K tokens) and current-generation model pricing:

- **Token budget per loop:** Summing per-agent input loads (~8K + ~10K + ~10K + ~8K + ~14K = ~50K input tokens per loop) plus estimated output (~2K per agent x 5 = ~10K output tokens per loop).
- **Latency budget:** Each agent call takes approximately 30-90 seconds depending on context length and model latency. A single loop with 5 sequential agents takes approximately 3-6 minutes wall-clock time. A 5-loop run takes approximately 15-30 minutes.

---

## The 8 Evaluation Dimensions

### Dimension selection rationale

The dimensions are designed to be subject-neutral -- they apply to any document type. The grounding prompt adapts what each dimension means in practice for the specific document being reviewed. The overall approach of using multiple weighted dimensions for LLM-based evaluation follows the methodology established by rubric-based LLM evaluation research: Liu et al.'s G-Eval [26] demonstrated that decomposing evaluation into fine-grained criteria with chain-of-thought reasoning improves alignment with human judgments, and Kim et al.'s Prometheus [27] showed that training evaluator models on detailed, per-dimension rubrics produces more reliable and explainable scores than holistic assessment.

The dimensions draw from three complementary evaluation traditions:

1. **Argumentation and reasoning standards.** Logical coherence, claim support, and problem framing apply to any document that makes assertions and draws conclusions -- from research papers to business cases to operational plans.

2. **Software engineering quality frameworks.** Ralph et al. [4] define quality criteria including completeness, feasibility, and verifiability that apply beyond SE research to any document where implementation follows from the plan.

3. **Communication effectiveness.** Clarity, structure, and actionability determine whether the document achieves its intended purpose with its intended audience.

### Weight derivation

Weights reflect a balanced assessment across document types. The grounding prompt can shift emphasis for specific reviews.

| #   | Dimension                     | Weight | Rationale                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Claim support**             | 0.15   | Are the document's assertions backed by appropriate evidence for this document type? For research docs: peer-reviewed citations. For business plans: market data, internal metrics. For technical specs: official docs, benchmarks, code references. For ops runbooks: tested procedures. The grounding prompt defines what "appropriate" means. |
| 2   | **Problem framing**           | 0.15   | Does the document clearly define the problem it addresses, the scope, constraints, and non-goals? Empirical RE studies find that problem-related issues are among the most frequently reported failures (Hall et al. [20]; Mendez Fernandez et al. [22]).                                                                                      |
| 3   | **Logical coherence**         | 0.15   | Do the document's conclusions follow from its premises? Are there logical gaps, contradictions, or unsupported leaps? Universal across document types.                                                                                                                                                                                         |
| 4   | **Completeness**              | 0.15   | Does the document cover what it needs to? Are there missing sections, unaddressed edge cases, or gaps in the argument? What counts as "complete" is defined by the document type and grounding prompt.                                                                                                                                         |
| 5   | **Feasibility and risk**      | 0.12   | Is the proposed approach realistic? Are risks identified and mitigated? For plans: implementation feasibility. For analyses: methodology soundness. For proposals: resource and timeline realism.                                                                                                                                              |
| 6   | **Clarity and structure**     | 0.12   | Is the document well-organized, readable, and appropriate for its audience? Does the structure serve the content?                                                                                                                                                                                                                              |
| 7   | **Actionability**             | 0.08   | Does the document lead to clear next steps? For research: contribution and implications. For plans: implementation path. For runbooks: executable procedures. For post-mortems: specific action items.                                                                                                                                         |
| 8   | **Verifiability**             | 0.08   | Can the reader independently check the document's key claims? For research: reproduce experiments. For RFCs: test the design. For business plans: audit projections. For runbooks: execute the steps.                                                                                                                                          |

The grounding prompt can shift emphasis -- "Focus on claim support, this is a regulatory filing" effectively upweights dimension 1 in agents' attention, even though the mathematical weights remain fixed. The weights determine the composite score formula; the grounding prompt shapes qualitative scrutiny.

**Weights sum to 1.00.** Scoring: 1-5 integer per dimension. Composite = sum(score_i * weight_i).

---

## Convergence Logic

The convergence logic uses a two-phase approach: (1) a **target-reaching phase** where the pipeline iterates until the composite score reaches the configurable `--target` threshold (default 4.0), and (2) a **plateau-detection phase** where the pipeline continues iterating beyond the target until the score plateaus or max_loop is reached. This two-phase design prevents the convergence ceiling problem identified by Yang et al. [47].

### Threshold rationale

The default convergence target of 4.0 (configurable via `--target`) and the near-threshold floor of 3.8 (always 0.2 below the target) are practitioner-chosen defaults motivated by LLM scoring variance research. Stureborg et al. [19] and Chiang & Lee [18] demonstrate that LLM scoring is noisy and inconsistent across re-evaluations. This motivates a buffer between the convergence target and the near-threshold floor. A target of 4.0 ("good" on the scale) represents a score meaningfully above the midpoint (3.0). The near-threshold floor (always target - 0.2) allows a document that has plateaued within scoring noise of the target to exit rather than loop indefinitely.

### Secondary threshold rationale

Four additional numeric thresholds govern safety mechanisms:

- **Oscillation window = 3 consecutive loops with amplitude filter.** Oscillation detection triggers when the composite score alternates direction (up, down, up or down, up, down) for 3 consecutive loops, subject to a minimum amplitude filter: each alternating step must have |delta| >= 0.1 to count. Steps with |delta| < 0.1 reset the alternation counter. A delta of exactly 0.0 also resets the counter. The amplitude filter aligns with Astrom & Murray's [57] amplitude-qualified oscillation detection.

- **Single-dimension blocker relaxation at composite >= target + 0.2 (default 4.2).** After loop 4, if the composite score reaches target + 0.2 but one dimension remains below 3, condition 2 (no dimension below 3) is downgraded to a user-visible warning rather than a hard block.

- **Regression detection at delta > 0.2.** The orchestrator flags a regression warning when the composite drops by more than 0.2 between consecutive loops.

- **Plateau detection at delta < 0.1 for 2 consecutive loops.** A plateau is detected when the absolute score change is less than 0.1 for 2 consecutive loops.

### Threshold Calibration Framework

| Threshold                           | Value                                                   | Derivation basis                            | Interacts with                                                                     |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Convergence target (composite)      | 4.0 (configurable via `--target`, range 3.0-5.0)       | See "Threshold rationale"; [18], [19], [47] | Near-threshold floor, single-dimension blocker relaxation, plateau-detection phase |
| Near-threshold floor                | target - 0.2 (default 3.8)                              | See "Threshold rationale"; [18], [19]       | Convergence target, plateau detection delta, persistent Major pointer exit         |
| Regression detection delta          | > 0.2                                                   | See "Secondary threshold rationale"         | Plateau detection delta, REGRESSION_CONTEXT trigger                                |
| Plateau detection delta             | < 0.1 for 2 consecutive loops                           | See "Secondary threshold rationale"         | Near-threshold exit, regression detection                                          |
| Oscillation window                  | 3 consecutive alternating loops, each step |delta| >= 0.1 | See "Secondary threshold rationale"; [57]   | Convergence target, plateau detection delta                                        |
| Single-dimension blocker relaxation | Composite >= target + 0.2, after loop 4                 | See "Secondary threshold rationale"         | Convergence target, near-threshold floor                                           |

**Empirical calibration recommendation.** All thresholds are practitioner-chosen starting points. After 10 pipeline runs across varying documents, measure: (a) false-positive regression warnings; (b) false-positive oscillation detections; (c) premature near-threshold exits; (d) delayed exits. **Action thresholds:** false-positive regression rate > 30%: increase delta from 0.2 to 0.3; premature exit rate > 20%: tighten floor to 3.85 or require 3 plateau loops; false-positive oscillation rate > 25%: widen window from 3 to 4.

### Exit condition precedence

When multiple exit conditions are satisfiable in the same loop, the orchestrator applies the following precedence order:

1. **Above-target plateau convergence** (target reached + score plateaued) -- exits with the current version.
2. **Oscillation detection** -- exits with the best-scoring version.
3. **Near-threshold exit** -- exits with the current version and flags the sub-target score.
4. **Regression-plateau exit** -- exits with the best-scoring version when score has been declining or stagnant below target for 2 consecutive loops after at least 4 loops.
5. **Persistent Major pointer exit** -- after loop 5, if composite >= near_floor and only 1 Major pointer persists for 2 consecutive loops, presents the document to the user with the Major pointer highlighted.

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
    dispatch Content Reviewer (Agent 1)
    dispatch Evaluator (Agent 2)
    dispatch Integrity Checker (Agent 3)

    if integrity_verdict == "FAIL":
        re-dispatch Evaluator with integrity failures as context
        re-dispatch Integrity Checker on corrected output
        # max 1 re-run; if still FAIL, use Integrity Checker's adjustments

    dispatch Creative Agent (Agent 4) with integrity-checked evaluation
    dispatch Drafter (Agent 5) with integrity-checked evaluation + Suggestion Brief

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

        # (1) Above-target plateau convergence -- highest precedence
        if quality_criteria_met
          AND delta < 0.1 for 2 consecutive loops:
          converge with current version.
          Report: "Document converged at {score}/5.0 (target: {target}).
           Score plateaued after {loop - target_reached_at} additional
           loops above target."

        # (2) Oscillation detection -- second precedence
        # Amplitude-qualified: each alternating step must have
        # |delta| >= 0.1 to count.
        Oscillation detection: if scores alternate up/down for 3
          consecutive loops
          AND each step has |delta| >= 0.1
          AND loop >= 4:
          Force exit. Report: "Score oscillation detected across
          loops {N-2} to {N}. Presenting best-scoring version."
          Use best_version.

        # (3) Near-threshold exit -- third precedence
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
        if target_reached_at is not None
          AND composite < target
          AND delta < 0.1 for 2 consecutive loops
          AND loop >= 4:
          Force exit with best_version. Report:
          "Document reached {target} at loop {target_reached_at} but
           has since regressed to {score}. Presenting best-scoring
           version ({best_score}) from loop {best_version_loop}."

        # (5) Persistent Major pointer exit
        if loop >= 5 and composite >= near_floor
          and exactly 1 Major pointer persists for 2 consecutive loops:
          Present document to user with the persistent Major pointer
          highlighted. User decides whether to accept or continue.

    else:
        report: "Loop {loop}/3 minimum -- continuing regardless of scores."
```

### Convergence edge cases and mitigations

| Edge case                                      | Risk                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Near-threshold trap**                        | Document at composite target - 0.05 meets conditions 2-3 but not 1.                                                     | Near-threshold exit: at composite >= near_floor with 2 consecutive plateaus at loop >= 4, force convergence and flag to user.                                                                                                                                             |
| **Mid-range plateau (below near_floor)**       | Document plateaus at composite more than 0.2 below target. Too low for any graceful exit.                               | Max_loop cap is the correct exit path. On max_loop exit, report plateau and present best-scoring version with recommendation for targeted human revision.                                                                                                                |
| **Convergence ceiling (target caps quality)**  | With fixed exit-on-target, documents can never score above target.                                                      | Plateau-detection phase: reaching target triggers continued iteration until score stabilizes.                                                                                                                                                                              |
| **Oscillating scores**                         | Evaluator and Drafter create a cycle where changes that fix one dimension regress another.                              | Oscillation detection: composite alternates direction with |delta| >= 0.1 for 3 consecutive loops at loop >= 4, force exit with best version.                                                                                                                            |
| **Single-dimension blocker**                   | One dimension persistently scores 2/5 while all others score 4+.                                                        | After loop 4: if composite >= target + 0.2 and only one dimension below 3, downgrade to warning.                                                                                                                                                                         |
| **Drafter regression**                         | Drafter's changes lower composite by > 0.2.                                                                             | Warn user, offer previous version. Track best-scoring version separately. Regression-plateau exit provides additional safety net.                                                                                                                                         |
| **Integrity re-run loop**                      | Evaluator fails integrity check, is re-run, and fails again.                                                            | Hard cap: maximum 1 re-run per loop. On second failure, proceed with Integrity Checker's adjustments and flag to user.                                                                                                                                                   |
| **High-quality with persistent Major pointer** | Document at near_floor to target - 0.01 with one remaining Major pointer. Neither near-threshold nor above-target apply. | After loop 5: 1 Major pointer persistent for 2 loops, present to user with pointer highlighted.                                                                                                                                                                          |
| **Post-target regression**                     | Document reaches target then Drafter causes regression below target.                                                     | Regression-plateau exit: if target was reached but score regressed and stagnated, exit with best version.                                                                                                                                                                 |
| **Simultaneous exit triggers**                 | Multiple exit conditions satisfiable in same loop.                                                                       | Explicit precedence: above-target plateau > oscillation > near-threshold > regression-plateau > persistent Major pointer.                                                                                                                                                 |

---

## Output Verbosity Control

Pipeline runs produce substantial output -- five agents per loop, each generating structured reports. The `--verbose` and `--summary` flags control how much agent output is displayed to the user. Both modes preserve the full agent output internally -- downstream agents always receive complete structured data regardless of display mode.

| Mode                  | Flag                   | Behavior                                                                           |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| **Verbose** (default) | `--verbose` or omitted | Full agent output displayed after each agent dispatch.                              |
| **Summary**           | `--summary`            | Each agent's output is reduced to a structured summary before display.              |

### Summary mode specifications

In `--summary` mode, condensation uses **rule-based extraction** from the agents' structured markdown output -- not LLM-based summarization. The orchestrator parses known markdown patterns and extracts specific fields. This extraction is deterministic and zero-cost.

| Agent                     | Summary display                                                                                                                               | Full output preserved for |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1 -- Content Reviewer     | Number of claims inventoried, number with weak/missing support, top 3 support proposals. Meta-review condensed to 1-sentence verdict.          | Agents 2, 5              |
| 2 -- Evaluator            | Dimension scores table (full). Composite score and delta. Pointer count by severity. Only Critical and Major pointers shown; Minor as count.   | Agents 3, 4, 5           |
| 3 -- Integrity Checker    | Integrity verdict (PASS/CORRECTED/FAIL). Number of challenged dimensions. Blind spot check result (1-line). Only CHALLENGED items in detail.   | Agents 4, 5              |
| 4 -- Creative Agent       | Count of suggestions generated. 1-line summary per suggestion. Adoption status tracked in next loop.                                           | Agent 5                  |
| 5 -- Drafter              | Revision statistics table (full). Changelog condensed to pointer-addressed list (1 line per pointer). Creative suggestions adopted/declined.    | Next loop                |

### Progressive disclosure

In both modes, the orchestrator provides a **loop summary** after each complete loop iteration:

```
=== Loop {N}/{max_loop} complete ===
Composite: {score}/5.0 (delta: {delta})  Target: {target}
Pointers: {critical}C / {major}M / {minor}m  |  Suggestions: {adopted}/{total}
Status: {ITERATING | TARGET_REACHED_CONTINUING | NEAR_THRESHOLD | OSCILLATING | CONVERGED}
```

### Agent-level front-loading

All agents are instructed to **front-load key findings** in their output: the most important result appears in the first 3 lines of the agent's output block. This follows information foraging theory (Pirolli & Card [54]).

```
### Agent {N} -- {Role}: Key Finding
{1-3 sentence summary of the most important result from this agent's work}
```

---

## Anti-Gaming Safeguards

### Tier 1: Mechanically enforceable checks

These safeguards are verified by the orchestrator through deterministic inspection. No LLM judgment required. Tier 1 checks enforce structural compliance but do not guarantee substantive quality -- Tier 2 safeguards cover the quality gap.

| Check                           | What the orchestrator validates                                                                                        | Enforcement action                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Pointer count**               | Count `#### Pointer IP{loop}.{N}:` headings in Evaluator output. Must be >= 3.                                        | If < 3: re-dispatch Evaluator with minimum pointer instruction.                                      |
| **Major pointer in loops 1-3**  | For loops 1-3: at least one `**Severity:** Critical` or `**Severity:** Major`.                                         | If absent: re-dispatch with severity instruction.                                                    |
| **Evidence-backed high scores** | For each dimension scored 4+: Evidence cell contains a quoted substring of the document.                               | Flag non-matching quotes to Integrity Checker as priority audit targets.                             |
| **Claims inventory minimum**    | Count `#### Claim C{loop}.{N}:` headings in Content Reviewer output. Must be >= 5.                                    | If < 5: re-dispatch Content Reviewer.                                                                |
| **Drafter statistics presence** | Drafter output contains `### Revision Statistics` with non-zero "Pointers addressed" and "Sections modified".          | If missing or zeros: flag "stalled improvement" warning.                                             |
| **Convergence score source**    | Orchestrator uses only integrity-adjusted composite for convergence, never raw Evaluator scores.                       | Structural: extract scores from Integrity Checker output, not Evaluator's.                           |
| **Creative Agent output cap**   | Creative Agent output does not exceed ~1,500 tokens.                                                                    | If exceeded: truncate to first 1,500 tokens before passing to Drafter. Log truncation.               |

**Format compliance dependency.** Tier 1 checks depend on agents producing output in specific markdown patterns. LLM instruction-following is high but not perfect (Zhou et al. [1]). **Fallback behavior:** on parse failure, re-dispatch once with format correction. On second failure, proceed with best-effort extraction.

### Tier 2: Judgment-dependent safeguards (inter-agent accountability)

| Risk                         | Gaming behavior                                          | Safeguard                                                                                                                                   | Auditing agent                        |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Shallow review**           | Content Reviewer flags only obvious claims               | Evaluator cross-checks claim inventory against document sections; flags uncovered sections                                                   | Evaluator                             |
| **Score inflation**          | Evaluator inflates scores to trigger convergence         | Quote-verification (Tier 1) catches missing evidence; Integrity Checker audits score-evidence alignment                                      | Integrity Checker                     |
| **Superficial pointers**     | Evaluator produces trivial pointers to meet minimums     | Integrity Checker audits pointer actionability and severity calibration; Content Reviewer meta-review (rounds 2+) audits prior pointer quality | Integrity Checker + Content Reviewer  |
| **Fabricated quotes**        | Evaluator cites text not in the document                 | Orchestrator substring search (Tier 1); Integrity Checker catches paraphrased misattribution                                                | Orchestrator + Integrity Checker      |
| **Cosmetic drafting**        | Drafter makes token changes                              | Statistics requirement (Tier 1) + score trend tracking                                                                                      | Evaluator (next loop)                 |
| **Echo-chamber convergence** | All agents agree too quickly                             | Hard minimum 3 cycles; meta-review requirement (Content Reviewer must challenge prior Evaluator in rounds 2+)                                | Structural + Content Reviewer         |
| **Creative over-reliance**   | Drafter adopts all Creative Agent suggestions uncritically | Evaluator in next loop penalizes unsubstantiated claims introduced from suggestions; Drafter must note which suggestions were adopted        | Evaluator (next loop)                 |

### Target-anchoring prevention

The `--target` score is a user-facing convergence parameter, not a scoring input. The `--target` value is **not injected** into Agent 2 (Evaluator) or Agent 3 (Integrity Checker) prompt contexts. The convergence verdict is produced by the **orchestrator** based on integrity-checked scores. This separation prevents anchoring bias (Echterhoff et al. [21]; Shi et al. [23]).

### Integrity Checker limitations

The Integrity Checker (Agent 3) is an LLM auditing another LLM's output. While it is a separate agent, it shares the same model family and training distribution:

1. **Shared blind spots.** If the Evaluator's error stems from systematic training-data bias, the Integrity Checker likely shares it. Multi-agent debate improves over single-agent evaluation (Du et al. [12]; Chan et al. [14]) but does not eliminate shared failure modes.

2. **Anchoring effect.** The Integrity Checker sees the Evaluator's scores before auditing them (Echterhoff et al. [21]; Shi et al. [23]). The blind spot check uses instructional isolation -- asking the Checker to score dimensions before consulting the Evaluator's scores. **Upgrade path:** promote to two-phase dispatch if empirical data shows underperformance.

3. **Mitigation: blind spot check.** The Integrity Checker independently scores 2-3 randomly selected dimensions without seeing the Evaluator's scores, then compares. A discrepancy of 2+ points triggers a CHALLENGED verdict. Over a 5-loop run with 3 blind-scored dimensions per loop, each dimension has ~90% probability of being independently checked at least once.

4. **Mitigation: high-adjustment flag.** If 3+ dimensions adjusted in a single loop, flag to user.

5. **Honest framing.** The Integrity Checker does not match independent human review. For high-stakes documents, treat pipeline output as a strong draft requiring human sign-off.

---

## Agent Prompt Specifications

### Agent 1: Content Reviewer

**Input:** Document V(N) + previous evaluation report (rounds 2+) + **user's grounding prompt**
**Output:** Meta-Review (rounds 2+) + Claims Inventory + Support Proposals

The Content Reviewer is the pipeline's subject-adaptive front end. Its behavior is shaped by the grounding prompt, which defines what counts as a "claim," what constitutes adequate "support," and where to look for evidence.

- **Meta-Review (rounds 2+ only):** Before reviewing the document, audit the previous Evaluator's scores. Identify at least 1 thing the Evaluator missed or underweighted, OR write a "No Gaps Found" justification. Also audit the previous round's pointer quality.
- Inventories every significant claim, assertion, or decision in the document.
- For each claim: current support status:
  - **Supported** -- adequate evidence exists in the document (citation, data reference, internal link, code reference, tested procedure, etc.)
  - **Partially supported** -- some evidence exists but is incomplete, outdated, or tangential
  - **Unsupported** -- no evidence provided for a claim that needs it
  - **Assumption** -- the claim is explicitly or implicitly an assumption; flag whether it should be explicitly marked as such
- Proposes specific supporting evidence appropriate to the document type:
  - For technical docs: official documentation URLs, benchmarks, code references
  - For research-heavy docs: papers with author, title, venue, year
  - For business docs: market reports, data sources, competitive references
  - For operational docs: tested procedures, monitoring links, runbook references
  - The grounding prompt guides what sources are appropriate -- the Content Reviewer does NOT apply a fixed source quality standard
- **Minimum 5 claims** reviewed per round (including implicit assumptions and methodology choices)
- For rounds 2+: focus on claims still inadequately supported, not already-resolved ones
- The **grounding prompt** guides which claims to prioritize
- When the Content Reviewer cannot find supporting evidence for a claim, it should clearly state what it searched for and why it came up empty, so the Creative Agent and Drafter can take informed action

### Agent 2: Evaluator

**Input:** Document V(N) + Claims Inventory + Agent 1's Meta-Review + previous evaluation reports + score trend + **user's grounding prompt**
**Output:** Dimension Scores table + Score Trend + Improvement Pointers + Convergence Assessment

- Scores each of the 8 dimensions (1-5 scale)
- **Anti-gaming: evidence-backed scores.** A score of 4 or 5 on any dimension requires quoting the specific document passage that justifies the rating.
- **Anti-gaming: cross-check claim coverage.** Compare Agent 1's Claims Inventory against document sections. Flag any sections with significant claims that Agent 1 did not inventory.
- **Anti-gaming: penalize unsupported claims.** If the Claims Inventory contains unsupported claims that the document presents as established facts, the Claim Support score must reflect this.
- **HARD CONSTRAINT: Minimum 3 pointers per round**, regardless of scores.
- **HARD CONSTRAINT: At least 1 pointer must be Major or higher for rounds 1-3.**
- Pointer severity: Critical (document is wrong or dangerous) / Major (incomplete or misleading) / Minor (could be better)
- Each pointer must cite specific text/sections and provide an actionable recommendation (not "consider improving" but "add a paragraph in section X addressing Y")
- Must respond to Agent 1's Meta-Review: if the meta-review identified a missed weakness, address it
- For rounds 2+: acknowledge improvements before listing remaining issues

### Agent 3: Evaluator Integrity Checker

**Input:** Document V(N) + Evaluator's full output (scores, evidence, pointers) + Claims Inventory + **user's grounding prompt**
**Output:** Integrity Verdict + Adjusted Evaluation Report (if corrections needed)

This agent prevents the Evaluator from gaming the loop into convergence through inflated scores or hollow justifications.

- **Score-evidence alignment audit.** For each dimension score, verify that quoted textual evidence actually supports the assigned score:
  - Does the quoted passage exist in the document? (catch fabricated quotes)
  - Does the passage demonstrate what the Evaluator claims? (catch misattribution)
  - Is a score of 4+ justified by evidence, or is it generic praise? (catch inflation)
  - Is a score of 1-2 justified, or is the Evaluator excessively punitive? (catch deflation)
- **Blind spot check.** Before reviewing the Evaluator's scores, independently score 2-3 randomly selected dimensions by reading the document directly. A discrepancy of 2+ points triggers CHALLENGED.
- **Pointer quality audit.** For each pointer:
  - Is the recommendation actionable and specific?
  - Does the severity match the actual issue?
  - Is the pointer grounded in actual document content?
- **Justification coherence check.** Flag circular reasoning, tautological evidence, contradictions between scores, and score-pointer mismatches.
- **Convergence integrity.** If the Evaluator's verdict is APPROVE, verify evidence genuinely supports convergence.

**Output format:**

```
### Blind Spot Check

| Dimension (randomly selected) | Integrity Checker's blind score | Evaluator's score | Discrepancy | Verdict |
|-------------------------------|-------------------------------|-------------------|-------------|---------|
| <dimension> | X/5 | Y/5 | |Y-X| | PASS / CHALLENGED |

### Integrity Audit

| Dimension | Evaluator Score | Integrity Check | Adjusted Score | Reason |
|-----------|----------------|-----------------|----------------|--------|
| ... | ... | ... | ... | ... |

### Challenged Items

#### Challenge IC{loop}.{N}: <title>
**Target:** Dimension score / Pointer IP{loop}.{M}
**Issue:** <what is wrong>
**Evidence:** <the quoted text vs what it actually says>
**Adjustment:** <corrected score or pointer severity>

### Pointer Quality Audit
- Actionable pointers: N of M
- Correctly-severity'd pointers: N of M
- Pointers with fabricated/misattributed evidence: N

### Integrity Verdict
- **PASS** -- Forward to Creative Agent and Drafter as-is.
- **CORRECTED** -- Adjustments made. Forward corrected version.
- **FAIL** -- Evaluator output fundamentally unreliable (>50% challenged).
  Re-run the Evaluator with integrity failures as context.
```

**Rules:**

- The blind spot check is performed BEFORE reading the Evaluator's scores.
- On CORRECTED: adjusted scores replace originals before reaching the Creative Agent and Drafter.
- On FAIL: orchestrator re-dispatches Evaluator with integrity failures as "you were caught" preamble. Maximum 1 re-run per loop.
- If 3+ dimensions adjusted in a single loop, flag to user.

### Agent 4: Creative Agent

**Input:** Document V(N) + Integrity-checked evaluation report (scores + pointers) + Claims Inventory + **user's grounding prompt**
**Output:** Suggestion Brief

The Creative Agent is a permanent pipeline stage that generates optional improvement suggestions every loop. Its purpose is to expand the solution space available to the Drafter by offering alternative framings, cross-domain parallels, structural ideas, and lateral thinking that the evaluation pipeline's focused critique might not surface.

**Behavioral rules:**

1. **Suggestions, not directives.** Every suggestion is framed as optional. Prefix with "Consider:" or "The Drafter might:" -- never "The Drafter must:" or "Change X to Y."
2. **Non-authoritative.** No suggestion is treated as evidence. If the Creative Agent proposes a source or reference, it is tagged `[SUGGESTION]` -- the Drafter must independently verify before citing.
3. **Subject-adaptive creativity.** The grounding prompt shapes the Creative Agent's orientation:
   - Research doc: explore alternative theoretical frameworks, cross-disciplinary parallels, methodology alternatives
   - Product RFC: suggest simpler architectures, UX considerations, competitive alternatives, phased rollout strategies
   - Business plan: identify market analogies, risk scenarios not considered, alternative revenue models
   - Ops runbook: suggest automation opportunities, failure mode coverage gaps, monitoring improvements
   - Incident post-mortem: surface similar incidents from other domains, systemic patterns, prevention strategies
4. **Concise output.** Target ~500-1,000 tokens. The Creative Agent is a spark generator, not a secondary evaluator.
5. **Pointer-aware.** Generate at least one suggestion per Major/Critical pointer. For Minor pointers, generate suggestions only if a non-obvious improvement path exists.
6. **Lateral suggestions.** Beyond pointer-specific suggestions, the Creative Agent may offer 1-3 "lateral" suggestions -- improvements the Evaluator didn't surface but that could strengthen the document (missing perspectives, structural reorganization, audience-awareness issues).

**Output format:**

```
### Suggestion Brief -- Loop {N}

#### Pointer-Specific Suggestions

##### For IP{loop}.{M}: <pointer title>
- Consider: <suggestion 1>
- Consider: <suggestion 2>

[repeat for each Major/Critical pointer]

#### Lateral Suggestions

- Consider: <suggestion addressing something the evaluation didn't flag>
- Consider: <structural/framing suggestion>

### Summary
- Pointer-specific suggestions: N
- Lateral suggestions: N
- Total suggestions: N
```

**Quality constraints:**

- The Evaluator (next loop) treats claims introduced from Creative Agent suggestions the same as any other claim -- if they lack appropriate support, the Claim Support dimension is penalized.
- The Drafter's changelog must note which Creative Agent suggestions were adopted, partially adopted, or declined. This creates an audit trail without requiring the elaborate `[CREATIVE-SOURCE]` tagging machinery.

### Agent 5: Drafter

**Input:** Document V(N) + Integrity-checked Evaluation Report + Claims Inventory + Suggestion Brief + Original document (for reference) + **user's grounding prompt** + REGRESSION_CONTEXT (if previous loop regressed)
**Output:** Complete revised Document V(N+1) + Revision Changelog + Statistics

- Address ALL Critical pointers (mandatory)
- Address all Major pointers (expected; justify if declined)
- Address Minor pointers at discretion
- **Review Creative Agent suggestions:** For each suggestion, decide whether to adopt, partially adopt, or decline. The Drafter is under no obligation to adopt any suggestion -- they are optional inputs.
- **Preserve original format**: if ADR, keep ADR template; if RFC, keep RFC structure; if runbook, keep operational format
- **Preserve original voice**: surgical improvements, not a rewrite
- Output is the COMPLETE revised document (not a diff) -- copy-pasteable into the file
- **Regression recovery:** If REGRESSION_CONTEXT is present, prioritize reverting or reworking changes identified as harmful before addressing new pointers.
- **Anti-gaming: quantified changelog.** Must report: words added/removed, sections modified, pointers addressed, creative suggestions adopted/declined. The orchestrator compares this against the Evaluator's next-round score.

---

## Orchestrator Validation Protocol

Between each agent dispatch, the orchestrator performs mechanical checks on the agent's output before passing it to the next agent.

### After Agent 1 (Content Reviewer):

1. Count `#### Claim C{loop}.{N}:` headings. If count < 5, re-dispatch with minimum claim instruction.
2. For loops 2+: verify `### Meta-Review` section exists. If absent, re-dispatch.

### After Agent 2 (Evaluator):

1. Count `#### Pointer IP{loop}.{N}:` headings. If count < 3, re-dispatch with pointer-count instruction.
2. For loops 1-3: scan for at least one `**Severity:** Critical` or `**Severity:** Major`. If absent, re-dispatch.
3. For each dimension scored 4+: verify Evidence cell contains a quoted string that is a substring of the document. Flag non-matches to Integrity Checker.

### After Agent 3 (Integrity Checker):

1. Count CHALLENGED dimensions. If 3+, flag to user.
2. If >50% dimensions challenged, emit `EVALUATOR_CAPABILITY_FAILURE` and follow escalation path.
3. Extract integrity-adjusted composite for convergence tracking.
4. Log blind spot check results. If zero discrepancies for 3+ consecutive loops during stagnation/regression, emit `CHECKER_SILENT_FAILURE` advisory.

### After Agent 4 (Creative Agent):

1. Verify output contains `### Suggestion Brief` header. If absent, log warning and pass empty suggestion brief to Drafter.
2. Check token count. If > 1,500 tokens, truncate to first 1,500 tokens before passing to Drafter.
3. Verify at least one suggestion exists for each Major/Critical pointer from the evaluation. If missing, log but do not re-dispatch (suggestions are optional).

### After Agent 5 (Drafter):

1. Verify `### Revision Statistics` section exists with non-zero values. If missing or all zeros, flag "stalled improvement" warning.
2. Verify `### Creative Agent Suggestions` section exists documenting which suggestions were adopted/declined. If absent, log warning.
3. Compare integrity-adjusted composite from this loop against previous loop. If drop > 0.2, report regression warning, preserve previous version as rollback candidate, and prepare `REGRESSION_CONTEXT` for next loop's Drafter.

**Re-dispatch limits:** Each agent may be re-dispatched at most once per loop for failing mechanical checks. The Evaluator (Agent 2) may additionally be re-dispatched once for integrity failure and once for `EVALUATOR_CAPABILITY_FAILURE`, for a maximum of 3 re-dispatches per loop.

---

## Agent Failure Escalation

### Failure types and escalation paths

**Agent 1 (Content Reviewer): insufficient depth.** When the Content Reviewer produces a shallow claims inventory (fewer than 5 claims or only surface-level observations), the orchestrator re-dispatches with minimum count instruction. If the second attempt is also shallow, proceed with available output and log a warning. The Evaluator's cross-check of claims against document sections serves as a secondary depth check.

**Agent 2 (Evaluator): semantic incoherence.** When the Integrity Checker challenges more than 50% of dimension scores, the orchestrator emits `EVALUATOR_CAPABILITY_FAILURE`:

- Re-dispatch Evaluator with Integrity Checker challenges as context.
- If second attempt also fails (>50% challenged), proceed with Integrity Checker's adjusted scores and flag to user.
- Log the failure in score trend metadata.

**Agent 3 (Integrity Checker): silent failure.** If blind spot check produces zero discrepancies for 3+ consecutive loops while scores stagnate or regress, emit `CHECKER_SILENT_FAILURE` advisory. Does not halt pipeline. If two-phase dispatch is available, auto-enable for next loop.

**Agent 4 (Creative Agent): unhelpful suggestions.** The Creative Agent's failure mode is producing irrelevant or vacuous suggestions. Since suggestions are optional inputs to the Drafter, this has zero pipeline impact -- the Drafter simply ignores them. No escalation, no re-dispatch. If the Creative Agent produces empty output, the orchestrator passes an empty Suggestion Brief to the Drafter and logs a note. The pipeline's quality is not dependent on the Creative Agent.

**Agent 5 (Drafter): destructive revision.** When composite drops > 0.2 after the Drafter's changes, the next loop's Drafter receives `REGRESSION_CONTEXT`:

- Pre-regression document V(N-1) and its scores
- Post-regression document V(N) and its scores
- Per-dimension delta table
- Previous Drafter's revision changelog
- Instruction to prioritize reverting harmful changes

---

## Loop Exit and Approval Gate

### On above-target plateau convergence:

Report final composite score, score progression, dimension breakdown, and present the full revised document. Options:

- `approve` -- overwrite original file
- `approve-copy` -- write to `{stem}.reviewed{ext}` alongside original
- `edit <instructions>` -- one more Drafter cycle with human feedback
- `reject` -- discard all changes

### On near-threshold exit:

Report current score, note target not reached but quality is stable. Same options plus a note: "The document scored {score}/5.0, below the {target} target."

### On max_loop reached without convergence:

Report current score, outstanding pointers, and present best version. Same options plus:

- `continue <N>` -- run N more loops

### On regression-plateau exit:

Report current score, loop where target was reached, and present best-scoring version. Same options as convergence.

**Plan-only until approved.** No file writes until explicit user approval.

---

## Verification

After implementation:

1. **Dry run with non-research document:** Point `/pm-review-generic` at a technical RFC or ops runbook and verify:
   - All 5 agents execute in sequence
   - Content Reviewer produces claims inventory with subject-appropriate support proposals (not academic citations)
   - Evaluator scores 8 dimensions and produces >= 3 pointers
   - Orchestrator mechanical checks execute between agents
   - Integrity Checker audits Evaluator's scores including blind spot check
   - Creative Agent produces Suggestion Brief with pointer-specific and lateral suggestions
   - Drafter produces complete revised document noting which suggestions were adopted
   - Loop runs minimum 3 rounds before convergence check
2. **Dry run with research-heavy document:** Point at a research summary with grounding prompt requesting peer-reviewed citations. Verify that the Content Reviewer adapts to propose academic sources and the Evaluator evaluates claim support in terms of citations.
3. **Creative Agent integration:** Verify:
   - Creative Agent runs every loop (permanent stage)
   - Output stays within ~1,500 token cap
   - Drafter changelog documents suggestion adoption decisions
   - Evaluator in subsequent loop penalizes unsubstantiated claims from adopted suggestions
4. **Convergence edge cases:** Test that:
   - Near-threshold exit triggers at composite 3.8-3.99 with plateau at loop >= 4
   - Oscillation detection triggers after 3 alternating score directions at loop >= 4
   - Single-dimension blocker downgrades to warning after loop 4
   - Exit precedence is respected when multiple conditions trigger simultaneously
5. **Evaluator failure escalation:** Test `EVALUATOR_CAPABILITY_FAILURE` when >50% scores challenged
6. **Integrity Checker silent failure:** Test `CHECKER_SILENT_FAILURE` advisory fires during stagnation
7. **Drafter regression recovery:** Test `REGRESSION_CONTEXT` assembly and forwarding after > 0.2 regression
8. **Mechanical checks:** Verify orchestrator re-dispatches agents failing structural validation
9. **Format compliance fallback:** Verify format parsing failure triggers re-dispatch, not silent data loss
10. **Format preservation:** Confirm Drafter maintains original document template structure
11. **Help registration:** Verify `/pm-review-generic` appears in `/pm-help` output
12. **Install coverage:** Confirm `install/install.sh` glob picks up the new file

---

## Appendix A: Worked Example -- Single Loop Iteration

This appendix walks through one complete loop iteration (loop 2) for a hypothetical 4-page internal RFC: "Migrating User Authentication from Session Cookies to JWTs." The document is approximately 2,800 words (~3,700 tokens). Loop 1 completed with composite 3.15/5.0. The grounding prompt is: "Focus on feasibility and risk -- our team has 3 engineers and needs to ship in 6 weeks. Check that the migration path handles backward compatibility with existing mobile clients."

### Agent 1 -- Content Reviewer (~1,800 output tokens)

**Input:** Document V(2) (~3.7K tokens) + loop 1 evaluation report (~1.8K tokens) + loop 1 meta-review summary (~400 tokens) + score trend array (~50 tokens). Total input: ~6K tokens.

**Key finding (front-loaded):** 3 of 7 significant claims lack support; the "zero-downtime migration" claim in Section 4 has no supporting evidence.

**Output summary:**

- Claims inventoried: 7 (C2.1 through C2.7)
- Support proposals: 4 new evidence items proposed
  - C2.1 (JWT token size claim): Link to official JWT RFC 7519 specification for size characteristics
  - C2.3 (session revocation claim): Reference to Auth0 documentation on JWT revocation patterns
  - C2.5 (performance improvement claim): Suggest adding benchmark data from the team's own load testing
  - C2.6 (mobile client compatibility): Reference to the team's mobile API contract documentation
- Unsupported claims: 2
  - C2.4: "Zero-downtime migration is achievable via dual-auth period" -- no evidence for the dual-auth approach working with the existing nginx configuration
  - C2.7: "JWT adoption will reduce authentication latency by 40%" -- specific number with no source
- Assumption flagged: 1
  - C2.2: "Mobile clients can be updated within the 6-week window" -- presented as fact but is an assumption about mobile release cycle
- Meta-review: "Loop 1 Evaluator gave Feasibility a 3 but did not penalize the missing migration rollback strategy. The RFC proposes a one-way migration with no documented rollback path."

### Agent 2 -- Evaluator (~2,200 output tokens)

**Input:** Document V(2) + claims inventory + Agent 1 meta-review + loop 1 evaluation report + score trend. Total input: ~9K tokens.

**Output summary:**

| #   | Dimension             | Score | Delta from loop 1 |
| --- | --------------------- | ----- | ----------------- |
| 1   | Claim support         | 3     | +1                |
| 2   | Problem framing       | 4     | 0                 |
| 3   | Logical coherence     | 3     | 0                 |
| 4   | Completeness          | 3     | +1                |
| 5   | Feasibility and risk  | 2     | 0                 |
| 6   | Clarity and structure | 4     | 0                 |
| 7   | Actionability         | 3     | 0                 |
| 8   | Verifiability         | 2     | 0                 |

Composite: 3.04/5.0 (delta: -0.11 from loop 1's 3.15). Convergence verdict: ITERATE.

Pointers generated: 4

- IP2.1 (Critical): Add migration rollback strategy -- Section 4 proposes dual-auth but has no rollback plan if JWT validation fails in production. With 3 engineers and 6-week timeline, a failed migration without rollback is catastrophic.
- IP2.2 (Major): Replace or qualify the "40% latency reduction" claim (C2.7) -- either add benchmark data or reframe as a hypothesis to be validated during pilot.
- IP2.3 (Major): Address mobile client update assumption (C2.2) explicitly -- state as assumption, identify risk if mobile release takes longer than 6 weeks, and describe the fallback.
- IP2.4 (Minor): Section 3 "Alternatives Considered" mentions OAuth2 but does not explain why opaque tokens were rejected in favor of JWTs given the revocation complexity trade-off.

### Agent 3 -- Integrity Checker (~1,400 output tokens)

**Input:** Document V(2) + Evaluator full output + claims inventory. Total input: ~9K tokens.

**Output summary:**

Blind spot check (dimensions 5, 7 randomly selected):

- Feasibility and risk: blind score 2, Evaluator score 2, discrepancy 0 -- PASS
- Actionability: blind score 3, Evaluator score 3, discrepancy 0 -- PASS

Challenged items: 0. All score-evidence alignments verified. Pointer severity ratings confirmed appropriate -- the missing rollback strategy correctly flagged as Critical given the team constraints.

**Integrity verdict: PASS.** Forward to Creative Agent and Drafter as-is.

### Agent 4 -- Creative Agent (~700 output tokens)

**Input:** Document V(2) + integrity-checked evaluation + improvement pointers + grounding prompt. Total input: ~8K tokens.

**Output summary:**

```
### Suggestion Brief -- Loop 2

#### Pointer-Specific Suggestions

##### For IP2.1 (Critical): Migration rollback strategy
- Consider: A feature-flag approach where JWT validation is wrapped in a toggle. If issues arise, flip the flag to fall back to session cookies. This avoids a "big bang" migration and lets the team roll back per-service.
- Consider: A canary deployment pattern -- migrate 5% of traffic to JWT first, monitor error rates for 48 hours, then ramp up. This gives the 3-person team a safe ramp that fits the 6-week timeline.

##### For IP2.2 (Major): Latency reduction claim
- Consider: Rather than claiming 40% improvement, frame Section 3.2 around the *architectural* benefits (stateless auth, reduced database round-trips) and commit to measuring latency improvement during pilot. This makes the claim verifiable without requiring upfront benchmarks.

##### For IP2.3 (Major): Mobile client update assumption
- Consider: Add a "backward compatibility bridge" subsection describing how existing mobile clients using session cookies will be supported during a transition period. This reduces dependency on the mobile release cycle.

#### Lateral Suggestions

- Consider: The RFC doesn't mention token refresh strategy. With JWTs, short-lived access tokens + refresh tokens is standard but adds complexity. Addressing this would strengthen both Completeness and Feasibility dimensions.
- Consider: Adding a "Week-by-week migration timeline" table that maps the 6-week constraint to specific milestones. This would make the document significantly more actionable for the 3-person team.

### Summary
- Pointer-specific suggestions: 4
- Lateral suggestions: 2
- Total suggestions: 6
```

### Agent 5 -- Drafter (~2,800 output tokens, plus revised document)

**Input:** Document V(2) + integrity-checked evaluation + claims inventory + Suggestion Brief + original document V(0). Total input: ~12K tokens.

**Key finding (front-loaded):** Addressing 1 Critical and 2 Major pointers. Adding new Section 4.3 (rollback strategy) and Section 6 (migration timeline). Adopted 4 of 6 creative suggestions.

**Changes made:**

- IP2.1 (Critical) addressed: Added Section 4.3 "Rollback Strategy" describing feature-flag approach (adopted from Creative Agent suggestion). Includes canary deployment pattern with 5% -> 25% -> 100% traffic ramp over 2 weeks.
- IP2.2 (Major) addressed: Reframed Section 3.2 around architectural benefits rather than specific latency numbers. Added commitment to measure during pilot phase. (Adopted Creative Agent suggestion to remove the unsubstantiated 40% claim.)
- IP2.3 (Major) addressed: Added backward compatibility bridge subsection (adopted from Creative Agent). Mobile clients continue using session cookies until app update ships; server validates both token types during transition.
- IP2.4 (Minor) addressed: Added 2-sentence explanation of opaque token vs JWT trade-off in Section 3.
- Lateral suggestion adopted: Added Section 6 "Week-by-Week Migration Timeline" mapping 6-week constraint to milestones.
- Lateral suggestion declined: Token refresh strategy -- noted as out of scope for this RFC, added as "Future Work" item. (Drafter judgment: adding refresh token architecture would expand scope beyond the 6-week constraint.)

**Revision statistics:**

- Pointers addressed: 4 of 4 (1 Critical, 2 Major, 1 Minor)
- Creative suggestions adopted: 4 of 6
- Creative suggestions declined: 2 of 6 (1 partially adopted as Future Work reference)
- Sections modified: 3 (Sections 3, 3.2, 4)
- Sections added: 2 (Section 4.3, Section 6)
- Approximate words added: 350
- Approximate words removed: 45

### Loop 2 Summary (displayed to user)

```
=== Loop 2/5 complete ===
Composite: 3.04/5.0 (delta: -0.11)  Target: 4.0
Pointers: 1C / 2M / 1m  |  Suggestions: 4/6 adopted
Status: ITERATING (loop 2 of 3 minimum)
```

### Token Budget for This Loop

| Agent                     | Input tokens | Output tokens |
| ------------------------- | ------------ | ------------- |
| 1 -- Content Reviewer     | ~6,000       | ~1,800        |
| 2 -- Evaluator            | ~9,000       | ~2,200        |
| 3 -- Integrity Checker    | ~9,000       | ~1,400        |
| 4 -- Creative Agent       | ~8,000       | ~700          |
| 5 -- Drafter              | ~12,000      | ~2,800        |
| **Loop total**            | **~44,000**  | **~8,900**    |

### Convergence Sketch A -- Happy Path (Loops 3-5, `--max-loop 7`)

| Loop | Composite | Dimensions [D1-D8]  | Delta | Phase                     | Exit decision                                                                |
| ---- | --------- | ------------------- | ----- | ------------------------- | ---------------------------------------------------------------------------- |
| 3    | 3.55      | [4,4,4,3,3,4,3,3]  | +0.51 | Target-reaching           | ITERATE -- below 4.0 target, minimum 3 loops met.                            |
| 4    | 3.96      | [4,4,4,4,3,4,4,4]  | +0.41 | Target-reaching           | ITERATE -- below 4.0 target.                                                 |
| 5    | 4.08      | [4,4,4,4,4,4,4,4]  | +0.12 | Plateau-detection entered | CONTINUE -- target reached, `target_reached_at = 5`. delta > 0.1.            |
| 6    | 4.15      | [5,4,4,4,4,4,4,4]  | +0.07 | Plateau-detection         | CONTINUE -- delta < 0.1 for 1 loop only.                                     |
| 7    | 4.19      | [5,4,4,4,4,5,4,4]  | +0.04 | Plateau-detection         | EXIT via **above-target plateau** -- delta < 0.1 for 2 consecutive loops.    |

### Convergence Sketch B -- Oscillation Detection

| Loop | Composite | Dimensions [D1-D8]  | Delta | Direction | Exit decision                                                                    |
| ---- | --------- | ------------------- | ----- | --------- | -------------------------------------------------------------------------------- |
| 3    | 3.55      | [4,4,4,3,3,4,3,3]  | +0.51 | Up        | ITERATE                                                                          |
| 4    | 3.80      | [4,4,4,4,3,4,3,4]  | +0.25 | Up        | ITERATE                                                                          |
| 5    | 3.50      | [3,4,4,3,3,4,3,3]  | -0.30 | Down      | Alternation: [up, down] (2 of 3)                                                 |
| 6    | 3.82      | [4,4,4,4,3,4,3,4]  | +0.32 | Up        | Alternation: [up, down, up] (3). EXIT via **oscillation** at loop >= 4.          |

### Convergence Sketch C -- Near-Threshold Exit

| Loop | Composite | Dimensions [D1-D8]  | Delta | Exit decision                                                                                          |
| ---- | --------- | ------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| 3    | 3.55      | [4,4,4,3,3,4,3,3]  | +0.51 | ITERATE                                                                                                |
| 4    | 3.80      | [4,4,4,4,3,4,4,3]  | +0.25 | ITERATE -- at near_floor, delta not yet < 0.1 for 2 loops.                                             |
| 5    | 3.88      | [4,4,4,4,3,4,4,4]  | +0.08 | ITERATE -- delta < 0.1 for 1 loop only.                                                                |
| 6    | 3.93      | [4,4,4,4,3,4,4,4]  | +0.05 | EXIT via **near-threshold** -- composite >= 3.8, no dim < 3, no Major/Critical, delta < 0.1 for 2 loops. |

### Convergence Sketch D -- Regression-Plateau Exit

| Loop | Composite | Dimensions [D1-D8]  | Delta | Exit decision                                                                                      |
| ---- | --------- | ------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| 3    | 3.55      | [4,4,4,3,3,4,3,3]  | +0.51 | ITERATE                                                                                            |
| 4    | 4.00      | [5,4,4,3,4,4,4,4]  | +0.45 | CONTINUE -- target reached, `target_reached_at = 4`.                                                |
| 5    | 3.88      | [4,4,4,4,4,4,3,3]  | -0.12 | ITERATE -- composite dropped below target. D1 regressed 5->4.                                       |
| 6    | 3.84      | [4,4,4,4,4,4,3,3]  | -0.04 | EXIT via **regression-plateau** -- target was reached, composite < target, delta < 0.1 for 2 loops.  |

### Convergence Sketch E -- Persistent Major Pointer Exit

| Loop | Composite | Dimensions [D1-D8]  | Delta | Major pointers | Exit decision                                                                                         |
| ---- | --------- | ------------------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------- |
| 3    | 3.55      | [4,4,4,3,3,4,3,3]  | +0.51 | 2              | ITERATE                                                                                               |
| 4    | 3.80      | [4,4,4,4,3,4,4,3]  | +0.25 | 1 (rollback)   | ITERATE -- 1 Major persists for 1 loop only.                                                          |
| 5    | 3.85      | [4,4,4,4,3,4,4,4]  | +0.05 | 1 (same)       | ITERATE -- 1 Major persists for 2 loops but loop 5 just reached threshold.                             |
| 6    | 3.88      | [4,4,5,4,3,4,4,4]  | +0.03 | 1 (same)       | EXIT via **persistent Major pointer** -- composite >= 3.8, 1 Major persists 2 loops, loop >= 5.       |

---

## References

[1] Zhou, J., Lu, T., Mishra, S., et al. (2023). "Instruction-Following Evaluation for Large Language Models." arXiv:2311.07911.
[2] Xie, J., Zhang, K., Chen, J., et al. (2024). "Adaptive Chameleon or Stubborn Sloth." ICLR 2024 (Spotlight).
[4] Ralph, P. et al. (2020). "Empirical Standards for Software Engineering Research." arXiv:2010.03525.
[6] Zheng, L., Chiang, W.-L., et al. (2023). "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena." NeurIPS 2023.
[7] Khan, A., Hughes, J., et al. (2024). "Debating with More Persuasive LLMs Leads to More Truthful Answers." ICML 2024 (Best Paper).
[8] Panickssery, A., Bowman, S.R., & Feng, S. (2024). "LLM Evaluators Recognize and Favor Their Own Generations." NeurIPS 2024.
[9] Madaan, A., Tandon, N., et al. (2023). "Self-Refine: Iterative Refinement with Self-Feedback." NeurIPS 2023.
[10] Shinn, N., Cassano, F., et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning." NeurIPS 2023.
[11] Huang, J., Chen, X., et al. (2024). "Large Language Models Cannot Self-Correct Reasoning Yet." ICLR 2024.
[12] Du, Y., Li, S., et al. (2024). "Improving Factuality and Reasoning in Language Models through Multiagent Debate." ICML 2024.
[14] Chan, C.-M., Chen, W., et al. (2024). "ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate." ICLR 2024.
[18] Chiang, C.-H. & Lee, H. (2023). "Can Large Language Models Be an Alternative to Human Evaluations?" ACL 2023.
[19] Stureborg, R. et al. (2024). "Large Language Models are Inconsistent and Biased Evaluators." arXiv:2405.01724.
[20] Hall, T., Beecham, S., & Rainer, A. (2002). "Requirements problems in twelve software companies: an empirical analysis." IEE Proceedings -- Software, 149(5), 153-160.
[21] Echterhoff, J., Liu, Y., Alessa, A., McAuley, J., & He, Z. (2024). "Cognitive Bias in Decision-Making with LLMs." Findings of EMNLP 2024.
[22] Mendez Fernandez, D., Wagner, S., et al. (2017). "Naming the pain in requirements engineering." Empirical Software Engineering, 22(5), 2298-2338.
[23] Shi, F., Chen, X., et al. (2023). "Large Language Models Can Be Easily Distracted by Irrelevant Context." ICML 2023.
[24] Wu, C., Yin, S., et al. (2024). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." COLM 2024.
[25] Park, J.S., et al. (2023). "Generative Agents: Interactive Simulacra of Human Behavior." UIST 2023.
[26] Liu, Y., Iter, D., et al. (2023). "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment." EMNLP 2023.
[27] Kim, S., et al. (2024). "Prometheus: Inducing Fine-Grained Evaluation Capability in Language Models." ICLR 2024.
[29] Cemri, M., et al. (2025). "Why Do Multi-Agent LLM Systems Fail?" NeurIPS 2025 D&B (Spotlight).
[30] Hong, S., et al. (2024). "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework." ICLR 2024 (Oral).
[31] Huang, J.-T., et al. (2025). "On the Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents." ICML 2025.
[32] Chen, W., et al. (2024). "AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors." ICLR 2024.
[34] Xu, Z., Shi, Z., & Luo, Y. (2024). "Retrieval Meets Long Context Large Language Models." ICLR 2024.
[47] Yang, Z., et al. (2025). "A Probabilistic Inference Scaling Theory for LLM Self-Correction." EMNLP 2025.
[52] Maynez, J., et al. (2020). "On Faithfulness and Factuality in Abstractive Summarization." ACL 2020.
[53] Tang, L., et al. (2024). "TofuEval: Evaluating Hallucinations of LLMs on Topic-Focused Dialogue Summarization." NAACL 2024.
[54] Pirolli, P. & Card, S. (1999). "Information Foraging." Psychological Review, 106(4), 643-675.
[57] Astrom, K.J. & Murray, R.M. (2021). "Feedback Systems: An Introduction for Scientists and Engineers." 2nd ed. Princeton University Press.
