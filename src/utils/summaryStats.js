// Pure helpers for PostWorkoutSummary (2026-10-09). No React Native imports
// so they unit-test under plain Jest.

// Regions that use miles. Everything else defaults to km.
const IMPERIAL_REGIONS = ['US', 'LR', 'MM'];

/** Default unit system from the device locale (no native module needed). */
export function defaultUnitsFromLocale(localeTag) {
  let tag = localeTag;
  if (!tag) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch (_e) {
      tag = '';
    }
  }
  const region = String(tag || '').split(/[-_]/)[1];
  return region && IMPERIAL_REGIONS.includes(region.toUpperCase()) ? 'imperial' : 'metric';
}

/** Total climb in meters; ignores sub-1 m wobble so GPS noise doesn't inflate it. */
export function computeElevationGain(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const alts = points.map((p) => p && p.altitude).filter((a) => typeof a === 'number');
  if (alts.length < 2) return null;
  let gain = 0;
  let ref = alts[0];
  for (let i = 1; i < alts.length; i += 1) {
    const d = alts[i] - ref;
    if (d >= 1) { gain += d; ref = alts[i]; } else if (d <= -1) { ref = alts[i]; }
  }
  return Math.round(gain);
}

/** Measured-cadence drift: avg of last third minus avg of first third (spm). */
export function computeCadenceDrift(points) {
  if (!Array.isArray(points)) return null;
  const vals = points.map((p) => p && p.measuredCadence).filter((v) => typeof v === 'number' && v > 0);
  if (vals.length < 6) return null;
  const third = Math.floor(vals.length / 3);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round(avg(vals.slice(-third)) - avg(vals.slice(0, third)));
}

/** Approximate total steps from measured average cadence and duration. */
export function estimateSteps(measuredAvgCadence, durationSec) {
  if (!measuredAvgCadence || !durationSec) return null;
  return Math.round(measuredAvgCadence * (durationSec / 60));
}

/** ~n evenly spaced points that carry cadence, for tappable map markers. */
export function pickCadenceMarkers(points, n = 8) {
  if (!Array.isArray(points)) return [];
  const withCoords = points.filter((p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number');
  if (withCoords.length < 3) return [];
  const step = Math.max(1, Math.floor(withCoords.length / (n + 1)));
  const out = [];
  for (let i = step; i < withCoords.length - 1 && out.length < n; i += step) out.push(withCoords[i]);
  return out;
}

