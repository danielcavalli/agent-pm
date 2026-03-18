# Research: agent-pm Codebase

## Summary

agent-pm is a file-based project management tool that enables AI agents in OpenCode and Claude Code to autonomously create, track, and execute software projects. It stores all data as YAML files in a `.pm/` directory at the repository root, exposes a CLI (`pm`), an MCP server (3+6 tools over stdio), 11 slash commands (markdown prompt files), and an ink-based TUI dashboard. The system is self-hosting -- it tracks its own development with project code `PM` (50 epics, 195 stories, 164 done as of 2026-03-11).

## Scope

**Investigated:** Every source file in `src/`, all install artifacts (`install/`), all documentation (`doc/`), project data samples (`.pm/`), configuration files (`package.json`, `tsconfig.json`, `vitest.config.ts`), and the PRD/README/CONTRIBUTING/AGENTS.md files. All test helpers and sample YAML data were read.

**Excluded:** `node_modules/`, compiled `dist/` output, individual test files in `__tests__/` directories (test helpers were read for patterns), and the full PRD (only first 200 lines; the PRD is 39KB).

## Architecture

### Component Breakdown

The system has four interface layers that all read/write the same `.pm/` YAML files with no intermediary service:

1. **CLI (`src/cli.ts`)** -- Entry point using commander.js. Defines 13 top-level commands: `init`, `remove`, `epic` (add/list/sync), `story` (add/list/update), `work`, `prioritize`, `rules` (init/remove), `status`, `migrate` (to-local/from-source), `tui`, `gc` (run). Each command handler is lazily imported for fast startup. A centralized `action()` wrapper provides error handling with `PmError` formatting and `--debug` stack traces.

2. **MCP Server (`src/mcp-server.ts`)** -- Standalone Node.js process using `@modelcontextprotocol/sdk` over stdio transport. Advertises 9 tools: `pm_status`, `pm_epic_add`, `pm_story_add`, `pm_project_remove`, `pm_comment_add`, `pm_comment_list`, `pm_report_create`, `pm_report_view`, `pm_adr_create`. Every tool delegates to the CLI via `spawnSync("pm", args, { cwd })` -- the MCP server contains zero business logic, acting purely as a JSON-schema-to-CLI-args translator. All tools accept an optional `workdir` parameter for cross-project usage.

3. **Slash Commands (`install/commands/*.md`)** -- 11 markdown files that AI agents interpret as multi-step workflows. Key commands: `/pm-work-on` (execute a single story with structured result output), `/pm-work-on-project` (dependency-aware orchestrator dispatching stories with parallel sub-agents), `/pm-audit` (rigorous implementation auditor using 4 evidence sources and cross-validation), `/pm-refine-epic` (plan-only story decomposition). Commands use `$ARGUMENTS` for parameter injection.

4. **TUI (`src/tui/`)** -- ink v6 + React v19 terminal dashboard. Read-only. Uses `fs.watch` with 300ms debounce for live reload. Components: `loadTree.ts` constructs a `TreeData` from `.pm/` YAML files, `useProjectTree.ts` hook manages state, `useFileWatcher.ts` hook monitors file changes.

### Supporting Layers

- **Schemas (`src/schemas/`)** -- 10 Zod schema files defining the complete data model. All YAML reads are validated through these schemas via `readYaml<S>()`.
- **Library (`src/lib/`)** -- 5 modules: `fs.ts` (YAML I/O with Zod validation), `codes.ts` (code generation, path resolution, epic/story/report file lookup), `errors.ts` (error hierarchy), `llm.ts` (OpenAI client for consolidation features), `index.ts` (index rebuild logic).
- **Installer (`install/install.sh`)** -- Bash script that installs `pm` globally via npm, detects AI clients, registers MCP server, copies slash commands, cleans up legacy artifacts.

### Key Files and Line Counts (approximate)

| File | Purpose | Notable |
|------|---------|---------|
| `src/cli.ts:1-373` | CLI entry point, 13 commands | Lazy imports, centralized error handling |
| `src/mcp-server.ts:1-702` | MCP server, 9 tools | Pure delegation via `spawnSync` |
| `src/commands/status.ts` | Status dashboard | Most complex display logic, dual JSON/human output |
| `src/commands/work.ts` | Story execution start | Sets `in_progress`, displays context card |
| `src/commands/consolidate.ts` | LLM-powered report synthesis | Calls OpenAI, parses JSON from response |
| `src/schemas/epic.schema.ts` | Epic + embedded stories | `superRefine` for story ID uniqueness |
| `src/schemas/agent-report.schema.ts` | Agent execution reports | Max 10 items, 500 chars per field |
| `src/lib/codes.ts:1-441` | Core code/path utilities | `getPmDir()`, `findEpicFile()`, `resolveStoryCode()` |
| `install/commands/pm-work-on-project.md` | Orchestrator | Dependency graph, parallel dispatch, failure reflection |
| `install/commands/pm-audit.md` | Implementation auditor | 4 evidence sources, cross-validation, auto-filing |

