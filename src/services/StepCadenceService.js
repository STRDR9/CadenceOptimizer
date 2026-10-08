// Step Cadence Service (FORGE-009)
// MEASURED cadence from the iPhone's step counter (expo-sensors Pedometer /
// CMPedometer) — the runner's actual steps-per-minute, as opposed to the
// metronome's TARGET cadence. Phone-only v1; Apple Watch is a later ticket.
//
// How it works: Pedometer.watchStepCount reports CUMULATIVE steps since the
// subscription started. We keep a short log of {t, steps} samples and derive
// cadence from the step delta over a rolling ~10 s window, recomputed every
// ~2 s. All decisions are made from the sample log (pure, unit-tested) so a
// delayed sensor callback can't corrupt the math.
//
// Graceful degradation is a hard requirement: permission denied, no hardware
// (simulator), or any sensor error → start() resolves false, getCurrent()
// reports { cadenceSpm: null, confidence: 'low' }, and the app carries on.

import { Pedometer } from 'expo-sensors';

export const CADENCE_WINDOW_MS = 10000; // rolling window the cadence is measured over
export const CADENCE_UPDATE_MS = 2000;  // how often a fresh value is computed
export const STALE_STEP_MS = 10000;     // no new steps for this long => stale sensor

/**
 * Pure: derive steps-per-minute from cumulative step samples.
 * @param {Array<{t: number, steps: number}>} samples - ascending t, steps
 *   cumulative since watching started.
 * @param {number} nowMs - current wall-clock ms.
 * @param {number} windowMs - rolling window size.
 * @returns {number|null} SPM (total steps, both feet — the app's unit), 0 when
 *   the runner has stopped stepping, or null while there is not yet enough
 *   data to measure (warmup / sensor unavailable).
 */
export function cadenceFromStepSamples(samples, nowMs, windowMs = CADENCE_WINDOW_MS) {
  if (!Array.isArray(samples) || samples.length < 2) return null;

  // Baseline: the latest sample at or before the window start, so the window
  // is fully covered once enough history exists; before that, the first sample.
  const windowStart = nowMs - windowMs;
  let baseline = samples[0];
  for (const s of samples) {
    if (s.t <= windowStart) baseline = s;
    else break;
  }

  const latest = samples[samples.length - 1];

  // Sensor quiet for a full window => the runner stopped (CMPedometer only
  // emits while steps happen). 0, not null: the sensor itself is fine.
  if (nowMs - latest.t > windowMs) return 0;

  // Rate over DATA-to-DATA span, not to `now`: emissions lag up to a couple
  // of seconds behind, and padding the span with that silence would
  // systematically under-read a steady cadence.
  const spanMs = latest.t - baseline.t;
  if (spanMs < windowMs * 0.5) return null; // warmup: not enough history yet

  const steps = latest.steps - baseline.steps;
  if (steps <= 0) return 0; // sensor alive, runner not stepping

  return Math.round(steps / (spanMs / 60000));
}

/**
 * Pure: summarize the per-tick {t, target, measured} samples a workout logged
 * into the analytics fields (FORGE-009 item 5).
 * - target_avg: mean target over all samples with a positive target.
 * - measured_avg: mean of POSITIVE measured values (actual stepping — pauses
 *   at 0 spm would drag a "how fast do they step" average into nonsense).
 * - adherence: % of samples with a measurement (0 included — standing still
 *   is off-rhythm) within ±2% of that sample's target.
 * All null when nothing was measured (no permission / simulator / no steps).
 */
export function summarizeCadenceSamples(samples) {
  const valid = (samples || []).filter(
    (s) => s && typeof s.target === 'number' && s.target > 0
  );
  const targetAvgCadence = valid.length
    ? Math.round(valid.reduce((a, s) => a + s.target, 0) / valid.length)
    : null;

  const measuredSamples = valid.filter((s) => typeof s.measured === 'number');
  const stepping = measuredSamples.filter((s) => s.measured > 0);
  if (stepping.length === 0) {
    return { targetAvgCadence, measuredAvgCadence: null, adherencePct: null };
  }

  const measuredAvgCadence = Math.round(
    stepping.reduce((a, s) => a + s.measured, 0) / stepping.length
  );
  const onTarget = measuredSamples.filter(
    (s) => Math.abs(s.measured - s.target) <= 0.02 * s.target
  ).length;
  const adherencePct = Math.round((onTarget / measuredSamples.length) * 100);

  return { targetAvgCadence, measuredAvgCadence, adherencePct };
}

