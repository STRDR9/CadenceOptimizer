// Cadence Model — SINGLE SOURCE OF TRUTH for cadence targets (F5).
//
// Before this module, base cadence was computed three different ways in three
// places (calculations.calculateOptimalCadence, CadenceAnalyzer.calculatePersonalizedTargets,
// WorkoutEngine.getBaseCadence) that produced three different numbers for the
// SAME runner — the Targets screen, the recommendations, and the actual
// metronome BPM could all disagree. Everything now derives from here so one
// profile yields one consistent set of numbers everywhere.
//
// All magnitudes below are the tunable knobs. Change them HERE and every
// consumer moves together.

// Neutral starting point before any personalization.
export const BASE_CADENCE = 170;

// Experience effect on base cadence (SPM). Unified onto CadenceAnalyzer's set
// (the "personalized targets" engine, standardized in F4). The old race-
// calculator used a milder {beginner:-5, intermediate:0, advanced:3, elite:5};
// if you want the gentler curve, edit these four numbers.
export const EXPERIENCE_ADJUSTMENT = {
  beginner: -8,
  intermediate: -2,
  advanced: 3,
  elite: 8,
};

// Effort-band offsets from the personalized base cadence.
export const BAND_OFFSETS = {
  easy: -5,
  moderate: 0,
  race: 5,
  interval: 10,
};

export function experienceAdjustment(experience) {
  return EXPERIENCE_ADJUSTMENT[experience] || 0;
}

// Shorter runners tend toward higher cadence. Guards missing height -> 0.
export function heightAdjustment(height) {
  if (!height) return 0;
  if (height < 160) return 3;
  if (height < 170) return 1;
  if (height < 180) return 0;
  if (height < 190) return -1;
  return -3;
}

// Natural cadence drifts down with age. Guards missing age -> 0.
export function ageAdjustment(age) {
  if (!age) return 0;
  if (age < 20) return 2;
  if (age < 30) return 0;
  if (age < 40) return -1;
  if (age < 50) return -2;
  if (age < 60) return -3;
  return -4;
}

// Minor BMI factor for joint load. Guards missing weight/height -> 0.
export function weightAdjustment(weight, height) {
  if (!weight || !height) return 0;
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (bmi < 18.5) return 1;
  if (bmi < 25) return 0;
  if (bmi < 30) return -1;
  return -2;
}

// Faster target pace -> higher cadence. Guards missing pace -> 0.
//
// Continuous (piecewise-linear) through the anchor points below. It used to be
// a 4-bucket step function, but F6 needs cadence to vary smoothly with pace so
// two distances at nearby-but-different paces (e.g. a 5K at 4:00 and a marathon
// at 4:59) don't collapse to the same "per-distance" cadence. Anchors keep the
// same magnitudes the step version produced mid-bucket, so F5 numbers barely
// move. These are tunable knobs.
const PACE_ANCHORS = [
  [3.5, 8],
  [4.5, 5],
  [5.5, 2],
  [6.5, 0],
  [7.5, -3],
];

export function paceAdjustment(paceMinKm) {
  if (!paceMinKm) return 0;
  const first = PACE_ANCHORS[0];
  const last = PACE_ANCHORS[PACE_ANCHORS.length - 1];
  if (paceMinKm <= first[0]) return first[1];
  if (paceMinKm >= last[0]) return last[1];
  for (let i = 0; i < PACE_ANCHORS.length - 1; i++) {
    const [p0, a0] = PACE_ANCHORS[i];
    const [p1, a1] = PACE_ANCHORS[i + 1];
    if (paceMinKm >= p0 && paceMinKm <= p1) {
      const t = (paceMinKm - p0) / (p1 - p0);
      return a0 + t * (a1 - a0);
    }
  }
  return 0;
}

/**
 * Personalized BASE cadence for a runner (pace-independent).
 * If the runner has measured their own comfortable cadence, trust that over
 * the formula (matches the old WorkoutEngine behavior, now applied everywhere).
 * @param {Object} profile - Runner profile ({ height, weight, age, experience, currentCadence })
 * @returns {number} Base cadence in SPM
 */
export function getBaseCadence(profile) {
  if (profile?.currentCadence) {
    const measured = parseInt(profile.currentCadence, 10);
    if (measured >= 150 && measured <= 200) return measured;
  }

  const cadence =
    BASE_CADENCE +
    heightAdjustment(profile?.height) +
    experienceAdjustment(profile?.experience) +
    ageAdjustment(profile?.age) +
    weightAdjustment(profile?.weight, profile?.height);

  return Math.round(cadence);
}

/**
 * Target cadence for a specific effort/pace (used by the race calculator).
 * @param {Object} profile - Runner profile
 * @param {Object} opts - { paceMinKm } target pace in min/km
 * @returns {number} Target cadence in SPM
 */
export function getTargetCadence(profile, { paceMinKm } = {}) {
  return Math.round(getBaseCadence(profile) + paceAdjustment(paceMinKm));
}

/**
 * Effort bands around the personalized base (easy < moderate < race < interval).
 * @param {Object} profile - Runner profile
 * @returns {Object} { baseCadence, easyPace, moderatePace, racePace, intervalPace }
 */
