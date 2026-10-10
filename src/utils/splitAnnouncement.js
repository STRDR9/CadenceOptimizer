// Mile/km split voice announcement (FORGE-013, Andy 10/10). Pure — no RN
// imports — so the exact spoken text is unit-tested.
//
// Spoken shape (imperial):
//   "Mile 2. 8:32 pace. Average pace 8:40. Cadence 172 this mile, 170 average."
// Facts only — no "pick it up" advice: on Intervals/Fartlek pace varies by
// design, and on steady runs the runner wants the numbers, not a nag.

// Measured cadence comes from the live step sensor. FORGE-009b: live values
// can be garbage while the screen is locked (repaired after the run). Never
// speak a number outside a plausible running/walking band.
export const PLAUSIBLE_CADENCE = { min: 100, max: 230 };

export const isPlausibleCadence = (v) =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= PLAUSIBLE_CADENCE.min &&
  v <= PLAUSIBLE_CADENCE.max;

export function formatPaceSpoken(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return null;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function buildSplitAnnouncement(split, units = 'imperial') {
  const unitWord = units === 'imperial' ? 'Mile' : 'Kilometer';
  const parts = [`${unitWord} ${split.splitNumber}.`];

  const splitPace = formatPaceSpoken(split.splitPace);
  if (splitPace) parts.push(`${splitPace} pace.`);

  const avgPace = formatPaceSpoken(split.overallPace);
  // On split 1 the average IS the split — don't say the same number twice.
  if (avgPace && split.splitNumber > 1) parts.push(`Average pace ${avgPace}.`);

  const splitCad = isPlausibleCadence(split.splitMeasuredCadence)
    ? Math.round(split.splitMeasuredCadence)
    : null;
  const avgCad = isPlausibleCadence(split.overallMeasuredCadence)
    ? Math.round(split.overallMeasuredCadence)
    : null;

  if (splitCad != null && avgCad != null && split.splitNumber > 1) {
    parts.push(`Cadence ${splitCad} this ${unitWord.toLowerCase()}, ${avgCad} average.`);
  } else if (splitCad != null) {
    parts.push(`Cadence ${splitCad}.`);
  }
  // No plausible measured cadence -> say nothing about cadence rather than
  // a wrong number (or the target, which isn't what the runner did).

  return parts.join(' ');
}
