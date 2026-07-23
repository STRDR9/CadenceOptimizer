// Tests for cadenceModel.js — the SINGLE SOURCE OF TRUTH for cadence math (F5/F6).
// This is the safety net: if any of these break, the Targets screen, the
// recommendations, and the metronome BPM can silently disagree for a runner.
import {
  BASE_CADENCE,
  experienceAdjustment,
  heightAdjustment,
  ageAdjustment,
  weightAdjustment,
  paceAdjustment,
  getBaseCadence,
  getTargetCadence,
  getCadenceBands,
  parseTimeToMin,
  predictPaceForDistance,
  getCadenceForDistance,
  getDistanceCadenceTable,
} from '../cadenceModel';

describe('parseTimeToMin', () => {
  test('parses MM:SS and H:MM:SS', () => {
    expect(parseTimeToMin('25:30')).toBeCloseTo(25.5);
    expect(parseTimeToMin('1:55:30')).toBeCloseTo(115.5);
    expect(parseTimeToMin('5')).toBe(5);
  });
  test('returns null for blank / null / malformed', () => {
    expect(parseTimeToMin(null)).toBeNull();
    expect(parseTimeToMin('')).toBeNull();
    expect(parseTimeToMin('abc')).toBeNull();
  });
  test('a unit-suffixed pace does NOT parse (the latent bug that motivated clean storage)', () => {
    expect(parseTimeToMin('6:00 /km')).toBeNull();
  });
  test('zero / negative is treated as no data', () => {
    expect(parseTimeToMin('0:00')).toBeNull();
  });
});

describe('per-factor adjustments', () => {
  test('experience maps to the unified curve, unknown -> 0', () => {
    expect(experienceAdjustment('beginner')).toBe(-8);
    expect(experienceAdjustment('intermediate')).toBe(-2);
    expect(experienceAdjustment('advanced')).toBe(3);
    expect(experienceAdjustment('elite')).toBe(8);
    expect(experienceAdjustment('moderate')).toBe(0); // not a real experience value
    expect(experienceAdjustment(undefined)).toBe(0);
  });
  test('height/age/weight guard missing inputs to 0', () => {
    expect(heightAdjustment(undefined)).toBe(0);
    expect(ageAdjustment(0)).toBe(0);
    expect(weightAdjustment(70, undefined)).toBe(0);
  });
  test('height bands', () => {
    expect(heightAdjustment(155)).toBe(3);
    expect(heightAdjustment(165)).toBe(1);
    expect(heightAdjustment(175)).toBe(0);
    expect(heightAdjustment(185)).toBe(-1);
    expect(heightAdjustment(195)).toBe(-3);
  });
  test('age bands', () => {
    expect(ageAdjustment(18)).toBe(2);
    expect(ageAdjustment(25)).toBe(0);
    expect(ageAdjustment(35)).toBe(-1);
    expect(ageAdjustment(45)).toBe(-2);
    expect(ageAdjustment(55)).toBe(-3);
    expect(ageAdjustment(65)).toBe(-4);
  });
  test('weight via BMI bands', () => {
    expect(weightAdjustment(50, 170)).toBe(1);   // BMI ~17.3 underweight
    expect(weightAdjustment(70, 175)).toBe(0);   // BMI ~22.9 normal
    expect(weightAdjustment(85, 175)).toBe(-1);  // BMI ~27.8 overweight
    expect(weightAdjustment(100, 175)).toBe(-2); // BMI ~32.7 obese
  });
});

describe('paceAdjustment (piecewise-linear)', () => {
  test('hits the anchor points exactly', () => {
    expect(paceAdjustment(3.5)).toBeCloseTo(8);
    expect(paceAdjustment(4.5)).toBeCloseTo(5);
    expect(paceAdjustment(5.5)).toBeCloseTo(2);
    expect(paceAdjustment(6.5)).toBeCloseTo(0);
    expect(paceAdjustment(7.5)).toBeCloseTo(-3);
  });
  test('interpolates between anchors (F6: nearby paces must differ)', () => {
    expect(paceAdjustment(4.0)).toBeCloseTo(6.5);
    expect(paceAdjustment(6.0)).toBeCloseTo(1);
  });
  test('clamps beyond the ends and guards missing pace', () => {
    expect(paceAdjustment(2.0)).toBeCloseTo(8);
    expect(paceAdjustment(9.0)).toBeCloseTo(-3);
    expect(paceAdjustment(0)).toBe(0);
  });
});

