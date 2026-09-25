import { describe, it, expect } from 'vitest';
import {
  analyzeCareer,
  formatTenureLabel,
  formatYears,
  gapMonthsBetween,
  monthsSpanned,
  parsePeriodEnd,
  parsePeriodStart,
} from '@/lib/candidateTenure';

/** Sikandar Singh Dhanda — Hiring drawer acceptance fixture. */
const SIKANDAR_WORK = [
  { title: 'Systems Architect', company: 'TCS', start_date: '04/2022', end_date: '02/2025' },
  { title: 'Senior Project Engineer', company: 'WIPRO LTD.', start_date: '01/2018', end_date: '09/2020' },
  { title: 'Project Coordinator', company: 'SOFIA TECHNICAL UNIVERSITY', start_date: '08/2015', end_date: '07/2018' },
  { title: 'Trainee', company: 'HCL', start_date: '06/2013', end_date: '09/2013' },
  { title: 'Trainee', company: 'CEDTI (DOEACC)', start_date: '06/2011', end_date: '07/2011' },
];

const SIKANDAR_EDU = [
  { degree: 'BTECH', field: 'Electronics', institution: 'Engineering College', start_date: '2008', end_date: '2012' },
  { degree: 'MBA', field: 'HR & IT', institution: 'Business School', start_date: '2024', end_date: 'Present' },
];

const TARGET = { jobTitle: 'Systems Architect', jobDescription: 'Cloud, AWS, DevOps, enterprise architecture' };

function sikandar(now = new Date(2026, 8, 11)) {
  return analyzeCareer({
    workExperience: SIKANDAR_WORK,
    education: SIKANDAR_EDU,
    target: TARGET,
    gapThresholdMonths: 3,
    now,
  });
}

describe('period parsing', () => {
  it('parses MM/YYYY and YYYY-MM', () => {
    const a = parsePeriodStart('04/2022');
    const b = parsePeriodStart('2022-04');
    expect(a?.getFullYear()).toBe(2022);
    expect(a?.getMonth()).toBe(3);
    expect(b?.getMonth()).toBe(3);
  });

  it('treats period end as last day of month', () => {
    const end = parsePeriodEnd('02/2025');
    expect(end?.getFullYear()).toBe(2025);
    expect(end?.getMonth()).toBe(1);
    expect(end?.getDate()).toBe(28);
  });

  it('formats tenure for MM/YYYY rows', () => {
    expect(formatTenureLabel('04/2022', '02/2025')).toBe('2 yrs 10 mos');
    expect(formatTenureLabel('06/2013', '09/2013')).toBe('3 mos');
  });
});

describe('month arithmetic', () => {
  it('does not invent a gap when roles overlap', () => {
    const sofiaEnd = parsePeriodEnd('07/2018')!;
    const wiproStart = parsePeriodStart('01/2018')!;
    expect(wiproStart.getTime()).toBeLessThanOrEqual(sofiaEnd.getTime());
  });

  it('measures the Wipro → TCS hole as 1 year 7 months', () => {
    const wiproEnd = parsePeriodEnd('09/2020')!;
    const tcsStart = parsePeriodStart('04/2022')!;
    expect(gapMonthsBetween(wiproEnd, tcsStart)).toBe(19);
  });

  it('counts Wipro SPE as 32 months', () => {
    expect(monthsSpanned(parsePeriodStart('01/2018')!, parsePeriodEnd('09/2020')!)).toBe(32);
  });
});

describe('Sikandar career analysis', () => {
  it('excludes degree-period trainings from professional years', () => {
    const a = sikandar();
    const trainings = a.roles.filter((r) => r.kind === 'training');
    expect(trainings).toHaveLength(2);
    expect(trainings.every((r) => /CEDTI|HCL/.test(r.source.company ?? ''))).toBe(true);
    expect(a.excludedRoleLabels.some((l) => /CEDTI|HCL/.test(l))).toBe(true);
  });

  it('does not treat university project-coordinator as architect seniority', () => {
    const a = sikandar();
    const sofia = a.roles.find((r) => /sofia/i.test(r.source.company ?? ''));
    expect(sofia?.kind).toBe('professional');
    expect(sofia?.relevant).toBe(false);
    expect(sofia?.family).toBe('academic');
  });

  it('counts relevant experience as Wipro + TCS only (~5.5 years)', () => {
    const a = sikandar();
    expect(a.relevantYears).toBe(5.5);
    expect(a.relevantRoleLabels.some((l) => /Wipro|WIPRO/i.test(l))).toBe(true);
    expect(a.relevantRoleLabels.some((l) => /TCS/i.test(l))).toBe(true);
    expect(a.relevantRoleLabels.some((l) => /Coordinator/i.test(l))).toBe(false);
  });

  it('counts total professional time without double-counting the Sofia/Wipro overlap', () => {
    const a = sikandar();
    // Union Aug 2015–Sep 2020 (61m) + Apr 2022–Feb 2025 (34m) = 95m ≈ 7.9y
    expect(a.totalProfessionalYears).toBe(7.9);
    expect(a.totalProfessionalYears).toBeLessThan(11);
    expect(a.relevantYears).toBeLessThan(9);
  });

  it('inserts gaps between jobs, not where roles overlap', () => {
    const a = sikandar();
    expect(a.gaps).toHaveLength(3);
    const labels = a.gaps.map((g) => `${g.startLabel}→${g.endLabel}`);
    expect(labels).toContain('09/2020→04/2022');
    expect(labels).toContain('09/2013→08/2015');
    expect(labels).toContain('07/2011→06/2013');
    expect(a.gaps.find((g) => g.startLabel === '07/2018')).toBeUndefined();
  });

  it('builds a newest-first timeline with gap rows between the relevant jobs', () => {
    const a = sikandar();
    const kinds = a.timeline.map((item) => (item.kind === 'gap' ? `GAP:${item.gap.startLabel}` : item.role.source.company));
    expect(kinds[0]).toMatch(/TCS/);
    expect(kinds[1]).toBe('GAP:09/2020');
    expect(kinds[2]).toMatch(/WIPRO/i);
    expect(kinds).not.toContain('GAP:07/2018');
  });

  it('calls out MBA HR & IT as an education-track mismatch', () => {
    const a = sikandar();
    expect(a.educationRemarks.some((r) => /MBA/i.test(r.degreeLabel) && /HR/i.test(r.message))).toBe(true);
    expect(a.educationRemarks.some((r) => /BTECH/i.test(r.degreeLabel))).toBe(false);
  });

  it('bands coherence Mixed with evidence quotes, never a numeric score', () => {
    const a = sikandar();
    expect(a.coherence.band).toBe('Mixed');
    expect(a.coherence.evidence.some((e) => /Trainee/i.test(e))).toBe(true);
    expect(a.coherence.evidence.some((e) => /Coordinator/i.test(e))).toBe(true);
    expect(a.coherence.evidence.some((e) => /Architect/i.test(e))).toBe(true);
    expect(JSON.stringify(a.coherence)).not.toMatch(/lost/i);
    expect(a.summaryFacts).toContain('5.5');
    expect(a.summaryFacts).not.toMatch(/11 years/);
  });

  it('formats years without trailing .0', () => {
    expect(formatYears(5)).toBe('5');
    expect(formatYears(5.5)).toBe('5.5');
  });
});
