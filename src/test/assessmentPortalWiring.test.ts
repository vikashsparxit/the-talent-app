import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The edge functions run on Deno and are not executed by vitest; these checks
// pin the wiring that the unit-tested helpers depend on.
const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const portal = read('supabase/functions/candidate-portal/index.ts');
const grader = read('supabase/functions/grade-assessment/index.ts');
const migration = read('supabase/migrations/20261011000003_assessment_portal_hardening.sql');

function caseBody(source: string, name: string): string {
  const start = source.indexOf(`case '${name}': {`);
  expect(start, `case ${name}`).toBeGreaterThan(-1);
  const next = source.indexOf("\n      case '", start + 10);
  const end = next === -1 ? source.indexOf('\n      default:', start) : next;
  return source.slice(start, end);
}

describe('candidate-portal wiring', () => {
  it('queues grading from the dashboard notify path as well as link submit (bug 1)', () => {
    expect(caseBody(portal, 'notify-staff-complete')).toContain('afterCompletion(');
    expect(caseBody(portal, 'submit')).toContain('afterCompletion(');
    expect(caseBody(portal, 'auto-complete')).toContain('afterCompletion(');
  });

  it('checks link expiry before any action (bug 2)', () => {
    const expiry = portal.indexOf('isTokenExpired(ca.token_expires_at');
    expect(expiry).toBeGreaterThan(-1);
    expect(expiry).toBeLessThan(portal.indexOf('switch (action)'));
  });

  it('auto-submits past the time limit before dispatching (bug 3)', () => {
    const autoSubmit = portal.indexOf("'auto_submit_time_limit'");
    expect(autoSubmit).toBeGreaterThan(-1);
    expect(autoSubmit).toBeLessThan(portal.indexOf('switch (action)'));
    expect(caseBody(portal, 'save-response')).toContain('gateAnswerWrite(');
    expect(caseBody(portal, 'create-file-upload')).toContain('gateAnswerWrite(');
  });

  it('validates auto-complete answers with the save-response rules (bug 4)', () => {
    expect(caseBody(portal, 'save-response')).toContain('sanitizeResponseForQuestion(');
    expect(caseBody(portal, 'auto-complete')).toContain('sanitizeResponseForQuestion(');
  });
});

describe('grade-assessment wiring (bug 1)', () => {
  it('claims the attempt before grading and records the outcome', () => {
    expect(grader).toContain('gradingClaimFilter(');
    expect(grader).toContain('grading_in_progress');
    expect(grader).toMatch(/grading_status: summary\.error \|\| summary\.failed > 0 \? "failed" : "graded"/);
  });
});

describe('assessment portal migration', () => {
  it('adds grading bookkeeping columns', () => {
    for (const col of ['grading_status', 'grading_requested_at', 'grading_started_at', 'graded_at', 'staff_notified_at']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it('sets token_expires_at on assignment and leaves NULL expiries alone (bug 2)', () => {
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF deadline ON public.candidate_assessments');
    expect(migration).toMatch(/AND token_expires_at IS NOT NULL\s+AND token_expires_at <= now\(\)/);
    expect(migration).toContain("'assessment_link_policy'");
  });

  it('blocks late writes on the dashboard path and sweeps overdue attempts (bug 3)', () => {
    expect(migration).toContain('assessment_time_limit_exceeded');
    expect(migration).toContain('NEW.started_at := now();');
    expect(migration).toContain("'assessment-time-limit-sweep'");
  });

  it('rejects dashboard saves after submit and foreign questions (bugs 4 and 5)', () => {
    expect(migration).toContain("RETURN 'assessment_already_submitted';");
    expect(migration).toContain("RETURN 'invalid_question_for_assessment';");
  });
});
