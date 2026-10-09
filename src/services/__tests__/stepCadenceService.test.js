// Tests for StepCadenceService (FORGE-009): the rolling-window cadence math,
// the analytics summary (adherence %), and the service lifecycle against a
// mocked expo-sensors Pedometer — including the denied-permission and
// no-hardware (simulator) paths, which must degrade to null, never throw.

import StepCadenceServiceSingleton, {
  StepCadenceService,
  cadenceFromStepSamples,
  summarizeCadenceSamples,
  makeCadenceBuckets,
  seriesFromBucketSteps,
  measuredCadenceAt,
  mergeMeasuredIntoSamples,
  CADENCE_WINDOW_MS,
  CADENCE_UPDATE_MS,
  STALE_STEP_MS,
  SERIES_BUCKET_MS,
} from '../StepCadenceService';

jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    watchStepCount: jest.fn(),
  },
}));

const { Pedometer } = require('expo-sensors');

describe('cadenceFromStepSamples (pure)', () => {
  test('returns null with no or too few samples', () => {
    expect(cadenceFromStepSamples(undefined, 10000)).toBeNull();
    expect(cadenceFromStepSamples([], 10000)).toBeNull();
    expect(cadenceFromStepSamples([{ t: 0, steps: 0 }], 10000)).toBeNull();
  });

  test('returns null during warmup (less than half a window of history)', () => {
    const samples = [
      { t: 0, steps: 0 },
      { t: 2000, steps: 6 },
    ];
    // Only 4 s of history at now=4000 — below the 5 s warmup threshold.
    expect(cadenceFromStepSamples(samples, 4000)).toBeNull();
  });

  test('steady stepping yields the true SPM over a full window', () => {
    // ~2.87 steps/s = 172 SPM. Samples every 2 s for 20 s. Steps are
    // integers, so a 10 s window has ~6 SPM quantization — the tolerance
    // reflects the sensor's resolution, not slack in the math.
    const samples = [];
    for (let t = 0; t <= 20000; t += 2000) {
      samples.push({ t, steps: Math.round((t / 1000) * (172 / 60)) });
    }
    const spm = cadenceFromStepSamples(samples, 20000, CADENCE_WINDOW_MS);
    expect(spm).toBeGreaterThanOrEqual(166);
    expect(spm).toBeLessThanOrEqual(178);
  });

  test('cadence decays to 0 when the runner stops stepping', () => {
    const samples = [
      { t: 0, steps: 0 },
      { t: 2000, steps: 6 },
      { t: 4000, steps: 12 }, // last step update at 4 s
    ];
    // 20 s later, the window holds no step growth: stopped, not unmeasurable.
    expect(cadenceFromStepSamples(samples, 24000)).toBe(0);
  });
});

describe('summarizeCadenceSamples (pure)', () => {
  test('all null when nothing was measured (denied permission / simulator)', () => {
    expect(summarizeCadenceSamples([])).toEqual({
      targetAvgCadence: null,
      measuredAvgCadence: null,
      adherencePct: null,
    });
    const targetOnly = [
      { t: 0, target: 170, measured: null },
      { t: 2000, target: 170, measured: null },
    ];
    expect(summarizeCadenceSamples(targetOnly)).toEqual({
      targetAvgCadence: 170,
      measuredAvgCadence: null,
      adherencePct: null,
    });
  });

  test('adherence counts samples within ±2% of target', () => {
    const samples = [
      { t: 0, target: 170, measured: 170 },    // on target
      { t: 2000, target: 170, measured: 173 }, // +1.8% — on target
      { t: 4000, target: 170, measured: 180 }, // +5.9% — off
      { t: 6000, target: 170, measured: 160 }, // -5.9% — off
    ];
    const s = summarizeCadenceSamples(samples);
    expect(s.targetAvgCadence).toBe(170);
    expect(s.measuredAvgCadence).toBe(171); // (170+173+180+160)/4 = 170.75
    expect(s.adherencePct).toBe(50);
  });

  test('standing still (measured 0) counts against adherence but not the average', () => {
    const samples = [
      { t: 0, target: 170, measured: 170 },
      { t: 2000, target: 170, measured: 0 }, // stopped at a light
    ];
    const s = summarizeCadenceSamples(samples);
    expect(s.measuredAvgCadence).toBe(170); // average of actual stepping
    expect(s.adherencePct).toBe(50);        // but the stop is off-rhythm
  });
});

