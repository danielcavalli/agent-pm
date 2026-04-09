export function relativeTime(isoString: string, nowMs: number): string {
  const timestampMs = Date.parse(isoString);

  if (Number.isNaN(timestampMs)) {
    return isoString;
  }

  const deltaMs = Math.max(0, nowMs - timestampMs);
  const deltaSeconds = Math.floor(deltaMs / 1000);

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}
