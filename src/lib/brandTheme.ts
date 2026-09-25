export const DEFAULT_PRIMARY_COLOR = '#D64541';
export const DEFAULT_PRIMARY_FOREGROUND_COLOR = '#FFFFFF';

const BRAND_STYLE_ID = 'brand-theme-overrides';

/** Normalize #RGB / #RRGGBB to uppercase #RRGGBB. Returns null if invalid. */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('');
  }
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const n = normalized.slice(1);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

/** Tailwind/shadcn HSL token: "H S% L%" (no hsl() wrapper). */
export function hexToHslVar(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;

  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r1) h = ((g1 - b1) / delta) % 6;
    else if (max === g1) h = (b1 - r1) / delta + 2;
    else h = (r1 - g1) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Foreground on primary buttons: white or near-black from relative luminance. */
export function getPrimaryForegroundHsl(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const lum = relativeLuminance(r, g, b);
  return lum > 0.5 ? '0 0% 15%' : '0 0% 100%';
}

function parseHslToken(hslToken: string): { h: number; s: number; l: number } | null {
  const parts = hslToken.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!parts) return null;
  return { h: parseInt(parts[1], 10), s: parseInt(parts[2], 10), l: parseInt(parts[3], 10) };
}

function hslLuminance(h: number, s: number, l: number): number {
  const s1 = s / 100;
  const l1 = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => 255 * (l1 - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return relativeLuminance(f(0), f(8), f(4));
}

function contrastRatio(lumA: number, lumB: number): number {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Step the lightness of `hslToken` 1% at a time (darker when the counterpart is
 * lighter, lighter otherwise) until it reaches 4.5:1 against `againstHslToken`.
 */
export function deriveAccessibleHsl(hslToken: string, againstHslToken: string, minRatio = 4.5): string {
  const color = parseHslToken(hslToken);
  const against = parseHslToken(againstHslToken);
  if (!color || !against) return hslToken;

  const againstLum = hslLuminance(against.h, against.s, against.l);
  const step = againstLum > hslLuminance(color.h, color.s, color.l) ? -1 : 1;
  let l = color.l;
  while (l >= 0 && l <= 100 && contrastRatio(hslLuminance(color.h, color.s, l), againstLum) < minRatio) {
    l += step;
  }
  return `${color.h} ${color.s}% ${Math.max(0, Math.min(100, l))}%`;
}

function darkerHslToken(hslToken: string, lightnessDelta: number): string {
  const parts = hslToken.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!parts) return hslToken;
  const h = parts[1];
  const s = parts[2];
  const l = Math.max(0, Math.min(100, parseInt(parts[3], 10) - lightnessDelta));
  return `${h} ${s}% ${l}%`;
}

/** Inject brand CSS variables on :root and .dark (overrides index.css defaults). */
export function applyBrandTheme(
  hex: string | null | undefined,
  foregroundHex?: string | null,
): void {
  const color = normalizeHexColor(hex ?? '') ?? DEFAULT_PRIMARY_COLOR;
  const primary = hexToHslVar(color);
  const primaryDark = darkerHslToken(primary, 7);
  const explicitForeground = foregroundHex != null ? normalizeHexColor(foregroundHex) : null;
  const foreground = explicitForeground
    ? hexToHslVar(explicitForeground)
    : getPrimaryForegroundHsl(color);
  const primarySolid = deriveAccessibleHsl(primary, foreground);
  const primaryText = deriveAccessibleHsl(primary, '0 0% 100%');

  const css = `
:root, .dark {
  --primary: ${primary};
  --primary-foreground: ${foreground};
  --primary-solid: ${primarySolid};
  --primary-text: ${primaryText};
  --ring: ${primary};
  --sidebar-primary: ${primary};
  --sidebar-primary-foreground: ${foreground};
  --sidebar-ring: ${primary};
  --gradient-primary: linear-gradient(135deg, hsl(${primary}) 0%, hsl(${primaryDark}) 100%);
  --shadow-button: 0 2px 8px -2px hsl(${primary} / 0.4);
}
`.trim();

  let el = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = BRAND_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
