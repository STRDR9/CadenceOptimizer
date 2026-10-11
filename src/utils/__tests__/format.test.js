// FORGE-013: m:ss countdown formatting (Bridget: raw seconds read terribly).
import { formatCountdown } from '../format';

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
