import { describe, it, expect } from 'vitest';
import {
  normalizeHexColor,
  DEFAULT_PRIMARY_COLOR,
  deriveAccessibleHsl,
  hexToHslVar,
  getPrimaryForegroundHsl,
} from '@/lib/brandTheme';

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

describe('deriveAccessibleHsl', () => {
  const white = '0 0% 100%';

  it('darkens the default brand just enough for white labels', () => {
    const primary = hexToHslVar(DEFAULT_PRIMARY_COLOR);
    expect(primary).toBe('2 65% 55%');
    expect(deriveAccessibleHsl(primary, white)).toBe('2 65% 53%');
  });

  it('keeps a very dark brand unchanged', () => {
    expect(deriveAccessibleHsl('220 60% 20%', white)).toBe('220 60% 20%');
  });

  it('lightens toward a dark foreground for a light yellow brand', () => {
    const primary = hexToHslVar('#FFE066');
    const foreground = getPrimaryForegroundHsl('#FFE066');
    expect(foreground).toBe('0 0% 15%');
    expect(deriveAccessibleHsl(primary, foreground)).toBe(primary);
  });

  it('darkens a light brand used as text on white', () => {
    const derived = deriveAccessibleHsl(hexToHslVar('#FFE066'), white);
    const l = parseInt(derived.split(' ')[2], 10);
    expect(l).toBeLessThan(40);
  });
});
