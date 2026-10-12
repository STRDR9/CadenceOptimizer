import { profileToForm, summaryRows, humanize } from '../profileForm';

const saved = {
  units: 'imperial',
  height: 177.8, // 70 in
  weight: 72.57, // 160 lb
  age: 31,
  gender: 'male',
  experience: 'intermediate',
  weeklyMileage: '25',
  typicalDistance: 'half_marathon',
  recentRaceTimes: { '5k': '22:30' },
  primaryGoals: ['improve_speed', 'injury_prevention'],
  trainingDays: '5-6',
};

describe('profileToForm (REFRESH PROFILE pre-fill)', () => {
  it('converts stored metric back to the runner units', () => {
    const { units, form } = profileToForm(saved);
    expect(units).toBe('imperial');
    expect(form.height).toBe('70'); // inches, as the form expects
    expect(form.weight).toBe('160');
    expect(form.age).toBe('31');
  });
  it('metric stays cm / kg', () => {
    const { units, form } = profileToForm({ ...saved, units: 'metric' });
    expect(units).toBe('metric');
    expect(form.height).toBe('178');
    expect(form.weight).toBe('73');
  });
  it('keeps answers and fills race-time gaps', () => {
    const { form } = profileToForm(saved);
    expect(form.recentRaceTimes).toEqual({ '5k': '22:30', '10k': '', half_marathon: '', marathon: '' });
    expect(form.primaryGoals).toEqual(['improve_speed', 'injury_prevention']);
    expect(form.typicalDistance).toBe('half_marathon');
  });
  it('safe on an empty / partial profile', () => {
    const { units, form } = profileToForm({});
    expect(units).toBe('metric');
    expect(form.height).toBe('');
    expect(form.primaryGoals).toEqual([]);
    expect(form.experience).toBe('intermediate');
  });
});

describe('summaryRows', () => {
  it('readable rows in the runner units, unanswered fields hidden', () => {
    expect(summaryRows(saved)).toEqual([
      ['Experience', 'Intermediate'],
      ['Height', `5'10"`],
      ['Weight', '160 lb'],
      ['Age', '31'],
      ['Weekly mileage', '25 mi'],
      ['Typical distance', 'Half marathon'],
      ['Goals', 'Improve speed, Injury prevention'],
      ['Training days', '5-6 per week'],
    ]);
  });
  it('no profile -> no rows', () => {
    expect(summaryRows(null)).toEqual([]);
  });
  it('humanize', () => {
    expect(humanize('injury_prevention')).toBe('Injury prevention');
    expect(humanize('')).toBe('');
  });
});
