# Cross-Task Comment Schema Specification

This document defines the YAML schema for comments that agents (or humans) attach to existing tasks in the project management system.

## Schema Version

1.0.0

## Storage Location

Comments are stored in the project's `comments/` directory:

- `{PM_HOME}/projects/{PROJECT}/comments/index.yaml` - Main comment index
- `{PM_HOME}/projects/{PROJECT}/comments/{COMMENT_ID}-{slug}.yaml` - Individual comment files

## Comment File Naming Convention

Individual comment files follow the pattern: `{COMMENT_ID}-{slug}.yaml`

- `COMMENT_ID`: Auto-generated, format `C######` (e.g., C000001)
- `slug`: Kebab-case slug derived from comment content (first 30 chars)

## YAML Schema

```yaml
# =============================================================================
# Cross-Task Comment Schema
# =============================================================================

# Required fields
id:
  type: string
  pattern: "^C\\d{6}$"
  description: |
    Auto-generated unique identifier for the comment.
    Format: C followed by 6 digits (e.g., C000001, C000002)
  required: true
  example: "C000001"

target_task_id:
  type: string
  pattern: "^[A-Z]{2,6}-E\\d{3}(-S\\d{3})?$"
  description: |
    The task (story or epic) this comment is attached to.
    Must reference a valid story (PROJECT-E###-S###) or epic (PROJECT-E###).
    Target task must be in a valid state (backlog, in_progress, done).
    Cannot target archived or deleted tasks.
  required: true
  example: "PM-E031-S001"

comment_type:
  type: string
  enum: ["agent", "human"]
  description: |
    Type of comment determining its audience and behavior:

    - "agent": Agent-facing comments. These are signals from one agent to another
      about constraints, dependencies, or context relevant to the target task.
      Agents working on or near the target task are expected to retrieve these
      comments at task start (see PM-E031-S005: Task-start retrieval contract).

    - "human": Human-facing comments. These are notes surfaced in the TUI/status
      output for human review. Agents do not typically consume these comments
      during task execution, but they may be relevant for context.
  required: true
  example: "agent"

content:
  type: string
  minLength: 1
  description: Free-form text content of the comment.
  required: true
  example: "This task depends on PM-E030-S002 being complete"

author:
  type: object (union)
  description: Author identity - either agent ID or human name.
  required: true

  # Variant 1: Agent-authored comment
  - type: object
    properties:
      type:
        const: "agent"
      agent_id:
        type: string
        minLength: 1
        description: Unique identifier for the agent (e.g., Claude Code, OpenAI)
    required: ["type", "agent_id"]
    example:
      type: "agent"
      agent_id: "claude-code:default"

  # Variant 2: Human-authored comment
  - type: object
    properties:
      type:
        const: "human"
      name:
        type: string
        minLength: 1
        description: Human's display name
    required: ["type", "name"]
    example:
      type: "human"
      name: "Dan"

timestamp:
  type: string
  format: date-time
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$"
  description: ISO 8601 timestamp when the comment was created.
  required: true
  example: "2026-03-11T14:30:00.000Z"

# Optional fields
tags:
  type: array
  items:
    type: string
  default: []
  description: |
    Optional tags for retrieval filtering. Agents or humans can filter
    comments by tags when retrieving. Common tags might include:
    - "dependency" - indicates a dependency signal
    - "blocker" - indicates a blocking issue
    - "context" - provides contextual information
    - "warning" - warns about potential issues
  required: false
  example: ["dependency", "context"]

consolidated:
  type: boolean
  default: false
  description: |
    Set to true by the consolidation agent after this comment is ingested.
    Used for garbage collection eligibility (see PM-E035: ADR Lifecycle
    and Garbage Collection).
  required: false
  example: false

consumed_by:
  type: array
  items:
    type: string
  default: []
  description: |
    List of agent IDs that have read this comment. This field enables
    dependency-based garbage collection:

    A comment is eligible for expiry when:
    1. consolidated is true, AND
    2. Either:
       a. The target agent ID appears in consumed_by, OR
       b. The target task status is completed

    This ensures comments are retained as long as they may be relevant
    to active work, but can be cleaned up once all interested parties
    have acknowledged them.

    See PM-E035: ADR Lifecycle and Garbage Collection.
  required: false
  example: []
```

## Example Comments

### Agent Comment Example

```yaml
id: C000001
target_task_id: PM-E031-S001
comment_type: agent
content: This task has a dependency on PM-E030-S002. Please ensure it's done first.
author:
  type: agent
  agent_id: claude-code:default
timestamp: 2026-03-11T14:30:00.000Z
tags:
  - dependency
  - blocker
consolidated: false
consumed_by: []
```

### Human Comment Example

```yaml
id: C000002
target_task_id: PM-E031
comment_type: human
content: Adding context for the team - this epic handles async communication between agents.
author:
  type: human
  name: Dan
timestamp: 2026-03-11T15:00:00.000Z
tags:
  - context
consolidated: true
consumed_by:
  - claude-code:default
```

## CLI Validation

The schema is validated by the CLI on write using Zod schema validation.
Invalid comments will be rejected with detailed error messages.

Validation rules enforced:

1. `id` must match pattern `C######`
2. `target_task_id` must be a valid task reference
3. `comment_type` must be either "agent" or "human"
4. `content` must be non-empty
5. `author` must be a valid author object (agent or human variant)
6. `timestamp` must be valid ISO 8601 format

## Index Structure

The comment index (`index.yaml`) maintains a by-task lookup:

```yaml
comments:
  - <comment object>

by_task:
  PM-E031-S001:
    - comment_id: C000001
      task_reference: PM-E031-S001
      created_at: "2026-03-11T14:30:00.000Z"

last_updated: "2026-03-11T14:30:00.000Z"
```

This index enables O(1) lookup of comments by target task.
