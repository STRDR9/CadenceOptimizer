// Post-run summary helpers (2026-10-09): 3x3 stat grid + units default + map markers.
import {
  defaultUnitsFromLocale,
  computeElevationGain,
  computeCadenceDrift,
  estimateSteps,
  pickCadenceMarkers,
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
