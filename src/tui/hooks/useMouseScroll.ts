import { useEffect, useRef } from "react";

// ── SGR Mouse Sequence Parsing ───────────────────────────────────────────────

/** Parsed SGR mouse event */
export interface MouseEvent {
  button: number;
  col: number;
  row: number;
  release: boolean;
}

/**
 * Parse an SGR mouse sequence from a data buffer.
 * SGR format: \x1b[<button;col;rowM (press) or \x1b[<button;col;rowm (release)
 * Returns the parsed event and the number of bytes consumed, or null if not a mouse sequence.
 */
export function parseMouseSequence(data: string): { event: MouseEvent; consumed: number } | null {
  // SGR mouse: \x1b[<Ps;Ps;PsM or \x1b[<Ps;Ps;Psm
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (!match) return null;
  return {
    event: {
      button: parseInt(match[1]!, 10),
      col: parseInt(match[2]!, 10),
      row: parseInt(match[3]!, 10),
      release: match[4] === "m",
    },
    consumed: match[0].length,
  };
}

/** Check if a mouse button code represents scroll up */
export function isScrollUp(button: number): boolean {
  return button === 64;
}

/** Check if a mouse button code represents scroll down */
export function isScrollDown(button: number): boolean {
  return button === 65;
}

// ── Enable/Disable Sequences ─────────────────────────────────────────────────

const MOUSE_ENABLE = "\x1b[?1000h\x1b[?1006h";
const MOUSE_DISABLE = "\x1b[?1000l\x1b[?1006l";

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Custom hook to enable mouse scroll support in Ink.
 * Writes xterm escape sequences to enable SGR mouse reporting,
 * intercepts scroll wheel events from stdin, and calls onScroll.
 *
 * Only handles scroll events (button 64/65). All other mouse events
 * and non-mouse input are ignored (passed through to Ink's normal handling).
 */
export function useMouseScroll(
  onScroll: (direction: "up" | "down") => void,
): void {
  const callbackRef = useRef(onScroll);
  callbackRef.current = onScroll;

  useEffect(() => {
    // Don't enable mouse in non-TTY environments (CI, piped stdin, etc.)
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;

    // Enable SGR mouse reporting
    process.stdout.write(MOUSE_ENABLE);

    const onData = (data: Buffer) => {
      const str = data.toString("utf-8");
      let offset = 0;

      while (offset < str.length) {
        const remaining = str.slice(offset);
        const parsed = parseMouseSequence(remaining);

        if (parsed) {
          const { event, consumed } = parsed;
          // Only handle scroll events (press, not release)
          if (!event.release) {
            if (isScrollUp(event.button)) {
              callbackRef.current("up");
            } else if (isScrollDown(event.button)) {
              callbackRef.current("down");
            }
          }
          offset += consumed;
        } else {
          // Not a mouse sequence -- skip this character
          // Ink's own input handler will process keyboard input normally
          offset++;
        }
      }
    };

    process.stdin.on("data", onData);

    return () => {
      process.stdin.removeListener("data", onData);
      // Disable mouse reporting on cleanup
      if (process.stdout.isTTY) {
        process.stdout.write(MOUSE_DISABLE);
      }
    };
  }, []);
}
