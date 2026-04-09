import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const INSTALLER = path.resolve(process.cwd(), "install/install.sh");
const BASH = "/bin/bash";

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, { encoding: "utf8", mode: 0o755 });
}

function linkSystemCommand(binDir: string, commandName: string): void {
  const resolved = spawnSync(BASH, ["-lc", `command -v ${commandName}`], {
    encoding: "utf8",
  });

  if (resolved.status !== 0) {
    throw new Error(`Unable to resolve system command: ${commandName}`);
  }

  fs.symlinkSync(resolved.stdout.trim(), path.join(binDir, commandName));
}

function writeFakeNode(binDir: string, mode: "success" | "fail"): void {
  const script =
    mode === "success"
      ? `#!/bin/bash
set -euo pipefail
if [ "$1" = "-e" ]; then
  config_path="$3"
  mcp_server="$4"
  mkdir -p "$(dirname "$config_path")"
  printf '{\n  "mcp": {\n    "pm-tools": {\n      "type": "local",\n      "command": ["node", "%s"]\n    }\n  }\n}\n' "$mcp_server" > "$config_path"
  exit 0
fi
exit 1
`
      : `#!/bin/bash
set -euo pipefail
if [ "$1" = "-e" ]; then
  config_path="$3"
  printf 'corrupted\n' > "$config_path"
  exit 1
fi
exit 1
`;

  writeExecutable(path.join(binDir, "node"), script);
}

describe("install.sh non-interactive mode", () => {
  let tmpDir: string;
  let binDir: string;
  let homeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-installer-test-"));
    binDir = path.join(tmpDir, "bin");
    homeDir = path.join(tmpDir, "home");

    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    for (const commandName of [
      "awk",
      "basename",
      "cp",
      "date",
      "dirname",
      "grep",
      "mkdir",
      "mktemp",
      "mv",
      "pwd",
      "rm",
      "xargs",
    ]) {
      linkSystemCommand(binDir, commandName);
    }

    writeExecutable(
      path.join(binDir, "npm"),
      `#!/bin/bash
set -euo pipefail
case "$1" in
  uninstall)
    exit 0
    ;;
  install)
    exit 0
    ;;
  root)
    printf '%s\n' "\${HOME}/.fake-global"
    ;;
  *)
    exit 0
    ;;
esac
`,
    );

    writeExecutable(
      path.join(binDir, "pm"),
      `#!/bin/bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf '0.0.0-test\n'
  exit 0
fi
exit 0
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps manual installs interactive by default", () => {
    const installerContents = fs.readFileSync(INSTALLER, "utf8");

    expect(installerContents).toContain(
      'read -rp "    Install tmux? [y/N] " install_tmux',
    );
    expect(installerContents).toContain("if $NON_INTERACTIVE; then");
  });

  it("bypasses prompts with --non-interactive and uses safe defaults", () => {
    const result = spawnSync(BASH, [INSTALLER, "--non-interactive"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: binDir,
        NO_COLOR: "1",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("Install tmux? [y/N]");
    expect(result.stdout).toContain("Non-interactive mode enabled");
    expect(result.stdout).toContain(
      "Non-interactive mode: skipping optional tmux install prompt (default: No)",
    );
  });

  it("creates timestamped backups before mutating existing client config", () => {
    const opencodeDir = path.join(homeDir, ".config", "opencode");
    const configPath = path.join(opencodeDir, "opencode.json");

    fs.mkdirSync(opencodeDir, { recursive: true });
    fs.writeFileSync(configPath, '{"mcp":{"existing":true}}\n', "utf8");
    writeFakeNode(binDir, "success");

    const result = spawnSync(BASH, [INSTALLER, "--non-interactive"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: binDir,
        NO_COLOR: "1",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const backupFiles = fs
      .readdirSync(opencodeDir)
      .filter((file) => file.startsWith("opencode.json.pm-backup-"));

    expect(backupFiles).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(opencodeDir, backupFiles[0]), "utf8"),
    ).toBe('{"mcp":{"existing":true}}\n');
    expect(result.stdout).toContain("Backed up OpenCode MCP config");
    expect(result.stdout).toContain(backupFiles[0]);
  });

  it("restores the original config from backup when a write fails", () => {
    const opencodeDir = path.join(homeDir, ".config", "opencode");
    const configPath = path.join(opencodeDir, "opencode.json");
    const originalContents = '{"mcp":{"existing":true}}\n';

    fs.mkdirSync(opencodeDir, { recursive: true });
    fs.writeFileSync(configPath, originalContents, "utf8");
    writeFakeNode(binDir, "fail");

    const result = spawnSync(BASH, [INSTALLER, "--non-interactive"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: binDir,
        NO_COLOR: "1",
      },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(configPath, "utf8")).toBe(originalContents);
    expect(result.stdout + result.stderr).toContain(
      "Restored OpenCode MCP config from backup",
    );
  });
});
