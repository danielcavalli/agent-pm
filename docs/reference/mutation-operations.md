# Mutation Operations and Lock Policy

This document is the authoritative mutation policy for the `pm` command surface. It classifies every write or destructive command path, defines the required safety level, and assigns the minimum lock and atomicity guarantees later implementation work must satisfy.

## Safety Levels

| Level | Name                | Meaning                                                                                 | Minimum guarantee                                                                                  |
| ----- | ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| L1    | isolated-create     | Creates a new standalone artifact or subtree without rewriting existing user data.      | Lock the bootstrap target and make creation idempotent.                                            |
| L2    | append-create       | Adds a new record to an existing namespace and may also update derived indexes.         | Hold a namespace lock across identifier allocation, record creation, and index refresh.            |
| L3    | in-place-update     | Rewrites an existing artifact while preserving its identity.                            | Hold the owning file lock and replace the file atomically.                                         |
| L4    | multi-artifact      | Touches multiple files, derived data, or cross-namespace state in one logical mutation. | Hold a project-wide lock and commit the mutation as a staged unit.                                 |
| L5    | destructive-consume | Deletes state, consumes a read-once artifact, or performs irreversible cleanup.         | Hold a project-wide or owning-file destructive lock and make the final delete/consume step atomic. |

## Lock Classes

| Lock class      | Scope                                                                                                            | Use when                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| bootstrap lock  | The target bootstrap root (`.pm/`, `.pm/swarm/`, or migrated project root)                                       | A command creates or replaces a top-level workspace.                                                                        |
| namespace lock  | A namespace plus its allocator/index (`.pm/epics/`, `.pm/comments/`, `.pm/adrs/`)                                | A command allocates IDs, creates new records, or updates shared namespace metadata.                                         |
| owner-file lock | The single file that owns the mutable record (`epic.yaml`, `AGENTS.md`, agent state, response file, report file) | A command updates one logical record in place.                                                                              |
| project lock    | The entire `.pm/` store                                                                                          | A command mutates multiple files, performs cleanup, routes outputs, or can leave the store in a mixed state if interrupted. |

## Atomicity Rules

1. Every L2-L5 command must treat one user-visible invocation as one logical mutation.
2. Single-file writes must use temp-write plus atomic rename for the primary artifact.
3. Namespace mutations must keep ID allocation and any shared index updates under the same namespace lock.
4. Project-wide mutations must stage all derived outputs before flipping any completion marker or deleting source data.
5. Destructive or read-once mutations must perform the irreversible step last.

## Mutable Command Map