export class StepCadenceService {
  constructor() {
    this._sub = null;
    this._timer = null;
    this._samples = [];          // [{ t, steps }] cumulative since start()
    this._lastStepIncreaseAt = null;
    this._movingHint = false;    // GPS-derived "the phone is moving" hint
    this._current = null;        // last computed SPM (null until measurable)
    this._running = false;
    this._onSample = null;
  }

  /**
   * Start measuring. Resolves true when the pedometer is available AND
   * permission is granted; false otherwise (the caller continues without
   * measured cadence — never throws).
   * @param {Function} [onSample] - called every CADENCE_UPDATE_MS with
   *   getCurrent()'s shape, for logging target-vs-measured samples.
   */
  async start(onSample = null) {
    if (this._running) return true;
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return false;
      const perm = await Pedometer.requestPermissionsAsync();
      if (perm?.status !== 'granted') return false;

      this._onSample = onSample;
      this._samples = [{ t: Date.now(), steps: 0 }];
      this._lastStepIncreaseAt = null;
      this._movingHint = false;
      this._current = null;
      this._sub = Pedometer.watchStepCount((result) =>
        this._onSteps(result?.steps ?? 0)
      );
      // Short interval, same backgrounding posture as WorkoutEngine's tick:
      // the metronome's audio session keeps the app alive during a run.
      this._timer = setInterval(() => this._recompute(), CADENCE_UPDATE_MS);
      this._running = true;
      return true;
    } catch (_error) {
      this.stop();
      return false;
    }
  }

  stop() {
    if (this._sub) {
      try {
        this._sub.remove();
      } catch (_error) {
        // subscription already dead — fine
      }
      this._sub = null;
    }
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    this._onSample = null;
    this._current = null;
    this._movingHint = false;
  }

  /** GPS-movement hint from the location pipeline (speed above ~walking). */
  reportMovement(isMoving) {
    this._movingHint = !!isMoving;
  }

  /**
   * @returns {{cadenceSpm: number|null, confidence: 'high'|'low', timestamp: number}}
   * confidence is 'low' when nothing is measurable yet, or when GPS says the
   * phone is moving but no steps have registered for >STALE_STEP_MS (phone in
   * a cupholder / sensor not picking up — the number shouldn't be trusted).
   */
  getCurrent() {
    const now = Date.now();
    if (!this._running) {
      return { cadenceSpm: null, confidence: 'low', timestamp: now };
    }
    const stepsStale =
      this._lastStepIncreaseAt == null ||
      now - this._lastStepIncreaseAt > STALE_STEP_MS;
    const low = this._current == null || (stepsStale && this._movingHint);
    return {
      cadenceSpm: this._current,
      confidence: low ? 'low' : 'high',
      timestamp: now,
    };
  }

  isRunning() {
    return this._running;
  }

  _onSteps(cumulativeSteps) {
    const t = Date.now();
    const last = this._samples[this._samples.length - 1];
    if (last && cumulativeSteps > last.steps) {
      this._lastStepIncreaseAt = t;
    }
    this._samples.push({ t, steps: cumulativeSteps });
    // Trim, always keeping one sample old enough to serve as the baseline.
    const cutoff = t - CADENCE_WINDOW_MS * 2;
    while (this._samples.length > 2 && this._samples[1].t <= cutoff) {
      this._samples.shift();
    }
  }

  _recompute() {
    this._current = cadenceFromStepSamples(this._samples, Date.now());
    if (this._onSample) {
      try {
        this._onSample(this.getCurrent());
      } catch (_error) {
        // sample consumers must never break measurement
      }
    }
  }
}

// Singleton instance
export default new StepCadenceService();
