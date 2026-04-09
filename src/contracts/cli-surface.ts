import { Command } from "commander";
import chalk from "chalk";
import { commandRegistry } from "./command-registry.js";
import type {
  CommandArgument,
  CommandContract,
} from "../schemas/command-contract.schema.js";
import { runMutationOperation } from "../lib/mutation-telemetry.js";

export type ActionWrapper = <TArgs extends unknown[]>(
  contract: CommandContract,
  fn: (...args: TArgs) => Promise<void>,
) => (...args: TArgs) => void | Promise<void>;

const GROUP_DESCRIPTIONS = new Map<string, string>([
  ["epic", "Manage epics within a project"],
  ["story", "Manage stories within an epic"],
  ["swarm", "Manage SwarmStore initialization and storage"],
  ["rules", "Manage PM agent rules in project AGENTS.md files"],
  ["migrate", "Migrate project data between storage locations"],
  ["gc", "Garbage collection for completed tasks and stale artifacts"],
  ["consolidate", "Consolidation pipeline for execution reports and comments"],
  ["adr", "Manage Architecture Decision Records (ADRs)"],
  ["comment", "Manage cross-task comments"],
  ["report", "Manage agent execution reports"],
  ["mutation", "Inspect mutation telemetry and diagnostics"],
  ["agent", "Agent lifecycle commands (heartbeat, escalate, check-response)"],
  ["escalation", "Inspect escalation history across agents"],
]);

function toCommanderOptionKey(token: string): string {
  const match = token.match(/--([a-z0-9-]+)/i);
  if (!match) {
    throw new Error(`Cannot derive commander option key from token '${token}'`);
  }

  return match[1].replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function formatDefaultValue(value: CommandArgument["defaultValue"]): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return "object";
  }
  return String(value);
}

function toCommanderDefaultValue(
  value: CommandArgument["defaultValue"],
): string | boolean | string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function describeCliArgument(arg: CommandArgument): string {
  let description = arg.description;

  if (arg.enum && arg.enum.length > 0) {
    description += `: ${arg.enum.join(" | ")}`;
  }

  if (arg.multiple) {
    description += " (repeatable)";
  }

  if (arg.cli?.required && arg.cli.kind === "option") {
    description += " (required)";
  }

  if (arg.defaultValue !== undefined) {
    description += ` (default: ${formatDefaultValue(arg.defaultValue)})`;
  }

  return description;
}

function getCliArguments(contract: CommandContract): CommandArgument[] {
  return contract.args.filter((arg) => arg.cli !== undefined);
}

function getPositionalArgs(contract: CommandContract): CommandArgument[] {
  return getCliArguments(contract).filter(
    (arg) => arg.cli?.kind === "positional",
  );
}

function getOptionArgs(contract: CommandContract): CommandArgument[] {
  return getCliArguments(contract).filter(
    (arg) => arg.cli?.kind !== "positional",
  );
}

function buildCommandSyntax(contract: CommandContract): string {
  const leaf = contract.cli.path[contract.cli.path.length - 1];
  const tokens = getPositionalArgs(contract).map((arg) => arg.cli!.token);
  return [leaf, ...tokens].join(" ");
}

function buildOptionsObject(
  command: Command,
  optionArgs: CommandArgument[],
): Record<string, unknown> {
  const parsed = command.opts();
  const result: Record<string, unknown> = {};

  for (const arg of optionArgs) {
    const optionKey = toCommanderOptionKey(arg.cli!.token);
    const value = parsed[optionKey];
    if (value !== undefined) {
      result[arg.name] = value;
    }
  }

  return result;
}

function buildAllCliValues(
  contract: CommandContract,
  positionalValues: unknown[],
  command: Command,
): Record<string, unknown> {
  const result = buildOptionsObject(command, getOptionArgs(contract));
  const positionalArgs = getPositionalArgs(contract);

  positionalArgs.forEach((arg, index) => {
    const value = positionalValues[index];
    if (value !== undefined) {
      result[arg.name] = value;
    }
  });

  return result;
}