| Command                   | Mutation category                | Safety level | Required lock policy                                     | Required atomicity                                                                                                                  |
| ------------------------- | -------------------------------- | ------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pm init`                 | project bootstrap                | L1           | bootstrap lock on `.pm/` creation                        | Create bootstrap artifacts idempotently; publish `project.yaml` only after the directory tree exists.                               |
| `pm remove`               | project removal                  | L5           | project lock                                             | Stage any archival/safety checks first; delete the project store as the last step.                                                  |
| `pm swarm init`           | swarm bootstrap                  | L1           | bootstrap lock on `.pm/swarm/`                           | Create the swarm subtree idempotently; publish default files only after the directory exists.                                       |
| `pm epic add`             | namespace append                 | L2           | namespace lock for `.pm/epics/` and index rebuild        | Allocate the epic code, write the new epic file atomically, then refresh derived index state under the same lock.                   |
| `pm epic sync`            | derived status rewrite           | L4           | project lock                                             | Recompute all affected epic statuses from a stable snapshot, then publish rewritten files as one staged maintenance pass.           |
| `pm story add`            | embedded record append           | L3           | owner-file lock on the owning epic file                  | Rewrite the epic file atomically after inserting the new story.                                                                     |
| `pm story update`         | embedded record update           | L3           | owner-file lock on the owning epic file                  | Rewrite the epic file atomically after changing story metadata.                                                                     |
| `pm work`                 | workflow status update           | L3           | owner-file lock on the owning epic file                  | Rewrite the epic file atomically after marking the story `in_progress`.                                                             |
| `pm rules init`           | repo policy file update          | L3           | owner-file lock on `AGENTS.md`                           | Rewrite `AGENTS.md` atomically after generating the injected rules block.                                                           |
| `pm rules remove`         | repo policy file update          | L3           | owner-file lock on `AGENTS.md`                           | Rewrite `AGENTS.md` atomically after removing the injected rules block.                                                             |
| `pm migrate to-local`     | project migration                | L4           | project lock on destination and migration source guard   | Copy or stage all project files first, then switch to the local store and perform optional cleanup last.                            |
| `pm migrate from-source`  | bulk import                      | L4           | project lock                                             | Stage imported project data before publishing `.pm/` outputs.                                                                       |
| `pm gc run`               | garbage collection               | L5           | project lock                                             | Decide the deletion set from a stable snapshot, then archive/delete artifacts last.                                                 |
| `pm consolidate run`      | multi-output routing and marking | L4           | project lock                                             | Stage routed outputs and consolidated markers together so a partial run does not mix routed state with unmarked sources.            |
| `pm adr create`           | namespace append                 | L2           | namespace lock for `.pm/adrs/` and `ADR-000.yaml`        | Allocate the ADR id, write the ADR file atomically, then refresh the ADR index under the same lock.                                 |
| `pm comment add`          | namespace append                 | L2           | namespace lock for `.pm/comments/` and `index.yaml`      | Allocate the comment id, write the comment file atomically, then refresh the comment index under the same lock.                     |
| `pm report create`        | standalone record create         | L2           | owner-file lock on the target report file                | Write the report file atomically; if `--force` replaces an existing report, preserve the same single-file atomic replace semantics. |
| `pm agent heartbeat`      | agent state update               | L3           | owner-file lock on `.pm/agents/{agent_id}.yaml`          | Rewrite the agent state file atomically after merging heartbeat data.                                                               |
| `pm agent escalate`       | agent state update               | L3           | owner-file lock on `.pm/agents/{agent_id}.yaml`          | Rewrite the agent state file atomically after merging escalation data.                                                              |
| `pm agent check-response` | read-once consume                | L5           | owner-file lock on `.pm/agents/{agent_id}-response.yaml` | Read and remove the response as one atomic consume operation.                                                                       |

## Review Checklist For New Mutations

When adding or changing a write or destructive command:

1. Add or update the command's row in this document.
2. Confirm the safety level matches the real blast radius of the command.
3. Confirm the lock class covers every file touched by the logical mutation, including ID allocators and indexes.
4. Confirm the command's implementation plan preserves the atomicity rule listed here.
5. Treat any deviation from this table as a deliberate contract change that must be reviewed alongside the command registry and generated command docs.

## Telemetry Event Format

Mutable command invocations also emit structured telemetry on `stderr` so downstream tooling can correlate the full logical mutation without parsing human-facing success text.

### Event stream

- Every write or destructive command emits one JSON line with `event: "start"` before the mutation begins.
- The same invocation emits exactly one terminal JSON line with either `event: "success"` or `event: "failure"`.
- All events from the same logical mutation share the same `operation_id`.
- The human-readable summary line immediately after the terminal event has the form `mutation_summary operation_id=... status=... writes=... recovered=... lock_attempts=... locks_acquired=... duration_ms=...`.

### JSON schema

```json
{
  "type": "mutation",
  "event": "start",
  "operation_id": "pm-story-update-mabcd12-ff00aa",
  "command": "pm story update",
  "mutation_level": "write",
  "timestamp": "2026-04-08T12:34:56.000Z"
}
```

Terminal events add these fields:

```json
{
  "duration_ms": 12,
  "counters": {
    "atomic_writes": 2,
    "recovered_temp_files": 0,
    "lock_attempts": 1,
    "locks_acquired": 1
  },
  "error": {
    "name": "ValidationError",
    "message": "At least one update option is required"
  }
}
```

## Troubleshooting Recent Mutation Issues

When an operator needs to investigate recent mutation problems:

1. Run `pm mutation diagnostics` for a concise list of the newest failures, warnings, and lock-contention events.
2. Re-run with `pm mutation diagnostics --detailed --limit 20` when you need the full command, path, and anomaly summary for each operation.
3. Match the reported `operation_id` to structured `stderr` telemetry or test output when you need the full invocation timeline.
4. Treat `warning` entries as recovered issues (for example orphan temp-file cleanup), `lock_contention` entries as concurrency pressure, and `failure` entries as commands that exited unsuccessfully.
