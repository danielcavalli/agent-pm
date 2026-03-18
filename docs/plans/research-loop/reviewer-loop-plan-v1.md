# Plan: `/pm-review-plan` -- Generic Research-Grounded Document Review Pipeline

## Context

The user wants a generic slash command that takes ANY plan/design document (ADR, PRD, RFC, research summary, architecture doc -- in any project) and runs an iterative, research-grounded review loop. Unlike `/pm-iterate-plan` (coupled to agent-pm's epic/story model), this command has zero dependencies on `pm` CLI or agent-pm data structures. It is a standalone document improvement pipeline.

The pipeline has 4 agents in a fixed cycle order with a hard constraint: minimum 3 full cycles before the loop can converge. The Evaluator scores on 8 weighted dimensions and must produce at least 3 improvement pointers per round.

---

## Files to Create

| File | Purpose |
|------|---------|
| `install/commands/pm-review-plan.md` | The slash command (single file, ~650 lines) |

## Files to Modify

| File | Change |
|------|--------|
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
/pm-review-plan <path-to-document> "<grounding-prompt>" [--max-loop <N>]
```

**Required arguments:**
- `<path-to-document>` -- the file to review (resolved relative to cwd)
- `"<grounding-prompt>"` -- free-text instruction from the user that tells the agents WHAT to focus on. Examples:
  - `"Ensure all distributed systems claims are backed by peer-reviewed papers"`
  - `"Focus on feasibility -- this will be implemented by junior engineers"`
  - `"This is an ADR for a financial system. Emphasize correctness and risk analysis"`
  - The grounding prompt is injected into every agent's system context as the user's review intent.

**Optional:**
- `--max-loop <N>` -- maximum review cycles (default: 5, minimum enforced: 3)

- File path resolved relative to cwd

---

## Agent Cycle Architecture

```
[Document V(N)] --> Research Reviewer --> Researcher Validator --> Evaluator --> Integrity Checker --> Drafter --> [Document V(N+1)]
                         ^                                                                              |
                         |______________________________________________________________________________|
```

| # | Agent | Role | Key Output |
|---|-------|------|-----------|
| 1 | **Research Reviewer** | Peer-reviews claims, proposes sources | Claims Inventory + Source Proposals |
| 2 | **Researcher Validator** | Verifies proposed + existing sources via web search | Validated Bibliography |
| 3 | **Evaluator** | Scores on 8 dimensions, generates min 3 pointers | Evaluation Report + Improvement Pointers |
| 4 | **Evaluator Integrity Checker** | Audits the Evaluator's scores and justifications for soundness | Integrity Verdict + Adjusted Scores (if needed) |
| 5 | **Drafter** | Revises document addressing pointers + integrating sources | Document V(N+1) + Revision Changelog |

Key difference from `/pm-iterate-plan`: cycle starts with REVIEW (document already exists), not DRAFT.

---

## The 8 Evaluation Dimensions

Designed to be universally applicable to any plan document. Drawn from academic peer review criteria (NeurIPS/CHI/ICSE review forms), RFC practice, and ADR quality frameworks.

| # | Dimension | Weight | What it measures |
|---|-----------|--------|------------------|
| 1 | **Evidential grounding** | 0.20 | Are claims backed by cited, credible, peer-reviewed evidence? Is the bibliography sufficient for the scope of claims? |
| 2 | **Problem framing** | 0.15 | Is the problem clear, scoped, falsifiable? Are success criteria, constraints, and non-goals explicit? |
| 3 | **Logical coherence** | 0.15 | Do conclusions follow from premises? Are alternatives considered? Is reasoning traceable? |
| 4 | **Completeness** | 0.12 | Are edge cases, failure modes, and boundary conditions addressed? Risks identified? |
| 5 | **Feasibility and risk** | 0.12 | Is the approach implementable? Dependencies identified? Unproven assumptions flagged? |
| 6 | **Clarity and structure** | 0.10 | Well-organized? Terms defined? Writing precise? Actionable without clarification? |
| 7 | **Originality and contribution** | 0.08 | Novel synthesis or insight beyond restating known approaches? Contribution articulated? |
| 8 | **Reproducibility and verifiability** | 0.08 | Could another team reproduce the approach? Success metrics objectively verifiable? |

**Weights sum to 1.00.** Scoring: 1-5 integer per dimension. Composite = sum(score_i * weight_i).

Evidential grounding gets the highest weight because the entire pipeline is research-driven. Problem framing and logical coherence are next because a well-grounded document that solves the wrong problem is still useless.

---

## Convergence Logic

```python
loop = 0
converged = false

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

    # Convergence uses the INTEGRITY-CHECKED scores (not raw Evaluator scores)
    if loop >= 3:  # HARD MINIMUM: 3 full cycles
        converge if ALL of:
          1. Weighted composite >= 4.0 (integrity-adjusted)
          2. No dimension scored below 3 (integrity-adjusted)
          3. No Critical or Major pointers remain (only Minor)
          4. Score trend not regressing (delta >= -0.1)

        Plateau detection: if delta < 0.1 for 2 consecutive loops
          AND conditions 1-3 met, force convergence
    else:
        report: "Loop {loop}/3 minimum -- continuing regardless of scores."
```

---

## Anti-Gaming Safeguards

Agents in a review loop can "game" their responsibilities -- inflating scores to converge faster, rubber-stamping sources, producing superficial pointers, or making cosmetic rather than substantive changes. Each agent has built-in accountability checks enforced by the other agents in the cycle.

| Risk | Gaming behavior | Safeguard | Enforcer |
|------|----------------|-----------|----------|
| **Shallow review** | Research Reviewer flags only obvious claims, ignores nuanced ones | Minimum claims inventory: must review at least 5 claims per round, including implicit assumptions and methodology choices (not just headline assertions). Evaluator checks claim coverage in its scoring. | Evaluator cross-checks claim inventory against document sections -- flags uncovered sections |
| **Rubber-stamp validation** | Researcher Validator marks everything CONFIRMED without verifying | Every source verdict must include the search query used and a 1-sentence summary of what was found. Verdicts without verification evidence are treated as UNVERIFIABLE. | Evaluator's Evidential Grounding score penalizes unverified sources in the bibliography |
| **Score inflation** | Evaluator gives 4+ on all dimensions to trigger early convergence | Every score must cite specific textual evidence. A score of 4 or 5 requires quoting the document passage that justifies the rating. Scores without evidence are invalid. | **Evaluator Integrity Checker (Agent 4)** verifies every score-evidence pair. On FAIL, Evaluator is re-dispatched. Research Reviewer also audits previous scores in its meta-review (rounds 2+). |
| **Superficial pointers** | Evaluator produces 3 trivial "move this comma" pointers to meet the minimum | At least 1 pointer per round must be severity Major or higher for the first 3 rounds. If the Evaluator claims no Major issues exist, it must include a "No Major Issues Justification" paragraph. | **Evaluator Integrity Checker** audits pointer severity and actionability. Research Reviewer audits pointer quality in the meta-review. |
| **Fabricated justifications** | Evaluator quotes text that does not exist in the document, or misattributes passages to justify scores | Integrity Checker cross-references every quoted passage against the actual document. Fabricated or misattributed quotes trigger a FAIL verdict and Evaluator re-run. | **Evaluator Integrity Checker** -- this is its primary purpose |
| **Cosmetic drafting** | Drafter makes token changes without substantive improvement | Drafter must quantify: words added/removed, sections modified, sources integrated. If the Evaluator's composite score does not improve or drops by > 0.2 after the Drafter's changes, the orchestrator flags a "stalled improvement" warning to the user. | Evaluator's score trend detects regression; orchestrator flags stalls |
| **Echo-chamber convergence** | All agents agree too quickly on a mediocre result | The hard minimum of 3 cycles prevents premature convergence. Additionally: the Research Reviewer's meta-review in round N+1 serves as a "devil's advocate" pass -- it must identify at least 1 thing the previous round's Evaluator missed or underweighted, OR explicitly justify why nothing was missed. | Structural constraint (min 3 rounds) + meta-review requirement |

These safeguards are embedded directly in the agent prompts (see below). They are not optional instructions -- they are hard requirements that the orchestrator validates before passing output to the next agent.

---

## Agent Prompt Specifications

### Agent 1: Research Reviewer

**Input:** Document V(N) + previous evaluation report (rounds 2+) + **user's grounding prompt**
**Output:** Meta-Review (rounds 2+) + Claims Inventory + Source Proposals Summary

- **Meta-Review (rounds 2+ only):** Before reviewing the document, audit the previous Evaluator's scores. Identify at least 1 thing the Evaluator missed or underweighted, OR write a "No Gaps Found" justification explaining why the scores were fair. Also audit the previous round's pointer quality -- were they substantive or superficial?
- Inventories every significant claim in the document
- For each: current citation status (None / Adequate / Partial)
- Proposes specific sources -- must include author, title, venue, year
- Source quality standards: papers at major conferences (NeurIPS, ICLR, ICML, EMNLP, CHI, OSDI, ICSE, etc.), peer-reviewed journals, canonical references, official docs from system creators
- REJECT: Medium/dev.to posts, tutorials, unreviewed arXiv-only preprints (<50 citations), Stack Overflow, marketing materials
- **Minimum 5 claims** reviewed per round (including implicit assumptions and methodology choices, not just headline assertions)
- For rounds 2+: focus on claims still inadequately cited, not already-resolved ones
- The **grounding prompt** guides which claims to prioritize -- if the user says "focus on distributed systems correctness", prioritize claims in that domain

### Agent 2: Researcher Validator

**Input:** Document V(N) + existing bibliography + Agent 1's source proposals + previous validated bibliography + **user's grounding prompt**
**Output:** Validated Bibliography with verdicts per source

- VERIFY each proposed source via WebSearch -- confirm it exists and says what Agent 1 claims
- VALIDATE existing sources for correctness (author, title, venue, year)
- IMPROVE by finding better sources where proposed ones are weak
- Per-source verdict: CONFIRMED / REPLACED / REJECTED / UNVERIFIABLE
- **Anti-gaming:** every verdict must include the search query used and a 1-sentence summary of what was found. Verdicts without verification evidence are treated as UNVERIFIABLE.
- Outputs a clean compiled bibliography for Agents 3 and 4
- For rounds 2+: carry forward previously CONFIRMED sources without re-checking

### Agent 3: Evaluator

**Input:** Document V(N) + Validated Bibliography + Claims Inventory + Agent 1's Meta-Review + previous evaluation reports + **user's grounding prompt**
**Output:** Dimension Scores table + Score Trend + Improvement Pointers + Convergence Assessment

- Scores each of the 8 dimensions (1-5 scale)
- **Anti-gaming: evidence-backed scores.** A score of 4 or 5 on any dimension requires quoting the specific document passage that justifies the rating. Scores without textual evidence are invalid.
- **Anti-gaming: cross-check claim coverage.** Compare Agent 1's Claims Inventory against document sections. Flag any sections with significant claims that Agent 1 did not inventory (this prevents shallow reviewing by Agent 1).
- **Anti-gaming: penalize unverified sources.** If the Validated Bibliography contains UNVERIFIABLE sources that the document cites, the Evidential Grounding score must reflect this.
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
- **Pointer quality audit.** For each improvement pointer:
  - Is the recommendation actionable and specific? (reject "consider improving X")
  - Does the severity match the actual issue? (a typo is not Critical; a logical fallacy is not Minor)
  - Is the pointer grounded in the document's actual content, not a hypothetical concern?
- **Justification coherence check.** Read each justification as a standalone argument. Flag:
  - Circular reasoning ("the score is 4 because the quality is high")
  - Tautological evidence ("the problem framing is clear because it frames the problem clearly")
  - Contradictions between scores (e.g., Logical Coherence = 5 but a pointer says "reasoning has gaps")
  - Score-pointer mismatch (dimension scored 4+ but a Critical/Major pointer targets that same dimension)
- **Convergence integrity.** If the Evaluator's verdict is APPROVE, verify that the evidence genuinely supports convergence -- not that the Evaluator simply exhausted its patience.

**Output format:**

```
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

### Integrity Verdict
- **PASS** -- Evaluator's output is sound. Forward to Drafter as-is.
- **CORRECTED** -- Adjustments made. Forward corrected version to Drafter.
- **FAIL** -- Evaluator's output is fundamentally unreliable (>50% of scores challenged).
  Re-run the Evaluator with the integrity failures as context.
```

**Rules:**
- The Integrity Checker does NOT re-evaluate the document itself. It only audits the Evaluator's work.
- On CORRECTED: the adjusted scores and modified pointers replace the Evaluator's originals before reaching the Drafter.
- On FAIL: the orchestrator re-dispatches the Evaluator with the integrity failures appended as a "you were caught" preamble. This re-run counts within the same loop iteration (does not increment the loop counter).
- Maximum 1 re-run per loop. If the Evaluator fails integrity a second time in the same loop, flag to the user and proceed with the Integrity Checker's adjustments.

### Agent 5: Drafter

**Input:** Document V(N) + **Integrity-checked** Evaluation Report + Validated Bibliography + Claims Inventory + Original document (for reference) + **user's grounding prompt**
**Output:** Complete revised Document V(N+1) + Revision Changelog + Statistics

- Address ALL Critical pointers (mandatory)
- Address all Major pointers (expected; justify if declined)
- Address Minor pointers at discretion
- Integrate validated sources using the document's existing citation format
- **Preserve original format**: if ADR, keep ADR template; if RFC, keep RFC structure
- **Preserve original voice**: surgical improvements, not a rewrite
- Output is the COMPLETE revised document (not a diff) -- copy-pasteable into the file
- If document lacks a bibliography section, add one matching its format conventions
- **Anti-gaming: quantified changelog.** Must report: words added/removed, sections modified, sources integrated. The orchestrator compares this against the Evaluator's next-round score -- if composite drops by > 0.2, a "stalled improvement" warning is shown to the user.

---

## Loop Exit and Approval Gate

### On convergence (loop >= 3, all criteria met):

Report final composite score, score progression, dimension breakdown, and present the full revised document. Options:
- `approve` -- overwrite original file
- `approve-copy` -- write to `{stem}.reviewed{ext}` alongside original
- `edit <instructions>` -- one more Drafter cycle with human feedback
- `reject` -- discard all changes

### On max_loop reached without convergence:

Report current score, outstanding pointers, and present best version. Same options plus:
- `continue <N>` -- run N more loops

**Plan-only until approved.** No file writes until explicit user approval.

---

## Verification

After implementation:

1. **Dry run:** Point `/pm-review-plan` at `docs/adr/ADR-023-swarm-self-improvement.md` (a complex, research-heavy document) and verify:
   - All 5 agents execute in sequence
   - Research Reviewer produces a claims inventory with source proposals
   - Researcher Validator uses WebSearch to verify sources
   - Evaluator scores 8 dimensions and produces >= 3 pointers
   - Integrity Checker audits the Evaluator's scores and evidence
   - Drafter produces a complete revised document
   - Loop runs minimum 3 rounds before convergence check
2. **Format preservation:** Confirm the Drafter's output maintains the original ADR template structure
3. **Help registration:** Verify `/pm-review-plan` appears in `/pm-help` output
4. **Install coverage:** Confirm `install/install.sh` glob (`pm-*.md`) picks up the new file