describe('getBaseCadence', () => {
  test('empty profile -> neutral base', () => {
    expect(getBaseCadence({})).toBe(BASE_CADENCE);
    expect(getBaseCadence({})).toBe(170);
  });
  test('combines all personalization factors', () => {
    // 170 + height(165)=1 + advanced=3 + age(25)=0 + weight(60,165 BMI~22)=0
    expect(getBaseCadence({ height: 165, experience: 'advanced', age: 25, weight: 60 })).toBe(174);
  });
  test('a measured currentCadence in range overrides the formula', () => {
    expect(getBaseCadence({ currentCadence: '180', experience: 'beginner' })).toBe(180);
  });
  test('an out-of-range currentCadence is ignored, formula used', () => {
    expect(getBaseCadence({ currentCadence: '140' })).toBe(170); // 140 < 150
    expect(getBaseCadence({ currentCadence: '220' })).toBe(170); // 220 > 200
  });
});

describe('getTargetCadence & getCadenceBands', () => {
  test('target = base + paceAdjustment', () => {
    expect(getTargetCadence({}, { paceMinKm: 4.5 })).toBe(175); // 170 + 5
  });
  test('bands are ordered easy < moderate < race < interval', () => {
    expect(getCadenceBands({})).toEqual({
      baseCadence: 170,
      easyPace: 165,
      moderatePace: 170,
      racePace: 175,
      intervalPace: 180,
    });
  });
});

describe('predictPaceForDistance', () => {
  test('direct entered result for the exact distance', () => {
    const p = predictPaceForDistance({ recentRaceTimes: { '5k': '25:00' } }, '5k');
    expect(p.source).toBe('race');
    expect(p.paceMinKm).toBeCloseTo(5.0); // 25min / 5km
  });
  test('Riegel-extrapolates to another distance from the nearest race', () => {
    const p = predictPaceForDistance({ recentRaceTimes: { '5k': '25:00' } }, '10k');
    expect(p.source).toBe('estimate');
    // 25 * (10/5)^1.06 / 10 ≈ 5.21 min/km
    expect(p.paceMinKm).toBeCloseTo(5.21, 1);
  });
  test('falls back to comfortablePace when no races entered', () => {
    const p = predictPaceForDistance({ comfortablePace: '5:30' }, 'marathon');
    expect(p.source).toBe('comfortablePace');
    expect(p.paceMinKm).toBeCloseTo(5.5);
  });
  test('null when there is no data at all, or an unknown distance', () => {
    expect(predictPaceForDistance({}, '5k')).toBeNull();
    expect(predictPaceForDistance({ recentRaceTimes: { '5k': '25:00' } }, 'nope')).toBeNull();
  });
});

describe('getCadenceForDistance & table', () => {
  test('no pace data -> pace-independent base cadence, source "base"', () => {
    const r = getCadenceForDistance({}, '5k');
    expect(r.cadence).toBe(170);
    expect(r.paceMinKm).toBeNull();
    expect(r.source).toBe('base');
    expect(r.low).toBe(168);
    expect(r.high).toBe(172);
  });
  test('explicit paceMinKm override', () => {
    const r = getCadenceForDistance({}, '10k', { paceMinKm: 4.5 });
    expect(r.source).toBe('override');
    expect(r.cadence).toBe(175); // 170 + 5
  });
  test('full table returns all four distances in canonical order', () => {
    const table = getDistanceCadenceTable({ recentRaceTimes: { '5k': '22:00' } });
    expect(table).toHaveLength(4);
    expect(table.map((t) => t.distanceKey)).toEqual(['5k', '10k', 'half_marathon', 'marathon']);
    // faster 5K should not produce a LOWER cadence than the marathon (pace effect)
    expect(table[0].cadence).toBeGreaterThanOrEqual(table[3].cadence);
  });
});
