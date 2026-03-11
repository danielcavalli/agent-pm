#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { PmError } from "./lib/errors.js";
import { ensureProjectsDir } from "./lib/codes.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

// Ensure the global data directory exists before any command runs.
// Skip for 'init' command which handles its own directory creation.
// Skip for 'status' command which should error if no .pm/ exists.
const isInitCommand = process.argv[2] === "init";
const isStatusCommand = process.argv[2] === "status";
const isTuiCommand = process.argv[2] === "tui";
const isGcCommand = process.argv[2] === "gc";
if (!isInitCommand && !isStatusCommand && !isTuiCommand && !isGcCommand) {
  ensureProjectsDir();
}

const program = new Command();

/**
 * Wrap an async action with consistent error handling.
 * PmErrors are printed in a consistent red format.
 * Unexpected errors print a generic message (or stack with --debug).
 */
function action<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
) {
  return (...args: TArgs) => {
    const debug = process.argv.includes("--debug");
    fn(...args).catch((err: unknown) => {
      if (err instanceof PmError) {
        console.error(chalk.red(`Error [${err.code}]:`) + " " + err.message);
      } else if (debug && err instanceof Error) {
        console.error(chalk.red("Unexpected error:") + " " + err.message);
        console.error(err.stack);
      } else {
        console.error(
          chalk.red("Unexpected error:") +
            " " +
            (err instanceof Error ? err.message : String(err)),
        );
      }
      process.exit(1);
    });
  };
}

program
  .name("pm")
  .description(
    chalk.bold("Project Management Tool") +
      " — file-based project tracking for AI agents and humans",
  )
  .version(version)
  .addHelpText(
    "before",
    chalk.cyan.bold("\n  pm") +
      chalk.dim(" — project management for AI agents\n"),
  );

// ── init ──────────────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize a new project and create its YAML definition")
  .requiredOption("--name <name>", "Project name (required)")
  .option(
    "--code <code>",
    "Project code: 2-6 uppercase letters (default: derived from directory name)",
  )
  .option("--description <desc>", "One-paragraph project description", "")
  .option("--vision <vision>", "North-star vision statement", "")
  .option("--tech-stack <items...>", "Technology stack (repeatable flag)", [])
  .option(
    "--architecture <pattern>",
    "Architecture pattern description (e.g. cli-tool, web-app)",
    "",
  )
  .action(
    action(async (options: Record<string, unknown>) => {
      const { init } = await import("./commands/init.js");
      await init(options);
    }),
  );

// ── remove ────────────────────────────────────────────────────────────────────
program
  .command("remove")
  .description(
    "Remove the .pm/ directory and all project data (e.g. pm remove --force)",
  )
  .option("--force", "Skip confirmation and delete immediately")
  .action(
    action(
      async (
        projectCode: string | undefined,
        options: Record<string, unknown>,
      ) => {
        const { remove } = await import("./commands/remove.js");
        await remove(projectCode, options);
      },
    ),
  );

// ── epic ────────────────────────────────────────────────────────────────────
const epicCmd = program
  .command("epic")
  .description("Manage epics within a project");

epicCmd
  .command("add [projectCode]")
  .description(
    'Add a new epic to a project (e.g. pm epic add PM --title "Auth")',
  )
  .requiredOption("--title <title>", "Epic title (required)")
  .option("--description <desc>", "Epic description", "")
  .option("--priority <priority>", "Priority: high | medium | low", "medium")
  .action(
    action(
      async (
        projectCode: string | undefined,
        options: Record<string, unknown>,
      ) => {
        const { epicAdd } = await import("./commands/epic.js");
        await epicAdd(projectCode, options);
      },
    ),
  );

epicCmd
  .command("list [projectCode]")
  .description("List all epics for a project with status and story counts")
  .action(
    action(async (projectCode: string | undefined) => {
      const { epicList } = await import("./commands/epic.js");
      await epicList(projectCode);
    }),
  );

epicCmd
  .command("sync [projectCode]")
  .description(
    "Sync epic statuses from story completion (e.g. all stories done → epic done)",
  )
  .action(
    action(async (projectCode: string | undefined) => {
      const { epicSync } = await import("./commands/epic.js");
      await epicSync(projectCode);
    }),
  );

// ── story ─────────────────────────────────────────────────────────────────────
const storyCmd = program
  .command("story")
  .description("Manage stories within an epic");

storyCmd
  .command("add <epicCode>")
  .description(
    'Add a new story to an epic (e.g. pm story add E001 --title "..." or pm story add PM-E001 --title "...")',
  )
  .requiredOption("--title <title>", "Story title (required)")
  .option("--description <desc>", "Story description", "")
  .option("--points <points>", "Story points: 1 | 2 | 3 | 5 | 8", "3")
  .option("--priority <priority>", "Priority: high | medium | low", "medium")
  .option(
    "--criteria <criteria...>",
    "Acceptance criteria items (repeatable)",
    [],
  )
  .option(
    "--depends-on <storyCode...>",
    "Story codes this story depends on (repeatable, e.g. --depends-on E001-S001)",
    [],
  )
  .action(
    action(async (epicCode: string, options: Record<string, unknown>) => {
      const { storyAdd } = await import("./commands/story.js");
      await storyAdd(epicCode, options);
    }),
  );

