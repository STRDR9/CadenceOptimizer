// Shared display formatters (FORGE-013). Pure — no React Native imports.

/**
 * Countdown / elapsed display as m:ss (e.g. 225 -> "3:45"), h:mm:ss past an
 * hour. Sub-second noise is rounded; negatives and garbage clamp to 0:00.
 */
export function formatCountdown(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