export function getCadenceBands(profile) {
  const base = getBaseCadence(profile);
  return {
    baseCadence: base,
    easyPace: base + BAND_OFFSETS.easy,
    moderatePace: base + BAND_OFFSETS.moderate,
    racePace: base + BAND_OFFSETS.race,
    intervalPace: base + BAND_OFFSETS.interval,
  };
}

// ---------------------------------------------------------------------------
// F6 — distance-aware cadence.
//
// The headline feature ("right SPM for your distance") needs cadence that
// actually varies with race distance. It does so through PACE: a 5K is run
// faster than a marathon, faster pace -> higher cadence (paceAdjustment above).
// So per distance we (1) find the runner's goal pace for that distance, then
// (2) feed it through getTargetCadence. Goal pace comes from any race time the
// runner entered, extrapolated to other distances with Riegel's endurance
// formula, so a single entered result personalizes ALL four distances.
// ---------------------------------------------------------------------------

// Canonical race distances in km. Keys match profile.recentRaceTimes storage.
export const DISTANCE_KM = {
  '5k': 5,
  '10k': 10,
  half_marathon: 21.0975,
  marathon: 42.195,
};

// Riegel endurance exponent: T2 = T1 * (D2 / D1)^1.06. Predicts race time at a
// new distance from a known one (the standard road-running fatigue factor).
const RIEGEL_EXPONENT = 1.06;

// Parse "H:MM:SS" / "MM:SS" / "M" into decimal minutes. Returns null if blank
// or malformed so callers can fall back instead of trusting a garbage number.
export function parseTimeToMin(timeStr) {
  if (timeStr == null) return null;
  const str = String(timeStr).trim();
  if (!str) return null;
  const parts = str.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  let minutes;
  if (parts.length === 3) minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
  else if (parts.length === 2) minutes = parts[0] + parts[1] / 60;
  else if (parts.length === 1) minutes = parts[0];
  else return null;
  return minutes > 0 ? minutes : null;
}

// Collect the runner's valid entered race results as { distanceKey: minutes }.
function knownRaceTimes(profile) {
  const out = {};
  const times = profile?.recentRaceTimes;
  if (!times) return out;
  for (const key of Object.keys(DISTANCE_KM)) {
    const min = parseTimeToMin(times[key]);
    if (min != null) out[key] = min;
  }
  return out;
}

/**
 * Predict the runner's goal pace (min/km) for a given race distance.
 * Priority: a directly-entered time for that distance -> Riegel extrapolation
 * from the nearest entered race -> comfortablePace -> null (no data).
 * @param {Object} profile
 * @param {string} distanceKey - '5k' | '10k' | 'half_marathon' | 'marathon'
 * @returns {{ paceMinKm: number, source: string } | null}
 */
export function predictPaceForDistance(profile, distanceKey) {
  const targetKm = DISTANCE_KM[distanceKey];
  if (!targetKm) return null;

  const known = knownRaceTimes(profile);

  // 1. Direct result for this exact distance.
  if (known[distanceKey] != null) {
    return { paceMinKm: known[distanceKey] / targetKm, source: 'race' };
  }

  // 2. Riegel-extrapolate from the nearest entered race (closest by distance).
  const entries = Object.keys(known);
  if (entries.length > 0) {
    let best = null;
    for (const key of entries) {
      const d = DISTANCE_KM[key];
      const ratio = Math.abs(Math.log(targetKm / d)); // closeness in log-distance
      if (!best || ratio < best.ratio) best = { key, ratio, km: d, min: known[key] };
    }
    const predictedMin = best.min * Math.pow(targetKm / best.km, RIEGEL_EXPONENT);
    return { paceMinKm: predictedMin / targetKm, source: 'estimate' };
  }

  // 3. Fall back to a stated comfortable pace (assumed min/km).
  const comfort = parseTimeToMin(profile?.comfortablePace);
  if (comfort != null) return { paceMinKm: comfort, source: 'comfortablePace' };

  return null;
}

/**
 * Target cadence for a specific race distance.
 * @param {Object} profile
 * @param {string} distanceKey
 * @param {Object} [opts] - { paceMinKm } to override the predicted pace
 * @returns {{ distanceKey, distanceKm, cadence, low, high, paceMinKm, source }}
 */
export function getCadenceForDistance(profile, distanceKey, opts = {}) {
  const distanceKm = DISTANCE_KM[distanceKey] || null;
  const predicted = opts.paceMinKm != null
    ? { paceMinKm: opts.paceMinKm, source: 'override' }
    : predictPaceForDistance(profile, distanceKey);

  const paceMinKm = predicted?.paceMinKm ?? null;
  // With no pace data at all, fall back to the pace-independent base cadence.
  const cadence = paceMinKm != null
    ? getTargetCadence(profile, { paceMinKm })
    : getBaseCadence(profile);

  return {
    distanceKey,
    distanceKm,
    cadence,
    low: cadence - 2,
    high: cadence + 2,
    paceMinKm,
    source: predicted?.source ?? 'base',
  };
}

/**
 * Full per-distance cadence table for the runner (5K/10K/half/marathon),
 * derived automatically from their profile. This is the headline F6 feature.
 * @param {Object} profile
 * @returns {Array} one getCadenceForDistance() result per distance, in order
 */
export function getDistanceCadenceTable(profile) {
  return Object.keys(DISTANCE_KM).map((key) => getCadenceForDistance(profile, key));
}
