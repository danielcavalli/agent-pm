# ADR Schema Specification

This document defines the YAML schema for Architecture Decision Records (ADRs) in the project management system. ADRs follow Michael Nygard's format and are stored as YAML files for validation.

## Schema Version

1.0.0

## Storage Location

ADRs are stored in the project's `adrs/` directory:

- `{PM_HOME}/projects/{PROJECT}/adrs/index.yaml` - Main ADR index
- `{PM_HOME}/projects/{PROJECT}/adrs/{ADR_ID}-{slug}.yaml` - Individual ADR files (e.g., ADR-021.yaml)

## ADR File Naming Convention

Individual ADR files follow the pattern: `{ADR_ID}-{slug}.yaml`

- `ADR_ID`: Auto-generated, format `ADR-###` (e.g., ADR-021)
- `slug`: Kebab-case slug derived from ADR title (first 30 chars)

## YAML Schema

```yaml
# =============================================================================
# ADR Schema
# =============================================================================

# Required fields
id:
  type: string
  pattern: "^ADR-\\d{3}$"
  description: |
    Auto-generated unique identifier for the ADR.
    Format: ADR-### (e.g., ADR-021, ADR-022)
  required: true
  example: "ADR-021"

title:
  type: string
  minLength: 1
  description: Short descriptive title of the decision.
  required: true
  example: "Use Zod for Runtime Validation"

status:
  type: string
  enum: ["proposed", "accepted", "deprecated", "superseded"]
  description: |
    Current status of the ADR:
    - "proposed": Under consideration, not yet accepted
    - "accepted": Accepted and active decision
    - "deprecated": No longer recommended
    - "superseded": Replaced by another ADR
  required: true
  example: "accepted"

context:
  type: string
  minLength: 1
  description: |
    The issue being addressed - why this decision is needed.
    Describes the problem or situation that prompted this decision.
  required: true
  example: "pm stores data as YAML files but had no runtime validation..."

decision:
  type: string
  minLength: 1
  description: |
    What was decided - the actual architectural decision.
    Describes the chosen solution/approach.
  required: true
  example: "Use Zod for runtime validation at the YAML boundary..."

consequences:
  type: object
  description: Consequences of this decision
  required: true
  properties:
    positive:
      type: array
      items:
        type: string
      description: Positive outcomes and benefits
      default: []
      example:
        - "Runtime validation catches schema violations immediately"
        - "Clear error messages for invalid YAML"

    negative:
      type: array
      items:
        type: string
      description: Negative outcomes, tradeoffs, or drawbacks
      default: []
      example:
        - "Slight performance overhead on YAML parsing"

author:
  type: object (union)
  description: Author identity - either agent ID or human name.
  required: true

  # Variant 1: Agent-authored ADR
  - type: object
    properties:
      type:
        const: "agent"
      agent_id:
        type: string
        minLength: 1
        description: Unique identifier for the agent
    required: ["type", "agent_id"]
    example:
      type: "agent"
      agent_id: "claude-code:default"

  # Variant 2: Human-authored ADR
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
  description: ISO 8601 timestamp when the ADR was created.
  required: true
  example: "2026-03-11T14:30:00.000Z"

# Optional fields
tags:
  type: array
  items:
    type: string
  default: []
  description: |
    Optional tags for retrieval filtering. Common tags:
    - "storage" - data storage decisions
    - "api" - API design decisions
    - "architecture" - architectural patterns
    - "security" - security-related decisions
  required: false
  example: ["storage", "validation"]

superseded_by:
  type: object
  description: |
    If this ADR was superseded, reference to the replacing ADR.
    Only applicable when status is "superseded".
  properties:
    by_adr_id:
      type: string
      pattern: "^ADR-\\d{3}$"
      description: ID of the ADR that supersedes this one
      example: "ADR-022"

    note:
      type: string
      description: Optional note explaining why it was superseded
  required: false
  example:
    by_adr_id: "ADR-022"
    note: "ADR-022 provides a more comprehensive solution"

references:
  type: array
  items:
    type: object
  default: []
  description: |
    Links to related artifacts - comments, reports, other ADRs, or tasks
  properties:
    type:
      type: string
      enum: ["comment", "report", "adr", "task"]
      description: Type of reference

    id:
      type: string
      description: ID of the referenced artifact

    description:
      type: string
      description: Optional description of the relationship
  required: false
  example:
    - type: "comment"
      id: "C000001"
      description: "Initial discussion about validation approach"
    - type: "task"
      id: "PM-E011-S001"
      description: "Task that led to this decision"
```