describe('StepCadenceService (mocked Pedometer)', () => {
  let service;
  let stepCallback;
  let removeMock;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new StepCadenceService();
    stepCallback = null;
    removeMock = jest.fn();
    Pedometer.isAvailableAsync.mockResolvedValue(true);
    Pedometer.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Pedometer.watchStepCount.mockImplementation((cb) => {
      stepCallback = cb;
      return { remove: removeMock };
    });
  });

  afterEach(() => {
    service.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('start() returns false when hardware is unavailable (simulator)', async () => {
    Pedometer.isAvailableAsync.mockResolvedValue(false);
    await expect(service.start()).resolves.toBe(false);
    expect(service.isRunning()).toBe(false);
    expect(service.getCurrent()).toMatchObject({ cadenceSpm: null, confidence: 'low' });
  });

  test('start() returns false when permission is denied', async () => {
    Pedometer.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await expect(service.start()).resolves.toBe(false);
    expect(service.isRunning()).toBe(false);
  });

  test('start() returns false (never throws) when the sensor API throws', async () => {
    Pedometer.isAvailableAsync.mockRejectedValue(new Error('sensor exploded'));
    await expect(service.start()).resolves.toBe(false);
  });

  test('steady steps produce a cadence and onSample fires each update tick', async () => {
    const onSample = jest.fn();
    await expect(service.start(onSample)).resolves.toBe(true);

    // 172 SPM for 20 s: cumulative steps reported every 2 s (emission first,
    // then the timer tick recomputes — matching the real callback order).
    for (let i = 1; i <= 10; i++) {
      stepCallback({ steps: Math.round((((i - 1) * 2000) / 1000) * (172 / 60)) });
      jest.advanceTimersByTime(CADENCE_UPDATE_MS);
    }

    const current = service.getCurrent();
    expect(current.cadenceSpm).toBeGreaterThanOrEqual(170);
    expect(current.cadenceSpm).toBeLessThanOrEqual(174);
    expect(current.confidence).toBe('high');
    expect(onSample).toHaveBeenCalledTimes(10);
    expect(onSample.mock.calls[9][0].cadenceSpm).toBe(current.cadenceSpm);
  });

  test('GPS movement without steps flags low confidence (phone not on body)', async () => {
    await service.start();

    // Phone moves per GPS, but the pedometer never registers a step.
    service.reportMovement(true);
    jest.advanceTimersByTime(STALE_STEP_MS + CADENCE_UPDATE_MS * 2);
    expect(service.getCurrent().confidence).toBe('low');
  });

  test('stop() removes the subscription and goes back to null cadence', async () => {
    await service.start();
    service.stop();
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(service.isRunning()).toBe(false);
    expect(service.getCurrent()).toMatchObject({ cadenceSpm: null, confidence: 'low' });
  });

  test('default export is a singleton instance of the service', () => {
    expect(StepCadenceServiceSingleton).toBeInstanceOf(StepCadenceService);
  });
});

// FORGE-009b: history-based measurement — the locked-screen fix.
describe('makeCadenceBuckets (pure)', () => {
  test('splits a run into full buckets plus a usable trailing partial', () => {
    const buckets = makeCadenceBuckets(0, 25000, 10000);
    expect(buckets).toEqual([
      { start: 0, end: 10000 },
      { start: 10000, end: 20000 },
      { start: 20000, end: 25000 }, // 5 s partial: kept
    ]);
  });

  test('drops a trailing partial too short to rate', () => {
    const buckets = makeCadenceBuckets(0, 21000, 10000);
    expect(buckets).toEqual([
      { start: 0, end: 10000 },
      { start: 10000, end: 20000 }, // 1 s tail dropped
    ]);
  });

  test('degenerate ranges produce no buckets', () => {
    expect(makeCadenceBuckets(5000, 5000)).toEqual([]);
    expect(makeCadenceBuckets(5000, 1000)).toEqual([]);
  });
});

