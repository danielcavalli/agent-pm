# Plan V2: Autonomous Swarm Self-Improvement

## Summary

- Epics: 7
- Stories: 38
- Total points: 128
- Key changes from V1:
  - **C1 addressed:** Added E058-S001 "Observation Persistence" with Zod schema, STORY_RESULT parsing in /pm-work-on-project, and strategy_hash/board_hash computation at dispatch time
  - **C2 addressed:** Replaced Levenshtein-only similarity with hybrid gate (Levenshtein >= 0.85 AND Jaccard word >= 0.70) in E060-S002; added AC requiring 10+ unit test pairs covering same-direction, opposite-direction, and unrelated claims
  - **C3 addressed:** Created dedicated story E059-S003 for running-statistics persistence with normalization-stats.yaml, Zod schema, Phase 1/Phase 2 EWMA transition, alpha=0.15 as code constant, atomic read/write
  - **C4 addressed:** Added E061-S002 "Loop Reliability Mechanisms" covering loop-state.yaml, step-level Zod validation with retry-once-then-abort, and context budget after PUBLISH
  - **C5 addressed:** Split old "pm swarm analyze" into three stories: E062-S001 (result aggregation + exploration coverage), E062-S002 (trend detection + composite analysis), E062-S003 (formatted output + CLI integration)
  - **R1 addressed:** Added explicit error-handling ACs to E061-S004 (integration story) covering git revert failure, claim TTL expiry mid-experiment, and strategy.yaml corruption, with one test per error path
  - **R2 addressed:** E059-S005 now specifies three-state classification (active/idle/gone), idle_ratio = idle_time / (active + idle), internal timestamp usage, and Zod invariant stale_threshold >= 3 \* frequency
  - Net change: +5 stories, +17 points from V1 (33 stories/111 points to 38 stories/128 points)

## Dependency Map

```
E057 (SwarmStore Foundation)
  |
  +---> E058 (Orchestrator Integration) ---> E059 (Evaluation Engine)
  |                                              |
  +---> E060 (Claim Protocol)                    |
  |       |                                      |
  |       +------+-------------------------------+
  |              |
  |              v
  |         E061 (Experiment Loop)
  |              |
  |              v
  |         E062 (Knowledge Sharing & Analysis)
  |
  +---> E063 (TUI Integration) [depends on E057, E058]
```

## Epic Breakdown

### E057: SwarmStore Foundation (6 stories, 21 points)

**Priority:** high
**Depends on:** none
**Description:** Define the SwarmStore interface, implement FileSwarmStore for YAML-based persistence, initialize the .pm/swarm/ directory structure, and provide the `pm swarm init` CLI command. This is the data layer for all swarm coordination.

#### Stories

##### E057-S001: Define SwarmStore interface and core Zod schemas

- **Points:** 3
- **Priority:** high
- **Depends on:** none
- **Description:** Create `src/schemas/swarm-store.schema.ts` defining Zod schemas for all SwarmStore data types: TacticsSchema (version, tactics array, profiles), StrategySchema (version, config_version, parameters with nested dispatch/heartbeat/escalation/experiment groups), ObservationRecordSchema (story code, metrics, strategy_hash, board_hash, timestamps), ExperimentResultSchema, ClaimSchema, HypothesisSchema, InsightSchema, and BestMetadataSchema. Define the TypeScript `SwarmStore` interface in `src/lib/swarm-store.ts` matching ADR-023 Decision 3. Re-export all schemas from `src/schemas/index.ts`.
- **Acceptance Criteria:**
  1. `src/schemas/swarm-store.schema.ts` exports TacticsSchema validating the full structure from ADR-023 Decision 1 (version, tactics array with name/description/metric/direction/weight/measurement/source, profiles object)
  2. StrategySchema validates version (number), config_version (number), and parameters with nested groups; each numeric parameter has min/max bounds enforced by Zod `.min()/.max()` matching the ranges in ADR-023 Decision 2
  3. ObservationRecordSchema validates: story_code (string), status (enum: done|blocked|failed), criteria_verified (string[]), criteria_failed (string[]), metrics (record of metric key to number), strategy_hash (string), board_hash (string), started_at (ISO datetime), completed_at (ISO datetime)
  4. ClaimSchema validates all fields from ADR-023 Decision 5 including agent_id, type (enum), description, parameter_path (optional), new_value (optional), pm_commands (optional), claimed_at (ISO datetime), ttl_seconds (number), status (enum)
  5. ExperimentResultSchema, HypothesisSchema, InsightSchema, and BestMetadataSchema each validate their respective structures from ADR-023 Decision 6
  6. All schemas and inferred types re-exported from `src/schemas/index.ts`
  7. Unit tests in `src/schemas/__tests__/swarm-store.schema.test.ts` verify valid payloads pass and invalid payloads (missing fields, out-of-range values, wrong enums) fail for each schema

##### E057-S002: Implement FileSwarmStore core CRUD

- **Points:** 5
- **Priority:** high
- **Depends on:** E057-S001
- **Description:** Implement `FileSwarmStore` class in `src/lib/swarm-store.ts` providing the core CRUD methods: `read()`, `write()`, `list()`, `delete()`. Files are stored as YAML under `.pm/swarm/<namespace>/`. Each write validates the data against the appropriate Zod schema. Each read returns null if the file does not exist or fails validation (graceful degradation per ADR-023 Decision 3).
- **Acceptance Criteria:**
  1. `FileSwarmStore` class implements `read(namespace, key)` returning parsed YAML or null for missing/invalid files
  2. `write(namespace, key, data)` writes Zod-validated YAML to `.pm/swarm/<namespace>/<key>.yaml`, creating directories as needed
  3. `list(namespace)` returns sorted array of keys (filenames without .yaml extension) from `.pm/swarm/<namespace>/`
  4. `delete(namespace, key)` removes the file, no-op if file does not exist
  5. All methods log warnings to stderr on corruption/parse errors instead of throwing (graceful degradation)
  6. Unit tests cover: write then read round-trip, list with multiple files, delete existing and non-existing, read of corrupted YAML returns null

##### E057-S003: Implement FileSwarmStore search method

