import {
  getCommandReferenceOutputPath,
  writeCommandReference,
} from "../contracts/command-reference.js";

const outputPath = writeCommandReference();
process.stdout.write(
  `Generated command reference at ${outputPath || getCommandReferenceOutputPath()}\n`,
);