storyCmd
  .command("list <epicCode>")
  .description("List all stories for an epic with status and priority")
  .option("--deps", "Show dependency info (depends_on) for each story")
  .action(
    action(async (epicCode: string, options: Record<string, unknown>) => {
      const { storyList } = await import("./commands/story.js");
      await storyList(epicCode, options);
    }),
  );

storyCmd
  .command("update <storyCode>")
  .description(
    "Update a story status or priority (e.g. pm story update E001-S001 --status done)",
  )
  .option(
    "--status <status>",
    "New status: backlog | in_progress | done | cancelled",
  )
  .option("--priority <priority>", "New priority: high | medium | low")
  .option(
    "--depends-on <storyCode...>",
    "Story codes this story depends on (repeatable, replaces current list)",
  )
  .action(
    action(async (storyCode: string, options: Record<string, unknown>) => {
      const { storyUpdate } = await import("./commands/story.js");
      await storyUpdate(storyCode, options);
    }),
  );

// ── work ──────────────────────────────────────────────────────────────────────
program
  .command("work <storyCode>")
  .description(
    "Load a story context and mark it in_progress (e.g. pm work E001-S001 or pm work PM-E001-S001)",
  )
  .action(
    action(async (storyCode: string) => {
      const { work } = await import("./commands/work.js");
      await work(storyCode);
    }),
  );

// ── prioritize ────────────────────────────────────────────────────────────────
program
  .command("prioritize [projectCode]")
  .description("Output prioritization context for a project or epic")
  .option("--epic <epicCode>", "Target a specific epic (e.g. E001 or PM-E001)")
  .option("--strategy <strategy>", "Prioritization strategy description")
  .action(
    action(
      async (
        projectCode: string | undefined,
        options: Record<string, unknown>,
      ) => {
        const { prioritize } = await import("./commands/prioritize.js");
        await prioritize(projectCode, options);
      },
    ),
  );

// ── rules ─────────────────────────────────────────────────────────────────
const rulesCmd = program
  .command("rules")
  .description("Manage PM agent rules in project AGENTS.md files");

rulesCmd
  .command("init")
  .description("Write PM agent rules into the project's AGENTS.md (idempotent)")
  .option(
    "--path <path>",
    "Target file path (default: ./AGENTS.md)",
    "./AGENTS.md",
  )
  .action(
    action(async (options: Record<string, unknown>) => {
      const { initRules } = await import("./commands/rules.js");
      await initRules(options);
    }),
  );

rulesCmd
  .command("remove")
  .description("Remove PM agent rules from a project's AGENTS.md")
  .option(
    "--path <path>",
    "Target file path (default: ./AGENTS.md)",
    "./AGENTS.md",
  )
  .action(
    action(async (options: Record<string, unknown>) => {
      const { removeRules } = await import("./commands/rules.js");
      await removeRules(options);
    }),
  );

// ── status ────────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show project status summary for the local .pm/ project")
  .option("--json", "Output as machine-readable JSON")
  .action(
    action(async (options: Record<string, unknown>) => {
      const { status } = await import("./commands/status.js");
      await status(undefined, options);
    }),
  );

// ── migrate ───────────────────────────────────────────────────────────────────
const migrateCmd = program
  .command("migrate")
  .description("Migrate project data between storage locations");

migrateCmd
  .command("to-local")
  .description(
    "Migrate a project from global ~/.pm/projects/{CODE}/ to local .pm/ at target",
  )
  .requiredOption("--code <code>", "Project code to migrate (e.g., PM)")
  .requiredOption(
    "--target <path>",
    "Target repository directory where .pm/ will be created",
  )
  .option(
    "--cleanup",
    "Remove the project from global ~/.pm/projects/ after successful migration",
  )
  .action(
    action(async (options: Record<string, unknown>) => {
      const { toLocal } = await import("./commands/migrate.js");
      await toLocal(options);
    }),
  );

migrateCmd
  .command("from-source")
  .description("Migrate projects from a source directory to .pm/")
  .option(
    "--source <path>",
    "Source directory to migrate from (default: ./projects/)",
  )
  .action(
    action(async (options: Record<string, unknown>) => {
      const { migrate } = await import("./commands/migrate.js");
      await migrate(options);
    }),
  );

// ── tui ───────────────────────────────────────────────────────────────────────
program
  .command("tui")
  .description("Launch the interactive TUI dashboard (live project board)")
  .action(
    action(async () => {
      const { launchTui } = await import("./tui/index.js");
      await launchTui();
    }),
  );

// ── gc ─────────────────────────────────────────────────────────────────────────
const gcCmd = program
  .command("gc")
  .description("Garbage collection for completed tasks and stale artifacts");

gcCmd
  .command("run")
  .description("Run garbage collection on the local .pm/ directory")
  .option("--dry-run", "Preview changes without executing them")
  .action(
    action(async (options: Record<string, unknown>) => {
      const { gcRun } = await import("./commands/gc.js");
      await gcRun(options);
    }),
  );

// ── unknown command handler ───────────────────────────────────────────────────
program.on("command:*", (operands: string[]) => {
  console.error(chalk.red(`Error: Unknown command '${operands[0]}'`));
  console.error(
    `Run ${chalk.cyan("pm --help")} for a list of available commands.`,
  );
  process.exit(1);
});

program.parse(process.argv);
