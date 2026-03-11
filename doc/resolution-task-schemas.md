# Resolution Task Schemas

This document defines the schemas for conflict and gap resolution tasks produced by the consolidation agent.

## Overview

The consolidation agent analyzes multiple execution reports and identifies:

1. **Conflict tasks** - When reports contain incompatible assumptions
2. **Gap tasks** - When reports reference undefined concepts or assumptions

Both types are stored as stories with a special `resolution_type` field that distinguishes them from normal implementation stories.

## Schema Definitions

### Common Fields (All Resolution Tasks)

| Field             | Type                    | Required | Description                                  |
| ----------------- | ----------------------- | -------- | -------------------------------------------- |
| `resolution_type` | `"conflict"` \| `"gap"` | Yes      | Identifies the type of resolution task       |
| `context`         | string                  | Yes      | Narrative description of the conflict or gap |

### Conflict Task Fields

| Field                     | Type                                                      | Required | Description                                                  |
| ------------------------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `resolution_type`         | `"conflict"`                                              | Yes      | Fixed value for conflict tasks                               |
| `conflicting_assumptions` | Array of `{assumption: string, source_report_id: string}` | Yes      | List of conflicting assumptions with their source report IDs |
| `source_reports`          | Array of string                                           | Yes      | List of report IDs that contain the conflicting assumptions  |
| `context`                 | string                                                    | Yes      | Narrative description of the conflict                        |
| `proposed_resolution`     | string                                                    | No       | Optional proposed resolution from the consolidation agent    |

### Gap Task Fields

| Field               | Type            | Required | Description                                                     |
| ------------------- | --------------- | -------- | --------------------------------------------------------------- |
| `resolution_type`   | `"gap"`         | Yes      | Fixed value for gap tasks                                       |
| `undefined_concept` | string          | Yes      | Name of the undefined concept or assumption                     |
| `referenced_in`     | Array of string | Yes      | List of report/comment IDs that reference the undefined concept |
| `context`           | string          | Yes      | Narrative description of the gap                                |

## Field Validation

### Reserved Field: `resolution_type`

The `resolution_type` field is **reserved** for the consolidation agent. Normal story creation via `pm story add` will reject any attempt to set this field:

```
$ pm story add TEST-E001 --title "My story" --resolution-type conflict
Error: resolution_type is reserved for conflict/gap tasks created by the
consolidation agent. Use --type conflict or --type gap via the consolidation
agent instead.
```

This ensures that:

1. Only the consolidation agent can create conflict/gap tasks
2. The CLI and TUI can reliably distinguish resolution tasks from implementation stories
3. Resolution tasks are always generated programmatically with consistent structure

## Examples

### Example: Conflict Task

```yaml
id: S001
code: PM-E034-S001
title: "[CONFLICT] Authentication method conflict between Report-001 and Report-002"
description: "Resolution task for conflicting assumptions"
status: backlog
priority: high
story_points: 3
resolution_type: conflict
conflicting_assumptions:
  - assumption: "Use OAuth 2.0 for authentication"
    source_report_id: "R001"
  - assumption: "Use API keys for authentication"
    source_report_id: "R002"
source_reports:
  - "R001"
  - "R002"
context: "Report R001 proposes OAuth 2.0 while Report R002 proposes API keys for
authentication. Both reports assume different authentication methods without
addressing the discrepancy."
proposed_resolution: "Evaluate both approaches against security requirements and
select the appropriate method."
```

### Example: Gap Task

```yaml
id: S002
code: PM-E034-S002
title: "[GAP] Missing 'user_permissions' concept definition"
description: "Resolution task for undefined concept"
status: backlog
priority: medium
story_points: 2
resolution_type: gap
undefined_concept: "user_permissions"
referenced_in:
  - "R001"
  - "C003"
context: "Multiple reports reference 'user_permissions' as if it were an established
concept, but no report defines what it means, what values it can have, or how
it interacts with the existing role system."
```

## Difference Between Conflict and Gap

| Aspect               | Conflict Task                                        | Gap Task                                           |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| **Trigger**          | Two or more reports contain incompatible assumptions | One or more reports reference an undefined concept |
| **Priority Default** | High                                                 | Medium                                             |
| **Resolution Goal**  | Choose between conflicting approaches                | Define the missing concept                         |
| **Source Reports**   | Must have 2+ sources with conflicting assumptions    | Can have 1+ sources referencing undefined concept  |

### Decision Guide

- **Conflict**: "Report A says X, Report B says Y - they can't both be right"
- **Gap**: "Reports keep talking about X but nobody defined what X is"
