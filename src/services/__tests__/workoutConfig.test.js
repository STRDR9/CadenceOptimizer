// Andy 10/11 device test: "do the interval config buttons actually change the
// workout?" Locks the config -> phases contract so they can't silently drift.

import { WorkoutEngine } from '../WorkoutEngine';

jest.mock('../../utils/storage', () => ({
  getRunnerProfile: jest.fn(async () => ({})),
}));

jest.mock('../TerrainDetector', () => ({
  __esModule: true,
  default: { currentTerrain: null },
}));

const build = (overrides = {}) =>
  new WorkoutEngine().generateIntervalWorkout(
    {
      workDuration: 240,
      restDuration: 120,
      intervals: 4,
      workCadence: 185,
      restCadence: 160,
      warmupDuration: 300,
      cooldownDuration: 300,
      terrainAware: false,
      coachingEnabled: false,
      ...overrides,
    },
    {}
  );

describe('interval config drives the generated workout', () => {
  test('number of intervals = number of work phases (5 -> 5, not 4)', () => {
    const w = build({ intervals: 5 });
    expect(w.phases.filter((p) => p.intensity === 'work')).toHaveLength(5);
    expect(w.phases.filter((p) => p.intensity === 'rest')).toHaveLength(4);
    // warmup + 5 work + 4 rest + cooldown
    expect(w.phases).toHaveLength(11);
    w.phases
      .filter((p) => p.intensity === 'work')
      .forEach((p, i) => {
        expect(p.intervalNumber).toBe(i + 1);
        expect(p.totalIntervals).toBe(5);
      });
  });

  test('work / rest durations and cadences come straight from config', () => {
    const w = build({ workDuration: 180, restDuration: 90, workCadence: 175, restCadence: 160 });
    w.phases.filter((p) => p.intensity === 'work').forEach((p) => {
      expect(p.duration).toBe(180);
      expect(p.cadence).toBe(175);
    });
    w.phases.filter((p) => p.intensity === 'rest').forEach((p) => {
      expect(p.duration).toBe(90);
      expect(p.cadence).toBe(160);
    });
  });

  test('warmup and cooldown run at the rest cadence set (160 -> 160, not 155)', () => {
    const w = build({ restCadence: 160 });
    expect(w.phases[0]).toMatchObject({ intensity: 'warmup', cadence: 160 });
    expect(w.phases[w.phases.length - 1]).toMatchObject({ intensity: 'cooldown', cadence: 160 });
  });
});

describe('fartlek difficulty actually changes the workout', () => {
  const engine = new WorkoutEngine();
  const gen = (difficulty) =>
    engine.generateFartlekWorkout(
      { duration: 1800, difficulty, baseCadence: 160, terrainAware: false, coachingEnabled: false },
      {}
    );

  test('warmup length scales with difficulty', () => {
    const warm = (d) => gen(d).phases[0].duration;
    expect(warm('beginner')).toBe(300);
    expect(warm('intermediate')).toBe(240);
    expect(warm('advanced')).toBe(180);
    expect(warm('elite')).toBe(120);
  });

  test('cadence swing stays inside each difficulty band', () => {
    const bands = { beginner: [-10, 15], intermediate: [-15, 20], advanced: [-20, 25], elite: [-25, 30] };
    Object.entries(bands).forEach(([d, [lo, hi]]) => {
      for (let run = 0; run < 20; run++) {
        gen(d)
          .phases.filter((p) => p.intensity !== 'warmup' && p.intensity !== 'cooldown')
          .forEach((p) => {
            expect(p.cadence).toBeGreaterThanOrEqual(160 + lo);
            expect(p.cadence).toBeLessThanOrEqual(160 + hi);
          });
      }
    });
  });
});

describe('interval voice cues say the warmup / cooldown length', () => {
  const withVoice = (o = {}) => build({ coachingEnabled: true, ...o });

  test('warmup cue: real interval count + length + cadence', () => {
    const w = withVoice({ intervals: 5, restCadence: 160 });
    expect(w.phases[0].coachingCues[0].message).toBe(
      'Starting your interval workout. 5 intervals ahead. 5 minute warmup at 160 steps per minute.'
    );
  });

  test('never says "0 intervals ahead"; singular for 1', () => {
    const w = withVoice({ intervals: 1 });
    expect(w.phases[0].coachingCues[0].message).toContain('1 interval ahead.');
    expect(w.phases[0].coachingCues[0].message).not.toContain('0 intervals');
  });

  test('odd lengths read as m:ss; cooldown says its length too', () => {
    const w = withVoice({ warmupDuration: 270, cooldownDuration: 300, restCadence: 160 });
    expect(w.phases[0].coachingCues[0].message).toContain('4:30 warmup at 160');
    expect(w.phases[w.phases.length - 1].coachingCues[0].message).toBe(
      'Cooldown. 5 minutes easy at 160. Nice work.'
    );
  });
});
