# Terminal Link Support Evaluation

Story: `PM-E069-S003`

## Decision

Adopt OSC 8 hyperlinks for story codes in the Ink TUI when the project config provides a URL template and the active terminal is known to support hyperlinks.

## What changed

- Added optional project config at `tui.links.story_url_template`
- Story codes in `src/tui/components/Tree.tsx` and `src/tui/components/DetailPanel.tsx` now render as OSC 8 hyperlinks when supported
- Added conservative terminal detection in `src/tui/terminalLinks.ts`
- Added a default self-hosting template in `.pm/project.yaml` that links story codes to the GitHub repository search for that code

## Compatibility matrix

| Terminal     | Result                | Basis                                                                                                                                    |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| iTerm2       | Supported             | iTerm2 escape-code docs explicitly document OSC 8 anchors                                                                                |
| Kitty        | Supported             | Listed as supported in the OSC8-Adoption compatibility matrix                                                                            |
| Alacritty    | Supported since v0.11 | Alacritty v0.11 release notes add `OSC 8` hyperlinks                                                                                     |
| Terminal.app | Not supported         | Not listed in the OSC8-Adoption support matrix and no Apple OSC 8 support documentation found                                            |
| tmux         | Conditional           | Supported in newer tmux with `terminal-features ... hyperlinks`; disabled by default in agent-pm auto-detection to avoid false positives |

## Test command

Run this in a terminal to verify OSC 8 support manually:

```bash
printf '\033]8;;https://example.com\033\\This is a link\033]8;;\033\\\n'
```

In a supporting terminal, `This is a link` should become clickable.

## Notes

- The self-hosting project template uses GitHub code search because PM story codes are internal identifiers, not GitHub issue numbers.
- The runtime detection is intentionally conservative: unsupported or unknown terminals fall back to plain text story codes.

## Sources

- `https://iterm2.com/documentation-escape-codes.html`
- `https://github.com/Alhadis/OSC8-Adoption`
- `https://github.com/alacritty/alacritty/releases/tag/v0.11.0`
