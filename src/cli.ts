#!/usr/bin/env node
import chalk from "chalk";
import { createRequire } from "module";
import { shouldEnsureProjectsDir } from "./contracts/command-registry.js";
import { createProgram } from "./contracts/cli-surface.js";
import { PmError } from "./lib/errors.js";
import { ensureProjectsDir } from "./lib/codes.js";
import type { CommandContract } from "./schemas/command-contract.schema.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

if (shouldEnsureProjectsDir(process.argv.slice(2))) {
  ensureProjectsDir();
}

function action<TArgs extends unknown[]>(
  _contract: CommandContract,
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

const program = createProgram(version, action);

program.parse(process.argv);