- **Points:** 3
- **Priority:** medium
- **Depends on:** E057-S002
- **Description:** Implement the `search(namespace, query, threshold)` method on FileSwarmStore. The search computes Levenshtein ratio over the `description` field of each YAML file in the namespace and returns matches above the threshold, sorted by score descending. The Levenshtein implementation is a pure TypeScript dynamic programming function with no external dependency.
- **Acceptance Criteria:**
  1. `search()` reads all YAML files in the namespace, extracts the `description` field, and computes Levenshtein ratio against the query string
  2. Returns `Array<{ key: string; score: number }>` filtered to scores >= threshold, sorted descending by score
  3. Files without a `description` field are skipped without error
  4. The Levenshtein function is implemented in a pure helper (no npm dependency), exported for direct testing
  5. Unit tests verify: exact match returns 1.0, similar strings return expected ratios, unrelated strings fall below threshold, empty namespace returns empty array

##### E057-S004: Implement `pm swarm init` CLI command

- **Points:** 3
- **Priority:** high
- **Depends on:** E057-S002
- **Description:** Add a `pm swarm init` subcommand that creates the `.pm/swarm/` directory structure and copies the default tactics template from `docs/templates/swarm-default-tactics.yaml` into `.pm/swarm/tactics.yaml`. Creates a default `strategy.yaml` with the default parameter values from ADR-023 Decision 2. Creates empty subdirectories: observations/, results/, claims/, hypotheses/, insights/, best/.
- **Acceptance Criteria:**
  1. Running `pm swarm init` creates `.pm/swarm/` with subdirectories: observations, results, claims, hypotheses, insights, best
  2. `.pm/swarm/tactics.yaml` is copied from the default template at `docs/templates/swarm-default-tactics.yaml`
  3. `.pm/swarm/strategy.yaml` is created with default parameter values (max_concurrent_agents: 5, frequency_seconds: 15, stale_threshold_seconds: 60, confidence_autonomous: 0.85, confidence_review: 0.50, max_pending_escalations: 3, observation_window_stories: 10, claim_ttl_seconds: 900) and config_version: 1
  4. If `.pm/swarm/` already exists, the command prints a warning and does not overwrite existing files
  5. If `.pm/` does not exist, the command fails with a clear error ("No project found. Run pm init first.")
  6. The `swarm` subdirectory is NOT created by `pm init` -- it is opt-in via `pm swarm init` only

##### E057-S005: Register swarm subcommand group in CLI

- **Points:** 2
- **Priority:** high
- **Depends on:** E057-S004
- **Description:** Register the `pm swarm` command group in `src/cli.ts` with the `init` subcommand. Follow the existing pattern used by `pm agent`, `pm adr`, etc. Ensure `pm swarm --help` shows available subcommands.
- **Acceptance Criteria:**
  1. `pm swarm init` is callable from the CLI and delegates to the init implementation
  2. `pm swarm --help` lists all registered swarm subcommands (at minimum: init)
  3. Running `pm swarm` with no subcommand prints the help text
  4. The swarm command group is registered in `src/cli.ts` following the existing Commander pattern

##### E057-S006: Add swarm MCP tools for read/write/list

- **Points:** 5
- **Priority:** medium
- **Depends on:** E057-S002
- **Description:** Register MCP tools in `src/mcp-server.ts` for swarm operations: `pm_swarm_read` (namespace, key, workdir), `pm_swarm_write` (namespace, key, data, workdir), `pm_swarm_list` (namespace, workdir). These follow the existing MCP tool pattern (JSON schema input, delegation to FileSwarmStore, text output). The `pm_swarm_write` tool validates against the appropriate Zod schema based on namespace. These tools allow agents to interact with swarm state programmatically.
- **Acceptance Criteria:**
  1. `pm_swarm_read` tool returns the YAML content for a given namespace/key, or a "not found" message
  2. `pm_swarm_write` tool writes validated data to the swarm store and returns confirmation
  3. `pm_swarm_list` tool returns the list of keys in a namespace
  4. All three tools accept and require `workdir` parameter
  5. Tools return graceful error messages (not stack traces) for invalid inputs or missing .pm/swarm/
  6. Integration tests in `src/__tests__/mcp-server.test.ts` cover each tool's happy path and error case

---

### E058: Orchestrator Integration (5 stories, 18 points)

**Priority:** high
**Depends on:** E057-S001, E057-S002
**Description:** Integrate the swarm layer with the existing orchestrator (`/pm-work-on-project`). This covers observation persistence (writing STORY_RESULT to disk), strategy.yaml consumption for dispatch parameters, version tagging with strategy_hash and board_hash, and updating the orchestrator slash command to read concurrency limits from strategy.yaml.

#### Stories

##### E058-S001: Observation persistence -- Zod schema and file writer

- **Points:** 5
- **Priority:** high
- **Depends on:** E057-S001
- **Description:** Create the observation persistence layer that bridges /pm-work-on-project output to the evaluation engine. This involves: (a) defining the ObservationRecord Zod schema (story code, status, criteria_verified, criteria_failed, metrics record, strategy_hash, board_hash, started_at, completed_at) if not already fully covered in E057-S001; (b) implementing `writeObservation(pmDir, record)` and `readObservation(pmDir, storyCode)` functions in `src/lib/swarm-store.ts`; (c) implementing `computeStrategyHash(pmDir)` and `computeBoardHash(pmDir)` functions that produce deterministic SHA-256 hashes of strategy.yaml and (.pm/index.yaml + .pm/epics/\*.yaml) respectively. The board hash must use a deterministic serialization (sorted keys, stable YAML dump) so identical board states produce identical hashes regardless of file write order.
- **Acceptance Criteria:**
  1. `writeObservation(pmDir, record)` writes a Zod-validated YAML file to `.pm/swarm/observations/<story-code>.yaml`
  2. `readObservation(pmDir, storyCode)` reads and validates the observation file, returning null if missing or invalid
  3. `computeStrategyHash(pmDir)` returns SHA-256 hex string of `.pm/swarm/strategy.yaml` contents, or a sentinel string "no-strategy" if the file does not exist
  4. `computeBoardHash(pmDir)` returns SHA-256 hex string of deterministic concatenation of `.pm/index.yaml` + sorted `.pm/epics/*.yaml` file contents
  5. Two identical board states (same files, possibly written in different order) produce the same board_hash
  6. Unit tests cover: write/read round-trip, hash stability across re-serialization, hash changes when strategy.yaml or an epic file changes, "no-strategy" sentinel when strategy.yaml is absent

