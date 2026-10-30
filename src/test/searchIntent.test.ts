import { describe, expect, it } from 'vitest';
import {
  buildHiringSearchUrl,
  buildReportsUrl,
  enrichSearchIntent,
  isAnalyticsQuestionQuery,
  isNaturalLanguageQuery,
  parseAnalyticsQuestionHint,
  parseHiringFiltersFromSearch,
  parseSearchIntentHeuristic,
} from '@/lib/searchIntent';

describe('parseSearchIntentHeuristic', () => {
  it('splits person name from job title', () => {
    expect(parseSearchIntentHeuristic('Amit Verma Project Manager')).toEqual({
      name: 'Amit Verma',
      role: 'Project Manager',
    });
  });

  it('handles two-word name with single-word title', () => {
    expect(parseSearchIntentHeuristic('John Smith Engineer')).toEqual({
      name: 'John Smith',
      role: 'Engineer',
    });
  });

  it('leaves skill-only queries as textQuery', () => {
    expect(parseSearchIntentHeuristic('React developers')).toEqual({
      textQuery: 'React developers',
    });
  });

  it('does not split boolean queries', () => {
    expect(parseSearchIntentHeuristic('React AND Python NOT Java')).toEqual({
      textQuery: 'React AND Python NOT Java',
    });
  });

  it('does not split analytics questions into name/role', () => {
    expect(parseSearchIntentHeuristic("what's the performance of Prakash recruiter")).toEqual({
      textQuery: "what's the performance of Prakash recruiter",
    });
  });
});

describe('isAnalyticsQuestionQuery', () => {
  it('detects recruiter performance questions', () => {
    expect(isAnalyticsQuestionQuery("what's the performance of Prakash recruiter")).toBe(true);
  });

  it('does not flag candidate name+title searches', () => {
    expect(isAnalyticsQuestionQuery('Amit Verma Project Manager')).toBe(false);
  });
});

describe('parseAnalyticsQuestionHint', () => {
  it('extracts recruiter subject from performance question', () => {
    expect(parseAnalyticsQuestionHint("what's the performance of Prakash recruiter")).toEqual({
      kind: 'recruiter',
      subjectHint: 'Prakash',
      rawQuery: "what's the performance of Prakash recruiter",
    });
  });
});

describe('buildReportsUrl', () => {
  it('routes recruiter questions to recruiter tab with q filter', () => {
    const url = buildReportsUrl({
      kind: 'recruiter',
      subjectHint: 'Prakash',
      rawQuery: "what's the performance of Prakash recruiter",
    });
    expect(url).toBe('/reports?tab=recruiter&q=Prakash');
  });
});

describe('parseHiringFiltersFromSearch', () => {
  it('parses name and role from hiring URL', () => {
    const filters = parseHiringFiltersFromSearch('?view=list&name=Amit+Verma&role=Project+Manager');
    expect(filters.advanced.name).toBe('Amit Verma');
    expect(filters.advanced.role).toBe('Project Manager');
    expect(filters.hasAdvancedFilters).toBe(true);
  });
});

describe('buildHiringSearchUrl', () => {
  it('maps name and role to advanced filter params', () => {
    const url = buildHiringSearchUrl({
      name: 'Amit Verma',
      role: 'Project Manager',
    });
    expect(url).toBe('/hiring?view=list&name=Amit+Verma&role=Project+Manager');
  });
});

describe('enrichSearchIntent', () => {
  it('fills name/role from heuristic when Gemini only returned textQuery', () => {
    expect(
      enrichSearchIntent({ textQuery: 'Amit Verma Project Manager' }, 'Amit Verma Project Manager'),
    ).toEqual({
      name: 'Amit Verma',
      role: 'Project Manager',
    });
  });

  it('does not enrich analytics questions with name/role', () => {
    expect(
      enrichSearchIntent(
        { name: "what's the performance", role: 'of Prakash recruiter' },
        "what's the performance of Prakash recruiter",
      ),
    ).toEqual({
      textQuery: "what's the performance of Prakash recruiter",
    });
  });
});

describe('isNaturalLanguageQuery', () => {
  it('treats name+title queries as natural language', () => {
    expect(isNaturalLanguageQuery('Amit Verma Project Manager')).toBe(true);
  });

  it('excludes boolean queries', () => {
    expect(isNaturalLanguageQuery('React AND Python NOT Java')).toBe(false);
  });
});
