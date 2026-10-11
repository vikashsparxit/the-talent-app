import type { Job } from '@/types/jobs';

export function getCareersJobUrl(jobId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/careers/${jobId}`;
}

export function buildJobReferralEmail(job: Pick<Job, 'title' | 'id'>): { subject: string; body: string } {
  const url = getCareersJobUrl(job.id);
  const subject = `Job opportunity: ${job.title}`;
  const body = [
    `Hi,`,
    ``,
    `I thought you might be interested in this open role:`,
    ``,
    `${job.title}`,
    url,
    ``,
    `Best,`,
  ].join('\n');

  return { subject, body };
}

export function buildMailtoReferralLink(job: Pick<Job, 'title' | 'id'>): string {
  const { subject, body } = buildJobReferralEmail(job);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyJobLink(jobId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(getCareersJobUrl(jobId));
    return true;
  } catch {
    return false;
  }
}

const REFERRAL_STORAGE_PREFIX = 'applicant_job_referrals';

export function getReferralShareCount(userId: string): number {
  try {
    const raw = localStorage.getItem(`${REFERRAL_STORAGE_PREFIX}:${userId}`);
    const count = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

export function incrementReferralShareCount(userId: string): void {
  try {
    const count = getReferralShareCount(userId);
    localStorage.setItem(`${REFERRAL_STORAGE_PREFIX}:${userId}`, String(count + 1));
  } catch {
    // localStorage unavailable
  }
}

export async function shareJob(
  job: Pick<Job, 'title' | 'id'>,
): Promise<'shared' | 'copied' | 'unsupported'> {
  const url = getCareersJobUrl(job.id);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: job.title,
        text: `Check out this job opening: ${job.title}`,
        url,
      });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'unsupported';
      }
    }
  }

  const copied = await copyJobLink(job.id);
  return copied ? 'copied' : 'unsupported';
}
