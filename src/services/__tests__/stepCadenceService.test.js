// Tests for StepCadenceService (FORGE-009): the rolling-window cadence math,
// the analytics summary (adherence %), and the service lifecycle against a
// mocked expo-sensors Pedometer — including the denied-permission and
// no-hardware (simulator) paths, which must degrade to null, never throw.

import StepCadenceServiceSingleton, {
  StepCadenceService,
  cadenceFromStepSamples,
  summarizeCadenceSamples,
  CADENCE_WINDOW_MS,
  CADENCE_UPDATE_MS,
  STALE_STEP_MS,
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
