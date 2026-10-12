// Profile summary + "refresh" pre-fill (Andy 10/11). Pure — tested.
// Saved profiles are stored metric (cm / kg); the setup form edits in the
// runner's chosen units, so pre-filling converts back.

const BLANK_RACES = { '5k': '', '10k': '', half_marathon: '', marathon: '' };

/** Saved profile -> setup form state + units, so REFRESH PROFILE opens the
 *  six steps pre-filled with the runner's current answers. */
export function profileToForm(saved) {
  const units = saved?.units === 'imperial' ? 'imperial' : 'metric';
  const cm = Number(saved?.height) || 0;
  const kg = Number(saved?.weight) || 0;
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    units,
    form: {
      height: cm ? String(Math.round(units === 'imperial' ? cm / 2.54 : cm)) : '',
      weight: kg ? String(Math.round(units === 'imperial' ? kg / 0.453592 : kg)) : '',
      age: str(saved?.age),
      gender: saved?.gender || 'prefer_not_to_say',
      experience: saved?.experience || 'intermediate',
      yearsRunning: str(saved?.yearsRunning),
      weeklyMileage: str(saved?.weeklyMileage),
      typicalDistance: saved?.typicalDistance || '5k',
      recentRaceTimes: { ...BLANK_RACES, ...(saved?.recentRaceTimes || {}) },
      comfortablePace: str(saved?.comfortablePace),
      currentCadence: str(saved?.currentCadence),
      primaryGoals: Array.isArray(saved?.primaryGoals) ? saved.primaryGoals : [],
      targetRaces: Array.isArray(saved?.targetRaces) ? saved.targetRaces : [],
      preferredIntensity: saved?.preferredIntensity || 'moderate',
      injuryHistory: saved?.injuryHistory || 'none',
      footStrike: saved?.footStrike || 'midfoot',
      runningSurfaces: Array.isArray(saved?.runningSurfaces) ? saved.runningSurfaces : [],
      trainingDays: saved?.trainingDays || '3-4',
      longestRun: str(saved?.longestRun),
    },
  };
}

const DISTANCE_LABELS = { '5k': '5K', '10k': '10K', half_marathon: 'Half marathon', marathon: 'Marathon' };

export const humanize = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Rows for the profile summary card. Only answered fields appear. */
export function summaryRows(saved) {
  if (!saved) return [];
  const imperial = saved.units === 'imperial';
  const cm = Number(saved.height) || 0;
  const kg = Number(saved.weight) || 0;
  const totalIn = Math.round(cm / 2.54);
  const rows = [
    ['Experience', humanize(saved.experience)],
    ['Height', cm ? (imperial ? `${Math.floor(totalIn / 12)}'${totalIn % 12}"` : `${Math.round(cm)} cm`) : ''],
    ['Weight', kg ? (imperial ? `${Math.round(kg * 2.20462)} lb` : `${Math.round(kg)} kg`) : ''],
    ['Age', saved.age ? String(saved.age) : ''],
    ['Weekly mileage', saved.weeklyMileage ? `${saved.weeklyMileage} ${imperial ? 'mi' : 'km'}` : ''],
    ['Typical distance', DISTANCE_LABELS[saved.typicalDistance] || humanize(saved.typicalDistance)],
    ['Goals', (saved.primaryGoals || []).map(humanize).join(', ')],
    ['Training days', saved.trainingDays ? `${saved.trainingDays} per week` : ''],
  ];
  return rows.filter(([, v]) => v);
}