##### E058-S002: Parse STORY_RESULT from sub-agent stdout

- **Points:** 5
- **Priority:** high
- **Depends on:** E058-S001
- **Description:** Implement a parser that extracts the structured `STORY_RESULT` YAML block from sub-agent stdout text. The parser looks for the `---\nSTORY_RESULT:\n` delimiter, extracts the YAML between delimiters, and parses it. This parser will be used by the updated /pm-work-on-project to persist observations. The parser must be robust to extra text before/after the STORY_RESULT block and handle malformed blocks gracefully (return null).
- **Acceptance Criteria:**
  1. `parseStoryResult(stdout: string)` extracts and parses the STORY_RESULT YAML block from arbitrary stdout text
  2. Returns a typed object matching the STORY_RESULT structure (code, title, status, criteria_verified, criteria_failed, blockers, discoveries, reflection) or null if no valid block is found
  3. Handles: block at end of output, block in middle of output, multiple blocks (takes last one), no block present (returns null), malformed YAML (returns null)
  4. Unit tests with at least 6 test cases covering all the above scenarios

##### E058-S003: Update /pm-work-on-project to persist observations

- **Points:** 3
- **Priority:** high
- **Depends on:** E058-S001, E058-S002
- **Description:** Update the `/pm-work-on-project` orchestrator slash command to persist observation records after each sub-agent completes. At dispatch time, compute strategy_hash and board_hash. After each sub-agent returns, parse the STORY_RESULT from stdout, merge it with the dispatch-time hashes and timestamps, and write to `.pm/swarm/observations/<story-code>.yaml`. If `.pm/swarm/` does not exist (swarm not initialized), skip persistence silently.
- **Acceptance Criteria:**
  1. The updated `install/commands/pm-work-on-project.md` instructs the orchestrator to call `computeStrategyHash()` and `computeBoardHash()` at the start of each tier dispatch
  2. After each sub-agent completes, the orchestrator parses STORY_RESULT and writes an observation record with the dispatch-time hashes
  3. If STORY_RESULT parsing returns null (malformed output), the orchestrator logs a warning and continues (does not crash)
  4. If `.pm/swarm/` does not exist, observation persistence is skipped entirely (backward compatible)
  5. The observation file includes started_at (dispatch time) and completed_at (sub-agent return time) timestamps

##### E058-S004: Strategy.yaml consumption for dispatch concurrency

- **Points:** 3
- **Priority:** medium
- **Depends on:** E057-S004
- **Description:** Update `/pm-work-on-project` to read `max_concurrent_agents` from `.pm/swarm/strategy.yaml` and use it to limit the number of parallel sub-agent dispatches. If strategy.yaml does not exist or is invalid, fall back to the current hardcoded behavior (unlimited parallel within each tier). This is the minimal integration point between the experiment loop and the orchestrator.
- **Acceptance Criteria:**
  1. The orchestrator reads `.pm/swarm/strategy.yaml` at startup and extracts `parameters.dispatch.max_concurrent_agents`
  2. Parallel sub-agent dispatches within a tier are limited to this value (excess stories queue until a slot opens)
  3. If strategy.yaml is missing, malformed, or the value is out of the valid range [1, 20], the orchestrator falls back to current behavior with a stderr warning
  4. The concurrency limit is logged in the dispatch plan output (Step 4 of the orchestrator)

##### E058-S005: Strategy version tagging in observations

- **Points:** 2
- **Priority:** medium
- **Depends on:** E058-S001, E058-S003
- **Description:** Ensure every observation record written by the orchestrator includes the config_version from strategy.yaml in addition to strategy_hash and board_hash. This enables the evaluation engine to filter observations by exact config version, providing a simpler attribution mechanism alongside the hash-based approach.
- **Acceptance Criteria:**
  1. ObservationRecord includes `config_version: number` field (optional, defaults to 0 when strategy.yaml is absent)
  2. The orchestrator reads config_version from strategy.yaml at dispatch time and includes it in each observation
  3. Observations written when `.pm/swarm/strategy.yaml` does not exist have config_version: 0
  4. Unit test verifies config_version is correctly propagated from strategy.yaml to observation files

---

### E059: Evaluation Engine (6 stories, 22 points)

**Priority:** high
**Depends on:** E058-S001, E057-S001
**Description:** Implement the tactic-based evaluation engine including metric computation from observation data, Tchebycheff scalarization for composite scoring, running-statistics normalization with EWMA transition, and heartbeat-based idle ratio calculation. This is the scoring core that the experiment loop uses to compare configurations.

#### Stories

##### E059-S001: Tactic loader and validation

- **Points:** 2
- **Priority:** high
- **Depends on:** E057-S001
- **Description:** Implement a tactic loader that reads `.pm/swarm/tactics.yaml`, validates it against TacticsSchema, and returns the parsed tactics with their weights. Support loading a specific profile by name (which overrides individual tactic weights). If tactics.yaml is missing or invalid, return a default set matching the "balanced" profile.
- **Acceptance Criteria:**
  1. `loadTactics(pmDir, profileName?)` reads and validates `.pm/swarm/tactics.yaml`
  2. When `profileName` is provided and exists in profiles, the returned tactics use that profile's weights
  3. When `profileName` is provided but does not exist, throws a descriptive error listing available profiles
  4. When tactics.yaml is missing, returns the default "balanced" tactics (matching the template)
  5. Validates that weights sum to 1.0 (within floating-point tolerance of 0.001)
  6. Unit tests cover: load with default profile, load with named profile, missing file fallback, invalid weights sum, missing profile name error

##### E059-S002: Metric computation from observations