describe('seriesFromBucketSteps + measuredCadenceAt (pure)', () => {
  const buckets = [
    { start: 0, end: 10000 },
    { start: 10000, end: 20000 },
    { start: 20000, end: 25000 },
  ];

  test('step counts become SPM per bucket; failed queries become null, zero steps 0', () => {
    const series = seriesFromBucketSteps(buckets, [19, undefined, 0]);
    expect(series).toEqual([
      { start: 0, end: 10000, cadenceSpm: 114 },       // 19 steps / 10 s
      { start: 10000, end: 20000, cadenceSpm: null },  // query failed
      { start: 20000, end: 25000, cadenceSpm: 0 },     // stood still (5 s partial)
    ]);
  });

  test('measuredCadenceAt finds the covering bucket, null outside or on failure', () => {
    const series = seriesFromBucketSteps(buckets, [19, undefined, 25]);
    expect(measuredCadenceAt(series, 5000)).toBe(114);
    expect(measuredCadenceAt(series, 10000)).toBe(114); // boundary belongs to earlier bucket
    expect(measuredCadenceAt(series, 15000)).toBeNull(); // failed bucket
    expect(measuredCadenceAt(series, 24000)).toBe(300);  // 25 steps / 5 s
    expect(measuredCadenceAt(series, 99999)).toBeNull(); // outside the run
  });
});

describe('mergeMeasuredIntoSamples (pure)', () => {
  test('history overwrites live values; uncovered samples keep theirs', () => {
    const series = seriesFromBucketSteps(
      [{ start: 0, end: 10000 }, { start: 10000, end: 20000 }],
      [19, undefined]
    );
    const live = [
      { t: 5000, target: 115, measured: 28 },    // locked-screen garbage -> 114
      { t: 15000, target: 115, measured: 112 },  // failed bucket -> keeps 112
      { t: 50000, target: 115, measured: null }, // outside series -> stays null
    ];
    expect(mergeMeasuredIntoSamples(live, series)).toEqual([
      { t: 5000, target: 115, measured: 114 },
      { t: 15000, target: 115, measured: 112 },
      { t: 50000, target: 115, measured: null },
    ]);
  });
});

describe('StepCadenceService history path (mocked Pedometer.getStepCountAsync)', () => {
  let service;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new StepCadenceService();
    Pedometer.isAvailableAsync.mockResolvedValue(true);
    Pedometer.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Pedometer.watchStepCount.mockImplementation(() => ({ remove: jest.fn() }));
  });

  afterEach(() => {
    service.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    delete Pedometer.getStepCountAsync;
  });

  test('live value comes from a history window query, surviving dead callbacks', async () => {
    // Simulate locked screen: watchStepCount NEVER fires, but history has steps.
    Pedometer.getStepCountAsync = jest.fn(async () => ({ steps: 29 })); // 29/10 s = 174
    await service.start();

    jest.advanceTimersByTime(CADENCE_UPDATE_MS);
    await Promise.resolve(); // flush the async history query
    await Promise.resolve();

    expect(Pedometer.getStepCountAsync).toHaveBeenCalled();
    expect(service.getCurrent().cadenceSpm).toBe(174);
    expect(service.getCurrent().confidence).toBe('high');
  });

  test('a failing history query falls back to live-sample math for the session', async () => {
    Pedometer.getStepCountAsync = jest.fn(async () => {
      throw new Error('CMPedometer not authorized');
    });
    await service.start();

    jest.advanceTimersByTime(CADENCE_UPDATE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getCurrent().cadenceSpm).toBeNull(); // warmup in fallback math

    jest.advanceTimersByTime(CADENCE_UPDATE_MS * 5);
    expect(Pedometer.getStepCountAsync).toHaveBeenCalledTimes(1); // broken => not retried
  });

  test('rebuildSeries queries each bucket and memoizes the result', async () => {
    const stepsPerBucket = [19, 19, 20, 0];
    Pedometer.getStepCountAsync = jest.fn(async (start) => {
      const i = Math.floor(start.getTime() / SERIES_BUCKET_MS);
      return { steps: stepsPerBucket[i] };
    });

    const series = await service.rebuildSeries(0, 40000);
    expect(series.map((b) => b.cadenceSpm)).toEqual([114, 114, 120, 0]);
    expect(Pedometer.getStepCountAsync).toHaveBeenCalledTimes(4);

    // Second call (workout_completed after workout_stopped) hits the memo.
    const again = await service.rebuildSeries(0, 41000);
    expect(again).toBe(series);
    expect(Pedometer.getStepCountAsync).toHaveBeenCalledTimes(4);
  });

  test('rebuildSeries returns null when history is unavailable or throws', async () => {
    expect(await service.rebuildSeries(0, 40000)).toBeNull(); // no API

    Pedometer.getStepCountAsync = jest.fn(async () => {
      throw new Error('denied');
    });
    expect(await service.rebuildSeries(0, 40000)).toBeNull();
  });
});
