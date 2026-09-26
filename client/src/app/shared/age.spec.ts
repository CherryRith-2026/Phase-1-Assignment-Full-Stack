import { calculateAge } from './age';

describe('calculateAge', () => {
  it('accounts for the day before, on, and after a birthday', () => {
    expect(calculateAge('2000-09-27', new Date(2026, 8, 26))).toBe(25);
    expect(calculateAge('2000-09-27', new Date(2026, 8, 27))).toBe(26);
    expect(calculateAge('2000-09-27', new Date(2026, 8, 28))).toBe(26);
  });
  it('handles birthdays in earlier and later months', () => {
    expect(calculateAge('2000-01-01', new Date(2026, 8, 27))).toBe(26);
    expect(calculateAge('2000-12-31', new Date(2026, 8, 27))).toBe(25);
  });
  it('handles leap birthdays on March 1 in non-leap years', () => {
    expect(calculateAge('2000-02-29', new Date(2025, 1, 28))).toBe(24);
    expect(calculateAge('2000-02-29', new Date(2025, 2, 1))).toBe(25);
    expect(calculateAge('2000-02-29', new Date(2024, 1, 29))).toBe(24);
  });
  it('returns no age for missing, invalid or future DOBs', () => {
    for (const dob of [undefined, null, '', 'nonsense', '2001-02-29', '2000-13-01', '0000-01-01', '2026-09-28']) {
      expect(calculateAge(dob, new Date(2026, 8, 27))).toBeNull();
    }
  });
  it('displays zero for a baby born today', () => {
    expect(calculateAge('2026-09-27', new Date(2026, 8, 27))).toBe(0);
  });
});
