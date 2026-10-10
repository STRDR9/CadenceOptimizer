import {
  buildSplitAnnouncement,
  formatPaceSpoken,
  isPlausibleCadence,
} from '../splitAnnouncement';

describe('formatPaceSpoken', () => {
  it('formats m:ss', () => {
    expect(formatPaceSpoken(512)).toBe('8:32');
    expect(formatPaceSpoken(480)).toBe('8:00');
  });
  it('rounds and rejects junk', () => {
    expect(formatPaceSpoken(511.6)).toBe('8:32');
    expect(formatPaceSpoken(0)).toBeNull();
    expect(formatPaceSpoken(undefined)).toBeNull();
  });
});

describe('isPlausibleCadence', () => {
  it('accepts running/walking band, rejects garbage', () => {
    expect(isPlausibleCadence(172)).toBe(true);
    expect(isPlausibleCadence(104)).toBe(true);
    expect(isPlausibleCadence(0)).toBe(false);
    expect(isPlausibleCadence(40)).toBe(false);
    expect(isPlausibleCadence(400)).toBe(false);
    expect(isPlausibleCadence(null)).toBe(false);
    expect(isPlausibleCadence(NaN)).toBe(false);
  });
});

describe('buildSplitAnnouncement', () => {
  const base = {
    splitNumber: 2,
    splitPace: 512,
    overallPace: 520,
    splitMeasuredCadence: 172.4,
    overallMeasuredCadence: 169.6,
  };

  it('full imperial announcement', () => {
    expect(buildSplitAnnouncement(base, 'imperial')).toBe(
      'Mile 2. 8:32 pace. Average pace 8:40. Cadence 172 this mile, 170 average.'
    );
  });

  it('metric wording', () => {
    expect(buildSplitAnnouncement(base, 'metric')).toBe(
      'Kilometer 2. 8:32 pace. Average pace 8:40. Cadence 172 this kilometer, 170 average.'
    );
  });

  it('split 1 does not repeat the average', () => {
    expect(buildSplitAnnouncement({ ...base, splitNumber: 1 }, 'imperial')).toBe(
      'Mile 1. 8:32 pace. Cadence 172.'
    );
  });

  it('drops cadence entirely when the sensor value is garbage', () => {
    expect(
      buildSplitAnnouncement(
        { ...base, splitMeasuredCadence: 12, overallMeasuredCadence: 12 },
        'imperial'
      )
    ).toBe('Mile 2. 8:32 pace. Average pace 8:40.');
  });

  it('says split cadence only when the average is unusable', () => {
    expect(
      buildSplitAnnouncement({ ...base, overallMeasuredCadence: null }, 'imperial')
    ).toBe('Mile 2. 8:32 pace. Average pace 8:40. Cadence 172.');
  });
});
