import { describe, it, expect } from 'vitest';
import { HttpError } from '../../supabase/functions/_shared/errors.ts';
import {
  buildOpenApi,
  DEFAULT_LIMIT,
  likePattern,
  parseListQuery,
  parseRoute,
  PUBLIC_JOB_COLUMNS,
  toPublicJob,
  type JobRow,
} from '../../supabase/functions/_shared/publicJobs.ts';

const ID = '3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b';

const row: JobRow = {
  id: ID,
  title: 'Senior React Developer',
  description: 'Build the hiring UI.',
  domain: 'Engineering',
  department: 'Frontend',
  location: 'Noida, India',
  job_type: 'full_time',
  experience_level: 'senior',
  experience_years_range: '5-8',
  required_skills: ['React', ' TypeScript ', '', 42],
  application_deadline: '2026-12-31',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
};

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof HttpError ? e.status : -1;
  }
  return undefined;
}

describe('parseRoute', () => {
  it('lists jobs at the function root, with or without the gateway prefix', () => {
    expect(parseRoute('/public-jobs')).toEqual({ kind: 'list' });
    expect(parseRoute('/functions/v1/public-jobs/')).toEqual({ kind: 'list' });
  });

  it('routes a UUID to a single job, normalised to lower case', () => {
    expect(parseRoute(`/public-jobs/${ID.toUpperCase()}`)).toEqual({ kind: 'job', id: ID });
  });

  it('serves the OpenAPI document', () => {
    expect(parseRoute('/functions/v1/public-jobs/openapi.json')).toEqual({ kind: 'openapi' });
  });

  it('rejects a malformed job id with 400 and deeper paths with not_found', () => {
    expect(statusOf(() => parseRoute('/public-jobs/123'))).toBe(400);
    expect(parseRoute(`/public-jobs/${ID}/apply`)).toEqual({ kind: 'not_found' });
  });
});

describe('parseListQuery', () => {
  it('applies defaults', () => {
    expect(parseListQuery(new URLSearchParams())).toMatchObject({ limit: DEFAULT_LIMIT, offset: 0 });
  });

  it('reads filters and normalises updated_since to ISO', () => {
    const q = parseListQuery(
      new URLSearchParams('limit=10&offset=20&department=Frontend&location=noida&employment_type=contract&experience_level=mid&updated_since=2026-10-01'),
    );
    expect(q).toEqual({
      limit: 10,
      offset: 20,
      department: 'Frontend',
      domain: undefined,
      location: 'noida',
      employmentType: 'contract',
      experienceLevel: 'mid',
      updatedSince: '2026-10-01T00:00:00.000Z',
    });
  });

  it('rejects out-of-range, non-numeric and unknown values with 400', () => {
    expect(statusOf(() => parseListQuery(new URLSearchParams('limit=0')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams('limit=101')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams('offset=-1')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams('limit=5abc')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams('employment_type=permanent')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams('updated_since=yesterday')))).toBe(400);
    expect(statusOf(() => parseListQuery(new URLSearchParams(`location=${'x'.repeat(101)}`)))).toBe(400);
  });

  it('ignores empty filters', () => {
    expect(parseListQuery(new URLSearchParams('department=&location=%20')).department).toBeUndefined();
  });
});

describe('likePattern', () => {
  it('wraps the value and escapes LIKE wildcards', () => {
    expect(likePattern('Noida')).toBe('%Noida%');
    expect(likePattern('100%_remote\\')).toBe('%100\\%\\_remote\\\\%');
  });
});

describe('toPublicJob', () => {
  it('maps the row to the public shape with careers links', () => {
    expect(toPublicJob(row, 'https://careers.example.com/')).toEqual({
      id: ID,
      title: 'Senior React Developer',
      description: 'Build the hiring UI.',
      domain: 'Engineering',
      department: 'Frontend',
      location: 'Noida, India',
      employment_type: 'full_time',
      experience_level: 'senior',
      experience_years: '5-8',
      skills: ['React', 'TypeScript'],
      application_deadline: '2026-12-31',
      posted_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
      url: `https://careers.example.com/careers/${ID}`,
      apply_url: `https://careers.example.com/careers/${ID}`,
    });
  });

  it('returns null links when no app URL is configured and copes with non-array skills', () => {
    const job = toPublicJob({ ...row, required_skills: null }, null);
    expect(job.url).toBeNull();
    expect(job.apply_url).toBeNull();
    expect(job.skills).toEqual([]);
  });

  it('never selects salary, openings, assessment or internal columns', () => {
    for (const column of ['salary', 'total_openings', 'positions_filled', 'assessment', 'status_note', 'created_by', 'benefits']) {
      expect(PUBLIC_JOB_COLUMNS).not.toContain(column);
    }
  });
});

describe('buildOpenApi', () => {
  it('points at the given server and documents both operations', () => {
    const spec = buildOpenApi('https://api.example.com/functions/v1/public-jobs') as {
      servers: { url: string }[];
      paths: Record<string, { get: { operationId: string } }>;
    };
    expect(spec.servers[0].url).toBe('https://api.example.com/functions/v1/public-jobs');
    expect(spec.paths['/'].get.operationId).toBe('listJobs');
    expect(spec.paths['/{id}'].get.operationId).toBe('getJob');
  });
});
