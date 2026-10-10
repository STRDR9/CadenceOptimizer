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


// ---------------------------------------------------------------------------
// FORGE-010: cadence-vs-target visuals (colored route, chart, interval table)
// ---------------------------------------------------------------------------

// Deviation color semantics (ticket-fixed): within ±2% = on, 2–5% = near,
// >5% = off, no measurement = unknown.
export const DEVIATION_COLORS = {
  on: '#22C55E',
  near: '#F59E0B',
  off: '#EF4444',
  unknown: '#9CA3AF',
};

/** Bucket a measured cadence against its target: 'on'|'near'|'off'|'unknown'. */
export function cadenceDeviationBucket(measured, target) {
  if (typeof target !== 'number' || target <= 0) return 'unknown';
  if (typeof measured !== 'number' || measured <= 0) return 'unknown';
  const dev = Math.abs(measured - target) / target;
  if (dev <= 0.02) return 'on';
  if (dev <= 0.05) return 'near';
  return 'off';
}

/**
 * Group route points into consecutively-colored polyline segments for the
 * map. Each segment spans all consecutive point-pairs sharing a deviation
 * bucket (the pair takes the EARLIER point's bucket). Adjacent segments
 * share their boundary point so the drawn line has no gaps.
 * @returns {Array<{coordinates: Array<{latitude, longitude}>, bucket: string}>}
 */
export function buildRouteSegments(points) {
  if (!Array.isArray(points)) return [];
  const usable = points.filter(
    (p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number'
  );
  if (usable.length < 2) return [];

  const coord = (p) => ({ latitude: p.latitude, longitude: p.longitude });
  const segments = [];
  let current = null;
  for (let i = 0; i < usable.length - 1; i += 1) {
    const bucket = cadenceDeviationBucket(usable[i].measuredCadence, usable[i].targetCadence);
    if (current && current.bucket === bucket) {
      current.coordinates.push(coord(usable[i + 1]));
    } else {
      current = { bucket, coordinates: [coord(usable[i]), coord(usable[i + 1])] };
      segments.push(current);
    }
  }
  return segments;
}

/**
 * Geometry for the cadence-over-time chart (rendered with react-native-svg).
 * Measured cadence is a line broken wherever there is no measurement (gaps,
 * not zeros — a stop shouldn't crater the y-axis); the target is a stepped
 * line. Returns null when there is not enough data to draw.
 */
export function cadenceChartModel(points, width, height, pad = { l: 34, r: 10, t: 10, b: 20 }) {
  if (!Array.isArray(points) || !(width > 0) || !(height > 0)) return null;
  const usable = points
    .filter((p) => p && typeof p.timestamp === 'number' && typeof p.targetCadence === 'number' && p.targetCadence > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (usable.length < 2) return null;
  const t0 = usable[0].timestamp;
  const t1 = usable[usable.length - 1].timestamp;
  if (!(t1 > t0)) return null;

  const measuredVals = usable.map((p) => p.measuredCadence).filter((v) => typeof v === 'number' && v > 0);
  const targetVals = usable.map((p) => p.targetCadence);
  const all = measuredVals.concat(targetVals);
  let yMin = Math.min(...all);
  let yMax = Math.max(...all);
  const span = Math.max(yMax - yMin, 6); // never flatter than ±3 spm
  yMin = Math.floor((yMin - span * 0.15) / 5) * 5;
  yMax = Math.ceil((yMax + span * 0.15) / 5) * 5;

  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (t) => +(pad.l + ((t - t0) / (t1 - t0)) * plotW).toFixed(1);
  const y = (v) => +(pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH).toFixed(1);

  // Measured: consecutive runs of measured>0 become separate polylines.
  const measuredSegments = [];
  let run = [];
  for (const p of usable) {
    if (typeof p.measuredCadence === 'number' && p.measuredCadence > 0) {
      run.push({ x: x(p.timestamp), y: y(p.measuredCadence) });
    } else if (run.length) {
      measuredSegments.push(run);
      run = [];
    }
  }
  if (run.length) measuredSegments.push(run);

  // Target: stepped — hold the previous level until the change point.
  const targetSteps = [{ x: x(usable[0].timestamp), y: y(usable[0].targetCadence) }];
  for (let i = 1; i < usable.length; i += 1) {
    const prev = usable[i - 1].targetCadence;
    const curr = usable[i].targetCadence;
    if (curr !== prev) targetSteps.push({ x: x(usable[i].timestamp), y: y(prev) });
    targetSteps.push({ x: x(usable[i].timestamp), y: y(curr) });
  }

  const mid = Math.round((yMin + yMax) / 2);
  return {
    width,
    height,
    pad,
    yMin,
    yMax,
    durationSec: Math.round((t1 - t0) / 1000),
    yTicks: [
      { value: yMax, y: y(yMax) },
      { value: mid, y: y(mid) },
      { value: yMin, y: y(yMin) },
    ],
    measuredSegments,
    targetSteps,
    hasMeasured: measuredSegments.length > 0,
  };
}

/**
 * Interval table (per-phase target vs actual) derived from the recorded
 * points: a phase = a run of consecutive points sharing a targetCadence.
 * Only meaningful when the target actually changed (interval/fartlek), so
 * fewer than 2 phases returns [] and the table is hidden for steady runs.
 */
export function buildIntervalTable(points) {
  if (!Array.isArray(points)) return [];
  const usable = points
    .filter((p) => p && typeof p.timestamp === 'number' && typeof p.targetCadence === 'number' && p.targetCadence > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (usable.length < 2) return [];
  const t0 = usable[0].timestamp;

  const phases = [];
  let group = [usable[0]];
  for (let i = 1; i < usable.length; i += 1) {
    if (usable[i].targetCadence === group[0].targetCadence) {
      group.push(usable[i]);
    } else {
      phases.push(group);
      group = [usable[i]];
    }
  }
  phases.push(group);
  if (phases.length < 2) return [];

  return phases.map((g, idx) => {
    const next = phases[idx + 1];
    const measured = g.map((p) => p.measuredCadence).filter((v) => typeof v === 'number');
    const stepping = measured.filter((v) => v > 0);
    const onTarget = measured.filter(
      (v) => cadenceDeviationBucket(v, g[0].targetCadence) === 'on'
    ).length;
    const phaseEnd = next ? next[0].timestamp : usable[usable.length - 1].timestamp;
    return {
      phase: idx + 1,
      target: g[0].targetCadence,
      startSec: Math.round((g[0].timestamp - t0) / 1000),
      durationSec: Math.max(0, Math.round((phaseEnd - g[0].timestamp) / 1000)),
      avgMeasured: stepping.length
        ? Math.round(stepping.reduce((a, b) => a + b, 0) / stepping.length)
        : null,
      pctOnTarget: measured.length ? Math.round((onTarget / measured.length) * 100) : null,
    };
  });
}
