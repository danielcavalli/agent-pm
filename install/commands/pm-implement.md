# /pm-implement

> **Deprecated.** Use `/pm-work-on-project <PROJECT_CODE>` instead.

`/pm-implement` ran stories sequentially, one at a time, with no parallelism.
`/pm-work-on-project` does everything it did, plus:

- **Dependency-aware parallel dispatch** — stories in different epics run concurrently
- **Explicit dependency tracking** — uses `depends_on` fields to determine safe execution order
- **Failure reflection** — failed stories produce structured context that gets passed to subsequent agents

If you are an agent that was told to run `/pm-implement`, run this instead:

    /pm-work-on-project $ARGUMENTS