## Data Flow

### Storage Layout

All data lives in `.pm/` at the git repository root (or `PM_HOME` override):

```
.pm/
  project.yaml          # Single project definition
  index.yaml            # Auto-rebuilt aggregate stats
  ADR-000.yaml          # ADR master index
  epics/
    E{NNN}-{slug}.yaml  # Epic with embedded stories array
  comments/
    index.yaml          # Comment index with by_task lookup
    C{NNNNNN}-{slug}.yaml  # Individual comments
  adrs/
    ADR-{NNN}.yaml      # Individual ADRs
  reports/
    {storyCode}-report.yaml  # Agent execution reports
    archive/             # GC'd reports
```

### Data Model Hierarchy

```
Project (1)
  +-- Epic (N)         # Separate files, code: PM-E001
       +-- Story (N)   # Embedded in epic YAML, code: PM-E001-S001
            +-- depends_on: [PM-E001-S002, ...]  # Cross-story dependencies
  +-- Comment (N)      # Separate files, target: epic or story code
  +-- ADR (N)          # Separate files, code: ADR-001
  +-- Report (N)       # Separate files, keyed by story code
```

### Key Schemas

- **ProjectSchema** (`project.schema.ts`): `code` (2-6 uppercase), `name`, `status` (active/paused/complete/archived), `consolidation` config (optional).
- **EpicSchema** (`epic.schema.ts`): `id` (E###), `code` (PROJECT-E###), `stories` array. `superRefine` enforces unique story IDs within an epic.
- **StorySchema** (`story.schema.ts`): `id` (S###), `code` (PROJECT-E###-S###), `status` (backlog/in_progress/done/cancelled), `priority` (high/medium/low), `story_points` (1/2/3/5/8), `depends_on` (array of story codes), optional `resolution_type` (conflict/gap -- reserved for consolidation agent).
- **AgentExecutionReportSchema** (`agent-report.schema.ts`): `task_id`, `agent_id`, `decisions`, `assumptions`, `tradeoffs`, `out_of_scope`, `potential_conflicts`. All arrays max 10 items, all text max 500 chars.
- **CrossTaskCommentSchema** (`comment.schema.ts`): `target_task_id` (union of epic/story code), `comment_type` (agent/human), `consumed_by` array (tracks agent reads).

### Write Path (example: adding a story)

1. User/agent calls `pm story add E001 --title "..." --criteria "..."` (CLI) or `pm_story_add` (MCP)
2. MCP server translates JSON args to CLI args, calls `spawnSync("pm", [...])`
3. CLI parses args via commander.js, calls `storyAdd()` in `src/commands/story.ts`
4. `resolveEpicCode("E001")` reads `project.yaml` to get project code, returns `"PM-E001"`
5. `findEpicFile("PM-E001")` scans `.pm/epics/` for `E001-*.yaml`
6. `readYaml(epicPath, EpicSchema)` loads + validates the epic
7. `nextStoryNumber(epicPath)` scans existing stories for next S###
8. New story object is appended to `epic.stories[]`
9. `writeYaml(epicPath, epic)` serializes and writes back
10. `rebuildIndex()` updates `.pm/index.yaml` with new counts

### Read Path (example: status)

1. CLI calls `status()` in `src/commands/status.ts`
2. Reads `project.yaml` via `readYaml(path, ProjectSchema)`
3. Scans `.pm/epics/` and reads each file via `readYaml(path, EpicSchema)`
4. Computes aggregates (story counts, progress, epic status derivation)
5. Formats output (human-readable with chalk, or JSON with `--json`)

## Dependencies

### External Dependencies (runtime)

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server protocol |
| `commander` | ^12.0.0 | CLI framework |
| `js-yaml` | ^4.1.0 | YAML serialization |
| `zod` | ^3.22.4 | Runtime schema validation |
| `chalk` | ^5.3.0 | Terminal coloring |
| `ink` | ^6.8.0 | React-based TUI |
| `react` | ^19.2.4 | Component model for TUI |
| `ink-spinner` | ^5.0.0 | Loading indicator for TUI |
| `clipboardy` | ^5.3.1 | Clipboard access in TUI |

### Internal Coupling Points

- **`src/lib/codes.ts`** is the most heavily imported module -- used by every command for `getPmDir()`, `getProjectCode()`, `findEpicFile()`, `resolveStoryCode()`, `nextEpicNumber()`, etc.
- **`src/lib/fs.ts`** is the second most coupled -- `readYaml()` and `writeYaml()` are the universal data access layer.
- **`src/lib/errors.ts`** defines the error hierarchy used by all commands and the CLI entry point.
- **MCP server depends on the CLI binary** -- it calls `spawnSync("pm", ...)`. This means the CLI must be installed globally for the MCP server to work.
- **Slash commands depend on agent interpretation** -- they are markdown prompts, not executable code. Their correctness depends entirely on the AI model following the instructions.
- **`consolidate.ts` and `semantic-clustering.ts` depend on OpenAI API** (`OPENAI_API_KEY` env var) for LLM features. This is the only external API dependency.

## Patterns and Conventions

### Design Patterns

1. **Files as API** -- All data access goes through YAML files. No database, no lock files, no API server. The filesystem IS the state store.

2. **Schema-validated I/O** -- Every YAML read passes through `readYaml<S>(path, schema)` which returns `z.output<S>`. This provides type-safe, validated data access. Schemas serve double duty as documentation and validation.

3. **CLI-as-execution-layer** -- The MCP server delegates entirely to the CLI via `spawnSync`. This keeps business logic in one place (the CLI commands) and makes the MCP server a thin translation layer.

4. **Lazy command loading** -- CLI handlers use `await import("./commands/foo.js")` to defer loading until the specific command is invoked. This keeps CLI startup fast.

5. **Hierarchical code scheme** -- `PROJECT-E###-S###` (e.g., `PM-E001-S003`). Codes are immutable, zero-padded, sequentially assigned. Resolution functions (`resolveEpicCode`, `resolveStoryCode`) accept both short (`E001-S001`) and full (`PM-E001-S001`) forms.

6. **Index as derived data** -- `index.yaml` is rebuilt from source YAML files after every mutation. Never the source of truth.

7. **Markdown-as-workflow** -- Slash commands are markdown files that AI agents interpret. Zero code to add new workflows. Cannot be unit-tested.

8. **Error hierarchy** -- `PmError` base with typed subclasses (`YamlNotFoundError`, `EpicNotFoundError`, etc.). The `action()` wrapper in `cli.ts` formats these consistently.

### Naming Conventions

| Entity | Format | Example |
|--------|--------|---------|
| Project code | `[A-Z]{2,6}` | `PM`, `MYAPP` |
| Epic ID | `E{NNN}` | `E001` |
| Epic code | `{PROJECT}-E{NNN}` | `PM-E001` |
| Epic filename | `E{NNN}-{slug}.yaml` | `E001-foundation.yaml` |
| Story ID | `S{NNN}` | `S001` |
| Story code | `{PROJECT}-E{NNN}-S{NNN}` | `PM-E001-S001` |
| Comment ID | `C{NNNNNN}` | `C000007` |
| ADR ID | `ADR-{NNN}` | `ADR-001` |
| Report ID | `R{NNN}` | `R001` |
| Execution ID | `X{NNNNNN}` | `X000001` |

### Structural Conventions

- One command module per file in `src/commands/`
- Each schema in its own `*.schema.ts` file, re-exported from `schemas/index.ts`
- Tests co-located in `__tests__/` directories adjacent to source
- `PM_HOME` env var used for test isolation (overrides `.pm/` directory location)
- All console output via `chalk` with consistent color semantics (green=success, red=error, yellow=warning, cyan=info)

## Findings

### Observed Technical Patterns

1. **Silent catch anti-pattern**: Several command files use empty `catch {}` blocks that swallow errors silently. Affected files: `consolidate-output.ts` (ADR/story creation), `epic.ts` (epicSync, epicList), `gc.ts` (isTaskCompleted), `status.ts` (epic loading), `remove.ts` (story counting), `work.ts` (project name lookup). This can make debugging difficult when things go wrong.

2. **Duplicate schema definitions**: `TaskReferenceSchema` is defined independently in both `comment.schema.ts` and `adr.schema.ts` with identical logic (`z.union([EpicCodeSchema, StoryCodeSchema])`). Similarly, `task-start.schema.ts` defines `priority` and `story_points` inline rather than importing `PrioritySchema`/`StoryPointsSchema`. This creates maintenance risk if the definitions drift.

3. **Task-start schemas not re-exported**: `ReadyTaskSchema`, `TaskStartQuerySchema`, and `TaskStartResponseSchema` from `task-start.schema.ts` are NOT re-exported from `schemas/index.ts`. They appear to be dead code or an unfinished feature.

4. **`consolidate-output.ts` uses raw `js-yaml`**: The `findBacklogEpic()` function reads epic files using `js-yaml` directly instead of the validated `readYaml()` + Zod pipeline used everywhere else. This bypasses schema validation.

5. **LLM response parsing is fragile**: Both `consolidate.ts` and `semantic-clustering.ts` extract JSON from LLM responses using `response.match(/\{[\s\S]*\}/)` regex, which would break on responses containing multiple JSON objects or nested braces in unexpected positions. Fallback behavior returns all items as "unmatched" with a summary of "Synthesis failed".

6. **`EpicStatusSchema` is aliased to `StoryStatusSchema`**: In `epic.schema.ts:4`, the epic status enum is defined as `const EpicStatusSchema = StoryStatusSchema` -- they share the same reference. This is intentional (epics and stories have the same status values) but could cause confusion.

7. **Single-project assumption is recent**: Several functions have deprecated parameters (`_projectCode`, `_filterCode`) that suggest the system was recently migrated from multi-project to single-project mode. Functions like `isProjectCodeTaken()` always return `false`. The migration path is preserved in `migrate.ts`.

8. **MCP server version is hardcoded**: `mcp-server.ts:12` hardcodes version `"0.0.6-alpha"` rather than reading from `package.json`.

9. **`consolidation` config on project schema**: The `ProjectSchema` includes a `consolidation` config with `trigger_mode`, `trigger_event_count`, `trigger_interval_minutes`, but the consolidation command (`consolidate.ts`) doesn't read these values -- `consolidateConfig` just prints a stubbed message. This appears to be an unimplemented feature.

10. **GC archival path**: `gc.ts` moves reports to `reports/archive/` but uses the flat filename (no year/month subdirectory structure), which differs from the spec in `doc/adr-lifecycle-gc.md` that describes `archive/reports/{year}/{month}/` structure.

11. **Comment consumed_by tracking**: The `AGENTS.md` rules describe a `consumed_by` tracking pattern where agents should update a comment's `consumed_by` array after reading it. However, there is no CLI command or MCP tool to perform this update -- it requires direct YAML file manipulation, contradicting the "never read YAML directly" rule elsewhere in the same document.

12. **No concurrency control**: The system has no file locking or conflict resolution for concurrent writes. ADR-008 acknowledges this risk explicitly, mitigated by the assumption of "single-user, sequential agent usage." Parallel sub-agents dispatched by `/pm-work-on-project` could theoretically cause write conflicts on the same epic file.

### Dependency/Version Notes

- All ESM-only dependencies (chalk v5, ink v6, clipboardy v5) -- requires Node.js 18+
- `@types/react` listed as a runtime dependency rather than devDependency (`package.json:36`)
- TypeScript strict mode enabled
- No linting or formatting CI configured (scripts exist but no pre-commit hooks)

## Open Questions

1. **Is the consolidation pipeline used in practice?** The LLM-based consolidation (`consolidate.ts`, `semantic-clustering.ts`) requires `OPENAI_API_KEY` and the project config's consolidation settings are stubbed. It's unclear if this feature is actively used or experimental.

2. **What is the intended scope of `task-start.schema.ts`?** These schemas (`ReadyTaskSchema`, `TaskStartQuerySchema`, `TaskStartResponseSchema`) are defined but not exported from the barrel and appear unused in any command. Are they part of a planned feature?

3. **How are parallel agent write conflicts handled in practice?** The `/pm-work-on-project` orchestrator dispatches stories to parallel sub-agents. If two agents update stories in the same epic file simultaneously, the last writer wins. Is this a practical concern or purely theoretical?

4. **Are there any downstream consumers of the `dist/` build?** The `package.json` has `"main": "dist/cli.js"` and generates declaration files. Is the package imported as a library anywhere, or is CLI/MCP the only consumption path?

5. **What is the relationship between `doc/arch/adr-*.md` files and `.pm/adrs/ADR-*.yaml` files?** The doc directory contains human-authored ADR markdown files (20 ADRs) while the `.pm/adrs/` directory contains YAML ADR files created via the CLI. These appear to be separate, non-synchronized systems for recording decisions.

6. **Is the `report.schema.ts` (`ReportSchema`) used anywhere?** The `report.ts` command creates reports using `AgentExecutionReportSchema` from `agent-report.schema.ts`, not `ReportSchema`. The latter defines a different structure with `target_type` (story/epic/project) polymorphism. It may be an unused legacy schema.
