import type { CandidateRedFlag } from '@/lib/applicantProfile';

/** Strip ordinals ("3rd" → "3") and parse common LWD / resume date strings. */
export function parseFlexibleDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

  // Prefer numeric forms first (avoid locale ambiguity of Date.parse)
  const dmy = normalized.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const my = normalized.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (my) {
    const d = new Date(Number(my[2]), Number(my[1]) - 1, 1);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const ym = normalized.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (ym) {
    const d = new Date(Number(ym[1]), Number(ym[2]) - 1, ym[3] ? Number(ym[3]) : 1);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const native = new Date(normalized);
  if (!Number.isNaN(native.getTime())) return native;

  return null;
}

/** Relative label for LWD: "today" | "in N days" | "N days ago". Null if unparseable. */
export function formatLwdRelative(lwd: string, now = new Date()): string | null {
  const lwdDate = parseFlexibleDate(lwd);
  if (!lwdDate) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  lwdDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((lwdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays > 0) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  const ago = Math.abs(diffDays);
  return `${ago} day${ago !== 1 ? 's' : ''} ago`;
}

function isCurrentEndDate(end?: string | null): boolean {
  if (end == null || !String(end).trim()) return true;
  return /^(present|current|now|till\s*date|to\s*date)$/i.test(String(end).trim());
}

/** End of month for period strings like 02/2025 or 2025-02; day precision when available. */
function parseWorkPeriodEnd(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed || isCurrentEndDate(trimmed)) return null;

  const ym = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ym) return new Date(Number(ym[1]), Number(ym[2]), 0);

  const my = trimmed.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (my) return new Date(Number(my[2]), Number(my[1]), 0);

  return parseFlexibleDate(trimmed);
}

/** Derive a FLAGS entry when the candidate appears unemployed now. */
export function buildCurrentlyNotWorkingFlag(
  workExperience: unknown[] | null | undefined,
  opts?: { noticePeriod?: string | null; lwd?: string | null },
  now = new Date(),
): CandidateRedFlag | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const exps = Array.isArray(workExperience) ? workExperience : [];
  const hasCurrentRole = exps.some((e) => {
    if (!e || typeof e !== 'object') return false;
    return isCurrentEndDate((e as { end_date?: string }).end_date);
  });

  const lwdDate = opts?.lwd ? parseFlexibleDate(opts.lwd) : null;
  if (lwdDate) {
    lwdDate.setHours(0, 0, 0, 0);
    if (lwdDate < today) {
      return {
        type: 'currently_not_working',
        message: 'Currently not working — last working day has passed',
        severity: 'medium',
      };
    }
  }

  if (hasCurrentRole) return null;

  let latestEnd: Date | null = null;
  for (const e of exps) {
    if (!e || typeof e !== 'object') continue;
    const end = (e as { end_date?: string }).end_date;
    if (!end || isCurrentEndDate(end)) continue;
    const parsed = parseWorkPeriodEnd(end);
    if (parsed && (!latestEnd || parsed > latestEnd)) latestEnd = parsed;
  }

  if (exps.length > 0 && latestEnd && latestEnd < today) {
    const months = (today.getFullYear() - latestEnd.getFullYear()) * 12
      + (today.getMonth() - latestEnd.getMonth());
    const ago = months <= 0
      ? 'recently'
      : months === 1
        ? '1 month ago'
        : `${months} months ago`;
    return {
      type: 'currently_not_working',
      message: `Currently not working — last role ended ${ago}`,
      severity: 'medium',
    };
  }

  const notice = opts?.noticePeriod?.trim() ?? '';
  if (/^immediate$/i.test(notice) && exps.length > 0 && !hasCurrentRole) {
    return {
      type: 'currently_not_working',
      message: 'Currently not working — notice period is Immediate',
      severity: 'medium',
    };
  }

  return null;
}
