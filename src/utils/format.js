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

/**
 * Live in-run distance (Andy 10/11). meters -> { value, unit } with two
 * decimals ("2.34" mi / "3.77" km). Garbage/negative clamps to 0.00.
 */
export function formatDistance(meters, units = 'imperial') {
  const m = Math.max(0, Number(meters) || 0);
  const imperial = units === 'imperial';
  const value = imperial ? m / 1609.344 : m / 1000;
  return { value: value.toFixed(2), unit: imperial ? 'mi' : 'km' };
}

const PHASE_TAGS = {
  work: 'WORK', rest: 'REST', warmup: 'EASY', cooldown: 'EASY',
  hard: 'HARD', moderate: 'MODERATE', easy: 'EASY', base: 'STEADY',
};

/**
 * In-run card header (Andy 10/11). Intervals read as the runner counts them —
 * "INTERVAL 2 OF 5" (work + its rest), WARMUP, COOLDOWN — not raw phase numbers
 * ("1/9" counted warmup/rest/cooldown phases). Fartlek keeps phase n/N.
 */
export function describePhase(phase, index = 0, total = 0) {
  const intensity = phase?.intensity;
  const tag = PHASE_TAGS[intensity] || 'MODERATE';
  if (intensity === 'warmup') return { title: 'WARMUP', tag };
  if (intensity === 'cooldown') return { title: 'COOLDOWN', tag };
  if (phase?.type === 'interval' && phase?.intervalNumber && phase?.totalIntervals) {
    return { title: `INTERVAL ${phase.intervalNumber} OF ${phase.totalIntervals}`, tag };
  }
  const label = phase?.type === 'fartlek' ? 'FARTLEK' : 'PHASE';
  return { title: total ? `${label} ${index + 1} OF ${total}` : label, tag };
}
