import * as fs from "node:fs";
import * as path from "node:path";
import { commandRegistry } from "./command-registry.js";
import type {
  CommandArgument,
  CommandContract,
} from "../schemas/command-contract.schema.js";

const OUTPUT_PATH = path.resolve("docs/reference/commands.md");

function formatDefaultValue(value: CommandArgument["defaultValue"]): string {
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

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function formatRequiredLabel(arg: CommandArgument): string {
  const requiredIn: string[] = [];

  if (arg.cli?.required) {
    requiredIn.push("CLI");
  }

  if (arg.mcp?.required) {
    requiredIn.push("MCP");
  }

  return requiredIn.length > 0 ? requiredIn.join(", ") : "No";
}

function formatCliToken(arg: CommandArgument): string {
  return arg.cli ? `\`${arg.cli.token}\`` : "-";
}

function formatMcpToken(arg: CommandArgument): string {
  return arg.mcp ? `\`${arg.mcp.name}\`` : "-";
}

function formatTypeLabel(arg: CommandArgument): string {
  return arg.enum && arg.enum.length > 0
    ? `${arg.type} (${arg.enum.join(" | ")})`
    : arg.type;
}

function renderArgumentsTable(contract: CommandContract): string[] {
  if (contract.args.length === 0) {
    return ["No arguments."];
  }

  return [
    "| Argument | Type | CLI | MCP | Required | Default | Description |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...contract.args.map((arg) =>
      [
        `\`${arg.name}\``,
        escapeMarkdownCell(formatTypeLabel(arg)),
        formatCliToken(arg),
        formatMcpToken(arg),
        escapeMarkdownCell(formatRequiredLabel(arg)),
        escapeMarkdownCell(formatDefaultValue(arg.defaultValue)),
        escapeMarkdownCell(arg.description),
      ].join(" | "),
    ),
  ];
}

function renderExamples(contract: CommandContract): string[] {
  if (contract.docs.examples.length === 0) {
    return ["No examples."];
  }

  return ["```bash", ...contract.docs.examples, "```"];
}

function renderTableOfContents(contracts: CommandContract[]): string[] {
  return contracts.map((contract) => {
    const commandName = `pm ${contract.cli.path.join(" ")}`;
    const anchor = commandName
      .replace(/[^a-z0-9 ]/gi, "")
      .trim()
      .replace(/ +/g, "-")
      .toLowerCase();
    return `- [\`${commandName}\`](#${anchor})`;
  });
}

function renderContractSection(contract: CommandContract): string[] {
  const commandName = `pm ${contract.cli.path.join(" ")}`;
  const lines = [
    `## \`${commandName}\``,
    "",
    `${contract.summary}. ${contract.docs.purpose}`,
    "",
    `- CLI description: ${contract.cli.description}`,
    `- Side effects: ${contract.sideEffects.level} -- ${contract.sideEffects.notes}`,
  ];

  if (contract.mcp) {
    lines.push(
      `- MCP tool: \`${contract.mcp.toolName}\` -- ${contract.mcp.description}`,
    );
  }

  lines.push(
    "",
    "### Arguments",
    "",
    ...renderArgumentsTable(contract),
    "",
    "### Examples",
    "",
    ...renderExamples(contract),
  );

  return lines;
}

export function renderCommandReference(
  contracts: CommandContract[] = commandRegistry,
): string {
  const lines = [
    "# Command Reference",
    "",
    "This document is generated from `src/contracts/command-registry.ts`. Treat it as the authoritative CLI and MCP reference.",
    "",
    "## Table of Contents",
    "",
    ...renderTableOfContents(contracts),
  ];

  for (const contract of contracts) {
    lines.push("", ...renderContractSection(contract));
  }

  return `${lines.join("\n")}\n`;
}

export function writeCommandReference(outputPath = OUTPUT_PATH): string {
  const content = renderCommandReference();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  return outputPath;
}

export function getCommandReferenceOutputPath(): string {
  return OUTPUT_PATH;
}