function resolveHandlerImportPath(importPath: string): string {
  const srcRoot = new URL("../", import.meta.url);
  return new URL(importPath.replace(/^\.\//, ""), srcRoot).href;
}

async function invokeContractHandler(
  contract: CommandContract,
  positionalValues: unknown[],
  command: Command,
): Promise<void> {
  await runMutationOperation(contract, async () => {
    const handlerModule = (await import(
      resolveHandlerImportPath(contract.handler.importPath)
    )) as Record<string, unknown>;
    const handler = handlerModule[contract.handler.exportName];

    if (typeof handler !== "function") {
      throw new Error(
        `Handler '${contract.handler.exportName}' not found in ${contract.handler.importPath}`,
      );
    }

    const optionsObject = buildOptionsObject(command, getOptionArgs(contract));

    switch (contract.handler.invocation) {
      case "none":
        await handler();
        return;
      case "positionals":
        await handler(...positionalValues);
        return;
      case "options":
        await handler(buildAllCliValues(contract, positionalValues, command));
        return;
      case "positionals+options":
        if (positionalValues.length === 0) {
          await handler(undefined, optionsObject);
        } else {
          await handler(...positionalValues, optionsObject);
        }
    }
  });
}

function registerOptions(command: Command, contract: CommandContract): void {
  for (const arg of getOptionArgs(contract)) {
    const token = arg.cli!.token;
    const description = describeCliArgument(arg);

    if (arg.cli?.kind === "flag") {
      command.option(token, description);
      continue;
    }

    if (arg.cli?.required) {
      command.requiredOption(
        token,
        description,
        toCommanderDefaultValue(arg.defaultValue),
      );
      continue;
    }

    if (arg.defaultValue !== undefined) {
      command.option(
        token,
        description,
        toCommanderDefaultValue(arg.defaultValue),
      );
      continue;
    }

    command.option(token, description);
  }
}

function ensureCommandGroup(
  program: Command,
  groups: Map<string, Command>,
  pathSegments: string[],
): Command {
  const key = pathSegments.join(" ");
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const parent =
    pathSegments.length === 1
      ? program
      : ensureCommandGroup(program, groups, pathSegments.slice(0, -1));
  const segment = pathSegments[pathSegments.length - 1]!;
  const description =
    GROUP_DESCRIPTIONS.get(key) ?? GROUP_DESCRIPTIONS.get(segment) ?? "";

  const group = parent.command(segment);
  if (description.length > 0) {
    group.description(description);
  }

  groups.set(key, group);
  return group;
}

function registerContractCommand(
  program: Command,
  groups: Map<string, Command>,
  contract: CommandContract,
  wrapAction: ActionWrapper,
): void {
  const parent =
    contract.cli.path.length === 1
      ? program
      : ensureCommandGroup(program, groups, contract.cli.path.slice(0, -1));

  const command = parent
    .command(buildCommandSyntax(contract))
    .description(contract.cli.description);

  registerOptions(command, contract);

  command.action(
    wrapAction(contract, async (...actionArgs: unknown[]) => {
      const commandInstance = actionArgs[actionArgs.length - 1] as Command;
      const positionalValues = actionArgs.slice(
        0,
        getPositionalArgs(contract).length,
      );
      await invokeContractHandler(contract, positionalValues, commandInstance);
    }),
  );
}

export function createProgram(
  version: string,
  wrapAction: ActionWrapper,
): Command {
  const program = new Command();

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

  const groups = new Map<string, Command>();
  for (const contract of commandRegistry) {
    registerContractCommand(program, groups, contract, wrapAction);
  }

  program.on("command:*", (operands: string[]) => {
    console.error(chalk.red(`Error: Unknown command '${operands[0]}'`));
    console.error(
      `Run ${chalk.cyan("pm --help")} for a list of available commands.`,
    );
    process.exit(1);
  });

  return program;
}
