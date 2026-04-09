import {
  detectCommandArtifactDrift,
  getRefreshCommand,
} from "../contracts/command-artifacts.js";

const drift = detectCommandArtifactDrift();

if (drift.length === 0) {
  process.stdout.write("Command surface artifacts are up to date.\n");
  process.exit(0);
}

process.stderr.write("Command surface drift detected.\n");
for (const item of drift) {
  process.stderr.write(
    `- ${item.label}: ${item.outputPath} (${item.status})\n`,
  );
}
process.stderr.write(
  `Refresh generated artifacts with \`${getRefreshCommand()}\` and commit the updated files.\n`,
);
process.exit(1);
