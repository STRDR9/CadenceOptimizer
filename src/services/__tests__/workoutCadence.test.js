// Regression tests (2026-10-10): fartlek / interval workouts were stuck at 150 spm.
// Field report (Andy + Bridget, build 30): preset fartlek, warm-up should be 138
// -> metronome showed/played 150 and never changed; voice said "continue at 150".
// Cause: a hard Math.max(150, ...) floor at fartlek generation AND at every
// phase start (whenever phase.terrainAdjustment was truthy - and terrainAware
// defaulted ON in the engine even though "Adjust beat on hills" is opt-in).

import { WorkoutEngine, CADENCE_MIN, CADENCE_MAX } from '../WorkoutEngine';

jest.mock('../../utils/storage', () => ({
  getRunnerProfile: jest.fn(async () => ({})),
}));

jest.mock('../TerrainDetector', () => ({
  __esModule: true,
  default: { currentTerrain: null },
}));

describe('fartlek generation keeps planned cadences (no 150 floor)', () => {
  const engine = new WorkoutEngine();
  const base = 148; // Andy's base on 10/9 -> warm-up 138

  afterEach(() => jest.restoreAllMocks());

  test.each(['beginner', 'intermediate', 'advanced', 'elite'])(
    '%s: warm-up is base-10 and every phase is inside the planned range',
    (difficulty) => {
      const w = engine.generateFartlekWorkout(
        { duration: 1800, difficulty, baseCadence: base, terrainAware: false, coachingEnabled: true },
        {},
      );
      expect(w.phases[0].cadence).toBe(138);
      for (const p of w.phases) {
        expect(p.cadence).toBeGreaterThanOrEqual(CADENCE_MIN);
        expect(p.cadence).toBeLessThanOrEqual(CADENCE_MAX);
      }
    },
  );

  test('a planned easy surge below 150 stays below 150', () => {
    // Force: shouldChange = true (0 < changeFrequency), cadenceChange = range min (-10 beginner)
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const w = engine.generateFartlekWorkout(
      { duration: 400, difficulty: 'beginner', baseCadence: base, terrainAware: false, coachingEnabled: false },
      {},
    );
    const nonWarmup = w.phases.filter((p) => p.intensity !== 'warmup' && p.intensity !== 'cooldown');
    expect(nonWarmup.length).toBeGreaterThan(0);
    expect(nonWarmup.some((p) => p.cadence === 138)).toBe(true);
    expect(w.phases.some((p) => p.cadence === 150 && p.intensity === 'warmup')).toBe(false);
  });
});

describe('hill adjustment is opt-in', () => {
  test('startFartlek without terrainAware builds phases with no terrain adjustment', async () => {
    const engine = new WorkoutEngine();
    const spy = jest.spyOn(engine, 'startWorkout').mockResolvedValue();
    await engine.startFartlek({ baseCadence: 148, difficulty: 'beginner', duration: 600 });
    const workout = spy.mock.calls[0][0];
    expect(workout.phases.every((p) => !p.terrainAdjustment)).toBe(true);
  });

  test('startInterval without terrainAware builds phases with no terrain adjustment', async () => {
    const engine = new WorkoutEngine();
    const spy = jest.spyOn(engine, 'startWorkout').mockResolvedValue();
    await engine.startInterval({ workDuration: 60, restDuration: 60, intervals: 2, workCadence: 175, restCadence: 140 });
    const workout = spy.mock.calls[0][0];
    expect(workout.phases.every((p) => !p.terrainAdjustment)).toBe(true);
  });
});

describe('phase start hands the planned cadence to the metronome', () => {
  let engine;
  beforeEach(() => {
    jest.useFakeTimers();
    engine = new WorkoutEngine();
  });
  afterEach(() => {
    if (engine.isActive) engine.stopWorkout();
    jest.useRealTimers();
  });

  test('a 138 warm-up reaches onCadenceChange as 138 (not 150)', async () => {
    const onCadenceChange = jest.fn();
    engine.setCallbacks({ onCadenceChange, onPhaseChange: jest.fn(), onCoachingCue: jest.fn(), onWorkoutComplete: jest.fn() });
    await engine.startWorkout({
      id: 'w', name: 'w', type: 'fartlek', duration: 20,
      phases: [
        { id: 0, cadence: 138, duration: 10, intensity: 'warmup', type: 'fartlek', coachingCues: [], terrainAdjustment: false },
        { id: 1, cadence: 156, duration: 10, intensity: 'hard', type: 'fartlek', coachingCues: [], terrainAdjustment: false },
      ],
    });
    expect(onCadenceChange.mock.calls[0][0]).toBe(138);
    jest.advanceTimersByTime(10500);
    expect(onCadenceChange.mock.calls.map((c) => c[0])).toContain(156);
  });

  test('even with terrain ON and flat ground, a sub-150 phase is not raised to 150', async () => {
    const onCadenceChange = jest.fn();
    engine.setCallbacks({ onCadenceChange, onPhaseChange: jest.fn(), onCoachingCue: jest.fn(), onWorkoutComplete: jest.fn() });
    await engine.startWorkout({
      id: 'w2', name: 'w2', type: 'interval', duration: 10,
      phases: [{ id: 0, cadence: 140, duration: 10, intensity: 'rest', type: 'interval', coachingCues: [], terrainAdjustment: true }],
    });
    expect(onCadenceChange.mock.calls[0][0]).toBe(140);
  });
});
