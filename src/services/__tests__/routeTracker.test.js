// Tests for RouteTracker's FORGE-009 surface: dual-cadence points
// (target + measured), legacy point migration, and persistence downsampling.

import TrackerSingleton, {
  RouteTracker,
  normalizeRoutePoint,
  downsamplePoints,
} from '../RouteTracker';

// ~0.0001° latitude ≈ 11.1 m, so consecutive points are a few meters apart.
const loc = (i, timestamp) => ({
  latitude: 37.77 + i * 0.0001,
  longitude: -122.42,
  altitude: 10,
  timestamp,
});

describe('dual-cadence points', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RouteTracker();
    tracker.start();
  });

  test('points carry targetCadence and measuredCadence (null when unmeasured)', () => {
    tracker.updateCadence(172);
    tracker.addPoint(loc(0, 1000));

    tracker.updateMeasuredCadence(168);
    tracker.addPoint(loc(1, 6000));

    expect(tracker.points[0]).toMatchObject({ targetCadence: 172, measuredCadence: null });
    expect(tracker.points[1]).toMatchObject({ targetCadence: 172, measuredCadence: 168 });
  });

  test('averages: target-based legacy average + separate measured average', () => {
    tracker.updateCadence(170);
    tracker.updateMeasuredCadence(160);
    tracker.addPoint(loc(0, 1000));
    tracker.updateCadence(180);
    tracker.updateMeasuredCadence(170);
    tracker.addPoint(loc(1, 6000));

    expect(tracker.getAverageCadence()).toBe(175);         // (170+180)/2 — target
    expect(tracker.getAverageMeasuredCadence()).toBe(165); // (160+170)/2 — measured
  });

  test('measured average is null when nothing was measured', () => {
    tracker.updateCadence(170);
    tracker.addPoint(loc(0, 1000));
    tracker.addPoint(loc(1, 6000));
    expect(tracker.getAverageMeasuredCadence()).toBeNull();
    expect(tracker.getSummary().avgMeasuredCadence).toBeNull();
  });

  test('splits expose targetCadence and measuredCadence alongside legacy avgCadence', () => {
    tracker.updateCadence(172);
    tracker.updateMeasuredCadence(169);
    // ~11.1 m per point: 100 points ≈ 1.1 km → one full km split.
    for (let i = 0; i < 100; i++) {
      tracker.addPoint(loc(i, 1000 + i * 5000));
    }
    const splits = tracker.getSplits(1000);
    expect(splits.length).toBeGreaterThanOrEqual(1);
    expect(splits[0].avgCadence).toBe(172); // legacy name, target-based
    expect(splits[0].targetCadence).toBe(172);
    expect(splits[0].measuredCadence).toBe(169);
  });
});

describe('normalizeRoutePoint (legacy migration)', () => {
  test('pre-FORGE-009 `cadence` maps to targetCadence, measured becomes null', () => {
    const legacy = { latitude: 1, longitude: 2, altitude: 3, timestamp: 4, cadence: 172 };
    expect(normalizeRoutePoint(legacy)).toEqual({
      latitude: 1,
      longitude: 2,
      altitude: 3,
      timestamp: 4,
      targetCadence: 172,
      measuredCadence: null,
    });
  });

  test('current-shape points pass through unchanged', () => {
    const current = {
      latitude: 1,
      longitude: 2,
      altitude: 0,
      timestamp: 4,
      targetCadence: 170,
      measuredCadence: 166,
    };
    expect(normalizeRoutePoint(current)).toEqual(current);
  });

  test('handles missing fields without throwing', () => {
    expect(normalizeRoutePoint(null)).toBeNull();
    expect(normalizeRoutePoint({ latitude: 1, longitude: 2, timestamp: 3 })).toEqual({
      latitude: 1,
      longitude: 2,
      altitude: 0,
      timestamp: 3,
      targetCadence: 0,
      measuredCadence: null,
    });
  });
});

describe('downsamplePoints (persistence cap)', () => {
  const series = (n) => Array.from({ length: n }, (_, i) => ({ timestamp: i }));

  test('series at or under the cap pass through untouched', () => {
    const points = series(2000);
    expect(downsamplePoints(points, 2000)).toBe(points);
    expect(downsamplePoints([], 2000)).toEqual([]);
    expect(downsamplePoints(undefined, 2000)).toEqual([]);
  });

  test('long series are capped and keep the first and last points', () => {
    const points = series(7201); // ~10 h of 5 s samples
    const out = downsamplePoints(points, 2000);
    expect(out.length).toBeLessThanOrEqual(2001); // cap (+ guaranteed last point)
    expect(out[0]).toBe(points[0]);
    expect(out[out.length - 1]).toBe(points[points.length - 1]);
    // Still ordered by time
    for (let i = 1; i < out.length; i++) {
      expect(out[i].timestamp).toBeGreaterThan(out[i - 1].timestamp);
    }
  });
});

test('default export is a singleton instance of RouteTracker', () => {
  expect(TrackerSingleton).toBeInstanceOf(RouteTracker);
});

// FORGE-009b: re-stamping measured cadence from history onto recorded points.
describe('reattachMeasured', () => {
  test('history lookup overwrites measured cadence; uncovered points keep theirs', () => {
    const tracker = new RouteTracker();
    tracker.start();
    tracker.updateCadence(172);
    tracker.updateMeasuredCadence(28); // locked-screen garbage
    tracker.addPoint(loc(0, 5000));
    tracker.addPoint(loc(1, 15000));
    tracker.addPoint(loc(2, 95000)); // outside the rebuilt series
    tracker.stop();

    const lookup = (t) => (t <= 20000 ? 114 : null);
    tracker.reattachMeasured(lookup);

    expect(tracker.points.map((p) => p.measuredCadence)).toEqual([114, 114, 28]);
    // Regenerated summary/averages use the corrected values.
    expect(tracker.getAverageMeasuredCadence()).toBe(85); // (114+114+28)/3
  });
});
