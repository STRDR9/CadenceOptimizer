// FORGE-013: m:ss countdown formatting (Bridget: raw seconds read terribly).
import { formatCountdown, formatDistance, describePhase, formatHeight, formatWeight } from '../format';

describe('formatCountdown', () => {
  it('formats seconds as m:ss', () => {
    expect(formatCountdown(225)).toBe('3:45');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(600)).toBe('10:00');
  });
  it('rounds sub-second values (engine reports float seconds)', () => {
    expect(formatCountdown(224.6)).toBe('3:45');
    expect(formatCountdown(224.4)).toBe('3:44');
  });
  it('shows hours only past an hour', () => {
    expect(formatCountdown(3661)).toBe('1:01:01');
    expect(formatCountdown(3599)).toBe('59:59');
  });
  it('clamps negatives and garbage to 0:00', () => {
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatCountdown(NaN)).toBe('0:00');
    expect(formatCountdown(undefined)).toBe('0:00');
  });
});

describe('formatDistance', () => {
  it('miles with two decimals', () => {
    expect(formatDistance(1609.344, 'imperial')).toEqual({ value: '1.00', unit: 'mi' });
    expect(formatDistance(3765.865, 'imperial')).toEqual({ value: '2.34', unit: 'mi' });
  });
  it('kilometers', () => {
    expect(formatDistance(3770, 'metric')).toEqual({ value: '3.77', unit: 'km' });
  });
  it('clamps garbage to zero', () => {
    expect(formatDistance(undefined)).toEqual({ value: '0.00', unit: 'mi' });
    expect(formatDistance(-50, 'metric')).toEqual({ value: '0.00', unit: 'km' });
  });
});

describe('describePhase', () => {
  it('counts intervals, not phases', () => {
    const work = { type: 'interval', intensity: 'work', intervalNumber: 2, totalIntervals: 5 };
    expect(describePhase(work, 3, 11)).toEqual({ title: 'INTERVAL 2 OF 5', tag: 'WORK' });
    expect(describePhase({ ...work, intensity: 'rest' }, 4, 11)).toEqual({ title: 'INTERVAL 2 OF 5', tag: 'REST' });
  });
  it('warmup / cooldown named, no count', () => {
    expect(describePhase({ type: 'interval', intensity: 'warmup' }, 0, 11)).toEqual({ title: 'WARMUP', tag: 'EASY' });
    expect(describePhase({ type: 'interval', intensity: 'cooldown' }, 10, 11)).toEqual({ title: 'COOLDOWN', tag: 'EASY' });
  });
  it('fartlek counts surges, not warmup/cooldown', () => {
    // 12 phases = warmup + 10 surges + cooldown
    expect(describePhase({ type: 'fartlek', intensity: 'hard' }, 1, 12)).toEqual({ title: 'FARTLEK 1 OF 10', tag: 'HARD' });
    expect(describePhase({ type: 'fartlek', intensity: 'easy' }, 10, 12)).toEqual({ title: 'FARTLEK 10 OF 10', tag: 'EASY' });
    expect(describePhase({ type: 'fartlek', intensity: 'warmup' }, 0, 12)).toEqual({ title: 'WARMUP', tag: 'EASY' });
  });
});

describe('profile units (Home card)', () => {
  it('imperial height as feet/inches, weight in lb', () => {
    expect(formatHeight({ units: 'imperial', height: 177.8 })).toBe(`5'10\"`);
    expect(formatWeight({ units: 'imperial', weight: 72.6 })).toBe('160');
  });
  it('metric stays cm / kg', () => {
    expect(formatHeight({ units: 'metric', height: 177.8 })).toBe('178');
    expect(formatWeight({ units: 'metric', weight: 72.6 })).toBe('73');
  });
  it('missing values -> 0, never NaN', () => {
    expect(formatHeight(null)).toBe('0');
    expect(formatWeight({ units: 'imperial' })).toBe('0');
  });
});
