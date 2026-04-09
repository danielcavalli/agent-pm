# Command Reference

This document is generated from `src/contracts/command-registry.ts`. Treat it as the authoritative CLI and MCP reference.

## Table of Contents

- [`pm init`](#pm-init)
- [`pm remove`](#pm-remove)
- [`pm swarm init`](#pm-swarm-init)
- [`pm swarm analyze`](#pm-swarm-analyze)
- [`pm epic add`](#pm-epic-add)
- [`pm epic list`](#pm-epic-list)
- [`pm epic sync`](#pm-epic-sync)
- [`pm story add`](#pm-story-add)
- [`pm story list`](#pm-story-list)
- [`pm story update`](#pm-story-update)
- [`pm work`](#pm-work)
- [`pm prioritize`](#pm-prioritize)
- [`pm rules init`](#pm-rules-init)
- [`pm rules remove`](#pm-rules-remove)
- [`pm status`](#pm-status)
- [`pm migrate to-local`](#pm-migrate-tolocal)
- [`pm migrate from-source`](#pm-migrate-fromsource)
- [`pm tui`](#pm-tui)
- [`pm gc run`](#pm-gc-run)
- [`pm consolidate run`](#pm-consolidate-run)
- [`pm consolidate config`](#pm-consolidate-config)
- [`pm adr create`](#pm-adr-create)
- [`pm adr list`](#pm-adr-list)
- [`pm adr query`](#pm-adr-query)
- [`pm comment add`](#pm-comment-add)
- [`pm comment list`](#pm-comment-list)
- [`pm report create`](#pm-report-create)
- [`pm report view`](#pm-report-view)
- [`pm mutation diagnostics`](#pm-mutation-diagnostics)
- [`pm agent heartbeat`](#pm-agent-heartbeat)
- [`pm agent escalate`](#pm-agent-escalate)
- [`pm agent check-response`](#pm-agent-checkresponse)
- [`pm escalation list`](#pm-escalation-list)

## `pm init`

Initialize a new project. Create a project definition and bootstrap local PM data.

- CLI description: Initialize a new project and create its YAML definition
- Side effects: write -- Creates the local .pm directory and project YAML files.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`name` | string | `--name <name>` | - | CLI | - | Project name
`code` | string | `--code <code>` | - | No | - | Optional project code override
`description` | string | `--description <desc>` | - | No |  | Project description
`vision` | string | `--vision <vision>` | - | No |  | Project vision statement
`techStack` | string[] | `--tech-stack <items...>` | - | No | [] | Technology stack entries
`architecture` | string | `--architecture <pattern>` | - | No |  | Architecture pattern label

### Examples

```bash
pm init --name "Project" --code PM
```

## `pm remove`

Remove local PM project data. Delete the local PM project store when a repository no longer needs it.

- CLI description: Remove the .pm/ directory and all project data (e.g. pm remove --force)
- Side effects: destructive -- Removes the local .pm directory and all project records.
- MCP tool: `pm_project_remove` -- Remove a project and all its epics and stories from the project management system. This is a destructive operation — use only when a project is no longer needed. Always confirm with the user before calling this tool. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | - | `project` | MCP | - | Project code to remove
`force` | boolean | `--force` | - | No | - | Skip confirmation
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm remove --force
```

## `pm swarm init`

Initialize swarm storage. Create the optional .pm/swarm workspace with default tactics and runtime strategy files.

- CLI description: Initialize optional swarm storage under .pm/swarm with default templates
- Side effects: write -- Creates .pm/swarm directories and writes default tactics.yaml and strategy.yaml files.

### Arguments

No arguments.

### Examples

```bash
pm swarm init
```

## `pm swarm analyze`

Analyze swarm state. Aggregate swarm experiment state into a YAML summary for operators and agents.

- CLI description: Analyze swarm experiment state and print an operator-friendly YAML summary
- Side effects: read -- Reads .pm/swarm state and prints a formatted YAML summary to stdout.

### Arguments

No arguments.

### Examples

```bash
pm swarm analyze
```

## `pm epic add`

Add an epic. Create a new epic within an existing project.

- CLI description: Add a new epic to a project (e.g. pm epic add PM --title "Auth")
- Side effects: write -- Writes a new epic into the project's local PM data.
- MCP tool: `pm_epic_add` -- File a new epic to the project management system. Use this when decomposing a large goal into trackable work (new feature, major refactor, multi-part initiative) or when you discover a significant area of work that should be tracked. An epic is a theme with multiple independent stories — create the epic first, then file stories under it. Do NOT use this for small fixes — use story_add instead. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | `project` | MCP | - | Project code that owns the epic
`title` | string | `--title <title>` | `title` | CLI, MCP | - | Epic title
`description` | string | `--description <desc>` | `description` | MCP |  | Epic description
`priority` | string (high \| medium \| low) | `--priority <priority>` | `priority` | No | medium | Epic priority
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm epic add PM --title "Auth"
```

## `pm epic list`

List epics. Show all epics for a project.

- CLI description: List all epics for a project with status and story counts
- Side effects: read -- Reads epic metadata without mutating project state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | - | No | - | Project code to inspect

### Examples

```bash
pm epic list PM
```

## `pm epic sync`

Sync epic status. Update epic status values from underlying story completion.

- CLI description: Sync epic statuses from story completion (e.g. all stories done → epic done)
- Side effects: write -- Mutates epic status values based on current story state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | - | No | - | Project code to sync

### Examples

```bash
pm epic sync PM
```

## `pm story add`

Add a story. Create a new story under an epic.

- CLI description: Add a new story to an epic (e.g. pm story add E001 --title "..." or pm story add PM-E001 --title "...")
- Side effects: write -- Writes a new story into the selected epic.
- MCP tool: `pm_story_add` -- File a new story to the project management system. Use this to break down work into independently completable tasks that can be executed by you or picked up by parallel agents. Also use this when you discover a specific, actionable piece of work (bug, improvement, tech debt) while working on something else. Write clear acceptance criteria so any agent can verify completion. The story will be added to an existing epic's backlog. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`epicCode` | string | `<epicCode>` | `epic` | CLI, MCP | - | Epic code that will own the new story
`title` | string | `--title <title>` | `title` | CLI, MCP | - | Story title
`description` | string | `--description <desc>` | `description` | MCP |  | Story description
`points` | string (1 \| 2 \| 3 \| 5 \| 8) | `--points <points>` | `points` | No | 3 | Story point estimate
`priority` | string (high \| medium \| low) | `--priority <priority>` | `priority` | No | medium | Story priority
`criteria` | string[] | `--criteria <criteria...>` | `criteria` | No | [] | Acceptance criteria entries
`dependsOn` | string[] | `--depends-on <storyCode...>` | `depends_on` | No | [] | Story dependencies
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm story add PM-E001 --title "Write tests"
```

## `pm story list`

List stories. Show stories under an epic, optionally including dependencies.

- CLI description: List all stories for an epic with status and priority
- Side effects: read -- Reads story metadata without mutating the project.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`epicCode` | string | `<epicCode>` | - | CLI | - | Epic code to inspect
`deps` | boolean | `--deps` | - | No | - | Include dependency information
`type` | string (conflict \| gap) | `--type <type>` | - | No | - | Optional resolution-task filter

### Examples

```bash
pm story list PM-E001 --deps
```

## `pm story update`

Update a story. Modify story status, priority, or dependency metadata.

- CLI description: Update a story status or priority (e.g. pm story update E001-S001 --status done)
- Side effects: write -- Mutates an existing story record.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`storyCode` | string | `<storyCode>` | - | CLI | - | Story code to update
`status` | string (backlog \| in_progress \| done \| cancelled) | `--status <status>` | - | No | - | New story status
`priority` | string (high \| medium \| low) | `--priority <priority>` | - | No | - | New story priority
`dependsOn` | string[] | `--depends-on <storyCode...>` | - | No | - | Replacement dependency list

### Examples

```bash
pm story update PM-E001-S001 --status done
```

## `pm work`

Load story context. Display a story context block and mark the story in progress.

- CLI description: Load a story context and mark it in_progress (e.g. pm work E001-S001 or pm work PM-E001-S001)
- Side effects: write -- Marks the target story as in_progress.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`storyCode` | string | `<storyCode>` | - | CLI | - | Story code to load

### Examples

```bash
pm work PM-E001-S001
```

## `pm prioritize`

Show prioritization context. Print prioritization data for a project or epic.

- CLI description: Output prioritization context for a project or epic
- Side effects: read -- Reads planning metadata without mutating project state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | - | No | - | Project code to inspect
`epicCode` | string | `--epic <epicCode>` | - | No | - | Epic code override
`strategy` | string | `--strategy <strategy>` | - | No | - | Prioritization strategy description

### Examples

```bash
pm prioritize PM --epic PM-E001
```

## `pm rules init`

Write PM rules into AGENTS.md. Add PM agent rules to a project AGENTS.md file.

- CLI description: Write PM agent rules into the project's AGENTS.md (idempotent)
- Side effects: write -- Writes PM rule content into the target AGENTS.md file.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`path` | string | `--path <path>` | - | No | ./AGENTS.md | Target AGENTS.md path

### Examples

```bash
pm rules init --path ./AGENTS.md
```

## `pm rules remove`

Remove PM rules from AGENTS.md. Remove previously injected PM rule content from AGENTS.md.

- CLI description: Remove PM agent rules from a project's AGENTS.md
- Side effects: write -- Mutates the target AGENTS.md file by removing PM rule content.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`path` | string | `--path <path>` | - | No | ./AGENTS.md | Target AGENTS.md path

### Examples

```bash
pm rules remove --path ./AGENTS.md
```

## `pm status`

Show project status. Display the local project status summary.

- CLI description: Show project status summary for the local .pm/ project
- Side effects: read -- Reads project data and prints a human or JSON summary.
- MCP tool: `pm_status` -- Show current project management status. Use this to understand what projects exist, what work is in progress, and what's in the backlog before filing new items or picking up work. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`json` | boolean | `--json` | - | No | - | Emit machine-readable output
`projectCode` | string | - | `project` | No | - | Optional project code override for MCP projection
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm status
pm status --json
```

## `pm migrate to-local`

Migrate a project to local storage. Move a project from global PM_HOME storage into a repository-local .pm directory.

- CLI description: Migrate a project from global ~/.pm/projects/{CODE}/ to local .pm/ at target
- Side effects: write -- Creates local project files and may remove the source when cleanup is enabled.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`code` | string | `--code <code>` | - | CLI | - | Project code to migrate
`target` | string | `--target <path>` | - | CLI | - | Target repository path
`cleanup` | boolean | `--cleanup` | - | No | - | Remove the original global project after migration

### Examples

```bash
pm migrate to-local --code PM --target /repo
```

## `pm migrate from-source`

Migrate projects from a source directory. Import projects from a legacy source directory into .pm.

- CLI description: Migrate projects from a source directory to .pm/
- Side effects: write -- Creates local .pm project data from a source directory.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`source` | string | `--source <path>` | - | No | - | Source directory to migrate from

### Examples

```bash
pm migrate from-source --source ./projects
```

## `pm tui`

Launch the TUI. Open the interactive terminal dashboard.

- CLI description: Launch the interactive TUI dashboard (live project board)
- Side effects: read -- Starts an interactive UI session without mutating project data on launch.

### Arguments

No arguments.

### Examples

```bash
pm tui
```

## `pm gc run`

Run garbage collection. Clean stale PM artifacts from the local store.

- CLI description: Run garbage collection on the local .pm/ directory
- Side effects: write -- Deletes or reports stale PM artifacts based on options.
- MCP tool: `pm_gc_run` -- Run garbage collection on the local .pm/ directory to clean up stale artifacts — expired comments, consolidated reports, and superseded ADRs. Use this periodically to keep the project data lean. Supports a dry-run mode to preview what would be collected without making changes. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`dryRun` | boolean | `--dry-run` | `dry_run` | No | - | Preview changes without executing them
`verbose` | boolean | `--verbose` | - | No | - | Show TTL evaluation details
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm gc run --dry-run
```

## `pm consolidate run`

Run consolidation. Execute the consolidation pipeline for comments and reports. Exits with code 1 after partial completion when warnings or errors are emitted.

- CLI description: Run the consolidation pipeline
- Side effects: write -- May write consolidated artifacts into the local PM store.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`dryRun` | boolean | `--dry-run` | - | No | - | Preview outputs without writing files

### Examples

```bash
pm consolidate run --dry-run
```

## `pm consolidate config`

Show consolidation config. Display the active consolidation configuration.

- CLI description: Display the current consolidation configuration
- Side effects: read -- Reads consolidation settings without mutating project state.

### Arguments

No arguments.

### Examples

```bash
pm consolidate config
```

## `pm adr create`

Create an ADR. Create a new architecture decision record.

- CLI description: Create a new ADR (e.g. pm adr create --project PM --title ...)
- Side effects: write -- Writes a new ADR document into the local PM store.
- MCP tool: `pm_adr_create` -- Create a new Architecture Decision Record (ADR). Use this to document architectural decisions with context, decision rationale, and consequences. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `--project <code>` | `project` | CLI, MCP | - | Project code
`title` | string | `--title <title>` | `title` | CLI, MCP | - | ADR title
`status` | string (proposed \| accepted \| deprecated \| superseded) | `--status <status>` | `status` | CLI, MCP | - | ADR lifecycle status
`context` | string | `--context <context>` | `context` | CLI, MCP | - | Decision context
`decision` | string | `--decision <decision>` | `decision` | CLI, MCP | - | Decision statement
`positiveConsequences` | string[] | `--positive <items...>` | `positive_consequences` | No | [] | Positive consequences
`negativeConsequences` | string[] | `--negative <items...>` | `negative_consequences` | No | [] | Negative consequences
`authorType` | string (agent \| human) | `--author-type <type>` | `author_type` | No | human | ADR author type
`authorName` | string | `--author <name>` | `author_name` | No | - | Human author name
`authorId` | string | `--author-id <id>` | `author_id` | No | - | Agent author identifier
`tags` | string[] | `--tags <tags...>` | `tags` | No | [] | ADR tags
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm adr create --project PM --title Decision --status accepted
```

## `pm adr list`

List ADRs. Show ADRs for a project.

- CLI description: List all ADRs for a project
- Side effects: read -- Reads ADR metadata without mutating project state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | - | No | - | Project code to inspect

### Examples

```bash
pm adr list PM
```

## `pm adr query`

Query ADRs. Search and filter ADRs by status, tags, author, or text.

- CLI description: Query ADRs with filters, ranked by relevance
- Side effects: read -- Reads ADR data without mutating project state.
- MCP tool: `pm_adr_query` -- Query Architecture Decision Records (ADRs) with filters and relevance ranking. Results are scored by tag match count plus recency and returned sorted by relevance. Use this to find relevant architectural decisions before making new ones, or to check existing guidance on a topic. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `[projectCode]` | `project` | No | - | Optional project code
`id` | string | `--id <pattern>` | `id` | No | - | ADR id pattern
`status` | string (proposed \| accepted \| deprecated \| superseded) | `--status <status>` | `status` | No | - | ADR status filter
`tag` | string | `--tag <tag>` | - | No | - | Single-tag filter
`tags` | string[] | `--tags <tags...>` | `tags` | No | - | Multi-tag filter
`authorType` | string (agent \| human) | `--author-type <type>` | - | No | - | Author-type filter
`author` | string | `--author <author>` | `author` | No | - | Author filter
`search` | string | `--search <text>` | `search` | No | - | Full-text search string
`limit` | number | `--limit <n>` | `limit` | No | 5 | Maximum result count
`format` | string (summary \| full) | `--format <fmt>` | `format` | No | summary | Output format
`verbose` | boolean | `--verbose` | - | No | - | Show relevance scores in summary mode
`includeSuperseded` | boolean | `--include-superseded` | `include_superseded` | No | - | Include superseded and deprecated ADRs
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm adr query PM --tags cli contract
```

## `pm comment add`

Add a comment. Attach a cross-task comment to an epic or story.

- CLI description: Add a comment to an epic or story
- Side effects: write -- Writes a new comment and updates the comment index.
- MCP tool: `pm_comment_add` -- Add a comment to a target task for async cross-task communication. Use this to leave notes for other agents or humans working on related tasks. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`target` | string | `--target <taskId>` | `target` | CLI, MCP | - | Target task id
`type` | string (agent \| human) | `--type <type>` | `type` | CLI, MCP | - | Comment type
`content` | string | `--content <content>` | `content` | CLI, MCP | - | Comment body
`tags` | string[] | `--tags <tags...>` | `tags` | No | [] | Comment tags
`author` | string | `--author <name>` | `author` | No | - | Human author name
`authorId` | string | `--author-id <id>` | `author_id` | No | - | Agent author id
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm comment add --target PM-E001-S001 --type agent --content note
```

## `pm comment list`

List comments. List cross-task comments with optional filtering.

- CLI description: List comments with optional filters
- Side effects: read -- Reads comment records without mutating project state.
- MCP tool: `pm_comment_list` -- List comments with optional filters. Use this to retrieve comments for a specific task or filtered by type/author. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`projectCode` | string | `--project <code>` | `project` | MCP | - | Project code
`task` | string | `--task <taskId>` | `task` | No | - | Target task filter
`type` | string (agent \| human) | `--type <type>` | `type` | No | - | Comment type filter
`author` | string | `--author <author>` | `author` | No | - | Author filter
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm comment list --project PM --task PM-E001-S001 --type agent
```

## `pm report create`

Create an execution report. Write an execution report for a completed story.

- CLI description: Create an execution report for a story
- Side effects: write -- Writes an execution report artifact into the local PM store.
- MCP tool: `pm_report_create` -- Create an execution report for a completed task. The report captures decisions, assumptions, tradeoffs, and observations to support the consolidation agent's work. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`taskId` | string | `--task-id <taskId>` | `task_id` | CLI, MCP | - | Story id
`agentId` | string | `--agent-id <agentId>` | `agent_id` | No | - | Agent identifier
`timestamp` | string | `--timestamp <timestamp>` | - | No | - | ISO-8601 report timestamp
`status` | string (complete \| partial) | `--status <status>` | `status` | No | complete | Report status
`decisions` | string[] | `--decisions <items...>` | `decisions` | No | [] | Decision items
`assumptions` | string[] | `--assumptions <items...>` | `assumptions` | No | [] | Assumption items
`tradeoffs` | string[] | `--tradeoffs <items...>` | `tradeoffs` | No | [] | Tradeoff items
`outOfScope` | string[] | `--out-of-scope <items...>` | `out_of_scope` | No | [] | Out-of-scope items
`potentialConflicts` | string[] | `--potential-conflicts <items...>` | `potential_conflicts` | No | [] | Potential conflict items
`force` | boolean | `--force` | `force` | No | - | Overwrite an existing report
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm report create --task-id PM-E001-S001 --agent-id agent-1
```

## `pm report view`

View an execution report. Display an execution report by story id.

- CLI description: View an execution report by story ID
- Side effects: read -- Reads a report artifact without mutating project state.
- MCP tool: `pm_report_view` -- View an execution report by task ID. Displays the report in human-readable format with section headers. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`taskId` | string | `<taskId>` | `task_id` | CLI, MCP | - | Story id
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm report view PM-E001-S001
```

## `pm mutation diagnostics`

Inspect mutation anomalies. Show recent mutation failures, warnings, and lock contention from the local diagnostics log.

- CLI description: Inspect recent mutation failures, warnings, and lock contention
- Side effects: read -- Reads persisted mutation anomaly records without mutating project state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`limit` | number | `--limit <n>` | - | No | 10 | Maximum anomalies to display
`detailed` | boolean | `--detailed` | - | No | - | Show detailed multi-line output

### Examples

```bash
pm mutation diagnostics
pm mutation diagnostics --detailed --limit 20
```

## `pm agent heartbeat`

Send an agent heartbeat. Create or update agent state, including optional progress metadata.

- CLI description: Send a heartbeat for an agent, creating or updating its state file
- Side effects: write -- Writes agent lifecycle state into the local PM store.
- MCP tool: `pm_agent_heartbeat` -- Send an agent heartbeat, creating or updating the agent's state file at .pm/agents/{agent_id}.yaml. Use this periodically during long-running tasks to signal that the agent is still alive and to record progress. The tool sets last_heartbeat to the current timestamp and preserves all other existing fields. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`agentId` | string | `--agent-id <agentId>` | `agent_id` | CLI, MCP | - | Unique agent identifier
`sessionId` | string | `--session-id <sessionId>` | `session_id` | No | - | Session identifier
`logFile` | string | `--log-file <logFile>` | `log_file` | No | - | Declared agent log file path
`status` | string (active \| idle \| needs_attention \| blocked \| completed) | `--status <status>` | `status` | No | active | Agent status
`currentTask` | string | `--current-task <currentTask>` | `current_task` | No | - | Current story code
`progressSummary` | string | `--progress-summary <progressSummary>` | `progress_summary` | No | - | High-level progress summary
`totalCriteria` | number | `--total-criteria <totalCriteria>` | `total_criteria` | No | - | Total criteria tracked in progress
`completedCriteria` | number | `--completed-criteria <completedCriteria>` | `completed_criteria` | No | - | Completed criteria count
`currentStep` | string | `--current-step <currentStep>` | `current_step` | No | - | Current execution step label
`criteriaStatus` | json | `--criteria-status <criteriaStatus>` | `criteria_status` | No | - | Per-criterion progress entries
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm agent heartbeat --agent-id agent-1 --status active
```

## `pm agent escalate`

Escalate an agent issue. Record an escalation that requires human attention.

- CLI description: Escalate an issue, setting agent status to needs_attention with escalation details
- Side effects: write -- Writes escalation details into agent state.
- MCP tool: `pm_agent_escalate` -- Escalate an issue from an agent, setting its status to needs_attention and recording escalation details in .pm/agents/{agent_id}.yaml. Use this when the agent encounters a situation requiring human or supervisor intervention — a decision that needs approval, a clarification question, or an error that cannot be resolved autonomously. If the agent state file does not exist, it is created with started_at set to now. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`agentId` | string | `--agent-id <agentId>` | `agent_id` | CLI, MCP | - | Unique agent identifier
`type` | string (decision \| clarification \| approval \| error) | `--type <type>` | `type` | CLI, MCP | - | Escalation type
`message` | string | `--message <message>` | `message` | CLI, MCP | - | Escalation message
`confidence` | number | `--confidence <confidence>` | `confidence` | No | - | Confidence level from 0 to 1
`options` | string[] | `--options <options...>` | `options` | No | - | Escalation options
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm agent escalate --agent-id agent-1 --type decision --message need-help
```

## `pm agent check-response`

Check for an agent response. Read and consume a human response to an outstanding escalation.

- CLI description: Check for a human response to an agent escalation (read-once: deletes after read)
- Side effects: write -- Consumes and deletes the agent response file when one exists.
- MCP tool: `pm_agent_check_response` -- Check for a human response to a previously escalated issue. Looks for .pm/agents/{agent_id}-response.yaml, returns its contents (selected_option, additional_context, responded_at), and deletes the file (read-once semantics). If no response file exists, returns {status: no_response}. Use this periodically after escalating to check if a human has provided guidance. Pass your current working directory as workdir to ensure commands execute in the correct project context.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`agentId` | string | `--agent-id <agentId>` | `agent_id` | CLI, MCP | - | Unique agent identifier
`workdir` | string | - | `workdir` | No | - | Working directory containing the target .pm project

### Examples

```bash
pm agent check-response --agent-id agent-1
```

## `pm escalation list`

List escalation history. Show archived escalation history across all agents, or for a single agent when filtered.

- CLI description: List escalation history across all agents, with optional agent filtering
- Side effects: read -- Reads archived escalation logs without mutating project state.

### Arguments

| Argument | Type | CLI | MCP | Required | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
`agent` | string | `--agent <agent>` | - | No | - | Filter escalation history to a specific agent ID

### Examples

```bash
pm escalation list
pm escalation list --agent agent-1
```
