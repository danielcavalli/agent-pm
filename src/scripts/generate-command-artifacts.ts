import { writeGeneratedCommandArtifacts } from "../contracts/command-artifacts.js";

for (const outputPath of writeGeneratedCommandArtifacts()) {
  process.stdout.write(`Generated ${outputPath}\n`);
}
