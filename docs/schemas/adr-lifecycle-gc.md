# ADR Lifecycle and Garbage Collection

This document defines the lifecycle rules, time-to-live (TTL) policies, and garbage collection schedules for comments, execution reports, and ADRs in the project management system.

## Version

1.0.0

## Comment TTL Policy

### Retention Rules

Comments are retained based on their state and relevance:

| State                                                                | Retention  | Rationale                                       |
| -------------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| `consolidated: false`                                                | Indefinite | 未被整合的评论可能仍含有关联agent需要的关键信息 |
| `consolidated: true` + target task active                            | Indefinite | Active tasks may need reference to past context |
| `consolidated: true` + target task done + all consumers acknowledged | 30 days    | Grace period after task completion for review   |
| `consolidated: true` + stale (`consumed_by` missing)                 | 7 days     | Short TTL for unclaimed consolidated comments   |

### GC Eligibility

A comment is eligible for garbage collection when ALL of the following are true:

1. `consolidated: true`
2. Either:
   - The target task status is `done`, OR
   - All known consumer agent IDs appear in `consumed_by`
3. Age exceeds the applicable TTL from the table above

### TTL Calculation

TTL is calculated from the `timestamp` field:

- `comment_age = current_time - comment.timestamp`
- If `comment_age > TTL threshold`, the comment is eligible for deletion

## Report Archival Policy

### Report Types

| Type                           | Storage Location      | TTL                            |
| ------------------------------ | --------------------- | ------------------------------ |
| AgentExecutionReport (sidecar) | `{story}-report.yaml` | 90 days after story completion |
| Legacy Report (R###)           | `reports/` directory  | 180 days after creation        |

### Archival Trigger

Reports are archived when:

1. Associated story status is `done`
2. Age exceeds TTL threshold
3. Report has been consumed by consolidation agent (if applicable)

### Archive Storage

Archived reports are moved to:

```
{PM_HOME}/projects/{PROJECT}/archive/reports/{year}/{month}/
```

### Archive Format

Archived reports retain original format with added metadata:

```yaml
archived_at: 2026-03-11T00:00:00.000Z
original_path: ../reports/R001.yaml
archive_reason: ttl_exceeded
```

## ADR Lifecycle Rules

### Status Transitions

```
proposed → accepted → deprecated → superseded
  ↑           ↓
  └───────────┴──────────→ (can jump to superseded)
```

### TTL by Status

| Status       | TTL     | Notes                                         |
| ------------ | ------- | --------------------------------------------- |
| `proposed`   | 30 days | Must be accepted or deprecated within 30 days |
| `accepted`   | 2 years | Long-term retention for active decisions      |
| `deprecated` | 1 year  | After being marked deprecated                 |
| `superseded` | 90 days | After being superseded, can be archived       |

### GC Eligibility

An ADR is eligible for archival when:

1. Status is `superseded` and age > 90 days, OR
2. Status is `deprecated` and age > 1 year, AND
3. No active stories reference this ADR in their `references` field

### ADR Superuser

The ADR system supports a "superuser" role that can:

- Force-transition any ADR to any status
- Skip TTL enforcement for critical ADRs
- Permanently delete ADRs (bypass archive)
- Bulk operations on ADR lifecycle

Superuser actions are logged in `adr-actions.log` with:

- Timestamp
- ADR ID
- Action taken
- Actor (agent_id or human name)
- Reason

## Garbage Collection Command

The `pm gc run` command (PM-E035-S002) implements the policies defined here:

```bash
pm gc run [--dry-run] [--verbose] [--type all|comments|reports|adrs]
```

### Default Behavior

- **Dry-run mode**: Shows what would be deleted without actually deleting
- **Verbose mode**: Outputs detailed progress for each GC operation
- **Type filter**: Process only specified type (default: all)

### GC Schedule

Recommended cron schedule (PM-E035-S002 implementation detail):

```
0 2 * * *  # Daily at 2 AM
```

## Implementation Notes

### Schema Extensions Required

1. **Comments**: No schema changes needed; GC uses existing `consolidated`, `consumed_by`, and `timestamp` fields
2. **Reports**: Add `archived_at` and `archive_reason` fields to support archival
3. **ADRs**: Add `archived_at` and `archive_reason` fields; add `superuser_override` flag

### File Organization

```
{PM_HOME}/projects/{PROJECT}/
├── comments/
│   ├── index.yaml
│   └── C######-*.yaml
├── reports/
│   └── (active reports)
├── adrs/
│   ├── index.yaml
│   └── ADR-###.yaml
└── archive/
    ├── reports/
    │   └── {year}/{month}/
    └── adrs/
        └── {year}/{month}/
```

## Migration Path

Existing data follows these migration rules:

1. **Comments created before this policy**: Treat as `consolidated: false` (indefinite retention)
2. **Reports created before this policy**: Apply 180-day TTL from creation date
3. **ADRs created before this policy**: Use `accepted` status with 2-year TTL

## Future Considerations

- Consider compression for archived reports (gzip)
- Consider offsite storage for archives > 1 year
- Add search capability across archived content
- Implement soft-delete with restore capability
