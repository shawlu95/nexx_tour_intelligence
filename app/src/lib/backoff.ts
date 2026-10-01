// Retry timing for the upload queue. Pure function.

/** Delay before retry number `attempt` (1-based): 5s, 15s, 45s, ... capped at 30 minutes. */
export function retryDelayMs(attempt: number): number {
  const base = 5_000 * 3 ** Math.max(0, attempt - 1);
  return Math.min(base, 30 * 60_000);
}
