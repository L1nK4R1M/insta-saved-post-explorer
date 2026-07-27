export function retryDelayMs(attempt: number, baseMs = 1_000, capMs = 300_000): number {
  const exponent = Math.max(0, Math.min(30, Math.trunc(attempt) - 1));
  return Math.min(capMs, baseMs * 2 ** exponent);
}
