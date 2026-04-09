import * as fs from "node:fs";
import * as path from "node:path";
import type { Argument, Command, Option } from "commander";
import { createProgram } from "./cli-surface.js";
import {
  getCommandReferenceOutputPath,
  renderCommandReference,
} from "./command-reference.js";
import { listMcpTools } from "./mcp-surface.js";

export type GeneratedCommandArtifact = {
  label: "CLI surface" | "MCP surface" | "Command reference";
  outputPath: string;
  content: string;
};

export type CommandArtifactDrift = {
  label: GeneratedCommandArtifact["label"];
  outputPath: string;
  status: "missing" | "stale";
};

const CLI_SURFACE_OUTPUT_PATH = path.resolve("docs/reference/cli-surface.txt");
const MCP_SURFACE_OUTPUT_PATH = path.resolve("docs/reference/mcp-tools.json");
const REFRESH_COMMAND = "npm run refresh:command-artifacts";

const passThroughAction = <TArgs extends unknown[]>(
  _contract: import("../schemas/command-contract.schema.js").CommandContract,
  fn: (...args: TArgs) => Promise<void>,
) => fn;

function formatArgument(arg: Argument): string {
  const name = arg.name();
  if (arg.required) {
    return arg.variadic ? `<${name}...>` : `<${name}>`;
  }

  return arg.variadic ? `[${name}...]` : `[${name}]`;
}

function formatDefaultValue(value: unknown): string {
  if (value === undefined) {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatOption(option: Option): string {
  const details = [`description=${option.description || "-"}`];

  if (option.mandatory) {
    details.push("required=yes");
  }

  if (option.defaultValue !== undefined) {
    details.push(`default=${formatDefaultValue(option.defaultValue)}`);
  }

  return `${option.flags} | ${details.join(" | ")}`;
}

function renderCommandTree(
  command: Command,
  parentPath: string[] = [],
): string[] {
  const commandPath = [...parentPath, command.name()];
  const usage = [
    "pm",
    ...commandPath,
    ...command.registeredArguments.map((arg) => formatArgument(arg)),
  ].join(" ");

  const lines = [
    `## ${usage}`,
    `description: ${command.description() || "-"}`,
    "arguments:",
    ...(command.registeredArguments.length > 0
      ? command.registeredArguments.map((arg) => `- ${formatArgument(arg)}`)
      : ["- none"]),
    "options:",
    ...(command.options.length > 0
      ? command.options.map((option) => `- ${formatOption(option)}`)
      : ["- none"]),
  ];

  for (const child of command.commands) {
    lines.push("", ...renderCommandTree(child, commandPath));
  }

  return lines;
}

export function renderCliSurface(): string {
  const program = createProgram("generated", passThroughAction);
  const lines = ["# CLI Surface"];

  for (const command of program.commands) {
    lines.push("", ...renderCommandTree(command));
  }

  return `${lines.join("\n")}\n`;
}

export function renderMcpSurface(): string {
  return `${JSON.stringify(listMcpTools(), null, 2)}\n`;
}

export function getCliSurfaceOutputPath(): string {
  return CLI_SURFACE_OUTPUT_PATH;
}

export function getMcpSurfaceOutputPath(): string {
  return MCP_SURFACE_OUTPUT_PATH;
}

export function getRefreshCommand(): string {
  return REFRESH_COMMAND;
}

export function listGeneratedCommandArtifacts(): GeneratedCommandArtifact[] {
  return [
    {
      label: "CLI surface",
      outputPath: CLI_SURFACE_OUTPUT_PATH,
      content: renderCliSurface(),
    },
    {
      label: "MCP surface",
      outputPath: MCP_SURFACE_OUTPUT_PATH,
      content: renderMcpSurface(),
    },
    {
      label: "Command reference",
      outputPath: getCommandReferenceOutputPath(),
      content: renderCommandReference(),
    },
  ];
}

export function writeGeneratedCommandArtifacts(): string[] {
  return listGeneratedCommandArtifacts().map(({ outputPath, content }) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, "utf8");
    return outputPath;
  });
}

export function detectCommandArtifactDrift(): CommandArtifactDrift[] {
  const drift: CommandArtifactDrift[] = [];

  for (const artifact of listGeneratedCommandArtifacts()) {
    if (!fs.existsSync(artifact.outputPath)) {
      drift.push({
        label: artifact.label,
        outputPath: artifact.outputPath,
        status: "missing",
      });
      continue;
    }

    const current = fs.readFileSync(artifact.outputPath, "utf8");
    if (current !== artifact.content) {
      drift.push({
        label: artifact.label,
        outputPath: artifact.outputPath,
        status: "stale",
      });
    }
  }

  return drift;
}