- **Points:** 5
- **Priority:** high
- **Depends on:** E058-S001, E059-S001
- **Description:** Implement metric computation functions that derive tactic values from persisted observation records. Each metric maps to a computation function that reads observations filtered by strategy_hash and/or board_hash and computes the metric value. Metrics: stories_per_hour (count / wall-clock span), criteria_pass_rate (criteria_verified / total criteria), waste_ratio (failed+blocked / total), duplicate_and_conflict_ratio (duplicate story codes / total).
- **Acceptance Criteria:**
  1. `computeMetrics(pmDir, strategyHash, boardHash)` returns a `Record<string, number>` with computed values for all story_result-sourced metrics
  2. `stories_per_hour` = count of observations with status "done" / wall-clock hours between earliest started_at and latest completed_at
  3. `criteria_pass_rate` = sum of criteria_verified lengths / sum of (criteria_verified + criteria_failed) lengths, across all observations
  4. `waste_ratio` = count of observations with status "failed" or "blocked" / total observation count
  5. `duplicate_and_conflict_ratio` = count of duplicate story_code entries / total observation count
  6. Returns 0.0 for metrics with insufficient data (e.g., no observations match the filter hashes)
  7. Unit tests with at least 3 observation fixtures verifying each metric computation

##### E059-S003: Running-statistics persistence and EWMA normalization

