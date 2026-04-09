import { CommandRegistrySchema } from "../schemas/command-contract.schema.js";

const registrySeed = [
  {
    id: "init",
    summary: "Initialize a new project",
    docs: {
      purpose: "Create a project definition and bootstrap local PM data.",
      examples: ['pm init --name "Project" --code PM'],
    },
    sideEffects: {
      level: "write",
      notes: "Creates the local .pm directory and project YAML files.",
    },
    handler: {
      importPath: "./commands/init.js",
      exportName: "init",
      invocation: "options",
    },
    cli: {
      path: ["init"],
      description: "Initialize a new project and create its YAML definition",
      requiresProjectsDir: false,
    },
    args: [
      {
        name: "name",
        description: "Project name",
        type: "string",
        cli: { kind: "option", token: "--name <name>", required: true },
      },
      {
        name: "code",
        description: "Optional project code override",
        type: "string",
        cli: { kind: "option", token: "--code <code>" },
      },
      {
        name: "description",
        description: "Project description",
        type: "string",
        cli: { kind: "option", token: "--description <desc>" },
        defaultValue: "",
      },
      {
        name: "vision",
        description: "Project vision statement",
        type: "string",
        cli: { kind: "option", token: "--vision <vision>" },
        defaultValue: "",
      },
      {
        name: "techStack",
        description: "Technology stack entries",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--tech-stack <items...>" },
        defaultValue: [],
      },
      {
        name: "architecture",
        description: "Architecture pattern label",
        type: "string",
        cli: { kind: "option", token: "--architecture <pattern>" },
        defaultValue: "",
      },
    ],
  },
  {
    id: "remove",
    summary: "Remove local PM project data",
    docs: {
      purpose:
        "Delete the local PM project store when a repository no longer needs it.",
      examples: ["pm remove --force"],
    },
    sideEffects: {
      level: "destructive",
      notes: "Removes the local .pm directory and all project records.",
    },
    handler: {
      importPath: "./commands/remove.js",
      exportName: "remove",
      invocation: "positionals+options",
    },
    cli: {
      path: ["remove"],
      description:
        "Remove the .pm/ directory and all project data (e.g. pm remove --force)",
    },
    mcp: {
      toolName: "pm_project_remove",
      description:
        "Remove a project and all its epics and stories from the project management system. This is a destructive operation — use only when a project is no longer needed. Always confirm with the user before calling this tool. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code to remove",
        type: "string",
        mcp: { name: "project", required: true },
      },
      {
        name: "force",
        description: "Skip confirmation",
        type: "boolean",
        cli: { kind: "flag", token: "--force" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "swarm.init",
    summary: "Initialize swarm storage",
    docs: {
      purpose:
        "Create the optional .pm/swarm workspace with default tactics and runtime strategy files.",
      examples: ["pm swarm init"],
    },
    sideEffects: {
      level: "write",
      notes:
        "Creates .pm/swarm directories and writes default tactics.yaml and strategy.yaml files.",
    },
    handler: {
      importPath: "./commands/swarm.js",
      exportName: "swarmInit",
      invocation: "none",
    },
    cli: {
      path: ["swarm", "init"],
      description:
        "Initialize optional swarm storage under .pm/swarm with default templates",
      requiresProjectsDir: false,
    },
    args: [],
  },
  {
    id: "swarm.analyze",
    summary: "Analyze swarm state",
    docs: {
      purpose:
        "Aggregate swarm experiment state into a YAML summary for operators and agents.",
      examples: ["pm swarm analyze"],
    },
    sideEffects: {
      level: "read",
      notes:
        "Reads .pm/swarm state and prints a formatted YAML summary to stdout.",
    },
    handler: {
      importPath: "./commands/swarm.js",
      exportName: "swarmAnalyze",
      invocation: "none",
    },
    cli: {
      path: ["swarm", "analyze"],
      description:
        "Analyze swarm experiment state and print an operator-friendly YAML summary",
      requiresProjectsDir: false,
    },
    args: [],
  },
  {
    id: "epic.add",
    summary: "Add an epic",
    docs: {
      purpose: "Create a new epic within an existing project.",
      examples: ['pm epic add PM --title "Auth"'],
    },
    sideEffects: {
      level: "write",
      notes: "Writes a new epic into the project's local PM data.",
    },
    handler: {
      importPath: "./commands/epic.js",
      exportName: "epicAdd",
      invocation: "positionals+options",
    },
    cli: {
      path: ["epic", "add"],
      description:
        'Add a new epic to a project (e.g. pm epic add PM --title "Auth")',
    },
    mcp: {
      toolName: "pm_epic_add",
      description:
        "File a new epic to the project management system. Use this when decomposing a large goal into trackable work (new feature, major refactor, multi-part initiative) or when you discover a significant area of work that should be tracked. An epic is a theme with multiple independent stories — create the epic first, then file stories under it. Do NOT use this for small fixes — use story_add instead. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code that owns the epic",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
        mcp: { name: "project", required: true },
      },
      {
        name: "title",
        description: "Epic title",
        type: "string",
        cli: { kind: "option", token: "--title <title>", required: true },
        mcp: { name: "title", required: true },
      },
      {
        name: "description",
        description: "Epic description",
        type: "string",
        cli: { kind: "option", token: "--description <desc>" },
        mcp: { name: "description", required: true },
        defaultValue: "",
      },
      {
        name: "priority",
        description: "Epic priority",
        type: "string",
        enum: ["high", "medium", "low"],
        cli: { kind: "option", token: "--priority <priority>" },
        mcp: { name: "priority" },
        defaultValue: "medium",
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "epic.list",
    summary: "List epics",
    docs: {
      purpose: "Show all epics for a project.",
      examples: ["pm epic list PM"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads epic metadata without mutating project state.",
    },
    handler: {
      importPath: "./commands/epic.js",
      exportName: "epicList",
      invocation: "positionals",
    },
    cli: {
      path: ["epic", "list"],
      description: "List all epics for a project with status and story counts",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code to inspect",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
      },
    ],
  },
  {
    id: "epic.sync",
    summary: "Sync epic status",
    docs: {
      purpose: "Update epic status values from underlying story completion.",
      examples: ["pm epic sync PM"],
    },
    sideEffects: {
      level: "write",
      notes: "Mutates epic status values based on current story state.",
    },
    handler: {
      importPath: "./commands/epic.js",
      exportName: "epicSync",
      invocation: "positionals",
    },
    cli: {
      path: ["epic", "sync"],
      description:
        "Sync epic statuses from story completion (e.g. all stories done → epic done)",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code to sync",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
      },
    ],
  },
  {
    id: "story.add",
    summary: "Add a story",
    docs: {
      purpose: "Create a new story under an epic.",
      examples: ['pm story add PM-E001 --title "Write tests"'],
    },
    sideEffects: {
      level: "write",
      notes: "Writes a new story into the selected epic.",
    },
    handler: {
      importPath: "./commands/story.js",
      exportName: "storyAdd",
      invocation: "positionals+options",
    },
    cli: {
      path: ["story", "add"],
      description:
        'Add a new story to an epic (e.g. pm story add E001 --title "..." or pm story add PM-E001 --title "...")',
    },
    mcp: {
      toolName: "pm_story_add",
      description:
        "File a new story to the project management system. Use this to break down work into independently completable tasks that can be executed by you or picked up by parallel agents. Also use this when you discover a specific, actionable piece of work (bug, improvement, tech debt) while working on something else. Write clear acceptance criteria so any agent can verify completion. The story will be added to an existing epic's backlog. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "epicCode",
        description: "Epic code that will own the new story",
        type: "string",
        cli: { kind: "positional", token: "<epicCode>", required: true },
        mcp: { name: "epic", required: true },
      },
      {
        name: "title",
        description: "Story title",
        type: "string",
        cli: { kind: "option", token: "--title <title>", required: true },
        mcp: { name: "title", required: true },
      },
      {
        name: "description",
        description: "Story description",
        type: "string",
        cli: { kind: "option", token: "--description <desc>" },
        mcp: { name: "description", required: true },
        defaultValue: "",
      },
      {
        name: "points",
        description: "Story point estimate",
        type: "string",
        enum: ["1", "2", "3", "5", "8"],
        cli: { kind: "option", token: "--points <points>" },
        mcp: { name: "points" },
        defaultValue: "3",
      },
      {
        name: "priority",
        description: "Story priority",
        type: "string",
        enum: ["high", "medium", "low"],
        cli: { kind: "option", token: "--priority <priority>" },
        mcp: { name: "priority" },
        defaultValue: "medium",
      },
      {
        name: "criteria",
        description: "Acceptance criteria entries",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--criteria <criteria...>" },
        mcp: { name: "criteria" },
        defaultValue: [],
      },
      {
        name: "dependsOn",
        description: "Story dependencies",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--depends-on <storyCode...>" },
        mcp: { name: "depends_on" },
        defaultValue: [],
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "story.list",
    summary: "List stories",
    docs: {
      purpose: "Show stories under an epic, optionally including dependencies.",
      examples: ["pm story list PM-E001 --deps"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads story metadata without mutating the project.",
    },
    handler: {
      importPath: "./commands/story.js",
      exportName: "storyList",
      invocation: "positionals+options",
    },
    cli: {
      path: ["story", "list"],
      description: "List all stories for an epic with status and priority",
    },
    args: [
      {
        name: "epicCode",
        description: "Epic code to inspect",
        type: "string",
        cli: { kind: "positional", token: "<epicCode>", required: true },
      },
      {
        name: "deps",
        description: "Include dependency information",
        type: "boolean",
        cli: { kind: "flag", token: "--deps" },
      },
      {
        name: "type",
        description: "Optional resolution-task filter",
        type: "string",
        enum: ["conflict", "gap"],
        cli: { kind: "option", token: "--type <type>" },
      },
    ],
  },
  {
    id: "story.update",
    summary: "Update a story",
    docs: {
      purpose: "Modify story status, priority, or dependency metadata.",
      examples: ["pm story update PM-E001-S001 --status done"],
    },
    sideEffects: {
      level: "write",
      notes: "Mutates an existing story record.",
    },
    handler: {
      importPath: "./commands/story.js",
      exportName: "storyUpdate",
      invocation: "positionals+options",
    },
    cli: {
      path: ["story", "update"],
      description:
        "Update a story status or priority (e.g. pm story update E001-S001 --status done)",
    },
    args: [
      {
        name: "storyCode",
        description: "Story code to update",
        type: "string",
        cli: { kind: "positional", token: "<storyCode>", required: true },
      },
      {
        name: "status",
        description: "New story status",
        type: "string",
        enum: ["backlog", "in_progress", "done", "cancelled"],
        cli: { kind: "option", token: "--status <status>" },
      },
      {
        name: "priority",
        description: "New story priority",
        type: "string",
        enum: ["high", "medium", "low"],
        cli: { kind: "option", token: "--priority <priority>" },
      },
      {
        name: "dependsOn",
        description: "Replacement dependency list",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--depends-on <storyCode...>" },
      },
    ],
  },
  {
    id: "work",
    summary: "Load story context",
    docs: {
      purpose: "Display a story context block and mark the story in progress.",
      examples: ["pm work PM-E001-S001"],
    },
    sideEffects: {
      level: "write",
      notes: "Marks the target story as in_progress.",
    },
    handler: {
      importPath: "./commands/work.js",
      exportName: "work",
      invocation: "positionals",
    },
    cli: {
      path: ["work"],
      description:
        "Load a story context and mark it in_progress (e.g. pm work E001-S001 or pm work PM-E001-S001)",
    },
    args: [
      {
        name: "storyCode",
        description: "Story code to load",
        type: "string",
        cli: { kind: "positional", token: "<storyCode>", required: true },
      },
    ],
  },
  {
    id: "prioritize",
    summary: "Show prioritization context",
    docs: {
      purpose: "Print prioritization data for a project or epic.",
      examples: ["pm prioritize PM --epic PM-E001"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads planning metadata without mutating project state.",
    },
    handler: {
      importPath: "./commands/prioritize.js",
      exportName: "prioritize",
      invocation: "positionals+options",
    },
    cli: {
      path: ["prioritize"],
      description: "Output prioritization context for a project or epic",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code to inspect",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
      },
      {
        name: "epicCode",
        description: "Epic code override",
        type: "string",
        cli: { kind: "option", token: "--epic <epicCode>" },
      },
      {
        name: "strategy",
        description: "Prioritization strategy description",
        type: "string",
        cli: { kind: "option", token: "--strategy <strategy>" },
      },
    ],
  },
  {
    id: "rules.init",
    summary: "Write PM rules into AGENTS.md",
    docs: {
      purpose: "Add PM agent rules to a project AGENTS.md file.",
      examples: ["pm rules init --path ./AGENTS.md"],
    },
    sideEffects: {
      level: "write",
      notes: "Writes PM rule content into the target AGENTS.md file.",
    },
    handler: {
      importPath: "./commands/rules.js",
      exportName: "initRules",
      invocation: "options",
    },
    cli: {
      path: ["rules", "init"],
      description:
        "Write PM agent rules into the project's AGENTS.md (idempotent)",
    },
    args: [
      {
        name: "path",
        description: "Target AGENTS.md path",
        type: "string",
        cli: { kind: "option", token: "--path <path>" },
        defaultValue: "./AGENTS.md",
      },
    ],
  },
  {
    id: "rules.remove",
    summary: "Remove PM rules from AGENTS.md",
    docs: {
      purpose: "Remove previously injected PM rule content from AGENTS.md.",
      examples: ["pm rules remove --path ./AGENTS.md"],
    },
    sideEffects: {
      level: "write",
      notes: "Mutates the target AGENTS.md file by removing PM rule content.",
    },
    handler: {
      importPath: "./commands/rules.js",
      exportName: "removeRules",
      invocation: "options",
    },
    cli: {
      path: ["rules", "remove"],
      description: "Remove PM agent rules from a project's AGENTS.md",
    },
    args: [
      {
        name: "path",
        description: "Target AGENTS.md path",
        type: "string",
        cli: { kind: "option", token: "--path <path>" },
        defaultValue: "./AGENTS.md",
      },
    ],
  },
  {
    id: "status",
    summary: "Show project status",
    docs: {
      purpose: "Display the local project status summary.",
      examples: ["pm status", "pm status --json"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads project data and prints a human or JSON summary.",
    },
    handler: {
      importPath: "./commands/status.js",
      exportName: "status",
      invocation: "positionals+options",
    },
    cli: {
      path: ["status"],
      description: "Show project status summary for the local .pm/ project",
      requiresProjectsDir: false,
    },
    mcp: {
      toolName: "pm_status",
      description:
        "Show current project management status. Use this to understand what projects exist, what work is in progress, and what's in the backlog before filing new items or picking up work. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "json",
        description: "Emit machine-readable output",
        type: "boolean",
        cli: { kind: "flag", token: "--json" },
      },
      {
        name: "projectCode",
        description: "Optional project code override for MCP projection",
        type: "string",
        mcp: { name: "project" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "migrate.to-local",
    summary: "Migrate a project to local storage",
    docs: {
      purpose:
        "Move a project from global PM_HOME storage into a repository-local .pm directory.",
      examples: ["pm migrate to-local --code PM --target /repo"],
    },
    sideEffects: {
      level: "write",
      notes:
        "Creates local project files and may remove the source when cleanup is enabled.",
    },
    handler: {
      importPath: "./commands/migrate.js",
      exportName: "toLocal",
      invocation: "options",
    },
    cli: {
      path: ["migrate", "to-local"],
      description:
        "Migrate a project from global ~/.pm/projects/{CODE}/ to local .pm/ at target",
    },
    args: [
      {
        name: "code",
        description: "Project code to migrate",
        type: "string",
        cli: { kind: "option", token: "--code <code>", required: true },
      },
      {
        name: "target",
        description: "Target repository path",
        type: "string",
        cli: { kind: "option", token: "--target <path>", required: true },
      },
      {
        name: "cleanup",
        description: "Remove the original global project after migration",
        type: "boolean",
        cli: { kind: "flag", token: "--cleanup" },
      },
    ],
  },
  {
    id: "migrate.from-source",
    summary: "Migrate projects from a source directory",
    docs: {
      purpose: "Import projects from a legacy source directory into .pm.",
      examples: ["pm migrate from-source --source ./projects"],
    },
    sideEffects: {
      level: "write",
      notes: "Creates local .pm project data from a source directory.",
    },
    handler: {
      importPath: "./commands/migrate.js",
      exportName: "migrate",
      invocation: "options",
    },
    cli: {
      path: ["migrate", "from-source"],
      description: "Migrate projects from a source directory to .pm/",
    },
    args: [
      {
        name: "source",
        description: "Source directory to migrate from",
        type: "string",
        cli: { kind: "option", token: "--source <path>" },
      },
    ],
  },
  {
    id: "tui",
    summary: "Launch the TUI",
    docs: {
      purpose: "Open the interactive terminal dashboard.",
      examples: ["pm tui"],
    },
    sideEffects: {
      level: "read",
      notes:
        "Starts an interactive UI session without mutating project data on launch.",
    },
    handler: {
      importPath: "./tui/index.js",
      exportName: "launchTui",
      invocation: "none",
    },
    cli: {
      path: ["tui"],
      description: "Launch the interactive TUI dashboard (live project board)",
      requiresProjectsDir: false,
    },
    args: [],
  },
  {
    id: "gc.run",
    summary: "Run garbage collection",
    docs: {
      purpose: "Clean stale PM artifacts from the local store.",
      examples: ["pm gc run --dry-run"],
    },
    sideEffects: {
      level: "write",
      notes: "Deletes or reports stale PM artifacts based on options.",
    },
    handler: {
      importPath: "./commands/gc.js",
      exportName: "gcRun",
      invocation: "options",
    },
    cli: {
      path: ["gc", "run"],
      description: "Run garbage collection on the local .pm/ directory",
      requiresProjectsDir: false,
    },
    mcp: {
      toolName: "pm_gc_run",
      description:
        "Run garbage collection on the local .pm/ directory to clean up stale artifacts — expired comments, consolidated reports, and superseded ADRs. Use this periodically to keep the project data lean. Supports a dry-run mode to preview what would be collected without making changes. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "dryRun",
        description: "Preview changes without executing them",
        type: "boolean",
        cli: { kind: "flag", token: "--dry-run" },
        mcp: { name: "dry_run" },
      },
      {
        name: "verbose",
        description: "Show TTL evaluation details",
        type: "boolean",
        cli: { kind: "flag", token: "--verbose" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "consolidate.run",
    summary: "Run consolidation",
    docs: {
      purpose:
        "Execute the consolidation pipeline for comments and reports. Exits with code 1 after partial completion when warnings or errors are emitted.",
      examples: ["pm consolidate run --dry-run"],
    },
    sideEffects: {
      level: "write",
      notes: "May write consolidated artifacts into the local PM store.",
    },
    handler: {
      importPath: "./commands/consolidate.js",
      exportName: "consolidateRun",
      invocation: "options",
    },
    cli: {
      path: ["consolidate", "run"],
      description: "Run the consolidation pipeline",
    },
    args: [
      {
        name: "dryRun",
        description: "Preview outputs without writing files",
        type: "boolean",
        cli: { kind: "flag", token: "--dry-run" },
      },
    ],
  },
  {
    id: "consolidate.config",
    summary: "Show consolidation config",
    docs: {
      purpose: "Display the active consolidation configuration.",
      examples: ["pm consolidate config"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads consolidation settings without mutating project state.",
    },
    handler: {
      importPath: "./commands/consolidate.js",
      exportName: "consolidateConfig",
      invocation: "options",
    },
    cli: {
      path: ["consolidate", "config"],
      description: "Display the current consolidation configuration",
    },
    args: [],
  },
  {
    id: "adr.create",
    summary: "Create an ADR",
    docs: {
      purpose: "Create a new architecture decision record.",
      examples: [
        "pm adr create --project PM --title Decision --status accepted",
      ],
    },
    sideEffects: {
      level: "write",
      notes: "Writes a new ADR document into the local PM store.",
    },
    handler: {
      importPath: "./commands/adr.js",
      exportName: "adrCreate",
      invocation: "options",
    },
    cli: {
      path: ["adr", "create"],
      description:
        "Create a new ADR (e.g. pm adr create --project PM --title ...)",
    },
    mcp: {
      toolName: "pm_adr_create",
      description:
        "Create a new Architecture Decision Record (ADR). Use this to document architectural decisions with context, decision rationale, and consequences. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code",
        type: "string",
        cli: { kind: "option", token: "--project <code>", required: true },
        mcp: { name: "project", required: true },
      },
      {
        name: "title",
        description: "ADR title",
        type: "string",
        cli: { kind: "option", token: "--title <title>", required: true },
        mcp: { name: "title", required: true },
      },
      {
        name: "status",
        description: "ADR lifecycle status",
        type: "string",
        enum: ["proposed", "accepted", "deprecated", "superseded"],
        cli: { kind: "option", token: "--status <status>", required: true },
        mcp: { name: "status", required: true },
      },
      {
        name: "context",
        description: "Decision context",
        type: "string",
        cli: { kind: "option", token: "--context <context>", required: true },
        mcp: { name: "context", required: true },
      },
      {
        name: "decision",
        description: "Decision statement",
        type: "string",
        cli: { kind: "option", token: "--decision <decision>", required: true },
        mcp: { name: "decision", required: true },
      },
      {
        name: "positiveConsequences",
        description: "Positive consequences",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--positive <items...>" },
        mcp: { name: "positive_consequences" },
        defaultValue: [],
      },
      {
        name: "negativeConsequences",
        description: "Negative consequences",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--negative <items...>" },
        mcp: { name: "negative_consequences" },
        defaultValue: [],
      },
      {
        name: "authorType",
        description: "ADR author type",
        type: "string",
        enum: ["agent", "human"],
        cli: { kind: "option", token: "--author-type <type>" },
        mcp: { name: "author_type" },
        defaultValue: "human",
      },
      {
        name: "authorName",
        description: "Human author name",
        type: "string",
        cli: { kind: "option", token: "--author <name>" },
        mcp: { name: "author_name" },
      },
      {
        name: "authorId",
        description: "Agent author identifier",
        type: "string",
        cli: { kind: "option", token: "--author-id <id>" },
        mcp: { name: "author_id" },
      },
      {
        name: "tags",
        description: "ADR tags",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--tags <tags...>" },
        mcp: { name: "tags" },
        defaultValue: [],
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "adr.list",
    summary: "List ADRs",
    docs: {
      purpose: "Show ADRs for a project.",
      examples: ["pm adr list PM"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads ADR metadata without mutating project state.",
    },
    handler: {
      importPath: "./commands/adr.js",
      exportName: "adrList",
      invocation: "positionals",
    },
    cli: {
      path: ["adr", "list"],
      description: "List all ADRs for a project",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code to inspect",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
      },
    ],
  },
  {
    id: "adr.query",
    summary: "Query ADRs",
    docs: {
      purpose: "Search and filter ADRs by status, tags, author, or text.",
      examples: ["pm adr query PM --tags cli contract"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads ADR data without mutating project state.",
    },
    handler: {
      importPath: "./commands/adr.js",
      exportName: "adrQuery",
      invocation: "options",
    },
    cli: {
      path: ["adr", "query"],
      description: "Query ADRs with filters, ranked by relevance",
    },
    mcp: {
      toolName: "pm_adr_query",
      description:
        "Query Architecture Decision Records (ADRs) with filters and relevance ranking. Results are scored by tag match count plus recency and returned sorted by relevance. Use this to find relevant architectural decisions before making new ones, or to check existing guidance on a topic. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "projectCode",
        description: "Optional project code",
        type: "string",
        cli: { kind: "positional", token: "[projectCode]" },
        mcp: { name: "project" },
      },
      {
        name: "id",
        description: "ADR id pattern",
        type: "string",
        cli: { kind: "option", token: "--id <pattern>" },
        mcp: { name: "id" },
      },
      {
        name: "status",
        description: "ADR status filter",
        type: "string",
        enum: ["proposed", "accepted", "deprecated", "superseded"],
        cli: { kind: "option", token: "--status <status>" },
        mcp: { name: "status" },
      },
      {
        name: "tag",
        description: "Single-tag filter",
        type: "string",
        cli: { kind: "option", token: "--tag <tag>" },
      },
      {
        name: "tags",
        description: "Multi-tag filter",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--tags <tags...>" },
        mcp: { name: "tags" },
      },
      {
        name: "authorType",
        description: "Author-type filter",
        type: "string",
        enum: ["agent", "human"],
        cli: { kind: "option", token: "--author-type <type>" },
      },
      {
        name: "author",
        description: "Author filter",
        type: "string",
        cli: { kind: "option", token: "--author <author>" },
        mcp: { name: "author" },
      },
      {
        name: "search",
        description: "Full-text search string",
        type: "string",
        cli: { kind: "option", token: "--search <text>" },
        mcp: { name: "search" },
      },
      {
        name: "limit",
        description: "Maximum result count",
        type: "number",
        cli: { kind: "option", token: "--limit <n>" },
        mcp: { name: "limit" },
        defaultValue: 5,
      },
      {
        name: "format",
        description: "Output format",
        type: "string",
        enum: ["summary", "full"],
        cli: { kind: "option", token: "--format <fmt>" },
        mcp: { name: "format" },
        defaultValue: "summary",
      },
      {
        name: "verbose",
        description: "Show relevance scores in summary mode",
        type: "boolean",
        cli: { kind: "flag", token: "--verbose" },
      },
      {
        name: "includeSuperseded",
        description: "Include superseded and deprecated ADRs",
        type: "boolean",
        cli: { kind: "flag", token: "--include-superseded" },
        mcp: { name: "include_superseded" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "comment.add",
    summary: "Add a comment",
    docs: {
      purpose: "Attach a cross-task comment to an epic or story.",
      examples: [
        "pm comment add --target PM-E001-S001 --type agent --content note",
      ],
    },
    sideEffects: {
      level: "write",
      notes: "Writes a new comment and updates the comment index.",
    },
    handler: {
      importPath: "./commands/comment.js",
      exportName: "commentAdd",
      invocation: "options",
    },
    cli: {
      path: ["comment", "add"],
      description: "Add a comment to an epic or story",
    },
    mcp: {
      toolName: "pm_comment_add",
      description:
        "Add a comment to a target task for async cross-task communication. Use this to leave notes for other agents or humans working on related tasks. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "target",
        description: "Target task id",
        type: "string",
        cli: { kind: "option", token: "--target <taskId>", required: true },
        mcp: { name: "target", required: true },
      },
      {
        name: "type",
        description: "Comment type",
        type: "string",
        enum: ["agent", "human"],
        cli: { kind: "option", token: "--type <type>", required: true },
        mcp: { name: "type", required: true },
      },
      {
        name: "content",
        description: "Comment body",
        type: "string",
        cli: { kind: "option", token: "--content <content>", required: true },
        mcp: { name: "content", required: true },
      },
      {
        name: "tags",
        description: "Comment tags",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--tags <tags...>" },
        mcp: { name: "tags" },
        defaultValue: [],
      },
      {
        name: "author",
        description: "Human author name",
        type: "string",
        cli: { kind: "option", token: "--author <name>" },
        mcp: { name: "author" },
      },
      {
        name: "authorId",
        description: "Agent author id",
        type: "string",
        cli: { kind: "option", token: "--author-id <id>" },
        mcp: { name: "author_id" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "comment.list",
    summary: "List comments",
    docs: {
      purpose: "List cross-task comments with optional filtering.",
      examples: [
        "pm comment list --project PM --task PM-E001-S001 --type agent",
      ],
    },
    sideEffects: {
      level: "read",
      notes: "Reads comment records without mutating project state.",
    },
    handler: {
      importPath: "./commands/comment.js",
      exportName: "commentList",
      invocation: "options",
    },
    cli: {
      path: ["comment", "list"],
      description: "List comments with optional filters",
    },
    mcp: {
      toolName: "pm_comment_list",
      description:
        "List comments with optional filters. Use this to retrieve comments for a specific task or filtered by type/author. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "projectCode",
        description: "Project code",
        type: "string",
        cli: { kind: "option", token: "--project <code>" },
        mcp: { name: "project", required: true },
      },
      {
        name: "task",
        description: "Target task filter",
        type: "string",
        cli: { kind: "option", token: "--task <taskId>" },
        mcp: { name: "task" },
      },
      {
        name: "type",
        description: "Comment type filter",
        type: "string",
        enum: ["agent", "human"],
        cli: { kind: "option", token: "--type <type>" },
        mcp: { name: "type" },
      },
      {
        name: "author",
        description: "Author filter",
        type: "string",
        cli: { kind: "option", token: "--author <author>" },
        mcp: { name: "author" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "report.create",
    summary: "Create an execution report",
    docs: {
      purpose: "Write an execution report for a completed story.",
      examples: ["pm report create --task-id PM-E001-S001 --agent-id agent-1"],
    },
    sideEffects: {
      level: "write",
      notes: "Writes an execution report artifact into the local PM store.",
    },
    handler: {
      importPath: "./commands/report.js",
      exportName: "reportCreate",
      invocation: "options",
    },
    cli: {
      path: ["report", "create"],
      description: "Create an execution report for a story",
    },
    mcp: {
      toolName: "pm_report_create",
      description:
        "Create an execution report for a completed task. The report captures decisions, assumptions, tradeoffs, and observations to support the consolidation agent's work. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "taskId",
        description: "Story id",
        type: "string",
        cli: { kind: "option", token: "--task-id <taskId>", required: true },
        mcp: { name: "task_id", required: true },
      },
      {
        name: "agentId",
        description: "Agent identifier",
        type: "string",
        cli: { kind: "option", token: "--agent-id <agentId>" },
        mcp: { name: "agent_id" },
      },
      {
        name: "timestamp",
        description: "ISO-8601 report timestamp",
        type: "string",
        cli: { kind: "option", token: "--timestamp <timestamp>" },
      },
      {
        name: "status",
        description: "Report status",
        type: "string",
        enum: ["complete", "partial"],
        cli: { kind: "option", token: "--status <status>" },
        mcp: { name: "status" },
        defaultValue: "complete",
      },
      {
        name: "decisions",
        description: "Decision items",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--decisions <items...>" },
        mcp: { name: "decisions" },
        defaultValue: [],
      },
      {
        name: "assumptions",
        description: "Assumption items",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--assumptions <items...>" },
        mcp: { name: "assumptions" },
        defaultValue: [],
      },
      {
        name: "tradeoffs",
        description: "Tradeoff items",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--tradeoffs <items...>" },
        mcp: { name: "tradeoffs" },
        defaultValue: [],
      },
      {
        name: "outOfScope",
        description: "Out-of-scope items",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--out-of-scope <items...>" },
        mcp: { name: "out_of_scope" },
        defaultValue: [],
      },
      {
        name: "potentialConflicts",
        description: "Potential conflict items",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--potential-conflicts <items...>" },
        mcp: { name: "potential_conflicts" },
        defaultValue: [],
      },
      {
        name: "force",
        description: "Overwrite an existing report",
        type: "boolean",
        cli: { kind: "flag", token: "--force" },
        mcp: { name: "force" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "report.view",
    summary: "View an execution report",
    docs: {
      purpose: "Display an execution report by story id.",
      examples: ["pm report view PM-E001-S001"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads a report artifact without mutating project state.",
    },
    handler: {
      importPath: "./commands/report.js",
      exportName: "reportView",
      invocation: "positionals",
    },
    cli: {
      path: ["report", "view"],
      description: "View an execution report by story ID",
    },
    mcp: {
      toolName: "pm_report_view",
      description:
        "View an execution report by task ID. Displays the report in human-readable format with section headers. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "taskId",
        description: "Story id",
        type: "string",
        cli: { kind: "positional", token: "<taskId>", required: true },
        mcp: { name: "task_id", required: true },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "mutation.diagnostics",
    summary: "Inspect mutation anomalies",
    docs: {
      purpose:
        "Show recent mutation failures, warnings, and lock contention from the local diagnostics log.",
      examples: [
        "pm mutation diagnostics",
        "pm mutation diagnostics --detailed --limit 20",
      ],
    },
    sideEffects: {
      level: "read",
      notes:
        "Reads persisted mutation anomaly records without mutating project state.",
    },
    handler: {
      importPath: "./commands/mutation.js",
      exportName: "mutationDiagnostics",
      invocation: "options",
    },
    cli: {
      path: ["mutation", "diagnostics"],
      description:
        "Inspect recent mutation failures, warnings, and lock contention",
      requiresProjectsDir: false,
    },
    args: [
      {
        name: "limit",
        description: "Maximum anomalies to display",
        type: "number",
        cli: { kind: "option", token: "--limit <n>" },
        defaultValue: 10,
      },
      {
        name: "detailed",
        description: "Show detailed multi-line output",
        type: "boolean",
        cli: { kind: "flag", token: "--detailed" },
      },
    ],
  },
  {
    id: "agent.heartbeat",
    summary: "Send an agent heartbeat",
    docs: {
      purpose:
        "Create or update agent state, including optional progress metadata.",
      examples: ["pm agent heartbeat --agent-id agent-1 --status active"],
    },
    sideEffects: {
      level: "write",
      notes: "Writes agent lifecycle state into the local PM store.",
    },
    handler: {
      importPath: "./commands/agent.js",
      exportName: "agentHeartbeat",
      invocation: "options",
    },
    cli: {
      path: ["agent", "heartbeat"],
      description:
        "Send a heartbeat for an agent, creating or updating its state file",
    },
    mcp: {
      toolName: "pm_agent_heartbeat",
      description:
        "Send an agent heartbeat, creating or updating the agent's state file at .pm/agents/{agent_id}.yaml. Use this periodically during long-running tasks to signal that the agent is still alive and to record progress. The tool sets last_heartbeat to the current timestamp and preserves all other existing fields. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "agentId",
        description: "Unique agent identifier",
        type: "string",
        cli: { kind: "option", token: "--agent-id <agentId>", required: true },
        mcp: { name: "agent_id", required: true },
      },
      {
        name: "sessionId",
        description: "Session identifier",
        type: "string",
        cli: { kind: "option", token: "--session-id <sessionId>" },
        mcp: { name: "session_id" },
      },
      {
        name: "logFile",
        description: "Declared agent log file path",
        type: "string",
        cli: { kind: "option", token: "--log-file <logFile>" },
        mcp: { name: "log_file" },
      },
      {
        name: "status",
        description: "Agent status",
        type: "string",
        enum: ["active", "idle", "needs_attention", "blocked", "completed"],
        cli: { kind: "option", token: "--status <status>" },
        mcp: { name: "status" },
        defaultValue: "active",
      },
      {
        name: "currentTask",
        description: "Current story code",
        type: "string",
        cli: { kind: "option", token: "--current-task <currentTask>" },
        mcp: { name: "current_task" },
      },
      {
        name: "progressSummary",
        description: "High-level progress summary",
        type: "string",
        cli: { kind: "option", token: "--progress-summary <progressSummary>" },
        mcp: { name: "progress_summary" },
      },
      {
        name: "totalCriteria",
        description: "Total criteria tracked in progress",
        type: "number",
        cli: { kind: "option", token: "--total-criteria <totalCriteria>" },
        mcp: { name: "total_criteria" },
      },
      {
        name: "completedCriteria",
        description: "Completed criteria count",
        type: "number",
        cli: {
          kind: "option",
          token: "--completed-criteria <completedCriteria>",
        },
        mcp: { name: "completed_criteria" },
      },
      {
        name: "currentStep",
        description: "Current execution step label",
        type: "string",
        cli: { kind: "option", token: "--current-step <currentStep>" },
        mcp: { name: "current_step" },
      },
      {
        name: "criteriaStatus",
        description: "Per-criterion progress entries",
        type: "json",
        cli: { kind: "option", token: "--criteria-status <criteriaStatus>" },
        mcp: { name: "criteria_status" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "agent.escalate",
    summary: "Escalate an agent issue",
    docs: {
      purpose: "Record an escalation that requires human attention.",
      examples: [
        "pm agent escalate --agent-id agent-1 --type decision --message need-help",
      ],
    },
    sideEffects: {
      level: "write",
      notes: "Writes escalation details into agent state.",
    },
    handler: {
      importPath: "./commands/agent.js",
      exportName: "agentEscalate",
      invocation: "options",
    },
    cli: {
      path: ["agent", "escalate"],
      description:
        "Escalate an issue, setting agent status to needs_attention with escalation details",
    },
    mcp: {
      toolName: "pm_agent_escalate",
      description:
        "Escalate an issue from an agent, setting its status to needs_attention and recording escalation details in .pm/agents/{agent_id}.yaml. Use this when the agent encounters a situation requiring human or supervisor intervention — a decision that needs approval, a clarification question, or an error that cannot be resolved autonomously. If the agent state file does not exist, it is created with started_at set to now. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "agentId",
        description: "Unique agent identifier",
        type: "string",
        cli: { kind: "option", token: "--agent-id <agentId>", required: true },
        mcp: { name: "agent_id", required: true },
      },
      {
        name: "type",
        description: "Escalation type",
        type: "string",
        enum: ["decision", "clarification", "approval", "error"],
        cli: { kind: "option", token: "--type <type>", required: true },
        mcp: { name: "type", required: true },
      },
      {
        name: "message",
        description: "Escalation message",
        type: "string",
        cli: { kind: "option", token: "--message <message>", required: true },
        mcp: { name: "message", required: true },
      },
      {
        name: "confidence",
        description: "Confidence level from 0 to 1",
        type: "number",
        cli: { kind: "option", token: "--confidence <confidence>" },
        mcp: { name: "confidence" },
      },
      {
        name: "options",
        description: "Escalation options",
        type: "string[]",
        multiple: true,
        cli: { kind: "option", token: "--options <options...>" },
        mcp: { name: "options" },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "agent.check-response",
    summary: "Check for an agent response",
    docs: {
      purpose:
        "Read and consume a human response to an outstanding escalation.",
      examples: ["pm agent check-response --agent-id agent-1"],
    },
    sideEffects: {
      level: "write",
      notes: "Consumes and deletes the agent response file when one exists.",
    },
    handler: {
      importPath: "./commands/agent.js",
      exportName: "agentCheckResponse",
      invocation: "options",
    },
    cli: {
      path: ["agent", "check-response"],
      description:
        "Check for a human response to an agent escalation (read-once: deletes after read)",
    },
    mcp: {
      toolName: "pm_agent_check_response",
      description:
        "Check for a human response to a previously escalated issue. Looks for .pm/agents/{agent_id}-response.yaml, returns its contents (selected_option, additional_context, responded_at), and deletes the file (read-once semantics). If no response file exists, returns {status: no_response}. Use this periodically after escalating to check if a human has provided guidance. Pass your current working directory as workdir to ensure commands execute in the correct project context.",
    },
    args: [
      {
        name: "agentId",
        description: "Unique agent identifier",
        type: "string",
        cli: { kind: "option", token: "--agent-id <agentId>", required: true },
        mcp: { name: "agent_id", required: true },
      },
      {
        name: "workdir",
        description: "Working directory containing the target .pm project",
        type: "string",
        mcp: { name: "workdir" },
      },
    ],
  },
  {
    id: "escalation.list",
    summary: "List escalation history",
    docs: {
      purpose:
        "Show archived escalation history across all agents, or for a single agent when filtered.",
      examples: ["pm escalation list", "pm escalation list --agent agent-1"],
    },
    sideEffects: {
      level: "read",
      notes: "Reads archived escalation logs without mutating project state.",
    },
    handler: {
      importPath: "./commands/escalation.js",
      exportName: "escalationList",
      invocation: "options",
    },
    cli: {
      path: ["escalation", "list"],
      description:
        "List escalation history across all agents, with optional agent filtering",
    },
    args: [
      {
        name: "agent",
        description: "Filter escalation history to a specific agent ID",
        type: "string",
        cli: { kind: "option", token: "--agent <agent>" },
      },
    ],
  },
];

export const commandRegistry = CommandRegistrySchema.parse(registrySeed);

const cliRootRequiresProjectsDir = new Map<string, boolean>();
for (const contract of commandRegistry) {
  const root = contract.cli.path[0];
  const existing = cliRootRequiresProjectsDir.get(root);
  cliRootRequiresProjectsDir.set(
    root,
    existing === undefined
      ? contract.cli.requiresProjectsDir
      : existing || contract.cli.requiresProjectsDir,
  );
}

export function shouldEnsureProjectsDir(argv: string[]): boolean {
  const root = argv.find((token) => token.length > 0 && !token.startsWith("-"));
  if (!root) {
    return true;
  }

  return cliRootRequiresProjectsDir.get(root) ?? true;
}

export function listMcpCommandContracts() {
  return commandRegistry.filter((contract) => contract.mcp !== undefined);
}
