// Post-run summary helpers (2026-10-09): 3x3 stat grid + units default + map markers.
import {
  defaultUnitsFromLocale,
  computeElevationGain,
  computeCadenceDrift,
  estimateSteps,
  pickCadenceMarkers,
  cadenceDeviationBucket,
  buildRouteSegments,
  cadenceChartModel,
  buildIntervalTable,
} from '../summaryStats';

describe('defaultUnitsFromLocale', () => {
  it('uses miles for US / LR / MM', () => {
    expect(defaultUnitsFromLocale('en-US')).toBe('imperial');
    expect(defaultUnitsFromLocale('en_LR')).toBe('imperial');
    expect(defaultUnitsFromLocale('my-MM')).toBe('imperial');
  });
  it('uses km elsewhere and when the region is missing', () => {
    expect(defaultUnitsFromLocale('en-GB')).toBe('metric');
    expect(defaultUnitsFromLocale('fr-FR')).toBe('metric');
    expect(defaultUnitsFromLocale('en')).toBe('metric');
  });
});

describe('computeElevationGain', () => {
  it('sums real climbs and ignores sub-1 m GPS wobble', () => {
    const pts = [10, 10.4, 10.2, 12, 11.6, 15, 14, 16].map((altitude) => ({ altitude }));
    // 10 -> 12 (+2), 12 -> 15 (+3), drop to 14, 14 -> 16 (+2) = 7
    expect(computeElevationGain(pts)).toBe(7);
  });
  it('returns null without altitude data', () => {
    expect(computeElevationGain([{}, {}])).toBeNull();
    expect(computeElevationGain(undefined)).toBeNull();
  });
});

describe('computeCadenceDrift', () => {
  it('is last-third average minus first-third average', () => {
    const pts = [100, 100, 104, 104, 110, 110].map((measuredCadence) => ({ measuredCadence }));
    expect(computeCadenceDrift(pts)).toBe(10);
  });
  it('needs enough measured samples', () => {
    expect(computeCadenceDrift([{ measuredCadence: 100 }])).toBeNull();
    expect(computeCadenceDrift([{}, {}, {}, {}, {}, {}])).toBeNull();
  });
});

describe('estimateSteps', () => {
  it('multiplies spm by minutes', () => {
    expect(estimateSteps(101, 174)).toBe(293);
  });
  it('is null without data', () => {
    expect(estimateSteps(null, 174)).toBeNull();
    expect(estimateSteps(101, 0)).toBeNull();
  });
});

describe('pickCadenceMarkers', () => {
  const route = Array.from({ length: 41 }, (_, i) => ({ latitude: 47.6 + i * 1e-4, longitude: -122.3, measuredCadence: 100 + i, targetCadence: 170 }));
  it('returns up to n evenly spaced interior points', () => {
    const m = pickCadenceMarkers(route, 8);
    expect(m.length).toBe(8);
    expect(m[0]).not.toBe(route[0]);
    expect(m[m.length - 1]).not.toBe(route[route.length - 1]);
  });
  it('returns nothing for tiny routes', () => {
    expect(pickCadenceMarkers(route.slice(0, 2))).toEqual([]);
  });
});

// FORGE-010: cadence-vs-target visuals.
describe('cadenceDeviationBucket', () => {
  it('buckets by percent deviation with inclusive boundaries', () => {
    // Integer cadences (what the sensors produce): 173/170 = 1.8% -> on,
    // 174 = 2.35% -> near, 178 = 4.7% -> near, 179 = 5.3% -> off.
    expect(cadenceDeviationBucket(170, 170)).toBe('on');
    expect(cadenceDeviationBucket(173, 170)).toBe('on');
    expect(cadenceDeviationBucket(174, 170)).toBe('near');
    expect(cadenceDeviationBucket(178, 170)).toBe('near');
    expect(cadenceDeviationBucket(179, 170)).toBe('off');
    expect(cadenceDeviationBucket(160, 170)).toBe('off');
  });
  it('is unknown without a usable measurement or target', () => {
    expect(cadenceDeviationBucket(null, 170)).toBe('unknown');
    expect(cadenceDeviationBucket(0, 170)).toBe('unknown');
    expect(cadenceDeviationBucket(170, null)).toBe('unknown');
    expect(cadenceDeviationBucket(170, 0)).toBe('unknown');
  });
});

