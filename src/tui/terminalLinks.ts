export interface TerminalLinkSupportOptions {
  env?: NodeJS.ProcessEnv;
}

const ESC = "\u001B";
const ST = `${ESC}\\`;

export function supportsTerminalLinks(
  options: TerminalLinkSupportOptions = {},
): boolean {
  const env = options.env ?? process.env;
  const preference = env["PM_TUI_HYPERLINKS"];

  if (preference === "always") return true;
  if (preference === "never") return false;

  if (env["TMUX"]) return false;
  if (env["KITTY_WINDOW_ID"] || env["TERM"] === "xterm-kitty") return true;
  if (env["WT_SESSION"]) return true;

  const termProgram = env["TERM_PROGRAM"];
  if (termProgram === "Apple_Terminal") return false;
  if (
    termProgram === "iTerm.app" ||
    termProgram === "WezTerm" ||
    termProgram === "vscode" ||
    termProgram === "Hyper" ||
    termProgram === "HyperTerm" ||
    termProgram === "Alacritty" ||
    termProgram === "Ghostty"
  ) {
    return true;
  }

  const vteVersion = Number(env["VTE_VERSION"] ?? "0");
  return Number.isFinite(vteVersion) && vteVersion >= 5000;
}

export function buildStoryUrl(
  storyUrlTemplate: string | undefined,
  storyCode: string,
): string | undefined {
  if (!storyUrlTemplate) return undefined;
  return storyUrlTemplate.replaceAll("{code}", encodeURIComponent(storyCode));
}

export function formatTerminalLink(
  label: string,
  url: string | undefined,
  enabled: boolean,
): string {
  if (!enabled || !url) return label;
  return `${ESC}]8;;${url}${ST}${label}${ESC}]8;;${ST}`;
}

export function injectStoryLink(
  label: string,
  storyCode: string,
  storyUrlTemplate: string | undefined,
  enabled: boolean,
): string {
  const url = buildStoryUrl(storyUrlTemplate, storyCode);
  if (!enabled || !url) return label;
  return label.replace(storyCode, formatTerminalLink(storyCode, url, true));
}
