import { describe, expect, it } from 'vitest';
import { fieldLabel, plural } from './text';

describe('plural', () => {
  it('uses the singular only for 1', () => {
    expect(plural(1, 'row')).toBe('1 row');
    expect(plural(0, 'row')).toBe('0 rows');
    expect(plural(17, 'row')).toBe('17 rows');
  });
});

describe('fieldLabel', () => {
  it('splits column names into readable words', () => {
    expect(fieldLabel('StationCode')).toBe('Station code');
    expect(fieldLabel('UpdateIntervalMinutes')).toBe('Update interval minutes');
    expect(fieldLabel('FirstName')).toBe('First name');
  });
  it('uses friendlier names where splitting reads badly', () => {
    expect(fieldLabel('Elevation (FT)')).toBe('Elevation (feet)');
    expect(fieldLabel('IsActive')).toBe('Active');
    expect(fieldLabel('MesoWestLink')).toBe('MesoWest link');
  });
});
