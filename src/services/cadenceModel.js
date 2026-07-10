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
export function paceAdjustment(paceMinKm) {
  if (!paceMinKm) return 0;
  if (paceMinKm < 4) return 8;
  if (paceMinKm < 5) return 5;
  if (paceMinKm < 6) return 2;
  if (paceMinKm > 7) return -3;
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