- **Points:** 5
- **Priority:** high
- **Depends on:** E059-S002
- **Description:** Implement the normalization layer using running statistics stored in `.pm/swarm/normalization-stats.yaml`. Phase 1 (experiments 1-10): simple cumulative mean and variance (Welford's algorithm). Phase 2 (experiment 11+): EWMA with alpha=0.15 as a code constant (not user-configurable). The file stores per-metric statistics: count, mean, variance, ewma_mean, ewma_variance. All reads and writes are atomic (write to temp file, rename).
- **Acceptance Criteria:**
  1. `NormalizationStatsSchema` (Zod) validates `.pm/swarm/normalization-stats.yaml` with per-metric entries: count (number), mean (number), variance (number), ewma_mean (number), ewma_variance (number)
  2. `updateStats(pmDir, metricKey, newValue)` updates the stats file atomically: writes to a temp file then renames
  3. For count <= 10 (Phase 1), mean and variance use Welford's online algorithm; ewma_mean and ewma_variance are updated but not used for normalization
  4. For count > 10 (Phase 2), normalization uses ewma_mean and ewma_variance with alpha=0.15; alpha is a module-level constant, not configurable
  5. `normalize(pmDir, metricKey, rawValue)` returns the z-score using the appropriate phase's statistics
  6. Concurrent writes do not corrupt the file (atomic rename ensures this)
  7. Unit tests verify: Phase 1 cumulative stats match expected values for a known sequence, Phase 2 EWMA transition at count=11, z-score normalization produces correct values, atomic write does not leave partial files

##### E059-S004: Tchebycheff scalarization and composite scoring

- **Points:** 3
- **Priority:** high
- **Depends on:** E059-S002, E059-S003
- **Description:** Implement the Tchebycheff scalarization function that combines normalized metric values with tactic weights into a single composite score. The formula is `composite = min_i(w_i * normalized_metric_i)` where metrics with `direction: lower_is_better` are negated before normalization. The composite score is then maximized.
- **Acceptance Criteria:**
  1. `computeComposite(normalizedMetrics, tactics)` returns the Tchebycheff composite score
  2. Metrics with `direction: lower_is_better` are negated before being passed to the scalarization
  3. The composite score equals `min(w_i * adjusted_normalized_i)` across all tactics
  4. If any tactic has weight 0, it is excluded from the min computation (to avoid always returning 0)
  5. Returns NaN if no valid metrics are available (caller handles cold-start)
  6. Unit tests verify: balanced case (all metrics equal), dominated case (one metric much worse), zero-weight exclusion, direction handling for lower_is_better

##### E059-S005: Heartbeat-based idle ratio computation

- **Points:** 5
- **Priority:** medium
- **Depends on:** E057-S001
- **Description:** Implement the idle_ratio metric by analyzing agent heartbeat files in `.pm/agents/`. Uses a three-state classification: active (status=active with current_task), idle (status=idle or active without current_task), gone (no heartbeat within stale_threshold). idle_ratio = idle_time / (active_time + idle_time). Gone time is excluded from the ratio. Uses internal timestamps from last_heartbeat field, not file mtime. Reads stale_threshold_seconds and frequency_seconds from strategy.yaml. Validates the design invariant: stale_threshold >= 3 \* frequency via Zod refinement on StrategySchema.
- **Acceptance Criteria:**
  1. `computeIdleRatio(pmDir, windowStart, windowEnd)` returns the aggregate idle_ratio across all agents for the given time window
  2. Three-state classification: active (status=active AND current_task is set), idle (status=idle OR status=active AND current_task is null), gone (last_heartbeat older than stale_threshold_seconds from current time)
  3. idle_ratio = total idle seconds / (total active seconds + total idle seconds); gone time is excluded from both numerator and denominator
  4. Uses last_heartbeat timestamps from agent state files, not filesystem mtime
  5. Reads stale_threshold_seconds and frequency_seconds from strategy.yaml; falls back to defaults (60s, 15s) if strategy.yaml is absent
  6. StrategySchema has a Zod `.refine()` ensuring `stale_threshold_seconds >= 3 * frequency_seconds`; validation failure produces a descriptive error message
  7. Unit tests with mocked heartbeat files covering: all-active scenario (ratio near 0), mixed active/idle, agent gone mid-window (excluded from ratio), invariant violation caught by Zod

##### E059-S006: Escalation metrics computation

- **Points:** 2
- **Priority:** medium
- **Depends on:** E057-S001
- **Description:** Implement escalation_response_median_seconds and escalation_ratio metrics from agent state and observation data. escalation_response_median_seconds is the median time between an agent's escalation request (agent state with status needs_attention) and the response file's responded_at timestamp. escalation_ratio is the fraction of observations where at least one escalation was filed.
- **Acceptance Criteria:**
  1. `computeEscalationMetrics(pmDir, windowStart, windowEnd)` returns `{ escalation_response_median_seconds: number, escalation_ratio: number }`
  2. Response time computed from agent state escalation timestamp to response file responded_at
  3. escalation_ratio = count of stories with at least one escalation / total story count in the window
  4. Returns 0 for both metrics if no escalation data exists in the window
  5. Unit tests with mocked escalation data verifying median computation and ratio calculation

---

### E060: Claim Protocol (5 stories, 18 points)

**Priority:** high
**Depends on:** E057-S002
**Description:** Implement the experiment claim protocol with exact-match dedup, hybrid similarity gate, fencing tokens, TTL enforcement, and graceful fallback to solo mode. This prevents duplicate experiments across concurrent experiment agents.

#### Stories

##### E060-S001: Claim write, read, and TTL enforcement

- **Points:** 3
- **Priority:** high
- **Depends on:** E057-S002
- **Description:** Implement the `claim()`, `releaseClaim()`, and `listActiveClaims()` methods on FileSwarmStore. A claim is written to `.pm/swarm/claims/<agent-id>-<slug>.yaml`. Claims older than their ttl_seconds are treated as expired at read time. `listActiveClaims()` filters out expired claims without deleting them (lazy expiry).
- **Acceptance Criteria:**
  1. `claim(namespace, key, agentId, ttlSeconds)` writes a claim file with agent_id, claimed_at (ISO now), ttl_seconds, status: active
  2. `releaseClaim(namespace, key, agentId)` sets claim status to "completed" (does not delete the file, preserving audit trail)
  3. `listActiveClaims(namespace)` returns only claims where `status === "active"` AND `claimed_at + ttl_seconds > now`
  4. Expired claims (past TTL) are excluded from listActiveClaims without being deleted
  5. Unit tests: write a claim, read it back, expire it by advancing time (mock Date.now), verify it's excluded from active list

##### E060-S002: Hybrid similarity gate for claim dedup

- **Points:** 5
- **Priority:** high
- **Depends on:** E060-S001
- **Description:** Implement the two-tier claim deduplication. Tier 1 (exact match): for runtime_config claims, match on (parameter_path, new_value); for board_mutation claims, match on change_description. Tier 2 (similarity gate): compute both Levenshtein ratio and Jaccard word similarity on claim descriptions. Abort if BOTH `levenshtein_ratio >= 0.85` AND `jaccard_word_similarity >= 0.70`. This hybrid gate prevents the false positive identified in the Pointers Report where opposite-direction changes score 0.929 on Levenshtein alone.
- **Acceptance Criteria:**
  1. Exact match: `checkExactDuplicate(activeClaims, newClaim)` returns true if any active claim has the same (parameter_path, new_value) for runtime_config or same change_description for board_mutation
  2. `levenshteinRatio(a, b)` returns the ratio [0, 1] using dynamic programming (no npm dependency)
  3. `jaccardWordSimilarity(a, b)` splits strings on whitespace, computes |intersection| / |union| of word sets
  4. `checkSimilarDuplicate(activeClaims, newClaim)` returns true if any active claim passes BOTH gates: levenshtein_ratio >= 0.85 AND jaccard_word_similarity >= 0.70
  5. 10+ unit test pairs covering: (a) same-direction parameter changes ("Increase X from 5 to 7" vs "Increase X from 5 to 8") -- should match, (b) opposite-direction changes ("Increase X from 5 to 7" vs "Decrease X from 5 to 3") -- should NOT match despite high Levenshtein, (c) unrelated claims -- should NOT match, (d) same claim different wording -- should match, (e) edge cases: empty descriptions, single-word descriptions
  6. The old 0.88 Levenshtein-only threshold is not used anywhere

##### E060-S003: Write-wait-verify protocol

- **Points:** 3
- **Priority:** high
- **Depends on:** E060-S001
- **Description:** Implement the write-wait-verify claim acquisition protocol. After writing a claim, wait 2 seconds, re-read the claim file, and verify the agent_id still matches. If another agent overwrote the claim, the acquisition fails. After 5 failed attempts, fall back to solo mode (proceed without claim). This provides optimistic locking without a central coordinator.
- **Acceptance Criteria:**
  1. `acquireClaim(pmDir, claimData, agentId)` implements: write claim, wait 2s, re-read, verify agent_id matches
  2. Returns `{ acquired: true, claimKey: string }` on success, `{ acquired: false, reason: string }` on failure
  3. On verification failure, deletes the written claim file and returns failure
  4. After 5 consecutive failures on the same claim target, returns `{ acquired: false, reason: "fallback-solo", soloMode: true }` signaling the caller to proceed anyway
  5. The 2-second wait is configurable via an internal parameter (for testing), defaulting to 2000ms
  6. Unit tests: successful acquisition, contested acquisition (mock concurrent write), fallback after 5 failures

##### E060-S004: Fencing tokens for runtime config and board mutations

- **Points:** 5
- **Priority:** high
- **Depends on:** E060-S003, E057-S001
- **Description:** Implement fencing token verification for both mutation types. For runtime_config: read config_version from strategy.yaml before CONFIGURE, write with config_version + 1, verify version after write. A mismatch means another write occurred. For board_mutation: record the git commit hash after committing a board change, verify the commit is still HEAD before OBSERVE. Provide `verifyRuntimeFence(pmDir, expectedVersion)` and `verifyBoardFence(pmDir, expectedCommitHash)` functions.
- **Acceptance Criteria:**
  1. `readConfigVersion(pmDir)` returns the current config_version from strategy.yaml (0 if file missing)
  2. `writeStrategyWithFence(pmDir, newStrategy, expectedVersion)` writes strategy.yaml only if current config_version === expectedVersion; returns success/failure
  3. `verifyRuntimeFence(pmDir, expectedVersion)` re-reads config_version and returns true if it matches expectedVersion + 1
  4. `verifyBoardFence(pmDir, expectedCommitHash)` runs `git rev-parse HEAD` and returns true if it matches the expected hash
  5. Unit tests: successful fence verification, version mismatch detection, HEAD divergence detection

##### E060-S005: Baseline establishment on first invocation

- **Points:** 2
- **Priority:** medium
- **Depends on:** E059-S004, E060-S001
- **Description:** Implement the baseline establishment flow that runs on first invocation when `.pm/swarm/best/` is empty. The flow: compute metrics for all existing observations under the current strategy_hash/board_hash, compute the composite score, write it to `.pm/swarm/best/metadata.yaml` as the initial best. If no observations exist yet, write a placeholder indicating "awaiting baseline data" so the experiment loop can detect it.
- **Acceptance Criteria:**
  1. `establishBaseline(pmDir)` checks if `.pm/swarm/best/metadata.yaml` exists; if yes, returns the existing best (no-op)
  2. If no best exists and observations exist for the current hashes, computes composite score and writes metadata.yaml with composite_score, experiment_id: "baseline", strategy snapshot, board_hash, timestamp
  3. If no best exists and no observations exist, writes metadata.yaml with `status: "awaiting-baseline"` and composite_score: null
  4. Copies current strategy.yaml to `.pm/swarm/best/strategy.yaml`
  5. Unit tests: baseline with existing observations, baseline with no observations, no-op when best already exists

---

### E061: Experiment Loop (5 stories, 22 points)

**Priority:** high
**Depends on:** E059-S004, E060-S003, E060-S004
**Description:** Implement the `/pm-swarm-improve` slash command that runs the experiment loop. Covers the full ANALYZE-HYPOTHESIZE-CLAIM-CONFIGURE-OBSERVE-EVALUATE-DECIDE-PUBLISH cycle, dual mutation paths, loop reliability mechanisms, structured EXPERIMENT_RESULT output, and error handling.

#### Stories

##### E061-S001: /pm-swarm-improve slash command scaffold

- **Points:** 5
- **Priority:** high
- **Depends on:** E059-S004, E060-S003
- **Description:** Create `install/commands/pm-swarm-improve.md` implementing the full experiment loop as a slash command prompt. The prompt defines the 9-step loop (ANALYZE, HYPOTHESIZE, CLAIM, CONFIGURE, OBSERVE, EVALUATE, DECIDE, PUBLISH, GOTO 1) with explicit instructions for each step. It lists the available pm commands as mutation operators and specifies the EXPERIMENT_RESULT output format. The prompt is the primary artifact -- no TypeScript code in this story.
- **Acceptance Criteria:**
  1. `install/commands/pm-swarm-improve.md` exists with the full loop structure matching ADR-023 Decision 4
  2. ANALYZE step instructs the agent to call `pm swarm analyze` and identify under-explored dimensions
  3. HYPOTHESIZE step lists the available pm mutation commands and the rotation heuristic (explore first 5, then focus)
  4. CLAIM step references the claim protocol and instructs verification
  5. CONFIGURE step branches on mutation type (board: pm commands + git commit; runtime: strategy.yaml write + version increment)
  6. OBSERVE step instructs reading observations filtered by strategy_hash/board_hash
  7. EVALUATE step instructs Tchebycheff composite scoring
  8. DECIDE step compares against best, instructs keep (update best) or discard (git revert for board, restore best strategy.yaml for runtime)
  9. PUBLISH step requires both a result file and an insight file; optionally a hypothesis
  10. Human override detection: if strategy_hash or board git history changed externally, evaluate the override and record as result

##### E061-S002: Loop reliability mechanisms

- **Points:** 5
- **Priority:** high
- **Depends on:** E061-S001
- **Description:** Implement three reliability mechanisms for the experiment loop: (a) Per-iteration state file `.pm/swarm/loop-state.yaml` written after PUBLISH and read at ANALYZE, containing current_iteration, last_completed_step, current_experiment_id, and last 3 result summaries. (b) Step-level Zod validation: each step's output is validated against a step-specific schema before proceeding; on validation failure, retry once then abort the iteration (not the whole loop). (c) Context budget: the PUBLISH step instructions tell the agent to carry forward only loop-state + current best + last 3 summaries into the next iteration, discarding earlier conversation context.
- **Acceptance Criteria:**
  1. `LoopStateSchema` (Zod) validates: current_iteration (number), last_completed_step (enum of the 8 step names), current_experiment_id (string), recent_summaries (array of up to 3 result summaries), started_at (ISO datetime)
  2. After PUBLISH, the slash command instructs writing loop-state.yaml; at ANALYZE, it instructs reading loop-state.yaml to resume context
  3. Step validation schemas exist for HYPOTHESIZE output (must have mutation_type, description, expected_effect), CONFIGURE output (must have commit_hash or config_version), EVALUATE output (must have composite_score, tactic_scores)
  4. On step validation failure: retry the step once; if the retry also fails, log the error and skip to the next iteration (GOTO ANALYZE)
  5. The PUBLISH step instructions explicitly state: "For the next iteration, carry forward only: loop-state.yaml content, current best from metadata.yaml, and the last 3 result summaries. Discard all other prior context."
  6. Unit tests verify LoopStateSchema validation and step output schemas

##### E061-S003: Dual mutation path implementation

- **Points:** 5
- **Priority:** high
- **Depends on:** E061-S001, E060-S004
- **Description:** Implement the CONFIGURE and DECIDE step logic for both mutation types. For board mutations: execute pm commands, git commit with descriptive message, record commit hash. On discard: `git revert --no-edit <commit>`. For runtime config: read current config_version, write new strategy.yaml with version+1, record strategy_hash. On discard: copy `.pm/swarm/best/strategy.yaml` back, increment config_version. Provide TypeScript helper functions that the slash command instructions reference.
- **Acceptance Criteria:**
  1. `applyBoardMutation(pmDir, pmCommands)` executes the pm commands, stages .pm/ changes, creates a git commit with message "swarm-experiment: <description>", returns the commit hash
  2. `revertBoardMutation(pmDir, commitHash)` runs `git revert --no-edit <commitHash>` and returns success/failure
  3. `applyRuntimeMutation(pmDir, parameterPath, newValue)` reads strategy.yaml, updates the parameter, increments config_version, writes atomically, returns the new config_version
  4. `revertRuntimeMutation(pmDir)` copies `.pm/swarm/best/strategy.yaml` over the current one, increments config_version, writes atomically
  5. Unit tests: apply and revert board mutation (verifies git history), apply and revert runtime mutation (verifies config_version monotonically increases)

##### E061-S004: Integration test with error handling

- **Points:** 5
- **Priority:** high
- **Depends on:** E061-S001, E061-S002, E061-S003
- **Description:** End-to-end integration test that runs a minimal experiment loop: init swarm, establish baseline with fixture observations, run one experiment iteration (runtime config mutation), verify the result is published. Additionally, test three error paths from the Pointers Report (R1): (a) git revert failure (simulate merge conflict, verify log + escalation), (b) claim TTL expiry mid-experiment (simulate clock advance past TTL during OBSERVE, verify detection + iteration abort), (c) strategy.yaml corruption (write invalid YAML, verify fallback to best or iteration abort).
- **Acceptance Criteria:**
  1. Happy path: pm swarm init -> write fixture observations -> establish baseline -> apply runtime mutation -> write more observations -> evaluate -> decide (keep or discard) -> publish result and insight to .pm/swarm/results/ and .pm/swarm/insights/
  2. Git revert failure: simulate by making a conflicting commit before revert; verify the error is logged and an escalation is filed (agent state set to needs_attention with type: error)
  3. Claim TTL expiry: set claim TTL to 1 second, advance clock past it during OBSERVE step; verify the iteration aborts cleanly without publishing a corrupted result
  4. Strategy.yaml corruption: write invalid YAML to strategy.yaml mid-iteration; verify the system either falls back to `.pm/swarm/best/strategy.yaml` or aborts the iteration with a logged error
  5. Each error path has at least one dedicated test case
  6. All tests clean up their temp directories

##### E061-S005: EXPERIMENT_RESULT structured output

- **Points:** 2
- **Priority:** medium
- **Depends on:** E061-S001
- **Description:** Define the ExperimentResultOutput Zod schema matching the EXPERIMENT_RESULT block format from ADR-023 Decision 4 and implement an emitter function that formats the structured output block. This is the contract between the experiment loop and any consumer (TUI, logging, analysis).
- **Acceptance Criteria:**
  1. `ExperimentResultOutputSchema` validates: experiment_id, mutation_type, hypothesis, change_description, observation_window, composite_score, previous_best_score, decision (keep|discard), insight
  2. `formatExperimentResult(data)` returns a YAML string wrapped in `---\nEXPERIMENT_RESULT:\n...\n---` delimiters
  3. `parseExperimentResult(stdout)` extracts and validates the block from arbitrary text (mirrors E058-S002 pattern)
  4. Unit tests verify formatting and round-trip parsing

---

### E062: Knowledge Sharing and Analysis (6 stories, 19 points)

**Priority:** medium
**Depends on:** E057-S002, E059-S004
**Description:** Implement the four knowledge artifacts (results, hypotheses, insights, swarm analysis) and the `pm swarm analyze` CLI command. This enables inter-agent learning, exploration tracking, and trend detection.

#### Stories

##### E062-S001: Result aggregation and exploration coverage

- **Points:** 5
- **Priority:** high
- **Depends on:** E057-S002
- **Description:** Implement the first component of `pm swarm analyze`: reading all experiment results from `.pm/swarm/results/`, computing exploration coverage (which mutation categories and dimensions have been explored, how many times each), and reporting the global best from `.pm/swarm/best/metadata.yaml`. Exploration coverage tracks: for runtime_config, count experiments per parameter_path; for board_mutations, count experiments per category (priority_changes, dependency_changes, story_splits).
- **Acceptance Criteria:**
  1. `aggregateResults(pmDir)` reads all files in `.pm/swarm/results/`, validates each against ExperimentResultSchema, returns array of valid results (skipping invalid files with warnings)
  2. `computeExplorationCoverage(results)` returns `{ runtime_config: Record<string, number>, board_mutations: Record<string, number> }` counting experiments per dimension
  3. Board mutation categories are classified by inspecting pm_commands: commands containing "priority" -> priority_changes, "depends-on" -> dependency_changes, "story add" -> story_splits
  4. `readGlobalBest(pmDir)` returns the best metadata or null if no best established
  5. Unit tests with 5+ fixture results verifying aggregation counts and category classification

##### E062-S002: Trend detection and composite analysis

- **Points:** 3
- **Priority:** medium
- **Depends on:** E062-S001
- **Description:** Implement trend detection comparing the 5 most recent experiment composite scores against the preceding 5. Delta > 0.02: `improving`. Within +/- 0.02: `plateaued`. Delta < -0.02: `regressing`. Also compute: experiment_count, active_claims (from FileSwarmStore), unclaimed_hypotheses count, and agent_bests summary.
- **Acceptance Criteria:**
  1. `detectTrend(results)` returns `"improving" | "plateaued" | "regressing"` based on comparing average composite_score of 5 most recent vs 5 preceding
  2. If fewer than 10 results exist, uses all available results split into halves; if fewer than 2, returns "plateaued"
  3. `buildAnalysisSummary(pmDir)` returns the full analysis object: global_best, recent_results (last 10), active_claims, unclaimed_hypotheses count, agent_bests, improvement_trend, experiment_count, exploration_coverage
  4. Unit tests: improving trend (ascending scores), plateaued trend (flat scores), regressing trend (descending scores), edge case with fewer than 10 results

##### E062-S003: `pm swarm analyze` CLI command and formatted output

- **Points:** 3
- **Priority:** medium
- **Depends on:** E062-S001, E062-S002, E057-S005
- **Description:** Implement the `pm swarm analyze` subcommand that runs the analysis pipeline and outputs a formatted summary. The output is structured YAML suitable for both human reading and agent parsing. Register the subcommand under the `pm swarm` command group.
- **Acceptance Criteria:**
  1. `pm swarm analyze` outputs the full analysis summary as YAML to stdout
  2. Output includes: global_best section, improvement_trend, experiment_count, exploration_coverage, recent_results (last 5 with experiment_id, mutation_type, decision, composite_score), active_claims count, unclaimed_hypotheses count
  3. If `.pm/swarm/` does not exist, prints "Swarm not initialized. Run pm swarm init first." and exits with code 1
  4. The subcommand is registered under `pm swarm` in the CLI
  5. Integration test: init swarm, write fixture results, run `pm swarm analyze`, verify output contains expected fields

##### E062-S004: Hypothesis exchange -- write and list

- **Points:** 3
- **Priority:** medium
- **Depends on:** E057-S002
- **Description:** Implement hypothesis writing and listing. An experiment agent writes a hypothesis to `.pm/swarm/hypotheses/<timestamp>-<agent-id>-<slug>.yaml` proposing a future experiment. The listing function returns unclaimed hypotheses sorted by priority. Hypotheses with type `tactic_suggestion` are flagged for human review (they cannot be auto-claimed by experiment agents).
- **Acceptance Criteria:**
  1. `writeHypothesis(pmDir, hypothesis)` writes a validated hypothesis file with auto-generated timestamp-based filename
  2. `listHypotheses(pmDir, filter?)` returns hypotheses filtered by status (default: unclaimed), sorted by priority ascending (1 = highest)
  3. Hypotheses with `type: tactic_suggestion` have a `requires_human_review: true` field added automatically
  4. Unit tests: write and list round-trip, priority sorting, tactic_suggestion flagging

##### E062-S005: Insight accumulation -- write, list, and tag search

- **Points:** 3
- **Priority:** medium
- **Depends on:** E057-S003
- **Description:** Implement insight writing, listing, and tag-based search. Every experiment publishes exactly one insight. Insights are written to `.pm/swarm/insights/<timestamp>-<agent-id>-<slug>.yaml`. The search function supports filtering by tags and by Levenshtein similarity on the insight text (using FileSwarmStore.search).
- **Acceptance Criteria:**
  1. `writeInsight(pmDir, insight)` writes a validated insight file with auto-generated filename
  2. `listInsights(pmDir, limit?)` returns insights sorted by posted_at descending, with optional limit
  3. `searchInsights(pmDir, query, threshold)` uses FileSwarmStore.search on the insights namespace
  4. `filterInsightsByTag(pmDir, tag)` returns only insights whose tags array includes the given tag
  5. Unit tests: write/list round-trip, tag filtering, search by similarity

##### E062-S006: Cascading best-tracking with safety guards

- **Points:** 2
- **Priority:** high
- **Depends on:** E060-S005, E059-S004
- **Description:** Implement the cascading best-tracking logic from ADR-023 Decision 6a. Agent personal best in `.pm/swarm/best/agent-<id>.yaml`. Global best in `.pm/swarm/best/metadata.yaml` with safety guards: reject composite_score <= 0 (error result), reject improvement > 0.30 in one step (anomaly detection), double-read before write (read, compute, re-read, verify no concurrent update, then write).
- **Acceptance Criteria:**
  1. `updateAgentBest(pmDir, agentId, result)` writes/updates the agent's personal best if the new composite_score exceeds the current one
  2. `updateGlobalBest(pmDir, result)` updates metadata.yaml if composite_score > current best, with safety guards
  3. Rejects composite_score <= 0 with logged warning "Error result, not updating best"
  4. Rejects improvement > 0.30 over current best with logged warning "Anomalous improvement, skipping"
  5. Double-read: reads metadata.yaml, computes update, re-reads to verify composite_score hasn't changed, then writes; on mismatch, retries once
  6. metadata.yaml stores previous_best_score and previous_best_experiment_id for audit
  7. Unit tests: normal update, rejection of score <= 0, rejection of anomalous improvement, concurrent write detection

---

### E063: TUI Integration (5 stories, 8 points)

**Priority:** low
**Depends on:** E057-S002, E058-S003
**Description:** Display swarm experiment status, current best configuration, and improvement trend in the existing TUI. Extends the agent sidebar and status bar with swarm-specific data.

#### Stories

##### E063-S001: Swarm status data loader

- **Points:** 2
- **Priority:** low
- **Depends on:** E062-S002
- **Description:** Create a data loader for the TUI that reads swarm analysis summary data and formats it for display. The loader calls `buildAnalysisSummary()` and transforms it into TUI-friendly data structures (strings, color codes for trend).
- **Acceptance Criteria:**
  1. `loadSwarmStatus(pmDir)` returns `{ trend: string, trendColor: string, experimentCount: number, bestScore: number | null, activeClaims: number }` or null if swarm not initialized
  2. Trend colors: improving = green, plateaued = yellow, regressing = red
  3. Returns null (not error) if `.pm/swarm/` does not exist
  4. Unit test verifies data transformation

##### E063-S002: Experiment status in StatusBar

- **Points:** 2
- **Priority:** low
- **Depends on:** E063-S001
- **Description:** Add swarm experiment status to the TUI StatusBar component. Display: experiment count, improvement trend (with color), and current best composite score. Only shown if swarm is initialized.
- **Acceptance Criteria:**
  1. StatusBar displays "Swarm: N experiments | trend | best: X.XX" when swarm is initialized
  2. Trend text is colored per E063-S001 color mapping
  3. StatusBar is unchanged when swarm is not initialized (no extra whitespace or placeholder)
  4. Component renders correctly with the swarm data loader returning null

##### E063-S003: Active experiments in AgentSidebar

- **Points:** 2
- **Priority:** low
- **Depends on:** E063-S001
- **Description:** Add active experiment claims to the AgentSidebar component. Show each active claim's agent_id, mutation type, and time elapsed since claimed_at. Use the same update interval as agent heartbeats.
- **Acceptance Criteria:**
  1. AgentSidebar shows "Active Experiments" section listing active claims
  2. Each claim shows: agent_id, mutation_type icon (gear for runtime, tree for board), elapsed time
  3. Section is hidden when no active claims exist
  4. Component handles empty claims array without error

##### E063-S004: Recent results in DetailPanel

- **Points:** 1
- **Priority:** low
- **Depends on:** E063-S001
- **Description:** Add a "Recent Experiments" section to the DetailPanel showing the last 5 experiment results with decision (keep/discard), composite score, and one-line description.
- **Acceptance Criteria:**
  1. DetailPanel shows "Recent Experiments" section with last 5 results
  2. Each result shows: decision (color-coded: keep=green, discard=red), score, truncated description
  3. Section is hidden when no results exist

##### E063-S005: Exploration coverage visualization

- **Points:** 1
- **Priority:** low
- **Depends on:** E063-S001
- **Description:** Add a compact exploration coverage display to the DetailPanel showing which dimensions have been explored and how many times. Use a simple bar chart or heat indicator per dimension.
- **Acceptance Criteria:**
  1. DetailPanel shows exploration coverage with dimension names and experiment counts
  2. Dimensions with 0 experiments are shown in dim/grey to highlight gaps
  3. Display updates when swarm analysis data refreshes

---

## Drafter Vote

**Vote:** CONVERGE
**Rationale:** V2 addresses all five Critical pointers (C1-C5) with dedicated stories and specific ACs, both Recommended pointers (R1-R2) with concrete error-handling tests and the three-state idle ratio algorithm, and preserves all Confirmed design decisions unchanged. The story count increased modestly (33 to 38) with clear dependency chains and no story exceeding 8 points.
