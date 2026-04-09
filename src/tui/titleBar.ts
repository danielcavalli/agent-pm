const DEFAULT_PROGRESS_BAR_WIDTH = 16;
const MIN_PROGRESS_BAR_WIDTH = 1;

export function calculateProjectCompletion(
  doneStories: number,
  totalStories: number,
): number {
  if (totalStories <= 0) {
    return 0;
  }

  const safeDone = Math.min(Math.max(doneStories, 0), totalStories);
  return Math.round((safeDone / totalStories) * 100);
}

export function buildProjectProgressBar(
  doneStories: number,
  totalStories: number,
  availableWidth: number,
): string {
  const percentage = calculateProjectCompletion(doneStories, totalStories);
  const percentageText = `${percentage}%`;
  const reservedWidth = 2 + 1 + percentageText.length;
  const barWidth = Math.max(
    MIN_PROGRESS_BAR_WIDTH,
    Math.min(DEFAULT_PROGRESS_BAR_WIDTH, availableWidth - reservedWidth),
  );
  const filledWidth = Math.round((percentage / 100) * barWidth);

  return `[${"#".repeat(filledWidth)}${".".repeat(barWidth - filledWidth)}] ${percentageText}`;
}

export function truncateTitleSegment(text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (text.length <= maxWidth) {
    return text;
  }

  if (maxWidth === 1) {
    return text.slice(0, 1);
  }

  return `${text.slice(0, maxWidth - 1)}…`;
}
