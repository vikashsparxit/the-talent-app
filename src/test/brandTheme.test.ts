import { describe, it, expect } from 'vitest';
import { normalizeHexColor, DEFAULT_PRIMARY_COLOR } from '@/lib/brandTheme';

describe('normalizeHexColor', () => {
  it('accepts 6-digit hex with or without hash', () => {
    expect(normalizeHexColor('#d64541')).toBe('#D64541');
    expect(normalizeHexColor('D64541')).toBe('#D64541');
    expect(normalizeHexColor('  #abc123  ')).toBe('#ABC123');
  });

  it('expands 3-digit shorthand', () => {
    expect(normalizeHexColor('#fff')).toBe('#FFFFFF');
    expect(normalizeHexColor('abc')).toBe('#AABBCC');
  });

  it('returns null for invalid input', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('not-a-color')).toBeNull();
    expect(normalizeHexColor('#gggggg')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
  });

  it('defaults match normalized SparxIT red', () => {
    expect(normalizeHexColor(DEFAULT_PRIMARY_COLOR)).toBe('#D64541');
  });
});