## Example ADRs

### Accepted ADR Example

```yaml
id: ADR-021
title: Use Zod for Runtime Validation
status: accepted
context: |
  pm stores data as YAML files but had no runtime validation. A user could 
  manually edit a file and introduce typos, or an agent could write malformed 
  data. We needed a validation layer to catch schema violations at the YAML 
  boundary.
decision: |
  Use Zod for runtime validation at the YAML boundary. All data is validated
  against Zod schemas on read and write, with clear error messages for 
  validation failures.
consequences:
  positive:
    - Runtime validation catches schema violations immediately
    - Clear error messages guide users to fix invalid data
    - Schema serves as documentation of expected data structure
  negative:
    - Slight performance overhead on YAML parsing
    - Need to maintain schemas as data model evolves
author:
  type: agent
  agent_id: claude-code:default
timestamp: 2026-03-11T14:30:00.000Z
tags:
  - storage
  - validation
references:
  - type: task
    id: PM-E011-S001
    description: Task to add validation layer
  - type: comment
    id: C000001
    description: Discussion about validation approach
```

### Superseded ADR Example

```yaml
id: ADR-020
title: Use @opencode-ai/plugin for Agent Integration
status: superseded
context: |
  Needed a way for OpenCode agents to interact with pm programmatically.
context: |
  Built a custom plugin that loaded into OpenCode's agent context.
decision: |
  Use @opencode-ai/plugin for custom tool integration.
consequences:
  positive:
    - Agents could call pm commands directly
  negative:
    - Only worked with OpenCode
    - Required custom plugin installation
author:
  type: agent
  agent_id: claude-code:default
timestamp: 2026-03-10T10:00:00.000Z
tags:
  - integration
superseded_by:
  by_adr_id: ADR-022
  note: MCP provides universal tool interface working with multiple clients
references:
  - type: adr
    id: ADR-022
    description: Superseding ADR
```

## Index Structure

The ADR index (`index.yaml`) maintains multiple indexes for efficient lookup:

```yaml
adrs:
  - <adr object>

by_status:
  accepted:
    - adr_id: ADR-021
      title: Use Zod for Runtime Validation
      status: accepted
      created_at: "2026-03-11T14:30:00.000Z"
      tags:
        - storage
        - validation
  proposed: []

by_tag:
  storage:
    - adr_id: ADR-021
      title: Use Zod for Runtime Validation
      status: accepted
      created_at: "2026-03-11T14:30:00.000Z"
      tags:
        - storage

last_updated: "2026-03-11T14:30:00.000Z"
```

This index enables:

- O(1) lookup of ADRs by status
- O(1) lookup of ADRs by tag
- O(1) lookup of all ADRs

## CLI Validation

The schema is validated by the CLI on write using Zod schema validation.
Invalid ADRs will be rejected with detailed error messages.

Validation rules enforced:

1. `id` must match pattern `ADR-###`
2. `title` must be non-empty
3. `status` must be one of: proposed, accepted, deprecated, superseded
4. `context` must be non-empty
5. `decision` must be non-empty
6. `consequences` must have positive and negative arrays
7. `author` must be a valid author object (agent or human variant)
8. `timestamp` must be valid ISO 8601 format
9. If `superseded_by` is present, `status` must be "superseded"

## ADR Lifecycle

ADRs move through a lifecycle:

1. **Proposed**: Created by consolidation agent or manually. Under consideration.
2. **Accepted**: Accepted by reviewers. Active architectural decision.
3. **Deprecated**: No longer recommended but still in use.
4. **Superseded**: Replaced by another ADR. Links to the replacing ADR.

The consolidation agent (PM-E033) is responsible for creating ADRs from:

- Execution reports (decisions captured during task execution)
- Cross-task comments (significant architectural signals)

See PM-E033: Consolidation Agent for details.
