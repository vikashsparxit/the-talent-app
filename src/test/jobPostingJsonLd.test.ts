import { describe, it, expect } from 'vitest';
import { buildJobPostingJsonLd, employmentTypeForJob } from '@/lib/jobPostingJsonLd';

describe('JobPosting JSON-LD', () => {
  it('maps employment types', () => {
    expect(employmentTypeForJob('full_time')).toBe('FULL_TIME');
    expect(employmentTypeForJob('contract')).toBe('CONTRACTOR');
    expect(employmentTypeForJob('unknown')).toBe('OTHER');
  });

  it('includes required Google for Jobs fields and validThrough when set', () => {
    const json = buildJobPostingJsonLd({
      id: 'job-1',
      title: 'Senior Engineer',
      description: 'Build the ATS.',
      location: 'Noida',
      jobType: 'full_time',
      datePosted: '2026-09-01T00:00:00.000Z',
      validThrough: '2026-10-01T00:00:00.000Z',
      companyName: 'SparxIT',
      jobUrl: 'https://example.com/careers/job-1',
    });

    expect(json['@type']).toBe('JobPosting');
    expect(json.title).toBe('Senior Engineer');
    expect(json.datePosted).toBe('2026-09-01T00:00:00.000Z');
    expect(json.validThrough).toBe('2026-10-01T00:00:00.000Z');
    expect(json.employmentType).toBe('FULL_TIME');
    const org = json.hiringOrganization as { name: string };
    expect(org.name).toBe('SparxIT');
    const place = json.jobLocation as { address: { addressCountry: string; addressLocality: string } };
    expect(place.address.addressCountry).toBe('IN');
    expect(place.address.addressLocality).toBe('Noida');
  });

  it('omits validThrough when there is no close date', () => {
    const json = buildJobPostingJsonLd({
      id: 'job-2',
      title: 'Intern',
      companyName: 'Acme',
      jobUrl: 'https://example.com/careers/job-2',
    });
    expect(json.validThrough).toBeUndefined();
  });
});