describe('buildRouteSegments', () => {
  const pt = (i, measured, target = 170) => ({
    latitude: 47.6 + i * 1e-4,
    longitude: -122.3,
    timestamp: i * 5000,
    targetCadence: target,
    measuredCadence: measured,
  });

  it('merges consecutive same-bucket pairs and splits on transitions', () => {
    // on, on, off, off  -> pairs: on(0-1), on(1-2), off(2-3)
    const points = [pt(0, 170), pt(1, 171), pt(2, 185), pt(3, 186)];
    const segs = buildRouteSegments(points);
    expect(segs.map((x) => x.bucket)).toEqual(['on', 'off']);
    expect(segs[0].coordinates).toHaveLength(3); // points 0,1,2
    expect(segs[1].coordinates).toHaveLength(2); // points 2,3 (boundary shared)
    expect(segs[0].coordinates[2]).toEqual(segs[1].coordinates[0]);
  });

  it('marks unmeasured stretches unknown (grey), not red', () => {
    const points = [pt(0, null), pt(1, null), pt(2, null)];
    const segs = buildRouteSegments(points);
    expect(segs).toHaveLength(1);
    expect(segs[0].bucket).toBe('unknown');
  });

  it('returns [] when there are not two mappable points', () => {
    expect(buildRouteSegments([])).toEqual([]);
    expect(buildRouteSegments([pt(0, 170)])).toEqual([]);
    expect(buildRouteSegments(undefined)).toEqual([]);
    expect(buildRouteSegments([{ measuredCadence: 170 }, { measuredCadence: 171 }])).toEqual([]);
  });
});

describe('cadenceChartModel', () => {
  const pt = (sec, measured, target = 170) => ({
    timestamp: sec * 1000,
    targetCadence: target,
    measuredCadence: measured,
  });

  it('returns null without enough data', () => {
    expect(cadenceChartModel([], 300, 180)).toBeNull();
    expect(cadenceChartModel([pt(0, 170)], 300, 180)).toBeNull();
    expect(cadenceChartModel([pt(0, 170), pt(0, 171)], 300, 180)).toBeNull(); // zero span
    expect(cadenceChartModel([pt(0, 170), pt(10, 170)], 0, 180)).toBeNull();
  });

  it('breaks the measured line at gaps instead of plunging to zero', () => {
    const points = [pt(0, 170), pt(5, 171), pt(10, null), pt(15, 0), pt(20, 169), pt(25, 170)];
    const model = cadenceChartModel(points, 320, 180);
    expect(model.measuredSegments).toHaveLength(2);
    expect(model.measuredSegments[0]).toHaveLength(2);
    expect(model.measuredSegments[1]).toHaveLength(2);
    expect(model.hasMeasured).toBe(true);
    // y-domain snapped to 5s and never includes the 0 "measurement"
    expect(model.yMin).toBeGreaterThanOrEqual(160);
    expect(model.yMax).toBeLessThanOrEqual(180);
    expect(model.durationSec).toBe(25);
  });

  it('steps the target line: holds the old level until the change point', () => {
    const points = [pt(0, null, 160), pt(10, null, 160), pt(20, null, 180), pt(30, null, 180)];
    const model = cadenceChartModel(points, 320, 180);
    expect(model.hasMeasured).toBe(false);
    const ys = model.targetSteps.map((p) => p.y);
    const xs = model.targetSteps.map((p) => p.x);
    // 5 points: (0,160) (10,160) (20,160-hold) (20,180) (30,180)
    expect(model.targetSteps).toHaveLength(5);
    expect(xs[2]).toBe(xs[3]); // vertical step at the change point
    expect(ys[2]).toBe(ys[1]);
    expect(ys[3]).toBe(ys[4]);
    expect(ys[3]).toBeLessThan(ys[2]); // higher cadence = higher on chart (smaller y)
  });
});

describe('buildIntervalTable', () => {
  const pt = (sec, target, measured) => ({
    timestamp: sec * 1000,
    targetCadence: target,
    measuredCadence: measured,
  });

  it('hides for steady runs (fewer than 2 phases)', () => {
    const steady = [pt(0, 170, 169), pt(5, 170, 170), pt(10, 170, 171)];
    expect(buildIntervalTable(steady)).toEqual([]);
    expect(buildIntervalTable([])).toEqual([]);
  });

  it('groups phases by target change with per-phase actual and on-target %', () => {
    const points = [
      pt(0, 160, 160), pt(10, 160, 161),   // phase 1: on, on
      pt(20, 185, 170), pt(30, 185, 184),  // phase 2: off, on
      pt(40, 160, null),                   // phase 3: no measurement
    ];
    const rows = buildIntervalTable(points);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ phase: 1, target: 160, avgMeasured: 161, pctOnTarget: 100, startSec: 0, durationSec: 20 });
    expect(rows[1]).toMatchObject({ phase: 2, target: 185, avgMeasured: 177, pctOnTarget: 50, startSec: 20, durationSec: 20 });
    expect(rows[2]).toMatchObject({ phase: 3, target: 160, avgMeasured: null, startSec: 40, durationSec: 0 });
  });
});
