export type ExpectedVsBand = 'below' | 'in_band' | 'above';

export interface SalaryMarketSource {
  title: string;
  url: string;
}

export interface SalaryMarketResult {
  min_lpa: number;
  max_lpa: number;
  sources: SalaryMarketSource[];
  expected_vs_band: ExpectedVsBand | null;
  cached: boolean;
  queried_at: string;
  role: string;
  relevant_years: number;
  location: string;
}

export interface SalaryMarketFailure {
  ok: false;
  reason: 'insufficient_sources' | 'tavily_unconfigured' | 'error';
  message: string;
  cached: boolean;
}

export type SalaryMarketResponse =
  | ({ ok: true } & SalaryMarketResult)
  | SalaryMarketFailure;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function parseCtcLakhs(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).replace(/[₹,\s]/g, '').replace(/lakh.*$/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function compareExpectedToBand(
  expectedLakhs: number | null,
  minLpa: number,
  maxLpa: number,
): ExpectedVsBand | null {
  if (expectedLakhs == null) return null;
  if (expectedLakhs < minLpa) return 'below';
  if (expectedLakhs > maxLpa) return 'above';
  return 'in_band';
}

export function expectedVsBandLabel(vs: ExpectedVsBand | null): string | null {
  if (vs === 'in_band') return 'Expected CTC is in this range';
  if (vs === 'above') return 'Expected CTC is above this range';
  if (vs === 'below') return 'Expected CTC is below this range';
  return null;
}

/** Chip-sized variant of `expectedVsBandLabel` for the drawer panel. */
export function expectedVsBandShortLabel(vs: ExpectedVsBand | null): string | null {
  if (vs === 'in_band') return 'Expected CTC in range';
  if (vs === 'above') return 'Expected CTC above range';
  if (vs === 'below') return 'Expected CTC below range';
  return null;
}

export function isSalaryCacheFresh(syncedAt: string | null | undefined, now = Date.now()): boolean {
  if (!syncedAt) return false;
  const t = Date.parse(syncedAt);
  if (Number.isNaN(t)) return false;
  return now - t < CACHE_TTL_MS;
}

export function buildSalaryCacheKey(input: {
  candidateId: string;
  jobId?: string | null;
}): string {
  const job = input.jobId ?? 'nojob';
  return `${input.candidateId}|${job}|v2`;
}
